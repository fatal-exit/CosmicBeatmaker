import { describe, expect, it } from "vitest";

import { STAR_SOUND_PALETTES } from "../src/content/soundPresets";
import {
  applyBinaryCompanion,
  blackHolePitchIntentSemitones,
  getPlanetStarAffinity,
  removeBinaryCompanion,
} from "../src/domain/composition/starSystems";
import {
  createStarterComposition,
  validateComposition,
} from "../src/domain/composition";
import {
  generateAsteroidBeltForComposition,
  generateBinaryCompanionForComposition,
  generateCompleteSystem,
} from "../src/domain/generation";
import {
  projectBlackHoleHalfSpeedPattern,
  projectCelestialRhythm,
} from "../src/domain/rhythm";
import { applyCompositionCommand } from "../src/state/commands";

describe("schema-v3 celestial systems", () => {
  it("generates one deterministic moon and belt in every complete system", () => {
    const first = generateCompleteSystem("celestial-default");
    const second = generateCompleteSystem("celestial-default");

    expect(first).toEqual(second);
    expect(first.planets.flatMap((planet) => planet.moons)).toHaveLength(1);
    expect(first.asteroidBelt).toBeDefined();
    expect(validateComposition(first).success).toBe(true);
  });

  it("alternates binary affinities and uses each side's role palette", () => {
    const composition = generateCompleteSystem("binary-affinity", {
      binaryCompanion: { presetId: "void", rhythmMode: "mirror" },
    });
    expect(composition.star.companion?.presetId).toBe("void");

    const affinities = composition.planets.map((_, index) =>
      getPlanetStarAffinity(composition, index),
    );
    expect(new Set(affinities)).toEqual(new Set(["primary", "companion"]));
    composition.planets.forEach((planet, index) => {
      const presetId =
        affinities[index] === "companion"
          ? composition.star.companion?.presetId
          : composition.star.presetId;
      expect(presetId).toBeDefined();
      expect(STAR_SOUND_PALETTES[presetId!][planet.role]).toContain(
        planet.soundPresetId,
      );
    });
  });

  it("chooses a genuinely different palette for a default companion", () => {
    const composition = generateCompleteSystem("binary-default-palette", {
      starPresetId: "radiant",
      binaryCompanion: true,
    });

    expect(composition.star.companion?.presetId).not.toBe(
      composition.star.presetId,
    );
  });

  it("normalizes an explicitly duplicated companion palette", () => {
    const composition = generateCompleteSystem("binary-explicit-palette", {
      starPresetId: "radiant",
      binaryCompanion: { presetId: "radiant" },
    });

    expect(composition.star.companion?.presetId).not.toBe(
      composition.star.presetId,
    );
  });

  it("rejects black-hole companions and duplicate companion IDs", () => {
    const composition = generateCompleteSystem("invalid-binary", {
      binaryCompanion: { presetId: "radiant" },
    });
    const companion = composition.star.companion!;
    expect(
      validateComposition({
        ...composition,
        star: {
          ...composition.star,
          companion: { ...companion, presetId: "black-hole" },
        },
      }).success,
    ).toBe(false);
    expect(
      validateComposition({
        ...composition,
        star: {
          ...composition.star,
          companion: { ...companion, id: composition.star.id },
        },
      }).success,
    ).toBe(false);
    expect(
      validateComposition({
        ...composition,
        star: {
          ...composition.star,
          companion: {
            ...companion,
            presetId: composition.star.presetId,
          },
        },
      }).success,
    ).toBe(false);
  });

  it("projects black-hole half speed exactly and retains stable event IDs", () => {
    const source = {
      gridSize: 8 as const,
      templateId: "source-template",
      humanize: 0.1,
      events: [
        {
          id: "event-a",
          step: 0,
          velocity: 0.8,
          probability: 1,
          durationSteps: 1,
        },
        {
          id: "event-b",
          step: 1,
          velocity: 0.6,
          probability: 0.8,
          durationSteps: 0.5,
        },
        {
          id: "event-c",
          step: 6,
          velocity: 0.4,
          probability: 0.7,
          durationSteps: 1,
        },
      ],
    };
    const star = { presetId: "black-hole" as const };
    const projected = projectCelestialRhythm(source, star, "primary");

    expect(projected.templateId).toBeUndefined();
    expect(projected.events).toEqual([
      { ...source.events[0], step: 0, durationSteps: 2 },
      { ...source.events[1], step: 2, durationSteps: 1 },
    ]);
    expect(source.events[0].step).toBe(0);
    expect(blackHolePitchIntentSemitones(star)).toBe(-12);
    expect(blackHolePitchIntentSemitones({ presetId: "void" })).toBe(0);
  });

  it("keeps sparse black-hole projections audible and in bounds", () => {
    const source = {
      gridSize: 8 as const,
      events: [
        {
          id: "late-event",
          step: 7,
          velocity: 0.5,
          probability: 1,
          durationSteps: 1,
        },
      ],
      humanize: 0,
    };
    const projected = projectBlackHoleHalfSpeedPattern(source);
    expect(projected.events).toHaveLength(1);
    expect(projected.events[0].id).toBe("late-event");
    expect(projected.events[0].step).toBeLessThan(8);
  });

  it("keeps all binary modes deterministic, distinct, and input-immutable", () => {
    const source = {
      gridSize: 8 as const,
      events: [
        {
          id: "a",
          step: 0,
          velocity: 0.8,
          probability: 1,
          durationSteps: 1,
        },
        {
          id: "b",
          step: 3,
          velocity: 0.5,
          probability: 0.9,
          durationSteps: 2,
        },
      ],
      humanize: 0,
    };
    const snapshots = ["interlock", "mirror", "call-response"].map(
      (rhythmMode) =>
        projectCelestialRhythm(
          source,
          {
            presetId: "void",
            companion: {
              id: "companion",
              presetId: "radiant",
              visualSeed: 1,
              intensity: 0.5,
              rhythmMode: rhythmMode as
                "interlock" | "mirror" | "call-response",
            },
          },
          "companion",
        ),
    );

    expect(
      new Set(snapshots.map((pattern) => JSON.stringify(pattern.events))).size,
    ).toBe(3);
    expect(snapshots).toEqual(
      ["interlock", "mirror", "call-response"].map((rhythmMode) =>
        projectCelestialRhythm(
          source,
          {
            presetId: "void",
            companion: {
              id: "companion",
              presetId: "radiant",
              visualSeed: 1,
              intensity: 0.5,
              rhythmMode: rhythmMode as
                "interlock" | "mirror" | "call-response",
            },
          },
          "companion",
        ),
      ),
    );
    expect(source.events.map((event) => event.step)).toEqual([0, 3]);
    for (const pattern of snapshots) {
      expect(pattern.events.map((event) => event.id).sort()).toEqual([
        "a",
        "b",
      ]);
      expect(
        pattern.events.every((event) => event.step >= 0 && event.step < 8),
      ).toBe(true);
    }
  });

  it("applies and removes a companion without changing structural planet state", () => {
    const composition = createStarterComposition("binary-command");
    const companion = generateBinaryCompanionForComposition(composition, {
      presetId: "dwarf",
      rhythmMode: "call-response",
    });
    const beforePlanet = composition.planets[0];
    const binary = applyBinaryCompanion(composition, companion);
    expect(binary.star.companion).toEqual(companion);
    expect(binary.planets[0]).toMatchObject({
      id: beforePlanet.id,
      pattern: beforePlanet.pattern,
      orbit: beforePlanet.orbit,
    });
    expect(removeBinaryCompanion(binary).star.companion).toBeUndefined();
  });

  it("bounds new moon and belt commands and no-ops unknown targets", () => {
    const composition = generateCompleteSystem("celestial-commands");
    const parent = composition.planets.find(
      (planet) => planet.moons.length > 0,
    )!;
    const moon = parent.moons[0];
    const changedMoon = applyCompositionCommand(composition, {
      type: "ToggleMoonMute",
      planetId: parent.id,
      moonId: moon.id,
      timestamp: "2026-07-15T00:00:00.000Z",
    }).composition;
    expect(
      changedMoon.planets.find((planet) => planet.id === parent.id)?.moons[0]
        .muted,
    ).toBe(true);
    const changedBelt = applyCompositionCommand(changedMoon, {
      type: "SetAsteroidBeltParameters",
      parameters: {
        population: 4,
        clustering: -1,
        level: 0.5,
      },
      timestamp: "2026-07-15T00:00:00.000Z",
    }).composition;
    expect(changedBelt.asteroidBelt?.population).toBe(1);
    expect(changedBelt.asteroidBelt?.clustering).toBe(0);
    expect(
      applyCompositionCommand(changedBelt, {
        type: "ToggleMoonMute",
        planetId: "missing",
        moonId: "missing",
      }).composition,
    ).toBe(changedBelt);
    expect(validateComposition(changedBelt).success).toBe(true);
    expect(generateAsteroidBeltForComposition(composition)).toEqual(
      generateAsteroidBeltForComposition(composition),
    );
  });
});
