import { getTransport, immediate } from "tone";

import type { Composition } from "../domain/composition/types";
import {
  compileLiveSchedule,
  type CompiledLiveSchedule,
  type CompiledLiveSource,
} from "./CompositionCompiler";
import {
  AudioHealthGuard,
  DEFAULT_AUDIO_HEALTH_LIMITS,
  type AudioHealthFailure,
} from "./AudioHealth";
import { shouldPlayProbability } from "./probability";
import { ticksToSeconds } from "./timing";
import type { ScheduledOccurrence, ScheduledVisualEvent } from "./types";

export interface SchedulerBackend {
  scheduleRepeat(
    callback: (scheduledAudioTime: number) => void,
    intervalTicks: number,
    startTick: number,
  ): number;
  clear(id: number): void;
  getTicksAtTime(scheduledAudioTime: number): number;
  /** Raw current context time without Tone's scheduling lookahead. */
  getCurrentAudioTime(): number;
}

export type OccurrenceTrigger = (
  occurrence: ScheduledOccurrence,
  scheduledAudioTime: number,
) => void;

export interface SchedulerOptions {
  onVisualEvent?: (event: ScheduledVisualEvent) => void;
  maxEventLatenessSeconds?: number;
  onHealthFailure?: (failure: AudioHealthFailure) => void;
}

export interface SchedulerSetCompositionOptions {
  /**
   * While transport is running, schedule the unsounded remainder of each
   * source's current cycle instead of waiting for its next repeat boundary.
   */
  continueFromTick?: number;
}

/**
 * Registers audio-clock callbacks from the canonical compiler. Render frames may
 * consume visual messages, but have no API through which they can schedule audio.
 */
export class Scheduler {
  private readonly scheduledIds = new Set<number>();
  private revision = 0;
  private disposed = false;
  private healthTripped = false;
  private readonly visualTimeouts = new Set<number>();
  private visualTimeoutLimit = 128;
  private droppedVisualEvents = 0;
  private readonly health: AudioHealthGuard;

  constructor(
    private readonly backend: SchedulerBackend,
    private readonly trigger: OccurrenceTrigger,
    private readonly options: SchedulerOptions = {},
  ) {
    this.health = new AudioHealthGuard({
      ...DEFAULT_AUDIO_HEALTH_LIMITS,
      maxEventLatenessSeconds:
        options.maxEventLatenessSeconds ??
        DEFAULT_AUDIO_HEALTH_LIMITS.maxEventLatenessSeconds,
    });
  }

  setComposition(
    composition: Composition,
    options: SchedulerSetCompositionOptions = {},
  ): void {
    this.assertActive();
    this.clear();
    const revision = this.revision;
    const template = compileLiveSchedule(composition);
    if (
      options.continueFromTick !== undefined &&
      !Number.isFinite(options.continueFromTick)
    ) {
      throw new Error("A live continuation tick must be finite.");
    }
    const continuationAudioTime =
      options.continueFromTick === undefined
        ? undefined
        : this.backend.getCurrentAudioTime();
    const continuationTick =
      continuationAudioTime === undefined
        ? undefined
        : Math.max(
            0,
            Math.round(options.continueFromTick ?? 0),
            Math.round(this.backend.getTicksAtTime(continuationAudioTime)),
          );
    const maximumEventsScheduledPerCycle = template.sources.reduce(
      (total, source) =>
        total +
        Math.max(0, ...source.cycles.map((cycle) => cycle.events.length)),
      0,
    );
    // Two cycle generations cover a throttled timer boundary without allowing
    // an unbounded visual-only queue. Audio scheduling is never dropped here.
    this.visualTimeoutLimit = Math.max(128, maximumEventsScheduledPerCycle * 2);

    for (const source of template.sources) {
      if (source.cycles.length === 0) continue;
      const id = this.backend.scheduleRepeat(
        (scheduledAudioTime) => {
          if (this.disposed || revision !== this.revision) return;
          const scheduledTick = Math.max(
            0,
            Math.round(this.backend.getTicksAtTime(scheduledAudioTime)),
          );
          const sourceCycleNumber = Math.max(
            0,
            Math.round(scheduledTick / source.loopTicks),
          );
          const cycleStartTick = sourceCycleNumber * source.loopTicks;
          this.scheduleSourceCycle(
            composition,
            template,
            source,
            sourceCycleNumber,
            scheduledAudioTime,
            cycleStartTick,
            cycleStartTick,
            revision,
          );
        },
        source.loopTicks,
        0,
      );
      this.scheduledIds.add(id);

      if (
        continuationTick === undefined ||
        continuationAudioTime === undefined
      ) {
        continue;
      }
      const sourceCycleNumber = Math.floor(continuationTick / source.loopTicks);
      this.scheduleSourceCycle(
        composition,
        template,
        source,
        sourceCycleNumber,
        continuationAudioTime,
        continuationTick,
        continuationTick,
        revision,
      );
    }
  }

  clear(): void {
    this.revision += 1;
    this.clearRegistrations();
    this.clearVisualTimeouts();
    this.health.reset();
    this.healthTripped = false;
  }

  /** Stop/recovery hook for a transport epoch that returns to tick zero. */
  resetPlaybackEpoch(): void {
    this.clearVisualTimeouts();
    this.health.reset();
    this.healthTripped = false;
  }

