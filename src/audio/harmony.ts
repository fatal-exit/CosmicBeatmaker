import { voicingSpreadForPreset } from "../domain/composition/expression";
import type {
  Composition,
  PitchIntent,
  PlanetExpressionState,
  PlanetRole,
  ScaleId,
} from "../domain/composition/types";
import { resolveChord } from "../domain/harmony/resolver";
import { AUDIO_PPQ, MIDI_DRUM_NOTES } from "./constants";
import type { AudioSourceKind } from "./types";

const SCALE_INTERVALS: Record<ScaleId, readonly number[]> = {
  "major-pentatonic": [0, 2, 4, 7, 9],
  "minor-pentatonic": [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

function scaleDegreeToMidi(
  rootMidi: number,
  scale: readonly number[],
  degree: number,
): number {
  const index = positiveModulo(degree, scale.length);
  return rootMidi + scale[index] + floorDiv(degree, scale.length) * 12;
}

function clampMidi(note: number): number {
  return Math.max(0, Math.min(127, Math.round(note)));
}

function chordToneForBar(
  composition: Composition,
  barIndex: number,
  toneIndex: number,
): number {
  const tones = resolveChord(composition.harmony, barIndex).pitches;
  const normalizedIndex = positiveModulo(toneIndex, tones.length);
  const octave = Math.floor(toneIndex / tones.length);
  return (tones[normalizedIndex] ?? composition.harmony.rootMidi) + octave * 12;
}

function chordRootForBar(composition: Composition, barIndex: number): number {
  return resolveChord(composition.harmony, barIndex).rootMidi;
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

function fitVoicingToRegister(notes: readonly number[]): readonly number[] {
  let fitted = [...new Set(notes.map(Math.round))].sort(
    (left, right) => left - right,
  );
  while ((fitted[0] ?? 48) < 45 && (fitted.at(-1) ?? 72) + 12 <= 86) {
    fitted = fitted.map((note) => note + 12);
  }
  while ((fitted.at(-1) ?? 72) > 86 && (fitted[0] ?? 48) - 12 >= 45) {
    fitted = fitted.map((note) => note - 12);
  }
  return fitted.map(clampMidi);
}

function fitNoteToVoicingRegister(note: number): number {
  let fitted = note;
  while (fitted < 45) fitted += 12;
  while (fitted > 86) fitted -= 12;
  return fitted;
}

function resolveColorTone(
  composition: Composition,
  chord: ReturnType<typeof resolveChord>,
): number {
  if (chord.pitches[3] !== undefined) return chord.pitches[3];

  const scale = SCALE_INTERVALS[composition.harmony.scaleId];
  const chordPitchClasses = new Set(
    chord.pitches.map((note) => positiveModulo(note, 12)),
  );
  const firstCandidate = Math.max(
    chord.rootMidi + 12,
    (chord.pitches[2] ?? chord.rootMidi + 7) + 3,
  );

  for (let note = firstCandidate; note <= chord.rootMidi + 23; note += 1) {
    const relativePitchClass = positiveModulo(
      note - composition.harmony.rootMidi,
      12,
    );
    if (
      scale.includes(relativePitchClass) &&
      !chordPitchClasses.has(positiveModulo(note, 12))
    ) {
      return note;
    }
  }

  return chord.rootMidi + 12;
}

function placeWideColorTone(
  baseNotes: readonly number[],
  colorTone: number,
): number {
  const minimumBaseNote = Math.min(...baseNotes);
  const maximumBaseNote = Math.max(...baseNotes);
  const candidates = [-24, -12, 0, 12, 24]
    .map((octaveShift) => colorTone + octaveShift)
    .filter(
      (candidate) =>
        candidate >= 45 &&
        candidate <= 86 &&
        Math.max(maximumBaseNote, candidate) -
          Math.min(minimumBaseNote, candidate) <=
          41 &&
        !baseNotes.includes(candidate),
    );

  return candidates.reduce((best, candidate) => {
    const candidateSpacing = Math.min(
      ...baseNotes.map((note) => Math.abs(candidate - note)),
    );
    const bestSpacing = Math.min(
      ...baseNotes.map((note) => Math.abs(best - note)),
    );
    return candidateSpacing > bestSpacing ? candidate : best;
  }, candidates[0] ?? colorTone);
}

export interface ChordVoicingOptions {
  voicingSpread: number;
  chordComplexity: number;
}

/**
 * Produces bounded consonant voicings from the canonical progression chord.
 * Complexity adds either a stable octave or a separated ninth; it never adds
 * a close low-register cluster.
 */
export function resolveChordVoicing(
  composition: Composition,
  barIndex: number,
  options: ChordVoicingOptions,
): readonly number[] {
  const chord = resolveChord(composition.harmony, barIndex);
  const root = chord.rootMidi;
  const third = chord.pitches[1] ?? root + 4;
  const fifth = chord.pitches[2] ?? root + 7;
  const colorTone = resolveColorTone(composition, chord);
  const spread = Math.max(0, Math.min(1, options.voicingSpread));
  const complexity = Math.max(0, Math.min(1, options.chordComplexity));
  let baseNotes: number[];

  if (spread < 0.25) {
    baseNotes =
      Math.abs(fifth - third) < 3
        ? [root, fifth, third + 12]
        : [root, third, fifth];
  } else if (spread < 0.75) {
    baseNotes = [root - 12, fifth - 12, third];
  } else {
    baseNotes = [root - 12, fifth, third + 12];
  }

  const notes = [...fitVoicingToRegister(baseNotes)];
  const baseShift = notes[0] - Math.min(...baseNotes);
  const shiftedRoot = root + baseShift;
  const shiftedColorTone = colorTone + baseShift;

  if (spread < 0.25) {
    if (complexity >= 0.72) {
      notes.push(fitNoteToVoicingRegister(shiftedColorTone));
    } else if (complexity >= 0.34) {
      notes.push(fitNoteToVoicingRegister(shiftedRoot + 12));
    }
  } else if (spread < 0.75) {
    if (complexity >= 0.72) {
      notes.push(fitNoteToVoicingRegister(shiftedColorTone));
    } else if (complexity >= 0.34) {
      notes.push(fitNoteToVoicingRegister(shiftedRoot + 12));
    }
  } else {
    if (complexity >= 0.72) {
      notes.push(placeWideColorTone(notes, shiftedColorTone));
    } else if (complexity >= 0.34) {
      notes.push(fitNoteToVoicingRegister(shiftedRoot));
    }
  }

  return fitVoicingToRegister(notes);
}

export interface ResolveMidiNotesOptions {
  expression?: PlanetExpressionState;
  sourceKind?: AudioSourceKind;
}

export function resolveMidiNotes(
  composition: Composition,
  role: PlanetRole,
  tick: number,
  pitch?: PitchIntent,
  drumVoice?: keyof typeof MIDI_DRUM_NOTES,
  options: ResolveMidiNotesOptions = {},
): readonly number[] {
  if (role === "beat") {
    return [MIDI_DRUM_NOTES[drumVoice ?? "perc"]];
  }

  const barIndex = Math.floor(tick / (composition.beatsPerBar * AUDIO_PPQ));
  if (role === "chords" && (options.sourceKind ?? "planet") === "planet") {
    const chordExpression =
      options.expression?.kind === "chords"
        ? options.expression
        : {
            voicingSpread: voicingSpreadForPreset(
              composition.harmony.voicingId,
            ),
            chordComplexity: composition.macros.complexity,
          };
    return resolveChordVoicing(composition, barIndex, chordExpression);
  }
  if (pitch) return [clampMidi(resolveIntent(composition, pitch, barIndex))];

  const root = chordRootForBar(composition, barIndex);
  switch (role) {
    case "bass":
      return [clampMidi(root - 24)];
    case "chords":
      return resolveChordVoicing(composition, barIndex, {
        voicingSpread: voicingSpreadForPreset(composition.harmony.voicingId),
        chordComplexity: composition.macros.complexity,
      });
    case "melody":
      return [clampMidi(root + 12)];
    case "texture":
      return [clampMidi(root)];
  }
}
