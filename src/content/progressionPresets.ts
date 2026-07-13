import type { ProgressionId } from "../domain/composition/types";

export interface ProgressionChordDefinition {
  label: string;
  degree: number;
  semitoneOffset: number;
  intervals: readonly number[];
}

export interface ProgressionPresetDefinition {
  id: ProgressionId;
  name: string;
  theoryLabel: string;
  chords: readonly ProgressionChordDefinition[];
}

const majorChord = (label: string, degree: number, semitoneOffset: number) => ({
  label,
  degree,
  semitoneOffset,
  intervals: [0, 4, 7] as const,
});

const minorChord = (label: string, degree: number, semitoneOffset: number) => ({
  label,
  degree,
  semitoneOffset,
  intervals: [0, 3, 7] as const,
});

export const PROGRESSION_PRESETS = {
  bright: {
    id: "bright",
    name: "Bright",
    theoryLabel: "I–V–vi–IV",
    chords: [
      majorChord("I", 0, 0),
      majorChord("V", 4, 7),
      minorChord("vi", 5, 9),
      majorChord("IV", 3, 5),
    ],
  },
  hopeful: {
    id: "hopeful",
    name: "Hopeful",
    theoryLabel: "I–vi–IV–V",
    chords: [
      majorChord("I", 0, 0),
      minorChord("vi", 5, 9),
      majorChord("IV", 3, 5),
      majorChord("V", 4, 7),
    ],
  },
  reflective: {
    id: "reflective",
    name: "Reflective",
    theoryLabel: "vi–IV–I–V",
    chords: [
      minorChord("vi", 5, 9),
      majorChord("IV", 3, 5),
      majorChord("I", 0, 0),
      majorChord("V", 4, 7),
    ],
  },
  driving: {
    id: "driving",
    name: "Driving",
    theoryLabel: "i–VII–VI–VII",
    chords: [
      minorChord("i", 0, 0),
      majorChord("VII", 6, 10),
      majorChord("VI", 5, 8),
      majorChord("VII", 6, 10),
    ],
  },
  dark: {
    id: "dark",
    name: "Dark",
    theoryLabel: "i–VI–III–VII",
    chords: [
      minorChord("i", 0, 0),
      majorChord("VI", 5, 8),
      majorChord("III", 2, 3),
      majorChord("VII", 6, 10),
    ],
  },
  floating: {
    id: "floating",
    name: "Floating",
    theoryLabel: "I–Vsus–vi–IVadd9",
    chords: [
      majorChord("I", 0, 0),
      { label: "Vsus", degree: 4, semitoneOffset: 7, intervals: [0, 5, 7] },
      minorChord("vi", 5, 9),
      {
        label: "IVadd9",
        degree: 3,
        semitoneOffset: 5,
        intervals: [0, 4, 7, 14],
      },
    ],
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    theoryLabel: "i–VI",
    chords: [minorChord("i", 0, 0), majorChord("VI", 5, 8)],
  },
} as const satisfies Record<ProgressionId, ProgressionPresetDefinition>;

export function getProgressionPreset(
  progressionId: ProgressionId,
): ProgressionPresetDefinition {
  return PROGRESSION_PRESETS[progressionId];
}
