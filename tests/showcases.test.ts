import { describe, expect, it } from "vitest";

import { SHOWCASE_SYSTEMS } from "../src/content/showcaseSystems";
import { validateComposition } from "../src/domain/composition";
import { generateCompleteSystem } from "../src/domain/generation";
import { applyCompositionCommand } from "../src/state/commands";

describe("showcase systems", () => {
  it("provides authored, distinct, valid, complete systems", () => {
    expect(SHOWCASE_SYSTEMS).toHaveLength(7);
    expect(new Set(SHOWCASE_SYSTEMS.map(({ seed }) => seed)).size).toBe(7);

    for (const showcase of SHOWCASE_SYSTEMS) {
      const binaryCompanion =
        "binaryCompanion" in showcase ? showcase.binaryCompanion : undefined;
      const composition = generateCompleteSystem(showcase.seed, {
        name: showcase.name,
        starPresetId: showcase.starPresetId,
        binaryCompanion,
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
      if (showcase.id === "event-horizon") {
        expect(composition.star.presetId).toBe("black-hole");
      }
      if (showcase.id === "binary-dawn") {
        expect(composition.star.companion?.presetId).toBe("dwarf");
        expect(composition.star.companion?.rhythmMode).toBe("interlock");
        expect(composition.star.companion?.presetId).not.toBe(
          composition.star.presetId,
        );
      }
    }
  });

  it("preserves binary visual identity when its palette or rhythm changes", () => {
    const composition = generateCompleteSystem("showcase-binary-edit-v1", {
      binaryCompanion: { presetId: "dwarf", rhythmMode: "interlock" },
    });
    const companion = composition.star.companion;
    if (!companion) throw new Error("Expected a generated binary companion");

    const result = applyCompositionCommand(composition, {
      type: "SetBinaryCompanion",
      companion: {
        ...companion,
        presetId: "void",
        rhythmMode: "call-response",
      },
    });

    expect(result.composition.star.companion).toMatchObject({
      id: companion.id,
      visualSeed: companion.visualSeed,
      intensity: companion.intensity,
      presetId: "void",
      rhythmMode: "call-response",
    });
  });
});
