import type { PlanetRole, StarPresetId } from "../domain/composition/types";

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
  { id: "dust", name: "Dust", role: "texture" },
  { id: "radio", name: "Radio", role: "texture" },
  { id: "nebula", name: "Nebula", role: "texture" },
  { id: "mechanical", name: "Mechanical", role: "texture" },
  { id: "void-drone", name: "Void Drone", role: "texture" },
] as const satisfies readonly SoundPresetDefinition[];

export const STAR_SOUND_PALETTES = {
  radiant: {
    beat: ["clean-orbit", "small-dry", "soft-impact"],
    bass: ["warm-pulse", "deep-sub", "rough-drive"],
    chords: ["glass-chords", "soft-keys", "warm-pad"],
    melody: ["star-pluck", "ice-bell", "signal-lead"],
    texture: ["dust", "nebula", "radio"],
  },
  "red-giant": {
    beat: ["soft-impact", "clean-orbit", "heavy-void"],
    bass: ["deep-sub", "cosmic-drone", "warm-pulse"],
    chords: ["warm-pad", "soft-keys", "glass-chords"],
    melody: ["organic-mallet", "star-pluck", "ice-bell"],
    texture: ["nebula", "dust", "void-drone"],
  },
  dwarf: {
    beat: ["small-dry", "clean-orbit", "soft-impact"],
    bass: ["warm-pulse", "deep-sub", "cosmic-drone"],
    chords: ["soft-keys", "glass-chords", "warm-pad"],
    melody: ["ice-bell", "star-pluck", "organic-mallet"],
    texture: ["dust", "radio", "nebula"],
  },
  neutron: {
    beat: ["metallic-array", "clean-orbit", "small-dry"],
    bass: ["rough-drive", "warm-pulse", "deep-sub"],
    chords: ["pulsing-synth", "glass-chords", "soft-keys"],
    melody: ["signal-lead", "star-pluck", "ice-bell"],
    texture: ["mechanical", "radio", "dust"],
  },
  void: {
    beat: ["heavy-void", "soft-impact", "metallic-array"],
    bass: ["deep-sub", "cosmic-drone", "rough-drive"],
    chords: ["warm-pad", "pulsing-synth", "glass-chords"],
    melody: ["signal-lead", "organic-mallet", "ice-bell"],
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
