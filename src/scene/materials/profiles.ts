import * as THREE from "three";

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

/**
 * The authored renderer palette for one active stellar mood.  Composition
 * state stores only the star preset and seed; this projection stays entirely
 * in the scene layer so changing the visual treatment can never affect audio,
 * persistence, or sharing.
 */
export interface ScenePalette {
  presetId: StarPresetId;
  visualSeed: number;
  /** Near-black mass used by the backdrop and fog. */
  backgroundColor: number;
  /** Legacy atmospheric family used by adornments and Black Hole disks. */
  primaryColor: number;
  /** Restrained atmospheric countertone. */
  secondaryColor: number;
  /** Luminous atmospheric material and selection highlight. */
  highlightColor: number;
  /** Deep value used for faceted shadow planes. */
  shadowColor: number;
  /** Incident light tint for all scene surfaces. */
  starLightColor: number;
  /** Sparse background star color. */
  starfieldColor: number;
  /** Orbit, ring, and gate colors, kept separate for value hierarchy. */
  orbitColor: number;
  gateColor: number;
  ringColor: number;
  outlineColor: number;
  /** Deep-space shader lanes. */
  nebulaColorA: number;
  nebulaColorB: number;
  /**
   * Authored role-facing palette. These colors are intentionally independent
   * from the nebula lanes so bodies remain vivid and legible against the sky.
   */
  foregroundBaseColor: number;
  foregroundSecondaryColor: number;
  foregroundHighlightColor: number;
  foregroundShadowColor: number;
  /** Primary stellar surface colors (the black-hole assembly uses the legacy
   * foreground aliases above for its disk and ring materials). */
  starSurfaceColor: number;
  starHotColor: number;
  starEdgeColor: number;
  starGlowColor: number;
  /** Companion-only stellar accent; never averaged into the foreground. */
  companionStarSurfaceColor: number;
  companionStarHotColor: number;
  companionStarEdgeColor: number;
  companionStarGlowColor: number;
  companionWeight: number;
}

export interface SceneStarPaletteInput {
  presetId: StarPresetId;
  visualSeed: number;
  intensity: number;
  companion?: {
    presetId: Exclude<StarPresetId, "black-hole">;
    visualSeed: number;
    intensity: number;
  };
}

interface ScenePaletteSeed {
  backgroundColor: number;
  primaryColor: number;
  secondaryColor: number;
  highlightColor: number;
  shadowColor: number;
  starLightColor: number;
  starfieldColor: number;
  orbitColor: number;
  gateColor: number;
  ringColor: number;
  outlineColor: number;
  nebulaColorA: number;
  nebulaColorB: number;
  foregroundBaseColor: number;
  foregroundSecondaryColor: number;
  foregroundHighlightColor: number;
  foregroundShadowColor: number;
  starSurfaceColor: number;
  starHotColor: number;
  starEdgeColor: number;
  starGlowColor: number;
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
    coreColor: 0xc26b35,
    hotColor: 0xffdf9b,
    edgeColor: 0x4d211b,
    glowColor: 0xffa45b,
    glowStrength: 0.82,
    turbulence: 0.62,
  },
  "red-giant": {
    presetId: "red-giant",
    label: "Giant convection",
    coreColor: 0x8f2f27,
    hotColor: 0xf06b3e,
    edgeColor: 0x280f18,
    glowColor: 0xc7472d,
    glowStrength: 0.92,
    turbulence: 0.78,
  },
  dwarf: {
    presetId: "dwarf",
    label: "Blue-white granulation",
    coreColor: 0x6faec6,
    hotColor: 0xf1fbff,
    edgeColor: 0x102b46,
    glowColor: 0x7ad2e5,
    glowStrength: 0.68,
    turbulence: 0.42,
  },
  neutron: {
    presetId: "neutron",
    label: "Magnetic pulse shell",
    coreColor: 0x624aa9,
    hotColor: 0xe6e5ff,
    edgeColor: 0x12142f,
    glowColor: 0x8e71e4,
    glowStrength: 1.04,
    turbulence: 0.98,
  },
  void: {
    presetId: "void",
    label: "Dark plasma veil",
    coreColor: 0x312953,
    hotColor: 0xb5a7da,
    edgeColor: 0x090a1b,
    glowColor: 0x62549a,
    glowStrength: 0.88,
    turbulence: 0.32,
  },
  "black-hole": {
    presetId: "black-hole",
    label: "Event-horizon accretion",
    coreColor: 0x100d1a,
    hotColor: 0xf0a253,
    edgeColor: 0x211535,
    glowColor: 0x9362a6,
    glowStrength: 0.58,
    turbulence: 1.04,
  },
} as const satisfies Record<StarPresetId, StarMaterialProfile>;

