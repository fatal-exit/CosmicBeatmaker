import { describe, expect, it } from "vitest";

import { resolveChordVoicing, resolveMidiNotes } from "../src/audio/harmony";
import { generateCompleteSystem } from "../src/domain/generation";
import { applyPlanetExpression } from "../src/domain/harmony/expression";
import { isMidiInChord, isMidiInScale } from "../src/domain/harmony/resolver";
import { applyCompositionCommand } from "../src/state/commands";

describe("chord expression", () => {
  it("turns chord events into consonant closed, open, and wide voicings", () => {
    const composition = generateCompleteSystem("chord-expression", {
      harmony: {
        rootMidi: 60,
        scaleId: "major-pentatonic",
        progressionId: "bright",
        safeHarmony: true,
        voicingId: "open",
      },
    });

    expect(
      resolveChordVoicing(composition, 0, {
        voicingSpread: 0,
        chordComplexity: 0,
      }),
    ).toEqual([60, 64, 67]);
    expect(
      resolveChordVoicing(composition, 0, {
        voicingSpread: 0.5,
        chordComplexity: 0,
      }),
    ).toEqual([48, 55, 64]);
    expect(
      resolveChordVoicing(composition, 0, {
        voicingSpread: 1,
        chordComplexity: 0,
      }),
    ).toEqual([48, 67, 76]);

    const chordPlanet = composition.planets.find(
      (planet) => planet.role === "chords",
    );
    expect(chordPlanet?.expression.kind).toBe("chords");
    const event = chordPlanet?.pattern.events[0];
    expect(
      resolveMidiNotes(composition, "chords", 0, event?.pitch, undefined, {
        expression: chordPlanet?.expression,
        sourceKind: "planet",
      }),
    ).toHaveLength(3);
  });

  it("adds color without low clusters and keeps every voicing bounded", () => {
    const composition = generateCompleteSystem("safe-rich-chords");
    for (const progressionId of [
      "bright",
      "hopeful",
      "reflective",
      "driving",
      "dark",
      "floating",
      "minimal",
    ] as const) {
      composition.harmony.progressionId = progressionId;
      for (let bar = 0; bar < 4; bar += 1) {
        for (const voicingSpread of [0, 0.5, 1]) {
          const notes = resolveChordVoicing(composition, bar, {
            voicingSpread,
            chordComplexity: 1,
          });
          expect(notes).toHaveLength(4);
          expect(notes).toEqual([...notes].sort((left, right) => left - right));
          expect(
            notes[0],
            JSON.stringify({ progressionId, bar, voicingSpread, notes }),
          ).toBeGreaterThanOrEqual(45);
          expect(
            notes.at(-1),
            JSON.stringify({ progressionId, bar, voicingSpread, notes }),
          ).toBeLessThanOrEqual(86);
          for (let index = 1; index < notes.length; index += 1) {
            expect(
              notes[index] - notes[index - 1],
              JSON.stringify({ progressionId, bar, voicingSpread, notes }),
            ).toBeGreaterThanOrEqual(voicingSpread === 0 ? 3 : 4);
          }
          for (const note of notes) {
            expect(
              isMidiInChord(note, composition.harmony, bar) ||
                isMidiInScale(note, composition.harmony),
              JSON.stringify({ progressionId, bar, voicingSpread, notes }),
            ).toBe(true);
          }
        }
      }
    }
  });

  it("updates chord controls through bounded undoable command state", () => {
    const composition = generateCompleteSystem("commanded-chords");
    const chordPlanet = composition.planets.find(
      (planet) => planet.role === "chords",
    );
    expect(chordPlanet).toBeDefined();

    const changed = applyCompositionCommand(composition, {
      type: "SetChordExpression",
      planetId: chordPlanet!.id,
      expression: { voicingSpread: 4, chordComplexity: -1 },
      timestamp: composition.updatedAt,
    }).composition;
    const expression = changed.planets.find(
      (planet) => planet.id === chordPlanet!.id,
    )?.expression;
    expect(expression).toEqual({
      kind: "chords",
      voicingSpread: 1,
      chordComplexity: 0,
    });
  });
});

describe("melody expression", () => {
  const pattern = {
    gridSize: 16 as const,
    humanize: 0,
    events: Array.from({ length: 8 }, (_, index) => ({
      id: `melody-${index}`,
      step: index * 2,
      velocity: 0.7,
      probability: 1,
      durationSteps: 1,
      pitch: {
        kind: "scaleDegree" as const,
        degree: 2,
        octaveOffset: 1,
      },
    })),
  };

  function degrees(contour: "ascending" | "alternating" | "descending") {
    return applyPlanetExpression(pattern, {
      kind: "melody",
      pitchVariety: 1,
      contour,
    }).events.map((event) =>
      event.pitch?.kind === "scaleDegree" ? event.pitch.degree : undefined,
    );
  }

  it("projects ascending, descending, and alternating contours deterministically", () => {
    expect(degrees("ascending")).toEqual([0, 1, 2, 3, 4, 0, 1, 2]);
    expect(degrees("descending")).toEqual([4, 3, 2, 1, 0, 4, 3, 2]);
    expect(degrees("alternating")).toEqual([0, 1, 2, 3, 4, 3, 2, 1]);
    expect(degrees("alternating")).toEqual(degrees("alternating"));
  });

  it("collapses to a focused pitch at minimum variety", () => {
    const focused = applyPlanetExpression(pattern, {
      kind: "melody",
      pitchVariety: 0,
      contour: "ascending",
    });
    expect(
      focused.events.map((event) =>
        event.pitch?.kind === "scaleDegree" ? event.pitch.degree : undefined,
      ),
    ).toEqual(Array.from({ length: 8 }, () => 0));
  });
});
