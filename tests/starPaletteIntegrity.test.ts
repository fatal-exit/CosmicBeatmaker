import { afterEach, describe, expect, it } from "vitest";

import {
  clearUserSounds,
  registerUserSound,
  STAR_SOUND_PALETTES,
} from "../src/content/soundPresets";
import {
  applyBinaryCompanion,
  getPlanetStarAffinity,
  reconcilePlanetSoundPalettes,
  removeBinaryCompanion,
} from "../src/domain/composition/starSystems";
import type {
  BinaryStarState,
  Composition,
  PlanetState,
} from "../src/domain/composition/types";
import { generateCompleteSystem } from "../src/domain/generation";
import { applyCompositionCommand } from "../src/state/commands";

afterEach(() => clearUserSounds());

const companion: BinaryStarState = {
  id: "companion-palette-test",
  presetId: "void",
  visualSeed: 1,
  intensity: 0.7,
  rhythmMode: "mirror",
};

function binaryComposition(seed = "star-palette-integrity"): Composition {
  const composition = generateCompleteSystem(seed);
  return {
    ...composition,
    star: { ...composition.star, companion: { ...companion } },
  };
}

function expectedPalette(
  composition: Composition,
  index: number,
): readonly string[] {
  const affinity = getPlanetStarAffinity(composition, index);
  const presetId =
    affinity === "companion"
      ? composition.star.companion!.presetId
      : composition.star.presetId;
  return STAR_SOUND_PALETTES[presetId][composition.planets[index].role];
}

function expectBuiltInPalettes(composition: Composition): void {
  composition.planets.forEach((planet, index) => {
    if (planet.locked || planet.soundPresetId.startsWith("user-sound_")) return;
    expect(expectedPalette(composition, index)).toContain(planet.soundPresetId);
  });
}

function invalidBuiltInPlanets(composition: Composition): Composition {
  return {
    ...composition,
    planets: composition.planets.map((planet) => ({
      ...planet,
      soundPresetId: "not-a-user-sound-or-built-in-palette-entry",
    })),
  };
}

