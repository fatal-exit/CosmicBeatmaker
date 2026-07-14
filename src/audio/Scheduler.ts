import { getTransport, immediate, now as schedulingNow } from "tone";

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
import type { ScheduledOccurrence, ScheduledVisualEvent } from "./types";

export interface SchedulerBackend {
  scheduleRepeat(
    callback: (scheduledAudioTime: number) => void,
    intervalTicks: number,
    startTick: number,
  ): number;
  scheduleOnce(
    callback: (scheduledAudioTime: number) => void,
    absoluteTick: number,
  ): number;
  clear(id: number): void;
  getTicksAtTime(scheduledAudioTime: number): number;
  /** Raw current context time without Tone's scheduling lookahead. */
  getCurrentAudioTime(): number;
  /** Tone's scheduling frontier, including the configured lookahead. */
  getSchedulingAudioTime(): number;
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
  continueFromCurrentClock?: boolean;
}

export interface SchedulerClockPosition {
  /** Raw AudioContext time, deliberately excluding Tone's lookahead. */
  audioTime: number;
  /** Fractional transport position at the same raw AudioContext time. */
  transportTick: number;
  /** First transport tick which has not elapsed on the raw audio clock. */
  nextUnsoundedTick: number;
  /** Tone's current scheduling frontier, including lookahead. */
  schedulingAudioTime: number;
  /** Fractional transport position at Tone's scheduling frontier. */
  schedulingTransportTick: number;
}

const MAX_FUTURE_ADMISSION_LEDGER_ENTRIES =
  DEFAULT_AUDIO_HEALTH_LIMITS.maxOccurrenceLedgerEntries;
const TICK_TIME_SEARCH_ITERATIONS = 48;
const TICK_TIME_SEARCH_TOLERANCE_SECONDS = 1e-7;
const TICK_MONOTONIC_TOLERANCE = 1e-6;

/**
 * Registers audio-clock callbacks from the canonical compiler. Render frames may
 * consume visual messages, but have no API through which they can schedule audio.
 */
