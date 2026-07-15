import type { CompiledTrack, ScheduledOccurrence } from "./types";
import type { RuntimeVoice } from "./VoiceFactory";

export type RuntimeVoiceFactory = (track: CompiledTrack) => RuntimeVoice;

/**
 * One transport epoch of voices behind an isolated output gate. Live pattern
 * edits keep this generation and gate intact; only explicit pause/stop or a
 * health failure retires it.
 */
export interface RuntimeVoiceGenerationHandle {
  readonly createVoice: RuntimeVoiceFactory;
  fadeOut(scheduledAudioTime: number, fadeSeconds: number): void;
  dispose(): void;
}

export type RuntimeVoiceGenerationFactory = () => RuntimeVoiceGenerationHandle;

export interface RuntimeVoiceRetirement {
  readonly scheduledAudioTime: number;
  readonly fadeSeconds: number;
}

export interface RuntimeVoiceReconcileResult {
  /** Live reconciliation never rotates the transport epoch's output gate. */
  readonly rotatedGeneration: false;
  readonly naturallyRetiredVoiceCount: number;
}

export interface RuntimeVoiceRetirementTimer {
  nowMilliseconds(): number;
  setTimeout(callback: () => void, delayMilliseconds: number): number;
  clearTimeout(timerId: number): void;
}

export interface RuntimeVoiceRegistryOptions {
  readonly retirementTimer?: RuntimeVoiceRetirementTimer;
}

/** Explicit transport generations awaiting their short output-gate fade. */
export const MAX_RETIRED_VOICE_GENERATIONS = 4;

/** Let the final gain automation cross a Web Audio render quantum. */
export const VOICE_RETIREMENT_DISPOSAL_GRACE_MILLISECONDS = 20;

interface RuntimeVoiceEntry {
  readonly compatibilityKey: string;
  readonly parameterKey: string;
  readonly voice: RuntimeVoice;
}

interface ActiveGeneration {
  readonly generation: RuntimeVoiceGenerationHandle;
  /** Removed/replaced tracks whose already-started notes are finishing. */
  readonly naturallyRetiringVoices: Set<RuntimeVoice>;
}

interface RetiredGeneration {
  readonly voices: Set<RuntimeVoice>;
  readonly generation: RuntimeVoiceGenerationHandle;
  readonly cleanupAtMilliseconds: number;
}

const defaultRetirementTimer: RuntimeVoiceRetirementTimer = {
  nowMilliseconds: () => globalThis.performance.now(),
  setTimeout: (callback, delayMilliseconds) =>
    globalThis.setTimeout(callback, delayMilliseconds),
  clearTimeout: (timerId) => globalThis.clearTimeout(timerId),
};

function compatibilityKey(track: CompiledTrack): string {
  return `${track.role}:${track.soundPresetId}`;
}

function parameterKey(track: CompiledTrack): string {
  return `${track.level}:${track.pan}:${track.filter}:${track.pitchShiftSemitones ?? 0}`;
}

function assertAudioTime(audioTime: number): void {
  if (!Number.isFinite(audioTime) || audioTime < 0) {
    throw new Error(
      "Runtime voice reconciliation requires a non-negative audio time.",
    );
  }
}

function assertRetirement(retirement: RuntimeVoiceRetirement): void {
  assertAudioTime(retirement.scheduledAudioTime);
  if (!Number.isFinite(retirement.fadeSeconds) || retirement.fadeSeconds < 0) {
    throw new Error("Voice retirement requires a non-negative fade duration.");
  }
}

function assertUniqueTrackIds(tracks: readonly CompiledTrack[]): void {
  const ids = new Set<string>();
  for (const track of tracks) {
    if (ids.has(track.id)) {
      throw new Error(`Duplicate runtime voice track ID: ${track.id}`);
    }
    ids.add(track.id);
  }
}

/**
 * Stable-ID voice ownership for a live groovebox.
 *
 * Pattern edits retract per-event attacks which are still ahead of the raw
 * clock, then reuse compatible voices. Removed or incompatible voices stop
 * accepting attacks but keep already-started notes alive through their natural
 * tails. The output gate is never faded for a live edit.
 */
