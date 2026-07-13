import { describe, expect, it } from "vitest";

import { compileComposition } from "../src/audio/CompositionCompiler";
import type { MacroState, PatternState } from "../src/domain/composition";
import { createStarterComposition } from "../src/domain/composition";
import {
  derivePerformancePattern,
  performanceHumanizeOffsetSteps,
} from "../src/domain/rhythm";
import { compositionToSceneDescriptor } from "../src/scene/descriptors";

const NEUTRAL_MACROS: MacroState = {
  energy: 0.5,
  density: 0.5,
  groove: 0.5,
  space: 0.5,
  complexity: 0.5,
};

const MELODY_PATTERN: PatternState = {
  gridSize: 16,
  humanize: 0.02,
  templateId: "performance-test-motif",
  events: [0, 2, 4, 6, 8, 10, 12, 14].map((step, index) => ({
    id: `melody-event-${index}`,
    step,
    velocity: index === 0 ? 0.72 : 0.6,
    probability: index === 0 ? 1 : 0.9,
    durationSteps: 2,
    pitch: {
      kind: "scaleDegree" as const,
      degree: index % 5,
      octaveOffset: 1,
    },
  })),
};

function macros(key: keyof MacroState, value: number): MacroState {
  return { ...NEUTRAL_MACROS, [key]: value };
}

function project(key: keyof MacroState, value: number): PatternState {
  return derivePerformancePattern(
    MELODY_PATTERN,
    "melody",
    "performance-melody",
    macros(key, value),
  );
}

function compositionFor(key: keyof MacroState, value: number) {
  const composition = createStarterComposition(`performance-${key}-${value}`);
  const planet = composition.planets[0];
  planet.role = "melody";
  planet.pattern = structuredClone(MELODY_PATTERN);
  planet.orbit.phase = 0;
  composition.swing = 0;
  composition.macros = macros(key, value);
  return composition;
}

function moonCompositionFor(key: keyof MacroState, value: number) {
  const composition = compositionFor(key, value);
  const planet = composition.planets[0];
  planet.moons = [
    {
      id: "performance-moon",
      behaviorPresetId: "counterpulse",
      pattern: structuredClone(MELODY_PATTERN),
      orbitRatio: 2,
      phase: 0.125,
      level: 0.45,
      probability: 1,
      appearanceSeed: 84,
      muted: false,
      locked: false,
    },
  ];
  return composition;
}

function moonSceneEvents(key: keyof MacroState, value: number) {
  return compositionToSceneDescriptor(moonCompositionFor(key, value)).planets[0]
    .moons[0].events;
}

