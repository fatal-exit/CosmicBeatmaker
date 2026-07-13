export type AudioHealthFailureReason =
  | "callback-burst"
  | "invalid-audio-time"
  | "late-callback-backlog"
  | "occurrence-ledger-overflow"
  | "timeline-regression"
  | "voice-trigger-errors";

export interface AudioHealthFailure {
  readonly reason: AudioHealthFailureReason;
  readonly scheduledAudioTime: number;
  readonly currentAudioTime: number;
}

export interface AudioHealthLimits {
  readonly maxEventLatenessSeconds: number;
  readonly maxConsecutiveLateCallbacks: number;
  readonly callbackBurstWindowSeconds: number;
  readonly maxCallbacksPerBurstWindow: number;
  readonly maxOccurrenceLedgerEntries: number;
  readonly maxConsecutiveTriggerErrors: number;
}

export type AudioEventAdmission =
  | { readonly status: "accepted" }
  | { readonly status: "duplicate" }
  | { readonly status: "late" }
  | { readonly status: "tripped"; readonly failure: AudioHealthFailure };

export interface AudioEventCandidate {
  /** Stable occurrence within one compiled live period (includes cycle index). */
  readonly occurrenceKey: string;
  /** Monotonic repeat number for that live period, not global super-loop index. */
  readonly repeatIndex: number;
  readonly scheduledAudioTime: number;
  readonly currentAudioTime: number;
}

export const DEFAULT_AUDIO_HEALTH_LIMITS: AudioHealthLimits = {
  maxEventLatenessSeconds: 0.08,
  maxConsecutiveLateCallbacks: 16,
  callbackBurstWindowSeconds: 0.05,
  maxCallbacksPerBurstWindow: 128,
  maxOccurrenceLedgerEntries: 4_096,
  maxConsecutiveTriggerErrors: 4,
};

/**
 * Bounded, audio-clock-only admission state. It prevents a delayed Tone clock
 * from replaying a large backlog and prevents duplicate callbacks from stacking
 * the same source. Rendering time never participates in this decision.
 */
export class AudioHealthGuard {
  private readonly lastLoopByOccurrence = new Map<string, number>();
  private consecutiveLateCallbacks = 0;
  private consecutiveTriggerErrors = 0;
  private burstWindowStart = Number.NaN;
  private callbacksInBurstWindow = 0;
  private failure?: AudioHealthFailure;

  constructor(
    private readonly limits: AudioHealthLimits = DEFAULT_AUDIO_HEALTH_LIMITS,
  ) {}

  inspect(candidate: AudioEventCandidate): AudioEventAdmission {
    if (this.failure) return { status: "tripped", failure: this.failure };
    const { scheduledAudioTime, currentAudioTime } = candidate;
    if (
      !Number.isFinite(scheduledAudioTime) ||
      !Number.isFinite(currentAudioTime) ||
      !Number.isSafeInteger(candidate.repeatIndex) ||
      candidate.repeatIndex < 0
    ) {
      return this.trip(
        "invalid-audio-time",
        scheduledAudioTime,
        currentAudioTime,
      );
    }

    if (
      !Number.isFinite(this.burstWindowStart) ||
      currentAudioTime - this.burstWindowStart >=
        this.limits.callbackBurstWindowSeconds
    ) {
      this.burstWindowStart = currentAudioTime;
      this.callbacksInBurstWindow = 0;
    }
    this.callbacksInBurstWindow += 1;
    if (this.callbacksInBurstWindow > this.limits.maxCallbacksPerBurstWindow) {
      return this.trip("callback-burst", scheduledAudioTime, currentAudioTime);
    }

    if (
      scheduledAudioTime <
      currentAudioTime - this.limits.maxEventLatenessSeconds
    ) {
      this.consecutiveLateCallbacks += 1;
      if (
        this.consecutiveLateCallbacks >= this.limits.maxConsecutiveLateCallbacks
      ) {
        return this.trip(
          "late-callback-backlog",
          scheduledAudioTime,
          currentAudioTime,
        );
      }
      return { status: "late" };
    }
    this.consecutiveLateCallbacks = 0;

    const previousLoop = this.lastLoopByOccurrence.get(candidate.occurrenceKey);
    if (previousLoop === candidate.repeatIndex) return { status: "duplicate" };
    if (previousLoop !== undefined && candidate.repeatIndex < previousLoop) {
      return this.trip(
        "timeline-regression",
        scheduledAudioTime,
        currentAudioTime,
      );
    }
    if (
      previousLoop === undefined &&
      this.lastLoopByOccurrence.size >= this.limits.maxOccurrenceLedgerEntries
    ) {
      return this.trip(
        "occurrence-ledger-overflow",
        scheduledAudioTime,
        currentAudioTime,
      );
    }
    this.lastLoopByOccurrence.set(
      candidate.occurrenceKey,
      candidate.repeatIndex,
    );
    return { status: "accepted" };
  }

  recordTriggerSuccess(): void {
    this.consecutiveTriggerErrors = 0;
  }

  recordTriggerError(
    scheduledAudioTime: number,
    currentAudioTime: number,
  ): AudioHealthFailure | undefined {
    if (this.failure) return this.failure;
    this.consecutiveTriggerErrors += 1;
    if (
      this.consecutiveTriggerErrors >= this.limits.maxConsecutiveTriggerErrors
    ) {
      return this.trip(
        "voice-trigger-errors",
        scheduledAudioTime,
        currentAudioTime,
      ).failure;
    }
    return undefined;
  }

  reset(): void {
    this.lastLoopByOccurrence.clear();
    this.consecutiveLateCallbacks = 0;
    this.consecutiveTriggerErrors = 0;
    this.burstWindowStart = Number.NaN;
    this.callbacksInBurstWindow = 0;
    this.failure = undefined;
  }

  get snapshot(): Readonly<{
    occurrenceLedgerSize: number;
    callbacksInBurstWindow: number;
    tripped: boolean;
  }> {
    return {
      occurrenceLedgerSize: this.lastLoopByOccurrence.size,
      callbacksInBurstWindow: this.callbacksInBurstWindow,
      tripped: this.failure !== undefined,
    };
  }

  private trip(
    reason: AudioHealthFailureReason,
    scheduledAudioTime: number,
    currentAudioTime: number,
  ): Extract<AudioEventAdmission, { status: "tripped" }> {
    this.failure ??= { reason, scheduledAudioTime, currentAudioTime };
    return { status: "tripped", failure: this.failure };
  }
}

/** Fixed-capacity overlap accounting for Tone Sampler-created sources. */
export class ScheduledVoiceBudget {
  private readonly endTimes: number[] = [];

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new Error("Voice budget capacity must be a positive integer.");
    }
  }

  admit(
    scheduledAudioTime: number,
    requestedEndTimes: readonly number[],
  ): readonly number[] {
    this.prune(scheduledAudioTime);
    const available = Math.max(0, this.capacity - this.endTimes.length);
    const admitted = requestedEndTimes
      .filter(
        (endTime) => Number.isFinite(endTime) && endTime > scheduledAudioTime,
      )
      .slice(0, available);
    this.endTimes.push(...admitted);
    this.endTimes.sort((left, right) => left - right);
    return admitted;
  }

  clear(): void {
    this.endTimes.length = 0;
  }

  get activeCount(): number {
    return this.endTimes.length;
  }

  private prune(scheduledAudioTime: number): void {
    let expired = 0;
    while (
      expired < this.endTimes.length &&
      this.endTimes[expired] <= scheduledAudioTime
    ) {
      expired += 1;
    }
    if (expired > 0) this.endTimes.splice(0, expired);
  }
}
