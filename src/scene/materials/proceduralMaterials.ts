import * as THREE from "three";

import type { PlanetRole, StarPresetId } from "../../domain/composition";
import {
  normalizeVisualSeed,
  planetMaterialColorsForPalette,
  planetMaterialProfile,
  starMaterialColorsForPalette,
  type ScenePalette,
  starMaterialProfile,
} from "./profiles";

/** The subset of PlanetSceneDescriptor required to construct a surface. */
export interface PlanetSurfaceDescriptor {
  role: PlanetRole;
  visualSeed: number;
  roughness: number;
  muted: boolean;
  /** Optional renderer-only mood projection for this material instance. */
  palette?: ScenePalette;
}

/** The subset of SceneDescriptor["star"] required to construct a surface. */
export interface StarSurfaceDescriptor {
  presetId: StarPresetId;
  visualSeed: number;
  intensity: number;
  palette?: ScenePalette;
  /** Use the authored binary companion accent instead of the primary star. */
  companion?: boolean;
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
  /** Color and level of the central star's incident light. */
  starLightColor?: THREE.ColorRepresentation;
  starLightIntensity?: number;
  palette?: ScenePalette;
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
  palette?: ScenePalette;
  companion?: boolean;
}

export type StarGlowUpdate = StarSurfaceUpdate;

export interface CelestialOutlineUpdate {
  color?: THREE.ColorRepresentation;
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
  "black-hole",
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
  float broad = sin(dot(point, vec3(3.2, 4.4, 2.7)) + uSeed * 17.0);

  if (uRole < 0.5) {
    float plates = sin(point.y * 5.0 + point.x * 2.7 + uSeed * 4.0);
    float fault = smoothstep(0.72, 0.96,
      abs(sin(point.x * 3.2 - point.z * 2.4 + uSeed * 3.0)));
    return broad * 0.18 + plates * 0.18 - fault * 0.26;
  }
  if (uRole < 1.5) {
    float bands = sin(point.y * 5.4 + broad * 0.7 + time * uMotion * 3.5);
    float storm = exp(-length(point - vec3(0.28, 0.18, -0.18)) * 4.8);
    return bands * 0.26 + storm * 0.2;
  }
  if (uRole < 2.5) {
    float terraces = sin(point.y * 6.2 + broad * 0.65);
    return terraces * 0.24 + smoothstep(0.25, 0.78, terraces) * 0.12;
  }
  if (uRole < 3.5) {
    float facets = sin(point.x * 3.4 + point.z * 2.8 + broad * 0.7);
    float facetBreak = sin(point.y * 3.6 - point.x * 2.2 + uSeed * 2.0);
    return facets * 0.2 + facetBreak * 0.14 + time * uMotion * 0.012;
  }
  float erosion = sin(point.x * 3.8 - point.z * 3.1 + broad * 0.8);
  return broad * 0.22 + erosion * 0.16;
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
uniform vec3 uStarLightColor;
uniform float uRole;
uniform float uSeed;
uniform float uTick;
uniform float uPulse;
uniform float uSelected;
uniform float uMuted;
uniform float uDetail;
uniform float uRoughness;
uniform float uMotion;
uniform float uStarLightIntensity;

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
  // A few broad basins keep the beat body legible as terrain instead of
  // turning the surface into a repeated micro-speckle texture.
  vec2 grid = sphereUv * vec2(4.0, 2.5);
  vec2 cell = floor(grid);
  vec2 offset = vec2(
    hash13(vec3(cell, 1.7)),
    hash13(vec3(cell, 8.3))
  ) - 0.5;
  float radius = mix(0.2, 0.42, hash13(vec3(cell, 4.1)));
  float distanceToCenter = length(fract(grid) - 0.5 - offset * 0.42);
  float rim = 1.0 - smoothstep(0.035, 0.105, abs(distanceToCenter - radius));
  float basin = 1.0 - smoothstep(0.0, radius, distanceToCenter);
  return rim - basin * 0.62;
}