describe("binary and primary sound-palette integrity", () => {
  it("reconciles adding and updating a companion, including tonal ring alignment", () => {
    const source = invalidBuiltInPlanets(
      generateCompleteSystem("companion-add"),
    );
    const tonalIndex = source.planets.findIndex(
      (planet) => planet.role === "bass",
    );
    const withRing: Composition = {
      ...source,
      planets: source.planets.map((planet, index) =>
        index === tonalIndex
          ? {
              ...planet,
              ring: {
                id: "tonal-ring",
                type: "gate",
                segments: 8,
                active: Array.from(
                  { length: 8 },
                  (_, segment) => segment % 2 === 0,
                ),
                phase: 0,
                velocityVariation: 0.1,
                probability: 1,
                soundPresetId: "old-tonal-voice",
                level: 0.3,
              },
            }
          : planet,
      ),
    };

    const added = applyBinaryCompanion(withRing, companion);
    expectBuiltInPalettes(added);
    const addedTonal = added.planets[tonalIndex];
    expect(addedTonal.ring?.soundPresetId).toBe(addedTonal.soundPresetId);
    expect(addedTonal.pattern).toBe(withRing.planets[tonalIndex].pattern);
    expect(addedTonal.orbit).toBe(withRing.planets[tonalIndex].orbit);

    const updated = applyBinaryCompanion(added, {
      ...companion,
      presetId: "red-giant",
      visualSeed: 3,
    });
    expectBuiltInPalettes(updated);
    expect(updated.planets[tonalIndex].ring?.soundPresetId).toBe(
      updated.planets[tonalIndex].soundPresetId,
    );
  });

  it("removes a companion and reconciles former companion voices to primary", () => {
    const source = binaryComposition("companion-remove");
    const binary = {
      ...source,
      planets: source.planets.map((planet, index) => ({
        ...planet,
        soundPresetId: expectedPalette(source, index)[0],
      })),
    };
    const removed = removeBinaryCompanion(binary);

    expect(removed.star.companion).toBeUndefined();
    expectBuiltInPalettes(removed);
    expect(
      STAR_SOUND_PALETTES[removed.star.presetId][removed.planets[0].role],
    ).toContain(removed.planets[0].soundPresetId);
  });

  it("reconciles a primary preset change, retaining companion affinity and black-hole palette", () => {
    const source = invalidBuiltInPlanets(binaryComposition("primary-change"));
    const result = applyCompositionCommand(source, {
      type: "SetStarPreset",
      presetId: "black-hole",
      timestamp: source.updatedAt,
    }).composition;

    expect(result.star.companion?.presetId).toBe(companion.presetId);
    expectBuiltInPalettes(result);
    result.planets.forEach((planet, index) => {
      expect(planet.pattern).toBe(source.planets[index].pattern);
      expect(planet.orbit).toBe(source.planets[index].orbit);
    });
  });

  it("keeps primary and companion preset packs distinct deterministically", () => {
    const generated = binaryComposition("distinct-companion");
    const source: Composition = {
      ...generated,
      star: {
        ...generated.star,
        presetId: "radiant",
        companion: { ...companion },
      },
    };
    const companionWithPrimaryPreset: BinaryStarState = {
      ...companion,
      presetId: "radiant",
    };
    const samePresetSource: Composition = {
      ...source,
      star: {
        ...source.star,
        companion: { ...companion },
      },
    };

    const applied = applyBinaryCompanion(source, companionWithPrimaryPreset);
    expect(applied.star.companion?.presetId).not.toBe(applied.star.presetId);
    expect(applied.star.companion).toMatchObject({
      id: companionWithPrimaryPreset.id,
      visualSeed: companionWithPrimaryPreset.visualSeed,
      intensity: companionWithPrimaryPreset.intensity,
      rhythmMode: companionWithPrimaryPreset.rhythmMode,
    });
    expect(applied).toEqual(
      applyBinaryCompanion(source, companionWithPrimaryPreset),
    );

    const changedPrimary = applyCompositionCommand(samePresetSource, {
      type: "SetStarPreset",
      presetId: companion.presetId,
      timestamp: source.updatedAt,
    }).composition;
    expect(changedPrimary.star.companion?.presetId).not.toBe(
      changedPrimary.star.presetId,
    );
    expect(changedPrimary.star.companion).toMatchObject({
      id: companionWithPrimaryPreset.id,
      visualSeed: companionWithPrimaryPreset.visualSeed,
      intensity: companionWithPrimaryPreset.intensity,
      rhythmMode: companionWithPrimaryPreset.rhythmMode,
    });
  });

  it("reconciles appended and duplicated planets for their resulting affinity", () => {
    const source = binaryComposition("append-planet");
    const appended: PlanetState = {
      ...structuredClone(source.planets[0]),
      id: "appended-palette-planet",
      name: "Appended",
      soundPresetId: "not-a-user-sound-or-built-in-palette-entry",
    };
    const addResult = applyCompositionCommand(source, {
      type: "AddPlanet",
      planet: appended,
      timestamp: source.updatedAt,
    }).composition;
    expect(expectedPalette(addResult, addResult.planets.length - 1)).toContain(
      addResult.planets.at(-1)?.soundPresetId,
    );

    const duplicate: PlanetState = {
      ...structuredClone(source.planets[1]),
      id: "duplicated-palette-planet",
      name: "Duplicated",
      soundPresetId: "not-a-user-sound-or-built-in-palette-entry",
    };
    const duplicateResult = applyCompositionCommand(source, {
      type: "DuplicatePlanet",
      planet: duplicate,
      timestamp: source.updatedAt,
    }).composition;
    expect(
      expectedPalette(duplicateResult, duplicateResult.planets.length - 1),
    ).toContain(duplicateResult.planets.at(-1)?.soundPresetId);
  });

  it("reconciles later planets when an early planet is removed", () => {
    const source = binaryComposition("remove-early-planet");
    const early = source.planets[0];
    const later = source.planets[1];
    const primarySound =
      STAR_SOUND_PALETTES[source.star.presetId][later.role][0];
    const prepared: Composition = {
      ...source,
      planets: source.planets.map((planet) =>
        planet.id === later.id
          ? { ...planet, soundPresetId: primarySound }
          : planet,
      ),
    };

    const result = applyCompositionCommand(prepared, {
      type: "RemovePlanet",
      planetId: early.id,
      timestamp: source.updatedAt,
    }).composition;
    const shifted = result.planets.find((planet) => planet.id === later.id)!;
    expect(expectedPalette(result, 0)).toContain(shifted.soundPresetId);
    expect(shifted.pattern).toBe(later.pattern);
    expect(shifted.orbit).toBe(later.orbit);
  });

  it("preserves locked planets and both registered and prefix-only user sounds", () => {
    registerUserSound({
      preset: {
        id: "user-sound_registered-palette-test",
        name: "Registered Local",
        role: "melody",
        description: "A registered local test sound.",
      },
      voice: { kind: "pitched", sampleId: "registered-sample", rootMidi: 60 },
      assets: [],
    });

    const source = binaryComposition("preserve-special-sounds");
    const locked = source.planets[0];
    const registered = source.planets.find(
      (planet) => planet.role === "melody",
    )!;
    const prefixOnly = source.planets.find(
      (planet) => planet.role === "texture",
    )!;
    const prepared: Composition = {
      ...source,
      planets: source.planets.map((planet) =>
        planet.id === locked.id
          ? {
              ...planet,
              locked: true,
              soundPresetId: "locked-invalid-built-in",
            }
          : planet.id === registered.id
            ? { ...planet, soundPresetId: "user-sound_registered-palette-test" }
            : planet.id === prefixOnly.id
              ? { ...planet, soundPresetId: "user-sound_missing-locally" }
              : {
                  ...planet,
                  soundPresetId: "not-a-user-sound-or-built-in-palette-entry",
                },
      ),
    };

    const result = reconcilePlanetSoundPalettes(prepared);
    expect(result.planets[0].soundPresetId).toBe("locked-invalid-built-in");
    expect(
      result.planets.find((planet) => planet.id === registered.id)
        ?.soundPresetId,
    ).toBe("user-sound_registered-palette-test");
    expect(
      result.planets.find((planet) => planet.id === prefixOnly.id)
        ?.soundPresetId,
    ).toBe("user-sound_missing-locally");
  });

  it("does not mutate the source or unrelated structural state", () => {
    const source = invalidBuiltInPlanets(binaryComposition("immutability"));
    const sourceSnapshot = structuredClone(source);
    const patternRefs = source.planets.map((planet) => planet.pattern);
    const orbitRefs = source.planets.map((planet) => planet.orbit);
    const result = reconcilePlanetSoundPalettes(source);

    expect(source).toEqual(sourceSnapshot);
    result.planets.forEach((planet, index) => {
      expect(planet.pattern).toBe(patternRefs[index]);
      expect(planet.orbit).toBe(orbitRefs[index]);
    });
    expect(result.star).toBe(source.star);
    expect(result.planets).not.toBe(source.planets);
  });
});
