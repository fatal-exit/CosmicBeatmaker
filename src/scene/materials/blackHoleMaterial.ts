import * as THREE from "three";

import type { SceneDescriptor } from "../contracts";
import { normalizeVisualSeed, scenePaletteForStar } from "./profiles";

const MATERIAL_KIND = "cosmicBeatmakerBlackHoleMaterial";

export interface BlackHoleMaterialUpdate {
  /** Authoritative transport position in ticks. */
  time?: number;
  pulse?: number;
  selected?: boolean;
  intensity?: number;
  detail?: number;
  reducedFlash?: boolean;
}

export interface BlackHoleModel {
  group: THREE.Group;
  eventHorizon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  photonRing: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  accretionDisk: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  lensingArc: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  update: (update: BlackHoleMaterialUpdate) => void;
  dispose: () => void;
}

interface BlackHoleDescriptor {
  id?: string;
  presetId: "black-hole";
  visualSeed: number;
  intensity: number;
}

const HORIZON_VERTEX_SHADER = /* glsl */ `
uniform float uPulse;
uniform float uSelected;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 transformed = position + normal * (uPulse * 0.008 + uSelected * 0.002);
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const HORIZON_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uPulse;
uniform float uSelected;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDirection), 0.0), 2.3);
  // Keep the silhouette just above zero so the horizon remains readable even
  // when bloom and optional effects are disabled.
  float silhouette = 0.018 + fresnel * (0.14 + uSelected * 0.12);
  vec3 color = uColor * (0.62 + uIntensity * 0.2);
  color += uRimColor * fresnel * (0.42 + uPulse * 0.24);
  gl_FragColor = vec4(color * silhouette, 1.0);
}
`;

const PHOTON_VERTEX_SHADER = /* glsl */ `
uniform float uPulse;
uniform float uTick;
uniform float uReducedFlash;
varying float vAngle;

void main() {
  vAngle = atan(position.z, position.x);
  vec3 transformed = position + normal * (uPulse * 0.018 * (1.0 - uReducedFlash));
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const PHOTON_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uHotColor;
uniform vec3 uCoolColor;
uniform float uTick;
uniform float uPulse;
uniform float uSelected;
uniform float uIntensity;
uniform float uReducedFlash;
varying float vAngle;

void main() {
  float shimmer = 0.5 + 0.5 * sin(vAngle * 7.0 + uTick * 0.004);
  float energy = 0.76 + shimmer * 0.24 + uPulse * (0.34 - uReducedFlash * 0.2);
  vec3 color = mix(uCoolColor, uHotColor, 0.58 + shimmer * 0.32);
  float alpha = (0.64 + uSelected * 0.18) * energy * (0.72 + uIntensity * 0.2);
  gl_FragColor = vec4(color * energy, alpha);
}
`;

const DISK_VERTEX_SHADER = /* glsl */ `
uniform float uTick;
uniform float uReducedFlash;
varying float vRadius;
varying float vAngle;

void main() {
  vRadius = length(position.xy);
  vAngle = atan(position.y, position.x);
  float flow = (1.0 - uReducedFlash) * uTick * 0.0007;
  vec3 transformed = position;
  float swirl = sin(vAngle * 5.0 + flow) * 0.006;
  transformed.z += swirl * smoothstep(0.88, 1.7, vRadius);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const DISK_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uHotColor;
uniform vec3 uWarmColor;
uniform vec3 uCoolColor;
uniform float uSeed;
uniform float uTick;
uniform float uPulse;
uniform float uIntensity;
uniform float uDetail;
uniform float uReducedFlash;
varying float vRadius;
varying float vAngle;

float hash(float value) {
  return fract(sin(value * 91.173 + uSeed * 17.19) * 43758.5453);
}

void main() {
  float radial = clamp((vRadius - 0.84) / 0.92, 0.0, 1.0);
  float innerHeat = 1.0 - smoothstep(0.0, 0.72, radial);
  float edgeFade = 1.0 - smoothstep(0.74, 1.0, radial);
  float streakCoordinate = vAngle * (10.0 + uDetail * 14.0) + radial * 21.0;
  float streaks = smoothstep(0.38, 0.92, 0.5 + 0.5 * sin(streakCoordinate + hash(floor(radial * 9.0)) * 4.0));
  float turbulence = mix(0.72, 1.14, streaks) * mix(0.82, 1.0, uDetail);
  // A view-independent Doppler analogue keeps the flow asymmetrical without
  // requiring a full-screen lensing or ray-tracing pass.
  float doppler = 0.72 + 0.28 * (0.5 + 0.5 * sin(vAngle + 0.45));
  vec3 temperature = mix(uCoolColor, uWarmColor, innerHeat);
  temperature = mix(temperature, uHotColor, innerHeat * innerHeat * 0.82);
  temperature *= turbulence * doppler;
  float alpha = edgeFade * (0.28 + innerHeat * 0.54 + streaks * 0.16);
  alpha *= 0.76 + uIntensity * 0.2 + uPulse * (0.2 - uReducedFlash * 0.12);
  gl_FragColor = vec4(temperature, alpha);
}
`;

