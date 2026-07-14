import {
  Filter,
  Gain,
  getContext,
  MembraneSynth,
  MetalSynth,
  MonoSynth,
  NoiseSynth,
  Panner,
  PolySynth,
  Sampler,
  Synth,
  type InputNode,
} from "tone";

import {
  getAudioSampleAsset,
  getSampleVoicePreset,
  resolveAudioSampleUrl,
  type AudioSampleAssetDefinition,
  type AudioSampleId,
  type DrumSampleVoiceDefinition,
  type PitchedSampleVoiceDefinition,
  type SampleVoiceDefinition,
} from "../content/soundPresets";
import type { DrumVoiceId } from "../domain/composition/types";
import {
  liveSampleAssetCache,
  type CachedSampleAsset,
} from "./SampleAssetCache";
import { AUDIO_PPQ, MIDI_DRUM_NOTES } from "./constants";
import { planSamplePlayback, triggerPlannedOneShot } from "./samplePlayback";
import { ticksToSeconds } from "./timing";
import type { CompiledTrack, ScheduledOccurrence } from "./types";

export interface RuntimeVoice {
  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void;
  update?(track: CompiledTrack): void;
  releaseAll?(scheduledAudioTime?: number): void;
  /** Retracts only attacks which are still strictly ahead of the raw clock. */
  cancelScheduledAfter?(rawAudioTime: number): void;
  /**
   * Stops accepting attacks, retracts future work, and disposes after every
   * already-started occurrence reaches its own natural tail.
   */
  retireAfterActive?(rawAudioTime: number, onDisposed?: () => void): void;
  dispose(): void;
}

export interface OptionalSampleVoice extends RuntimeVoice {
  canTrigger(occurrence: ScheduledOccurrence): boolean;
}

export interface RuntimeVoiceEventHandle {
  readonly startAudioTime: number;
  readonly endAudioTime: number;
  readonly tailAudioTime: number;
  cancel(rawAudioTime: number): void;
  release?(rawAudioTime: number): void;
  dispose(): void;
}

export interface RuntimeVoiceEventClock {
  rawAudioTime(): number;
  setTimeout(callback: () => void, delaySeconds: number): number;
  clearTimeout(timerId: number): void;
}

export interface RuntimeVoiceSourceReservation {
  readonly admittedCount: number;
  release(): void;
}

/** Fixed overlap budget whose reservations can be released by event cancel. */
export class RuntimeVoiceSourceBudget {
  private readonly units = new Set<{ readonly endAudioTime: number }>();

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new Error(
        "Runtime voice source capacity must be a positive integer.",
      );
    }
  }

  admit(
    scheduledAudioTime: number,
    requestedEndTimes: readonly number[],
  ): RuntimeVoiceSourceReservation {
    if (!Number.isFinite(scheduledAudioTime) || scheduledAudioTime < 0) {
      throw new Error("Runtime voice source admission requires a valid time.");
    }
    for (const unit of [...this.units]) {
      if (unit.endAudioTime <= scheduledAudioTime) this.units.delete(unit);
    }
    const available = Math.max(0, this.capacity - this.units.size);
    const admitted = requestedEndTimes
      .filter(
        (endAudioTime) =>
          Number.isFinite(endAudioTime) && endAudioTime > scheduledAudioTime,
      )
      .slice(0, available)
      .map((endAudioTime) => ({ endAudioTime }));
    for (const unit of admitted) this.units.add(unit);

    let released = false;
    return {
      admittedCount: admitted.length,
      release: () => {
        if (released) return;
        released = true;
        for (const unit of admitted) this.units.delete(unit);
      },
    };
  }

  clear(): void {
    this.units.clear();
  }
}

/**
 * Owns the cancellable node for every attack admitted inside Tone's lookahead.
 * A voice has one cleanup timer regardless of event count. Future cancellation
 * never touches a handle whose attack is at or behind the supplied raw clock.
 */
export class RuntimeVoiceEventPool {
  private readonly handles = new Set<RuntimeVoiceEventHandle>();
  private readonly retirementCallbacks = new Set<() => void>();
  private cleanupTimerId: number | undefined;
  private cleanupAtAudioTime: number | undefined;
  private retired = false;
  private retirementComplete = false;
  private hardDisposed = false;

