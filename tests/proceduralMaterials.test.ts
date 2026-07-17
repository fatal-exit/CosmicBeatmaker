import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { PlanetRole, StarPresetId } from "../src/domain/composition";
import {
  createDeepSpaceMaterial,
  createSimpleDeepSpaceMaterial,
  updateDeepSpaceMaterial,
} from "../src/scene/materials/deepSpaceMaterial";
import {
  createCelestialOutlineMaterial,
  createPlanetSurfaceMaterial,
  createStarGlowMaterial,
  createStarSurfaceMaterial,
  updateCelestialOutlineMaterial,
  updatePlanetSurfaceMaterial,
  updateStarGlowMaterial,
  updateStarSurfaceMaterial,
} from "../src/scene/materials/proceduralMaterials";
import {
  normalizeVisualSeed,
  planetMaterialColorsForPalette,
  planetMaterialProfile,
  planetRoleAnchorColors,
  scenePaletteForPreset,
  scenePaletteForStar,
  starMaterialColorsForPalette,
  starMaterialProfile,
} from "../src/scene/materials/profiles";

function numberUniform(material: THREE.ShaderMaterial, name: string): number {
  const value: unknown = material.uniforms[name]?.value;
  expect(typeof value).toBe("number");
  return value as number;
}

function colorUniform(
  material: THREE.ShaderMaterial,
  name: string,
): THREE.Color {
  const value: unknown = material.uniforms[name]?.value;
  expect(value).toBeInstanceOf(THREE.Color);
  return value as THREE.Color;
}

