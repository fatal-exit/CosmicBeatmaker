import { Gain, Limiter, Offline } from "tone";

import type { Composition } from "../domain/composition/types";
import { compileComposition } from "./CompositionCompiler";
import { ticksToSeconds } from "./timing";
import type { CompiledSequence } from "./types";
import { createOfflineFallbackVoice } from "./VoiceFactory";
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
  signal?: AbortSignal;
}

export interface OfflineRenderTiming {
  sequence: CompiledSequence;
  /** Musical content ends on this super-loop resynchronization boundary. */
  musicalDurationSeconds: number;
  /** The optional effects tail begins only after the musical boundary. */
  renderDurationSeconds: number;
}

export function getOfflineRenderTiming(
  composition: Composition,
  options: Pick<OfflineRenderOptions, "loops" | "tailSeconds"> = {},
): OfflineRenderTiming {
  const loops = options.loops ?? 1;
  const tailSeconds = options.tailSeconds ?? 0.4;
  if (!Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 10) {
    throw new Error(
      "Offline render tail must be between zero and ten seconds.",
    );
  }
  const sequence = compileComposition(composition, { loops });
  const musicalDurationSeconds = ticksToSeconds(
    sequence.totalTicks,
    sequence.bpm,
  );
  return {
    sequence,
    musicalDurationSeconds,
    renderDurationSeconds: musicalDurationSeconds + tailSeconds,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException("WAV export cancelled.", "AbortError");
}

export async function renderCompositionToWav(
  composition: Composition,
  options: OfflineRenderOptions = {},
): Promise<Uint8Array> {
  const sampleRate = options.sampleRate ?? 44_100;

  throwIfAborted(options.signal);
  options.onProgress?.({ phase: "compiling", progress: 0.05 });
  const timing = getOfflineRenderTiming(composition, options);
  const { sequence } = timing;
  throwIfAborted(options.signal);
  options.onProgress?.({ phase: "rendering", progress: 0.25 });

  const buffer = await Offline(
    () => {
      const limiter = new Limiter(-1).toDestination();
      const master = new Gain(composition.mix.level).connect(limiter);
      const voices = new Map(
        sequence.tracks.map((track) => [
          track.id,
          createOfflineFallbackVoice(track, master),
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
    timing.renderDurationSeconds,
    2,
    sampleRate,
  );

  if (options.signal?.aborted) {
    buffer.dispose();
    throwIfAborted(options.signal);
  }
  options.onProgress?.({ phase: "encoding", progress: 0.9 });
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  const wav = encodePcm16Wav({ sampleRate: buffer.sampleRate, channels });
  buffer.dispose();
  throwIfAborted(options.signal);
  options.onProgress?.({ phase: "encoding", progress: 1 });
  return wav;
}
