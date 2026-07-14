#!/usr/bin/env node

/**
 * Offline-render the procedural patches that are too expensive to synthesize
 * repeatedly on mobile. Selected upper-register voices are rendered from their
 * legacy-dry patch, then baked through a deterministic stereo space reverb. The
 * output is compact and merged into the first-party manifest without touching
 * the separately authored masters or packaging the legacy-dry intermediates.
 *
 * Requires ffmpeg, ffprobe, and Xiph oggenc on PATH.
 */

import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_OUTPUT = join(REPOSITORY_ROOT, "public/audio/cosmic-samples");
const DEFAULT_RUNTIME_ASSETS = join(
  REPOSITORY_ROOT,
  "src/content/generatedProceduralSampleAssets.ts",
);

const SAMPLE_RATE = 48_000;
const VORBIS_QUALITY = 5;
const LEGACY_DRY_SYNTHESIS_VERSION = "1.0.0";
const SPATIAL_SYNTHESIS_VERSION = "2.0.0";
const TWO_PI = Math.PI * 2;
const MINIMUM_RENDER_RMS = 1e-5;
const MINIMUM_LEVEL_DB = -96;
const DURATION_TOLERANCE_SECONDS = 0.005;
const MAX_ENCODED_BYTES_PER_CHANNEL_SECOND = 64_000;
const ENCODED_CONTAINER_ALLOWANCE_BYTES = 8_192;
const SAFE_PROCEDURAL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SPACE_REVERB_ALGORITHM = "stereo-schroeder-space-v1";
const SPACE_REVERB_PROFILES = {
  tonal: {
    id: "tonal-space",
    preDelaySeconds: 0.024,
    tailSeconds: 1.65,
    roomSize: 0.8,
    damping: 0.38,
    dryGain: 0.96,
    wetGain: 0.7,
    inputGain: 0.34,
    releaseSeconds: 0.48,
  },
  "high-drum": {
    id: "high-drum-space",
    preDelaySeconds: 0.016,
    tailSeconds: 0.82,
    roomSize: 0.68,
    damping: 0.24,
    dryGain: 1,
    wetGain: 0.58,
    inputGain: 0.3,
    releaseSeconds: 0.16,
  },
};

function usage() {
  return `Usage: node scripts/render-procedural-samples.mjs [--output <dir>] [--runtime-assets <file>]

Renders deterministic procedural Ogg assets, merges them into an existing
authored manifest, and refreshes the generated TypeScript runtime inventory.`;
}

function parseArguments(argv) {
  let output = DEFAULT_OUTPUT;
  let runtimeAssets = DEFAULT_RUNTIME_ASSETS;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (argument === "--output" || argument === "--runtime-assets") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path.`);
      if (argument === "--output") output = resolve(value);
      else runtimeAssets = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }
  return { output, runtimeAssets };
}

const DRUM_VOICES = [
  "kick",
  "snare",
  "clap",
  "closed-hat",
  "open-hat",
  "rim",
  "perc",
];

const HIGH_DRUM_VOICES = new Set([
  "snare",
  "clap",
  "closed-hat",
  "open-hat",
  "rim",
]);

const DRUM_STYLES = {
  "soft-impact": {
    label: "Soft Impact",
    pitchScale: 0.9,
    decayScale: 1.18,
    noiseScale: 0.72,
    metallic: 0.08,
    drive: 0.78,
  },
  "small-dry": {
    label: "Small Dry",
    pitchScale: 1.22,
    decayScale: 0.58,
    noiseScale: 0.72,
    metallic: 0.12,
    drive: 0.9,
  },
  "metallic-array": {
    label: "Metallic Array",
    pitchScale: 1.08,
    decayScale: 0.9,
    noiseScale: 0.58,
    metallic: 0.82,
    drive: 1.04,
  },
  "heavy-void": {
    label: "Heavy Void",
    pitchScale: 0.68,
    decayScale: 1.48,
    noiseScale: 0.88,
    metallic: 0.28,
    drive: 1.08,
  },
};

const DRUM_METADATA = {
  kick: { category: "kick", attackSeconds: 0.0005, releaseSeconds: 0.018 },
  snare: { category: "snare", attackSeconds: 0.0005, releaseSeconds: 0.022 },
  clap: { category: "snare", attackSeconds: 0.0005, releaseSeconds: 0.028 },
  "closed-hat": {
    category: "hi-hat",
    attackSeconds: 0.001,
    releaseSeconds: 0.025,
  },
  "open-hat": {
    category: "hi-hat",
    attackSeconds: 0.001,
    releaseSeconds: 0.04,
  },
  rim: { category: "rimshot", attackSeconds: 0.0005, releaseSeconds: 0.018 },
  perc: { category: "tom", attackSeconds: 0.001, releaseSeconds: 0.035 },
};

const TONAL_DEFINITIONS = [
  {
    id: "warm-pad-space-c4",
    name: "Warm Pad Space C4",
    legacyDryId: "warm-pad-c4",
    legacyDryName: "Legacy Dry Warm Pad C4",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "synth",
    durationSeconds: 2.6,
    channels: 2,
    attackSeconds: 0.012,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "soft-keys-space-c4",
    name: "Soft Keys Space C4",
    legacyDryId: "soft-keys-c4",
    legacyDryName: "Legacy Dry Soft Keys C4",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "synth",
    durationSeconds: 1.55,
    channels: 2,
    attackSeconds: 0.004,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "glass-chords-space-c4",
    name: "Glass Chords Space C4",
    legacyDryId: "glass-chords-c4",
    legacyDryName: "Legacy Dry Glass Chords C4",
    legacyDrySynthesisVersion: "1.1.0",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "synth",
    durationSeconds: 1.9,
    channels: 2,
    attackSeconds: 0.003,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "pulsing-synth-space-c4",
    name: "Pulsing Synth Space C4",
    legacyDryId: "pulsing-synth-c4",
    legacyDryName: "Legacy Dry Pulsing Synth C4",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "synth",
    durationSeconds: 1.35,
    channels: 2,
    attackSeconds: 0.004,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "dust-texture-space-c4",
    name: "Dust Texture Space C4",
    legacyDryId: "dust-texture-c4",
    legacyDryName: "Legacy Dry Dust Texture C4",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "other",
    durationSeconds: 1.45,
    channels: 2,
    attackSeconds: 0.008,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "radio-texture-space-c4",
    name: "Radio Texture Space C4",
    legacyDryId: "radio-texture-c4",
    legacyDryName: "Legacy Dry Radio Texture C4",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "other",
    durationSeconds: 1.75,
    channels: 2,
    attackSeconds: 0.006,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "nebula-texture-space-c4",
    name: "Nebula Texture Space C4",
    legacyDryId: "nebula-texture-c4",
    legacyDryName: "Legacy Dry Nebula Texture C4",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "other",
    durationSeconds: 2.55,
    channels: 2,
    attackSeconds: 0.014,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "mechanical-texture-space-c4",
    name: "Mechanical Texture Space C4",
    legacyDryId: "mechanical-texture-c4",
    legacyDryName: "Legacy Dry Mechanical Texture C4",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES.tonal,
    rootMidi: 60,
    category: "other",
    durationSeconds: 1.15,
    channels: 2,
    attackSeconds: 0.003,
    releaseSeconds: SPACE_REVERB_PROFILES.tonal.releaseSeconds,
  },
  {
    id: "void-drone-c2",
    name: "Void Drone C2",
    rootMidi: 36,
    category: "bass",
    durationSeconds: 2.85,
    channels: 2,
    attackSeconds: 0.015,
    releaseSeconds: 0.1,
  },
];

const AUXILIARY_DEFINITIONS = [
  {
    id: "orbital-ring-hat-space",
    name: "Orbital Ring Hat Space",
    legacyDryId: "orbital-ring-hat",
    legacyDryName: "Legacy Dry Orbital Ring Hat",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES["high-drum"],
    category: "hi-hat",
    durationSeconds: 0.19,
    channels: 2,
    attackSeconds: 0.001,
    releaseSeconds: SPACE_REVERB_PROFILES["high-drum"].releaseSeconds,
  },
  {
    id: "orbital-ring-shaker-space",
    name: "Orbital Ring Shaker Space",
    legacyDryId: "orbital-ring-shaker",
    legacyDryName: "Legacy Dry Orbital Ring Shaker",
    synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
    spaceReverbProfile: SPACE_REVERB_PROFILES["high-drum"],
    category: "hi-hat",
    durationSeconds: 0.36,
    channels: 2,
    attackSeconds: 0.001,
    releaseSeconds: SPACE_REVERB_PROFILES["high-drum"].releaseSeconds,
  },
  {
    id: "orbital-ring-perc",
    name: "Orbital Ring Percussion",
    category: "tom",
    durationSeconds: 0.48,
    channels: 1,
    attackSeconds: 0.001,
    releaseSeconds: 0.04,
  },
  {
    id: "asteroid-dust-perc",
    name: "Asteroid Dust Percussion",
    category: "other",
    durationSeconds: 0.62,
    channels: 1,
    attackSeconds: 0.001,
    releaseSeconds: 0.05,
  },
];

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${arguments_.join(" ")} failed${detail ? `:\n${detail}` : "."}`,
    );
  }
  return result;
}

