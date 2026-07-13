import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { PlanetRole, StarPresetId } from "../src/domain/composition";
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
  planetMaterialProfile,
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
    });

    expect(numberUniform(material, "uTick")).toBe(7_680);
    expect(numberUniform(material, "uPulse")).toBe(1);
    expect(numberUniform(material, "uSelected")).toBe(1);
    expect(numberUniform(material, "uMuted")).toBe(1);
    expect(numberUniform(material, "uDetail")).toBe(0);
    expect(numberUniform(material, "uRoughness")).toBe(1);
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
      expect(glow.side).toBe(THREE.BackSide);

      updateStarSurfaceMaterial(surface, {
        time: 960,
        pulse: 0.4,
        intensity: 1.2,
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