export class Scheduler {
  private readonly repeatIds = new Set<number>();
  private readonly pendingOneShotIds = new Set<number>();
  private readonly pendingOccurrenceIds = new Map<string, number>();
  private readonly latestClaimedCycleByOccurrence = new Map<string, number>();
  private readonly futureAdmittedAudioTimes = new Map<string, number>();
  private revision = 0;
  private playbackEpoch = 0;
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
    const continuation = options.continueFromCurrentClock
      ? this.currentClockPosition
      : undefined;
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
      if (this.disposed || revision !== this.revision) return;
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
            revision,
            true,
          );
        },
        source.loopTicks,
        0,
      );
      // A test adapter may invoke synchronously, and a direct continuation can
      // trip health below. Never retain an ID created after this revision died.
      if (this.disposed || revision !== this.revision) {
        this.backend.clear(id);
        return;
      }
      this.repeatIds.add(id);

      if (!continuation) continue;
      const firstSourceCycleNumber = Math.floor(
        continuation.nextUnsoundedTick / source.loopTicks,
      );
      const finalSourceCycleNumber = Math.floor(
        continuation.schedulingTransportTick / source.loopTicks,
      );
      // Tone registered this repeat at its lookahead position. Every source
      // cycle intersecting raw→frontier must therefore be supplied here: Tone
      // will not revisit any boundary which its clock has already processed.
      for (
        let sourceCycleNumber = firstSourceCycleNumber;
        sourceCycleNumber <= finalSourceCycleNumber;
        sourceCycleNumber += 1
      ) {
        this.scheduleSourceCycle(
          composition,
          template,
          source,
          sourceCycleNumber,
          continuation.audioTime,
          continuation.nextUnsoundedTick,
          revision,
          false,
          continuation,
        );
        if (this.disposed || revision !== this.revision) return;
      }
    }
  }

  clear(): void {
    this.revision += 1;
    this.clearRegistrations();
    this.futureAdmittedAudioTimes.clear();
    this.clearVisualTimeouts();
    this.health.reset();
    this.healthTripped = false;
  }

  /** Stop/recovery hook for a transport epoch that returns to tick zero. */
  resetPlaybackEpoch(): void {
    this.playbackEpoch += 1;
    this.clearPendingOneShots();
    this.latestClaimedCycleByOccurrence.clear();
    this.futureAdmittedAudioTimes.clear();
    this.clearVisualTimeouts();
    this.health.reset();
    this.healthTripped = false;
  }

  /** Pause hook: discard lookahead visuals without resetting audio admission. */
  cancelPendingVisualEvents(): void {
    this.clearVisualTimeouts();
  }

  get scheduledRegistrationCount(): number {
    return this.repeatIds.size;
  }

  get pendingScheduledEventCount(): number {
    return this.pendingOneShotIds.size;
  }

  get currentAudioTime(): number {
    return this.backend.getCurrentAudioTime();
  }

  get currentClockPosition(): SchedulerClockPosition {
    const audioTime = this.backend.getCurrentAudioTime();
    const schedulingAudioTime = this.backend.getSchedulingAudioTime();
    const transportTick = this.backend.getTicksAtTime(audioTime);
    const schedulingTransportTick =
      this.backend.getTicksAtTime(schedulingAudioTime);
    if (
      !Number.isFinite(audioTime) ||
      !Number.isFinite(schedulingAudioTime) ||
      !Number.isFinite(transportTick) ||
      !Number.isFinite(schedulingTransportTick)
    ) {
      throw new Error("The raw and scheduling clock positions must be finite.");
    }
    if (
      schedulingAudioTime < audioTime ||
      schedulingTransportTick < transportTick
    ) {
      throw new Error("The scheduling frontier cannot precede the raw clock.");
    }
    return {
      audioTime,
      transportTick: Math.max(0, transportTick),
      // A gate on the exact raw playhead boundary is already due. Start at the
      // following integer tick so Tone never receives a continuation one-shot
      // at the current (or a past) audio time.
      nextUnsoundedTick: Math.max(0, Math.floor(transportTick) + 1),
      schedulingAudioTime,
      schedulingTransportTick: Math.max(0, schedulingTransportTick),
    };
  }

  /** Earliest successfully admitted voice attack which remains ahead of raw time. */
  get earliestFutureAdmittedAudioTime(): number | undefined {
    this.pruneFutureAdmissions(this.backend.getCurrentAudioTime());
    let earliest: number | undefined;
    for (const audioTime of this.futureAdmittedAudioTimes.values()) {
      if (earliest === undefined || audioTime < earliest) earliest = audioTime;
    }
    return earliest;
  }

  get futureAdmittedEventCount(): number {
    this.pruneFutureAdmissions(this.backend.getCurrentAudioTime());
    return this.futureAdmittedAudioTimes.size;
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
    eventFloorTick: number,
    revision: number,
    allowDirectCycleStart: boolean,
    continuation?: SchedulerClockPosition,
  ): void {
    if (this.disposed || revision !== this.revision) return;
    const cycleStartTick = sourceCycleNumber * source.loopTicks;
    const localCycleIndex = sourceCycleNumber % source.cycles.length;
    const loopIndex = Math.floor(cycleStartTick / template.superLoopTicks);
    const cycle = source.cycles[localCycleIndex];
    for (const event of cycle.events) {
      const startTick = cycleStartTick + event.startOffsetTicks;
      const occurrenceKey = `${source.track.id}:${event.eventId}`;
      if (!this.claimOccurrence(occurrenceKey, sourceCycleNumber)) {
        continue;
      }
      // A continuation consumes the already-sounded prefix as well as claiming
      // its future events. If Tone also delivers the normal callback for this
      // cycle, neither half can be admitted a second time.
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

      if (
        continuation &&
        startTick > continuation.transportTick &&
        startTick <= continuation.schedulingTransportTick
      ) {
        this.admitAndTrigger(
          occurrenceKey,
          sourceCycleNumber,
          concrete,
          this.audioTimeForTick(startTick, continuation),
          revision,
        );
        if (revision !== this.revision) return;
      } else if (allowDirectCycleStart && startTick === cycleStartTick) {
        this.admitAndTrigger(
          occurrenceKey,
          sourceCycleNumber,
          concrete,
          scheduledAudioTime,
          revision,
        );
        if (revision !== this.revision) return;
      } else {
        this.scheduleEventOneShot(
          occurrenceKey,
          sourceCycleNumber,
          concrete,
          startTick,
          revision,
        );
      }
    }
  }

  private claimOccurrence(
    occurrenceKey: string,
    sourceCycleNumber: number,
  ): boolean {
    const previousCycle =
      this.latestClaimedCycleByOccurrence.get(occurrenceKey);
    if (previousCycle !== undefined && sourceCycleNumber <= previousCycle) {
      return false;
    }
    this.latestClaimedCycleByOccurrence.set(occurrenceKey, sourceCycleNumber);
    return true;
  }

  private scheduleEventOneShot(
    occurrenceKey: string,
    sourceCycleNumber: number,
    occurrence: ScheduledOccurrence,
    absoluteTick: number,
    revision: number,
  ): void {
    const occurrenceId = `${occurrenceKey}@${sourceCycleNumber}`;
    if (this.pendingOccurrenceIds.has(occurrenceId)) return;
    const playbackEpoch = this.playbackEpoch;
    const registration: { id?: number } = {};
    registration.id = this.backend.scheduleOnce((scheduledAudioTime) => {
      if (
        this.disposed ||
        revision !== this.revision ||
        playbackEpoch !== this.playbackEpoch
      ) {
        return;
      }
      if (registration.id !== undefined) {
        this.pendingOneShotIds.delete(registration.id);
        if (this.pendingOccurrenceIds.get(occurrenceId) === registration.id) {
          this.pendingOccurrenceIds.delete(occurrenceId);
        }
      }
      this.admitAndTrigger(
        occurrenceKey,
        sourceCycleNumber,
        occurrence,
        scheduledAudioTime,
        revision,
      );
    }, absoluteTick);
    const id = registration.id;
    this.pendingOneShotIds.add(id);
    this.pendingOccurrenceIds.set(occurrenceId, id);
  }

  private admitAndTrigger(
    occurrenceKey: string,
    sourceCycleNumber: number,
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    revision: number,
  ): void {
    if (this.disposed || revision !== this.revision) return;
    const currentAudioTime = this.backend.getCurrentAudioTime();
    const admission = this.health.inspect({
      occurrenceKey,
      repeatIndex: sourceCycleNumber,
      scheduledAudioTime,
      currentAudioTime,
    });
    if (admission.status === "tripped") {
      this.haltForHealthFailure(admission.failure);
      return;
    }
    if (admission.status !== "accepted") return;

    try {
      this.trigger(occurrence, scheduledAudioTime);
      this.health.recordTriggerSuccess();
    } catch {
      const failure = this.health.recordTriggerError(
        scheduledAudioTime,
        currentAudioTime,
      );
      if (failure) this.haltForHealthFailure(failure);
      return;
    }
    this.recordFutureAdmission(
      `${occurrenceKey}@${sourceCycleNumber}`,
      scheduledAudioTime,
      currentAudioTime,
    );
    this.scheduleVisualEvent(
      occurrence,
      scheduledAudioTime,
      currentAudioTime,
      revision,
    );
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
    this.futureAdmittedAudioTimes.clear();
  }

  private audioTimeForTick(
    targetTick: number,
    clock: SchedulerClockPosition,
  ): number {
    if (
      targetTick <= clock.transportTick ||
      targetTick > clock.schedulingTransportTick
    ) {
      throw new Error(
        "A continuation tick must lie inside the lookahead window.",
      );
    }

    let lowerAudioTime = clock.audioTime;
    let lowerTick = clock.transportTick;
    let upperAudioTime = clock.schedulingAudioTime;
    let upperTick = clock.schedulingTransportTick;

    for (
      let iteration = 0;
      iteration < TICK_TIME_SEARCH_ITERATIONS;
      iteration += 1
    ) {
      if (
        upperAudioTime - lowerAudioTime <=
        TICK_TIME_SEARCH_TOLERANCE_SECONDS
      ) {
        break;
      }
      const midpointAudioTime = (lowerAudioTime + upperAudioTime) / 2;
      const midpointTick = this.backend.getTicksAtTime(midpointAudioTime);
      if (!Number.isFinite(midpointTick)) {
        throw new Error("Tick-to-audio-time conversion must remain finite.");
      }
      if (
        midpointTick < lowerTick - TICK_MONOTONIC_TOLERANCE ||
        midpointTick > upperTick + TICK_MONOTONIC_TOLERANCE
      ) {
        throw new Error("Transport ticks must be monotonic inside lookahead.");
      }
      if (midpointTick >= targetTick) {
        upperAudioTime = midpointAudioTime;
        upperTick = midpointTick;
      } else {
        lowerAudioTime = midpointAudioTime;
        lowerTick = midpointTick;
      }
    }

    return upperAudioTime;
  }

  private recordFutureAdmission(
    occurrenceId: string,
    scheduledAudioTime: number,
    currentAudioTime: number,
  ): void {
    this.pruneFutureAdmissions(currentAudioTime);
    if (scheduledAudioTime <= currentAudioTime) return;
    if (
      this.futureAdmittedAudioTimes.has(occurrenceId) ||
      this.futureAdmittedAudioTimes.size < MAX_FUTURE_ADMISSION_LEDGER_ENTRIES
    ) {
      this.futureAdmittedAudioTimes.set(occurrenceId, scheduledAudioTime);
      return;
    }

    // Retirement needs the earliest admitted attack. If the bounded ledger is
    // full, retain the nearer attack and discard the farthest one.
    let latestOccurrenceId: string | undefined;
    let latestAudioTime = Number.NEGATIVE_INFINITY;
    for (const [candidateId, candidateAudioTime] of this
      .futureAdmittedAudioTimes) {
      if (candidateAudioTime > latestAudioTime) {
        latestOccurrenceId = candidateId;
        latestAudioTime = candidateAudioTime;
      }
    }
    if (
      latestOccurrenceId !== undefined &&
      scheduledAudioTime < latestAudioTime
    ) {
      this.futureAdmittedAudioTimes.delete(latestOccurrenceId);
      this.futureAdmittedAudioTimes.set(occurrenceId, scheduledAudioTime);
    }
  }

  private pruneFutureAdmissions(currentAudioTime: number): void {
    if (!Number.isFinite(currentAudioTime)) {
      this.futureAdmittedAudioTimes.clear();
      return;
    }
    for (const [occurrenceId, scheduledAudioTime] of this
      .futureAdmittedAudioTimes) {
      if (scheduledAudioTime <= currentAudioTime) {
        this.futureAdmittedAudioTimes.delete(occurrenceId);
      }
    }
  }

  private clearRegistrations(): void {
    for (const id of this.repeatIds) this.backend.clear(id);
    this.repeatIds.clear();
    this.clearPendingOneShots();
    this.latestClaimedCycleByOccurrence.clear();
  }

  private clearPendingOneShots(): void {
    for (const id of this.pendingOneShotIds) this.backend.clear(id);
    this.pendingOneShotIds.clear();
    this.pendingOccurrenceIds.clear();
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
    scheduleOnce(callback, absoluteTick) {
      return transport.scheduleOnce(callback, `${absoluteTick}i`);
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
    getSchedulingAudioTime() {
      return schedulingNow();
    },
  };
}