vec3 planetPattern(vec3 direction, vec3 viewDirection) {
  vec2 sphereUv = sphereCoordinates(direction);
  float time = uTick / 1920.0;
  float broadNoise = valueNoise(direction * 2.6 + uSeed * 13.0);
  // Detail controls restrained relief in the vertex normal, not a second
  // layer of static pixel-like color noise.
  float fineNoise = broadNoise;
  vec3 color = mix(uShadowColor, uBaseColor, 0.78 + broadNoise * 0.2);

  // Beat: crater basins and sharp fault lines communicate hard transients.
  if (uRole < 0.5) {
    float craters = craterField(sphereUv + vec2(uSeed, uSeed * 0.37));
    float faultDistance = abs(sin(
      sphereUv.x * 3.5 + sphereUv.y * 5.0 + uSeed * 4.0
    ));
    float faults = 1.0 - smoothstep(0.12, 0.32, faultDistance);
    color = mix(color, uShadowColor,
      smoothstep(-0.42, -0.04, -craters) * 0.54);
    color = mix(color, uAccentColor, max(craters, faults) * 0.62);
    color = mix(color, uSecondaryColor, broadNoise * 0.12);
    return color;
  }

  // Bass: broad tidal gas bands move slowly without obscuring the silhouette.
  if (uRole < 1.5) {
    float tide = direction.y * 5.4 + broadNoise * 1.4 + time * uMotion * 3.5;
    float bands = 0.5 + 0.5 * sin(tide);
    float brightEdge = pow(max(0.0, sin(tide)), 5.0);
    float storm = exp(-length(direction - vec3(0.28, 0.18, -0.18)) * 5.0);
    color = mix(uShadowColor, uSecondaryColor,
      0.28 + smoothstep(0.12, 0.88, bands) * 0.72);
    color = mix(color, uBaseColor, 0.5 + broadNoise * 0.22);
    color = mix(color, uAccentColor, brightEdge * 0.2 + storm * 0.42);
    return color;
  }

  // Chords: stepped mineral strata are crossed by connected luminous veins.
  if (uRole < 2.5) {
    float strataCoordinate = direction.y * 4.6 + broadNoise * 0.42;
    float strata = smoothstep(0.08, 0.92, fract(strataCoordinate));
    float veinDistance = abs(sin(
      direction.x * 4.8 - direction.z * 4.2 + uSeed * 7.0
    ));
    float veins = 1.0 - smoothstep(0.08, 0.28, veinDistance);
    color = mix(uShadowColor, uBaseColor, 0.22 + strata * 0.78);
    color = mix(color, uSecondaryColor, (1.0 - strata) * 0.25);
    color = mix(color, uAccentColor, veins * (0.46 + uPulse * 0.24));
    return color;
  }

  // Melody: pearlescent signal ribbons orbit the surface at musical speed.
  if (uRole < 3.5) {
    float planes = 0.5 + 0.5 * sin(
      direction.x * 3.4 + direction.z * 2.8 + broadNoise * 1.3
    );
    float facetBreak = 0.5 + 0.5 * sin(
      direction.y * 3.6 - direction.x * 2.2 + uSeed * 2.0
    );
    float crystal = smoothstep(0.66, 0.9, planes * 0.66 + facetBreak * 0.34);
    float pearl = pow(1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0), 2.0);
    color = mix(uSecondaryColor, uBaseColor, 0.2 + planes * 0.8);
    color = mix(color, uAccentColor, crystal * 0.62 + pearl * 0.14);
    return color;
  }

  // Texture: fine dusty crust sits over a slowly eroding cool cloud layer.
  float erosion = smoothstep(0.3, 0.72, broadNoise);
  float cut = 0.5 + 0.5 * sin(
    direction.x * 4.2 - direction.z * 3.6 + time * uMotion * 1.5
  );
  float dust = smoothstep(0.72, 0.9, cut);
  color = mix(uShadowColor, uSecondaryColor, 0.24 + erosion * 0.76);
  color = mix(color, uBaseColor, 0.52 + broadNoise * 0.22);
  return mix(color, uAccentColor, dust * 0.3);
}

