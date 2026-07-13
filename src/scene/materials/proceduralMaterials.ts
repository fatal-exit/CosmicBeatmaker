import * as THREE from "three";

import type { PlanetRole, StarPresetId } from "../../domain/composition";
import {
  normalizeVisualSeed,
  planetMaterialProfile,
  starMaterialProfile,
} from "./profiles";

/** The subset of PlanetSceneDescriptor required to construct a surface. */
export interface PlanetSurfaceDescriptor {
  role: PlanetRole;
  visualSeed: number;
  roughness: number;
  muted: boolean;
}

/** The subset of SceneDescriptor["star"] required to construct a surface. */
export interface StarSurfaceDescriptor {
  presetId: StarPresetId;
  visualSeed: number;
  intensity: number;
}

export interface PlanetSurfaceUpdate {
  /** Authoritative audio transport time, in ticks. */
  time?: number;
  /** Normalized event energy. */
  pulse?: number;
  selected?: boolean;
  muted?: boolean;
  /** Normalized visual detail. Zero retains the broad identifying pattern. */
  detail?: number;
  roughness?: number;
}

export interface StarSurfaceUpdate {
  /** Authoritative audio transport time, in ticks. */
  time?: number;
  /** Normalized event energy. */
  pulse?: number;
  selected?: boolean;
  /** Normalized visual detail. */
  detail?: number;
  intensity?: number;
}

export type StarGlowUpdate = StarSurfaceUpdate;

export interface CelestialOutlineUpdate {
  pulse?: number;
  selected?: boolean;
  muted?: boolean;
  opacity?: number;
}

type MaterialKind =
  "planet-surface" | "star-surface" | "star-glow" | "celestial-outline";

const MATERIAL_KIND_KEY = "cosmicBeatmakerMaterialKind";
const PLANET_ROLES: readonly PlanetRole[] = [
  "beat",
  "bass",
  "chords",
  "melody",
  "texture",
];
const STAR_PRESETS: readonly StarPresetId[] = [
  "radiant",
  "red-giant",
  "dwarf",
  "neutron",
  "void",
];

const OUTLINE_VERTEX_SHADER = /* glsl */ `
uniform float uThickness;

#include <fog_pars_vertex>

void main() {
  vec3 expanded = position + normal * uThickness;
  vec4 mvPosition = modelViewMatrix * vec4(expanded, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const OUTLINE_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPulse;
uniform float uSelected;
uniform float uMuted;

#include <common>
#include <fog_pars_fragment>
#include <dithering_pars_fragment>

void main() {
  float emphasis = 0.82 + uSelected * 0.28 + uPulse * 0.22;
  float muted = mix(1.0, 0.44, uMuted);
  gl_FragColor = vec4(uColor * emphasis, uOpacity * muted);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

const PLANET_VERTEX_SHADER = /* glsl */ `
uniform float uRole;
uniform float uSeed;
uniform float uTick;
uniform float uPulse;
uniform float uDetail;
uniform float uDisplacement;
uniform float uMotion;

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#include <fog_pars_vertex>

float surfaceWave(vec3 point) {
  float time = uTick / 1920.0;
  float broad = sin(dot(point, vec3(5.7, 7.3, 4.9)) + uSeed * 29.0);
  float fine = sin(dot(point, vec3(15.1, -12.7, 10.9)) - uSeed * 47.0);
  float detailWave = mix(broad, broad * 0.65 + fine * 0.35, uDetail);

  if (uRole < 0.5) {
    float faults = abs(sin(point.y * 18.0 + point.x * 9.0 + uSeed * 13.0));
    return detailWave * 0.45 - pow(faults, 9.0) * 0.55;
  }
  if (uRole < 1.5) {
    return sin(point.y * 10.0 + broad * 0.8 + time * uMotion * 8.0) * 0.42;
  }
  if (uRole < 2.5) {
    float strata = sin(point.y * 23.0 + broad * 2.2);
    return strata * 0.3 + detailWave * 0.22;
  }
  if (uRole < 3.5) {
    float angle = atan(point.z, point.x);
    return sin(angle * 4.0 + point.y * 13.0 + broad + time * uMotion * 7.0) * 0.35;
  }
  return detailWave * 0.48 + sin(point.y * 27.0 + broad * 4.0) * 0.12;
}

