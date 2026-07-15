import { describe, expect, it } from "vitest";

import { compileComposition } from "../src/audio/CompositionCompiler";
import type { AsteroidBeltState, Composition } from "../src/domain/composition";
import { generateCompleteSystem } from "../src/domain/generation";
import {
  ASTEROID_ACCENT_VELOCITY_BOOST,
  deriveAsteroidPerformancePattern,
} from "../src/domain/rhythm";
import { compositionToSceneDescriptor } from "../src/scene/descriptors";

function createBelt(accentChance: number): AsteroidBeltState {
  return {
    id: "belt_accent_test",
    materialPresetId: "dust-percussion",
    gridSize: 16,
    events: [
      {
        id: "asteroid-a",
        step: 0,
        velocity: 0.48,
        probability: 1,
        durationSteps: 0.5,
        drumVoice: "perc",
      },
      {
        id: "asteroid-b",
        step: 5,
        velocity: 0.74,
        probability: 0.86,
        durationSteps: 0.5,
        drumVoice: "perc",
      },
      {
        id: "asteroid-c",
        step: 12,
        velocity: 0.92,
        probability: 0.72,
        durationSteps: 0.5,
        drumVoice: "perc",
      },
    ],
    population: 0.5,
    clustering: 0.4,
    turbulence: 0.17,
    accentChance,
    level: 0.24,
    locked: false,
    visualSeed: 4815,
  };
}

function withBelt(
  seed: string,
  accentChance: number,
  starPresetId: "radiant" | "black-hole" = "radiant",
): Composition {
  return {
    ...generateCompleteSystem(seed, { starPresetId }),
    asteroidBelt: createBelt(accentChance),
  };
}

describe("asteroid performance accents", () => {
  it("leaves every velocity unchanged when accent chance is zero", () => {
    const belt = createBelt(0);
    const pattern = deriveAsteroidPerformancePattern("quiet-seed", belt);

    expect(pattern.events).toEqual(belt.events);
    expect(pattern.humanize).toBe(belt.turbulence);
    expect(pattern.gridSize).toBe(belt.gridSize);
  });

  it("safely boosts every event when accent chance is one", () => {
    const belt = createBelt(1);
    const pattern = deriveAsteroidPerformancePattern("accent-seed", belt);

    expect(pattern.events).toHaveLength(belt.events.length);
    pattern.events.forEach((event, index) => {
      const source = belt.events[index];
      expect(event.id).toBe(source.id);
      expect(event.step).toBe(source.step);
      expect(event.velocity).toBe(
        Math.min(1, source.velocity + ASTEROID_ACCENT_VELOCITY_BOOST),
      );
      expect(event.velocity).toBeLessThanOrEqual(1);
    });
  });

  it("is deterministic for one seed and varies across a bounded seed sample", () => {
    const belt = createBelt(0.5);
    expect(deriveAsteroidPerformancePattern("repeatable", belt)).toEqual(
      deriveAsteroidPerformancePattern("repeatable", belt),
    );

    const outcomes = new Set(
      Array.from({ length: 32 }, (_, index) =>
        deriveAsteroidPerformancePattern(`accent-sample-${index}`, belt)
          .events.map((event, eventIndex) =>
            event.velocity > belt.events[eventIndex].velocity ? "1" : "0",
          )
          .join(""),
      ),
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("never mutates canonical belt or event data", () => {
    const belt = createBelt(1);
    const snapshot = structuredClone(belt);
    const pattern = deriveAsteroidPerformancePattern("immutable", belt);

    expect(belt).toEqual(snapshot);
    expect(pattern.events).not.toBe(belt.events);
    pattern.events.forEach((event, index) => {
      expect(event).not.toBe(belt.events[index]);
    });
  });

  it("keeps compiled occurrence and scene pulse velocities identical", () => {
    const composition = withBelt("asteroid-parity", 1, "black-hole");
    const canonicalBelt = structuredClone(composition.asteroidBelt);
    const audio = compileComposition(composition, {
      probabilityMode: "defer",
    })
      .occurrences.filter((occurrence) => occurrence.sourceKind === "asteroid")
      .map(({ eventId, velocity }) => ({ eventId, velocity }))
      .sort((left, right) => left.eventId.localeCompare(right.eventId));
    const scene = (
      compositionToSceneDescriptor(composition).asteroidBelt?.events ?? []
    )
      .map(({ eventId, velocity }) => ({ eventId, velocity }))
      .sort((left, right) => left.eventId.localeCompare(right.eventId));

    expect(audio).not.toHaveLength(0);
    expect(scene).toEqual(audio);
    expect(composition.asteroidBelt).toEqual(canonicalBelt);
  });
});
