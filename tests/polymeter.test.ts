import { describe, expect, it, vi } from "vitest";

import {
  compileComposition,
  getCompositionSuperLoop,
} from "../src/audio/CompositionCompiler";
import { createCompositionMidi } from "../src/audio/MidiExporter";
import { getOfflineRenderTiming } from "../src/audio/OfflineRenderer";
import { Scheduler, type SchedulerBackend } from "../src/audio/Scheduler";
import { AUDIO_PPQ } from "../src/audio/constants";
import {
  LOOP_BAR_RATES,
  LOOP_RATE_DEFINITIONS,
  MAX_SUPPORTED_RATE_SUPER_LOOP_BARS,
  createStarterComposition,
  derivePlanetOrbitLanes,
  loopBarRateIndex,
  superLoopBarsForRates,
  validateComposition,
  type LoopBars,
  type PlanetState,
} from "../src/domain/composition";
import {
  deserializeComposition,
  serializeComposition,
} from "../src/domain/serialization/codec";
import { orbitPhaseAtTick as sceneOrbitPhaseAtTick } from "../src/scene/phase";

const NEUTRAL_MACROS = {
  energy: 0.5,
  density: 0.5,
  groove: 0.5,
  space: 0.5,
  complexity: 0.5,
} as const;

function planetAtRate(loopBars: LoopBars, index: number): PlanetState {
  const source = createStarterComposition(`polymeter-source-${index}`)
    .planets[0];
  return {
    ...source,
    id: `polymeter-planet-${index}`,
    name: `Orbit ${loopBars}`,
    orbit: {
      ...source.orbit,
      loopBars,
      shellIndex: 0,
      phase: 0,
    },
    pattern: {
      gridSize: 16,
      humanize: 0,
      events: [
        {
          id: `polymeter-event-${index}`,
          step: 0,
          velocity: 0.8,
          probability: 1,
          durationSteps: 1,
          drumVoice: "kick",
        },
      ],
    },
    moons: [],
    ring: undefined,
    muted: false,
    soloed: false,
  };
}

function compositionAtRates(...rates: LoopBars[]) {
  const composition = createStarterComposition("polymeter-system");
  composition.bpm = 120;
  composition.swing = 0;
  composition.macros = { ...NEUTRAL_MACROS };
  composition.planets = rates.map(planetAtRate);
  return composition;
}

class RecordingSchedulerBackend implements SchedulerBackend {
  readonly schedules: Array<{
    callback: (time: number) => void;
    intervalTicks: number;
    startTick: number;
  }> = [];
  tickAtTime = 0;
  currentAudioTime = 0;

  scheduleRepeat(
    callback: (time: number) => void,
    intervalTicks: number,
    startTick: number,
  ): number {
    this.schedules.push({ callback, intervalTicks, startTick });
    return this.schedules.length;
  }

  clear(): void {}

  getTicksAtTime(): number {
    return this.tickAtTime;
  }

  getCurrentAudioTime(): number {
    return this.currentAudioTime;
  }
}