const SCENE_PALETTE_SEEDS: Record<StarPresetId, ScenePaletteSeed> = {
  // Smoky apricot/amber/ivory over charcoal.
  radiant: {
    backgroundColor: 0x0b1e2d,
    primaryColor: 0xd35c35,
    secondaryColor: 0xc9685b,
    highlightColor: 0xffd6a2,
    shadowColor: 0x1c1214,
    starLightColor: 0xffb56d,
    starfieldColor: 0xe6d4bd,
    orbitColor: 0x9b7e6c,
    gateColor: 0xffcb8f,
    ringColor: 0xc47b54,
    outlineColor: 0xffe0b0,
    nebulaColorA: 0xa74d3c,
    nebulaColorB: 0xd77962,
    foregroundBaseColor: 0x25b7c2,
    foregroundSecondaryColor: 0x7fe2d3,
    foregroundHighlightColor: 0xe1fff1,
    foregroundShadowColor: 0x0c4b59,
    starSurfaceColor: 0xffa044,
    starHotColor: 0xfff3c7,
    starEdgeColor: 0x5b2c1b,
    starGlowColor: 0xffb86a,
  },
  // Oxblood/rust/ember with a cool steel countertone.
  "red-giant": {
    backgroundColor: 0x260f22,
    primaryColor: 0xa72d36,
    secondaryColor: 0x68415b,
    highlightColor: 0xf27644,
    shadowColor: 0x160b13,
    starLightColor: 0xc95435,
    starfieldColor: 0xd7bab1,
    orbitColor: 0x9c5364,
    gateColor: 0xf28d58,
    ringColor: 0xa84838,
    outlineColor: 0xf1a08a,
    nebulaColorA: 0x85253c,
    nebulaColorB: 0x68405f,
    foregroundBaseColor: 0x45c6bb,
    foregroundSecondaryColor: 0x9de5cf,
    foregroundHighlightColor: 0xe9fff0,
    foregroundShadowColor: 0x16484d,
    starSurfaceColor: 0xf06442,
    starHotColor: 0xffc0a0,
    starEdgeColor: 0x4a1428,
    starGlowColor: 0xff7e52,
  },
  // Midnight/cyan/ice-white, kept quiet outside the star and gates.
  dwarf: {
    backgroundColor: 0x092a42,
    primaryColor: 0x1591bd,
    secondaryColor: 0x4c8db1,
    highlightColor: 0xd9fbff,
    shadowColor: 0x071525,
    starLightColor: 0x8bd2ec,
    starfieldColor: 0xbfe9f4,
    orbitColor: 0x4b86a6,
    gateColor: 0xa8ebf3,
    ringColor: 0x4aa5c3,
    outlineColor: 0xdafaff,
    nebulaColorA: 0x0b6fa5,
    nebulaColorB: 0x24a6c4,
    foregroundBaseColor: 0xc050c5,
    foregroundSecondaryColor: 0x6d4bb1,
    foregroundHighlightColor: 0xf0d8ff,
    foregroundShadowColor: 0x2c174e,
    starSurfaceColor: 0x67b9d1,
    starHotColor: 0xf3ffff,
    starEdgeColor: 0x153f67,
    starGlowColor: 0x9cf3ff,
  },
  // Ink/electric violet/cold blue-white.
  neutron: {
    backgroundColor: 0x171447,
    primaryColor: 0x6336c4,
    secondaryColor: 0x245fc0,
    highlightColor: 0xdedbff,
    shadowColor: 0x0a0a1b,
    starLightColor: 0x9d8fff,
    starfieldColor: 0xcfd6ff,
    orbitColor: 0x5d54b2,
    gateColor: 0xc3b8ff,
    ringColor: 0x6d60c7,
    outlineColor: 0xe9e6ff,
    nebulaColorA: 0x5229b5,
    nebulaColorB: 0x1f65bf,
    foregroundBaseColor: 0xd5964f,
    foregroundSecondaryColor: 0x74c37c,
    foregroundHighlightColor: 0xffe7ad,
    foregroundShadowColor: 0x3e2616,
    starSurfaceColor: 0x866fe2,
    starHotColor: 0xf1edff,
    starEdgeColor: 0x211a56,
    starGlowColor: 0xb8aaff,
  },
  // Near-black indigo with muted lavender and a cold signal countertone.
  void: {
    backgroundColor: 0x131f48,
    primaryColor: 0x373a97,
    secondaryColor: 0x5368ad,
    highlightColor: 0xb7acd7,
    shadowColor: 0x070814,
    starLightColor: 0x736caa,
    starfieldColor: 0xaaa9c7,
    orbitColor: 0x5964a4,
    gateColor: 0x9a92bf,
    ringColor: 0x57557f,
    outlineColor: 0xc4b8df,
    nebulaColorA: 0x263a94,
    nebulaColorB: 0x4d4793,
    foregroundBaseColor: 0xe1ad63,
    foregroundSecondaryColor: 0xb77c7c,
    foregroundHighlightColor: 0xffebc5,
    foregroundShadowColor: 0x49301a,
    starSurfaceColor: 0x9f8bd4,
    starHotColor: 0xfffaff,
    starEdgeColor: 0x38305d,
    starGlowColor: 0xe1d8ff,
  },
  // Obsidian with amber accretion and a restrained violet edge.
  "black-hole": {
    backgroundColor: 0x24102e,
    primaryColor: 0x762c46,
    secondaryColor: 0x70416e,
    highlightColor: 0xf1b067,
    shadowColor: 0x05050c,
    starLightColor: 0xc88049,
    starfieldColor: 0xb0a2b2,
    orbitColor: 0x75516c,
    gateColor: 0xe6a263,
    ringColor: 0xa86b54,
    outlineColor: 0xf3c7e8,
    nebulaColorA: 0x762b4a,
    nebulaColorB: 0x87436c,
    foregroundBaseColor: 0xc67549,
    foregroundSecondaryColor: 0x8fc3c7,
    foregroundHighlightColor: 0xffd29b,
    foregroundShadowColor: 0x421f24,
    starSurfaceColor: 0xe6a04c,
    starHotColor: 0xffe1b0,
    starEdgeColor: 0x241330,
    starGlowColor: 0xffb05a,
  },
};

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function seededColor(
  value: number,
  seed: number,
  hueRange = 0.012,
  saturationRange = 0.018,
  lightnessRange = 0.016,
): number {
  const color = new THREE.Color(value);
  const normalized = normalizeVisualSeed(seed);
  const offset = normalized - 0.5;
  color.offsetHSL(
    offset * hueRange,
    offset * saturationRange,
    offset * lightnessRange,
  );
  return color.getHex();
}

