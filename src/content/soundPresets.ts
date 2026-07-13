import type {
  DrumVoiceId,
  PlanetRole,
  StarPresetId,
} from "../domain/composition/types";
import { PROCEDURAL_SAMPLE_ASSETS } from "./generatedProceduralSampleAssets";

export interface SoundPresetDefinition {
  id: string;
  name: string;
  role: PlanetRole;
}

export const SOUND_PRESETS = [
  { id: "clean-orbit", name: "Clean Orbit", role: "beat" },
  { id: "soft-impact", name: "Soft Impact", role: "beat" },
  { id: "small-dry", name: "Small Dry", role: "beat" },
  { id: "metallic-array", name: "Metallic Array", role: "beat" },
  { id: "heavy-void", name: "Heavy Void", role: "beat" },
  { id: "deep-sub", name: "Deep Sub", role: "bass" },
  { id: "warm-pulse", name: "Warm Pulse", role: "bass" },
  { id: "rough-drive", name: "Rough Drive", role: "bass" },
  { id: "cosmic-drone", name: "Cosmic Drone", role: "bass" },
  { id: "warm-pad", name: "Warm Pad", role: "chords" },
  { id: "soft-keys", name: "Soft Keys", role: "chords" },
  { id: "glass-chords", name: "Glass Chords", role: "chords" },
  { id: "pulsing-synth", name: "Pulsing Synth", role: "chords" },
  { id: "ice-bell", name: "Ice Bell", role: "melody" },
  { id: "star-pluck", name: "Star Pluck", role: "melody" },
  { id: "signal-lead", name: "Signal Lead", role: "melody" },
  { id: "organic-mallet", name: "Organic Mallet", role: "melody" },
  { id: "midnight-lead", name: "Midnight Lead · Pilot", role: "melody" },
  { id: "deep-signal", name: "Deep Signal · Pilot", role: "melody" },
  { id: "dust", name: "Dust", role: "texture" },
  { id: "radio", name: "Radio", role: "texture" },
  { id: "nebula", name: "Nebula", role: "texture" },
  { id: "mechanical", name: "Mechanical", role: "texture" },
  { id: "void-drone", name: "Void Drone", role: "texture" },
] as const satisfies readonly SoundPresetDefinition[];

export type SoundPresetId = (typeof SOUND_PRESETS)[number]["id"];

export type AudioSampleCategory =
  | "bass"
  | "crash"
  | "hi-hat"
  | "kick"
  | "other"
  | "ride"
  | "rimshot"
  | "snare"
  | "synth"
  | "tom";

export type AudioSamplePlaybackStyle =
  "punchy" | "percussive" | "tonal" | "soft";

export interface AudioSampleEnvelope {
  style: AudioSamplePlaybackStyle;
  attackSeconds: number;
  releaseSeconds: number;
}

export interface AudioSampleEnvelopeSource {
  category: AudioSampleCategory;
  attackSeconds?: number;
  releaseSeconds?: number;
}

const SAMPLE_STYLE_BY_CATEGORY = {
  bass: "tonal",
  crash: "percussive",
  "hi-hat": "percussive",
  kick: "punchy",
  other: "soft",
  ride: "percussive",
  rimshot: "punchy",
  snare: "punchy",
  synth: "soft",
  tom: "percussive",
} as const satisfies Record<AudioSampleCategory, AudioSamplePlaybackStyle>;

const SAMPLE_ENVELOPE_DEFAULTS = {
  punchy: { attackSeconds: 0.0005, releaseSeconds: 0.018 },
  percussive: { attackSeconds: 0.0015, releaseSeconds: 0.04 },
  tonal: { attackSeconds: 0.004, releaseSeconds: 0.055 },
  soft: { attackSeconds: 0.008, releaseSeconds: 0.075 },
} as const satisfies Record<
  AudioSamplePlaybackStyle,
  Omit<AudioSampleEnvelope, "style">
>;

/**
 * Resolves future manifest entries from musical character while retaining
 * explicit per-sample overrides for authored exceptions.
 */
export function resolveAudioSampleEnvelope(
  sample: AudioSampleEnvelopeSource,
): AudioSampleEnvelope {
  const style = SAMPLE_STYLE_BY_CATEGORY[sample.category];
  const defaults = SAMPLE_ENVELOPE_DEFAULTS[style];
  return {
    style,
    attackSeconds: sample.attackSeconds ?? defaults.attackSeconds,
    releaseSeconds: sample.releaseSeconds ?? defaults.releaseSeconds,
  };
}

export interface AudioSampleAssetDefinition {
  id: string;
  name: string;
  category: AudioSampleCategory;
  url: string;
  durationSeconds: number;
  attackSeconds: number;
  releaseSeconds: number;
  /** MIDI pitch rendered into tonal assets; absent for unpitched transients. */
  rootMidi?: number;
}

