import { describe, expect, it } from "vitest";

import {
  createStarterComposition,
  validateComposition,
} from "../src/domain/composition";
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

  it("rejects unsupported future versions", () => {
    const future = { ...createStarterComposition(), schemaVersion: 999 };
    const result = deserializeComposition(JSON.stringify(future));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("supports version");
  });
});
