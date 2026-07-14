import type { PlanetRole } from "../domain/composition/types";

const MAX_SAMPLE_BYTES = 12 * 1024 * 1024;
const MIN_SAMPLE_SECONDS = 0.04;

export interface PitchEstimate {
  frequency: number;
  rootMidi: number;
  confidence: number;
}

export interface InspectedUserSample {
  durationSeconds: number;
  pitch?: PitchEstimate;
}

export interface InspectUserSampleOptions {
  maxDurationSeconds: number;
  detectPitch?: boolean;
  role?: PlanetRole;
}

function midiForFrequency(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function formatMidiNote(midi: number): string {
  const names = [
    "C",
    "C♯",
    "D",
    "E♭",
    "E",
    "F",
    "F♯",
    "G",
    "A♭",
    "A",
    "B♭",
    "B",
  ];
  const safeMidi = Math.max(0, Math.min(127, Math.round(midi)));
  return `${names[safeMidi % 12]}${Math.floor(safeMidi / 12) - 1}`;
}

function loudestWindow(
  samples: Float32Array,
  windowSize: number,
): Float32Array {
  if (samples.length <= windowSize) return samples;
  const hop = Math.max(1, Math.floor(windowSize / 2));
  let bestStart = 0;
  let bestEnergy = -1;
  for (let start = 0; start + windowSize <= samples.length; start += hop) {
    let energy = 0;
    for (let index = start; index < start + windowSize; index += 1) {
      energy += samples[index] ** 2;
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestStart = start;
    }
  }
  return samples.subarray(bestStart, bestStart + windowSize);
}

/** Normalized autocorrelation intended for monophonic tonal sample imports. */
export function estimateSamplePitch(
  input: Float32Array,
  sampleRate: number,
  options: { minFrequency?: number; maxFrequency?: number } = {},
): PitchEstimate | undefined {
  if (input.length < 256 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return undefined;
  }
  const minFrequency = options.minFrequency ?? 40;
  const maxFrequency = options.maxFrequency ?? 1_400;
  const windowSize = Math.min(8_192, input.length);
  const source = loudestWindow(input, windowSize);
  const windowed = new Float32Array(source.length);
  let mean = 0;
  for (const sample of source) mean += sample;
  mean /= source.length;
  let rms = 0;
  for (let index = 0; index < source.length; index += 1) {
    const hann =
      0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (source.length - 1));
    const value = (source[index] - mean) * hann;
    windowed[index] = value;
    rms += value * value;
  }
  rms = Math.sqrt(rms / source.length);
  if (rms < 0.0005) return undefined;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(
    source.length - 3,
    Math.ceil(sampleRate / minFrequency),
  );
  if (minLag >= maxLag) return undefined;
  const correlations = new Float32Array(maxLag + 1);
  let bestCorrelation = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let cross = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    const count = windowed.length - lag;
    for (let index = 0; index < count; index += 1) {
      const left = windowed[index];
      const right = windowed[index + lag];
      cross += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    const correlation = denominator > 0 ? cross / denominator : 0;
    correlations[lag] = correlation;
    bestCorrelation = Math.max(bestCorrelation, correlation);
  }
  if (bestCorrelation < 0.28) return undefined;

  const strongThreshold = Math.max(0.28, bestCorrelation * 0.9);
  let bestLag = minLag;
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    if (
      correlations[lag] >= strongThreshold &&
      correlations[lag] >= correlations[lag - 1] &&
      correlations[lag] >= correlations[lag + 1]
    ) {
      bestLag = lag;
      break;
    }
  }
  if (correlations[bestLag] < strongThreshold) {
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (correlations[lag] > correlations[bestLag]) bestLag = lag;
    }
  }

  const left = correlations[bestLag - 1] ?? correlations[bestLag];
  const center = correlations[bestLag];
  const right = correlations[bestLag + 1] ?? center;
  const denominator = left - 2 * center + right;
  const adjustment =
    Math.abs(denominator) > 1e-6 ? (0.5 * (left - right)) / denominator : 0;
  const refinedLag = bestLag + Math.max(-0.5, Math.min(0.5, adjustment));
  const frequency = sampleRate / refinedLag;
  if (!Number.isFinite(frequency)) return undefined;

  return {
    frequency,
    rootMidi: Math.max(24, Math.min(96, midiForFrequency(frequency))),
    confidence: Math.max(0, Math.min(1, center)),
  };
}

function audioContextConstructor(): typeof AudioContext | undefined {
  return (
    globalThis.AudioContext ??
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext
  );
}

export async function inspectUserSample(
  file: File,
  options: InspectUserSampleOptions,
): Promise<InspectedUserSample> {
  if (file.size > MAX_SAMPLE_BYTES) {
    throw new Error("Choose an audio file smaller than 12 MB.");
  }
  const Context = audioContextConstructor();
  if (!Context) {
    throw new Error("This browser cannot analyse imported audio.");
  }
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (
      buffer.duration < MIN_SAMPLE_SECONDS ||
      buffer.duration > options.maxDurationSeconds
    ) {
      throw new Error(
        `Choose a sample between ${MIN_SAMPLE_SECONDS.toFixed(2)} and ${options.maxDurationSeconds} seconds.`,
      );
    }
    if (!options.detectPitch) return { durationSeconds: buffer.duration };

    const analysisLength = Math.min(
      buffer.length,
      Math.floor(buffer.sampleRate * 8),
    );
    const mono = new Float32Array(analysisLength);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < analysisLength; index += 1) {
        mono[index] += data[index] / buffer.numberOfChannels;
      }
    }
    const pitch = estimateSamplePitch(mono, buffer.sampleRate, {
      minFrequency: options.role === "bass" ? 32 : 55,
      maxFrequency: options.role === "bass" ? 520 : 1_400,
    });
    return { durationSeconds: buffer.duration, pitch };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("The selected audio file could not be decoded.", {
      cause: error,
    });
  } finally {
    await context.close();
  }
}