const ARC_VERTEX_SHADER = /* glsl */ `
uniform float uPulse;
varying vec3 vNormal;
void main() {
  vNormal = normal;
  vec3 transformed = position + normal * uPulse * 0.008;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const ARC_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uPulse;
uniform float uSelected;
uniform float uIntensity;
varying vec3 vNormal;
void main() {
  float edge = 0.48 + abs(vNormal.y) * 0.42;
  float alpha = edge * (0.18 + uIntensity * 0.12 + uPulse * 0.18 + uSelected * 0.08);
  gl_FragColor = vec4(uColor * (0.52 + uPulse * 0.18), alpha);
}
`;

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function clampDetail(detail: number): number {
  return clamp01(detail);
}

function material(
  name: string,
  uniforms: Record<string, THREE.IUniform>,
  vertexShader: string,
  fragmentShader: string,
  parameters: Pick<
    THREE.ShaderMaterialParameters,
    "blending" | "depthTest" | "depthWrite" | "side" | "transparent"
  >,
): THREE.ShaderMaterial {
  const result = new THREE.ShaderMaterial({
    name,
    uniforms,
    vertexShader,
    fragmentShader,
    toneMapped: true,
    ...parameters,
  });
  result.userData[MATERIAL_KIND] = name;
  return result;
}

function updateUniform(
  materialToUpdate: THREE.ShaderMaterial,
  update: BlackHoleMaterialUpdate,
): void {
  const uniforms = materialToUpdate.uniforms;
  if (update.time !== undefined && Number.isFinite(update.time)) {
    if (uniforms.uTick) uniforms.uTick.value = update.time;
  }
  if (update.pulse !== undefined) {
    if (uniforms.uPulse) uniforms.uPulse.value = clamp01(update.pulse);
  }
  if (update.selected !== undefined) {
    if (uniforms.uSelected) uniforms.uSelected.value = update.selected ? 1 : 0;
  }
  if (update.intensity !== undefined) {
    if (uniforms.uIntensity)
      uniforms.uIntensity.value = clamp01(update.intensity, 0.8);
  }
  if (update.detail !== undefined && uniforms.uDetail) {
    uniforms.uDetail.value = clampDetail(update.detail);
  }
  if (update.reducedFlash !== undefined && uniforms.uReducedFlash) {
    uniforms.uReducedFlash.value = update.reducedFlash ? 1 : 0;
  }
}