  /** Pause hook: discard lookahead visuals without resetting audio admission. */
  cancelPendingVisualEvents(): void {
    this.clearVisualTimeouts();
  }

  get scheduledRegistrationCount(): number {
    return this.scheduledIds.size;
  }

  get healthSnapshot(): AudioHealthGuard["snapshot"] {
    return this.health.snapshot;
  }

  get droppedVisualEventCount(): number {
    return this.droppedVisualEvents;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed)
      throw new Error("A disposed scheduler cannot be reused.");
  }

  private scheduleSourceCycle(
    composition: Composition,
    template: CompiledLiveSchedule,
    source: CompiledLiveSource,
    sourceCycleNumber: number,
    scheduledAudioTime: number,
    audioAnchorTick: number,
    eventFloorTick: number,
    revision: number,
  ): void {
    if (this.disposed || revision !== this.revision) return;
    const cycleStartTick = sourceCycleNumber * source.loopTicks;
    const localCycleIndex = sourceCycleNumber % source.cycles.length;
    const templateRepeatIndex = Math.floor(
      sourceCycleNumber / source.cycles.length,
    );
    const loopIndex = Math.floor(cycleStartTick / template.superLoopTicks);
    const currentAudioTime = this.backend.getCurrentAudioTime();
    const admission = this.health.inspect({
      occurrenceKey: `${source.track.id}:${localCycleIndex}`,
      repeatIndex: templateRepeatIndex,
      scheduledAudioTime,
      currentAudioTime,
    });
    if (admission.status === "tripped") {
      this.haltForHealthFailure(admission.failure);
      return;
    }
    if (admission.status !== "accepted") return;

    const cycle = source.cycles[localCycleIndex];
    for (const event of cycle.events) {
      const startTick = cycleStartTick + event.startOffsetTicks;
      if (startTick < eventFloorTick) continue;
      if (
        !shouldPlayProbability(
          composition.seed,
          event.eventId,
          loopIndex,
          event.probability,
        )
      ) {
        continue;
      }
      const eventAudioTime =
        scheduledAudioTime +
        ticksToSeconds(startTick - audioAnchorTick, template.bpm);
      const concrete: ScheduledOccurrence = {
        occurrenceId: `${event.eventId}@${loopIndex}:${sourceCycleNumber}`,
        eventId: event.eventId,
        trackId: event.trackId,
        role: event.role,
        sourceKind: event.sourceKind,
        startTick,
        durationTicks: event.durationTicks,
        velocity: event.velocity,
        probability: event.probability,
        loopIndex,
        midiNotes: event.midiNotes,
        ...(event.drumVoice ? { drumVoice: event.drumVoice } : {}),
      };
      try {
        this.trigger(concrete, eventAudioTime);
        this.health.recordTriggerSuccess();
      } catch {
        const failure = this.health.recordTriggerError(
          eventAudioTime,
          currentAudioTime,
        );
        if (failure) {
          this.haltForHealthFailure(failure);
          return;
        }
        continue;
      }
      this.scheduleVisualEvent(
        concrete,
        eventAudioTime,
        currentAudioTime,
        revision,
      );
    }
  }

  private scheduleVisualEvent(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    currentAudioTime: number,
    revision: number,
  ): void {
    if (!this.options.onVisualEvent) return;
    if (this.visualTimeouts.size >= this.visualTimeoutLimit) {
      this.droppedVisualEvents += 1;
      return;
    }
    const delayMs = Math.max(
      0,
      Math.round((scheduledAudioTime - currentAudioTime) * 1_000),
    );
    const timeout = globalThis.setTimeout(() => {
      this.visualTimeouts.delete(timeout);
      if (this.disposed || revision !== this.revision) return;
      try {
        this.options.onVisualEvent?.({
          ...occurrence,
          scheduledAudioTime,
        });
      } catch {
        // Visual consumers cannot interrupt the audio clock callback.
      }
    }, delayMs);
    this.visualTimeouts.add(timeout);
  }

  private haltForHealthFailure(failure: AudioHealthFailure): void {
    if (this.healthTripped) return;
    this.healthTripped = true;
    this.revision += 1;
    this.clearRegistrations();
    this.clearVisualTimeouts();
    try {
      this.options.onHealthFailure?.(failure);
    } catch {
      // Failure reporting cannot re-enter the scheduler.
    }
  }

  private clearRegistrations(): void {
    for (const id of this.scheduledIds) this.backend.clear(id);
    this.scheduledIds.clear();
  }

  private clearVisualTimeouts(): void {
    for (const timeout of this.visualTimeouts) globalThis.clearTimeout(timeout);
    this.visualTimeouts.clear();
    this.droppedVisualEvents = 0;
  }
}

export function createToneSchedulerBackend(): SchedulerBackend {
  const transport = getTransport();
  return {
    scheduleRepeat(callback, intervalTicks, startTick) {
      return transport.scheduleRepeat(
        callback,
        `${intervalTicks}i`,
        `${startTick}i`,
      );
    },
    clear(id) {
      transport.clear(id);
    },
    getTicksAtTime(time) {
      return transport.getTicksAtTime(time);
    },
    getCurrentAudioTime() {
      return immediate();
    },
  };
}
