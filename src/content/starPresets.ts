import type {
  PlanetRole,
  ProgressionId,
  ScaleId,
  StarPresetId,
  VoicingPresetId,
} from "../domain/composition/types";
import type { RhythmTemplateId } from "./rhythmTemplates";
import { STAR_SOUND_PALETTES } from "./soundPresets";

export type StarMood = "Radiant" | "Warm" | "Delicate" | "Pulsing" | "Void";

export interface StarPresetDefinition {
  id: StarPresetId;
  mood: StarMood;
  name: string;
  description: string;
  bpmRange: readonly [number, number];
  intensityRange: readonly [number, number];
  scales: readonly ScaleId[];
  progressions: readonly ProgressionId[];
  voicings: readonly VoicingPresetId[];
  rhythmTemplates: readonly RhythmTemplateId[];
  sounds: Record<PlanetRole, readonly string[]>;
}

export const STAR_MOOD_PRESET_IDS = {
  Radiant: "radiant",
  Warm: "red-giant",
  Delicate: "dwarf",
  Pulsing: "neutron",
  Void: "void",
} as const satisfies Record<StarMood, StarPresetId>;

export const STAR_PRESETS = {
  radiant: {
    id: "radiant",
    mood: "Radiant",
    name: "Radiant",
    description: "Bright, balanced, and melodic.",
    bpmRange: [98, 122],
    intensityRange: [0.62, 0.82],
    scales: ["major-pentatonic", "major"],
    progressions: ["bright", "hopeful", "floating"],
    voicings: ["open", "compact"],
    rhythmTemplates: ["backbeat", "four-on-floor", "three-three-two"],
    sounds: STAR_SOUND_PALETTES.radiant,
  },
  "red-giant": {
    id: "red-giant",
    mood: "Warm",
    name: "Red Giant",
    description: "Warm, slow, and spacious.",
    bpmRange: [76, 102],
    intensityRange: [0.48, 0.68],
    scales: ["major-pentatonic", "minor-pentatonic"],
    progressions: ["reflective", "floating", "minimal"],
    voicings: ["open", "wide"],
    rhythmTemplates: ["half-time", "minimal-pulse", "shuffled-dust"],
    sounds: STAR_SOUND_PALETTES["red-giant"],
  },
  dwarf: {
    id: "dwarf",
    mood: "Delicate",
    name: "Dwarf",
    description: "Delicate, intimate, and precise.",
    bpmRange: [86, 112],
    intensityRange: [0.36, 0.58],
    scales: ["major-pentatonic", "minor-pentatonic"],
    progressions: ["floating", "minimal", "hopeful"],
    voicings: ["compact", "open"],
    rhythmTemplates: ["minimal-pulse", "shuffled-dust", "backbeat"],
    sounds: STAR_SOUND_PALETTES.dwarf,
  },
  neutron: {
    id: "neutron",
    mood: "Pulsing",
    name: "Neutron",
    description: "Fast, mechanical, and syncopated.",
    bpmRange: [116, 140],
    intensityRange: [0.72, 0.92],
    scales: ["minor-pentatonic", "dorian"],
    progressions: ["driving", "reflective"],
    voicings: ["compact", "open"],
    rhythmTemplates: ["neutron-drive", "broken-orbit", "three-three-two"],
    sounds: STAR_SOUND_PALETTES.neutron,
  },
  void: {
    id: "void",
    mood: "Void",
    name: "Void",
    description: "Dark, sparse, and atmospheric.",
    bpmRange: [70, 94],
    intensityRange: [0.4, 0.66],
    scales: ["minor-pentatonic", "dorian"],
    progressions: ["dark", "minimal", "driving"],
    voicings: ["wide", "open"],
    rhythmTemplates: ["minimal-pulse", "half-time", "broken-orbit"],
    sounds: STAR_SOUND_PALETTES.void,
  },
} as const satisfies Record<StarPresetId, StarPresetDefinition>;

export function getStarPresetForMood(mood: StarMood): StarPresetDefinition {
  return STAR_PRESETS[STAR_MOOD_PRESET_IDS[mood]];
}
