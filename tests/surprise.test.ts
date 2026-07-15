import { describe, expect, it } from "vitest";

import { getSoundPresetsForRole } from "../src/content/soundPresets";
import {
  generateCompleteSystem,
  regenerateSystem,
  surprisePlanet,
  surpriseWholeSystem,
} from "../src/domain/generation";
import { validateComposition } from "../src/domain/composition";

describe("deterministic surprise controls", () => {
  it("builds the same safe surprise from the same revision", () => {
    const original = generateCompleteSystem("surprise-system");
    const first = surpriseWholeSystem(original);
    const second = surpriseWholeSystem(original);

    expect(first).toEqual(second);
    expect(first.generation.revision).toBe(original.generation.revision + 1);
    expect(first).not.toEqual(original);
    for (const planet of first.planets) {
      expect(
        getSoundPresetsForRole(planet.role).some(
          (preset) => preset.id === planet.soundPresetId,
        ),
      ).toBe(true);
    }
  });

  it("surprises one planet while preserving stable identity and neighbors", () => {
    const original = generateCompleteSystem("surprise-one");
    const target = original.planets.find((planet) => planet.role === "melody");
    if (!target) throw new Error("Missing melody planet.");
    const surprised = surprisePlanet(original, target.id);

    expect(surprised.generation.revision).toBe(
      original.generation.revision + 1,
    );
    expect(
      surprised.planets.find((planet) => planet.id === target.id)?.id,
    ).toBe(target.id);
    for (const neighbor of original.planets.filter(
      (planet) => planet.id !== target.id,
    )) {
      expect(
        surprised.planets.find((planet) => planet.id === neighbor.id),
      ).toEqual(neighbor);
    }
  });

  it("respects a locked planet", () => {
    const original = generateCompleteSystem("surprise-lock");
    const target = original.planets[0];
    const locked = {
      ...original,
      planets: original.planets.map((planet) =>
        planet.id === target.id ? { ...planet, locked: true } : planet,
      ),
    };
    expect(surprisePlanet(locked, target.id)).toBe(locked);
  });

  it("keeps surprised moon periods valid across deterministic planet revisions", () => {
    for (let index = 0; index < 48; index += 1) {
      const original = generateCompleteSystem(`surprise-moon-rate-${index}`);
      const target = original.planets.find((planet) => planet.moons.length > 0);
      if (!target) throw new Error("Missing moon parent.");

      const surprised = surprisePlanet(original, target.id);

      expect(validateComposition(surprised).success).toBe(true);
    }
  });

  it("keeps regenerated binary palettes distinct and schema-valid", () => {
    for (let index = 0; index < 32; index += 1) {
      const original = generateCompleteSystem(`binary-surprise-${index}`, {
        binaryCompanion: true,
      });
      const regenerated = regenerateSystem(original, { domains: ["star"] });
      const companion = regenerated.star.companion;

      expect(companion).toBeDefined();
      expect(companion?.presetId).not.toBe(regenerated.star.presetId);
      expect(validateComposition(regenerated).success).toBe(true);
    }
  });
});
