import { describe, expect, it } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
import {
  decodeShareState,
  encodeShareState,
} from "../src/persistence/shareCodec";
import { sanitizeFilename } from "../src/ui/export/downloads";

describe("share codec", () => {
  it("round-trips a complete edited composition", () => {
    const composition = {
      ...createStarterComposition("shared"),
      name: "Shared orbit",
    };
    expect(decodeShareState(encodeShareState(composition))).toEqual({
      success: true,
      composition,
    });
  });

  it("rejects a damaged payload", () => {
    const encoded = encodeShareState(createStarterComposition("damaged"));
    const result = decodeShareState(`${encoded.slice(0, -1)}x`);
    expect(result.success).toBe(false);
  });
});

describe("export filenames", () => {
  it("removes unsafe filename characters", () => {
    expect(sanitizeFilename(" My / Cosmic: Beat? ")).toBe("My-Cosmic-Beat");
  });
});