function assertToolsAvailable() {
  run("ffmpeg", ["-version"], { stdio: "ignore" });
  run("ffprobe", ["-version"], { stdio: "ignore" });
  run("oggenc", ["--version"], { stdio: "ignore" });
}

function hashSeed(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function smoothstep(value) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function fadeEnvelope(time, duration, attack, release) {
  return (
    smoothstep(time / Math.max(attack, 1 / SAMPLE_RATE)) *
    smoothstep((duration - time) / Math.max(release, 1 / SAMPLE_RATE))
  );
}

function harmonicWave(frequency, time, harmonics, phase = 0) {
  let value = 0;
  let weight = 0;
  for (const [multiple, amplitude] of harmonics) {
    value += Math.sin(TWO_PI * frequency * multiple * time + phase) * amplitude;
    weight += Math.abs(amplitude);
  }
  return weight === 0 ? 0 : value / weight;
}

function softLimit(value, amount = 1) {
  return Math.tanh(value * amount) * 0.78;
}

function drumDuration(voice, style) {
  const base = {
    kick: 0.52,
    snare: 0.38,
    clap: 0.42,
    "closed-hat": 0.16,
    "open-hat": 0.56,
    rim: 0.22,
    perc: 0.48,
  }[voice];
  return Math.max(0.12, Math.min(0.92, base * style.decayScale));
}

function renderLegacyDryDrum(styleId, voice) {
  const style = DRUM_STYLES[styleId];
  const duration = drumDuration(voice, style);
  const frames = Math.ceil(duration * SAMPLE_RATE);
  const channel = new Float32Array(frames);
  const random = createRandom(
    `${styleId}/${voice}/${LEGACY_DRY_SYNTHESIS_VERSION}`,
  );
  let phase = 0;
  let lowNoise = 0;
  let fastNoise = 0;
  const voiceGain = {
    kick: 1,
    snare: 1.22,
    clap: 1.9,
    "closed-hat": 1.55,
    "open-hat": 1.55,
    rim: 1.18,
    perc: 1.14,
  }[voice];
  const styleGain =
    styleId === "soft-impact" ? 1.14 : styleId === "small-dry" ? 1.08 : 1;

  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const rawNoise = random() * 2 - 1;
    lowNoise += 0.035 * (rawNoise - lowNoise);
    fastNoise += 0.42 * (rawNoise - fastNoise);
    const highNoise = rawNoise - fastNoise;
    let value;

    if (voice === "kick") {
      const frequency = (44 + 112 * Math.exp(-time / 0.028)) * style.pitchScale;
      phase += (TWO_PI * frequency) / SAMPLE_RATE;
      const body =
        Math.sin(phase) *
        Math.exp(-time / (0.18 * style.decayScale)) *
        smoothstep(time / 0.002);
      const click = highNoise * Math.exp(-time / 0.006) * style.noiseScale;
      const voidTail =
        styleId === "heavy-void"
          ? Math.sin(phase * 0.5) * Math.exp(-time / 0.38) * 0.26
          : 0;
      value = body * 1.18 + click * 0.18 + voidTail;
    } else if (voice === "snare") {
      const envelope = Math.exp(-time / (0.11 * style.decayScale));
      const tone =
        Math.sin(TWO_PI * 184 * style.pitchScale * time) *
        Math.exp(-time / 0.075);
      const metal =
        Math.sin(TWO_PI * 1_310 * style.pitchScale * time) *
        Math.exp(-time / 0.085) *
        style.metallic;
      value =
        (highNoise * 0.78 * style.noiseScale + tone * 0.34 + metal * 0.3) *
        envelope;
    } else if (voice === "clap") {
      const burst = [0, 0.022, 0.047].reduce(
        (sum, center) => sum + Math.exp(-(((time - center) / 0.007) ** 2)),
        0,
      );
      const tail = time > 0.045 ? Math.exp(-(time - 0.045) / 0.09) : 0;
      value =
        highNoise *
        (burst * 0.42 + tail * 0.34) *
        style.noiseScale *
        (1 + style.metallic * 0.18);
    } else if (voice === "closed-hat" || voice === "open-hat") {
      const decay = voice === "closed-hat" ? 0.045 : 0.22 * style.decayScale;
      const envelope = Math.exp(-time / decay);
      const metal =
        (Math.sin(TWO_PI * 5_437 * time) +
          Math.sin(TWO_PI * 7_921 * time) +
          Math.sin(TWO_PI * 9_977 * time)) /
        3;
      value =
        (highNoise * 0.74 * style.noiseScale +
          metal * (0.12 + style.metallic * 0.42)) *
        envelope;
    } else if (voice === "rim") {
      const click = Math.exp(-time / 0.009);
      const wood =
        Math.sin(TWO_PI * 742 * style.pitchScale * time) * 0.64 +
        Math.sin(TWO_PI * 1_443 * style.pitchScale * time) * 0.32;
      const metal = Math.sin(TWO_PI * 3_307 * time) * style.metallic * 0.34;
      value = (wood + metal + highNoise * 0.18) * click;
    } else {
      const frequency =
        (112 + 156 * Math.exp(-time / 0.055)) * style.pitchScale;
      phase += (TWO_PI * frequency) / SAMPLE_RATE;
      const envelope = Math.exp(-time / (0.17 * style.decayScale));
      const fm = Math.sin(
        phase + Math.sin(phase * 1.71) * style.metallic * 2.8,
      );
      value = (fm * 0.82 + lowNoise * 0.22 * style.noiseScale) * envelope;
    }

    const endFade = smoothstep((duration - time) / 0.012);
    channel[frame] =
      softLimit(value * style.drive * voiceGain * styleGain, 1.05) * endFade;
  }

  return { channels: [channel], durationSeconds: duration };
}

