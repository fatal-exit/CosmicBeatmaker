import { Gain, Limiter, Offline } from "tone";

import type { Composition } from "../domain/composition/types";
import { compileComposition } from "./CompositionCompiler";
import { ticksToSeconds } from "./timing";
import { createFallbackVoice } from "./VoiceFactory";
import { encodePcm16Wav } from "./WavEncoder";

export type OfflineRenderPhase = "compiling" | "rendering" | "encoding";

export interface OfflineRenderProgress {
  phase: OfflineRenderPhase;
  progress: number;
}

export interface OfflineRenderOptions {
  loops?: number;
  sampleRate?: number;
  tailSeconds?: number;
  onProgress?: (progress: OfflineRenderProgress) => void;
}

export async function renderCompositionToWav(
  composition: Composition,
  options: OfflineRenderOptions = {},
): Promise<Uint8Array> {
  const loops = options.loops ?? 2;
  const sampleRate = options.sampleRate ?? 44_100;
  const tailSeconds = options.tailSeconds ?? 0.4;
  if (!Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 10) {
    throw new Error(
      "Offline render tail must be between zero and ten seconds.",
    );
  }

  options.onProgress?.({ phase: "compiling", progress: 0.05 });
  const sequence = compileComposition(composition, { loops });
  const musicalDuration = ticksToSeconds(sequence.totalTicks, sequence.bpm);
  const renderDuration = musicalDuration + tailSeconds;
  options.onProgress?.({ phase: "rendering", progress: 0.25 });

  const buffer = await Offline(
    () => {
      const limiter = new Limiter(-1).toDestination();
      const master = new Gain(composition.mix.level).connect(limiter);
      const voices = new Map(
        sequence.tracks.map((track) => [
          track.id,
          createFallbackVoice(track, master),
        ]),
      );
      for (const occurrence of sequence.occurrences) {
        voices
          .get(occurrence.trackId)
          ?.trigger(
            occurrence,
            ticksToSeconds(occurrence.startTick, sequence.bpm),
            sequence.bpm,
          );
      }
      // Nodes belong to the short-lived offline context and are reclaimed with it.
    },
    renderDuration,
    2,
    sampleRate,
  );

  options.onProgress?.({ phase: "encoding", progress: 0.9 });
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  const wav = encodePcm16Wav({ sampleRate: buffer.sampleRate, channels });
  buffer.dispose();
  options.onProgress?.({ phase: "encoding", progress: 1 });
  return wav;
}