export class RuntimeVoiceRegistry {
  private entries = new Map<string, RuntimeVoiceEntry>();
  private activeGeneration?: ActiveGeneration;
  private readonly retiredGenerations: RetiredGeneration[] = [];
  private readonly retirementTimer: RuntimeVoiceRetirementTimer;
  private cleanupTimerId?: number;
  private disposed = false;

  constructor(options: RuntimeVoiceRegistryOptions = {}) {
    this.retirementTimer = options.retirementTimer ?? defaultRetirementTimer;
  }

  /** Unmanaged compatibility path retained for isolated unit/offline callers. */
  reconcile(
    tracks: readonly CompiledTrack[],
    createVoice: RuntimeVoiceFactory,
  ): RuntimeVoiceReconcileResult;
  /** Production path: reuse the current gated epoch at the supplied raw time. */
  reconcile(
    tracks: readonly CompiledTrack[],
    createGeneration: RuntimeVoiceGenerationFactory,
    rawAudioTime: number,
  ): RuntimeVoiceReconcileResult;
  reconcile(
    tracks: readonly CompiledTrack[],
    factory: RuntimeVoiceFactory | RuntimeVoiceGenerationFactory,
    rawAudioTime?: number,
  ): RuntimeVoiceReconcileResult {
    this.assertActive();
    assertUniqueTrackIds(tracks);
    if (rawAudioTime === undefined) {
      return this.reconcileUnmanaged(tracks, factory as RuntimeVoiceFactory);
    }
    assertAudioTime(rawAudioTime);
    return this.reconcileManaged(
      tracks,
      factory as RuntimeVoiceGenerationFactory,
      rawAudioTime,
    );
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    this.entries
      .get(occurrence.trackId)
      ?.voice.trigger(occurrence, scheduledAudioTime, bpm);
  }

  /** Retract only voice attacks still strictly ahead of the raw playhead. */
  cancelScheduledAfter(rawAudioTime: number): void {
    if (this.disposed) return;
    assertAudioTime(rawAudioTime);
    for (const entry of this.entries.values()) {
      entry.voice.cancelScheduledAfter?.(rawAudioTime);
    }
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    for (const entry of this.entries.values()) {
      entry.voice.releaseAll?.(scheduledAudioTime);
    }
    for (const voice of this.activeGeneration?.naturallyRetiringVoices ?? []) {
      voice.releaseAll?.(scheduledAudioTime);
    }
  }

  /**
   * Explicit transport shutdown. Unlike a pattern edit, pause/stop is allowed
   * to release active notes, and the epoch gate guarantees fail-silent cleanup.
   */
  retire(retirement: RuntimeVoiceRetirement): void {
    this.assertActive();
    assertRetirement(retirement);
    const active = this.activeGeneration;
    if (!active) return;

    const voices = new Set<RuntimeVoice>([
      ...[...this.entries.values()].map(({ voice }) => voice),
      ...active.naturallyRetiringVoices,
    ]);
    this.entries = new Map();
    this.activeGeneration = undefined;

    for (const voice of voices) {
      try {
        voice.releaseAll?.(retirement.scheduledAudioTime);
      } catch {
        // The generation gate owns explicit transport silence.
      }
    }

    try {
      active.generation.fadeOut(
        retirement.scheduledAudioTime,
        retirement.fadeSeconds,
      );
    } catch {
      this.forceMuteAndDispose(
        voices,
        active.generation,
        retirement.scheduledAudioTime,
      );
      return;
    }

    while (this.retiredGenerations.length >= MAX_RETIRED_VOICE_GENERATIONS) {
      const oldest = this.retiredGenerations.shift();
      if (!oldest) break;
      this.forceMuteAndDispose(
        oldest.voices,
        oldest.generation,
        retirement.scheduledAudioTime,
      );
    }

    this.retiredGenerations.push({
      voices,
      generation: active.generation,
      cleanupAtMilliseconds:
        this.retirementTimer.nowMilliseconds() +
        retirement.fadeSeconds * 1_000 +
        VOICE_RETIREMENT_DISPOSAL_GRACE_MILLISECONDS,
    });
    this.scheduleRetirementCleanup();
  }