function renderLegacyDryStereoDefinition(definition) {
  const frames = Math.ceil(definition.durationSeconds * SAMPLE_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const legacyDryId = definition.legacyDryId ?? definition.id;
  const synthesisVersion =
    definition.legacyDrySynthesisVersion ?? LEGACY_DRY_SYNTHESIS_VERSION;
  const randomLeft = createRandom(`${legacyDryId}/left/${synthesisVersion}`);
  const randomRight = createRandom(`${legacyDryId}/right/${synthesisVersion}`);
  const frequency = 440 * 2 ** ((definition.rootMidi - 69) / 12);
  let lowLeft = 0;
  let lowRight = 0;
  let fastLeft = 0;
  let fastRight = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const duration = definition.durationSeconds;
    const noiseLeft = randomLeft() * 2 - 1;
    const noiseRight = randomRight() * 2 - 1;
    lowLeft += 0.018 * (noiseLeft - lowLeft);
    lowRight += 0.018 * (noiseRight - lowRight);
    fastLeft += 0.31 * (noiseLeft - fastLeft);
    fastRight += 0.31 * (noiseRight - fastRight);
    const highLeft = noiseLeft - fastLeft;
    const highRight = noiseRight - fastRight;
    let leftValue;
    let rightValue;

    switch (legacyDryId) {
      case "warm-pad-c4": {
        const envelope = fadeEnvelope(time, duration, 0.16, 0.62);
        const harmonics = [
          [1, 1],
          [2, 0.36],
          [3, 0.19],
          [4, 0.1],
          [5, 0.06],
        ];
        leftValue =
          (harmonicWave(frequency * 0.997, time, harmonics) * 0.72 +
            Math.sin(TWO_PI * frequency * 0.5 * time) * 0.18) *
          envelope;
        rightValue =
          (harmonicWave(frequency * 1.004, time, harmonics, 0.08) * 0.72 +
            Math.sin(TWO_PI * frequency * 0.5 * time + 0.04) * 0.18) *
          envelope;
        break;
      }
      case "soft-keys-c4": {
        const body = Math.exp(-time / 0.62);
        const hammer = Math.exp(-time / 0.055);
        const tail = fadeEnvelope(time, duration, 0.006, 0.16);
        leftValue =
          (harmonicWave(frequency, time, [
            [1, 1],
            [2, 0.22],
            [3, 0.12],
          ]) *
            body +
            harmonicWave(frequency, time, [
              [5, 0.2],
              [7, 0.11],
            ]) *
              hammer) *
          tail;
        rightValue =
          (harmonicWave(frequency * 1.0015, time, [
            [1, 1],
            [2, 0.2],
            [3, 0.1],
          ]) *
            body +
            harmonicWave(frequency, time, [
              [4, 0.17],
              [8, 0.08],
            ]) *
              hammer) *
          tail;
        break;
      }
      case "glass-chords-c4": {
        const envelope =
          Math.exp(-time / 0.72) * fadeEnvelope(time, duration, 0.004, 0.18);
        const index = 1.65 * Math.exp(-time / 0.42);
        const rightFrequency = frequency * 1.001;
        leftValue =
          (Math.sin(
            TWO_PI * frequency * time +
              Math.sin(TWO_PI * frequency * 2 * time) * index,
          ) *
            0.7 +
            Math.sin(TWO_PI * frequency * 4 * time) * 0.12) *
          envelope;
        rightValue =
          (Math.sin(
            TWO_PI * rightFrequency * time +
              Math.sin(TWO_PI * rightFrequency * 3 * time + 0.12) * index,
          ) *
            0.7 +
            Math.sin(TWO_PI * rightFrequency * 5 * time) * 0.1) *
          envelope;
        break;
      }
      case "pulsing-synth-c4": {
        const pulse =
          0.38 + 0.62 * smoothstep((Math.sin(TWO_PI * 7.5 * time) + 1) / 2);
        const envelope = fadeEnvelope(time, duration, 0.025, 0.2) * pulse;
        const wave = [
          [1, 1],
          [2, 0.48],
          [3, 0.25],
          [4, 0.13],
          [5, 0.08],
        ];
        leftValue = harmonicWave(frequency * 0.998, time, wave) * envelope;
        rightValue =
          harmonicWave(frequency * 1.003, time, wave, 0.05) * envelope;
        break;
      }
      case "dust-texture-c4": {
        const envelope = fadeEnvelope(time, duration, 0.03, 0.22);
        const sparkleLeft =
          randomLeft() > 0.996 ? highLeft * 3.5 : highLeft * 0.12;
        const sparkleRight =
          randomRight() > 0.996 ? highRight * 3.5 : highRight * 0.12;
        leftValue =
          (sparkleLeft + Math.sin(TWO_PI * frequency * 2.01 * time) * 0.12) *
          envelope;
        rightValue =
          (sparkleRight + Math.sin(TWO_PI * frequency * 2.99 * time) * 0.1) *
          envelope;
        break;
      }
      case "radio-texture-c4": {
        const envelope = fadeEnvelope(time, duration, 0.02, 0.2);
        const carrier = Math.sin(
          TWO_PI * frequency * time + Math.sin(TWO_PI * 31 * time) * 0.8,
        );
        const dropout = randomLeft() > 0.992 ? 0.25 : 1;
        leftValue = (lowLeft * 2.25 + carrier * 0.32) * envelope * dropout;
        rightValue = (lowRight * 2.05 + carrier * 0.29) * envelope * dropout;
        break;
      }
      case "nebula-texture-c4": {
        const envelope = fadeEnvelope(time, duration, 0.22, 0.7);
        leftValue =
          (harmonicWave(frequency * 0.499, time, [
            [1, 1],
            [3, 0.16],
            [5, 0.08],
          ]) *
            0.48 +
            lowLeft * 0.68) *
          envelope;
        rightValue =
          (harmonicWave(frequency * 0.503, time, [
            [1, 1],
            [2, 0.14],
            [6, 0.07],
          ]) *
            0.48 +
            lowRight * 0.68) *
          envelope;
        break;
      }
      case "mechanical-texture-c4": {
        const tick = Math.exp(-(time % 0.145) / 0.018);
        const envelope = fadeEnvelope(time, duration, 0.008, 0.16);
        leftValue =
          (Math.sin(
            TWO_PI * frequency * 7.17 * time +
              Math.sin(TWO_PI * 73 * time) * 2.2,
          ) *
            0.58 +
            highLeft * 0.28) *
          tick *
          envelope;
        rightValue =
          (Math.sin(
            TWO_PI * frequency * 5.91 * time +
              Math.sin(TWO_PI * 67 * time) * 2.5,
          ) *
            0.58 +
            highRight * 0.28) *
          tick *
          envelope;
        break;
      }
      case "void-drone-c2": {
        const envelope = fadeEnvelope(time, duration, 0.24, 0.72);
        leftValue =
          (Math.sin(TWO_PI * frequency * time) * 0.66 +
            Math.sin(TWO_PI * frequency * 0.5 * time) * 0.3 +
            lowLeft * 0.18) *
          envelope;
        rightValue =
          (Math.sin(TWO_PI * frequency * 1.003 * time + 0.03) * 0.64 +
            Math.sin(TWO_PI * frequency * 0.5 * time) * 0.3 +
            lowRight * 0.18) *
          envelope;
        break;
      }
      default:
        throw new Error(`Unknown legacy-dry tonal definition: ${legacyDryId}`);
    }

    left[frame] = softLimit(leftValue, 0.92);
    right[frame] = softLimit(rightValue, 0.92);
  }

  return {
    channels: [left, right],
    durationSeconds: definition.durationSeconds,
  };
}

