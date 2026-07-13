import type {
  Composition,
  PitchIntent,
  PlanetRole,
  ProgressionId,
  ScaleId,
} from "../domain/composition/types";
import { AUDIO_PPQ, MIDI_DRUM_NOTES } from "./constants";

const SCALE_INTERVALS: Record<ScaleId, readonly number[]> = {
  "major-pentatonic": [0, 2, 4, 7, 9],
  "minor-pentatonic": [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

const HARMONIC_SCALE_INTERVALS: Record<ScaleId, readonly number[]> = {
  "major-pentatonic": [0, 2, 4, 5, 7, 9, 11],
  "minor-pentatonic": [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

const PROGRESSION_DEGREES: Record<ProgressionId, readonly number[]> = {
  bright: [0, 4, 5, 3],
  hopeful: [0, 5, 3, 4],
  reflective: [5, 3, 0, 4],
  driving: [0, 6, 5, 6],
  dark: [0, 5, 2, 6],
  floating: [0, 4, 5, 3],
  minimal: [0, 3, 0, 3],
};

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

function scaleDegreeToMidi(
  rootMidi: number,
  scale: readonly number[],
  degree: number,
): number {
  const index = ((degree % scale.length) + scale.length) % scale.length;
  return rootMidi + scale[index] + floorDiv(degree, scale.length) * 12;
}

function clampMidi(note: number): number {
  return Math.max(0, Math.min(127, Math.round(note)));
}

function chordDegreeForBar(composition: Composition, barIndex: number): number {
  const progression =
    composition.harmony.customProgression ??
    PROGRESSION_DEGREES[composition.harmony.progressionId];
  return progression[barIndex % progression.length] ?? 0;
}

function chordToneForBar(
  composition: Composition,
  barIndex: number,
  toneIndex: number,
): number {
  const degree = chordDegreeForBar(composition, barIndex) + toneIndex * 2;
  return scaleDegreeToMidi(
    composition.harmony.rootMidi,
    HARMONIC_SCALE_INTERVALS[composition.harmony.scaleId],
    degree,
  );
}

function chordRootForBar(composition: Composition, barIndex: number): number {
  return chordToneForBar(composition, barIndex, 0);
}

function resolveIntent(
  composition: Composition,
  intent: PitchIntent,
  barIndex: number,
): number {
  const scale = SCALE_INTERVALS[composition.harmony.scaleId];
  const chordRoot = chordRootForBar(composition, barIndex);
  switch (intent.kind) {
    case "absoluteMidi":
      return intent.note;
    case "root":
      return chordRoot + intent.octaveOffset * 12;
    case "fifth":
      return chordRoot + 7 + intent.octaveOffset * 12;
    case "scaleDegree":
      return (
        scaleDegreeToMidi(composition.harmony.rootMidi, scale, intent.degree) +
        intent.octaveOffset * 12
      );
    case "chordTone":
      return (
        chordToneForBar(composition, barIndex, intent.index) +
        intent.octaveOffset * 12
      );
  }
}

export function resolveMidiNotes(
  composition: Composition,
  role: PlanetRole,
  tick: number,
  pitch?: PitchIntent,
  drumVoice?: keyof typeof MIDI_DRUM_NOTES,
): readonly number[] {
  if (role === "beat") {
    return [MIDI_DRUM_NOTES[drumVoice ?? "perc"]];
  }

  const barIndex = Math.floor(tick / (composition.beatsPerBar * AUDIO_PPQ));
  if (pitch) return [clampMidi(resolveIntent(composition, pitch, barIndex))];

  const root = chordRootForBar(composition, barIndex);
  switch (role) {
    case "bass":
      return [clampMidi(root - 24)];
    case "chords":
      return [0, 1, 2].map((toneIndex) =>
        clampMidi(chordToneForBar(composition, barIndex, toneIndex)),
      );
    case "melody":
      return [clampMidi(root + 12)];
    case "texture":
      return [clampMidi(root)];
  }
}
