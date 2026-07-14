import { describe, expect, it, vi } from "vitest";

import {
  MAX_RETIRED_VOICE_GENERATIONS,
  RuntimeVoiceRegistry,
  VOICE_RETIREMENT_DISPOSAL_GRACE_MILLISECONDS,
  type RuntimeVoiceGenerationFactory,
  type RuntimeVoiceRetirementTimer,
} from "../src/audio/RuntimeVoiceRegistry";
import { compileLiveSchedule } from "../src/audio/CompositionCompiler";
import { createLiveScheduleKey } from "../src/audio/LiveScheduleKey";
import { RuntimeValueGate } from "../src/audio/RuntimeValueGate";
import type { RuntimeVoice } from "../src/audio/VoiceFactory";
import type { CompiledTrack, ScheduledOccurrence } from "../src/audio/types";
import { createStarterComposition } from "../src/domain/composition/starter";
import { generateCompleteSystem } from "../src/domain/generation";

function makeTrack(index: number, preset = "stellar-kick"): CompiledTrack {
  return {
    id: `track:${index}`,
    name: `Track ${index}`,
    role: "beat",
    sourceKind: "planet",
    soundPresetId: preset,
    level: 0.6,
    pan: 0,
    filter: 0.8,
  };
}

function makeOccurrence(trackId: string): ScheduledOccurrence {
  return {
    occurrenceId: `${trackId}:occurrence`,
    eventId: `${trackId}:event`,
    trackId,
    role: "beat",
    sourceKind: "planet",
    startTick: 0,
    durationTicks: 120,
    velocity: 0.8,
    probability: 1,
    loopIndex: 0,
    midiNotes: [36],
    drumVoice: "kick",
  };
}

class ManualRetirementTimer implements RuntimeVoiceRetirementTimer {
  private now = 0;
  private nextId = 1;
  private readonly callbacks = new Map<
    number,
    { readonly callback: () => void; readonly dueAt: number }
  >();

  nowMilliseconds(): number {
    return this.now;
  }

  setTimeout(callback: () => void, delayMilliseconds: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, {
      callback,
      dueAt: this.now + Math.max(0, delayMilliseconds),
    });
    return id;
  }

  clearTimeout(timerId: number): void {
    this.callbacks.delete(timerId);
  }

  advanceWithoutRunning(milliseconds: number): void {
    this.now += milliseconds;
  }

  runDue(): void {
    while (true) {
      const due = [...this.callbacks.entries()]
        .filter(([, entry]) => entry.dueAt <= this.now)
        .sort(([, left], [, right]) => left.dueAt - right.dueAt)[0];
      if (!due) return;
      const [id, entry] = due;
      this.callbacks.delete(id);
      entry.callback();
    }
  }

  advance(milliseconds: number): void {
    this.advanceWithoutRunning(milliseconds);
    this.runDue();
  }

  get pendingCount(): number {
    return this.callbacks.size;
  }
}

interface ManagedVoiceRecord {
  readonly track: CompiledTrack;
  readonly trigger: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly releaseAll: ReturnType<typeof vi.fn>;
  readonly cancelScheduledAfter: ReturnType<typeof vi.fn>;
  readonly retireAfterActive: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  completeRetirement(): void;
}

interface ManagedGenerationRecord {
  readonly voices: ManagedVoiceRecord[];
  readonly fadeOut: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
}

