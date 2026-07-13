import { Gain, Limiter } from "tone";

import type { Composition } from "../domain/composition/types";
import type { AudioHealthFailure } from "./AudioHealth";
import {
  AUDIO_OUTPUT_SAFETY,
  selectAudioRuntimeProfile,
  type AudioRuntimeProfile,
} from "./AudioRuntimeProfile";
import { compileLiveSchedule } from "./CompositionCompiler";
import { createLiveScheduleKey } from "./LiveScheduleKey";
import { Scheduler, createToneSchedulerBackend } from "./Scheduler";
import { RuntimeVoiceRegistry } from "./RuntimeVoiceRegistry";
import { RuntimeValueGate } from "./RuntimeValueGate";
import {
  createToneTransportController,
  type TransportController,
} from "./TransportController";
import { createLiveVoice } from "./VoiceFactory";
import type { ScheduledVisualEvent } from "./types";

export interface AudioEngineOptions {
  onVisualEvent?: (event: ScheduledVisualEvent) => void;
  onHealthFailure?: (failure: AudioHealthFailure) => void;
  audioProfile?: AudioRuntimeProfile;
  transport?: TransportController;
}

/** Tone runtime adapter; canonical composition state remains owned by the app. */
export class AudioEngine {
  readonly transport: TransportController;
  private composition?: Composition;
  private master?: Gain;
  private limiter?: Limiter;
  private scheduler?: Scheduler;
  private readonly voices = new RuntimeVoiceRegistry();
  private readonly masterGainGate = new RuntimeValueGate(0);
  private readonly audioProfile: AudioRuntimeProfile;
  private scheduleKey?: string;
  private safetyMuted = false;
  private masterDisconnected = false;
  private disposed = false;

  constructor(private readonly options: AudioEngineOptions = {}) {
    this.audioProfile = options.audioProfile ?? selectAudioRuntimeProfile();
    this.transport =
      options.transport ?? createToneTransportController(this.audioProfile);
  }

  async unlock(): Promise<void> {
    this.assertActive();
    await this.transport.unlock();
    if (!this.master) {
      this.limiter = new Limiter(
        AUDIO_OUTPUT_SAFETY.limiterThresholdDb,
      ).toDestination();
      this.master = new Gain(0).connect(this.limiter);
      this.scheduler = new Scheduler(
        createToneSchedulerBackend(),
        (occurrence, scheduledAudioTime) => {
          this.voices.trigger(
            occurrence,
            scheduledAudioTime,
            this.composition?.bpm ?? 120,
          );
        },
        {
          onVisualEvent: this.options.onVisualEvent,
          maxEventLatenessSeconds: this.audioProfile.maxEventLatenessSeconds,
          onHealthFailure: (failure) => this.handleHealthFailure(failure),
        },
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
    if (this.safetyMuted) {
      if (this.masterDisconnected && this.master && this.limiter) {
        this.master.connect(this.limiter);
        this.masterDisconnected = false;
      }
      this.scheduler?.resetPlaybackEpoch();
      this.safetyMuted = false;
      try {
        this.rebuildRuntime();
      } catch (error) {
        this.safetyMuted = true;
        throw error;
      }
    }
    this.transport.play();
  }

  pause(): void {
    this.assertActive();
    this.transport.pause();
    this.voices.releaseAll();
  }

  stop(): void {
    this.assertActive();
    this.transport.stop();
    this.voices.releaseAll();
    this.scheduler?.resetPlaybackEpoch();
  }

  dispose(): void {
    if (this.disposed) return;
    this.scheduler?.dispose();
    this.voices.dispose();
    this.master?.dispose();
    this.limiter?.dispose();
    this.disposed = true;
  }

  get isSafetyMuted(): boolean {
    return this.safetyMuted;
  }

  private rebuildRuntime(): void {
    if (!this.master || !this.scheduler || !this.composition) return;
    const template = compileLiveSchedule(this.composition);
    const nextScheduleKey = createLiveScheduleKey(this.composition, template);
    if (nextScheduleKey !== this.scheduleKey) {
      // Any sources already admitted inside Tone's lookahead belong to the old
      // pattern. Release them before replacing future transport callbacks.
      this.voices.releaseAll();
      this.scheduler.setComposition(this.composition);
      this.scheduleKey = nextScheduleKey;
    }
    this.voices.reconcile(
      template.sources.map((source) => source.track),
      (track) => createLiveVoice(track, this.master as Gain),
    );
    const masterTarget =
      Math.max(0, Math.min(1, this.composition.mix.level)) *
      AUDIO_OUTPUT_SAFETY.masterHeadroom;
    if (!this.safetyMuted && this.masterGainGate.shouldApply(masterTarget)) {
      this.master.gain.rampTo(masterTarget, 0.03);
    }
  }

  private handleHealthFailure(failure: AudioHealthFailure): void {
    if (this.disposed || this.safetyMuted) return;
    this.safetyMuted = true;
    this.scheduleKey = undefined;
    this.masterGainGate.reset(0);
    const muteAt = Math.max(0, failure.currentAudioTime);
    if (this.master) {
      try {
        this.master.gain.cancelAndHoldAtTime(muteAt);
        this.master.gain.linearRampToValueAtTime(
          0,
          muteAt + AUDIO_OUTPUT_SAFETY.emergencyFadeSeconds,
        );
      } catch {
        // Last-resort disconnection is safer than a sustained overload tone.
        this.master.disconnect();
        this.masterDisconnected = true;
      }
    }
    this.voices.releaseAll(muteAt + AUDIO_OUTPUT_SAFETY.emergencyFadeSeconds);
    try {
      if (this.transport.state === "playing") this.transport.pause();
    } catch {
      // The scheduler is already cleared and master output is fail-silent.
    }
    try {
      this.options.onHealthFailure?.(failure);
    } catch {
      // Health reporting cannot re-enter the audio failure path.
    }
  }

  private assertActive(): void {
    if (this.disposed)
      throw new Error("A disposed audio engine cannot be reused.");
  }
}