function compiledMoonEventIds(key: keyof MacroState, value: number) {
  return new Set(
    compileComposition(moonCompositionFor(key, value), {
      probabilityMode: "defer",
    })
      .occurrences.filter((occurrence) => occurrence.sourceKind === "moon")
      .map((occurrence) => occurrence.eventId),
  );
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

describe("live performance macro projection", () => {
  it("is deterministic, absolute, and leaves the canonical pattern untouched", () => {
    const canonical = structuredClone(MELODY_PATTERN);
    const high = project("density", 1);
    const repeated = project("density", 1);

    expect(repeated).toEqual(high);
    expect(MELODY_PATTERN).toEqual(canonical);
    expect(project("density", 0.5)).toEqual(
      derivePerformancePattern(
        canonical,
        "melody",
        "performance-melody",
        NEUTRAL_MACROS,
      ),
    );
  });

  it("maps every macro to a bounded, role-safe pattern change", () => {
    const lowEnergy = project("energy", 0);
    const highEnergy = project("energy", 1);
    expect(
      average(highEnergy.events.map((event) => event.velocity)),
    ).toBeGreaterThan(average(lowEnergy.events.map((event) => event.velocity)));

    const lowDensity = project("density", 0);
    const highDensity = project("density", 1);
    expect(lowDensity.events.length).toBeLessThan(MELODY_PATTERN.events.length);
    expect(highDensity.events.length).toBeGreaterThan(
      MELODY_PATTERN.events.length,
    );
    expect(
      highDensity.events.filter((event) =>
        event.id.startsWith("performance-event_"),
      ),
    ).not.toHaveLength(0);

    const straight = project("groove", 0);
    const syncopated = project("groove", 1);
    expect(straight.humanize).toBe(0);
    expect(syncopated.humanize).toBe(0.12);
    expect(syncopated.events.map((event) => event.step)).not.toEqual(
      straight.events.map((event) => event.step),
    );

    const close = project("space", 0);
    const vast = project("space", 1);
    expect(
      average(vast.events.map((event) => event.durationSteps)),
    ).toBeGreaterThan(
      average(close.events.map((event) => event.durationSteps)),
    );
    expect(vast.events.length).toBeLessThan(close.events.length);

    const stable = project("complexity", 0);
    const adventurous = project("complexity", 1);
    expect(adventurous.events.length).toBeGreaterThan(stable.events.length);
    expect(adventurous.events.map((event) => event.pitch)).not.toEqual(
      stable.events.map((event) => event.pitch),
    );
    expect(
      average(adventurous.events.map((event) => event.probability)),
    ).toBeLessThan(average(stable.events.map((event) => event.probability)));

    for (const pattern of [
      lowEnergy,
      highEnergy,
      lowDensity,
      highDensity,
      straight,
      syncopated,
      close,
      vast,
      stable,
      adventurous,
    ]) {
      expect(new Set(pattern.events.map((event) => event.step)).size).toBe(
        pattern.events.length,
      );
      expect(
        pattern.events.every(
          (event) =>
            Number.isInteger(event.step) &&
            event.step >= 0 &&
            event.step < pattern.gridSize &&
            event.velocity >= 0 &&
            event.velocity <= 1 &&
            event.probability >= 0 &&
            event.probability <= 1 &&
            event.durationSteps > 0,
        ),
      ).toBe(true);
    }
  });

  it("seeds bounded humanize by composition, event, and source loop", () => {
    const pattern = project("groove", 1);
    const event = pattern.events.find(({ step }) => step !== 0)!;
    const first = performanceHumanizeOffsetSteps(
      pattern,
      "humanize-seed",
      event,
      0,
    );
    const repeated = performanceHumanizeOffsetSteps(
      pattern,
      "humanize-seed",
      event,
      0,
    );
    const nextCycle = performanceHumanizeOffsetSteps(
      pattern,
      "humanize-seed",
      event,
      1,
    );

    expect(repeated).toBe(first);
    expect(nextCycle).not.toBe(first);
    expect(first).toBeGreaterThanOrEqual(-pattern.humanize);
    expect(first).toBeLessThanOrEqual(pattern.humanize * 2);
  });

  it.each(["energy", "density", "groove", "space", "complexity"] as const)(
    "%s changes compiled playback while scene gates retain one-to-one event IDs",
    (key) => {
      const lowComposition = compositionFor(key, 0);
      const highComposition = compositionFor(key, 1);
      const low = compileComposition(lowComposition, {
        probabilityMode: "defer",
      });
      const high = compileComposition(highComposition, {
        probabilityMode: "defer",
      });
      const repeated = compileComposition(highComposition, {
        probabilityMode: "defer",
      });
      const scene = compositionToSceneDescriptor(highComposition);
      const compiledEventIds = new Set(
        high.occurrences.map((event) => event.eventId),
      );
      const sceneEventIds = new Set(
        scene.planets[0].events.map((event) => event.eventId),
      );

      expect(high).not.toEqual(low);
      expect(repeated).toEqual(high);
      expect(sceneEventIds).toEqual(compiledEventIds);
      expect(highComposition.planets[0].pattern).toEqual(MELODY_PATTERN);
    },
  );

  it("updates visible gate count or position for pattern-shaping macros", () => {
    const sceneEvents = (key: keyof MacroState, value: number) =>
      compositionToSceneDescriptor(compositionFor(key, value)).planets[0]
        .events;

    expect(sceneEvents("density", 1).length).toBeGreaterThan(
      sceneEvents("density", 0).length,
    );
    expect(sceneEvents("groove", 1).map((event) => event.phase)).not.toEqual(
      sceneEvents("groove", 0).map((event) => event.phase),
    );
    expect(sceneEvents("space", 1).length).toBeLessThan(
      sceneEvents("space", 0).length,
    );
    expect(sceneEvents("complexity", 1).length).toBeGreaterThan(
      sceneEvents("complexity", 0).length,
    );
  });

  it.each(["density", "space", "complexity"] as const)(
    "mirrors %s moon-event count and compiled event IDs in visible moon gates",
    (key) => {
      const lowEvents = moonSceneEvents(key, 0);
      const highEvents = moonSceneEvents(key, 1);

      if (key === "space") {
        expect(highEvents.length).toBeLessThan(lowEvents.length);
      } else {
        expect(highEvents.length).toBeGreaterThan(lowEvents.length);
      }
      expect(new Set(lowEvents.map((event) => event.eventId))).toEqual(
        compiledMoonEventIds(key, 0),
      );
      expect(new Set(highEvents.map((event) => event.eventId))).toEqual(
        compiledMoonEventIds(key, 1),
      );
    },
  );

  it("mirrors groove timing changes in moon gate phases without losing ID parity", () => {
    const straight = moonSceneEvents("groove", 0);
    const syncopated = moonSceneEvents("groove", 1);

    expect(syncopated.map((event) => event.phase)).not.toEqual(
      straight.map((event) => event.phase),
    );
    expect(new Set(straight.map((event) => event.eventId))).toEqual(
      compiledMoonEventIds("groove", 0),
    );
    expect(new Set(syncopated.map((event) => event.eventId))).toEqual(
      compiledMoonEventIds("groove", 1),
    );
  });
});