function createGenerationFactory(
  records: ManagedGenerationRecord[],
  lifecycle?: string[],
): RuntimeVoiceGenerationFactory {
  return () => {
    const generationIndex = records.length;
    const voices: ManagedVoiceRecord[] = [];
    const fadeOut = vi.fn((scheduledAudioTime: number, fadeSeconds: number) => {
      lifecycle?.push(
        `generation:${generationIndex}:fade:${scheduledAudioTime}:${fadeSeconds}`,
      );
    });
    const dispose = vi.fn(() => {
      lifecycle?.push(`generation:${generationIndex}:dispose`);
    });
    records.push({ voices, fadeOut, dispose });
    return {
      createVoice: (track: CompiledTrack): RuntimeVoice => {
        const trigger = vi.fn();
        const update = vi.fn();
        const releaseAll = vi.fn();
        const cancelScheduledAfter = vi.fn();
        const voiceIndex = voices.length;
        const voiceDispose = vi.fn(() => {
          lifecycle?.push(
            `generation:${generationIndex}:voice:${voiceIndex}:dispose`,
          );
        });
        let retirementCallback: (() => void) | undefined;
        const retireAfterActive = vi.fn(
          (_rawAudioTime: number, onDisposed?: () => void) => {
            retirementCallback = onDisposed;
          },
        );
        const record: ManagedVoiceRecord = {
          track,
          trigger,
          update,
          releaseAll,
          cancelScheduledAfter,
          retireAfterActive,
          dispose: voiceDispose,
          completeRetirement: () => {
            voiceDispose();
            retirementCallback?.();
            retirementCallback = undefined;
          },
        };
        voices.push(record);
        return {
          trigger,
          update,
          releaseAll,
          cancelScheduledAfter,
          retireAfterActive,
          dispose: voiceDispose,
        };
      },
      fadeOut,
      dispose,
    };
  };
}

describe("runtime voice reconciliation", () => {
  it("only rebuilds the live schedule for captured musical edits", () => {
    const original = createStarterComposition("schedule-key-stress");
    const expected = createLiveScheduleKey(
      original,
      compileLiveSchedule(original),
    );

    for (let revision = 0; revision < 2_000; revision += 1) {
      const edited = structuredClone(original);
      edited.mix.level = (revision % 100) / 100;
      edited.planets[0].mix.level = (revision % 80) / 100;
      expect(createLiveScheduleKey(edited, compileLiveSchedule(edited))).toBe(
        expected,
      );
    }

    const tempoEdit = structuredClone(original);
    tempoEdit.bpm += 1;
    expect(
      createLiveScheduleKey(tempoEdit, compileLiveSchedule(tempoEdit)),
    ).toBe(expected);

    const presetEdit = structuredClone(original);
    presetEdit.planets[0].soundPresetId = "deep-impact";
    expect(
      createLiveScheduleKey(presetEdit, compileLiveSchedule(presetEdit)),
    ).not.toBe(expected);

    const patternEdit = structuredClone(original);
    patternEdit.planets[0].pattern.events[0].velocity = 0.123;
    expect(
      createLiveScheduleKey(patternEdit, compileLiveSchedule(patternEdit)),
    ).not.toBe(expected);

    const expressionOriginal = generateCompleteSystem(
      "schedule-key-expression",
    );
    const expressionExpected = createLiveScheduleKey(
      expressionOriginal,
      compileLiveSchedule(expressionOriginal),
    );
    const expressionEdit = structuredClone(expressionOriginal);
    const chordPlanet = expressionEdit.planets.find(
      (planet) => planet.expression.kind === "chords",
    );
    if (!chordPlanet || chordPlanet.expression.kind !== "chords") {
      throw new Error("Starter composition must include a chord planet.");
    }
    chordPlanet.expression.chordComplexity =
      chordPlanet.expression.chordComplexity < 0.5 ? 1 : 0;
    expect(
      createLiveScheduleKey(
        expressionEdit,
        compileLiveSchedule(expressionEdit),
      ),
    ).not.toBe(expressionExpected);
  });

  it("does not add redundant master ramps for macro-only updates", () => {
    const gate = new RuntimeValueGate(0);
    const ramp = vi.fn();
    const starter = createStarterComposition("master-ramp-stress");

    for (let revision = 0; revision < 2_000; revision += 1) {
      const composition = structuredClone(starter);
      composition.macros.density = (revision % 101) / 100;
      composition.macros.energy = ((revision * 3) % 101) / 100;
      const target = composition.mix.level * 0.72;
      if (gate.shouldApply(target)) ramp(target);
    }
    expect(ramp).toHaveBeenCalledOnce();

    gate.reset(0);
    if (gate.shouldApply(starter.mix.level * 0.72)) {
      ramp(starter.mix.level * 0.72);
    }
    expect(ramp).toHaveBeenCalledTimes(2);
  });

  it("reuses decoded/runtime voices across thousands of schedule rebuilds", () => {
    const registry = new RuntimeVoiceRegistry();
    const created: {
      voice: RuntimeVoice;
      dispose: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    }[] = [];
    const createVoice = vi.fn(() => {
      const dispose = vi.fn();
      const update = vi.fn();
      const voice: RuntimeVoice = {
        trigger: vi.fn(),
        update,
        releaseAll: vi.fn(),
        dispose,
      };
      created.push({ voice, dispose, update });
      return voice;
    });
    const tracks = Array.from({ length: 32 }, (_, index) => makeTrack(index));

    for (let rebuild = 0; rebuild < 2_000; rebuild += 1) {
      registry.reconcile(
        tracks.map((track) => ({
          ...track,
          level: (rebuild % 100) / 100,
        })),
        createVoice,
      );
      expect(registry.size).toBe(32);
    }

    expect(createVoice).toHaveBeenCalledTimes(32);
    expect(
      created.every(({ dispose }) => dispose.mock.calls.length === 0),
    ).toBe(true);
    expect(
      created.every(({ update }) => update.mock.calls.length === 1_999),
    ).toBe(true);

    const replacementTracks = tracks.map((track, index) =>
      index === 0 ? makeTrack(index, "deep-impact") : track,
    );
    registry.reconcile(replacementTracks, createVoice);
    expect(createVoice).toHaveBeenCalledTimes(33);
    expect(created[0].dispose).toHaveBeenCalledOnce();

    registry.dispose();
    registry.dispose();
    expect(registry.size).toBe(0);
    expect(
      created.every(({ dispose }) => dispose.mock.calls.length === 1),
    ).toBe(true);
  });
});