  clear(scheduledAudioTime = 0): void {
    if (this.disposed) return;
    assertAudioTime(scheduledAudioTime);
    this.cancelCleanupTimer();

    const active = this.activeGeneration;
    if (active) {
      this.forceMuteAndDispose(
        new Set([
          ...[...this.entries.values()].map(({ voice }) => voice),
          ...active.naturallyRetiringVoices,
        ]),
        active.generation,
        scheduledAudioTime,
      );
    } else {
      this.disposeEntries(this.entries);
    }
    this.entries = new Map();
    this.activeGeneration = undefined;

    for (const retired of this.retiredGenerations.splice(0)) {
      this.forceMuteAndDispose(
        retired.voices,
        retired.generation,
        scheduledAudioTime,
      );
    }
  }

  dispose(scheduledAudioTime = 0): void {
    if (this.disposed) return;
    this.clear(scheduledAudioTime);
    this.disposed = true;
  }

  get size(): number {
    return this.entries.size;
  }

  get naturallyRetiringVoiceCount(): number {
    return this.activeGeneration?.naturallyRetiringVoices.size ?? 0;
  }

  get retiringGenerationCount(): number {
    return this.retiredGenerations.length;
  }

  get hasPendingRetirementCleanup(): boolean {
    return this.cleanupTimerId !== undefined;
  }

  private reconcileManaged(
    tracks: readonly CompiledTrack[],
    createGeneration: RuntimeVoiceGenerationFactory,
    rawAudioTime: number,
  ): RuntimeVoiceReconcileResult {
    if (!this.activeGeneration && this.entries.size > 0) {
      throw new Error(
        "Clear unmanaged runtime voices before adopting gated generations.",
      );
    }
    if (!this.activeGeneration && tracks.length > 0) {
      this.createManagedGeneration(tracks, createGeneration, rawAudioTime);
      return {
        rotatedGeneration: false,
        naturallyRetiredVoiceCount: 0,
      };
    }
    const active = this.activeGeneration;
    if (!active) {
      return {
        rotatedGeneration: false,
        naturallyRetiredVoiceCount: 0,
      };
    }

    const previous = new Map(this.entries);
    const next = new Map<string, RuntimeVoiceEntry>();
    const createdVoices: RuntimeVoice[] = [];
    const replacedVoices: RuntimeVoice[] = [];

    try {
      for (const track of tracks) {
        const existing = previous.get(track.id);
        const nextCompatibilityKey = compatibilityKey(track);
        const nextParameterKey = parameterKey(track);
        if (existing?.compatibilityKey === nextCompatibilityKey) {
          if (existing.parameterKey !== nextParameterKey) {
            existing.voice.update?.(track);
          }
          next.set(track.id, {
            ...existing,
            parameterKey: nextParameterKey,
          });
          previous.delete(track.id);
          continue;
        }

        const voice = active.generation.createVoice(track);
        createdVoices.push(voice);
        next.set(track.id, {
          compatibilityKey: nextCompatibilityKey,
          parameterKey: nextParameterKey,
          voice,
        });
        if (existing) {
          replacedVoices.push(existing.voice);
          previous.delete(track.id);
        }
      }
    } catch (error) {
      this.disposeVoices(createdVoices);
      throw error;
    }

    replacedVoices.push(...[...previous.values()].map(({ voice }) => voice));
    this.entries = next;
    for (const voice of replacedVoices) {
      this.retireVoiceAfterActive(active, voice, rawAudioTime);
    }

    return {
      rotatedGeneration: false,
      naturallyRetiredVoiceCount: replacedVoices.length,
    };
  }

  private createManagedGeneration(
    tracks: readonly CompiledTrack[],
    createGeneration: RuntimeVoiceGenerationFactory,
    rawAudioTime: number,
  ): void {
    const generation = createGeneration();
    const entries = new Map<string, RuntimeVoiceEntry>();
    try {
      for (const track of tracks) {
        entries.set(track.id, {
          compatibilityKey: compatibilityKey(track),
          parameterKey: parameterKey(track),
          voice: generation.createVoice(track),
        });
      }
    } catch (error) {
      this.forceMuteAndDispose(
        new Set([...entries.values()].map(({ voice }) => voice)),
        generation,
        rawAudioTime,
      );
      throw error;
    }
    this.entries = entries;
    this.activeGeneration = {
      generation,
      naturallyRetiringVoices: new Set(),
    };
  }

