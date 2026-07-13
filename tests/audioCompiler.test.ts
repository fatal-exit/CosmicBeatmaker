import { describe, expect, it } from "vitest";

import { compileComposition } from "../src/audio/CompositionCompiler";
import { orbitPhaseAtTick } from "../src/audio/timing";
import { createStarterComposition } from "../src/domain/composition/starter";

describe("composition audio compiler", () => {
  it("compiles exact integer timing, duration, and velocity for the starter beat", () => {
    const composition = createStarterComposition("compiler-timing");
    const sequence = compileComposition(composition);

    expect(sequence.ppq).toBe(480);
    expect(sequence.totalTicks).toBe(4 * 4 * 480);
    expect(sequence.occurrences).toHaveLength(16);
    expect(
      sequence.occurrences.slice(0, 5).map((event) => event.startTick),
    ).toEqual([0, 480, 960, 1_440, 1_920]);
    expect(sequence.occurrences[0]).toMatchObject({
      durationTicks: 120,
      velocity: 1,
      drumVoice: "kick",
      midiNotes: [36],
    });
    expect(
      sequence.occurrences.every((event) => Number.isInteger(event.startTick)),
    ).toBe(true);
  });

  it("rotates pattern events by orbit phase without changing their spacing", () => {
    const composition = createStarterComposition("compiler-phase");
    composition.planets[0].orbit.phase = 0.25;
    const firstEventId = composition.planets[0].pattern.events[0].id;

    const sequence = compileComposition(composition);
    const occurrences = sequence.occurrences.filter(
      (event) => event.eventId === firstEventId,
    );

    expect(occurrences.map((event) => event.startTick)).toEqual([
      480, 2_400, 4_320, 6_240,
    ]);
  });

  it("evolves probability deterministically by composition loop index", () => {
    const composition = createStarterComposition("compiler-probability");
    const event = composition.planets[0].pattern.events[0];
    event.probability = 0.5;

    const left = compileComposition(composition, { loops: 16 });
    const right = compileComposition(composition, { loops: 16 });
    expect(right).toEqual(left);

    const activeLoops = new Set(
      left.occurrences
        .filter((occurrence) => occurrence.eventId === event.id)
        .map((occurrence) => occurrence.loopIndex),
    );
    expect(activeLoops.size).toBeGreaterThan(0);
    expect(activeLoops.size).toBeLessThan(16);
    for (let loopIndex = 0; loopIndex < 16; loopIndex += 1) {
      const count = left.occurrences.filter(
        (occurrence) =>
          occurrence.eventId === event.id && occurrence.loopIndex === loopIndex,
      ).length;
      expect([0, 4]).toContain(count);
    }
  });

  it("exposes orbit phase as pure transport math", () => {
    expect(orbitPhaseAtTick(0, 1, 0.25)).toBe(0.25);
    expect(orbitPhaseAtTick(480, 1, 0.25)).toBe(0.5);
    expect(orbitPhaseAtTick(1_920, 1, 0.25)).toBe(0.25);
  });
});