describe("runtime voice generation retirement", () => {
  it("switches trigger routing synchronously and disposes only after fade plus render grace", () => {
    const timer = new ManualRetirementTimer();
    const registry = new RuntimeVoiceRegistry({ retirementTimer: timer });
    const generations: ManagedGenerationRecord[] = [];
    const createGeneration = createGenerationFactory(generations);
    const retirement = { scheduledAudioTime: 2, fadeSeconds: 0.015 };

    registry.reconcile([makeTrack(0)], createGeneration, 2);
    const firstVoice = generations[0].voices[0];
    registry.trigger(makeOccurrence("track:0"), 2.1, 120);
    expect(firstVoice.trigger).toHaveBeenCalledOnce();

    registry.retire(retirement);

    expect(registry.size).toBe(0);
    expect(registry.retiringGenerationCount).toBe(1);
    expect(registry.hasPendingRetirementCleanup).toBe(true);
    expect(timer.pendingCount).toBe(1);
    expect(firstVoice.releaseAll).toHaveBeenCalledWith(2);
    expect(generations[0].fadeOut).toHaveBeenCalledWith(2, 0.015);
    expect(firstVoice.dispose).not.toHaveBeenCalled();
    expect(generations[0].dispose).not.toHaveBeenCalled();

    registry.trigger(makeOccurrence("track:0"), 2.11, 120);
    expect(firstVoice.trigger).toHaveBeenCalledOnce();

    registry.reconcile([makeTrack(0)], createGeneration, 2.001);
    const secondVoice = generations[1].voices[0];
    registry.trigger(makeOccurrence("track:0"), 2.12, 120);
    expect(secondVoice.trigger).toHaveBeenCalledOnce();

    timer.advance(15);
    expect(firstVoice.dispose).not.toHaveBeenCalled();
    timer.advance(VOICE_RETIREMENT_DISPOSAL_GRACE_MILLISECONDS - 1);
    expect(firstVoice.dispose).not.toHaveBeenCalled();

    // Even if the wall callback is delayed, the synchronous fade automation
    // has already reached and remains at zero behind the old generation gate.
    timer.advanceWithoutRunning(1_000);
    expect(firstVoice.dispose).not.toHaveBeenCalled();
    expect(generations[0].fadeOut).toHaveBeenCalledTimes(1);
    timer.runDue();

    expect(firstVoice.dispose).toHaveBeenCalledOnce();
    expect(generations[0].dispose).toHaveBeenCalledOnce();
    expect(registry.retiringGenerationCount).toBe(0);
    expect(registry.hasPendingRetirementCleanup).toBe(false);
    registry.dispose(3);
  });

  it("replaces one incompatible voice without fading the gate or cutting active notes", () => {
    const timer = new ManualRetirementTimer();
    const registry = new RuntimeVoiceRegistry({ retirementTimer: timer });
    const generations: ManagedGenerationRecord[] = [];
    const createGeneration = createGenerationFactory(generations);

    registry.reconcile([makeTrack(0), makeTrack(1)], createGeneration, 4);
    const original = generations[0];

    const compatible = registry.reconcile(
      [makeTrack(0), { ...makeTrack(1), level: 0.31 }],
      createGeneration,
      4.1,
    );
    expect(compatible.rotatedGeneration).toBe(false);
    expect(generations).toHaveLength(1);
    expect(original.voices[1].update).toHaveBeenCalledOnce();

    registry.cancelScheduledAfter(4.2);
    expect(
      original.voices.every(({ cancelScheduledAfter }) =>
        cancelScheduledAfter.mock.calls.some(([time]) => time === 4.2),
      ),
    ).toBe(true);

    const incompatible = registry.reconcile(
      [makeTrack(0, "deep-impact"), { ...makeTrack(1), level: 0.31 }],
      createGeneration,
      4.2,
    );

    expect(incompatible).toEqual({
      rotatedGeneration: false,
      naturallyRetiredVoiceCount: 1,
    });
    expect(generations).toHaveLength(1);
    expect(registry.size).toBe(2);
    expect(registry.naturallyRetiringVoiceCount).toBe(1);
    expect(registry.retiringGenerationCount).toBe(0);
    expect(original.fadeOut).not.toHaveBeenCalled();
    expect(original.voices[0].releaseAll).not.toHaveBeenCalled();
    expect(original.voices[0].retireAfterActive).toHaveBeenCalledWith(
      4.2,
      expect.any(Function),
    );
    expect(original.voices[0].dispose).not.toHaveBeenCalled();
    expect(original.voices[1].retireAfterActive).not.toHaveBeenCalled();
    expect(original.voices).toHaveLength(3);

    registry.trigger(makeOccurrence("track:0"), 4.3, 120);
    expect(original.voices[0].trigger).not.toHaveBeenCalled();
    expect(original.voices[2].trigger).toHaveBeenCalledOnce();

    original.voices[0].completeRetirement();
    expect(original.voices[0].dispose).toHaveBeenCalledOnce();
    expect(registry.naturallyRetiringVoiceCount).toBe(0);
    expect(original.dispose).not.toHaveBeenCalled();
    registry.dispose(5);
  });

  it("lets a removed track finish its active tail while rejecting new attacks", () => {
    const registry = new RuntimeVoiceRegistry();
    const generations: ManagedGenerationRecord[] = [];
    const createGeneration = createGenerationFactory(generations);

    registry.reconcile([makeTrack(0), makeTrack(1)], createGeneration, 6);
    const removed = generations[0].voices[1];
    registry.trigger(makeOccurrence("track:1"), 6, 120);
    expect(removed.trigger).toHaveBeenCalledOnce();

    registry.cancelScheduledAfter(6.05);
    registry.reconcile([makeTrack(0)], createGeneration, 6.05);

    expect(removed.cancelScheduledAfter).toHaveBeenCalledWith(6.05);
    expect(removed.retireAfterActive).toHaveBeenCalledWith(
      6.05,
      expect.any(Function),
    );
    expect(removed.releaseAll).not.toHaveBeenCalled();
    expect(removed.dispose).not.toHaveBeenCalled();
    expect(generations[0].fadeOut).not.toHaveBeenCalled();

    registry.trigger(makeOccurrence("track:1"), 6.1, 120);
    expect(removed.trigger).toHaveBeenCalledOnce();
    removed.completeRetirement();
    expect(removed.dispose).toHaveBeenCalledOnce();
    registry.dispose(7);
  });

  it("bounds fading generations and force-mutes before overflow disposal", () => {
    const timer = new ManualRetirementTimer();
    const registry = new RuntimeVoiceRegistry({ retirementTimer: timer });
    const lifecycle: string[] = [];
    const generations: ManagedGenerationRecord[] = [];
    const createGeneration = createGenerationFactory(generations, lifecycle);

    for (let index = 0; index < MAX_RETIRED_VOICE_GENERATIONS + 1; index += 1) {
      const scheduledAudioTime = 10 + index / 1_000;
      registry.reconcile(
        [makeTrack(0, `preset:${index}`)],
        createGeneration,
        scheduledAudioTime,
      );
      registry.retire({ scheduledAudioTime, fadeSeconds: 0.015 });
      expect(registry.retiringGenerationCount).toBeLessThanOrEqual(
        MAX_RETIRED_VOICE_GENERATIONS,
      );
      expect(timer.pendingCount).toBeLessThanOrEqual(1);
    }

    expect(registry.retiringGenerationCount).toBe(
      MAX_RETIRED_VOICE_GENERATIONS,
    );
    expect(generations[0].fadeOut).toHaveBeenNthCalledWith(1, 10, 0.015);
    expect(generations[0].fadeOut).toHaveBeenNthCalledWith(2, 10.004, 0);
    expect(generations[0].voices[0].dispose).toHaveBeenCalledOnce();
    expect(generations[0].dispose).toHaveBeenCalledOnce();

    const forcedMuteIndex = lifecycle.indexOf("generation:0:fade:10.004:0");
    const voiceDisposeIndex = lifecycle.indexOf("generation:0:voice:0:dispose");
    const outputDisposeIndex = lifecycle.indexOf("generation:0:dispose");
    expect(forcedMuteIndex).toBeGreaterThan(-1);
    expect(voiceDisposeIndex).toBeGreaterThan(forcedMuteIndex);
    expect(outputDisposeIndex).toBeGreaterThan(voiceDisposeIndex);

    timer.advance(35);
    expect(registry.retiringGenerationCount).toBe(0);
    expect(timer.pendingCount).toBe(0);
    registry.dispose(11);
  });

  it("force-mutes every gate and cancels cleanup when the registry is disposed", () => {
    const timer = new ManualRetirementTimer();
    const registry = new RuntimeVoiceRegistry({ retirementTimer: timer });
    const generations: ManagedGenerationRecord[] = [];
    const createGeneration = createGenerationFactory(generations);

    registry.reconcile([makeTrack(0)], createGeneration, 7);
    registry.retire({ scheduledAudioTime: 7, fadeSeconds: 0.015 });
    // A second explicit shutdown with no active generation must not truncate
    // the first generation's in-flight fade.
    registry.retire({ scheduledAudioTime: 7.0005, fadeSeconds: 0.015 });
    expect(generations[0].fadeOut).toHaveBeenCalledTimes(1);
    expect(generations[0].dispose).not.toHaveBeenCalled();

    registry.reconcile([makeTrack(0, "deep-impact")], createGeneration, 7.001);
    expect(timer.pendingCount).toBe(1);

    registry.dispose(7.002);
    registry.dispose(7.003);

    expect(registry.size).toBe(0);
    expect(registry.retiringGenerationCount).toBe(0);
    expect(registry.hasPendingRetirementCleanup).toBe(false);
    expect(timer.pendingCount).toBe(0);
    expect(generations[0].fadeOut).toHaveBeenLastCalledWith(7.002, 0);
    expect(generations[1].fadeOut).toHaveBeenLastCalledWith(7.002, 0);
    expect(
      generations.every(({ voices }) =>
        voices.every(({ dispose }) => dispose.mock.calls.length === 1),
      ),
    ).toBe(true);
    expect(
      generations.every(({ dispose }) => dispose.mock.calls.length === 1),
    ).toBe(true);

    timer.advance(1_000);
    expect(
      generations.every(({ dispose }) => dispose.mock.calls.length === 1),
    ).toBe(true);
    expect(() =>
      registry.reconcile([makeTrack(0)], createGeneration, 8),
    ).toThrow("disposed voice registry");
  });
});