function paletteFromSeed(
  presetId: StarPresetId,
  visualSeed: number,
): ScenePalette {
  const seed = normalizeVisualSeed(visualSeed);
  const source = SCENE_PALETTE_SEEDS[presetId];
  const color = (value: number, hueRange = 0.012): number =>
    seededColor(value, visualSeed, hueRange);
  const foregroundBaseColor = color(source.foregroundBaseColor, 0.018);
  const foregroundSecondaryColor = color(
    source.foregroundSecondaryColor,
    0.022,
  );
  const foregroundHighlightColor = color(
    source.foregroundHighlightColor,
    0.012,
  );
  const foregroundShadowColor = color(source.foregroundShadowColor, 0.008);
  const starSurfaceColor = color(source.starSurfaceColor, 0.012);
  const starHotColor = color(source.starHotColor, 0.009);
  const starEdgeColor = color(source.starEdgeColor, 0.008);
  const starGlowColor = color(source.starGlowColor, 0.014);
  return {
    presetId,
    visualSeed: seed,
    backgroundColor: source.backgroundColor,
    // Legacy mood aliases remain available for atmospheric adornments and the
    // Black Hole assembly. Bodies use the explicit foreground/star fields
    // below, preventing nebula colors from leaking into their surfaces.
    primaryColor: color(source.primaryColor, 0.018),
    secondaryColor: color(source.secondaryColor, 0.022),
    highlightColor: color(source.highlightColor, 0.012),
    shadowColor: color(source.shadowColor, 0.008),
    starLightColor: color(source.starLightColor, 0.018),
    starfieldColor: color(source.starfieldColor, 0.012),
    orbitColor: color(source.orbitColor, 0.018),
    gateColor: color(source.gateColor, 0.014),
    ringColor: color(source.ringColor, 0.018),
    outlineColor: color(source.outlineColor, 0.012),
    nebulaColorA: color(source.nebulaColorA, 0.022),
    nebulaColorB: color(source.nebulaColorB, 0.022),
    foregroundBaseColor,
    foregroundSecondaryColor,
    foregroundHighlightColor,
    foregroundShadowColor,
    starSurfaceColor,
    starHotColor,
    starEdgeColor,
    starGlowColor,
    companionStarSurfaceColor: starSurfaceColor,
    companionStarHotColor: starHotColor,
    companionStarEdgeColor: starEdgeColor,
    companionStarGlowColor: starGlowColor,
    companionWeight: 0,
  };
}

