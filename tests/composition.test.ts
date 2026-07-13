import { describe, expect, it } from "vitest";

import {
  createStarterComposition,
  validateComposition,
} from "../src/domain/composition";
import { generateCompleteSystem } from "../src/domain/generation";
import {
  deserializeComposition,
  serializeComposition,
} from "../src/domain/serialization/codec";

describe("starter composition", () => {
  it("creates a deterministic valid starter", () => {
    const first = createStarterComposition("safe-seed");
    const second = createStarterComposition("safe-seed");
    expect(first).toEqual(second);
    expect(validateComposition(first)).toEqual({
      success: true,
      composition: first,
    });
  });

  it("round-trips through the versioned JSON codec", () => {
    const composition = createStarterComposition("round-trip");
    expect(deserializeComposition(serializeComposition(composition))).toEqual({
      success: true,
      composition,
    });
  });

  it("migrates schema-version-1 planets to role expression defaults", () => {
    const current = generateCompleteSystem("migration-v1");
    const legacy = {
      ...current,
      schemaVersion: 1,
      planets: current.planets.map(({ expression, ...planet }) => {
        void expression;
        return planet;
      }),
    };
    const result = deserializeComposition(JSON.stringify(legacy));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.composition.schemaVersion).toBe(2);
      expect(
        result.composition.planets.find((planet) => planet.role === "chords")
          ?.expression,
      ).toEqual({
        kind: "chords",
        voicingSpread:
          current.harmony.voicingId === "compact"
            ? 0
            : current.harmony.voicingId === "wide"
              ? 1
              : 0.5,
        chordComplexity: 0.18 + current.macros.complexity * 0.55,
      });
    }
  });

  it("rejects unsupported future versions", () => {
    const future = { ...createStarterComposition(), schemaVersion: 999 };
    const result = deserializeComposition(JSON.stringify(future));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("supports version");
  });
});
