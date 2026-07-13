import { Gain, Limiter } from "tone";

import type { Composition } from "../domain/composition/types";
import { compileComposition } from "./CompositionCompiler";
import { Scheduler, createToneSchedulerBackend } from "./Scheduler";
import {
  createToneTransportController,
  type TransportController,
} from "./TransportController";
import { createFallbackVoice, type RuntimeVoice } from "./VoiceFactory";
import type { ScheduledVisualEvent } from "./types";

export interface AudioEngineOptions {
  onVisualEvent?: (event: ScheduledVisualEvent) => void;
  transport?: TransportController;
}

/** Tone runtime adapter; canonical composition state remains owned by the app. */
export class AudioEngine {
  readonly transport: TransportController;
  private composition?: Composition;
  private master?: Gain;
  private limiter?: Limiter;
  private scheduler?: Scheduler;
  private readonly voices = new Map<string, RuntimeVoice>();
  private disposed = false;

  constructor(private readonly options: AudioEngineOptions = {}) {
    this.transport = options.transport ?? createToneTransportController();
  }

  async unlock(): Promise<void> {
    this.assertActive();
    await this.transport.unlock();
    if (!this.master) {
      this.limiter = new Limiter(-1).toDestination();
      this.master = new Gain(0.8).connect(this.limiter);
      this.scheduler = new Scheduler(
        createToneSchedulerBackend(),
        (occurrence, scheduledAudioTime) => {
          this.voices
            .get(occurrence.trackId)
            ?.trigger(
              occurrence,
              scheduledAudioTime,
              this.composition?.bpm ?? 120,
            );
        },
        { onVisualEvent: this.options.onVisualEvent },
      );
    }
    if (this.composition) this.rebuildRuntime();
  }

  setComposition(composition: Composition): void {
    this.assertActive();
    this.composition = composition;
    this.transport.setTempo(composition.bpm);
    if (this.transport.isUnlocked) this.rebuildRuntime();
  }

  play(): void {
    this.assertActive();
    if (!this.composition)
      throw new Error("Set a composition before playback.");
    this.transport.play();
  }

  pause(): void {
    this.assertActive();
    this.transport.pause();
  }

  stop(): void {
    this.assertActive();
    this.transport.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.scheduler?.dispose();
    this.disposeVoices();
    this.master?.dispose();
    this.limiter?.dispose();
    this.disposed = true;
  }

  private rebuildRuntime(): void {
    if (!this.master || !this.scheduler || !this.composition) return;
    this.scheduler.clear();
    this.disposeVoices();
    this.master.gain.value = this.composition.mix.level;
    const template = compileComposition(this.composition, {
      loops: 1,
      probabilityMode: "defer",
    });
    for (const track of template.tracks) {
      this.voices.set(track.id, createFallbackVoice(track, this.master));
    }
    this.scheduler.setComposition(this.composition);
  }

  private disposeVoices(): void {
    for (const voice of this.voices.values()) voice.dispose();
    this.voices.clear();
  }

  private assertActive(): void {
    if (this.disposed)
      throw new Error("A disposed audio engine cannot be reused.");
  }
}