function rgbDistance(left: number, right: number): number {
  const a = new THREE.Color(left);
  const b = new THREE.Color(right);
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function averageNebulaDistance(
  color: number,
  palette: ReturnType<typeof scenePaletteForPreset>,
): number {
  return (
    (rgbDistance(color, palette.nebulaColorA) +
      rgbDistance(color, palette.nebulaColorB)) /
    2
  );
}

describe("procedural scene materials", () => {
  it("uses one adaptive WebGL 1 planet shader with deterministic role uniforms", () => {
    const roles: PlanetRole[] = ["beat", "bass", "chords", "melody", "texture"];
    const materials = roles.map((role, index) =>
      createPlanetSurfaceMaterial(
        {
          role,
          visualSeed: 100_000 + index,
          roughness: 0.2 + index * 0.2,
          muted: role === "texture",
        },
        0.75,
      ),
    );

    expect(
      new Set(materials.map((material) => material.vertexShader)).size,
    ).toBe(1);
    expect(
      new Set(materials.map((material) => material.fragmentShader)).size,
    ).toBe(1);
    expect(materials[0].fragmentShader).not.toContain("#version 300 es");
    expect(materials[0].fragmentShader).toContain(
      "#include <tonemapping_fragment>",
    );
    expect(materials[0].fragmentShader).toContain("#include <fog_fragment>");
    expect(materials[0].fragmentShader).toContain("proceduralSurfaceNormal");
    expect(materials[0].fragmentShader).toContain("uStarLightColor");

    materials.forEach((material, index) => {
      const role = roles[index];
      const profile = planetMaterialProfile(role);
      expect(numberUniform(material, "uRole")).toBe(index);
      expect(numberUniform(material, "uSeed")).toBe(
        normalizeVisualSeed(100_000 + index),
      );
      expect(colorUniform(material, "uBaseColor").getHex()).toBe(
        profile.baseColor,
      );
      expect(material.fog).toBe(true);
      expect(material.toneMapped).toBe(true);
      material.dispose();
    });
  });

  it("projects six authored mood palettes and bounded deterministic binary blends", () => {
    const presets: StarPresetId[] = [
      "radiant",
      "red-giant",
      "dwarf",
      "neutron",
      "void",
      "black-hole",
    ];
    const palettes = presets.map((presetId, index) =>
      scenePaletteForPreset(presetId, 400 + index),
    );
    expect(new Set(palettes.map((palette) => palette.primaryColor)).size).toBe(
      presets.length,
    );
    expect(
      palettes.every(
        (palette) =>
          palette.backgroundColor !== palette.highlightColor &&
          palette.primaryColor !== palette.highlightColor,
      ),
    ).toBe(true);

    const input = {
      presetId: "radiant" as const,
      visualSeed: 91,
      intensity: 0.8,
      companion: {
        presetId: "neutron" as const,
        visualSeed: 17,
        intensity: 1.2,
      },
    };
    const first = scenePaletteForStar(input);
    const second = scenePaletteForStar(input);
    expect(first).toEqual(second);
    expect(first.companionWeight).toBeGreaterThanOrEqual(0.16);
    expect(first.companionWeight).toBeLessThanOrEqual(0.42);
  });

  it("keeps Radiant's broad cloud lane warm and high-chroma", () => {
    const palette = scenePaletteForPreset("radiant", 0);
    const secondaryHsl = { h: 0, s: 0, l: 0 };
    const nebulaBHsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(palette.secondaryColor).getHSL(secondaryHsl);
    new THREE.Color(palette.nebulaColorB).getHSL(nebulaBHsl);

    expect(secondaryHsl.h < 0.12 || secondaryHsl.h > 0.96).toBe(true);
    expect(nebulaBHsl.h < 0.12 || nebulaBHsl.h > 0.96).toBe(true);
    expect(secondaryHsl.s).toBeGreaterThan(0.4);
    expect(nebulaBHsl.s).toBeGreaterThan(0.4);
  });

  it("keeps planet role signatures while projecting active mood colors", () => {
    const palette = scenePaletteForPreset("dwarf", 12);
    const colors = planetMaterialColorsForPalette("melody", palette);
    const material = createPlanetSurfaceMaterial(
      {
        role: "melody",
        visualSeed: 12,
        roughness: 0.4,
        muted: false,
        palette,
      },
      0.5,
    );
    expect(colorUniform(material, "uBaseColor").getHex()).toBe(
      colors.baseColor,
    );
    updatePlanetSurfaceMaterial(material, { palette });
    expect(colorUniform(material, "uStarLightColor").getHex()).toBe(
      palette.starLightColor,
    );
    material.dispose();
  });

  it("keeps authored foreground bodies separated from Void and ember nebula lanes", () => {
    for (const presetId of ["void", "black-hole", "red-giant"] as const) {
      const palette = scenePaletteForPreset(presetId, 77);
      const roles: PlanetRole[] = [
        "beat",
        "bass",
        "chords",
        "melody",
        "texture",
      ];
      const anchors = planetRoleAnchorColors(palette);
      expect(
        roles.every(
          (role) => averageNebulaDistance(anchors[role], palette) > 0.18,
        ),
      ).toBe(true);
      const pairwise = roles.flatMap((left, leftIndex) =>
        roles
          .slice(leftIndex + 1)
          .map((right) => rgbDistance(anchors[left], anchors[right])),
      );
      expect(Math.min(...pairwise)).toBeGreaterThan(0.12);
    }
  });

  it("keeps orbit lanes visibly above the active sky while gates stay distinct", () => {
    const presets: StarPresetId[] = [
      "radiant",
      "red-giant",
      "dwarf",
      "neutron",
      "void",
      "black-hole",
    ];
    presets.forEach((presetId, index) => {
      const palette = scenePaletteForPreset(presetId, 600 + index);
      expect(
        rgbDistance(palette.orbitColor, palette.backgroundColor),
      ).toBeGreaterThan(0.2);
      expect(
        rgbDistance(palette.gateColor, palette.orbitColor),
      ).toBeGreaterThan(0.18);
    });
  });

  it("keeps binary foreground accents deterministic, bounded, and chromatic", () => {
    const input = {
      presetId: "void" as const,
      visualSeed: 818,
      intensity: 0.62,
      companion: {
        presetId: "dwarf" as const,
        visualSeed: 919,
        intensity: 1.4,
      },
    };
    const first = scenePaletteForStar(input);
    const second = scenePaletteForStar(input);
    expect(first).toEqual(second);
    expect(first.companionWeight).toBeGreaterThanOrEqual(0.16);
    expect(first.companionWeight).toBeLessThanOrEqual(0.42);
    expect(first.companionStarSurfaceColor).not.toBe(first.starSurfaceColor);
    const companionHsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(starMaterialColorsForPalette(first, true).coreColor).getHSL(
      companionHsl,
    );
    expect(companionHsl.s).toBeGreaterThan(0.2);
  });

  it("updates planet frame state in place and bounds normalized controls", () => {
    const material = createPlanetSurfaceMaterial(
      {
        role: "melody",
        visualSeed: -42,
        roughness: 0.5,
        muted: false,
      },
      0.5,
    );

    updatePlanetSurfaceMaterial(material, {
      time: 7_680,
      pulse: 4,
      selected: true,
      muted: true,
      detail: -1,
      roughness: 2,
      starLightColor: 0xff4422,
      starLightIntensity: 9,
    });

    expect(numberUniform(material, "uTick")).toBe(7_680);
    expect(numberUniform(material, "uPulse")).toBe(1);
    expect(numberUniform(material, "uSelected")).toBe(1);
    expect(numberUniform(material, "uMuted")).toBe(1);
    expect(numberUniform(material, "uDetail")).toBe(0);
    expect(numberUniform(material, "uRoughness")).toBe(1);
    expect(colorUniform(material, "uStarLightColor").getHex()).toBe(0xff4422);
    expect(numberUniform(material, "uStarLightIntensity")).toBe(2.5);
    material.dispose();
  });

  it("builds a deterministic high-detail deep-space shader", () => {
    const material = createDeepSpaceMaterial();

    expect(material.fragmentShader).toContain("float fbm");
    expect(material.fragmentShader).toContain("galaxyProfile");
    expect(material.fragmentShader).toContain("filaments");
    expect(material.fragmentShader).toContain("centerQuiet");
    expect(material.fragmentShader).toContain("starLayer");
    expect(material.fragmentShader).toContain("octave < 3");
    expect(material.fragmentShader).not.toContain("octave < 4");
    expect(material.fragmentShader).toContain("irregularSignal");
    expect(material.fragmentShader).toContain("movingThread");
    expect(material.fragmentShader).toContain("dustSpecks");
    expect(material.fragmentShader).not.toContain("knotNoise");
    expect(
      material.fragmentShader.match(/valueNoise\s*\(/g) ?? [],
    ).toHaveLength(5);
    expect(material.fragmentShader).toContain(
      "1.0 - smoothstep(0.025, 0.18, radius)",
    );
    expect(material.fragmentShader).not.toContain(
      "smoothstep(0.18, 0.025, radius)",
    );
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthWrite).toBe(false);

    updateDeepSpaceMaterial(material, {
      time: 3.5,
      intensity: 5,
      visualSeed: 65_522,
      nebulaColorA: 0x112233,
      nebulaColorB: 0x445566,
      backgroundColor: 0x080a18,
      starfieldColor: 0xddeeff,
    });
    expect(numberUniform(material, "uTime")).toBe(3.5);
    expect(numberUniform(material, "uIntensity")).toBe(1);
    expect(numberUniform(material, "uSeed")).toBeCloseTo(1 / 65_521);
    expect(colorUniform(material, "uNebulaColorA").getHex()).toBe(0x112233);
    expect(colorUniform(material, "uNebulaColorB").getHex()).toBe(0x445566);
    expect(colorUniform(material, "uBackgroundColor").getHex()).toBe(0x080a18);
    expect(colorUniform(material, "uStarfieldColor").getHex()).toBe(0xddeeff);
    material.dispose();
  });

  it("provides a cheaper nebula and star shader for mobile profiles", () => {
    const material = createSimpleDeepSpaceMaterial();

    expect(material.fragmentShader).toContain("simpleStarLayer");
    expect(material.fragmentShader).toContain("float valueNoise");
    expect(material.fragmentShader).toContain("sharedLaneNoise");
    expect(material.fragmentShader).not.toContain("float fbm");
    expect(material.fragmentShader).not.toContain("galaxyProfile");
    expect(material.fragmentShader).not.toContain("filamentFine");
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthWrite).toBe(false);
    material.dispose();
  });

  it("maps every stellar preset to stable surface and selective glow uniforms", () => {
    const presets: StarPresetId[] = [
      "radiant",
      "red-giant",
      "dwarf",
      "neutron",
      "void",
    ];

    presets.forEach((presetId, index) => {
      const descriptor = {
        presetId,
        visualSeed: index * 73,
        intensity: 0.8,
      };
      const surface = createStarSurfaceMaterial(descriptor, 0.6);
      const glow = createStarGlowMaterial(descriptor, 0.6);
      const profile = starMaterialProfile(presetId);

      expect(numberUniform(surface, "uPreset")).toBe(index);
      expect(numberUniform(surface, "uTurbulence")).toBe(profile.turbulence);
      expect(numberUniform(glow, "uGlowStrength")).toBe(profile.glowStrength);
      expect(colorUniform(glow, "uGlowColor").getHex()).toBe(profile.glowColor);
      expect(glow.blending).toBe(THREE.AdditiveBlending);
      expect(glow.depthWrite).toBe(false);
      expect(glow.side).toBe(THREE.FrontSide);

      updateStarSurfaceMaterial(surface, {
        time: 960,
        pulse: 0.4,
        intensity: 1.2,
        palette: scenePaletteForPreset(presetId, index * 73),
      });
      updateStarGlowMaterial(glow, {
        time: 960,
        pulse: 0.4,
        intensity: 1.2,
      });
      expect(numberUniform(surface, "uTick")).toBe(960);
      expect(numberUniform(glow, "uIntensity")).toBe(1.2);

      surface.dispose();
      glow.dispose();
    });

    const voidSurface = createStarSurfaceMaterial(
      {
        presetId: "void",
        visualSeed: 7,
        intensity: 0.9,
        palette: scenePaletteForPreset("void", 7),
      },
      0.8,
    );
    expect(numberUniform(voidSurface, "uVoidSurfaceScale")).toBeCloseTo(0.64);
    expect(colorUniform(voidSurface, "uCoreColor").getHex()).toBe(
      scenePaletteForPreset("void", 7).starSurfaceColor,
    );
    const voidGlow = createStarGlowMaterial(
      { presetId: "void", visualSeed: 7, intensity: 0.9 },
      0.8,
    );
    expect(voidGlow.fragmentShader).toContain("float outerFalloff");
    expect(voidGlow.fragmentShader).toContain("float innerFalloff");
    expect(voidGlow.fragmentShader).toContain("float coronaBand");
    expect(voidGlow.fragmentShader).toContain(
      "gl_FragColor = vec4(emitted * 0.9",
    );
    expect(numberUniform(voidGlow, "uVoidCoronaScale")).toBeCloseTo(0.42);
    voidSurface.dispose();
    voidGlow.dispose();
  });

  it("uses a soft non-monotonic ordinary-star corona and luminous limb", () => {
    const surface = createStarSurfaceMaterial(
      { presetId: "dwarf", visualSeed: 14, intensity: 0.9 },
      0.8,
    );
    const glow = createStarGlowMaterial(
      { presetId: "dwarf", visualSeed: 14, intensity: 0.9 },
      0.8,
    );

    expect(surface.fragmentShader).toContain("vec3 luminousLimbColor");
    expect(surface.fragmentShader).toContain(
      "color = mix(color, luminousLimbColor",
    );
    expect(surface.fragmentShader).toMatch(
      /if \(uPreset < 3\.5\) \{[\s\S]*?luminousLimbColor[\s\S]*?\} else \{/,
    );

    expect(glow.fragmentShader).toContain(
      "float outerFalloff = smoothstep(0.0, 0.24, facing);",
    );
    expect(glow.fragmentShader).toContain(
      "float innerFalloff = 1.0 - smoothstep(0.58, 0.86, facing);",
    );
    expect(glow.fragmentShader).toContain(
      "float coronaBand = outerFalloff * innerFalloff;",
    );
    expect(glow.fragmentShader).not.toContain("float limb =");
    expect(glow.fragmentShader).not.toContain("float outerHalo");

    const coronaBand = (facing: number): number => {
      const smoothstep = (edge0: number, edge1: number, value: number) => {
        const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      };
      return smoothstep(0, 0.24, facing) * (1 - smoothstep(0.58, 0.86, facing));
    };

    expect(coronaBand(0)).toBe(0);
    expect(coronaBand(0.08)).toBeLessThan(coronaBand(0.42));
    expect(coronaBand(0.42)).toBeGreaterThan(coronaBand(0.82));
    expect(coronaBand(0.9)).toBe(0);

    surface.dispose();
    glow.dispose();
  });

  it("keeps the resting Void surface above the deep-space visibility floor", () => {
    const surface = createStarSurfaceMaterial(
      { presetId: "void", visualSeed: 404, intensity: 0.4 },
      0,
    );

    expect(surface.fragmentShader).toContain("voidVisibilityFloor");
    expect(surface.fragmentShader).toContain("color = max(color");
    expect(numberUniform(surface, "uIntensity")).toBe(0.4);
    surface.dispose();
  });

  it("keeps the essential outline shader lightweight and visible without bloom", () => {
    const outline = createCelestialOutlineMaterial(0x8eeaff, 0.045, 0.88);

    expect(outline.side).toBe(THREE.BackSide);
    expect(outline.depthWrite).toBe(false);
    expect(outline.transparent).toBe(true);
    expect(outline.blending).toBe(THREE.NormalBlending);
    expect(outline.vertexShader).toContain("position + normal * uThickness");
    expect(colorUniform(outline, "uColor").getHex()).toBe(0x8eeaff);

    updateCelestialOutlineMaterial(outline, {
      pulse: 2,
      selected: true,
      muted: true,
      opacity: 4,
    });
    expect(numberUniform(outline, "uPulse")).toBe(1);
    expect(numberUniform(outline, "uSelected")).toBe(1);
    expect(numberUniform(outline, "uMuted")).toBe(1);
    expect(numberUniform(outline, "uOpacity")).toBe(1);
    outline.dispose();
  });

  it("rejects using an updater with the wrong procedural material kind", () => {
    const glow = createStarGlowMaterial(
      { presetId: "radiant", visualSeed: 1, intensity: 0.8 },
      0.5,
    );

    expect(() => updatePlanetSurfaceMaterial(glow, { pulse: 1 })).toThrow(
      "Expected a Cosmic Beatmaker planet-surface material.",
    );
    glow.dispose();
  });
});