function renderLegacyDryAuxiliary(definition) {
  const frames = Math.ceil(definition.durationSeconds * SAMPLE_RATE);
  const channel = new Float32Array(frames);
  const legacyDryId = definition.legacyDryId ?? definition.id;
  const random = createRandom(`${legacyDryId}/${LEGACY_DRY_SYNTHESIS_VERSION}`);
  let fastNoise = 0;
  let phase = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const rawNoise = random() * 2 - 1;
    fastNoise += 0.36 * (rawNoise - fastNoise);
    const highNoise = rawNoise - fastNoise;
    let value;

    if (legacyDryId === "orbital-ring-hat") {
      value =
        (highNoise * 0.7 + Math.sin(TWO_PI * 8_913 * time) * 0.16) *
        Math.exp(-time / 0.052);
    } else if (legacyDryId === "orbital-ring-shaker") {
      const motion = 0.35 + 0.65 * Math.abs(Math.sin(TWO_PI * 31 * time));
      value = highNoise * motion * Math.exp(-time / 0.15) * 0.82;
    } else if (legacyDryId === "orbital-ring-perc") {
      const frequency = 178 + 146 * Math.exp(-time / 0.06);
      phase += (TWO_PI * frequency) / SAMPLE_RATE;
      value =
        (Math.sin(phase + Math.sin(phase * 1.83) * 1.4) * 0.75 +
          highNoise * 0.15) *
        Math.exp(-time / 0.18);
    } else {
      const cluster =
        Math.exp(-(((time - 0.01) / 0.012) ** 2)) +
        Math.exp(-(((time - 0.09) / 0.026) ** 2)) * 0.6 +
        Math.exp(-(((time - 0.21) / 0.045) ** 2)) * 0.35;
      const metal =
        (Math.sin(TWO_PI * 1_197 * time) + Math.sin(TWO_PI * 1_931 * time)) *
        0.18;
      value = (highNoise * cluster + metal * Math.exp(-time / 0.22)) * 0.78;
    }

    channel[frame] =
      softLimit(value, 1) *
      smoothstep(time / 0.0015) *
      smoothstep((definition.durationSeconds - time) / 0.012);
  }

  return { channels: [channel], durationSeconds: definition.durationSeconds };
}