void main() {
  vec3 direction = normalize(position);
  float displacement = surfaceWave(direction);
  displacement *= uDisplacement * mix(0.55, 1.0, uDetail);
  displacement *= 1.0 + uPulse * 0.12;
  vec3 transformed = position + normal * displacement;

  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vObjectPosition = direction;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const PLANET_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uShadowColor;
uniform vec3 uAccentColor;
uniform vec3 uSecondaryColor;
uniform float uRole;
uniform float uSeed;
uniform float uTick;
uniform float uPulse;
uniform float uSelected;
uniform float uMuted;
uniform float uDetail;
uniform float uRoughness;
uniform float uMotion;

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#include <common>
#include <fog_pars_fragment>
#include <dithering_pars_fragment>

float hash13(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.yzx + 33.33 + uSeed * 11.0);
  return fract((point.x + point.y) * point.z);
}

float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float n000 = hash13(cell);
  float n100 = hash13(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(cell + vec3(1.0, 1.0, 1.0));
  float lower = mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y);
  float upper = mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y);
  return mix(lower, upper, local.z);
}

vec2 sphereCoordinates(vec3 direction) {
  return vec2(
    atan(direction.z, direction.x) / PI2 + 0.5,
    asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
  );
}

float craterField(vec2 sphereUv) {
  vec2 grid = sphereUv * vec2(10.0, 5.0);
  vec2 cell = floor(grid);
  vec2 offset = vec2(
    hash13(vec3(cell, 1.7)),
    hash13(vec3(cell, 8.3))
  ) - 0.5;
  float radius = mix(0.17, 0.36, hash13(vec3(cell, 4.1)));
  float distanceToCenter = length(fract(grid) - 0.5 - offset * 0.42);
  float rim = 1.0 - smoothstep(0.035, 0.105, abs(distanceToCenter - radius));
  float basin = 1.0 - smoothstep(0.0, radius, distanceToCenter);
  return rim - basin * 0.62;
}

