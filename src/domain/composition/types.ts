export const CURRENT_SCHEMA_VERSION = 2 as const;

import type { SupportedLoopBars } from "./loopRates";

export type SchemaVersion = typeof CURRENT_SCHEMA_VERSION;
export type EntityId = string;
export type StarPresetId =
  "radiant" | "red-giant" | "dwarf" | "neutron" | "void";
export type ScaleId =
  "major-pentatonic" | "minor-pentatonic" | "dorian" | "major";
export type ProgressionId =
  | "bright"
  | "hopeful"
  | "reflective"
  | "driving"
  | "dark"
  | "floating"
  | "minimal";
export type VoicingPresetId = "compact" | "open" | "wide";
export type MoonBehaviorPresetId =
  "accent" | "echo" | "harmony" | "pickup" | "fill" | "counterpulse";
export type DrumVoiceId =
  "kick" | "snare" | "clap" | "closed-hat" | "open-hat" | "rim" | "perc";
export type ChordAction = "strike" | "hold" | "release";
export type MelodyContour = "ascending" | "alternating" | "descending";

export type PlanetRole = "beat" | "bass" | "chords" | "melody" | "texture";
export type LoopBars = SupportedLoopBars;
export type PatternGridSize = 4 | 6 | 8 | 12 | 16 | 24 | 32;

export interface Composition {
  schemaVersion: SchemaVersion;
  id: EntityId;
  name: string;
  createdAt: string;
  updatedAt: string;
  seed: string;
  bars: 4;
  beatsPerBar: 4;
  bpm: number;
  swing: number;
  star: StarState;
  harmony: HarmonyState;
  macros: MacroState;
  mix: MasterMixState;
  planets: PlanetState[];
  asteroidBelt?: AsteroidBeltState;
  generation: GenerationState;
}

export interface StarState {
  id: EntityId;
  presetId: StarPresetId;
  visualSeed: number;
  intensity: number;
  locked: boolean;
}

export type ChordDegree = number;

export interface HarmonyState {
  rootMidi: number;
  scaleId: ScaleId;
  progressionId: ProgressionId;
  customProgression?: ChordDegree[];
  safeHarmony: boolean;
  voicingId: VoicingPresetId;
}

export interface MacroState {
  energy: number;
  density: number;
  groove: number;
  space: number;
  complexity: number;
}

export interface PlanetState {
  id: EntityId;
  role: PlanetRole;
  name: string;
  soundPresetId: string;
  orbit: OrbitState;
  pattern: PatternState;
  mix: TrackMixState;
  appearance: PlanetAppearanceState;
  expression: PlanetExpressionState;
  moons: MoonState[];
  ring?: RingState;
  muted: boolean;
  soloed: boolean;
  locked: boolean;
}

export type PlanetExpressionState =
  | {
      kind: "chords";
      voicingSpread: number;
      chordComplexity: number;
    }
  | {
      kind: "melody";
      pitchVariety: number;
      contour: MelodyContour;
    }
  | { kind: "default" };

export interface OrbitState {
  loopBars: LoopBars;
  phase: number;
  inclination: number;
  /** @deprecated Scene orbit lanes are derived from all planet rates. */
  shellIndex: number;
  direction: 1;
}

export interface PatternState {
  gridSize: PatternGridSize;
  events: PatternEvent[];
  templateId?: string;
  humanize: number;
}

export interface PatternEvent {
  id: EntityId;
  step: number;
  velocity: number;
  probability: number;
  durationSteps: number;
  pitch?: PitchIntent;
  drumVoice?: DrumVoiceId;
  chordAction?: ChordAction;
}

export type PitchIntent =
  | { kind: "scaleDegree"; degree: number; octaveOffset: number }
  | { kind: "chordTone"; index: number; octaveOffset: number }
  | { kind: "root"; octaveOffset: number }
  | { kind: "fifth"; octaveOffset: number }
  | { kind: "absoluteMidi"; note: number };

export interface MoonState {
  id: EntityId;
  behaviorPresetId: MoonBehaviorPresetId;
  pattern: PatternState;
  orbitRatio: number;
  phase: number;
  level: number;
  probability: number;
  appearanceSeed: number;
  muted: boolean;
  locked: boolean;
}

export interface RingState {
  id: EntityId;
  type: "hat" | "shaker" | "perc" | "gate" | "delay" | "filter";
  segments: 8 | 16;
  active: boolean[];
  phase: number;
  velocityVariation: number;
  probability: number;
  soundPresetId: string;
  level: number;
}

export interface AsteroidBeltState {
  id: EntityId;
  materialPresetId: string;
  gridSize: 16 | 32;
  events: PatternEvent[];
  population: number;
  clustering: number;
  turbulence: number;
  accentChance: number;
  level: number;
  locked: boolean;
  visualSeed: number;
}

export interface TrackMixState {
  level: number;
  pan: number;
  filter: number;
  reverbSend: number;
  delaySend: number;
}

export interface MasterMixState {
  level: number;
  brightness: number;
  limiterEnabled: true;
}

export interface PlanetAppearanceState {
  visualSeed: number;
  hue: number;
  size: number;
  roughness: number;
}

export type GenerationDomain =
  | "star"
  | "harmony"
  | "beat"
  | "bass"
  | "chords"
  | "melody"
  | "texture"
  | "moons"
  | "ring"
  | "asteroids";

export interface GenerationState {
  revision: number;
  generatorVersion: string;
  lockedDomains: GenerationDomain[];
}
