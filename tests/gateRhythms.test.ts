import { describe, expect, it } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
import {
  GATE_RHYTHM_PRESETS,
  applyGateRhythmPreset,
  inferGateRhythmPreset,
} from "../src/domain/rhythm/gatePresets";

describe("orbit gate rhythm presets", () => {
  it("offers four common beginner-safe gate layouts", () => {
    expect(GATE_RHYTHM_PRESETS.map(({ id }) => id)).toEqual([
      "steady",
      "offbeat",
      "sparse",
      "syncopated",
    ]);
  });

  it("scales common layouts to the pattern grid with stable unique IDs", () => {
    const planet = createStarterComposition("gate-preset").planets[0];
    const pattern = applyGateRhythmPreset(
      { ...planet.pattern, gridSize: 8, events: [] },
      "beat",
      "syncopated",
      planet.id,
    );

    expect(pattern.events.map(({ step }) => step)).toEqual([0, 2, 3, 5, 6]);
    expect(new Set(pattern.events.map(({ id }) => id)).size).toBe(
      pattern.events.length,
    );
    expect(inferGateRhythmPreset(pattern)).toBe("syncopated");
  });

  it("preserves authored events that already occupy a selected gate", () => {
    const planet = createStarterComposition("gate-preserve").planets[0];
    const original = planet.pattern.events.find(({ step }) => step === 0);
    const pattern = applyGateRhythmPreset(
      planet.pattern,
      planet.role,
      "sparse",
      planet.id,
    );

    expect(pattern.events[0]).toBe(original);
    expect(pattern.events.map(({ step }) => step)).toEqual([0, 8]);
  });
});