function createFeedbackComb(delaySamples, feedback, damping) {
  const buffer = new Float32Array(Math.max(1, delaySamples));
  let index = 0;
  let damped = 0;
  return (input) => {
    const delayed = buffer[index];
    damped = delayed * (1 - damping) + damped * damping;
    buffer[index] = input + damped * feedback;
    index = (index + 1) % buffer.length;
    return delayed;
  };
}

function createAllPass(delaySamples, feedback = 0.5) {
  const buffer = new Float32Array(Math.max(1, delaySamples));
  let index = 0;
  return (input) => {
    const delayed = buffer[index];
    const output = delayed - input;
    buffer[index] = input + delayed * feedback;
    index = (index + 1) % buffer.length;
    return output;
  };
}

function renderSchroederChannel(input, outputFrames, profile, stereoSide) {
  const stereoSpreadSeconds = stereoSide === "right" ? 0.000_521 : 0;
  const combDelaySeconds = [
    0.025_31, 0.026_94, 0.028_96, 0.030_75, 0.032_24, 0.033_81, 0.035_31,
    0.036_67,
  ];
  const allPassDelaySeconds = [0.012_61, 0.01, 0.007_73, 0.005_1];
  const feedback = 0.57 + profile.roomSize * 0.34;
  const combs = combDelaySeconds.map((delay) =>
    createFeedbackComb(
      Math.round((delay + stereoSpreadSeconds) * SAMPLE_RATE),
      feedback,
      profile.damping,
    ),
  );
  const allPasses = allPassDelaySeconds.map((delay) =>
    createAllPass(
      Math.round((delay + stereoSpreadSeconds * 0.5) * SAMPLE_RATE),
    ),
  );
  const preDelayFrames = Math.round(
    (profile.preDelaySeconds + (stereoSide === "right" ? 0.007 : 0)) *
      SAMPLE_RATE,
  );
  const wet = new Float32Array(outputFrames);

  for (let frame = 0; frame < outputFrames; frame += 1) {
    const sourceFrame = frame - preDelayFrames;
    const source =
      sourceFrame >= 0 && sourceFrame < input.length
        ? input[sourceFrame] * profile.inputGain
        : 0;
    let value = 0;
    for (const comb of combs) value += comb(source);
    value *= 0.25;
    for (const allPass of allPasses) value = allPass(value);
    wet[frame] = value;
  }
  return wet;
}

function applySpaceSoftCeiling(value) {
  const sign = Math.sign(value);
  const magnitude = Math.abs(value);
  const knee = 0.52;
  const ceiling = 0.68;
  if (magnitude <= knee) return value;
  return (
    sign *
    (knee + (ceiling - knee) * Math.tanh((magnitude - knee) / (ceiling - knee)))
  );
}

/**
 * A compact Freeverb-style Schroeder network: decorrelated feedback combs,
 * serial all-pass diffusion, a short stereo pre-delay, and a fixed soft ceiling.
 * It is deterministic and runs only during content builds.
 */
export function applySpaceReverb(channels, profile) {
  if (
    channels.length === 0 ||
    channels.length > 2 ||
    channels.some(
      (channel) =>
        !(channel instanceof Float32Array) ||
        channel.length === 0 ||
        channel.length !== channels[0].length,
    )
  ) {
    throw new Error("Space reverb requires one or two aligned PCM channels.");
  }
  const dryFrames = channels[0].length;
  const outputFrames = dryFrames + Math.ceil(profile.tailSeconds * SAMPLE_RATE);
  const dryLeft = channels[0];
  const dryRight = channels[1] ?? channels[0];
  const reverbInputLeft = new Float32Array(dryFrames);
  const reverbInputRight = new Float32Array(dryFrames);
  for (let frame = 0; frame < dryFrames; frame += 1) {
    reverbInputLeft[frame] = dryLeft[frame] * 0.82 + dryRight[frame] * 0.18;
    reverbInputRight[frame] = dryRight[frame] * 0.82 + dryLeft[frame] * 0.18;
  }

  const wetLeft = renderSchroederChannel(
    reverbInputLeft,
    outputFrames,
    profile,
    "left",
  );
  const wetRight = renderSchroederChannel(
    reverbInputRight,
    outputFrames,
    profile,
    "right",
  );
  const outputLeft = new Float32Array(outputFrames);
  const outputRight = new Float32Array(outputFrames);
  const tailFadeFrames = Math.round(0.08 * SAMPLE_RATE);
  for (let frame = 0; frame < outputFrames; frame += 1) {
    const dryL = frame < dryFrames ? dryLeft[frame] : 0;
    const dryR = frame < dryFrames ? dryRight[frame] : 0;
    const tailFade = smoothstep((outputFrames - frame) / tailFadeFrames);
    outputLeft[frame] = applySpaceSoftCeiling(
      dryL * profile.dryGain + wetLeft[frame] * profile.wetGain * tailFade,
    );
    outputRight[frame] = applySpaceSoftCeiling(
      dryR * profile.dryGain + wetRight[frame] * profile.wetGain * tailFade,
    );
  }
  return {
    channels: [outputLeft, outputRight],
    durationSeconds: outputFrames / SAMPLE_RATE,
  };
}