float terrainHeight(vec3 direction) {
  vec2 sphereUv = sphereCoordinates(direction);
  float broad = valueNoise(direction * 2.8 + uSeed * 13.0);

  if (uRole < 0.5) {
    float craters = craterField(sphereUv + vec2(uSeed, uSeed * 0.37));
    float faults = 1.0 - smoothstep(
      0.1,
      0.3,
      abs(sin(sphereUv.x * 3.5 + sphereUv.y * 5.0 + uSeed * 4.0))
    );
    return broad * 0.18 + craters * 0.42 + faults * 0.22;
  }
  if (uRole < 1.5) {
    float bands = sin(direction.y * 5.4 + broad * 1.4);
    float storm = exp(-length(direction - vec3(0.28, 0.18, -0.18)) * 5.0);
    return bands * 0.26 + storm * 0.16;
  }
  if (uRole < 2.5) {
    float strata = fract(direction.y * 4.6 + broad * 0.42);
    float veins = 1.0 - smoothstep(
      0.08,
      0.28,
      abs(sin(direction.x * 4.8 - direction.z * 4.2 + uSeed * 7.0))
    );
    return strata * 0.24 + veins * 0.18;
  }
  if (uRole < 3.5) {
    float planes = sin(direction.x * 3.4 + direction.z * 2.8 + broad * 1.3);
    float facets = sin(direction.y * 3.6 - direction.x * 2.2 + uSeed * 2.0);
    return planes * 0.2 + facets * 0.14;
  }
  return broad * 0.24 + sin(direction.x * 4.2 - direction.z * 3.6) * 0.12;
}

vec3 proceduralSurfaceNormal(vec3 direction, vec3 geometricNormal) {
  float highDetail = smoothstep(0.72, 1.0, uDetail);
  if (highDetail <= 0.0) return geometricNormal;

  vec3 reference = abs(direction.y) < 0.92
    ? vec3(0.0, 1.0, 0.0)
    : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(reference, direction));
  vec3 bitangent = normalize(cross(direction, tangent));
  float epsilon = 0.012;
  float center = terrainHeight(direction);
  float alongTangent = terrainHeight(normalize(direction + tangent * epsilon));
  float alongBitangent = terrainHeight(normalize(direction + bitangent * epsilon));
  float normalStrength = mix(2.8, 5.6, 1.0 - uRoughness);
  vec3 objectNormal = normalize(
    direction
      - tangent * (alongTangent - center) * normalStrength
      - bitangent * (alongBitangent - center) * normalStrength
  );
  // Planet bodies only translate and uniformly scale in world space, so their
  // seeded object-space terrain normal is also the correct world direction.
  vec3 detailedWorldNormal = objectNormal;
  return normalize(mix(geometricNormal, detailedWorldNormal, highDetail * 0.82));
}