vec3 planetPattern(vec3 direction, vec3 viewDirection) {
  vec2 sphereUv = sphereCoordinates(direction);
  float time = uTick / 1920.0;
  float broadNoise = valueNoise(direction * 3.1 + uSeed * 17.0);
  float fineNoise = broadNoise;
  if (uDetail > 0.12) {
    fineNoise = valueNoise(direction * mix(6.0, 11.0, uDetail) - uSeed * 31.0);
  }
  vec3 color = mix(uShadowColor, uBaseColor, 0.64 + broadNoise * 0.3);

  // Beat: crater basins and sharp fault lines communicate hard transients.
  if (uRole < 0.5) {
    float craters = craterField(sphereUv + vec2(uSeed, uSeed * 0.37));
    float faultDistance = abs(fract(
      sphereUv.x * 7.0 + sphereUv.y * 11.0 + broadNoise * 0.45 + uSeed * 5.0
    ) - 0.5);
    float faults = 1.0 - smoothstep(0.018, 0.075, faultDistance);
    color = mix(color, uShadowColor, smoothstep(-0.45, -0.05, -craters) * 0.64);
    color = mix(color, uAccentColor, max(craters, faults) * 0.78);
    color = mix(color, uSecondaryColor, fineNoise * 0.18);
    return color;
  }

  // Bass: broad tidal gas bands move slowly without obscuring the silhouette.
  if (uRole < 1.5) {
    float tide = direction.y * 11.0 + broadNoise * 2.6 + time * uMotion * 5.0;
    float bands = 0.5 + 0.5 * sin(tide);
    float brightEdge = pow(max(0.0, sin(tide)), 8.0);
    color = mix(uShadowColor, uSecondaryColor, smoothstep(0.12, 0.88, bands));
    color = mix(color, uBaseColor, 0.34 + broadNoise * 0.42);
    color = mix(color, uAccentColor, brightEdge * (0.24 + uDetail * 0.3));
    return color;
  }

  // Chords: stepped mineral strata are crossed by connected luminous veins.
  if (uRole < 2.5) {
    float strataCoordinate = direction.y * 7.5 + broadNoise * 0.75;
    float strata = smoothstep(0.1, 0.92, fract(strataCoordinate));
    float veinDistance = abs(sin(
      direction.x * 14.0 - direction.z * 12.0 + broadNoise * 6.0 + uSeed * 19.0
    ));
    float veins = 1.0 - smoothstep(0.0, mix(0.09, 0.2, uDetail), veinDistance);
    color = mix(uShadowColor, uBaseColor, strata);
    color = mix(color, uSecondaryColor, (1.0 - strata) * 0.42);
    color = mix(color, uAccentColor, veins * (0.7 + uPulse * 0.3));
    return color;
  }

  // Melody: pearlescent signal ribbons orbit the surface at musical speed.
  if (uRole < 3.5) {
    float angle = atan(direction.z, direction.x);
    float phase = angle * 4.0 + direction.y * 16.0 + broadNoise * 4.0;
    phase += time * uMotion * 7.0;
    float swirl = 0.5 + 0.5 * sin(phase);
    float signal = pow(max(0.0, sin(phase + fineNoise * 2.0)), 12.0);
    float pearl = pow(1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0), 2.0);
    color = mix(uSecondaryColor, uBaseColor, swirl);
    color = mix(color, uAccentColor, signal * 0.88 + pearl * 0.22);
    return color;
  }

  // Texture: fine dusty crust sits over a slowly eroding cool cloud layer.
  float erosion = smoothstep(0.3, 0.72, broadNoise * 0.65 + fineNoise * 0.45);
  float dustNoise = valueNoise(
    direction * mix(8.0, 15.0, uDetail) + vec3(0.0, time * uMotion, 0.0)
  );
  float dust = smoothstep(0.66, 0.84, dustNoise);
  color = mix(uShadowColor, uSecondaryColor, erosion);
  color = mix(color, uBaseColor, 0.35 + fineNoise * 0.45);
  return mix(color, uAccentColor, dust * (0.3 + uDetail * 0.4));
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 starDirection = normalize(-vWorldPosition);
  float starDistance = length(vWorldPosition);
  float attenuation = 1.0 / (1.0 + starDistance * starDistance * 0.018);
  float diffuse = max(dot(normal, starDirection), 0.0);
  float backScatter = max(dot(-normal, starDirection), 0.0);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.35);

  vec3 halfDirection = normalize(starDirection + viewDirection);
  float specularPower = mix(86.0, 7.0, uRoughness);
  float specular = pow(max(dot(normal, halfDirection), 0.0), specularPower);
  specular *= mix(0.62, 0.07, uRoughness) * attenuation;

  vec3 albedo = planetPattern(normalize(vObjectPosition), viewDirection);
  float light = 0.2 + diffuse * attenuation * 1.18 + backScatter * 0.035;
  vec3 outgoingLight = albedo * light;
  outgoingLight += uAccentColor * specular;
  outgoingLight += uAccentColor * rim * (0.1 + uSelected * 0.44);
  outgoingLight += uAccentColor * uPulse * (0.16 + rim * 0.46);

  float luminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  outgoingLight = mix(outgoingLight, vec3(luminance) * 0.48, uMuted * 0.72);
  outgoingLight *= mix(1.0, 0.54, uMuted);
  float opacity = mix(1.0, 0.42, uMuted);
  gl_FragColor = vec4(outgoingLight, opacity);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