describe("exact polymeter rates", () => {
  it("uses one data-driven catalog with exact quarter-bar units", () => {
    expect(LOOP_BAR_RATES).toEqual([0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8]);
    expect(
      LOOP_RATE_DEFINITIONS.map(({ quarterBarUnits }) => quarterBarUnits),
    ).toEqual([1, 2, 4, 6, 8, 12, 16, 24, 32]);
    expect(LOOP_BAR_RATES.map(loopBarRateIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(MAX_SUPPORTED_RATE_SUPER_LOOP_BARS).toBe(24);
  });

  it.each(LOOP_BAR_RATES)(
    "validates and round-trips a %s-bar orbit",
    (loopBars) => {
      const composition = compositionAtRates(loopBars);
      expect(validateComposition(composition).success).toBe(true);
      expect(deserializeComposition(serializeComposition(composition))).toEqual(
        { success: true, composition },
      );
    },
  );

  it("rejects unsupported rates while treating saved shell indices as legacy hints", () => {
    const unsupported = compositionAtRates(1);
    (unsupported.planets[0].orbit as { loopBars: number }).loopBars = 0.75;
    expect(validateComposition(unsupported).success).toBe(false);

    const legacyShell = compositionAtRates(3);
    legacyShell.planets[0].orbit.shellIndex = 3;
    expect(validateComposition(legacyShell).success).toBe(true);
  });

  it("derives unique compact lanes by rate and stable composition order", () => {
    const composition = compositionAtRates(4, 1, 4, 0.25, 3);
    const lanes = derivePlanetOrbitLanes(composition.planets);

    expect([...lanes.entries()]).toEqual([
      ["polymeter-planet-3", 0],
      ["polymeter-planet-1", 1],
      ["polymeter-planet-4", 2],
      ["polymeter-planet-0", 3],
      ["polymeter-planet-2", 4],
    ]);
    expect(new Set(lanes.values()).size).toBe(composition.planets.length);
  });

  it("loads an existing schema-v1 four-bar orbit without reinterpretation", () => {
    const legacyFixture = createStarterComposition("legacy-v1-polymeter");
    legacyFixture.planets[0].orbit = {
      ...legacyFixture.planets[0].orbit,
      loopBars: 4,
      shellIndex: 3,
    };
    const serializedFixture = JSON.stringify(legacyFixture);

    expect(deserializeComposition(serializedFixture)).toEqual({
      success: true,
      composition: legacyFixture,
    });
    expect(serializeComposition(legacyFixture)).toBe(serializedFixture);
  });

  it("computes exact fractional and long-rate LCMs", () => {
    expect(superLoopBarsForRates([3, 4])).toBe(12);
    expect(superLoopBarsForRates([6, 8])).toBe(24);
    expect(superLoopBarsForRates([0.25, 1.5])).toBe(1.5);
    expect(superLoopBarsForRates([0.5, 1.5, 2])).toBe(6);
    expect(superLoopBarsForRates(LOOP_BAR_RATES)).toBe(24);
  });
});

describe("polymetric compilation and scheduling", () => {
  it("compiles every 3-bar and 4-bar occurrence exactly once through bar 12", () => {
    const composition = compositionAtRates(3, 4);
    const sequence = compileComposition(composition, {
      probabilityMode: "defer",
    });

    expect(getCompositionSuperLoop(composition)).toEqual({
      bars: 12,
      ticks: 12 * 4 * AUDIO_PPQ,
    });
    expect(sequence.barsPerLoop).toBe(12);
    expect(sequence.totalTicks).toBe(12 * 4 * AUDIO_PPQ);
    expect(
      sequence.occurrences
        .filter(({ eventId }) => eventId === "polymeter-event-0")
        .map(({ startTick }) => startTick),
    ).toEqual([0, 5_760, 11_520, 17_280]);
    expect(
      sequence.occurrences
        .filter(({ eventId }) => eventId === "polymeter-event-1")
        .map(({ startTick }) => startTick),
    ).toEqual([0, 7_680, 15_360]);
    expect(
      new Set(sequence.occurrences.map(({ occurrenceId }) => occurrenceId)),
    ).toHaveProperty("size", sequence.occurrences.length);
  });

  it("resynchronizes 6-bar and 8-bar sources at bar 24", () => {
    const sequence = compileComposition(compositionAtRates(6, 8), {
      probabilityMode: "defer",
    });
    expect(sequence.barsPerLoop).toBe(24);
    expect(sequence.occurrences).toHaveLength(7);
  });

  it("includes fractional source cycles and excludes inactive rates from the LCM", () => {
    const fractional = compileComposition(compositionAtRates(0.25, 1.5), {
      probabilityMode: "defer",
    });
    expect(fractional.barsPerLoop).toBe(12);
    expect(
      fractional.occurrences.filter(
        ({ eventId }) => eventId === "polymeter-event-0",
      ),
    ).toHaveLength(48);
    expect(
      fractional.occurrences.filter(
        ({ eventId }) => eventId === "polymeter-event-1",
      ),
    ).toHaveLength(8);

    const mutedLongOrbit = compositionAtRates(3, 8);
    mutedLongOrbit.planets[1].muted = true;
    expect(getCompositionSuperLoop(mutedLongOrbit).bars).toBe(12);
    expect(
      getCompositionSuperLoop(mutedLongOrbit, { includeMuted: true }).bars,
    ).toBe(24);
  });

  it("lets an inherited moon rate extend the project super-loop exactly", () => {
    const composition = compositionAtRates(1);
    composition.planets[0].moons = [
      {
        id: "long-cycle-moon",
        behaviorPresetId: "counterpulse",
        pattern: {
          gridSize: 8,
          humanize: 0,
          events: [
            {
              id: "long-cycle-moon-event",
              step: 0,
              velocity: 0.5,
              probability: 1,
              durationSteps: 1,
              drumVoice: "closed-hat",
            },
          ],
        },
        orbitRatio: 0.125,
        phase: 0,
        level: 0.4,
        probability: 1,
        appearanceSeed: 1,
        muted: false,
        locked: false,
      },
    ];

    const sequence = compileComposition(composition, {
      probabilityMode: "defer",
    });
    expect(sequence.barsPerLoop).toBe(8);
    expect(
      sequence.occurrences.filter(
        ({ eventId }) => eventId === "long-cycle-moon-event",
      ),
    ).toHaveLength(1);
  });

  it("keeps probability loop indices stable across super-loop repetitions", () => {
    const sequence = compileComposition(compositionAtRates(3, 4), {
      loops: 2,
      probabilityMode: "defer",
    });
    const firstSource = sequence.occurrences.filter(
      ({ eventId }) => eventId === "polymeter-event-0",
    );
    expect(firstSource.map(({ loopIndex }) => loopIndex)).toEqual([
      0, 0, 0, 0, 1, 1, 1, 1,
    ]);
    expect(firstSource.slice(4).map(({ startTick }) => startTick)).toEqual([
      23_040, 28_800, 34_560, 40_320,
    ]);
  });

  it("registers one bounded live callback per source and offsets exact event times", () => {
    const backend = new RecordingSchedulerBackend();
    const trigger = vi.fn();
    const scheduler = new Scheduler(backend, trigger);
    const composition = compositionAtRates(3, 4);
    composition.planets[0].pattern.events[0].step = 4;
    scheduler.setComposition(composition);

    expect(scheduler.scheduledRegistrationCount).toBe(2);
    expect(
      backend.schedules
        .map(({ intervalTicks }) => intervalTicks)
        .sort((a, b) => a - b),
    ).toEqual([5_760, 7_680]);
    expect(backend.schedules.map(({ startTick }) => startTick)).toEqual([0, 0]);

    backend.tickAtTime = 23_040;
    backend.currentAudioTime = 1;
    backend.schedules.forEach(({ callback }) => callback(1));
    expect(trigger).toHaveBeenCalledTimes(2);
    const first = trigger.mock.calls.find(
      ([occurrence]) =>
        (occurrence as { eventId: string }).eventId === "polymeter-event-0",
    );
    expect(first?.[0]).toMatchObject({
      loopIndex: 1,
      startTick: 24_480,
    });
    expect(first?.[1]).toBe(2.5);
    expect(
      trigger.mock.calls.every(
        ([occurrence]) => (occurrence as { loopIndex: number }).loopIndex === 1,
      ),
    ).toBe(true);
  });

  it("keeps dense worst-rate scheduling below the 41-source MVP bound", () => {
    const composition = compositionAtRates(...LOOP_BAR_RATES.slice(0, 8));
    composition.planets.forEach((planet, planetIndex) => {
      planet.pattern = {
        gridSize: 32,
        humanize: 0,
        events: Array.from({ length: 32 }, (_, step) => ({
          id: `dense-event-${planetIndex}-${step}`,
          step,
          velocity: 0.7,
          probability: 1,
          durationSteps: 1,
          drumVoice: "closed-hat" as const,
        })),
      };
    });
    const backend = new RecordingSchedulerBackend();
    const trigger = vi.fn();
    const scheduler = new Scheduler(backend, trigger);

    scheduler.setComposition(composition);
    expect(scheduler.scheduledRegistrationCount).toBe(8);
    expect(scheduler.scheduledRegistrationCount).toBeLessThanOrEqual(41);
    backend.schedules.forEach(({ callback }) => callback(0));
    expect(trigger).toHaveBeenCalledTimes(8 * 32);
  });
});

describe("polymetric export and visible phase boundaries", () => {
  it("ends MIDI tracks on a selected super-loop boundary", () => {
    const midi = createCompositionMidi(compositionAtRates(3, 4), { loops: 2 });
    expect(midi.tracks.map(({ endOfTrackTicks }) => endOfTrackTicks)).toEqual([
      46_080, 46_080,
    ]);
  });

  it("computes WAV musical duration from the super-loop before its explicit tail", () => {
    const timing = getOfflineRenderTiming(compositionAtRates(3, 4), {
      tailSeconds: 0.5,
    });
    expect(timing.sequence.barsPerLoop).toBe(12);
    expect(timing.musicalDurationSeconds).toBe(24);
    expect(timing.renderDurationSeconds).toBe(24.5);
  });

  it("visibly realigns 3-bar and 4-bar orbits only at bar 12", () => {
    const tickAtBar = (bar: number) => bar * 4 * AUDIO_PPQ;
    expect(sceneOrbitPhaseAtTick(0, tickAtBar(4), 3, AUDIO_PPQ)).toBeCloseTo(
      1 / 3,
    );
    expect(sceneOrbitPhaseAtTick(0, tickAtBar(4), 4, AUDIO_PPQ)).toBe(0);
    expect(sceneOrbitPhaseAtTick(0, tickAtBar(6), 3, AUDIO_PPQ)).toBe(0);
    expect(sceneOrbitPhaseAtTick(0, tickAtBar(6), 4, AUDIO_PPQ)).toBe(0.5);
    expect(sceneOrbitPhaseAtTick(0, tickAtBar(12), 3, AUDIO_PPQ)).toBe(0);
    expect(sceneOrbitPhaseAtTick(0, tickAtBar(12), 4, AUDIO_PPQ)).toBe(0);
  });
});
