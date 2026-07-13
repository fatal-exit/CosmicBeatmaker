import type { PlanetRole, StarPresetId } from "../../domain/composition";

export interface PlanetMaterialProfile {
  role: PlanetRole;
  label: string;
  description: string;
  baseColor: number;
  shadowColor: number;
  accentColor: number;
  secondaryColor: number;
  displacement: number;
  motion: number;
}

export interface StarMaterialProfile {
  presetId: StarPresetId;
  label: string;
  coreColor: number;
  hotColor: number;
  edgeColor: number;
  glowColor: number;
  glowStrength: number;
  turbulence: number;
}

export const PLANET_MATERIAL_PROFILES = {
  beat: {
    role: "beat",
    label: "Impact terrain",
    description: "Cratered rock with sharp rhythmic fault lines",
    baseColor: 0xd24d20,
    shadowColor: 0x35130e,
    accentColor: 0xff9b52,
    secondaryColor: 0x8f2e1c,
    displacement: 0.085,
    motion: 0,
  },
  bass: {
    role: "bass",
    label: "Tidal bands",
    description: "Deep oceanic bands with slow, heavy currents",
    baseColor: 0x0a96a6,
    shadowColor: 0x052c3b,
    accentColor: 0x5eead4,
    secondaryColor: 0x126782,
    displacement: 0.025,
    motion: 0.055,
  },
  chords: {
    role: "chords",
    label: "Harmonic strata",
    description: "Layered mineral plates crossed by luminous veins",
    baseColor: 0xb99513,
    shadowColor: 0x31280c,
    accentColor: 0xffe47a,
    secondaryColor: 0x6e7d2f,
    displacement: 0.048,
    motion: 0.012,
  },
  melody: {
    role: "melody",
    label: "Signal currents",
    description: "Pearlescent ribbons and bright melodic storms",
    baseColor: 0xb64fc6,
    shadowColor: 0x35143f,
    accentColor: 0xff9ee7,
    secondaryColor: 0x714fc3,
    displacement: 0.032,
    motion: 0.09,
  },
  texture: {
    role: "texture",
    label: "Dust-cloud crust",
    description: "Fine atmospheric grain over an eroded cool surface",
    baseColor: 0x367fc0,
    shadowColor: 0x102440,
    accentColor: 0xa8d9ff,
    secondaryColor: 0x675f9e,
    displacement: 0.065,
    motion: 0.038,
  },
} as const satisfies Record<PlanetRole, PlanetMaterialProfile>;

export const STAR_MATERIAL_PROFILES = {
  radiant: {
    presetId: "radiant",
    label: "Solar granulation",
    coreColor: 0xffbd4a,
    hotColor: 0xfff0a0,
    edgeColor: 0xf36a21,
    glowColor: 0xff8a32,
    glowStrength: 0.92,
    turbulence: 0.72,
  },
  "red-giant": {
    presetId: "red-giant",
    label: "Giant convection",
    coreColor: 0xd83d1f,
    hotColor: 0xffa04f,
    edgeColor: 0x831514,
    glowColor: 0xff5428,
    glowStrength: 1.08,
    turbulence: 0.9,
  },
  dwarf: {
    presetId: "dwarf",
    label: "Blue-white granulation",
    coreColor: 0xb7f4ff,
    hotColor: 0xf4ffff,
    edgeColor: 0x4cbfd7,
    glowColor: 0x78e8ff,
    glowStrength: 0.72,
    turbulence: 0.45,
  },
  neutron: {
    presetId: "neutron",
    label: "Magnetic pulse shell",
    coreColor: 0xe2d8ff,
    hotColor: 0xffffff,
    edgeColor: 0x7d54e8,
    glowColor: 0xa56cff,
    glowStrength: 1.22,
    turbulence: 1.15,
  },
  void: {
    presetId: "void",
    label: "Dark plasma veil",
    coreColor: 0x4e3f88,
    hotColor: 0x9d86d8,
    edgeColor: 0x17142f,
    glowColor: 0x6651b8,
    glowStrength: 0.42,
    turbulence: 0.36,
  },
} as const satisfies Record<StarPresetId, StarMaterialProfile>;

export function normalizeVisualSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return (((Math.trunc(seed) % 65_521) + 65_521) % 65_521) / 65_521;
}

export function planetMaterialProfile(role: PlanetRole): PlanetMaterialProfile {
  return PLANET_MATERIAL_PROFILES[role];
}

export function starMaterialProfile(
  presetId: StarPresetId,
): StarMaterialProfile {
  return STAR_MATERIAL_PROFILES[presetId];
}