const STAR_VERTEX_SHADER = /* glsl */ `
uniform float uPreset;
uniform float uSeed;
uniform float uTick;
uniform float uPulse;
uniform float uDetail;
uniform float uTurbulence;

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#include <fog_pars_vertex>

float starDisplacement(vec3 direction) {
  float time = uTick / 1920.0;
  float broad = sin(dot(direction, vec3(5.2, 7.7, -6.3)) + uSeed * 37.0 + time * 0.8);
  float fine = sin(dot(direction, vec3(-15.7, 13.1, 17.3)) - uSeed * 51.0 - time * 1.3);
  float wave = mix(broad, broad * 0.62 + fine * 0.38, uDetail);

  if (uPreset > 2.5 && uPreset < 3.5) {
    float longitude = atan(direction.z, direction.x);
    wave += sin(longitude * 6.0 + direction.y * 8.0 + time * 2.2) * 0.45;
  } else if (uPreset > 3.5) {
    wave *= 0.46;
  } else if (uPreset > 0.5 && uPreset < 1.5) {
    wave *= 1.25;
  }
  return wave;
}

void main() {
  vec3 direction = normalize(position);
  float displacement = starDisplacement(direction);
  displacement *= 0.018 * uTurbulence * mix(0.55, 1.0, uDetail);
  displacement += uPulse * 0.015;
  vec3 transformed = position + normal * displacement;

  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vObjectPosition = direction;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const STAR_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uCoreColor;
uniform vec3 uHotColor;
uniform vec3 uEdgeColor;
uniform float uPreset;
uniform float uSeed;
uniform float uTick;
uniform float uPulse;
uniform float uSelected;
uniform float uDetail;
uniform float uIntensity;
uniform float uTurbulence;

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#include <common>
#include <fog_pars_fragment>
#include <dithering_pars_fragment>

float hash13(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.yzx + 33.33 + uSeed * 13.0);
  return fract((point.x + point.y) * point.z);
}

float valueNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float n000 = hash13(cell);
  float n100 = hash13(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(cell + vec3(1.0, 1.0, 1.0));
  float lower = mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y);
  float upper = mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y);
  return mix(lower, upper, local.z);
}

void main() {
  vec3 direction = normalize(vObjectPosition);
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float limb = pow(1.0 - max(dot(normal, viewDirection), 0.0), 1.4);
  float time = uTick / 1920.0;
  float broad = valueNoise(direction * mix(2.4, 4.2, uTurbulence) + vec3(time * 0.13));
  float fine = broad;
  if (uDetail > 0.12) {
    fine = valueNoise(direction * mix(7.0, 13.0, uDetail) - vec3(time * 0.19));
  }
  vec3 color;

  // Radiant: crisp solar granulation.
  if (uPreset < 0.5) {
    float granules = smoothstep(0.42, 0.72, fine * 0.7 + broad * 0.3);
    color = mix(uCoreColor, uHotColor, granules);
  // Red giant: broad, dark-edged convection cells.
  } else if (uPreset < 1.5) {
    float cells = 0.5 + 0.5 * sin(broad * 11.0 + fine * 3.0);
    float channels = 1.0 - smoothstep(0.0, 0.18, abs(cells - 0.5));
    color = mix(uEdgeColor, uCoreColor, smoothstep(0.12, 0.78, cells));
    color = mix(color, uHotColor, smoothstep(0.78, 0.98, cells));
    color = mix(color, uEdgeColor, channels * 0.32);
  // Dwarf: compact blue-white micro-granulation.
  } else if (uPreset < 2.5) {
    float grain = smoothstep(0.3, 0.68, fine);
    color = mix(uCoreColor, uHotColor, grain * 0.72);
  // Neutron: fast magnetic belts and bright pulse lanes.
  } else if (uPreset < 3.5) {
    float longitude = atan(direction.z, direction.x);
    float magnetic = abs(sin(longitude * 5.0 + direction.y * 13.0 + time * 2.0));
    float lanes = pow(max(0.0, 1.0 - magnetic), 7.0);
    color = mix(uEdgeColor, uCoreColor, 0.52 + broad * 0.4);
    color = mix(color, uHotColor, lanes * (0.76 + uPulse * 0.24));
  // Void: sparse dark-plasma veils with restrained luminous fractures.
  } else {
    float veil = smoothstep(0.42, 0.77, broad * 0.72 + fine * 0.28);
    float fracture = pow(max(0.0, sin(fine * 15.0 + direction.y * 7.0)), 11.0);
    color = mix(uEdgeColor * 0.32, uCoreColor, veil * 0.78);
    color = mix(color, uHotColor, fracture * 0.38);
  }

  color = mix(color, uEdgeColor, limb * mix(0.42, 0.7, step(3.5, uPreset)));
  color += uHotColor * (uPulse * 0.3 + uSelected * limb * 0.3);
  color *= mix(0.72, 1.38, clamp(uIntensity, 0.0, 1.5));
  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

const GLOW_VERTEX_SHADER = /* glsl */ `
uniform float uTick;
uniform float uPulse;
uniform float uDetail;

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#include <fog_pars_vertex>