  constructor(
    readonly capacity: number,
    private readonly clock: RuntimeVoiceEventClock,
    private readonly cleanupGraceSeconds = 0,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new Error(
        "Runtime voice event capacity must be a positive integer.",
      );
    }
    if (!Number.isFinite(cleanupGraceSeconds) || cleanupGraceSeconds < 0) {
      throw new Error("Runtime voice cleanup grace cannot be negative.");
    }
  }

  get acceptsTriggers(): boolean {
    return !this.retired && !this.hardDisposed;
  }

  get size(): number {
    return this.handles.size;
  }

  canSchedule(
    startAudioTime: number,
    endAudioTime: number,
    tailAudioTime: number,
  ): boolean {
    this.assertTimes(startAudioTime, endAudioTime, tailAudioTime);
    if (!this.acceptsTriggers) return false;
    this.collectCompleted(this.readRawAudioTime());
    return this.handles.size < this.capacity;
  }

  schedule(
    handle: RuntimeVoiceEventHandle,
    scheduleAttack: () => void,
  ): boolean {
    this.assertTimes(
      handle.startAudioTime,
      handle.endAudioTime,
      handle.tailAudioTime,
    );
    const rawAudioTime = this.readRawAudioTime();
    this.collectCompleted(rawAudioTime);
    if (!this.acceptsTriggers || this.handles.size >= this.capacity) {
      this.cancelAndDispose(handle, rawAudioTime);
      return false;
    }
    if (this.handles.has(handle)) {
      throw new Error(
        "A runtime voice event handle cannot be scheduled twice.",
      );
    }

    this.handles.add(handle);
    try {
      scheduleAttack();
    } catch (error) {
      this.handles.delete(handle);
      this.cancelAndDispose(handle, rawAudioTime);
      this.scheduleCleanup();
      throw error;
    }
    this.scheduleCleanup();
    return true;
  }

  cancelScheduledAfter(rawAudioTime: number): void {
    this.assertRawAudioTime(rawAudioTime);
    this.collectCompleted(rawAudioTime);
    for (const handle of [...this.handles]) {
      // An attack exactly on the raw playhead is already due. Only work still
      // strictly inside the future lookahead window may be retracted.
      if (handle.startAudioTime <= rawAudioTime) continue;
      this.handles.delete(handle);
      this.cancelAndDispose(handle, rawAudioTime);
    }
    this.afterHandlesChanged();
  }

  releaseAll(rawAudioTime = this.readRawAudioTime()): void {
    this.assertRawAudioTime(rawAudioTime);
    this.collectCompleted(rawAudioTime);
    for (const handle of [...this.handles]) {
      if (handle.startAudioTime > rawAudioTime) {
        this.handles.delete(handle);
        this.cancelAndDispose(handle, rawAudioTime);
        continue;
      }
      try {
        handle.release?.(rawAudioTime);
      } catch {
        // A later hard disposal still reclaims a faulty event handle.
      }
    }
    this.afterHandlesChanged();
  }

  retireAfterActive(rawAudioTime: number, onDisposed?: () => void): void {
    this.assertRawAudioTime(rawAudioTime);
    if (onDisposed) {
      if (this.retirementComplete || this.hardDisposed) {
        onDisposed();
        return;
      }
      this.retirementCallbacks.add(onDisposed);
    }
    if (!this.retired) {
      this.retired = true;
      this.cancelScheduledAfter(rawAudioTime);
    } else {
      this.collectCompleted(rawAudioTime);
      this.afterHandlesChanged();
    }
  }

  /** Immediate shutdown path; active handles are deliberately hard-stopped. */
  dispose(): void {
    if (this.hardDisposed) return;
    this.hardDisposed = true;
    this.retired = true;
    this.cancelCleanupTimer();
    const rawAudioTime = this.readRawAudioTime();
    for (const handle of this.handles) {
      this.cancelAndDispose(handle, rawAudioTime);
    }
    this.handles.clear();
    this.completeRetirement();
  }

  private collectCompleted(rawAudioTime: number): void {
    for (const handle of [...this.handles]) {
      if (handle.tailAudioTime + this.cleanupGraceSeconds > rawAudioTime) {
        continue;
      }
      this.handles.delete(handle);
      this.disposeHandle(handle);
    }
  }

  private afterHandlesChanged(): void {
    if (this.retired && this.handles.size === 0) {
      this.completeRetirement();
      return;
    }
    this.scheduleCleanup();
  }

  private scheduleCleanup(): void {
    if (this.handles.size === 0 || this.hardDisposed) {
      this.cancelCleanupTimer();
      return;
    }
    let earliestTail = Number.POSITIVE_INFINITY;
    for (const handle of this.handles) {
      earliestTail = Math.min(
        earliestTail,
        handle.tailAudioTime + this.cleanupGraceSeconds,
      );
    }
    if (this.cleanupAtAudioTime === earliestTail) return;

    this.cancelCleanupTimer();
    const delaySeconds = Math.max(0, earliestTail - this.readRawAudioTime());
    this.cleanupAtAudioTime = earliestTail;
    this.cleanupTimerId = this.clock.setTimeout(() => {
      this.cleanupTimerId = undefined;
      this.cleanupAtAudioTime = undefined;
      this.collectCompleted(this.readRawAudioTime());
      this.afterHandlesChanged();
    }, delaySeconds);
  }

  private completeRetirement(): void {
    if (this.retirementComplete) return;
    this.retirementComplete = true;
    this.cancelCleanupTimer();
    const callbacks = [...this.retirementCallbacks];
    this.retirementCallbacks.clear();
    for (const callback of callbacks) {
      try {
        callback();
      } catch {
        // Resource completion cannot strand the remaining callbacks.
      }
    }
  }

  private cancelCleanupTimer(): void {
    if (this.cleanupTimerId !== undefined) {
      this.clock.clearTimeout(this.cleanupTimerId);
    }
    this.cleanupTimerId = undefined;
    this.cleanupAtAudioTime = undefined;
  }

  private cancelAndDispose(
    handle: RuntimeVoiceEventHandle,
    rawAudioTime: number,
  ): void {
    try {
      handle.cancel(rawAudioTime);
    } catch {
      // Disposal is the final cancellation boundary for a faulty handle.
    }
    this.disposeHandle(handle);
  }

  private disposeHandle(handle: RuntimeVoiceEventHandle): void {
    try {
      handle.dispose();
    } catch {
      // One faulty handle cannot leak the rest of the bounded pool.
    }
  }

  private readRawAudioTime(): number {
    const rawAudioTime = this.clock.rawAudioTime();
    this.assertRawAudioTime(rawAudioTime);
    return rawAudioTime;
  }

  private assertRawAudioTime(rawAudioTime: number): void {
    if (!Number.isFinite(rawAudioTime) || rawAudioTime < 0) {
      throw new Error(
        "Runtime voice lifecycle requires a non-negative audio time.",
      );
    }
  }

  private assertTimes(
    startAudioTime: number,
    endAudioTime: number,
    tailAudioTime: number,
  ): void {
    this.assertRawAudioTime(startAudioTime);
    if (
      !Number.isFinite(endAudioTime) ||
      !Number.isFinite(tailAudioTime) ||
      endAudioTime < startAudioTime ||
      tailAudioTime < endAudioTime
    ) {
      throw new Error(
        "A runtime voice event requires ordered start, end, and tail times.",
      );
    }
  }
}