  private retireVoiceAfterActive(
    active: ActiveGeneration,
    voice: RuntimeVoice,
    rawAudioTime: number,
  ): void {
    active.naturallyRetiringVoices.add(voice);
    const onDisposed = () => {
      active.naturallyRetiringVoices.delete(voice);
    };
    try {
      if (voice.retireAfterActive) {
        voice.retireAfterActive(rawAudioTime, onDisposed);
      } else {
        // Custom/test voices predating cancellable event ownership have no
        // safe tail boundary; dispose them instead of leaking stale attacks.
        voice.dispose();
        onDisposed();
      }
    } catch {
      try {
        voice.dispose();
      } finally {
        onDisposed();
      }
    }
  }

  private reconcileUnmanaged(
    tracks: readonly CompiledTrack[],
    createVoice: RuntimeVoiceFactory,
  ): RuntimeVoiceReconcileResult {
    if (this.activeGeneration) {
      throw new Error(
        "Use gated reconciliation while a managed voice generation is active.",
      );
    }
    const previous = new Map(this.entries);
    const next = new Map<string, RuntimeVoiceEntry>();

    for (const track of tracks) {
      const existing = previous.get(track.id);
      const key = compatibilityKey(track);
      if (existing?.compatibilityKey === key) {
        const nextParameterKey = parameterKey(track);
        if (existing.parameterKey !== nextParameterKey) {
          existing.voice.update?.(track);
        }
        next.set(track.id, { ...existing, parameterKey: nextParameterKey });
        previous.delete(track.id);
        continue;
      }
      if (existing) {
        existing.voice.dispose();
        previous.delete(track.id);
      }
      next.set(track.id, {
        compatibilityKey: key,
        parameterKey: parameterKey(track),
        voice: createVoice(track),
      });
    }

    this.disposeEntries(previous);
    this.entries = next;
    return { rotatedGeneration: false, naturallyRetiredVoiceCount: 0 };
  }

  private scheduleRetirementCleanup(): void {
    this.cancelCleanupTimer();
    const nextCleanup = this.retiredGenerations.reduce<
      RetiredGeneration | undefined
    >(
      (earliest, retired) =>
        !earliest ||
        retired.cleanupAtMilliseconds < earliest.cleanupAtMilliseconds
          ? retired
          : earliest,
      undefined,
    );
    if (!nextCleanup) return;

    const delayMilliseconds = Math.max(
      0,
      nextCleanup.cleanupAtMilliseconds -
        this.retirementTimer.nowMilliseconds(),
    );
    this.cleanupTimerId = this.retirementTimer.setTimeout(() => {
      this.cleanupTimerId = undefined;
      this.disposeExpiredRetirements();
      this.scheduleRetirementCleanup();
    }, delayMilliseconds);
  }

  private disposeExpiredRetirements(): void {
    const now = this.retirementTimer.nowMilliseconds();
    for (
      let index = this.retiredGenerations.length - 1;
      index >= 0;
      index -= 1
    ) {
      const retired = this.retiredGenerations[index];
      if (retired.cleanupAtMilliseconds > now) continue;
      this.retiredGenerations.splice(index, 1);
      this.disposeVoices(retired.voices);
      this.disposeGeneration(retired.generation);
    }
  }

  private forceMuteAndDispose(
    voices: Iterable<RuntimeVoice>,
    generation: RuntimeVoiceGenerationHandle,
    scheduledAudioTime: number,
  ): void {
    try {
      generation.fadeOut(Math.max(0, scheduledAudioTime), 0);
    } catch {
      // Continue disposal even if the adapter cannot automate its gate.
    }
    this.disposeVoices(voices);
    this.disposeGeneration(generation);
  }

  private disposeEntries(entries: Map<string, RuntimeVoiceEntry>): void {
    this.disposeVoices([...entries.values()].map(({ voice }) => voice));
    entries.clear();
  }

  private disposeVoices(voices: Iterable<RuntimeVoice>): void {
    for (const voice of voices) {
      try {
        voice.dispose();
      } catch {
        // One faulty voice must not leak the rest of an owned generation.
      }
    }
  }

  private disposeGeneration(generation: RuntimeVoiceGenerationHandle): void {
    try {
      generation.dispose();
    } catch {
      // The registry has already dropped all references to the generation.
    }
  }

  private cancelCleanupTimer(): void {
    if (this.cleanupTimerId === undefined) return;
    this.retirementTimer.clearTimeout(this.cleanupTimerId);
    this.cleanupTimerId = undefined;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("A disposed voice registry cannot be reused.");
    }
  }
}
