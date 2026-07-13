import { describe, expect, it } from "vitest";

import { SHOWCASE_SYSTEMS } from "../src/content/showcaseSystems";
import { validateComposition } from "../src/domain/composition";
import { generateCompleteSystem } from "../src/domain/generation";

describe("showcase systems", () => {
  it("provides five distinct, valid, complete systems", () => {
    expect(SHOWCASE_SYSTEMS).toHaveLength(5);
    expect(new Set(SHOWCASE_SYSTEMS.map(({ seed }) => seed)).size).toBe(5);

    for (const showcase of SHOWCASE_SYSTEMS) {
      const composition = generateCompleteSystem(showcase.seed, {
        name: showcase.name,
        starPresetId: showcase.starPresetId,
      });

      expect(validateComposition(composition).success).toBe(true);
      expect(composition.planets.map(({ role }) => role)).toEqual([
        "beat",
        "bass",
        "chords",
        "melody",
        "texture",
      ]);
      expect(composition.name).toBe(showcase.name);
    }
  });
});