function createToneEventPool(liveCapacity: number): RuntimeVoiceEventPool {
  const context = getContext();
  return new RuntimeVoiceEventPool(
    liveCapacity,
    {
      rawAudioTime: () => context.currentTime,
      setTimeout: (callback, delaySeconds) =>
        context.setTimeout(callback, delaySeconds),
      clearTimeout: (timerId) => {
        context.clearTimeout(timerId);
      },
    },
    // Two render quanta keep disposal beyond the final envelope frame even
    // when a callback lands on the exact authored sample boundary.
    256 / context.sampleRate,
  );
}

interface DisposableEventInstrument {
  dispose(): unknown;
}

function createInstrumentEventHandle(
  instrument: DisposableEventInstrument,
  startAudioTime: number,
  endAudioTime: number,
  tailAudioTime: number,
  release: (rawAudioTime: number) => void,
  onDisposed: () => void,
): RuntimeVoiceEventHandle {
  let disposed = false;
  return {
    startAudioTime,
    endAudioTime,
    tailAudioTime,
    cancel: release,
    release,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        instrument.dispose();
      } finally {
        onDisposed();
      }
    },
  };
}

function createReservedInstrument<T extends DisposableEventInstrument>(
  reservation: RuntimeVoiceSourceReservation,
  create: () => T,
): T {
  try {
    return create();
  } catch (error) {
    reservation.release();
    throw error;
  }
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

class TrackStrip {
  readonly filter: Filter;
  private readonly panner: Panner;
  private readonly gain: Gain;
  private disposed = false;

  constructor(
    track: CompiledTrack,
    output: InputNode,
    private readonly headroom: number,
  ) {
    const frequency = this.filterFrequency(track);
    this.filter = new Filter({ frequency, type: "lowpass", rolloff: -12 });
    this.panner = new Panner(track.pan);
    this.gain = new Gain(this.trackGain(track));
    this.filter.connect(this.panner);
    this.panner.connect(this.gain);
    this.gain.connect(output);
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.filter.frequency.rampTo(this.filterFrequency(track), 0.03);
    this.panner.pan.rampTo(Math.max(-1, Math.min(1, track.pan)), 0.03);
    this.gain.gain.rampTo(this.trackGain(track), 0.03);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.filter.dispose();
    this.panner.dispose();
    this.gain.dispose();
  }

  private filterFrequency(track: CompiledTrack): number {
    return 160 + Math.max(0, Math.min(1, track.filter)) ** 2 * 15_000;
  }

  private trackGain(track: CompiledTrack): number {
    return Math.max(0, Math.min(1, track.level)) * this.headroom;
  }
}

const FALLBACK_DRUM_SOURCE_CAPACITY = 6;
const FALLBACK_PITCHED_SOURCE_CAPACITY = 16;
const FALLBACK_TEXTURE_SOURCE_CAPACITY = 6;

class BeatFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly events = createToneEventPool(
    FALLBACK_DRUM_SOURCE_CAPACITY * Object.keys(MIDI_DRUM_NOTES).length,
  );
  private readonly budgets = new Map<DrumVoiceId, RuntimeVoiceSourceBudget>();
  private disposed = false;

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(track, output, 0.42);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed || !this.events.acceptsTriggers) return;
    const duration = Math.max(
      0.015,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    const endAudioTime = scheduledAudioTime + duration;
    const drumVoice = occurrence.drumVoice ?? "perc";
    const releaseSeconds =
      drumVoice === "kick"
        ? 0.08
        : drumVoice === "snare" ||
            drumVoice === "clap" ||
            drumVoice === "open-hat"
          ? 0.03
          : 0.02;
    const tailAudioTime = endAudioTime + releaseSeconds;
    if (
      !this.events.canSchedule(scheduledAudioTime, endAudioTime, tailAudioTime)
    ) {
      return;
    }
    const reservation = this.budgetFor(drumVoice).admit(scheduledAudioTime, [
      tailAudioTime,
    ]);
    if (reservation.admittedCount === 0) return;

    if (drumVoice === "kick") {
      const synth = createReservedInstrument(reservation, () =>
        new MembraneSynth({
          pitchDecay: 0.025,
          octaves: 5,
          envelope: {
            attack: 0.001,
            decay: 0.24,
            sustain: 0,
            release: 0.08,
          },
        }).connect(this.strip.filter),
      );
      this.events.schedule(
        createInstrumentEventHandle(
          synth,
          scheduledAudioTime,
          endAudioTime,
          tailAudioTime,
          (time) => synth.triggerRelease(time),
          () => reservation.release(),
        ),
        () =>
          synth.triggerAttackRelease(
            midiToFrequency(occurrence.midiNotes[0] ?? 36),
            duration,
            scheduledAudioTime,
            occurrence.velocity,
          ),
      );
      return;
    }

    if (
      drumVoice === "snare" ||
      drumVoice === "clap" ||
      drumVoice === "open-hat"
    ) {
      const synth = createReservedInstrument(reservation, () =>
        new NoiseSynth({
          noise: { type: "white" },
          envelope: {
            attack: 0.001,
            decay: 0.12,
            sustain: 0,
            release: 0.03,
          },
        }).connect(this.strip.filter),
      );
      this.events.schedule(
        createInstrumentEventHandle(
          synth,
          scheduledAudioTime,
          endAudioTime,
          tailAudioTime,
          (time) => synth.triggerRelease(time),
          () => reservation.release(),
        ),
        () =>
          synth.triggerAttackRelease(
            duration,
            scheduledAudioTime,
            occurrence.velocity * 0.72,
          ),
      );
      return;
    }

    const synth = createReservedInstrument(reservation, () =>
      new MetalSynth({
        envelope: { attack: 0.001, decay: 0.055, release: 0.02 },
        harmonicity: 5.1,
        modulationIndex: 16,
        resonance: 4_800,
        octaves: 1.2,
      }).connect(this.strip.filter),
    );
    this.events.schedule(
      createInstrumentEventHandle(
        synth,
        scheduledAudioTime,
        endAudioTime,
        tailAudioTime,
        (time) => synth.triggerRelease(time),
        () => reservation.release(),
      ),
      () =>
        synth.triggerAttackRelease(
          midiToFrequency(occurrence.midiNotes[0] ?? 50),
          duration,
          scheduledAudioTime,
          occurrence.velocity * 0.48,
        ),
    );
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.events.releaseAll(scheduledAudioTime);
    for (const budget of this.budgets.values()) budget.clear();
  }

  cancelScheduledAfter(rawAudioTime: number): void {
    this.events.cancelScheduledAfter(rawAudioTime);
  }

  retireAfterActive(rawAudioTime: number, onDisposed?: () => void): void {
    this.events.retireAfterActive(rawAudioTime, () => {
      try {
        this.disposeResources();
      } finally {
        onDisposed?.();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.dispose();
    this.disposeResources();
  }

  private budgetFor(drumVoice: DrumVoiceId): RuntimeVoiceSourceBudget {
    let budget = this.budgets.get(drumVoice);
    if (!budget) {
      budget = new RuntimeVoiceSourceBudget(FALLBACK_DRUM_SOURCE_CAPACITY);
      this.budgets.set(drumVoice, budget);
    }
    return budget;
  }

  private disposeResources(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const budget of this.budgets.values()) budget.clear();
    this.budgets.clear();
    this.strip.dispose();
  }
}

class PitchedFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly events = createToneEventPool(
    FALLBACK_PITCHED_SOURCE_CAPACITY,
  );
  private readonly budget = new RuntimeVoiceSourceBudget(
    FALLBACK_PITCHED_SOURCE_CAPACITY,
  );
  private readonly role: CompiledTrack["role"];
  private disposed = false;

  constructor(track: CompiledTrack, output: InputNode) {
    this.role = track.role;
    const headroom = track.role === "bass" ? 0.32 : 0.24;
    this.strip = new TrackStrip(track, output, headroom);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed || !this.events.acceptsTriggers) return;
    const notes = occurrence.midiNotes.map(midiToFrequency);
    const duration = Math.max(
      1 / AUDIO_PPQ,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    const releaseSeconds =
      this.role === "bass" ? 0.2 : this.role === "chords" ? 0.5 : 0.14;
    const endAudioTime = scheduledAudioTime + duration;
    const tailAudioTime = endAudioTime + releaseSeconds;
    if (
      !this.events.canSchedule(scheduledAudioTime, endAudioTime, tailAudioTime)
    ) {
      return;
    }

    if (this.role === "bass") {
      const reservation = this.budget.admit(scheduledAudioTime, [
        tailAudioTime,
      ]);
      if (reservation.admittedCount === 0) return;
      const synth = createReservedInstrument(reservation, () =>
        new MonoSynth({
          oscillator: { type: "triangle" },
          envelope: {
            attack: 0.005,
            decay: 0.18,
            sustain: 0.35,
            release: 0.12,
          },
          filterEnvelope: {
            attack: 0.005,
            decay: 0.15,
            sustain: 0.2,
            release: 0.2,
            baseFrequency: 90,
            octaves: 2.4,
          },
        }).connect(this.strip.filter),
      );
      this.events.schedule(
        createInstrumentEventHandle(
          synth,
          scheduledAudioTime,
          endAudioTime,
          tailAudioTime,
          (time) => synth.triggerRelease(time),
          () => reservation.release(),
        ),
        () =>
          synth.triggerAttackRelease(
            notes[0] ?? midiToFrequency(48),
            duration,
            scheduledAudioTime,
            occurrence.velocity,
          ),
      );
      return;
    }

    const reservation = this.budget.admit(
      scheduledAudioTime,
      notes.map(() => tailAudioTime),
    );
    const admittedNotes = notes.slice(0, reservation.admittedCount);
    if (admittedNotes.length === 0) return;
    const synth = createReservedInstrument(reservation, () => {
      const created = new PolySynth(Synth, {
        oscillator: { type: this.role === "melody" ? "triangle" : "sine" },
        envelope: {
          attack: this.role === "chords" ? 0.05 : 0.005,
          decay: 0.18,
          sustain: this.role === "chords" ? 0.5 : 0.2,
          release: this.role === "chords" ? 0.5 : 0.14,
        },
      });
      created.maxPolyphony = admittedNotes.length;
      return created.connect(this.strip.filter);
    });
    this.events.schedule(
      createInstrumentEventHandle(
        synth,
        scheduledAudioTime,
        endAudioTime,
        tailAudioTime,
        (time) => synth.releaseAll(time),
        () => reservation.release(),
      ),
      () =>
        synth.triggerAttackRelease(
          admittedNotes,
          duration,
          scheduledAudioTime,
          occurrence.velocity,
        ),
    );
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.events.releaseAll(scheduledAudioTime);
    this.budget.clear();
  }

  cancelScheduledAfter(rawAudioTime: number): void {
    this.events.cancelScheduledAfter(rawAudioTime);
  }

  retireAfterActive(rawAudioTime: number, onDisposed?: () => void): void {
    this.events.retireAfterActive(rawAudioTime, () => {
      try {
        this.disposeResources();
      } finally {
        onDisposed?.();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.dispose();
    this.disposeResources();
  }

  private disposeResources(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.budget.clear();
    this.strip.dispose();
  }
}

class TextureFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly events = createToneEventPool(
    FALLBACK_TEXTURE_SOURCE_CAPACITY,
  );
  private readonly budget = new RuntimeVoiceSourceBudget(
    FALLBACK_TEXTURE_SOURCE_CAPACITY,
  );
  private disposed = false;

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(track, output, 0.1);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed || !this.events.acceptsTriggers) return;
    const duration = Math.max(
      0.02,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    const endAudioTime = scheduledAudioTime + duration;
    const tailAudioTime = endAudioTime + 0.35;
    if (
      !this.events.canSchedule(scheduledAudioTime, endAudioTime, tailAudioTime)
    ) {
      return;
    }
    const reservation = this.budget.admit(scheduledAudioTime, [tailAudioTime]);
    if (reservation.admittedCount === 0) return;
    const synth = createReservedInstrument(reservation, () =>
      new NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.04, decay: 0.2, sustain: 0.12, release: 0.35 },
      }).connect(this.strip.filter),
    );
    this.events.schedule(
      createInstrumentEventHandle(
        synth,
        scheduledAudioTime,
        endAudioTime,
        tailAudioTime,
        (time) => synth.triggerRelease(time),
        () => reservation.release(),
      ),
      () =>
        synth.triggerAttackRelease(
          duration,
          scheduledAudioTime,
          occurrence.velocity * 0.5,
        ),
    );
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.events.releaseAll(scheduledAudioTime);
    this.budget.clear();
  }

  cancelScheduledAfter(rawAudioTime: number): void {
    this.events.cancelScheduledAfter(rawAudioTime);
  }

  retireAfterActive(rawAudioTime: number, onDisposed?: () => void): void {
    this.events.retireAfterActive(rawAudioTime, () => {
      try {
        this.disposeResources();
      } finally {
        onDisposed?.();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.dispose();
    this.disposeResources();
  }

  private disposeResources(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.budget.clear();
    this.strip.dispose();
  }
}

interface DrumSampleState {
  asset: AudioSampleAssetDefinition;
  load: CachedSampleAsset;
  failed: boolean;
  rootMidi: number;
  budget: RuntimeVoiceSourceBudget;
}

class DrumSampleVoice implements OptionalSampleVoice {
  private readonly strip: TrackStrip;
  private readonly statesByVoice = new Map<DrumVoiceId, DrumSampleState>();
  private readonly uniqueStates = new Map<AudioSampleId, DrumSampleState>();
  private readonly events: RuntimeVoiceEventPool;
  private disposed = false;

  constructor(
    track: CompiledTrack,
    output: InputNode,
    definition: DrumSampleVoiceDefinition,
  ) {
    this.strip = new TrackStrip(track, output, 0.34);
    for (const [drumVoice, sampleId] of Object.entries(definition.samples) as [
      DrumVoiceId,
      AudioSampleId,
    ][]) {
      let state = this.uniqueStates.get(sampleId);
      if (!state) {
        const asset = getAudioSampleAsset(sampleId);
        state = {
          asset,
          load: liveSampleAssetCache.get(resolveAudioSampleUrl(asset.url)),
          failed: false,
          rootMidi: MIDI_DRUM_NOTES[drumVoice],
          budget: new RuntimeVoiceSourceBudget(6),
        };
        this.uniqueStates.set(sampleId, state);
      }
      this.statesByVoice.set(drumVoice, state);
    }
    this.events = createToneEventPool(
      Math.max(1, this.uniqueStates.size) * FALLBACK_DRUM_SOURCE_CAPACITY,
    );
  }

  canTrigger(occurrence: ScheduledOccurrence): boolean {
    if (this.disposed || !this.events.acceptsTriggers) return false;
    const state = this.stateFor(occurrence);
    return Boolean(state && this.bufferFor(state));
  }

  trigger(occurrence: ScheduledOccurrence, scheduledAudioTime: number): void {
    if (this.disposed || !this.events.acceptsTriggers) return;
    const state = this.stateFor(occurrence);
    if (!state) throw new Error("No sample is mapped for this drum voice.");
    const buffer = this.bufferFor(state);
    if (!buffer) throw new Error("The drum sample is not ready.");
    const frequency = midiToFrequency(state.rootMidi);
    const plan = planSamplePlayback(
      state.asset,
      state.rootMidi,
      state.rootMidi,
    );
    const endAudioTime =
      scheduledAudioTime +
      (plan.releaseStartSeconds === undefined
        ? plan.playbackDurationSeconds
        : plan.releaseStartSeconds);
    const tailAudioTime =
      endAudioTime +
      (plan.releaseStartSeconds === undefined ? 0 : plan.releaseSeconds);
    if (
      !this.events.canSchedule(scheduledAudioTime, endAudioTime, tailAudioTime)
    ) {
      return;
    }
    const reservation = state.budget.admit(scheduledAudioTime, [tailAudioTime]);
    if (reservation.admittedCount === 0) return;

    const sampler = createReservedInstrument(reservation, () =>
      this.createSampler(state, buffer),
    );
    this.events.schedule(
      createInstrumentEventHandle(
        sampler,
        scheduledAudioTime,
        endAudioTime,
        tailAudioTime,
        (time) => sampler.releaseAll(time),
        () => reservation.release(),
      ),
      // Short one-shots retain their authored natural tail. Long sources take
      // exactly one boundary-safe release path inside this event-owned sampler.
      () =>
        triggerPlannedOneShot(
          sampler,
          frequency,
          plan,
          scheduledAudioTime,
          occurrence.velocity,
        ),
    );
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.events.releaseAll(scheduledAudioTime);
    for (const state of this.uniqueStates.values()) {
      state.budget.clear();
    }
  }

  cancelScheduledAfter(rawAudioTime: number): void {
    this.events.cancelScheduledAfter(rawAudioTime);
  }

  retireAfterActive(rawAudioTime: number, onDisposed?: () => void): void {
    this.events.retireAfterActive(rawAudioTime, () => {
      try {
        this.disposeResources();
      } finally {
        onDisposed?.();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.dispose();
    this.disposeResources();
  }

  private disposeResources(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const state of this.uniqueStates.values()) {
      state.budget.clear();
    }
    this.uniqueStates.clear();
    this.statesByVoice.clear();
    this.strip.dispose();
  }

  private stateFor(
    occurrence: ScheduledOccurrence,
  ): DrumSampleState | undefined {
    return this.statesByVoice.get(occurrence.drumVoice ?? "perc");
  }

  private bufferFor(state: DrumSampleState): AudioBuffer | undefined {
    if (state.failed) return undefined;
    if (state.load.status === "failed") {
      state.failed = true;
      return undefined;
    }
    return state.load.buffer;
  }

  private createSampler(state: DrumSampleState, buffer: AudioBuffer): Sampler {
    let sampler: Sampler | undefined;
    try {
      sampler = new Sampler({
        urls: { [state.rootMidi]: buffer },
        attack: state.asset.attackSeconds,
        release: state.asset.releaseSeconds,
        curve: "linear",
        onerror: () => {
          state.failed = true;
        },
      });
      sampler.connect(this.strip.filter);
      return sampler;
    } catch (error) {
      sampler?.dispose();
      state.failed = true;
      throw error;
    }
  }
}

class PitchedSampleVoice implements OptionalSampleVoice {
  private readonly strip: TrackStrip;
  private readonly asset: AudioSampleAssetDefinition;
  private readonly rootMidi: number;
  private readonly load: CachedSampleAsset;
  private readonly events = createToneEventPool(16);
  private readonly budget = new RuntimeVoiceSourceBudget(16);
  private failed = false;
  private disposed = false;

  constructor(
    track: CompiledTrack,
    output: InputNode,
    definition: PitchedSampleVoiceDefinition,
  ) {
    this.asset = getAudioSampleAsset(definition.sampleId);
    this.rootMidi = definition.rootMidi;
    const headroom =
      track.role === "bass" ? 0.25 : track.role === "texture" ? 0.08 : 0.18;
    this.strip = new TrackStrip(track, output, headroom);
    this.load = liveSampleAssetCache.get(resolveAudioSampleUrl(this.asset.url));
  }

  canTrigger(): boolean {
    return (
      !this.disposed && this.events.acceptsTriggers && Boolean(this.bufferFor())
    );
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed || !this.events.acceptsTriggers) return;
    const buffer = this.bufferFor();
    if (!buffer) throw new Error("The pitched sample is not ready.");
    const midiNotes =
      occurrence.midiNotes.length > 0 ? occurrence.midiNotes : [this.rootMidi];
    const notes = midiNotes.map(midiToFrequency);
    const duration = Math.max(
      1 / AUDIO_PPQ,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    const plans = midiNotes.map((midi) =>
      planSamplePlayback(this.asset, this.rootMidi, midi, duration),
    );
    const requestedEndTimes = plans.map(
      (plan) =>
        scheduledAudioTime +
        (plan.releaseStartSeconds ?? duration) +
        plan.releaseSeconds,
    );
    const latestRequestedTail = Math.max(...requestedEndTimes);
    const latestRequestedEnd = Math.max(
      ...plans.map(
        (plan) => scheduledAudioTime + (plan.releaseStartSeconds ?? duration),
      ),
    );
    if (
      !this.events.canSchedule(
        scheduledAudioTime,
        latestRequestedEnd,
        latestRequestedTail,
      )
    ) {
      return;
    }
    const reservation = this.budget.admit(
      scheduledAudioTime,
      requestedEndTimes,
    );
    const admittedIndices = requestedEndTimes
      .map((_, index) => index)
      .slice(0, reservation.admittedCount);
    if (admittedIndices.length === 0) return;
    const admittedNotes = admittedIndices.map((index) => notes[index]);
    const durations = admittedIndices.map(
      (index) => plans[index].releaseStartSeconds ?? duration,
    );
    const endAudioTime = Math.max(
      ...durations.map(
        (admittedDuration) => scheduledAudioTime + admittedDuration,
      ),
    );
    const tailAudioTime = Math.max(
      ...admittedIndices.map((index) => requestedEndTimes[index]),
    );
    const sampler = createReservedInstrument(reservation, () =>
      this.createSampler(buffer),
    );
    this.events.schedule(
      createInstrumentEventHandle(
        sampler,
        scheduledAudioTime,
        endAudioTime,
        tailAudioTime,
        (time) => sampler.releaseAll(time),
        () => reservation.release(),
      ),
      () =>
        sampler.triggerAttackRelease(
          admittedNotes,
          durations,
          scheduledAudioTime,
          occurrence.velocity,
        ),
    );
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.events.releaseAll(scheduledAudioTime);
    this.budget.clear();
  }

  cancelScheduledAfter(rawAudioTime: number): void {
    this.events.cancelScheduledAfter(rawAudioTime);
  }

  retireAfterActive(rawAudioTime: number, onDisposed?: () => void): void {
    this.events.retireAfterActive(rawAudioTime, () => {
      try {
        this.disposeResources();
      } finally {
        onDisposed?.();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.events.dispose();
    this.disposeResources();
  }

  private disposeResources(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.budget.clear();
    this.strip.dispose();
  }

  private bufferFor(): AudioBuffer | undefined {
    if (this.failed) return undefined;
    if (this.load.status === "failed") {
      this.failed = true;
      return undefined;
    }
    return this.load.buffer;
  }

  private createSampler(buffer: AudioBuffer): Sampler {
    let sampler: Sampler | undefined;
    try {
      sampler = new Sampler({
        urls: { [this.rootMidi]: buffer },
        attack: this.asset.attackSeconds,
        release: this.asset.releaseSeconds,
        curve: "linear",
        onerror: () => {
          this.failed = true;
        },
      });
      sampler.connect(this.strip.filter);
      return sampler;
    } catch (error) {
      sampler?.dispose();
      this.failed = true;
      throw error;
    }
  }
}

class SampleWithFallbackVoice implements RuntimeVoice {
  private sampleDisabled = false;
  private disposed = false;
  private retired = false;
  private retirementComplete = false;
  private readonly retirementCallbacks = new Set<() => void>();
  private fallback: RuntimeVoice | undefined;
  private readonly createFallback: () => RuntimeVoice;
  private latestTrack: CompiledTrack | undefined;

  constructor(
    private readonly sample: OptionalSampleVoice,
    fallback: RuntimeVoice | (() => RuntimeVoice),
  ) {
    if (typeof fallback === "function") {
      this.createFallback = fallback;
    } else {
      this.fallback = fallback;
      this.createFallback = () => fallback;
    }
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed || this.retired) return;
    if (!this.sampleDisabled) {
      try {
        if (this.sample.canTrigger(occurrence)) {
          this.sample.trigger(occurrence, scheduledAudioTime, bpm);
          return;
        }
      } catch {
        // A decode/runtime failure must not silence the scheduled musical event.
        this.sampleDisabled = true;
      }
    }
    this.getFallback().trigger(occurrence, scheduledAudioTime, bpm);
  }

  update(track: CompiledTrack): void {
    if (this.disposed || this.retired) return;
    this.latestTrack = track;
    this.sample.update?.(track);
    this.fallback?.update?.(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.sample.releaseAll?.(scheduledAudioTime);
    this.fallback?.releaseAll?.(scheduledAudioTime);
  }

  cancelScheduledAfter(rawAudioTime: number): void {
    if (this.disposed) return;
    this.sample.cancelScheduledAfter?.(rawAudioTime);
    this.fallback?.cancelScheduledAfter?.(rawAudioTime);
  }

  retireAfterActive(rawAudioTime: number, onDisposed?: () => void): void {
    if (!Number.isFinite(rawAudioTime) || rawAudioTime < 0) {
      throw new Error(
        "Runtime voice retirement requires a non-negative audio time.",
      );
    }
    if (onDisposed) {
      if (this.disposed || this.retirementComplete) {
        onDisposed();
        return;
      }
      this.retirementCallbacks.add(onDisposed);
    }
    if (this.retired) return;
    this.retired = true;

    const children = [this.sample, this.fallback].filter(
      (voice): voice is RuntimeVoice => voice !== undefined,
    );
    let remaining = children.length;
    if (remaining === 0) {
      this.completeRetirement();
      return;
    }
    for (const child of children) {
      let childSettled = false;
      const settleChild = () => {
        if (childSettled) return;
        childSettled = true;
        remaining -= 1;
        if (remaining === 0) this.completeRetirement();
      };
      try {
        if (child.retireAfterActive) {
          child.retireAfterActive(rawAudioTime, settleChild);
        } else {
          child.cancelScheduledAfter?.(rawAudioTime);
          settleChild();
        }
      } catch {
        // Actual sample/synth paths implement retirement. A faulty injected
        // adapter is reclaimed so it cannot strand the aggregate callback.
        try {
          child.dispose();
        } catch {
          // The wrapper has already revoked its trigger route.
        }
        settleChild();
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.sample.releaseAll?.();
    this.fallback?.releaseAll?.();
    this.disposed = true;
    this.retired = true;
    this.sample.dispose();
    this.fallback?.dispose();
    this.fallback = undefined;
    this.completeRetirement();
  }

  private getFallback(): RuntimeVoice {
    if (!this.fallback) {
      this.fallback = this.createFallback();
      if (this.latestTrack) this.fallback.update?.(this.latestTrack);
    }
    return this.fallback;
  }

  private completeRetirement(): void {
    if (this.retirementComplete) return;
    this.retirementComplete = true;
    const callbacks = [...this.retirementCallbacks];
    this.retirementCallbacks.clear();
    for (const callback of callbacks) {
      try {
        callback();
      } catch {
        // One owner callback cannot prevent the remaining cleanup signals.
      }
    }
  }
}

/** Exported for focused routing tests without constructing a Web Audio context. */
export function createSampleWithFallbackVoice(
  sample: OptionalSampleVoice,
  fallback: RuntimeVoice | (() => RuntimeVoice),
): RuntimeVoice {
  return new SampleWithFallbackVoice(sample, fallback);
}

/**
 * Offline export schedules the complete sequence in one synchronous pass and
 * never performs a live edit. Keep one bounded instrument set per track there;
 * event-owned live instruments would otherwise allocate an entire long render
 * up front before the OfflineAudioContext can advance and reclaim any tail.
 */
class OfflineBeatFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly kick = new MembraneSynth({
    pitchDecay: 0.025,
    octaves: 5,
    envelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.08 },
  });
  private readonly noise = new NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.03 },
  });
  private readonly metal = new MetalSynth({
    envelope: { attack: 0.001, decay: 0.055, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 16,
    resonance: 4_800,
    octaves: 1.2,
  });
  private disposed = false;

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(track, output, 0.42);
    this.kick.connect(this.strip.filter);
    this.noise.connect(this.strip.filter);
    this.metal.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    const duration = Math.max(
      0.015,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    if (occurrence.drumVoice === "kick") {
      this.kick.triggerAttackRelease(
        midiToFrequency(occurrence.midiNotes[0] ?? 36),
        duration,
        scheduledAudioTime,
        occurrence.velocity,
      );
      return;
    }
    if (
      occurrence.drumVoice === "snare" ||
      occurrence.drumVoice === "clap" ||
      occurrence.drumVoice === "open-hat"
    ) {
      this.noise.triggerAttackRelease(
        duration,
        scheduledAudioTime,
        occurrence.velocity * 0.72,
      );
      return;
    }
    this.metal.triggerAttackRelease(
      midiToFrequency(occurrence.midiNotes[0] ?? 50),
      duration,
      scheduledAudioTime,
      occurrence.velocity * 0.48,
    );
  }

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.kick.triggerRelease(scheduledAudioTime);
    this.noise.triggerRelease(scheduledAudioTime);
    this.metal.triggerRelease(scheduledAudioTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    this.kick.dispose();
    this.noise.dispose();
    this.metal.dispose();
    this.strip.dispose();
  }
}

class OfflinePitchedFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly synth: MonoSynth | PolySynth;
  private disposed = false;

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(
      track,
      output,
      track.role === "bass" ? 0.32 : 0.24,
    );
    if (track.role === "bass") {
      this.synth = new MonoSynth({
        oscillator: { type: "triangle" },
        envelope: {
          attack: 0.005,
          decay: 0.18,
          sustain: 0.35,
          release: 0.12,
        },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.15,
          sustain: 0.2,
          release: 0.2,
          baseFrequency: 90,
          octaves: 2.4,
        },
      });
    } else {
      this.synth = new PolySynth(Synth, {
        oscillator: { type: track.role === "melody" ? "triangle" : "sine" },
        envelope: {
          attack: track.role === "chords" ? 0.05 : 0.005,
          decay: 0.18,
          sustain: track.role === "chords" ? 0.5 : 0.2,
          release: track.role === "chords" ? 0.5 : 0.14,
        },
      });
      this.synth.maxPolyphony = 12;
    }
    this.synth.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    const notes = occurrence.midiNotes.map(midiToFrequency);
    const duration = Math.max(
      1 / AUDIO_PPQ,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    if (this.synth instanceof MonoSynth) {
      this.synth.triggerAttackRelease(
        notes[0] ?? midiToFrequency(48),
        duration,
        scheduledAudioTime,
        occurrence.velocity,
      );
      return;
    }
    this.synth.triggerAttackRelease(
      notes,
      duration,
      scheduledAudioTime,
      occurrence.velocity,
    );
  }

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    if (this.synth instanceof MonoSynth) {
      this.synth.triggerRelease(scheduledAudioTime);
    } else {
      this.synth.releaseAll(scheduledAudioTime);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    this.synth.dispose();
    this.strip.dispose();
  }
}

class OfflineTextureFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly synth = new NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.04, decay: 0.2, sustain: 0.12, release: 0.35 },
  });
  private disposed = false;

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(track, output, 0.1);
    this.synth.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    this.synth.triggerAttackRelease(
      Math.max(0.02, ticksToSeconds(occurrence.durationTicks, bpm)),
      scheduledAudioTime,
      occurrence.velocity * 0.5,
    );
  }

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.synth.triggerRelease(scheduledAudioTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    this.synth.dispose();
    this.strip.dispose();
  }
}