export function resolveAudioSampleUrl(
  assetUrl: string,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${assetUrl.replace(/^\/+/, "")}`;
}

/**
 * Runtime subset of `public/audio/cosmic-samples/manifest.json`.
 * The generated JSON retains processing, level, authorship, and source details.
 */
export const AUDIO_SAMPLE_MANIFEST = [
  {
    id: "chunk-bass-long",
    name: "Chunk Bass Long",
    category: "bass",
    url: "audio/cosmic-samples/chunk-bass-long.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.004,
    releaseSeconds: 0.055,
  },
  {
    id: "chunk-bass-short",
    name: "Chunk Bass Short",
    category: "bass",
    url: "audio/cosmic-samples/chunk-bass-short.ogg",
    durationSeconds: 0.664188,
    attackSeconds: 0.004,
    releaseSeconds: 0.055,
  },
  {
    id: "lead-high-long",
    name: "Lead High Long",
    category: "synth",
    url: "audio/cosmic-samples/lead-high-long.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.008,
    releaseSeconds: 0.075,
  },
  {
    id: "lead-high-short",
    name: "Lead High Short",
    category: "synth",
    url: "audio/cosmic-samples/lead-high-short.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.008,
    releaseSeconds: 0.075,
  },
  {
    id: "lead-low-long",
    name: "Lead Low Long",
    category: "synth",
    url: "audio/cosmic-samples/lead-low-long.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.008,
    releaseSeconds: 0.075,
  },
  {
    id: "lead-low-short",
    name: "Lead Low Short",
    category: "synth",
    url: "audio/cosmic-samples/lead-low-short.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.008,
    releaseSeconds: 0.075,
  },
  {
    id: "lead-mid-long",
    name: "Lead Mid Long",
    category: "synth",
    url: "audio/cosmic-samples/lead-mid-long.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.008,
    releaseSeconds: 0.075,
  },
  {
    id: "lead-mid-short",
    name: "Lead Mid Short",
    category: "synth",
    url: "audio/cosmic-samples/lead-mid-short.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.008,
    releaseSeconds: 0.075,
  },
  {
    id: "reverb-square-saw-long",
    name: "Reverb Square Saw Long",
    category: "synth",
    url: "audio/cosmic-samples/reverb-square-saw-long.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.01,
    releaseSeconds: 0.08,
  },
  {
    id: "reverb-square-saw-short",
    name: "Reverb Square Saw Short",
    category: "synth",
    url: "audio/cosmic-samples/reverb-square-saw-short.ogg",
    durationSeconds: 1.052875,
    attackSeconds: 0.008,
    releaseSeconds: 0.075,
  },
  {
    id: "sub-long",
    name: "Sub Long",
    category: "bass",
    url: "audio/cosmic-samples/sub-long.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.006,
    releaseSeconds: 0.065,
  },
  {
    id: "sub-short",
    name: "Sub Short",
    category: "bass",
    url: "audio/cosmic-samples/sub-short.ogg",
    durationSeconds: 0.648,
    attackSeconds: 0.004,
    releaseSeconds: 0.055,
  },
  {
    id: "techno-crash",
    name: "Techno Crash",
    category: "crash",
    url: "audio/cosmic-samples/techno-crash.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.002,
    releaseSeconds: 0.06,
  },
  {
    id: "techno-dark-hat",
    name: "Techno Dark Hat",
    category: "hi-hat",
    url: "audio/cosmic-samples/techno-dark-hat.ogg",
    durationSeconds: 0.657458,
    attackSeconds: 0.0015,
    releaseSeconds: 0.04,
  },
  {
    id: "techno-kick",
    name: "Techno Kick",
    category: "kick",
    url: "audio/cosmic-samples/techno-kick.ogg",
    durationSeconds: 0.273438,
    attackSeconds: 0.0005,
    releaseSeconds: 0.018,
  },
  {
    id: "techno-light-hat",
    name: "Techno Light Hat",
    category: "hi-hat",
    url: "audio/cosmic-samples/techno-light-hat.ogg",
    durationSeconds: 0.658021,
    attackSeconds: 0.0015,
    releaseSeconds: 0.04,
  },
  {
    id: "techno-ride",
    name: "Techno Ride",
    category: "ride",
    url: "audio/cosmic-samples/techno-ride.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.002,
    releaseSeconds: 0.06,
  },
  {
    id: "techno-rimshot",
    name: "Techno Rimshot",
    category: "rimshot",
    url: "audio/cosmic-samples/techno-rimshot.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.0005,
    releaseSeconds: 0.018,
  },
  {
    id: "techno-snare",
    name: "Techno Snare",
    category: "snare",
    url: "audio/cosmic-samples/techno-snare.ogg",
    durationSeconds: 0.273563,
    attackSeconds: 0.0005,
    releaseSeconds: 0.018,
  },
  {
    id: "techno-tom",
    name: "Techno Tom",
    category: "tom",
    url: "audio/cosmic-samples/techno-tom.ogg",
    durationSeconds: 2.181833,
    attackSeconds: 0.0015,
    releaseSeconds: 0.04,
  },
  ...PROCEDURAL_SAMPLE_ASSETS,
] as const satisfies readonly AudioSampleAssetDefinition[];

export type AudioSampleId = (typeof AUDIO_SAMPLE_MANIFEST)[number]["id"];

export interface DrumSampleVoiceDefinition {
  kind: "drum-kit";
  samples: Partial<Record<DrumVoiceId, AudioSampleId>>;
}

export interface PitchedSampleVoiceDefinition {
  kind: "pitched";
  sampleId: AudioSampleId;
  /** MIDI pitch captured in the source file; Tone.js transposes from here. */
  rootMidi: number;
}

export type SampleVoiceDefinition =
  DrumSampleVoiceDefinition | PitchedSampleVoiceDefinition;

export const AUXILIARY_SAMPLE_PRESET_IDS = [
  "orbital-hat",
  "orbital-shaker",
  "orbital-perc",
  "dust-percussion",
] as const;

export type AuxiliarySamplePresetId =
  (typeof AUXILIARY_SAMPLE_PRESET_IDS)[number];

/** Active presets are loaded lazily after audio unlock; unavailable assets fall back to synthesis. */
export const SAMPLE_VOICE_PRESETS = {
  "clean-orbit": {
    kind: "drum-kit",
    samples: {
      kick: "techno-kick",
      snare: "techno-snare",
      clap: "techno-dark-hat",
      "closed-hat": "techno-light-hat",
      "open-hat": "techno-ride",
      rim: "techno-rimshot",
      perc: "techno-tom",
    },
  },
  "soft-impact": {
    kind: "drum-kit",
    samples: {
      kick: "soft-impact-kick",
      snare: "soft-impact-snare",
      clap: "soft-impact-clap",
      "closed-hat": "soft-impact-closed-hat",
      "open-hat": "soft-impact-open-hat",
      rim: "soft-impact-rim",
      perc: "soft-impact-perc",
    },
  },
  "small-dry": {
    kind: "drum-kit",
    samples: {
      kick: "small-dry-kick",
      snare: "small-dry-snare",
      clap: "small-dry-clap",
      "closed-hat": "small-dry-closed-hat",
      "open-hat": "small-dry-open-hat",
      rim: "small-dry-rim",
      perc: "small-dry-perc",
    },
  },
  "metallic-array": {
    kind: "drum-kit",
    samples: {
      kick: "metallic-array-kick",
      snare: "metallic-array-snare",
      clap: "metallic-array-clap",
      "closed-hat": "metallic-array-closed-hat",
      "open-hat": "techno-crash",
      rim: "metallic-array-rim",
      perc: "metallic-array-perc",
    },
  },
  "heavy-void": {
    kind: "drum-kit",
    samples: {
      kick: "heavy-void-kick",
      snare: "heavy-void-snare",
      clap: "heavy-void-clap",
      "closed-hat": "heavy-void-closed-hat",
      "open-hat": "heavy-void-open-hat",
      rim: "heavy-void-rim",
      perc: "heavy-void-perc",
    },
  },
  "deep-sub": {
    kind: "pitched",
    sampleId: "sub-short",
    rootMidi: 36,
  },
  "warm-pulse": {
    kind: "pitched",
    sampleId: "chunk-bass-short",
    rootMidi: 36,
  },
  "rough-drive": {
    kind: "pitched",
    sampleId: "chunk-bass-long",
    rootMidi: 36,
  },
  "cosmic-drone": {
    kind: "pitched",
    sampleId: "sub-long",
    rootMidi: 36,
  },
  "warm-pad": {
    kind: "pitched",
    sampleId: "reverb-square-saw-long",
    rootMidi: 48,
  },
  "soft-keys": {
    kind: "pitched",
    sampleId: "soft-keys-c4",
    rootMidi: 60,
  },
  "glass-chords": {
    kind: "pitched",
    sampleId: "glass-chords-c4",
    rootMidi: 60,
  },
  "pulsing-synth": {
    kind: "pitched",
    sampleId: "pulsing-synth-c4",
    rootMidi: 60,
  },
  "ice-bell": {
    kind: "pitched",
    sampleId: "lead-high-short",
    rootMidi: 60,
  },
  "star-pluck": {
    kind: "pitched",
    sampleId: "lead-mid-short",
    rootMidi: 48,
  },
  "signal-lead": {
    kind: "pitched",
    sampleId: "lead-high-long",
    rootMidi: 60,
  },
  "organic-mallet": {
    kind: "pitched",
    sampleId: "lead-low-short",
    rootMidi: 36,
  },
  "midnight-lead": {
    kind: "pitched",
    sampleId: "lead-mid-long",
    rootMidi: 48,
  },
  "deep-signal": {
    kind: "pitched",
    sampleId: "lead-low-long",
    rootMidi: 36,
  },
  dust: {
    kind: "pitched",
    sampleId: "reverb-square-saw-short",
    rootMidi: 48,
  },
  radio: {
    kind: "pitched",
    sampleId: "radio-texture-c4",
    rootMidi: 60,
  },
  nebula: {
    kind: "pitched",
    sampleId: "nebula-texture-c4",
    rootMidi: 60,
  },
  mechanical: {
    kind: "pitched",
    sampleId: "mechanical-texture-c4",
    rootMidi: 60,
  },
  "void-drone": {
    kind: "pitched",
    sampleId: "void-drone-c2",
    rootMidi: 36,
  },
  "orbital-hat": {
    kind: "drum-kit",
    samples: {
      "closed-hat": "orbital-ring-hat",
      "open-hat": "orbital-ring-shaker",
      perc: "orbital-ring-perc",
    },
  },
  "orbital-shaker": {
    kind: "drum-kit",
    samples: { perc: "orbital-ring-shaker" },
  },
  "orbital-perc": {
    kind: "drum-kit",
    samples: { perc: "orbital-ring-perc" },
  },
  "dust-percussion": {
    kind: "drum-kit",
    samples: { perc: "asteroid-dust-perc" },
  },
} as const satisfies Record<
  SoundPresetId | AuxiliarySamplePresetId,
  SampleVoiceDefinition
>;

export function getAudioSampleAsset(
  id: AudioSampleId,
): (typeof AUDIO_SAMPLE_MANIFEST)[number] {
  const asset = AUDIO_SAMPLE_MANIFEST.find((sample) => sample.id === id);
  if (!asset) throw new Error(`Unknown audio sample asset: ${id}`);
  return asset;
}

export function getSampleVoicePreset(
  presetId: string,
): SampleVoiceDefinition | undefined {
  return SAMPLE_VOICE_PRESETS[presetId as keyof typeof SAMPLE_VOICE_PRESETS];
}

export const STAR_SOUND_PALETTES = {
  radiant: {
    beat: ["clean-orbit", "small-dry", "soft-impact"],
    bass: ["warm-pulse", "deep-sub", "rough-drive"],
    chords: ["glass-chords", "soft-keys", "warm-pad"],
    melody: ["star-pluck", "ice-bell", "signal-lead", "midnight-lead"],
    texture: ["dust", "nebula", "radio"],
  },
  "red-giant": {
    beat: ["soft-impact", "clean-orbit", "heavy-void"],
    bass: ["deep-sub", "cosmic-drone", "warm-pulse"],
    chords: ["warm-pad", "soft-keys", "glass-chords"],
    melody: ["organic-mallet", "deep-signal", "star-pluck", "ice-bell"],
    texture: ["nebula", "dust", "void-drone"],
  },
  dwarf: {
    beat: ["small-dry", "clean-orbit", "soft-impact"],
    bass: ["warm-pulse", "deep-sub", "cosmic-drone"],
    chords: ["soft-keys", "glass-chords", "warm-pad"],
    melody: ["ice-bell", "star-pluck", "organic-mallet", "midnight-lead"],
    texture: ["dust", "radio", "nebula"],
  },
  neutron: {
    beat: ["metallic-array", "clean-orbit", "small-dry"],
    bass: ["rough-drive", "warm-pulse", "deep-sub"],
    chords: ["pulsing-synth", "glass-chords", "soft-keys"],
    melody: ["signal-lead", "midnight-lead", "star-pluck", "ice-bell"],
    texture: ["mechanical", "radio", "dust"],
  },
  void: {
    beat: ["heavy-void", "soft-impact", "metallic-array"],
    bass: ["deep-sub", "cosmic-drone", "rough-drive"],
    chords: ["warm-pad", "pulsing-synth", "glass-chords"],
    melody: ["signal-lead", "deep-signal", "organic-mallet", "ice-bell"],
    texture: ["void-drone", "nebula", "radio"],
  },
} as const satisfies Record<
  StarPresetId,
  Record<PlanetRole, readonly string[]>
>;

export function getSoundPresetsForRole(
  role: PlanetRole,
): readonly SoundPresetDefinition[] {
  return SOUND_PRESETS.filter((preset) => preset.role === role);
}
