import { beforeEach, describe, expect, it, vi } from "vitest";

const toneFakes = vi.hoisted(() => {
  class FakeParam {
    readonly ramps: Array<{ value: number; duration: number }> = [];
    readonly heldAt: number[] = [];
    readonly cancelledAt: number[] = [];
    readonly linearRamps: Array<{ value: number; time: number }> = [];
    readonly setValues: Array<{ value: number; time: number }> = [];

    rampTo(value: number, duration: number): void {
      this.ramps.push({ value, duration });
    }

    cancelAndHoldAtTime(time: number): void {
      this.heldAt.push(time);
    }

    cancelScheduledValues(time: number): void {
      this.cancelledAt.push(time);
    }

    linearRampToValueAtTime(value: number, time: number): void {
      this.linearRamps.push({ value, time });
    }

    setValueAtTime(value: number, time: number): void {
      this.setValues.push({ value, time });
    }
  }

  class FakeGain {
    static readonly instances: FakeGain[] = [];
    readonly gain = new FakeParam();
    readonly initialValue: number;
    disposed = false;
    disconnected = false;

    constructor(initialValue = 1) {
      this.initialValue = initialValue;
      FakeGain.instances.push(this);
    }

    connect(): this {
      this.disconnected = false;
      return this;
    }

    disconnect(): this {
      this.disconnected = true;
      return this;
    }

    dispose(): this {
      this.disposed = true;
      return this;
    }
  }

  class FakeLimiter {
    static readonly instances: FakeLimiter[] = [];
    disposed = false;

    constructor(readonly threshold: number) {
      FakeLimiter.instances.push(this);
    }

    toDestination(): this {
      return this;
    }

    dispose(): this {
      this.disposed = true;
      return this;
    }
  }

  return { FakeGain, FakeLimiter };
});

vi.mock("tone", async (importOriginal) => {
  const actual = await importOriginal<typeof import("tone")>();
  return {
    ...actual,
    Gain: toneFakes.FakeGain,
    Limiter: toneFakes.FakeLimiter,
  };
});

import { AudioEngine } from "../src/audio/AudioEngine";
import {
  compileComposition,
  compileLiveSchedule,
} from "../src/audio/CompositionCompiler";
import type { SchedulerBackend } from "../src/audio/Scheduler";
import {
  TransportController,
  type TransportAdapter,
} from "../src/audio/TransportController";
import type { RuntimeVoice } from "../src/audio/VoiceFactory";
import type { CompiledTrack, ScheduledOccurrence } from "../src/audio/types";
import type { Composition } from "../src/domain/composition/types";
import { createStarterComposition } from "../src/domain/composition/starter";
import { generateCompleteSystem } from "../src/domain/generation";
import { ringActiveSegmentsForDensity } from "../src/domain/rhythm";

class FakeTransportAdapter implements TransportAdapter {
  state: "started" | "paused" | "stopped" = "stopped";
  ticks = 0;
  ppq = 192;
  bpm = 120;
  startCalls = 0;
  pauseCalls = 0;
  stopCalls = 0;
  readonly pauseAudioTimes: Array<number | undefined> = [];

  start(): void {
    this.startCalls += 1;
    this.state = "started";
  }

  pause(audioTime?: number): void {
    this.pauseCalls += 1;
    this.pauseAudioTimes.push(audioTime);
    this.state = "paused";
  }

  stop(): void {
    this.stopCalls += 1;
    this.state = "stopped";
  }
}

class FakeSchedulerBackend implements SchedulerBackend {
  readonly repeats = new Map<number, (time: number) => void>();
  readonly oneShots = new Map<
    number,
    { callback: (time: number) => void; absoluteTick: number }
  >();
  readonly cleared = new Set<number>();
  tickAtTime = 0;
  currentAudioTime = 0;
  schedulingAudioTime?: number;
  ticksAtAudioTime?: (audioTime: number) => number;
  private nextId = 1;

  scheduleRepeat(callback: (time: number) => void): number {
    const id = this.nextId++;
    this.repeats.set(id, callback);
    return id;
  }

  scheduleOnce(callback: (time: number) => void, absoluteTick: number): number {
    const id = this.nextId++;
    this.oneShots.set(id, {
      callback: (time) => {
        this.oneShots.delete(id);
        callback(time);
      },
      absoluteTick,
    });
    return id;
  }

