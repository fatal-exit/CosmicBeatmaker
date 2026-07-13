import * as THREE from "three";

import type { QualityProfile, VisualPreferences } from "../contracts";

const STANDARD_DESTRUCTION_DURATION_MS = 480;
const REDUCED_DESTRUCTION_DURATION_MS = 180;

interface FragmentState {
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  scale: number;
}

export interface PlanetDestructionEffectProfile {
  durationMs: number;
  fragmentCount: number;
  flashOpacity: number;
  shockwaveOpacity: number;
  shockwaveExpansion: number;
  travelScale: number;
}

export interface PlanetDestructionSource {
  position: THREE.Vector3;
  hue: number;
  size: number;
  visualSeed: number;
}

export interface RuntimePlanetDestructionEffect {
  group: THREE.Group;
  shockwave: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  fragments: THREE.InstancedMesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  > | null;
  fragmentStates: readonly FragmentState[];
  fragmentTransform: THREE.Object3D;
  profile: PlanetDestructionEffectProfile;
  size: number;
  startedAt: number;
}

export function deletedPlanetId(
  previousIds: ReadonlySet<string>,
  nextIds: ReadonlySet<string>,
  isInitialReconcile: boolean,
): string | null {
  if (
    isInitialReconcile ||
    previousIds.size !== nextIds.size + 1 ||
    [...nextIds].some((id) => !previousIds.has(id))
  ) {
    return null;
  }
  return [...previousIds].find((id) => !nextIds.has(id)) ?? null;
}

export function planetDestructionEffectProfile(
  quality: QualityProfile,
  preferences: Pick<
    VisualPreferences,
    "reducedMotion" | "reducedParticles" | "reducedFlash"
  >,
): PlanetDestructionEffectProfile {
  const baseFragmentCount =
    quality === "high" ? 18 : quality === "balanced" ? 12 : 6;
  const reducedMotion = preferences.reducedMotion;
  return {
    durationMs: reducedMotion
      ? REDUCED_DESTRUCTION_DURATION_MS
      : STANDARD_DESTRUCTION_DURATION_MS,
    fragmentCount: preferences.reducedParticles ? 0 : baseFragmentCount,
    flashOpacity: preferences.reducedFlash ? 0.14 : 0.9,
    shockwaveOpacity: preferences.reducedFlash ? 0.42 : 0.76,
    shockwaveExpansion: reducedMotion ? 1.05 : 3.4,
    travelScale: reducedMotion ? 0.2 : 1,
  };
}

function colorFromHue(hue: number, lightness: number): THREE.Color {
  const color = new THREE.Color();
  color.setHSL((((hue % 360) + 360) % 360) / 360, 0.82, lightness);
  return color;
}

function seededRandom(seed: number): () => number {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function createPlanetDestructionEffect(
  source: PlanetDestructionSource,
  profile: PlanetDestructionEffectProfile,
  startedAt = performance.now(),
): RuntimePlanetDestructionEffect {
  const size = Math.max(0.16, source.size);
  const group = new THREE.Group();
  group.position.copy(source.position);
  group.renderOrder = 5;

  const shockwave = new THREE.Mesh(
    new THREE.TorusGeometry(
      Math.max(0.28, size * 1.08),
      Math.max(0.016, size * 0.07),
      6,
      28,
    ),
    new THREE.MeshBasicMaterial({
      color: colorFromHue(source.hue + 22, 0.67),
      transparent: true,
      opacity: profile.shockwaveOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  shockwave.rotation.x = Math.PI / 2;
  shockwave.renderOrder = 5;
  group.add(shockwave);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(size * 0.82, 1),
    new THREE.MeshBasicMaterial({
      color: colorFromHue(source.hue + 42, 0.82),
      transparent: true,
      opacity: profile.flashOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  core.renderOrder = 6;
  group.add(core);

  const random = seededRandom(source.visualSeed);
  const fragmentStates: FragmentState[] = [];
  let fragments: RuntimePlanetDestructionEffect["fragments"] = null;
  if (profile.fragmentCount > 0) {
    fragments = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(Math.max(0.035, size * 0.18), 0),
      new THREE.MeshBasicMaterial({
        color: colorFromHue(source.hue + 8, 0.62),
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      profile.fragmentCount,
    );
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fragments.renderOrder = 5;
    group.add(fragments);

    for (let index = 0; index < profile.fragmentCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const direction = new THREE.Vector3(
        Math.cos(angle),
        (random() - 0.5) * 0.86,
        Math.sin(angle),
      ).normalize();
      fragmentStates.push({
        velocity: direction.multiplyScalar(
          size * (2.7 + random() * 3.3) * profile.travelScale,
        ),
        spin: new THREE.Vector3(
          (random() - 0.5) * Math.PI * 5,
          (random() - 0.5) * Math.PI * 5,
          (random() - 0.5) * Math.PI * 5,
        ),
        scale: 0.58 + random() * 0.72,
      });
    }
  }

  const effect: RuntimePlanetDestructionEffect = {
    group,
    shockwave,
    core,
    fragments,
    fragmentStates,
    fragmentTransform: new THREE.Object3D(),
    profile,
    size,
    startedAt,
  };
  updatePlanetDestructionEffect(effect, startedAt);
  return effect;
}

export function updatePlanetDestructionEffect(
  effect: RuntimePlanetDestructionEffect,
  now: number,
): boolean {
  const progress = Math.min(
    1,
    Math.max(0, (now - effect.startedAt) / effect.profile.durationMs),
  );
  const burst = 1 - Math.pow(1 - progress, 3);
  const decay = 1 - progress;

  effect.shockwave.scale.setScalar(
    0.7 + burst * effect.profile.shockwaveExpansion,
  );
  effect.shockwave.material.opacity =
    effect.profile.shockwaveOpacity * Math.pow(decay, 1.7);

  effect.core.scale.setScalar(0.72 + burst * 2.15);
  effect.core.material.opacity =
    effect.profile.flashOpacity * Math.max(0, 1 - progress * 3.2);

  if (effect.fragments) {
    const transform = effect.fragmentTransform;
    for (const [index, fragment] of effect.fragmentStates.entries()) {
      transform.position.copy(fragment.velocity).multiplyScalar(burst);
      transform.position.y -= effect.size * 0.82 * progress * progress;
      transform.rotation.set(
        fragment.spin.x * burst,
        fragment.spin.y * burst,
        fragment.spin.z * burst,
      );
      transform.scale.setScalar(
        fragment.scale * Math.max(0.001, Math.pow(decay, 0.62)),
      );
      transform.updateMatrix();
      effect.fragments.setMatrixAt(index, transform.matrix);
    }
    effect.fragments.instanceMatrix.needsUpdate = true;
    effect.fragments.material.opacity = 0.86 * Math.pow(decay, 0.72);
  }

  return progress < 1;
}
