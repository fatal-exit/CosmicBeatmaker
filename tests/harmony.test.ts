import { describe, expect, it } from "vitest";

import { PROGRESSION_PRESETS } from "../src/content/progressionPresets";
import type {
  HarmonyState,
  PitchIntent,
  ProgressionId,
} from "../src/domain/composition/types";
import {
  SAFE_REGISTER_RANGES,
  isMidiInChord,
  isMidiInScale,
  isPitchIntentSafe,
  resolveChord,
  resolvePitchIntent,
  resolveProgression,
  resolveScaleDegree,
} from "../src/domain/harmony";

const harmony: HarmonyState = {
  rootMidi: 60,
  scaleId: "major-pentatonic",
  progressionId: "bright",
  safeHarmony: true,
  voicingId: "open",
};

describe("harmony resolution", () => {
  it("resolves ascending and descending scale degrees", () => {
    expect(
      [-1, 0, 1, 2, 3, 4, 5].map((degree) =>
        resolveScaleDegree(60, "major-pentatonic", degree),
      ),
    ).toEqual([57, 60, 62, 64, 67, 69, 72]);
    expect(resolveScaleDegree(60, "dorian", 7, 1)).toBe(84);
  });

  it("resolves every progression into stable concrete chord tones", () => {
    expect(resolveProgression(harmony).map((chord) => chord.rootMidi)).toEqual([
      60, 67, 69, 65,
    ]);

    for (const progressionId of Object.keys(
      PROGRESSION_PRESETS,
    ) as ProgressionId[]) {
      const progression = resolveProgression({ ...harmony, progressionId });
      expect(progression).toHaveLength(
        PROGRESSION_PRESETS[progressionId].chords.length,
      );
      for (const chord of progression) {
        expect(chord.pitches.length).toBeGreaterThanOrEqual(3);
        expect(chord.pitches).toEqual([...chord.pitches].sort((a, b) => a - b));
      }
    }
  });

  it("keeps custom progression triads inside the selected scale", () => {
    const custom: HarmonyState = {
      ...harmony,
      scaleId: "dorian",
      customProgression: [0, 3, 4, 6],
    };

    for (let index = 0; index < custom.customProgression!.length; index += 1) {
      const chord = resolveChord(custom, index);
      expect(chord.pitches.every((note) => isMidiInScale(note, custom))).toBe(
        true,
      );
    }
  });

  it("resolves pitch intents safely and inside role registers", () => {
    const cases: Array<{
      intent: PitchIntent;
      role: keyof typeof SAFE_REGISTER_RANGES;
      chordIndex?: number;
    }> = [
      {
        intent: { kind: "scaleDegree", degree: 4, octaveOffset: 1 },
        role: "melody",
      },
      {
        intent: { kind: "chordTone", index: 2, octaveOffset: -1 },
        role: "bass",
        chordIndex: 2,
      },
      { intent: { kind: "root", octaveOffset: 0 }, role: "chords" },
      { intent: { kind: "fifth", octaveOffset: 1 }, role: "texture" },
      {
        intent: { kind: "absoluteMidi", note: 61 },
        role: "melody",
      },
    ];

    for (const testCase of cases) {
      const note = resolvePitchIntent(testCase.intent, harmony, testCase);
      const range = SAFE_REGISTER_RANGES[testCase.role];
      expect(note).toBeGreaterThanOrEqual(range.min);
      expect(note).toBeLessThanOrEqual(range.max);
      expect(isPitchIntentSafe(testCase.intent, harmony, testCase)).toBe(true);
    }
  });

  it("treats chord tones as safe against their active chord", () => {
    const intent: PitchIntent = {
      kind: "chordTone",
      index: 1,
      octaveOffset: 1,
    };
    const note = resolvePitchIntent(intent, harmony, {
      role: "melody",
      chordIndex: 3,
    });
    expect(isMidiInChord(note, harmony, 3)).toBe(true);
  });

  it("re-resolves intent when harmony changes instead of storing stale notes", () => {
    const intent: PitchIntent = {
      kind: "scaleDegree",
      degree: 2,
      octaveOffset: 1,
    };
    const before = resolvePitchIntent(intent, harmony, { role: "melody" });
    const after = resolvePitchIntent(
      intent,
      { ...harmony, rootMidi: harmony.rootMidi + 2 },
      { role: "melody" },
    );
    expect(after - before).toBe(2);
  });
});