export function validateRenderedChannels(id, channels) {
  if (channels.length === 0) {
    throw new Error(`${id} rendered no audio channels.`);
  }
  const frameCount = channels[0].length;
  if (
    frameCount === 0 ||
    channels.some((channel) => channel.length !== frameCount)
  ) {
    throw new Error(`${id} rendered invalid channel lengths.`);
  }

  let squaredSum = 0;
  let sampleCount = 0;
  for (const channel of channels) {
    for (const sample of channel) {
      if (!Number.isFinite(sample)) {
        throw new Error(`${id} rendered a non-finite PCM sample.`);
      }
      squaredSum += sample * sample;
      sampleCount += 1;
    }
  }
  const rms = Math.sqrt(squaredSum / sampleCount);
  if (!Number.isFinite(rms) || rms < MINIMUM_RENDER_RMS) {
    throw new Error(`${id} rendered silence below the RMS safety threshold.`);
  }
  return rms;
}

export function validateLevelStats(id, stage, levels) {
  if (!Number.isFinite(levels.peakDb) || !Number.isFinite(levels.meanDb)) {
    throw new Error(`${id} has invalid ${stage} level statistics.`);
  }
  if (levels.peakDb <= MINIMUM_LEVEL_DB || levels.meanDb <= MINIMUM_LEVEL_DB) {
    throw new Error(`${id} is silent at the ${stage} level check.`);
  }
}

export function validateEncodedContract(
  id,
  expectedDurationSeconds,
  expectedChannels,
  probeResult,
  encodedBytes,
) {
  if (
    !Number.isFinite(expectedDurationSeconds) ||
    expectedDurationSeconds <= 0 ||
    !Number.isInteger(expectedChannels) ||
    expectedChannels <= 0
  ) {
    throw new Error(`${id} has an invalid render contract.`);
  }
  if (
    !Number.isFinite(probeResult.durationSeconds) ||
    Math.abs(probeResult.durationSeconds - expectedDurationSeconds) >
      DURATION_TOLERANCE_SECONDS
  ) {
    throw new Error(`${id} failed the encoded duration contract.`);
  }
  if (
    probeResult.codec !== "vorbis" ||
    probeResult.sampleRate !== SAMPLE_RATE ||
    probeResult.channels !== expectedChannels
  ) {
    throw new Error(`${id} failed the encoded audio format contract.`);
  }
  const maximumBytes = Math.ceil(
    expectedDurationSeconds *
      expectedChannels *
      MAX_ENCODED_BYTES_PER_CHANNEL_SECOND +
      ENCODED_CONTAINER_ALLOWANCE_BYTES,
  );
  if (
    !Number.isSafeInteger(encodedBytes) ||
    encodedBytes <= 0 ||
    encodedBytes > maximumBytes
  ) {
    throw new Error(`${id} failed the encoded size contract.`);
  }
}

export function validatePreviousProceduralEntry(sample) {
  if (
    sample?.sourceKind !== "procedural" ||
    typeof sample.id !== "string" ||
    !SAFE_PROCEDURAL_ID.test(sample.id) ||
    sample.url !== `audio/cosmic-samples/${sample.id}.ogg` ||
    sample.sourceFile !== `procedural:${sample.id}`
  ) {
    throw new Error("Manifest contains an unsafe procedural sample entry.");
  }
  return sample.id;
}

function writePcm16Wav(path, channels) {
  if (channels.length === 0)
    throw new Error("A WAV needs at least one channel.");
  const frameCount = channels[0].length;
  if (channels.some((channel) => channel.length !== frameCount)) {
    throw new Error("All WAV channels must contain the same number of frames.");
  }
  const bytesPerSample = 2;
  const blockAlign = channels.length * bytesPerSample;
  const dataBytes = frameCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels.length, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const channel of channels) {
      const renderedSample = channel[frame];
      if (!Number.isFinite(renderedSample)) {
        throw new Error(`Cannot encode a non-finite PCM sample to ${path}.`);
      }
      const sample = Math.max(-1, Math.min(1, renderedSample));
      const integer =
        sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
      buffer.writeInt16LE(integer, offset);
      offset += bytesPerSample;
    }
  }
  writeFileSync(path, buffer);
}

function encode(source, destination) {
  const temporary = `${destination}.tmp.ogg`;
  rmSync(temporary, { force: true });
  try {
    run("oggenc", [
      "--quiet",
      "--discard-comments",
      "--serial",
      "0",
      "--quality",
      String(VORBIS_QUALITY),
      `--output=${temporary}`,
      source,
    ]);
    renameSync(temporary, destination);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function probe(path) {
  const result = run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "format=duration:stream=codec_name,sample_rate,channels",
    "-of",
    "json",
    path,
  ]);
  const data = JSON.parse(result.stdout);
  const stream = data.streams?.[0];
  if (!stream || !data.format)
    throw new Error(`No audio stream found in ${path}.`);
  return {
    codec: String(stream.codec_name),
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    durationSeconds: Number(data.format.duration),
  };
}

