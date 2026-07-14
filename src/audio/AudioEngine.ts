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
import {
  Scheduler,
  createToneSchedulerBackend,
  type SchedulerBackend,
} from "./Scheduler";
import {
  RuntimeVoiceRegistry,
  type RuntimeVoiceGenerationHandle,
  type RuntimeVoiceFactory,
  type RuntimeVoiceRetirement,
} from "./RuntimeVoiceRegistry";
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
  /** Test/runtime adapter seam; production uses Tone's global transport. */
  schedulerBackend?: SchedulerBackend;
  /** Test/runtime adapter seam; production creates the mapped Tone voice. */
  voiceFactory?: RuntimeVoiceFactory;
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
  private transportSilenced = true;
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
    // Unlock can be deferred by the browser. A Strict Mode cleanup or route
    // change may dispose this engine while that user-gesture promise is pending.
    this.assertActive();
    if (!this.master) {
      this.limiter = new Limiter(
        AUDIO_OUTPUT_SAFETY.limiterThresholdDb,
      ).toDestination();
      this.master = new Gain(0).connect(this.limiter);
      this.scheduler = new Scheduler(
        this.options.schedulerBackend ?? createToneSchedulerBackend(),
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

  play(): boolean {
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
      if (this.safetyMuted) return false;
    }
    this.transportSilenced = false;
    try {
      // Pause and stop invalidate the prior transport epoch. Rebuild before
      // starting so resume gets only the unsounded events at the saved tick.
      this.rebuildRuntime();
      if (this.safetyMuted) return false;
      this.transport.play();
      return true;
    } catch (error) {
      this.transportSilenced = true;
      this.silenceMaster(this.scheduler?.currentAudioTime ?? 0);
      throw error;
    }
  }

  pause(): void {
    this.assertActive();
    const position = this.scheduler?.currentClockPosition;
    const currentAudioTime = position?.audioTime ?? 0;
    this.transportSilenced = true;
    this.silenceMaster(currentAudioTime);
    this.transport.pause(position);
    this.scheduler?.clear();
    this.scheduleKey = undefined;
    this.voices.retire(this.voiceRetirement(currentAudioTime));
  }

  stop(): void {
    this.assertActive();
    const currentAudioTime = this.scheduler?.currentAudioTime ?? 0;
    this.transportSilenced = true;
    this.silenceMaster(currentAudioTime);
    this.transport.stop();
    this.scheduler?.clear();
    this.scheduleKey = undefined;
    this.voices.retire(this.voiceRetirement(currentAudioTime));
  }

  dispose(): void {
    if (this.disposed) return;
    const currentAudioTime = this.scheduler?.currentAudioTime ?? 0;
    if (this.transport.isUnlocked) {
      try {
        this.transport.stop();
      } catch {
        // Runtime disposal still clears every owned registration and node.
      }
    }
    this.scheduler?.dispose();
    this.voices.dispose(currentAudioTime);
    this.master?.dispose();
    this.limiter?.dispose();
    this.disposed = true;
  }

  get isSafetyMuted(): boolean {
    return this.safetyMuted;
  }

  private rebuildRuntime(): void {
    if (!this.master || !this.scheduler || !this.composition) return;
    const composition = this.composition;
    const template = compileLiveSchedule(composition);
    const nextScheduleKey = createLiveScheduleKey(composition, template);
    const scheduleChanged = nextScheduleKey !== this.scheduleKey;
    const rawAudioTime = this.scheduler.currentAudioTime;
    if (scheduleChanged) {
      // Tone owns registrations which have not fired yet; voices own attacks
      // already admitted inside lookahead. Revoke both future layers at the raw
      // boundary, but leave every already-started note and the epoch output gate
      // untouched.
      this.scheduler.clear();
      this.voices.cancelScheduledAfter(rawAudioTime);
    }
    this.voices.reconcile(
      template.sources.map((source) => source.track),
      () => this.createVoiceGeneration(),
      rawAudioTime,
    );
    if (scheduleChanged) {
      this.scheduler.setComposition(composition, {
        ...(this.transport.state !== "stopped"
          ? { continueFromCurrentClock: true }
          : {}),
      });
      // Direct continuation can synchronously trip the health guard. Its
      // callback clears this key and retires the epoch; never overwrite that
      // failure state after control returns from the scheduler.
      if (
        this.safetyMuted ||
        this.disposed ||
        this.composition !== composition
      ) {
        return;
      }
      this.scheduleKey = nextScheduleKey;
    }
    const masterTarget =
      Math.max(0, Math.min(1, composition.mix.level)) *
      AUDIO_OUTPUT_SAFETY.masterHeadroom;
    if (
      !this.safetyMuted &&
      !this.transportSilenced &&
      this.masterGainGate.shouldApply(masterTarget)
    ) {
      this.master.gain.rampTo(masterTarget, 0.03);
    }
  }

  private handleHealthFailure(failure: AudioHealthFailure): void {
    if (this.disposed || this.safetyMuted) return;
    this.safetyMuted = true;
    this.transportSilenced = true;
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
    // The scheduler has already revoked its transport events. Remove the bank
    // from routing and fade its isolated gate so no lookahead attack can
    // survive a later recovery.
    this.voices.retire(this.voiceRetirement(muteAt));
    try {
      if (this.transport.state === "playing") {
        this.transport.pause(this.scheduler?.currentClockPosition);
      }
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

  private voiceRetirement(scheduledAudioTime: number): RuntimeVoiceRetirement {
    return {
      scheduledAudioTime: Math.max(0, scheduledAudioTime),
      fadeSeconds: AUDIO_OUTPUT_SAFETY.emergencyFadeSeconds,
    };
  }

  private createVoiceGeneration(): RuntimeVoiceGenerationHandle {
    if (!this.master) {
      throw new Error("Audio output must exist before creating voices.");
    }
    const output = new Gain(1).connect(this.master);
    let generationDisposed = false;
    return {
      createVoice:
        this.options.voiceFactory ??
        ((track) => createLiveVoice(track, output)),
      fadeOut: (scheduledAudioTime, fadeSeconds) => {
        if (generationDisposed) return;
        const fadeAt = Math.max(0, scheduledAudioTime);
        try {
          if (fadeSeconds === 0) {
            output.gain.cancelScheduledValues(fadeAt);
            output.gain.setValueAtTime(0, fadeAt);
          } else {
            output.gain.cancelAndHoldAtTime(fadeAt);
            output.gain.linearRampToValueAtTime(0, fadeAt + fadeSeconds);
          }
        } catch {
          // A gate which cannot automate safely must fail silent. Disconnecting
          // is reserved for this adapter failure path; normal retirement fades.
          output.disconnect();
        }
      },
      dispose: () => {
        if (generationDisposed) return;
        generationDisposed = true;
        output.dispose();
      },
    };
  }

  private silenceMaster(currentAudioTime: number): void {
    this.masterGainGate.reset(0);
    if (!this.master) return;
    const muteAt = Math.max(0, currentAudioTime);
    try {
      this.master.gain.cancelAndHoldAtTime(muteAt);
      this.master.gain.linearRampToValueAtTime(
        0,
        muteAt + AUDIO_OUTPUT_SAFETY.emergencyFadeSeconds,
      );
    } catch {
      // rampTo remains available on older Web Audio implementations where
      // cancelAndHoldAtTime is incomplete.
      this.master.gain.rampTo(0, AUDIO_OUTPUT_SAFETY.emergencyFadeSeconds);
    }
  }
}