  clear(id: number): void {
    this.cleared.add(id);
    this.repeats.delete(id);
    this.oneShots.delete(id);
  }

  getTicksAtTime(audioTime: number): number {
    return this.ticksAtAudioTime?.(audioTime) ?? this.tickAtTime;
  }

  getCurrentAudioTime(): number {
    return this.currentAudioTime;
  }

  getSchedulingAudioTime(): number {
    return this.schedulingAudioTime ?? this.currentAudioTime;
  }
}

interface VoiceRecord {
  readonly track: CompiledTrack;
  readonly trigger: ReturnType<typeof vi.fn>;
  readonly update: ReturnType<typeof vi.fn>;
  readonly releaseAll: ReturnType<typeof vi.fn>;
  readonly cancelScheduledAfter: ReturnType<typeof vi.fn>;
  readonly retireAfterActive: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  readonly voice: RuntimeVoice;
}

function createVoiceFactory(
  records: VoiceRecord[],
  shouldThrowOnTrigger: () => boolean = () => false,
) {
  return (track: CompiledTrack): RuntimeVoice => {
    const trigger = vi.fn(() => {
      if (shouldThrowOnTrigger()) throw new Error("Injected voice failure.");
    });
    const update = vi.fn();
    const releaseAll = vi.fn();
    const cancelScheduledAfter = vi.fn();
    const retireAfterActive = vi.fn();
    const dispose = vi.fn();
    const voice: RuntimeVoice = {
      trigger,
      update,
      releaseAll,
      cancelScheduledAfter,
      retireAfterActive,
      dispose,
    };
    records.push({
      track,
      trigger,
      update,
      releaseAll,
      cancelScheduledAfter,
      retireAfterActive,
      dispose,
      voice,
    });
    return voice;
  };
}

async function createHarness(inputComposition?: Composition) {
  const adapter = new FakeTransportAdapter();
  const transport = new TransportController(adapter, () => Promise.resolve());
  const backend = new FakeSchedulerBackend();
  const voices: VoiceRecord[] = [];
  const engine = new AudioEngine({
    transport,
    schedulerBackend: backend,
    voiceFactory: createVoiceFactory(voices),
  });
  const composition =
    inputComposition ?? createStarterComposition("engine-lifecycle");
  composition.swing = 0;
  composition.planets[0].pattern.humanize = 0;
  engine.setComposition(composition);
  await engine.unlock();
  return { adapter, backend, composition, engine, transport, voices };
}

beforeEach(() => {
  toneFakes.FakeGain.instances.length = 0;
  toneFakes.FakeLimiter.instances.length = 0;
});

