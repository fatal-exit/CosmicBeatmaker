import { describe, expect, it } from "vitest";

import {
  STAR_MOOD_PRESET_IDS,
  getStarPresetForMood,
  type StarMood,
} from "../src/content/starPresets";
import type {
  Composition,
  PitchIntent,
  PlanetState,
} from "../src/domain/composition/types";
import { validateComposition } from "../src/domain/composition/validation";
import {
  generateCompleteSystem,
  generatePlanetForRole,
  isTrackMixWithinSafeRange,
  regenerateSystem,
  shouldTriggerEvent,
} from "../src/domain/generation";
import {
  SAFE_REGISTER_RANGES,
  isPitchIntentSafe,
  resolvePitchIntent,
} from "../src/domain/harmony";
import { getRhythmAnchorKeys } from "../src/domain/rhythm";

function getPlanet(
  composition: Composition,
  role: PlanetState["role"],
): PlanetState {
  const planet = composition.planets.find(
    (candidate) => candidate.role === role,
  );
  if (!planet) throw new Error(`Missing ${role} planet.`);
  return planet;
}

function chordIndexForEvent(planet: PlanetState, step: number): number {
  const stepsPerBar = planet.pattern.gridSize / planet.orbit.loopBars;
  return Math.floor(step / stepsPerBar);
}