void main() {
  vec3 surfaceDirection = normalize(vObjectPosition);
  vec3 normal = proceduralSurfaceNormal(
    surfaceDirection,
    normalize(vWorldNormal)
  );
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 starDirection = normalize(-vWorldPosition);
  float starDistance = length(vWorldPosition);
  float attenuation = 1.0 / (1.0 + starDistance * starDistance * 0.018);
  float diffuse = max(dot(normal, starDirection), 0.0);
  float backScatter = max(dot(-normal, starDirection), 0.0);
  float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.35);

  // Icosahedron bodies are deliberately rendered non-indexed by the scene
  // controller. Quantizing the broad incident light keeps those face planes
  // readable at phone scale instead of dissolving into smooth plastic.
  float facetedDiffuse = floor(diffuse * 4.0) / 4.0;
  diffuse = mix(diffuse, facetedDiffuse, 0.72);
  float facetValue = smoothstep(0.08, 0.92, diffuse);

  vec3 halfDirection = normalize(starDirection + viewDirection);
  float specularPower = mix(86.0, 7.0, uRoughness);
  float specular = pow(max(dot(normal, halfDirection), 0.0), specularPower);
  specular *= mix(0.62, 0.07, uRoughness) * attenuation;

  vec3 albedo = planetPattern(surfaceDirection, viewDirection);
  // Keep the incident light chromatic. A full-white specular path made every
  // role collapse to pale outlines at the zoomed-out system fit, especially
  // when the active mood uses an icy highlight color. The neutral lift keeps
  // dark-side faces legible while the palette tint carries the surface hue.
  vec3 incidentColor = mix(vec3(0.78, 0.81, 0.86), uStarLightColor, 0.9);
  float directLight = diffuse * attenuation * 1.62 * uStarLightIntensity;
  // Keep the unlit hemisphere saturated and readable at zoomed-out camera
  // fits. The star still sculpts the lit side, but no role becomes an outline
  // floating in black when its face points away from the origin.
  vec3 outgoingLight = albedo * 0.4;
  outgoingLight += albedo * incidentColor * directLight;
  outgoingLight += albedo * incidentColor * backScatter * 0.09;
  outgoingLight += mix(uAccentColor, incidentColor, 0.38) * specular *
    uStarLightIntensity * 0.62;
  outgoingLight += uAccentColor * rim * (0.1 + uSelected * 0.44);
  outgoingLight += uAccentColor * uPulse * (0.2 + rim * 0.54 + uDetail * 0.42);
  outgoingLight *= 0.96 + facetValue * 0.18;

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
uniform float uVoidSurfaceScale;

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
  float facing = max(dot(normal, viewDirection), 0.0);
  float limb = pow(1.0 - facing, 1.4);
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
    // Void is a dark plasma shell, not a white light source. Keep its
    // low-frequency granulation in the indigo/lavender family and reserve a
    // very small hot tint for the compact core.
    float macro = 0.5 + 0.5 * sin(
      dot(direction, vec3(2.8, 3.1, 2.3)) + uSeed * 11.0
    );
    float granulation = smoothstep(0.26, 0.74, macro);
    float hotCore = pow(facing, 2.8);
    color = mix(uEdgeColor, uCoreColor, 0.48 + granulation * 0.28);
    color = mix(color, uHotColor, hotCore * 0.08 + granulation * 0.035);
    color += uCoreColor * hotCore * (0.08 + uDetail * 0.04);
    color = mix(color, uEdgeColor, pow(1.0 - facing, 1.55) * 0.34);
    color *= (0.72 + clamp(uIntensity, 0.0, 1.0) * 0.1) * uVoidSurfaceScale;
  }

  // Keep Void's selected and resting face dark enough to remain distinct
  // under the High compositor while preserving a colored internal core.
  if (uPreset < 3.5 || uPreset > 4.5) {
    float stellarCore = smoothstep(0.2, 0.94, facing);
    float coreLift = pow(facing, 3.4);
    vec3 hotCoreColor = mix(uCoreColor, uHotColor, stellarCore * 0.62);
    color = mix(color, hotCoreColor, 0.2 + stellarCore * 0.14);
    color += mix(uCoreColor, uHotColor, 0.72) * coreLift * 0.22;
    if (uPreset < 3.5) {
      // Ordinary stars keep a luminous limb rather than a dark, hard shell.
      // Black Hole's legacy edge treatment remains isolated in its branch.
      vec3 luminousLimbColor = mix(uCoreColor, uHotColor, 0.72);
      float luminousLimb = smoothstep(0.14, 0.96, limb);
      color = mix(color, luminousLimbColor, luminousLimb * 0.16);
    } else {
      color = mix(color, uEdgeColor, limb * 0.18);
    }
    color += mix(uCoreColor, uHotColor, 0.68)
      * (uPulse * 0.16 + uSelected * limb * 0.16);
    color *= mix(0.78, 1.16, clamp(uIntensity, 0.0, 1.5));
    color += mix(uCoreColor, uHotColor, 0.72)
      * uDetail * (0.024 + uPulse * 0.08);
  }
  if (uPreset > 3.5 && uPreset < 4.5) {
    vec3 voidVisibilityFloor = mix(uEdgeColor, uCoreColor, 0.58);
    voidVisibilityFloor *= (0.5 + clamp(uIntensity, 0.0, 1.0) * 0.12)
      * uVoidSurfaceScale;
    color = max(color, voidVisibilityFloor);
    float voidCore = pow(facing, 3.2);
    color += mix(uCoreColor, uHotColor, 0.18) * voidCore
      * (0.12 + uDetail * 0.05);
    color = mix(color, uEdgeColor, limb * 0.3);
    color += uCoreColor * (uPulse * 0.1 + uSelected * limb * 0.08);
    float voidPeak = max(max(color.r, color.g), color.b);
    color *= min(1.0, 0.76 / max(voidPeak, 0.001));
  }
  // Keep intensity changes and High bloom from clipping every channel into a
  // featureless white disc. Scaling preserves the authored hue and granules.
  float peak = max(max(color.r, color.g), color.b);
  color *= min(1.0, 1.22 / max(peak, 0.001));
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
uniform float uVoidCoronaScale;

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
  // The shell is a compact corona, not a second opaque star disc. A
  // front-side sphere only contributes around its limb; the surface material
  // owns the saturated, granular face underneath it.
  float facing = max(dot(normal, viewDirection), 0.0);
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

  float strength = uGlowStrength * mix(0.28, 0.72, clamp(uIntensity, 0.0, 1.0));
  strength *= uVoidCoronaScale;
  strength *= variation * (1.0 + uPulse * 0.42 + uSelected * 0.14);
  // The enlarged shell is a soft corona band, not a second star disc. It
  // fades in away from the exact silhouette, peaks between the silhouette
  // and body edge, then fades out before its front-facing center. This keeps
  // the body emissive while preventing a crisp outer circular shield.
  float outerFalloff = smoothstep(0.0, 0.24, facing);
  float innerFalloff = 1.0 - smoothstep(0.58, 0.86, facing);
  float coronaBand = outerFalloff * innerFalloff;
  float alpha = clamp(
    coronaBand * strength * (0.34 + uDetail * 0.08),
    0.0,
    1.0
  );
  vec3 emitted = uGlowColor * strength * (0.54 + coronaBand * 0.64);
  emitted += uGlowColor * coronaBand * strength * 0.14;
  gl_FragColor = vec4(emitted * 0.9, alpha);

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