/** Shared, bounded fallback graph used only by finite offline rendering. */
export function createOfflineFallbackVoice(
  track: CompiledTrack,
  output: InputNode,
): RuntimeVoice {
  if (track.role === "beat") {
    return new OfflineBeatFallbackVoice(track, output);
  }
  if (track.role === "texture") {
    return new OfflineTextureFallbackVoice(track, output);
  }
  return new OfflinePitchedFallbackVoice(track, output);
}

function createOptionalSampleVoice(
  track: CompiledTrack,
  output: InputNode,
  definition: SampleVoiceDefinition,
): OptionalSampleVoice {
  return definition.kind === "drum-kit"
    ? new DrumSampleVoice(track, output, definition)
    : new PitchedSampleVoice(track, output, definition);
}

/** Synthesized fallback coverage for every MVP role and failed sample asset. */
export function createFallbackVoice(
  track: CompiledTrack,
  output: InputNode,
): RuntimeVoice {
  if (track.role === "beat") return new BeatFallbackVoice(track, output);
  if (track.role === "texture") return new TextureFallbackVoice(track, output);
  return new PitchedFallbackVoice(track, output);
}

/**
 * Live playback loads only the active track preset after audio unlock. While
 * loading, or after any fetch/decode/trigger failure, the synthesized voice is
 * used for the same event. Offline WAV rendering intentionally remains synth-only.
 */
export function createLiveVoice(
  track: CompiledTrack,
  output: InputNode,
): RuntimeVoice {
  const definition = getSampleVoicePreset(track.soundPresetId);
  if (!definition) return createFallbackVoice(track, output);
  try {
    return createSampleWithFallbackVoice(
      createOptionalSampleVoice(track, output, definition),
      () => createFallbackVoice(track, output),
    );
  } catch {
    return createFallbackVoice(track, output);
  }
}
