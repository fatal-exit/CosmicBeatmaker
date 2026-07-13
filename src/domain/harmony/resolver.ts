import { getProgressionPreset } from "../../content/progressionPresets";
import type {
  HarmonyState,
  PitchIntent,
  PlanetRole,
  ScaleId,
} from "../composition/types";
import { getScaleIntervals } from "./scales";

export type PitchedRole = Exclude<PlanetRole, "beat">;

export interface MidiRange {
  min: number;
  max: number;
}

export const SAFE_REGISTER_RANGES = {
  bass: { min: 32, max: 52 },
  chords: { min: 48, max: 76 },
  melody: { min: 60, max: 88 },
  texture: { min: 45, max: 81 },
} as const satisfies Record<PitchedRole, MidiRange>;

export interface ResolvedChord {
  chordIndex: number;
  degree: number;
  label: string;
  rootMidi: number;
  pitches: readonly number[];
}

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

export function resolveScaleDegree(
  rootMidi: number,
  scaleId: ScaleId,
  degree: number,
  octaveOffset = 0,
): number {
  const intervals = getScaleIntervals(scaleId);
  const scaleIndex = positiveModulo(degree, intervals.length);
  const octave = Math.floor(degree / intervals.length) + octaveOffset;
  return rootMidi + intervals[scaleIndex] + octave * 12;
}

function resolveCustomChord(
  harmony: HarmonyState,
  chordIndex: number,
): ResolvedChord {
  const progression = harmony.customProgression ?? [0];
  const normalizedIndex = positiveModulo(chordIndex, progression.length);
  const degree = progression[normalizedIndex];
  const rootMidi = resolveScaleDegree(
    harmony.rootMidi,
    harmony.scaleId,
    degree,
  );
  const pitches = [degree, degree + 2, degree + 4].map((toneDegree) =>
    resolveScaleDegree(harmony.rootMidi, harmony.scaleId, toneDegree),
  );

  return {
    chordIndex: normalizedIndex,
    degree,
    label: `degree-${degree + 1}`,
    rootMidi,
    pitches,
  };
}

export function resolveChord(
  harmony: HarmonyState,
  chordIndex: number,
): ResolvedChord {
  if (harmony.customProgression && harmony.customProgression.length > 0) {
    return resolveCustomChord(harmony, chordIndex);
  }

  const progression = getProgressionPreset(harmony.progressionId);
  const normalizedIndex = positiveModulo(chordIndex, progression.chords.length);
  const chord = progression.chords[normalizedIndex];
  const rootMidi = harmony.rootMidi + chord.semitoneOffset;

  return {
    chordIndex: normalizedIndex,
    degree: chord.degree,
    label: chord.label,
    rootMidi,
    pitches: chord.intervals.map((interval) => rootMidi + interval),
  };
}

export function resolveProgression(
  harmony: HarmonyState,
): readonly ResolvedChord[] {
  const chordCount =
    harmony.customProgression && harmony.customProgression.length > 0
      ? harmony.customProgression.length
      : getProgressionPreset(harmony.progressionId).chords.length;

  return Array.from({ length: chordCount }, (_, index) =>
    resolveChord(harmony, index),
  );
}

export function resolveChordTones(
  harmony: HarmonyState,
  chordIndex: number,
): readonly number[] {
  return resolveChord(harmony, chordIndex).pitches;
}

export function fitMidiToRange(note: number, range: MidiRange): number {
  const roundedNote = Math.round(note);
  const minimumShift = Math.ceil((range.min - roundedNote) / 12);
  const maximumShift = Math.floor((range.max - roundedNote) / 12);

  if (minimumShift <= maximumShift) {
    const center = (range.min + range.max) / 2;
    let best = roundedNote + minimumShift * 12;

    for (let shift = minimumShift + 1; shift <= maximumShift; shift += 1) {
      const candidate = roundedNote + shift * 12;
      if (Math.abs(candidate - center) < Math.abs(best - center))
        best = candidate;
    }

    return best;
  }

  return Math.min(range.max, Math.max(range.min, roundedNote));
}

export function isMidiInScale(note: number, harmony: HarmonyState): boolean {
  const pitchClass = positiveModulo(note - harmony.rootMidi, 12);
  return getScaleIntervals(harmony.scaleId).includes(pitchClass);
}

export function isMidiInChord(
  note: number,
  harmony: HarmonyState,
  chordIndex: number,
): boolean {
  const pitchClass = positiveModulo(note, 12);
  return resolveChordTones(harmony, chordIndex).some(
    (chordTone) => positiveModulo(chordTone, 12) === pitchClass,
  );
}

function snapMidiToScale(note: number, harmony: HarmonyState): number {
  if (isMidiInScale(note, harmony)) return note;

  for (let distance = 1; distance <= 6; distance += 1) {
    if (isMidiInScale(note - distance, harmony)) return note - distance;
    if (isMidiInScale(note + distance, harmony)) return note + distance;
  }

  return note;
}

export interface ResolvePitchIntentOptions {
  role?: PitchedRole;
  chordIndex?: number;
}

export function resolvePitchIntent(
  intent: PitchIntent,
  harmony: HarmonyState,
  options: ResolvePitchIntentOptions = {},
): number {
  const role = options.role ?? "melody";
  const chordIndex = options.chordIndex ?? 0;
  let note: number;

  switch (intent.kind) {
    case "scaleDegree":
      note = resolveScaleDegree(
        harmony.rootMidi,
        harmony.scaleId,
        intent.degree,
        intent.octaveOffset,
      );
      break;
    case "chordTone": {
      const tones = resolveChordTones(harmony, chordIndex);
      const toneIndex = positiveModulo(intent.index, tones.length);
      const octave = Math.floor(intent.index / tones.length);
      note = tones[toneIndex] + (octave + intent.octaveOffset) * 12;
      break;
    }
    case "root":
      note = harmony.rootMidi + intent.octaveOffset * 12;
      break;
    case "fifth":
      note = harmony.rootMidi + 7 + intent.octaveOffset * 12;
      break;
    case "absoluteMidi":
      note = harmony.safeHarmony
        ? snapMidiToScale(intent.note, harmony)
        : intent.note;
      break;
  }

  return fitMidiToRange(note, SAFE_REGISTER_RANGES[role]);
}

export function isPitchIntentSafe(
  intent: PitchIntent,
  harmony: HarmonyState,
  options: ResolvePitchIntentOptions = {},
): boolean {
  const chordIndex = options.chordIndex ?? 0;
  const note = resolvePitchIntent(intent, harmony, options);

  return intent.kind === "chordTone"
    ? isMidiInChord(note, harmony, chordIndex)
    : isMidiInScale(note, harmony);
}