function volumeStats(path) {
  const result = run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const mean = /mean_volume:\s*(-?(?:inf|[0-9.]+))\s*dB/i.exec(result.stderr);
  const peak = /max_volume:\s*(-?(?:inf|[0-9.]+))\s*dB/i.exec(result.stderr);
  const parseLevel = (match) => {
    if (!match) return null;
    if (match[1].toLowerCase() === "-inf") return Number.NEGATIVE_INFINITY;
    return Number(match[1]);
  };
  return {
    meanDb: parseLevel(mean),
    peakDb: parseLevel(peak),
  };
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function titleCase(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function proceduralDefinitions() {
  const drums = Object.entries(DRUM_STYLES).flatMap(([styleId, style]) =>
    DRUM_VOICES.map((voice) => {
      const legacyDryId = `${styleId}-${voice}`;
      const legacyDryName = `Legacy Dry ${style.label} ${titleCase(voice)}`;
      const spaceReverbProfile = HIGH_DRUM_VOICES.has(voice)
        ? SPACE_REVERB_PROFILES["high-drum"]
        : undefined;
      return {
        id: spaceReverbProfile ? `${legacyDryId}-space` : legacyDryId,
        name: spaceReverbProfile
          ? `${style.label} ${titleCase(voice)} Space`
          : `${style.label} ${titleCase(voice)}`,
        ...DRUM_METADATA[voice],
        channels: spaceReverbProfile ? 2 : 1,
        styleId,
        voice,
        ...(spaceReverbProfile
          ? {
              legacyDryId,
              legacyDryName,
              synthesisVersion: SPATIAL_SYNTHESIS_VERSION,
              spaceReverbProfile,
              releaseSeconds: spaceReverbProfile.releaseSeconds,
            }
          : {}),
      };
    }),
  );
  return [...drums, ...TONAL_DEFINITIONS, ...AUXILIARY_DEFINITIONS];
}

function renderDefinition(definition) {
  let legacyDryRender;
  if (definition.styleId) {
    legacyDryRender = renderLegacyDryDrum(definition.styleId, definition.voice);
  } else if (
    TONAL_DEFINITIONS.some((candidate) => candidate.id === definition.id)
  ) {
    legacyDryRender = renderLegacyDryStereoDefinition(definition);
  } else {
    legacyDryRender = renderLegacyDryAuxiliary(definition);
  }
  return definition.spaceReverbProfile
    ? applySpaceReverb(legacyDryRender.channels, definition.spaceReverbProfile)
    : legacyDryRender;
}

function runtimeAssetsSource(samples) {
  const runtime = samples.map(
    ({
      id,
      name,
      category,
      url,
      durationSeconds,
      attackSeconds,
      releaseSeconds,
      rootMidi,
    }) => ({
      id,
      name,
      category,
      url,
      durationSeconds,
      attackSeconds,
      releaseSeconds,
      ...(rootMidi === undefined ? {} : { rootMidi }),
    }),
  );
  const entries = runtime
    .map(
      (asset) => `  {
    id: ${JSON.stringify(asset.id)},
    name: ${JSON.stringify(asset.name)},
    category: ${JSON.stringify(asset.category)},
    url: ${JSON.stringify(asset.url)},
    durationSeconds: ${asset.durationSeconds},
    attackSeconds: ${asset.attackSeconds},
    releaseSeconds: ${asset.releaseSeconds},
${asset.rootMidi === undefined ? "" : `    rootMidi: ${asset.rootMidi},\n`}  },`,
    )
    .join("\n");
  return `/** Generated by scripts/render-procedural-samples.mjs. Do not edit by hand. */\nexport const PROCEDURAL_SAMPLE_ASSETS = [\n${entries}\n] as const;\n`;
}

function promoteGeneration({
  buildDirectory,
  generated,
  previousProceduralIds,
  stagedManifest,
  stagedRuntimeAssets,
  output,
  manifestPath,
  runtimeAssetsPath,
}) {
  const backupDirectory = join(buildDirectory, "backups");
  mkdirSync(backupDirectory);
  const backedUp = [];
  const promoted = [];
  const existingTargets = new Set([
    ...previousProceduralIds.map((id) => join(output, `${id}.ogg`)),
    ...generated.map((sample) => join(output, `${sample.id}.ogg`)),
    manifestPath,
    runtimeAssetsPath,
  ]);

  try {
    let backupIndex = 0;
    for (const target of existingTargets) {
      if (!existsSync(target)) continue;
      const backup = join(
        backupDirectory,
        `${String(backupIndex).padStart(3, "0")}-${basename(target)}`,
      );
      backupIndex += 1;
      renameSync(target, backup);
      backedUp.push({ target, backup });
    }

    for (const sample of generated) {
      const target = join(output, `${sample.id}.ogg`);
      renameSync(join(buildDirectory, `${sample.id}.ogg`), target);
      promoted.push(target);
    }
    renameSync(stagedManifest, manifestPath);
    promoted.push(manifestPath);
    renameSync(stagedRuntimeAssets, runtimeAssetsPath);
    promoted.push(runtimeAssetsPath);
  } catch (error) {
    for (const target of promoted.reverse()) rmSync(target, { force: true });
    for (const { target, backup } of backedUp.reverse()) {
      if (existsSync(backup)) renameSync(backup, target);
    }
    throw error;
  }
}

function main() {
  const { output, runtimeAssets } = parseArguments(process.argv.slice(2));
  const manifestPath = join(output, "manifest.json");
  assertToolsAvailable();
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.samples)) {
    throw new Error(`Unsupported sample manifest at ${manifestPath}.`);
  }

  const definitions = proceduralDefinitions();
  const expectedIds = new Set(definitions.map((definition) => definition.id));
  if (expectedIds.size !== definitions.length) {
    throw new Error("Procedural sample definitions contain duplicate IDs.");
  }
  const authored = manifest.samples.filter(
    (sample) => sample.sourceKind !== "procedural",
  );
  const authoredIds = new Set(authored.map((sample) => sample.id));
  for (const id of expectedIds) {
    if (authoredIds.has(id)) {
      throw new Error(
        `Procedural sample ID collides with authored asset: ${id}.`,
      );
    }
  }

  const previousProcedural = manifest.samples.filter(
    (sample) => sample.sourceKind === "procedural",
  );
  const previousProceduralIds = previousProcedural.map(
    validatePreviousProceduralEntry,
  );
  const temporaryDirectory = mkdtempSync(
    join(dirname(REPOSITORY_ROOT), ".cosmic-procedural-build-"),
  );
  const generated = [];
  try {
    for (const definition of definitions) {
      const rendered = renderDefinition(definition);
      validateRenderedChannels(definition.id, rendered.channels);
      const source = join(temporaryDirectory, `${definition.id}.wav`);
      const destination = join(temporaryDirectory, `${definition.id}.ogg`);
      writePcm16Wav(source, rendered.channels);
      encode(source, destination);

      const sourceProbe = probe(source);
      const encodedProbe = probe(destination);
      if (
        sourceProbe.codec !== "pcm_s16le" ||
        sourceProbe.sampleRate !== SAMPLE_RATE ||
        sourceProbe.channels !== definition.channels ||
        !Number.isFinite(sourceProbe.durationSeconds) ||
        Math.abs(sourceProbe.durationSeconds - rendered.durationSeconds) >
          DURATION_TOLERANCE_SECONDS
      ) {
        throw new Error(`${definition.id} failed the source audio contract.`);
      }
      const encodedBytes = statSync(destination).size;
      validateEncodedContract(
        definition.id,
        rendered.durationSeconds,
        definition.channels,
        encodedProbe,
        encodedBytes,
      );
      const sourceLevels = volumeStats(source);
      const encodedLevels = volumeStats(destination);
      validateLevelStats(definition.id, "source", sourceLevels);
      validateLevelStats(definition.id, "encoded", encodedLevels);
      if (encodedLevels.peakDb >= -0.1) {
        throw new Error(
          `${definition.id} failed the encoded peak safety check.`,
        );
      }

      generated.push({
        id: definition.id,
        name: definition.name,
        category: definition.category,
        url: `audio/cosmic-samples/${definition.id}.ogg`,
        sourceFile: `procedural:${definition.id}`,
        sourceKind: "procedural",
        synthesisVersion:
          definition.synthesisVersion ?? LEGACY_DRY_SYNTHESIS_VERSION,
        ...(definition.spaceReverbProfile
          ? {
              processing: {
                effect: "space reverb",
                algorithm: SPACE_REVERB_ALGORITHM,
                profile: definition.spaceReverbProfile.id,
                sourceVariant: "legacy dry",
                legacyDryId: definition.legacyDryId,
                legacyDryName: definition.legacyDryName,
                legacyDryAssetPackaged: false,
                preDelaySeconds: definition.spaceReverbProfile.preDelaySeconds,
                tailSeconds: definition.spaceReverbProfile.tailSeconds,
                wetGain: definition.spaceReverbProfile.wetGain,
              },
            }
          : {}),
        durationSeconds: rounded(encodedProbe.durationSeconds),
        attackSeconds: definition.attackSeconds,
        releaseSeconds: definition.releaseSeconds,
        ...(definition.rootMidi === undefined
          ? {}
          : { rootMidi: definition.rootMidi }),
        sourceDurationSeconds: rounded(sourceProbe.durationSeconds),
        trimmedSeconds: 0,
        channels: encodedProbe.channels,
        sampleRate: encodedProbe.sampleRate,
        sourceBitDepth: 16,
        sourceBytes: statSync(source).size,
        encodedBytes,
        sourcePeakDb: sourceLevels.peakDb,
        sourceMeanDb: sourceLevels.meanDb,
        encodedPeakDb: encodedLevels.peakDb,
        encodedMeanDb: encodedLevels.meanDb,
      });
    }

    generated.sort((left, right) => left.id.localeCompare(right.id, "en"));
    const samples = [...authored, ...generated].sort((left, right) =>
      left.id.localeCompare(right.id, "en"),
    );
    manifest.pack.generatedBy =
      "node scripts/process-samples.mjs + node scripts/render-procedural-samples.mjs";
    manifest.pack.proceduralSynthesis = {
      version: SPATIAL_SYNTHESIS_VERSION,
      renderer:
        "deterministic PCM16 offline synthesis + stereo Schroeder space reverb",
      legacyDryVersion: LEGACY_DRY_SYNTHESIS_VERSION,
      legacyDryAssetsPackaged: false,
      spatialAlgorithm: SPACE_REVERB_ALGORITHM,
      spatializedAssets: generated.filter(
        (sample) => sample.processing?.effect === "space reverb",
      ).length,
      dryTransientChannels: 1,
      spatializedChannels: 2,
      tonalChannels: 2,
      peakPolicy: "fixed patch gain through a -3.3 dBFS nominal soft ceiling",
    };
    manifest.samples = samples;

    const stagedManifest = join(temporaryDirectory, "next-manifest.json");
    const stagedRuntimeAssets = join(
      temporaryDirectory,
      "next-generatedProceduralSampleAssets.ts",
    );
    writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(stagedRuntimeAssets, runtimeAssetsSource(generated));
    promoteGeneration({
      buildDirectory: temporaryDirectory,
      generated,
      previousProceduralIds,
      stagedManifest,
      stagedRuntimeAssets,
      output,
      manifestPath,
      runtimeAssetsPath: runtimeAssets,
    });

    const encodedBytes = generated.reduce(
      (sum, sample) => sum + sample.encodedBytes,
      0,
    );
    process.stdout.write(
      `Rendered ${generated.length} procedural samples (${encodedBytes} bytes)\n` +
        `Merged ${samples.length} total assets into ${manifestPath}\n`,
    );
    for (const sample of generated) {
      process.stdout.write(
        `${sample.id.padEnd(30)} ${sample.durationSeconds.toFixed(3)}s  ${sample.channels}ch  ${String(sample.encodedPeakDb).padStart(5)} dBFS  ${sample.encodedBytes} bytes\n`,
      );
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