function blendColor(left: number, right: number, amount: number): number {
  return new THREE.Color(left).lerp(new THREE.Color(right), amount).getHex();
}

/**
 * Resolve one deterministic authored palette from a star and optional binary
 * companion. Companion influence is deliberately bounded so a binary system
 * still reads as one scene rather than a split rainbow.
 */
export function scenePaletteForStar(star: SceneStarPaletteInput): ScenePalette {
  const primary = paletteFromSeed(star.presetId, star.visualSeed);
  const companionInput = star.companion;
  const companion = companionInput
    ? paletteFromSeed(companionInput.presetId, companionInput.visualSeed)
    : null;
  if (!companion) return primary;

  const primaryIntensity = Math.max(0.05, clamp01(star.intensity, 0.8));
  const companionIntensity = Math.max(
    0.05,
    clamp01(companionInput?.intensity ?? 0.8, 0.8),
  );
  const rawWeight =
    companionIntensity / (primaryIntensity + companionIntensity);
  const companionWeight = Math.min(0.42, Math.max(0.16, rawWeight * 0.72));
  const result = { ...primary };
  const keys: Array<keyof ScenePaletteSeed> = [
    "backgroundColor",
    "starfieldColor",
    "orbitColor",
    "gateColor",
    "ringColor",
    "outlineColor",
    "nebulaColorA",
    "nebulaColorB",
  ];
  for (const key of keys) {
    result[key] = blendColor(primary[key], companion[key], companionWeight);
  }
  // Foreground colors stay authored and saturated. A binary companion gets a
  // distinct accent set instead of being mixed into a gray average that would
  // erase both stellar identities and role contrast.
  result.companionStarSurfaceColor = companion.starSurfaceColor;
  result.companionStarHotColor = companion.starHotColor;
  result.companionStarEdgeColor = companion.starEdgeColor;
  result.companionStarGlowColor = companion.starGlowColor;
  result.companionWeight = companionWeight;
  return result;
}

/** A direct preset projection is useful for renderer unit tests and assets. */
export function scenePaletteForPreset(
  presetId: StarPresetId,
  visualSeed = 0,
): ScenePalette {
  return paletteFromSeed(presetId, visualSeed);
}