describe("audio engine runtime generations", () => {
  it("does not allocate a graph when disposed during deferred audio unlock", async () => {
    let resolveUnlock: (() => void) | undefined;
    const adapter = new FakeTransportAdapter();
    const transport = new TransportController(
      adapter,
      () =>
        new Promise<void>((resolve) => {
          resolveUnlock = resolve;
        }),
    );
    const backend = new FakeSchedulerBackend();
    const voices: VoiceRecord[] = [];
    const engine = new AudioEngine({
      transport,
      schedulerBackend: backend,
      voiceFactory: createVoiceFactory(voices),
    });
    engine.setComposition(createStarterComposition("deferred-unlock-dispose"));

    const unlockPromise = engine.unlock();
    engine.dispose();
    resolveUnlock?.();

    await expect(unlockPromise).rejects.toThrow(/disposed/i);
    expect(toneFakes.FakeGain.instances).toHaveLength(0);
    expect(toneFakes.FakeLimiter.instances).toHaveLength(0);
    expect(backend.repeats.size).toBe(0);
    expect(backend.oneShots.size).toBe(0);
    expect(voices).toHaveLength(0);
  });

  it("updates tempo and mix directly without rebuilding the schedule or voice bank", async () => {
    const { adapter, backend, composition, engine, voices } =
      await createHarness();
    engine.play();
    const originalRepeatIds = [...backend.repeats.keys()];
    const originalVoices = [...voices];

    const tempoEdit = structuredClone(composition);
    tempoEdit.bpm = 133;
    engine.setComposition(tempoEdit);

    expect(adapter.bpm).toBe(133);
    expect([...backend.repeats.keys()]).toEqual(originalRepeatIds);
    expect(voices).toEqual(originalVoices);
    expect(
      originalVoices.every(({ dispose }) => !dispose.mock.calls.length),
    ).toBe(true);

    const mixEdit = structuredClone(tempoEdit);
    mixEdit.planets[0].mix.level = 0.31;
    mixEdit.planets[0].mix.pan = 0.25;
    mixEdit.planets[0].mix.filter = 0.44;
    engine.setComposition(mixEdit);
    expect([...backend.repeats.keys()]).toEqual(originalRepeatIds);
    expect(voices).toEqual(originalVoices);
    expect(originalVoices[0].update).toHaveBeenCalledOnce();
    expect(originalVoices[0].dispose).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("keeps one bounded voice generation through rapid live-control edits", async () => {
    let current = generateCompleteSystem("engine-live-control-stress");
    const { adapter, backend, engine, voices } = await createHarness(current);
    engine.play();
    adapter.ticks = 1_100;
    backend.tickAtTime = 733;
    backend.currentAudioTime = 2;
    let routedVoices = [...voices];
    const epochGate = toneFakes.FakeGain.instances[1];

    const replaceAndAssertGeneration = (next: Composition) => {
      const previousRouted = [...routedVoices];
      const priorCancelCounts = previousRouted.map(
        ({ cancelScheduledAfter }) => cancelScheduledAfter.mock.calls.length,
      );
      engine.setComposition(next);
      expect(
        previousRouted.every(({ releaseAll }) => !releaseAll.mock.calls.length),
      ).toBe(true);
      expect(
        previousRouted.every(({ dispose }) => !dispose.mock.calls.length),
      ).toBe(true);
      previousRouted.forEach(({ cancelScheduledAfter }, index) => {
        expect(cancelScheduledAfter).toHaveBeenCalledTimes(
          priorCancelCounts[index] + 1,
        );
        expect(cancelScheduledAfter).toHaveBeenLastCalledWith(2);
      });
      const nextTrackCount = compileLiveSchedule(next).sources.length;
      routedVoices = [...voices];
      expect(routedVoices).toHaveLength(nextTrackCount);
      expect(backend.repeats.size).toBe(nextTrackCount);
      expect(backend.repeats.size).toBeLessThanOrEqual(41);
      expect(toneFakes.FakeGain.instances).toHaveLength(2);
      expect(epochGate.gain.heldAt).toHaveLength(0);
      expect(epochGate.gain.linearRamps).toHaveLength(0);
      expect(
        [...backend.oneShots.values()].every(
          ({ absoluteTick }) => absoluteTick >= 733,
        ),
      ).toBe(true);
      expect(adapter.state).toBe("started");
      expect(adapter.ticks).toBe(1_100);
      expect(adapter.startCalls).toBe(1);
      expect(adapter.pauseCalls).toBe(0);
      expect(adapter.stopCalls).toBe(0);
      current = next;
    };

    const macroNames = [
      "density",
      "energy",
      "groove",
      "space",
      "complexity",
    ] as const;
    for (const macroName of macroNames) {
      const macroEdit = structuredClone(current);
      macroEdit.macros[macroName] =
        macroEdit.macros[macroName] < 0.5 ? 0.9 : 0.1;
      replaceAndAssertGeneration(macroEdit);
    }

    for (let revision = 0; revision < 4; revision += 1) {
      const stepEdit = structuredClone(current);
      const primary = stepEdit.planets.find((planet) => planet.role === "beat");
      if (!primary) throw new Error("Generated system must contain a beat.");
      const step = 1;
      const existing = primary.pattern.events.find(
        (event) => event.step === step,
      );
      primary.pattern.templateId = undefined;
      primary.pattern.events = existing
        ? primary.pattern.events.filter((event) => event.id !== existing.id)
        : [
            ...primary.pattern.events,
            {
              id: "engine-primary-step-1",
              step,
              velocity: 0.72,
              probability: 1,
              durationSteps: 1,
              drumVoice: "closed-hat" as const,
            },
          ].sort((left, right) => left.step - right.step);
      replaceAndAssertGeneration(stepEdit);
    }

    for (let revision = 0; revision < 24; revision += 1) {
      const edited = structuredClone(current);
      const chords = edited.planets.find(
        (planet) => planet.expression.kind === "chords",
      );
      const melody = edited.planets.find(
        (planet) => planet.expression.kind === "melody",
      );
      if (
        !chords ||
        chords.expression.kind !== "chords" ||
        !melody ||
        melody.expression.kind !== "melody"
      ) {
        throw new Error(
          "Generated system must contain chord and melody parts.",
        );
      }
      const nextChordValue = chords.expression.chordComplexity < 0.5 ? 1 : 0;
      chords.expression.voicingSpread = nextChordValue;
      chords.expression.chordComplexity = nextChordValue;
      melody.expression.pitchVariety =
        melody.expression.pitchVariety < 0.5 ? 1 : 0;
      replaceAndAssertGeneration(edited);
    }

    const withRing = structuredClone(current);
    const ringParent = withRing.planets.find(
      (planet) => planet.expression.kind === "melody",
    );
    if (!ringParent) throw new Error("Generated system must contain a melody.");
    ringParent.ring = {
      id: "engine-live-ring",
      type: "delay",
      segments: 16,
      active: Array.from({ length: 16 }, (_, index) => index % 2 === 0),
      phase: 0,
      velocityVariation: 0.1,
      probability: 1,
      soundPresetId: ringParent.soundPresetId,
      level: 0.4,
    };
    replaceAndAssertGeneration(withRing);

    for (const segments of [8, 16] as const) {
      const segmentEdit = structuredClone(current);
      const segmentParent = segmentEdit.planets.find(
        (planet) => planet.ring?.id === "engine-live-ring",
      );
      if (!segmentParent?.ring) {
        throw new Error("The live ring must remain attached during editing.");
      }
      segmentParent.ring.segments = segments;
      segmentParent.ring.active = Array.from(
        { length: segments },
        (_, index) => index % 2 === 0,
      );
      replaceAndAssertGeneration(segmentEdit);
    }

    for (let revision = 0; revision < 8; revision += 1) {
      const densityEdit = structuredClone(current);
      const densityParent = densityEdit.planets.find(
        (planet) => planet.ring?.id === "engine-live-ring",
      );
      if (!densityParent?.ring) {
        throw new Error("The live ring must remain attached during editing.");
      }
      densityParent.ring.active = ringActiveSegmentsForDensity(
        densityParent,
        densityParent.ring,
        revision % 2 === 0 ? 0.25 : 0.75,
      );
      replaceAndAssertGeneration(densityEdit);

      const stepEdit = structuredClone(current);
      const stepParent = stepEdit.planets.find(
        (planet) => planet.ring?.id === "engine-live-ring",
      );
      if (!stepParent?.ring) {
        throw new Error("The live ring must remain attached during editing.");
      }
      const segment = revision % stepParent.ring.segments;
      stepParent.ring.active[segment] = !stepParent.ring.active[segment];
      replaceAndAssertGeneration(stepEdit);
    }

    const compiledAfterRing = compileComposition(current, {
      probabilityMode: "defer",
    });
    const expectedByOccurrence = new Map(
      compiledAfterRing.occurrences
        .filter(({ startTick }) => startTick >= 733)
        .map((occurrence) => [
          `${occurrence.trackId}:${occurrence.eventId}:${occurrence.startTick}`,
          occurrence,
        ]),
    );
    for (const [id, oneShot] of [...backend.oneShots.entries()].sort(
      ([, left], [, right]) => left.absoluteTick - right.absoluteTick,
    )) {
      const scheduledAudioTime = 2 + (oneShot.absoluteTick - 733) / 960;
      backend.currentAudioTime = scheduledAudioTime;
      backend.oneShots.delete(id);
      oneShot.callback(scheduledAudioTime);
    }
    const liveTriggers = routedVoices.flatMap(({ trigger }) =>
      trigger.mock.calls.map(
        ([occurrence]) => occurrence as ScheduledOccurrence,
      ),
    );
    expect(liveTriggers.length).toBeGreaterThan(0);
    expect(liveTriggers.every(({ startTick }) => startTick >= 733)).toBe(true);
    for (const occurrence of liveTriggers) {
      const expected = expectedByOccurrence.get(
        `${occurrence.trackId}:${occurrence.eventId}:${occurrence.startTick}`,
      );
      expect(expected?.midiNotes).toEqual(occurrence.midiNotes);
    }
    expect(
      liveTriggers.some(({ trackId }) => trackId === "engine-live-ring"),
    ).toBe(true);
    expect(adapter.ticks).toBe(1_100);
    expect(adapter.startCalls).toBe(1);
    expect(adapter.pauseCalls).toBe(0);

    const activeBeforeTempo = [...routedVoices];
    const createdBeforeTempo = voices.length;
    for (let bpm = 70; bpm <= 140; bpm += 1) {
      const tempoEdit = structuredClone(current);
      tempoEdit.bpm = bpm;
      engine.setComposition(tempoEdit);
      current = tempoEdit;
    }
    expect(voices).toHaveLength(createdBeforeTempo);
    expect(
      activeBeforeTempo.every(({ dispose }) => dispose.mock.calls.length === 0),
    ).toBe(true);

    engine.stop();
    expect(
      routedVoices.every(({ releaseAll }) => releaseAll.mock.calls.length >= 1),
    ).toBe(true);
    engine.dispose();
    expect(voices.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it("continues structural edits from the raw clock without interrupting playback", async () => {
    const { adapter, backend, composition, engine, voices } =
      await createHarness();
    engine.play();
    backend.currentAudioTime = 1;
    backend.tickAtTime = 0;
    const staleRepeat = [...backend.repeats.values()][0];
    staleRepeat(1.12);
    const staleOneShots = [...backend.oneShots.values()].map(
      ({ callback }) => callback,
    );
    const oldGeneration = [...voices];
    adapter.ticks = 1_100;
    backend.currentAudioTime = 1.5;
    backend.schedulingAudioTime = 1.8;
    backend.ticksAtAudioTime = (audioTime) => 600 + (audioTime - 1.5) * 800;

    const patternEdit = structuredClone(composition);
    patternEdit.planets[0].pattern.events =
      patternEdit.planets[0].pattern.events.filter(({ step }) => step !== 8);
    patternEdit.planets[0].pattern.events.push(
      {
        id: "engine-new-boundary",
        step: 5,
        velocity: 0.61,
        probability: 1,
        durationSteps: 1,
        drumVoice: "closed-hat",
      },
      {
        id: "engine-new-ahead",
        step: 6,
        velocity: 0.73,
        probability: 1,
        durationSteps: 1,
        drumVoice: "closed-hat",
      },
    );
    patternEdit.planets[0].pattern.events.sort(
      (left, right) => left.step - right.step,
    );
    engine.setComposition(patternEdit);

    expect(
      oldGeneration.every(({ cancelScheduledAfter }) =>
        cancelScheduledAfter.mock.calls.some(([time]) => time === 1.5),
      ),
    ).toBe(true);
    expect(
      oldGeneration.every(
        ({ releaseAll }) => releaseAll.mock.calls.length === 0,
      ),
    ).toBe(true);
    expect(
      oldGeneration.every(({ dispose }) => dispose.mock.calls.length === 0),
    ).toBe(true);
    expect(voices).toHaveLength(oldGeneration.length);
    expect(toneFakes.FakeGain.instances).toHaveLength(2);
    expect(toneFakes.FakeGain.instances[1].gain.heldAt).toHaveLength(0);
    expect(backend.cleared.size).toBeGreaterThan(0);
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([1_440]);
    expect(adapter.state).toBe("started");
    expect(adapter.ticks).toBe(1_100);
    expect(adapter.startCalls).toBe(1);
    expect(adapter.pauseCalls).toBe(0);
    expect(adapter.stopCalls).toBe(0);
    const triggerCountAfterEdit = oldGeneration.reduce(
      (count, { trigger }) => count + trigger.mock.calls.length,
      0,
    );
    staleRepeat(1.2);
    staleOneShots.forEach((callback) => callback(1.25));
    expect(
      oldGeneration.reduce(
        (count, { trigger }) => count + trigger.mock.calls.length,
        0,
      ),
    ).toBe(triggerCountAfterEdit);

    const currentGeneration = [...voices];
    expect(
      currentGeneration.some(({ trigger }) =>
        trigger.mock.calls.some(
          ([occurrence]) =>
            (occurrence as ScheduledOccurrence).eventId ===
              "engine-new-ahead" &&
            (occurrence as ScheduledOccurrence).startTick === 720,
        ),
      ),
    ).toBe(true);
    expect(
      currentGeneration.some(({ trigger }) =>
        trigger.mock.calls.some(
          ([occurrence, scheduledAudioTime]) =>
            (occurrence as ScheduledOccurrence).eventId ===
              "engine-new-ahead" &&
            (occurrence as ScheduledOccurrence).startTick === 720 &&
            Math.abs((scheduledAudioTime as number) - 1.65) < 0.000_01,
        ),
      ),
    ).toBe(true);

    const currentRepeat = [...backend.repeats.values()][0];
    backend.ticksAtAudioTime = undefined;
    backend.schedulingAudioTime = undefined;
    backend.tickAtTime = 1_920;
    backend.currentAudioTime = 3;
    currentRepeat(3);
    const boundaryNextOrbit = [...backend.oneShots.values()].find(
      ({ absoluteTick }) => absoluteTick === 2_520,
    );
    if (!boundaryNextOrbit) {
      throw new Error("The boundary event must wait for the next orbit.");
    }
    backend.currentAudioTime = 3.6;
    boundaryNextOrbit.callback(3.6);
    expect(
      currentGeneration.some(({ trigger }) =>
        trigger.mock.calls.some(
          ([occurrence]) =>
            (occurrence as ScheduledOccurrence).eventId ===
              "engine-new-boundary" &&
            (occurrence as ScheduledOccurrence).startTick === 2_520,
        ),
      ),
    ).toBe(true);
    engine.dispose();
  });

  it("re-admits a lookahead hit into a replacement preset voice without fading active audio", async () => {
    const { backend, composition, engine, voices } = await createHarness();
    engine.play();
    backend.currentAudioTime = 1;
    backend.tickAtTime = 0;
    [...backend.repeats.values()][0](1);
    const admitted = [...backend.oneShots.values()].find(
      ({ absoluteTick }) => absoluteTick === 480,
    );
    if (!admitted) throw new Error("Expected a lookahead step at tick 480.");
    admitted.callback(1.15);
    const oldVoice = voices[0];

    backend.tickAtTime = 1;
    backend.schedulingAudioTime = 1.25;
    backend.ticksAtAudioTime = (audioTime) => 1 + (audioTime - 1) * 3_200;
    const presetEdit = structuredClone(composition);
    presetEdit.planets[0].soundPresetId = "deep-impact";

    engine.setComposition(presetEdit);

    expect(voices).toHaveLength(2);
    const newVoice = voices[1];
    expect(oldVoice.cancelScheduledAfter).toHaveBeenCalledWith(1);
    expect(oldVoice.retireAfterActive).toHaveBeenCalledWith(
      1,
      expect.any(Function),
    );
    expect(oldVoice.releaseAll).not.toHaveBeenCalled();
    expect(oldVoice.dispose).not.toHaveBeenCalled();
    expect(newVoice.trigger).toHaveBeenCalledWith(
      expect.objectContaining({ startTick: 480 }),
      expect.closeTo(1 + 479 / 3_200, 6),
      composition.bpm,
    );
    expect(toneFakes.FakeGain.instances).toHaveLength(2);
    expect(toneFakes.FakeGain.instances[1].gain.heldAt).toHaveLength(0);
    engine.dispose();
  });

  it("pause and stop clear every pending event, silence output, and resume with a fresh epoch", async () => {
    const { adapter, backend, engine, voices } = await createHarness();
    engine.play();
    adapter.ticks = 1_100;
    backend.tickAtTime = 0;
    backend.currentAudioTime = 2;
    const staleRepeat = [...backend.repeats.values()][0];
    staleRepeat(2.12);
    const staleOneShots = [...backend.oneShots.values()].map(
      ({ callback }) => callback,
    );
    const pausedGeneration = [...voices];
    backend.tickAtTime = 600;
    backend.schedulingAudioTime = 2.12;

    engine.pause();

    expect(adapter.state).toBe("paused");
    expect(adapter.ticks).toBe(600);
    expect(adapter.pauseAudioTimes).toEqual([2.12]);
    expect(backend.repeats.size).toBe(0);
    expect(backend.oneShots.size).toBe(0);
    expect(
      pausedGeneration.every(({ releaseAll }) =>
        releaseAll.mock.calls.some(([time]) => time === 2),
      ),
    ).toBe(true);
    expect(
      pausedGeneration.every(({ dispose }) => dispose.mock.calls.length === 0),
    ).toBe(true);
    const master = toneFakes.FakeGain.instances[0];
    expect(master.gain.heldAt.at(-1)).toBe(2);
    expect(master.gain.linearRamps.at(-1)?.value).toBe(0);
    const pausedGenerationGate = toneFakes.FakeGain.instances[1];
    expect(pausedGenerationGate.gain.heldAt.at(-1)).toBe(2);
    expect(pausedGenerationGate.gain.linearRamps.at(-1)).toEqual({
      value: 0,
      time: 2.015,
    });
    const callsAtPause = pausedGeneration.reduce(
      (count, { trigger }) => count + trigger.mock.calls.length,
      0,
    );
    staleRepeat(2.2);
    staleOneShots.forEach((callback) => callback(2.2));
    expect(
      pausedGeneration.reduce(
        (count, { trigger }) => count + trigger.mock.calls.length,
        0,
      ),
    ).toBe(callsAtPause);

    backend.tickAtTime = 600;
    engine.play();
    expect(adapter.state).toBe("started");
    expect(voices.length).toBeGreaterThan(pausedGeneration.length);
    expect(backend.repeats.size).toBeGreaterThan(0);
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([960, 1_440]);

    backend.currentAudioTime = 3;
    engine.stop();
    expect(adapter.state).toBe("stopped");
    expect(adapter.ticks).toBe(0);
    expect(backend.repeats.size).toBe(0);
    expect(backend.oneShots.size).toBe(0);
    expect(master.gain.heldAt.at(-1)).toBe(3);
    engine.dispose();
    expect(voices.every(({ dispose }) => dispose.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it("does not commit a live schedule that trips health during direct continuation", async () => {
    const adapter = new FakeTransportAdapter();
    const transport = new TransportController(adapter, () => Promise.resolve());
    const backend = new FakeSchedulerBackend();
    const voices: VoiceRecord[] = [];
    let failTriggers = false;
    const engine = new AudioEngine({
      transport,
      schedulerBackend: backend,
      voiceFactory: createVoiceFactory(voices, () => failTriggers),
    });
    const composition = createStarterComposition("engine-health-reentry");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    engine.setComposition(composition);
    await engine.unlock();
    engine.play();

    backend.currentAudioTime = 1;
    backend.schedulingAudioTime = 1.25;
    backend.ticksAtAudioTime = (audioTime) => 1 + (audioTime - 1) * 3_200;
    adapter.ticks = 1;
    failTriggers = true;

    const edited = structuredClone(composition);
    edited.planets[0].pattern.templateId = undefined;
    edited.planets[0].pattern.events = Array.from(
      { length: 5 },
      (_, index) => ({
        id: `health-direct-${index}`,
        step: index + 1,
        velocity: 0.7,
        probability: 1,
        durationSteps: 1,
        drumVoice: "closed-hat" as const,
      }),
    );

    engine.setComposition(edited);

    expect(engine.isSafetyMuted).toBe(true);
    expect(adapter.state).toBe("paused");
    expect(adapter.pauseAudioTimes.at(-1)).toBe(1.25);
    expect(backend.repeats.size).toBe(0);
    expect(backend.oneShots.size).toBe(0);

    const startCallsBeforeRetry = adapter.startCalls;
    expect(engine.play()).toBe(false);
    expect(engine.isSafetyMuted).toBe(true);
    expect(adapter.state).toBe("paused");
    expect(adapter.startCalls).toBe(startCallsBeforeRetry);
    expect(backend.repeats.size).toBe(0);
    expect(backend.oneShots.size).toBe(0);

    failTriggers = false;
    expect(engine.play()).toBe(true);

    expect(engine.isSafetyMuted).toBe(false);
    expect(adapter.state).toBe("started");
    expect(backend.repeats.size).toBeGreaterThan(0);
    expect(
      voices.some(({ trigger }) =>
        trigger.mock.results.some(({ type }) => type === "return"),
      ),
    ).toBe(true);
    engine.dispose();
  });
});