describe("complete-system generation", () => {
  it("maps all five beginner mood labels to schema preset IDs", () => {
    const moods = Object.keys(STAR_MOOD_PRESET_IDS) as StarMood[];
    expect(moods).toEqual(["Radiant", "Warm", "Delicate", "Pulsing", "Void"]);

    for (const mood of moods) {
      const preset = getStarPresetForMood(mood);
      expect(preset.id).toBe(STAR_MOOD_PRESET_IDS[mood]);
      expect(
        generateCompleteSystem(`mood-${mood}`, {
          starPresetId: preset.id,
        }).star.presetId,
      ).toBe(preset.id);
    }
  });

  it("produces exactly equal state for the same seed", () => {
    expect(generateCompleteSystem("same-cosmos")).toEqual(
      generateCompleteSystem("same-cosmos"),
    );
  });

  it("produces meaningful variation for different seeds", () => {
    const first = generateCompleteSystem("variation-a");
    const second = generateCompleteSystem("variation-b");

    expect({
      star: first.star.presetId,
      bpm: first.bpm,
      harmony: first.harmony,
      sounds: first.planets.map((planet) => planet.soundPresetId),
      patterns: first.planets.map((planet) => planet.pattern),
    }).not.toEqual({
      star: second.star.presetId,
      bpm: second.bpm,
      harmony: second.harmony,
      sounds: second.planets.map((planet) => planet.soundPresetId),
      patterns: second.planets.map((planet) => planet.pattern),
    });
  });

  it("creates a valid safe five-role groove across a seed sample", () => {
    for (let index = 0; index < 32; index += 1) {
      const composition = generateCompleteSystem(`validation-${index}`);
      expect(validateComposition(composition).success).toBe(true);
      expect(composition.planets.map((planet) => planet.role)).toEqual([
        "beat",
        "bass",
        "chords",
        "melody",
        "texture",
      ]);
      expect(composition.harmony.safeHarmony).toBe(true);
      expect(composition.bpm).toBeGreaterThanOrEqual(70);
      expect(composition.bpm).toBeLessThanOrEqual(140);
      expect(composition.swing).toBeGreaterThanOrEqual(0);
      expect(composition.swing).toBeLessThanOrEqual(0.6);

      for (const planet of composition.planets) {
        expect(isTrackMixWithinSafeRange(planet.role, planet.mix)).toBe(true);
        expect(
          planet.pattern.events.every(
            (event) => event.step >= 0 && event.step < planet.pattern.gridSize,
          ),
        ).toBe(true);
      }
    }
  });

  it("uses safe pitch intents that resolve inside each role register", () => {
    const composition = generateCompleteSystem("pitch-safety");

    for (const planet of composition.planets) {
      if (planet.role === "beat") continue;
      const role = planet.role;
      const range = SAFE_REGISTER_RANGES[role];

      for (const event of planet.pattern.events) {
        expect(event.pitch).toBeDefined();
        expect(event.pitch?.kind).not.toBe("absoluteMidi");
        const chordIndex = chordIndexForEvent(planet, event.step);
        const intent = event.pitch as PitchIntent;
        const note = resolvePitchIntent(intent, composition.harmony, {
          role,
          chordIndex,
        });
        expect(note).toBeGreaterThanOrEqual(range.min);
        expect(note).toBeLessThanOrEqual(range.max);
        expect(
          isPitchIntentSafe(intent, composition.harmony, {
            role,
            chordIndex,
          }),
        ).toBe(true);
      }
    }
  });

  it("preserves beat anchors and bass roots on every chord boundary", () => {
    const composition = generateCompleteSystem("structural-anchors");
    const beat = getPlanet(composition, "beat");
    const bass = getPlanet(composition, "bass");
    const beatKeys = beat.pattern.events.map(
      (event) => `${event.step}:${event.drumVoice}`,
    );
    const requiredBeatAnchors = getRhythmAnchorKeys(
      beat.pattern.templateId as Parameters<typeof getRhythmAnchorKeys>[0],
    );

    expect(
      requiredBeatAnchors.every((anchor) => beatKeys.includes(anchor)),
    ).toBe(true);
    for (const step of [0, 8, 16, 24]) {
      const event = bass.pattern.events.find(
        (candidate) => candidate.step === step,
      );
      expect(event?.probability).toBe(1);
      expect(event?.pitch).toEqual({
        kind: "chordTone",
        index: 0,
        octaveOffset: -1,
      });
    }
  });

  it("regenerates deterministically while preserving requested and individual locks", () => {
    const original = generateCompleteSystem("locked-system");
    const bass = getPlanet(original, "bass");
    const locked: Composition = {
      ...original,
      star: { ...original.star, locked: true },
      planets: original.planets.map((planet) =>
        planet.id === bass.id ? { ...planet, locked: true } : planet,
      ),
      generation: {
        ...original.generation,
        lockedDomains: ["harmony", "melody"],
      },
    };
    const first = regenerateSystem(locked);
    const second = regenerateSystem(locked);

    expect(first).toEqual(second);
    expect(first.star).toEqual(locked.star);
    expect(first.harmony).toEqual(locked.harmony);
    expect(getPlanet(first, "bass")).toEqual(getPlanet(locked, "bass"));
    expect(getPlanet(first, "melody")).toEqual(getPlanet(locked, "melody"));
    expect(getPlanet(first, "beat")).not.toEqual(getPlanet(locked, "beat"));
    expect(first.generation.revision).toBe(1);
    expect(validateComposition(first).success).toBe(true);
  });

  it("regenerates one selected domain without touching unrelated roles", () => {
    const original = generateCompleteSystem("one-domain");
    const regenerated = regenerateSystem(original, { domains: ["chords"] });

    expect(regenerated.star).toEqual(original.star);
    expect(regenerated.harmony).toEqual(original.harmony);
    expect(getPlanet(regenerated, "beat")).toEqual(getPlanet(original, "beat"));
    expect(getPlanet(regenerated, "bass")).toEqual(getPlanet(original, "bass"));
    expect(getPlanet(regenerated, "chords")).not.toEqual(
      getPlanet(original, "chords"),
    );
    expect(getPlanet(regenerated, "melody")).toEqual(
      getPlanet(original, "melody"),
    );
    expect(getPlanet(regenerated, "texture")).toEqual(
      getPlanet(original, "texture"),
    );
  });

  it("generates a deterministic additional planet from composition context", () => {
    const composition = generateCompleteSystem("add-one-role");
    const first = generatePlanetForRole(composition, "bass");
    const second = generatePlanetForRole(composition, "bass");

    expect(first).toEqual(second);
    expect(first.role).toBe("bass");
    expect(composition.planets.some((planet) => planet.id === first.id)).toBe(
      false,
    );
    expect(
      validateComposition({
        ...composition,
        planets: [...composition.planets, first],
      }).success,
    ).toBe(true);
  });
});

describe("deterministic event probability", () => {
  it("repeats for seed, event, and loop while evolving across loops", () => {
    const firstPass = Array.from({ length: 64 }, (_, loopIndex) =>
      shouldTriggerEvent("probability-seed", "event-a", loopIndex, 0.5),
    );
    const secondPass = Array.from({ length: 64 }, (_, loopIndex) =>
      shouldTriggerEvent("probability-seed", "event-a", loopIndex, 0.5),
    );

    expect(firstPass).toEqual(secondPass);
    expect(new Set(firstPass).size).toBe(2);
    expect(shouldTriggerEvent("probability-seed", "event-a", 0, 0)).toBe(false);
    expect(shouldTriggerEvent("probability-seed", "event-a", 0, 1)).toBe(true);
  });

  it("rejects invalid loop indexes and probability values", () => {
    expect(() => shouldTriggerEvent("seed", "event", -1, 0.5)).toThrow(
      /loop index/,
    );
    expect(() => shouldTriggerEvent("seed", "event", 0, 1.1)).toThrow(
      /between zero and one/,
    );
  });
});