export interface PalettePlanetMaterialColors {
  baseColor: number;
  shadowColor: number;
  accentColor: number;
  secondaryColor: number;
}

export interface PaletteStarMaterialColors {
  coreColor: number;
  hotColor: number;
  edgeColor: number;
  glowColor: number;
}

const ROLE_HUE_OFFSETS: Record<PlanetRole, number> = {
  beat: 0,
  // A restrained two-to-three-hue family keeps the scene coordinated; terrain
  // geometry and these bounded value shifts carry the remaining role identity.
  bass: 0.055,
  chords: -0.055,
  melody: 0.1,
  texture: -0.1,
};

const ROLE_LIGHTNESS: Record<PlanetRole, number> = {
  beat: 0.47,
  bass: 0.39,
  chords: 0.56,
  melody: 0.68,
  texture: 0.5,
};

function roleAnchorColor(role: PlanetRole, palette: ScenePalette): THREE.Color {
  const base = new THREE.Color(palette.foregroundBaseColor);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const hue = (hsl.h + ROLE_HUE_OFFSETS[role]) % 1;
  const roleSaturation =
    role === "melody" ? 0.72 : role === "texture" ? 0.78 : 0.9;
  const saturation = Math.min(
    0.92,
    Math.max(0.5, hsl.s * 0.5 + roleSaturation * 0.5),
  );
  const lightness = ROLE_LIGHTNESS[role];
  return new THREE.Color().setHSL(hue, saturation, lightness);
}

/**
 * Returns five deterministic, saturated role anchors. The anchors deliberately
 * orbit the authored foreground hue rather than the nebula hue, so role color
 * remains measurable when a mood changes.
 */
export function planetRoleAnchorColors(
  palette: ScenePalette,
): Record<PlanetRole, number> {
  return {
    beat: roleAnchorColor("beat", palette).getHex(),
    bass: roleAnchorColor("bass", palette).getHex(),
    chords: roleAnchorColor("chords", palette).getHex(),
    melody: roleAnchorColor("melody", palette).getHex(),
    texture: roleAnchorColor("texture", palette).getHex(),
  };
}

/** Select primary or companion stellar accents without RGB averaging. */
export function starMaterialColorsForPalette(
  palette: ScenePalette,
  companion = false,
): PaletteStarMaterialColors {
  return companion
    ? {
        coreColor: palette.companionStarSurfaceColor,
        hotColor: palette.companionStarHotColor,
        edgeColor: palette.companionStarEdgeColor,
        glowColor: palette.companionStarGlowColor,
      }
    : {
        coreColor: palette.starSurfaceColor,
        hotColor: palette.starHotColor,
        edgeColor: palette.starEdgeColor,
        glowColor: palette.starGlowColor,
      };
}

/**
 * Keep role signatures while projecting every planet into the active mood.
 * The offsets are intentionally small; shape and pattern carry role identity,
 * not unrelated hue jumps.
 */
export function planetMaterialColorsForPalette(
  role: PlanetRole,
  palette: ScenePalette,
): PalettePlanetMaterialColors {
  const roleColor = roleAnchorColor(role, palette);
  const hsl = { h: 0, s: 0, l: 0 };
  roleColor.getHSL(hsl);
  const secondary = new THREE.Color().setHSL(
    (hsl.h + 0.045) % 1,
    Math.min(0.94, hsl.s + 0.04),
    Math.min(0.72, hsl.l + 0.08),
  );
  const accent = new THREE.Color().setHSL(
    (hsl.h + 0.095) % 1,
    Math.min(0.96, hsl.s + 0.02),
    Math.min(0.86, hsl.l + 0.24),
  );
  const shadow = new THREE.Color(palette.foregroundShadowColor);
  shadow.offsetHSL((hsl.h - 0.5) * 0.08, 0.02, 0);
  return {
    baseColor: roleColor.getHex(),
    shadowColor: shadow.getHex(),
    accentColor: accent.getHex(),
    secondaryColor: secondary.getHex(),
  };
}

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