void main() {
  vec3 direction = normalize(position);
  float time = uTick / 1920.0;
  float shimmer = sin(
    dot(direction, vec3(8.0, 11.0, 9.0)) + time * 1.4
  ) * 0.006 * uDetail;
  vec3 transformed = position + normal * (shimmer + uPulse * 0.012);
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vObjectPosition = direction;
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uGlowColor;
uniform float uPreset;
uniform float uSeed;
uniform float uTick;
uniform float uPulse;
uniform float uSelected;
uniform float uDetail;
uniform float uIntensity;
uniform float uGlowStrength;

varying vec3 vObjectPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#include <common>
#include <fog_pars_fragment>
#include <dithering_pars_fragment>

void main() {
  vec3 direction = normalize(vObjectPosition);
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - abs(dot(normal, viewDirection)), 2.15);
  float time = uTick / 1920.0;
  float shimmer = 0.5 + 0.5 * sin(
    dot(direction, vec3(10.7, -8.9, 12.3)) + uSeed * 41.0 + time * 1.6
  );
  float variation = mix(0.82, 1.14, shimmer * uDetail);

  if (uPreset > 2.5 && uPreset < 3.5) {
    float longitude = atan(direction.z, direction.x);
    variation += pow(abs(sin(longitude * 4.0 + time * 2.1)), 12.0) * 0.42;
  } else if (uPreset > 3.5) {
    variation *= 0.64 + shimmer * 0.2;
  }

  float strength = uGlowStrength * mix(0.38, 1.0, clamp(uIntensity, 0.0, 1.0));
  strength *= variation * (1.0 + uPulse * 0.42 + uSelected * 0.14);
  float alpha = fresnel * strength * 0.58;
  gl_FragColor = vec4(uGlowColor * strength, alpha);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <dithering_fragment>
}
`;

function clampFinite(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedDetail(detail: number): number {
  return clampFinite(detail, 0, 1);
}

function indexOfPlanetRole(role: PlanetRole): number {
  return PLANET_ROLES.indexOf(role);
}

function indexOfStarPreset(presetId: StarPresetId): number {
  return STAR_PRESETS.indexOf(presetId);
}

function fogUniforms(
  uniforms: Record<string, THREE.IUniform>,
): Record<string, THREE.IUniform> {
  return THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]) as Record<
    string,
    THREE.IUniform
  >;
}

function markMaterial(
  material: THREE.ShaderMaterial,
  kind: MaterialKind,
): void {
  material.userData[MATERIAL_KIND_KEY] = kind;
}

function assertMaterialKind(
  material: THREE.ShaderMaterial,
  expected: MaterialKind,
): void {
  if (material.userData[MATERIAL_KIND_KEY] !== expected) {
    throw new Error(`Expected a Cosmic Beatmaker ${expected} material.`);
  }
}

function setNumberUniform(
  material: THREE.ShaderMaterial,
  name: string,
  value: number,
): void {
  const uniform = material.uniforms[name];
  if (!uniform) throw new Error(`Missing procedural material uniform ${name}.`);
  uniform.value = value;
}

function updateTime(
  material: THREE.ShaderMaterial,
  time: number | undefined,
): void {
  if (time !== undefined && Number.isFinite(time)) {
    setNumberUniform(material, "uTick", time);
  }
}

function createProceduralMaterial(
  kind: MaterialKind,
  uniforms: Record<string, THREE.IUniform>,
  vertexShader: string,
  fragmentShader: string,
  parameters: Pick<
    THREE.ShaderMaterialParameters,
    "blending" | "depthTest" | "depthWrite" | "side" | "transparent"
  >,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: fogUniforms(uniforms),
    vertexShader,
    fragmentShader,
    fog: true,
    toneMapped: true,
    dithering: true,
    ...parameters,
  });
  markMaterial(material, kind);
  return material;
}

/**
 * Lightweight inverted-hull silhouette used when crowded orbit lanes push the
 * camera farther back. It remains enabled when optional bloom is disabled.
 */
export function createCelestialOutlineMaterial(
  color: THREE.ColorRepresentation,
  thickness: number,
  opacity = 0.86,
): THREE.ShaderMaterial {
  const material = createProceduralMaterial(
    "celestial-outline",
    {
      uColor: { value: new THREE.Color(color) },
      uThickness: { value: clampFinite(thickness, 0.005, 0.2) },
      uOpacity: { value: clampFinite(opacity, 0, 1) },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uMuted: { value: 0 },
    },
    OUTLINE_VERTEX_SHADER,
    OUTLINE_FRAGMENT_SHADER,
    {
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.BackSide,
      transparent: true,
    },
  );
  material.name = "celestial-outline";
  return material;
}

export function updateCelestialOutlineMaterial(
  material: THREE.ShaderMaterial,
  update: CelestialOutlineUpdate,
): void {
  assertMaterialKind(material, "celestial-outline");
  if (update.pulse !== undefined) {
    setNumberUniform(material, "uPulse", clampFinite(update.pulse, 0, 1));
  }
  if (update.selected !== undefined) {
    setNumberUniform(material, "uSelected", update.selected ? 1 : 0);
  }
  if (update.muted !== undefined) {
    setNumberUniform(material, "uMuted", update.muted ? 1 : 0);
  }
  if (update.opacity !== undefined) {
    setNumberUniform(material, "uOpacity", clampFinite(update.opacity, 0, 1));
  }
}

/**
 * Creates one of the five role-specific planet appearances using a shared,
 * WebGL 1 compatible shader program.
 */
export function createPlanetSurfaceMaterial(
  descriptor: PlanetSurfaceDescriptor,
  detail: number,
): THREE.ShaderMaterial {
  const profile = planetMaterialProfile(descriptor.role);
  const material = createProceduralMaterial(
    "planet-surface",
    {
      uBaseColor: { value: new THREE.Color(profile.baseColor) },
      uShadowColor: { value: new THREE.Color(profile.shadowColor) },
      uAccentColor: { value: new THREE.Color(profile.accentColor) },
      uSecondaryColor: { value: new THREE.Color(profile.secondaryColor) },
      uRole: { value: indexOfPlanetRole(descriptor.role) },
      uSeed: { value: normalizeVisualSeed(descriptor.visualSeed) },
      uTick: { value: 0 },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uMuted: { value: descriptor.muted ? 1 : 0 },
      uDetail: { value: normalizedDetail(detail) },
      uRoughness: {
        value: clampFinite(descriptor.roughness, 0.04, 1),
      },
      uDisplacement: { value: profile.displacement },
      uMotion: { value: profile.motion },
    },
    PLANET_VERTEX_SHADER,
    PLANET_FRAGMENT_SHADER,
    {
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: true,
      side: THREE.FrontSide,
      transparent: true,
    },
  );
  material.name = `planet-surface:${descriptor.role}`;
  return material;
}

/** Updates transient planet uniforms without rebuilding or recompiling material. */
export function updatePlanetSurfaceMaterial(
  material: THREE.ShaderMaterial,
  update: PlanetSurfaceUpdate,
): void {
  assertMaterialKind(material, "planet-surface");
  updateTime(material, update.time);
  if (update.pulse !== undefined) {
    setNumberUniform(material, "uPulse", clampFinite(update.pulse, 0, 1));
  }
  if (update.selected !== undefined) {
    setNumberUniform(material, "uSelected", update.selected ? 1 : 0);
  }
  if (update.muted !== undefined) {
    setNumberUniform(material, "uMuted", update.muted ? 1 : 0);
  }
  if (update.detail !== undefined) {
    setNumberUniform(material, "uDetail", normalizedDetail(update.detail));
  }
  if (update.roughness !== undefined) {
    setNumberUniform(
      material,
      "uRoughness",
      clampFinite(update.roughness, 0.04, 1),
    );
  }
}

/** Creates a preset-specific, procedural stellar surface. */
export function createStarSurfaceMaterial(
  descriptor: StarSurfaceDescriptor,
  detail: number,
): THREE.ShaderMaterial {
  const profile = starMaterialProfile(descriptor.presetId);
  const material = createProceduralMaterial(
    "star-surface",
    {
      uCoreColor: { value: new THREE.Color(profile.coreColor) },
      uHotColor: { value: new THREE.Color(profile.hotColor) },
      uEdgeColor: { value: new THREE.Color(profile.edgeColor) },
      uPreset: { value: indexOfStarPreset(descriptor.presetId) },
      uSeed: { value: normalizeVisualSeed(descriptor.visualSeed) },
      uTick: { value: 0 },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uDetail: { value: normalizedDetail(detail) },
      uIntensity: { value: clampFinite(descriptor.intensity, 0, 1.5) },
      uTurbulence: { value: profile.turbulence },
    },
    STAR_VERTEX_SHADER,
    STAR_FRAGMENT_SHADER,
    {
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: true,
      side: THREE.FrontSide,
      transparent: false,
    },
  );
  material.name = `star-surface:${descriptor.presetId}`;
  return material;
}

/** Updates transient star uniforms without rebuilding or recompiling material. */
export function updateStarSurfaceMaterial(
  material: THREE.ShaderMaterial,
  update: StarSurfaceUpdate,
): void {
  assertMaterialKind(material, "star-surface");
  updateStarUniforms(material, update);
}

/** Creates the additive shell rendered around a procedural star surface. */
export function createStarGlowMaterial(
  descriptor: StarSurfaceDescriptor,
  detail: number,
): THREE.ShaderMaterial {
  const profile = starMaterialProfile(descriptor.presetId);
  const material = createProceduralMaterial(
    "star-glow",
    {
      uGlowColor: { value: new THREE.Color(profile.glowColor) },
      uPreset: { value: indexOfStarPreset(descriptor.presetId) },
      uSeed: { value: normalizeVisualSeed(descriptor.visualSeed) },
      uTick: { value: 0 },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uDetail: { value: normalizedDetail(detail) },
      uIntensity: { value: clampFinite(descriptor.intensity, 0, 1.5) },
      uGlowStrength: { value: profile.glowStrength },
    },
    GLOW_VERTEX_SHADER,
    GLOW_FRAGMENT_SHADER,
    {
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.BackSide,
      transparent: true,
    },
  );
  material.name = `star-glow:${descriptor.presetId}`;
  return material;
}

/** Updates transient glow uniforms in lockstep with the stellar surface. */
export function updateStarGlowMaterial(
  material: THREE.ShaderMaterial,
  update: StarGlowUpdate,
): void {
  assertMaterialKind(material, "star-glow");
  updateStarUniforms(material, update);
}

function updateStarUniforms(
  material: THREE.ShaderMaterial,
  update: StarSurfaceUpdate,
): void {
  updateTime(material, update.time);
  if (update.pulse !== undefined) {
    setNumberUniform(material, "uPulse", clampFinite(update.pulse, 0, 1));
  }
  if (update.selected !== undefined) {
    setNumberUniform(material, "uSelected", update.selected ? 1 : 0);
  }
  if (update.detail !== undefined) {
    setNumberUniform(material, "uDetail", normalizedDetail(update.detail));
  }
  if (update.intensity !== undefined) {
    setNumberUniform(
      material,
      "uIntensity",
      clampFinite(update.intensity, 0, 1.5),
    );
  }
}