function planetRoleFromMaterial(material: THREE.ShaderMaterial): PlanetRole {
  const value: unknown = material.uniforms.uRole?.value;
  const numericValue = typeof value === "number" ? value : 0;
  const index = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
  return PLANET_ROLES[Math.min(PLANET_ROLES.length - 1, Math.max(0, index))];
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

function setColorUniform(
  material: THREE.ShaderMaterial,
  name: string,
  value: THREE.ColorRepresentation,
): void {
  const uniform = material.uniforms[name];
  if (!(uniform?.value instanceof THREE.Color)) {
    throw new Error(`Missing procedural material color uniform ${name}.`);
  }
  uniform.value.set(value);
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
  if (update.color !== undefined) {
    setColorUniform(material, "uColor", update.color);
  }
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
  const palette = descriptor.palette;
  const paletteColors = palette
    ? planetMaterialColorsForPalette(descriptor.role, palette)
    : profile;
  const material = createProceduralMaterial(
    "planet-surface",
    {
      uBaseColor: { value: new THREE.Color(paletteColors.baseColor) },
      uShadowColor: { value: new THREE.Color(paletteColors.shadowColor) },
      uAccentColor: { value: new THREE.Color(paletteColors.accentColor) },
      uSecondaryColor: {
        value: new THREE.Color(paletteColors.secondaryColor),
      },
      uStarLightColor: {
        value: new THREE.Color(palette?.starLightColor ?? 0xffffff),
      },
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
      uStarLightIntensity: { value: 1 },
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
  if (update.starLightColor !== undefined) {
    setColorUniform(material, "uStarLightColor", update.starLightColor);
  }
  if (update.starLightIntensity !== undefined) {
    setNumberUniform(
      material,
      "uStarLightIntensity",
      clampFinite(update.starLightIntensity, 0, 2.5),
    );
  }
  const palette = update.palette;
  if (palette) {
    const colors = planetMaterialColorsForPalette(
      planetRoleFromMaterial(material),
      palette,
    );
    setColorUniform(material, "uBaseColor", colors.baseColor);
    setColorUniform(material, "uShadowColor", colors.shadowColor);
    setColorUniform(material, "uAccentColor", colors.accentColor);
    setColorUniform(material, "uSecondaryColor", colors.secondaryColor);
    setColorUniform(material, "uStarLightColor", palette.starLightColor);
  }
}

/** Creates a preset-specific, procedural stellar surface. */
export function createStarSurfaceMaterial(
  descriptor: StarSurfaceDescriptor,
  detail: number,
): THREE.ShaderMaterial {
  const profile = starMaterialProfile(descriptor.presetId);
  const palette = descriptor.palette;
  const paletteColors = palette
    ? starMaterialColorsForPalette(palette, descriptor.companion)
    : {
        coreColor: profile.coreColor,
        hotColor: profile.hotColor,
        edgeColor: profile.edgeColor,
        glowColor: profile.glowColor,
      };
  const material = createProceduralMaterial(
    "star-surface",
    {
      uCoreColor: {
        value: new THREE.Color(paletteColors.coreColor),
      },
      uHotColor: {
        value: new THREE.Color(paletteColors.hotColor),
      },
      uEdgeColor: {
        value: new THREE.Color(paletteColors.edgeColor),
      },
      uPreset: { value: indexOfStarPreset(descriptor.presetId) },
      uSeed: { value: normalizeVisualSeed(descriptor.visualSeed) },
      uTick: { value: 0 },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uDetail: { value: normalizedDetail(detail) },
      uIntensity: { value: clampFinite(descriptor.intensity, 0, 1.5) },
      uTurbulence: { value: profile.turbulence },
      uVoidSurfaceScale: {
        value: descriptor.presetId === "void" ? 0.64 : 1,
      },
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
  const palette = descriptor.palette;
  const paletteColors = palette
    ? starMaterialColorsForPalette(palette, descriptor.companion)
    : {
        coreColor: profile.coreColor,
        hotColor: profile.hotColor,
        edgeColor: profile.edgeColor,
        glowColor: profile.glowColor,
      };
  const material = createProceduralMaterial(
    "star-glow",
    {
      uGlowColor: {
        value: new THREE.Color(paletteColors.glowColor),
      },
      uPreset: { value: indexOfStarPreset(descriptor.presetId) },
      uSeed: { value: normalizeVisualSeed(descriptor.visualSeed) },
      uTick: { value: 0 },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uDetail: { value: normalizedDetail(detail) },
      uIntensity: { value: clampFinite(descriptor.intensity, 0, 1.5) },
      uGlowStrength: { value: profile.glowStrength },
      // Void's dark surface needs a smaller, colored corona so selection and
      // High bloom cannot turn its silhouette into a pale halo.
      uVoidCoronaScale: { value: descriptor.presetId === "void" ? 0.42 : 1 },
    },
    GLOW_VERTEX_SHADER,
    GLOW_FRAGMENT_SHADER,
    {
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      // The glow shell is an outer corona. Front-side fragments keep the
      // saturated halo visible around the smaller surface body; BackSide
      // culling would leave only an occluded dark rim at system zoom.
      side: THREE.FrontSide,
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
  const palette = update.palette;
  if (palette) {
    const colors = starMaterialColorsForPalette(palette, update.companion);
    if (material.uniforms.uCoreColor) {
      setColorUniform(material, "uCoreColor", colors.coreColor);
      setColorUniform(material, "uHotColor", colors.hotColor);
      setColorUniform(material, "uEdgeColor", colors.edgeColor);
    }
    if (material.uniforms.uGlowColor) {
      setColorUniform(material, "uGlowColor", colors.glowColor);
    }
  }
}