function disposeModel(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((child) => {
    const renderable = child as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;
    if (!(renderable instanceof THREE.Mesh)) return;
    geometries.add(renderable.geometry);
    const list = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    list.forEach((entry) => materials.add(entry));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((entry) => entry.dispose());
}

/**
 * Creates the bounded Black Hole visual assembly. Geometry is shared only
 * inside this model and every optional detail has a fixed quality-dependent
 * upper bound; no texture or renderer-wide lensing pass is needed.
 */
export function createBlackHoleModel(
  descriptor: BlackHoleDescriptor | SceneDescriptor["star"],
  detail: number,
): BlackHoleModel {
  const normalizedDetail = clampDetail(detail);
  const palette = scenePaletteForStar(descriptor);
  const seed = normalizeVisualSeed(descriptor.visualSeed);
  const intensity = clamp01(descriptor.intensity, 0.8);
  const entityId = descriptor.id ?? "black-hole";
  const radialSegments = Math.round(12 + normalizedDetail * 18);
  const tubularSegments = Math.round(32 + normalizedDetail * 32);
  const diskSegments = Math.round(32 + normalizedDetail * 48);
  const group = new THREE.Group();
  group.name = "black-hole-assembly";

  const horizonMaterial = material(
    "black-hole-event-horizon",
    {
      uColor: { value: new THREE.Color(palette.shadowColor) },
      uRimColor: { value: new THREE.Color(palette.secondaryColor) },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uIntensity: { value: intensity },
    },
    HORIZON_VERTEX_SHADER,
    HORIZON_FRAGMENT_SHADER,
    {
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: true,
      side: THREE.FrontSide,
      transparent: false,
    },
  );
  const eventHorizon = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.72,
      radialSegments,
      Math.max(8, radialSegments / 2),
    ),
    horizonMaterial,
  );
  eventHorizon.name = "event-horizon";
  eventHorizon.userData.entityId = entityId;

  const photonMaterial = material(
    "black-hole-photon-ring",
    {
      uHotColor: { value: new THREE.Color(palette.highlightColor) },
      uCoolColor: { value: new THREE.Color(palette.secondaryColor) },
      uTick: { value: 0 },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uIntensity: { value: intensity },
      uReducedFlash: { value: 0 },
    },
    PHOTON_VERTEX_SHADER,
    PHOTON_FRAGMENT_SHADER,
    {
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
    },
  );
  const photonRing = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.9,
      0.034,
      Math.max(5, Math.round(5 + normalizedDetail * 3)),
      tubularSegments,
    ),
    photonMaterial,
  );
  photonRing.name = "photon-ring";
  photonRing.rotation.x = Math.PI / 2;
  photonRing.userData.entityId = entityId;

  const diskMaterial = material(
    "black-hole-accretion-disk",
    {
      uHotColor: { value: new THREE.Color(palette.highlightColor) },
      uWarmColor: {
        value: new THREE.Color(palette.primaryColor).lerp(
          new THREE.Color(palette.highlightColor),
          0.62,
        ),
      },
      uCoolColor: { value: new THREE.Color(palette.secondaryColor) },
      uSeed: { value: seed },
      uTick: { value: 0 },
      uPulse: { value: 0 },
      uIntensity: { value: intensity },
      uDetail: { value: normalizedDetail },
      uReducedFlash: { value: 0 },
    },
    DISK_VERTEX_SHADER,
    DISK_FRAGMENT_SHADER,
    {
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
    },
  );
  const accretionDisk = new THREE.Mesh(
    new THREE.RingGeometry(0.84, 1.76, diskSegments, 2),
    diskMaterial,
  );
  accretionDisk.name = "accretion-disk";
  accretionDisk.rotation.x = Math.PI / 2 + 0.22;
  accretionDisk.rotation.z = -0.14;
  accretionDisk.userData.entityId = entityId;

  const arcPointCount = Math.max(12, Math.round(16 + normalizedDetail * 16));
  const arcPoints = Array.from({ length: arcPointCount }, (_, index) => {
    const angle =
      -0.22 + (index / Math.max(1, arcPointCount - 1)) * Math.PI * 1.38;
    return new THREE.Vector3(
      Math.cos(angle) * 1.34,
      0.14 + Math.sin(angle * 1.4 + seed * 7.0) * 0.16,
      Math.sin(angle) * 1.34,
    );
  });
  const arcMaterial = material(
    "black-hole-lensing-arc",
    {
      uColor: { value: new THREE.Color(palette.secondaryColor) },
      uPulse: { value: 0 },
      uSelected: { value: 0 },
      uIntensity: { value: intensity },
    },
    ARC_VERTEX_SHADER,
    ARC_FRAGMENT_SHADER,
    {
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
    },
  );
  const arcCurve = new THREE.CatmullRomCurve3(arcPoints);
  const lensingArc = new THREE.Mesh(
    new THREE.TubeGeometry(
      arcCurve,
      Math.max(12, Math.round(18 + normalizedDetail * 18)),
      0.022,
      5,
      false,
    ),
    arcMaterial,
  );
  lensingArc.name = "lensing-arc";
  lensingArc.userData.entityId = entityId;

  group.add(accretionDisk, lensingArc, photonRing, eventHorizon);
  group.userData.entityId = entityId;
  group.userData.blackHole = true;

  const update = (next: BlackHoleMaterialUpdate): void => {
    [horizonMaterial, photonMaterial, diskMaterial, arcMaterial].forEach(
      (entry) => updateUniform(entry, next),
    );
  };
  update({ intensity });

  return {
    group,
    eventHorizon,
    photonRing,
    accretionDisk,
    lensingArc,
    update,
    dispose: () => disposeModel(group),
  };
}

export const createBlackHoleAssembly = createBlackHoleModel;
