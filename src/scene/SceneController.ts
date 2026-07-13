import * as THREE from "three";

import { LOOP_BAR_RATES, type LoopBars } from "../domain/composition";
import type {
  MoonSceneDescriptor,
  PlanetSceneDescriptor,
  QualityProfile,
  SceneDescriptor,
  SceneInteractionIntent,
  VisualPreferences,
  VisualPulse,
} from "./contracts";
import { SCENE_TICKS_PER_BEAT, spawnPhaseAtTick } from "./gates";
import {
  createCelestialOutlineMaterial,
  createPlanetSurfaceMaterial,
  createStarGlowMaterial,
  createStarSurfaceMaterial,
  updateCelestialOutlineMaterial,
  updatePlanetSurfaceMaterial,
  updateStarGlowMaterial,
  updateStarSurfaceMaterial,
} from "./materials/proceduralMaterials";
import { orbitPhaseAtTick } from "./phase";
import {
  QUALITY_DPR_CAP,
  QUALITY_GLOW_STRENGTH,
  QUALITY_SHADER_DETAIL,
  resolveQualityProfile,
} from "./quality";

interface RuntimeMoon {
  body: THREE.Mesh;
  descriptor: MoonSceneDescriptor;
  orbitRadius: number;
}

interface RuntimePlanet {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  outline: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  eventNodes: Map<string, THREE.Mesh>;
  moons: RuntimeMoon[];
  spawnMarker: THREE.Mesh | null;
  spawnMarkerStartedAt: number;
  spawnMarkerExpiresAt: number;
  descriptor: PlanetSceneDescriptor;
  dispose: () => void;
}

interface RuntimeStar {
  group: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  outline: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  glow: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  descriptor: SceneDescriptor["star"];
  dispose: () => void;
}

export type PlanetDragMode = "radial" | "tangential";

type PointerGestureMode = PlanetDragMode | "camera-rotate";

interface PointerGesture {
  pointerId: number;
  entityId: string | null;
  planet?: RuntimePlanet;
  startX: number;
  startY: number;
  radialX: number;
  radialY: number;
  startAngle: number;
  mode: PointerGestureMode | null;
  startCameraRotation: number;
  previewLoopBars?: LoopBars;
  previewPhase?: number;
}

interface ActivePointer {
  x: number;
  y: number;
}

interface PinchGesture {
  pointerIds: readonly [number, number];
  startDistance: number;
  startZoom: number;
}

interface PulseWindow {
  startsAt: number;
  expiresAt: number;
  scheduledPhase?: number;
}

export interface SceneCameraView {
  zoomPercent: number;
  rotationDegrees: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canReset: boolean;
}

export interface SceneControllerOptions {
  readTransportTicks: () => number;
  onInteraction?: (intent: SceneInteractionIntent) => void;
  onCameraViewChange?: (view: SceneCameraView) => void;
}

const defaultPreferences: VisualPreferences = {
  quality: "auto",
  reducedMotion: false,
  reducedParticles: false,
  reducedFlash: false,
};

const DRAG_THRESHOLD_PX = 7;
const PIXELS_PER_ORBIT_SHELL = 44;
const SPAWN_MARKER_DURATION_MS = 3_200;
const CAMERA_DEFAULT_POSITION = { y: 8.8, z: 10.5 } as const;
const CAMERA_BASE_DISTANCE = 16;
const CAMERA_REFERENCE_ASPECT = 1.3;
const CAMERA_MAX_FIT_SCALE = 2.7;
const CAMERA_ROTATION_STEP = Math.PI / 12;
const CAMERA_DRAG_PIXELS_PER_TURN = 960;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

export const SCENE_CAMERA_ZOOM_MIN = 0.6;
export const SCENE_CAMERA_ZOOM_MAX = 1.8;
export const SCENE_CAMERA_ZOOM_STEP = 0.1;
export const SCENE_CAMERA_ZOOM_DEFAULT = 1;

export function pulseDelayMsFromTicks(
  scheduledTick: number,
  currentTick: number,
  bpm: number,
): number {
  if (
    !Number.isFinite(scheduledTick) ||
    !Number.isFinite(currentTick) ||
    !Number.isFinite(bpm) ||
    bpm <= 0
  ) {
    return 0;
  }
  const ticksUntilSound = Math.max(0, scheduledTick - currentTick);
  return (ticksUntilSound / SCENE_TICKS_PER_BEAT) * (60_000 / bpm);
}

/**
 * Moons use the compiler's parent-loop / orbit-ratio period. Keeping this
 * calculation in integer ticks makes the visible moon meet its corrected gate
 * at the same authoritative tick that admitted the audio occurrence.
 */
export function moonOrbitPhaseAtTick(
  phase: number,
  transportTicks: number,
  parentLoopBars: LoopBars,
  orbitRatio: number,
): number {
  const safeRatio =
    Number.isFinite(orbitRatio) && orbitRatio > 0 ? orbitRatio : 1;
  const parentLoopTicks = Math.round(parentLoopBars * 4 * SCENE_TICKS_PER_BEAT);
  const moonLoopTicks = Math.max(1, Math.round(parentLoopTicks / safeRatio));
  const normalizedPhase = phase + transportTicks / moonLoopTicks;
  return ((normalizedPhase % 1) + 1) % 1;
}

export function highlightedSpawnId(
  previousIds: ReadonlySet<string>,
  nextIds: ReadonlySet<string>,
  isInitialReconcile: boolean,
): string | null {
  if (isInitialReconcile || nextIds.size !== previousIds.size + 1) return null;
  if ([...previousIds].some((id) => !nextIds.has(id))) return null;
  return [...nextIds].find((id) => !previousIds.has(id)) ?? null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampSceneZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return SCENE_CAMERA_ZOOM_DEFAULT;
  return clamp(zoom, SCENE_CAMERA_ZOOM_MIN, SCENE_CAMERA_ZOOM_MAX);
}

export function sceneZoomFromWheel(zoom: number, deltaY: number): number {
  if (!Number.isFinite(deltaY)) return clampSceneZoom(zoom);
  return clampSceneZoom(zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY));
}

export function sceneZoomFromPinch(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (
    !Number.isFinite(startDistance) ||
    !Number.isFinite(currentDistance) ||
    startDistance <= 0 ||
    currentDistance <= 0
  ) {
    return clampSceneZoom(startZoom);
  }
  return clampSceneZoom(startZoom * (currentDistance / startDistance));
}

export function normalizeSceneRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0;
  const turn = Math.PI * 2;
  return ((((rotation + Math.PI) % turn) + turn) % turn) - Math.PI;
}

export function sceneRotationFromDrag(
  startRotation: number,
  deltaX: number,
  pixelsPerTurn = CAMERA_DRAG_PIXELS_PER_TURN,
): number {
  if (!Number.isFinite(deltaX) || pixelsPerTurn <= 0) {
    return normalizeSceneRotation(startRotation);
  }
  return normalizeSceneRotation(
    startRotation + (deltaX / pixelsPerTurn) * Math.PI * 2,
  );
}

export function cameraDistanceForView(aspect: number, zoom = 1): number {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const fitScale = clamp(
    CAMERA_REFERENCE_ASPECT / safeAspect,
    1,
    CAMERA_MAX_FIT_SCALE,
  );
  return (CAMERA_BASE_DISTANCE * fitScale) / clampSceneZoom(zoom);
}

function setOrbitPosition(
  object: THREE.Object3D,
  phase: number,
  orbitRadius: number,
  inclination: number,
): void {
  const angle = phase * Math.PI * 2;
  object.position.set(
    Math.cos(angle) * orbitRadius,
    Math.sin(angle * 2) * inclination,
    Math.sin(angle) * orbitRadius,
  );
}

function orientAcrossOrbit(object: THREE.Object3D, phase: number): void {
  const angle = phase * Math.PI * 2;
  const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
  object.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    tangent.normalize(),
  );
}

function setMoonOrbitPosition(
  object: THREE.Object3D,
  phase: number,
  orbitRadius: number,
): void {
  const angle = phase * Math.PI * 2;
  object.position.set(
    Math.cos(angle) * orbitRadius,
    0.06,
    Math.sin(angle) * orbitRadius,
  );
}

export function classifyPlanetDrag(
  deltaX: number,
  deltaY: number,
  radialX: number,
  radialY: number,
  threshold = DRAG_THRESHOLD_PX,
): PlanetDragMode | null {
  if (Math.hypot(deltaX, deltaY) < threshold) return null;
  const radialDistance = deltaX * radialX + deltaY * radialY;
  const tangentialDistance = deltaX * -radialY + deltaY * radialX;
  return Math.abs(radialDistance) >= Math.abs(tangentialDistance)
    ? "radial"
    : "tangential";
}

export function quantizeLoopBarsFromRadialDrag(
  startLoopBars: LoopBars,
  radialDistance: number,
  pixelsPerShell = PIXELS_PER_ORBIT_SHELL,
): LoopBars {
  const startIndex = Math.max(0, LOOP_BAR_RATES.indexOf(startLoopBars));
  const shellDelta = Math.round(radialDistance / pixelsPerShell);
  const index = Math.max(
    0,
    Math.min(LOOP_BAR_RATES.length - 1, startIndex + shellDelta),
  );
  return LOOP_BAR_RATES[index];
}

export function phaseFromTangentialDrag(
  startPhase: number,
  startAngle: number,
  currentAngle: number,
): number {
  const angleDelta = Math.atan2(
    Math.sin(currentAngle - startAngle),
    Math.cos(currentAngle - startAngle),
  );
  return (((startPhase + angleDelta / (Math.PI * 2)) % 1) + 1) % 1;
}

function colorFromHue(hue: number, lightness = 0.62): THREE.Color {
  const color = new THREE.Color();
  color.setHSL((((hue % 360) + 360) % 360) / 360, 0.62, lightness);
  return color;
}

export function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    if (!(
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.Points
    ))
      return;
    const renderable = child as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;
    geometries.add(renderable.geometry);
    const materialList = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of materialList) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export class SceneController {
  private readonly options: SceneControllerOptions;
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private descriptor: SceneDescriptor | null = null;
  private star: RuntimeStar | null = null;
  private planets = new Map<string, RuntimePlanet>();
  private asteroidBelt: THREE.Points | null = null;
  private frame = 0;
  private selectedId: string | null = null;
  private preferences = defaultPreferences;
  private qualityProfile: QualityProfile = "balanced";
  private tempoBpm = 120;
  private pulseWindows = new Map<string, PulseWindow[]>();
  private eventPulseWindows = new Map<string, PulseWindow[]>();
  private gesture: PointerGesture | null = null;
  private pinchGesture: PinchGesture | null = null;
  private readonly activePointers = new Map<number, ActivePointer>();
  private cameraZoom = SCENE_CAMERA_ZOOM_DEFAULT;
  private cameraRotation = 0;
  private cameraAspect = 1;
  private cameraSystemFitScale = 1;
  private lastCameraViewSignature = "";
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  constructor(options: SceneControllerOptions) {
    this.options = options;
  }

  mount(canvas: HTMLCanvasElement): void {
    if (this.renderer) return;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x080808, 0.025);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.updateCameraTransform();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const light = new THREE.PointLight(0xff9b58, 32, 22);
    light.position.set(0, 1.2, 0);
    this.scene.add(light);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("webglcontextlost", this.handleContextLoss);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestore);
    this.resize(canvas.clientWidth, canvas.clientHeight);
    this.animate();
  }

  reconcile(descriptor: SceneDescriptor): void {
    if (!this.scene) return;
    const isInitialReconcile = this.descriptor === null;
    const previousIds = new Set(this.planets.keys());
    const nextIds = new Set(descriptor.planets.map((planet) => planet.id));
    const spawnId = highlightedSpawnId(
      previousIds,
      nextIds,
      isInitialReconcile,
    );
    const outerExtent = Math.max(
      6.2,
      ...descriptor.planets.map(
        (planet) => planet.orbitRadius + Math.max(0.8, planet.size * 1.8),
      ),
    );
    const nextSystemFitScale = clamp(outerExtent / 6.2, 1, 1.8);
    if (Math.abs(nextSystemFitScale - this.cameraSystemFitScale) > 0.0001) {
      this.cameraSystemFitScale = nextSystemFitScale;
      this.updateCameraTransform();
    }
    this.descriptor = descriptor;
    this.reconcileStar(descriptor);

    for (const [id, runtime] of this.planets) {
      if (!nextIds.has(id)) {
        if (this.gesture?.planet === runtime) this.releaseGesture();
        this.scene.remove(runtime.group);
        this.clearRuntimePulseWindows(runtime);
        runtime.dispose();
        this.planets.delete(id);
      }
    }

    for (const planet of descriptor.planets) {
      const existing = this.planets.get(planet.id);
      if (
        !existing ||
        JSON.stringify(existing.descriptor) !== JSON.stringify(planet)
      ) {
        if (existing) {
          if (this.gesture?.planet === existing) this.releaseGesture();
          this.scene.remove(existing.group);
          this.clearRuntimePulseWindows(existing);
          existing.dispose();
        }
        const runtime = this.createPlanet(
          planet,
          !existing && planet.id === spawnId,
        );
        this.planets.set(planet.id, runtime);
        this.scene.add(runtime.group);
      } else {
        existing.descriptor = planet;
      }
    }
    this.reconcileAsteroids(descriptor);
    this.applySelection();
  }

  setSelection(id: string | null): void {
    this.selectedId = id;
    this.applySelection();
  }

  setVisualPreferences(preferences: Partial<VisualPreferences>): void {
    const reducedParticlesChanged =
      preferences.reducedParticles !== undefined &&
      preferences.reducedParticles !== this.preferences.reducedParticles;
    this.preferences = { ...this.preferences, ...preferences };
    if (reducedParticlesChanged && this.descriptor) {
      this.reconcileAsteroids(this.descriptor);
    }
    if (this.canvas)
      this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  setTempo(bpm: number): void {
    if (Number.isFinite(bpm) && bpm > 0) this.tempoBpm = bpm;
  }

  zoomIn(): void {
    this.setCameraZoom(this.cameraZoom + SCENE_CAMERA_ZOOM_STEP);
  }

  zoomOut(): void {
    this.setCameraZoom(this.cameraZoom - SCENE_CAMERA_ZOOM_STEP);
  }

  rotateLeft(): void {
    this.setCameraRotation(this.cameraRotation - CAMERA_ROTATION_STEP);
  }

  rotateRight(): void {
    this.setCameraRotation(this.cameraRotation + CAMERA_ROTATION_STEP);
  }

  resetView(): void {
    if (
      this.cameraZoom === SCENE_CAMERA_ZOOM_DEFAULT &&
      this.cameraRotation === 0
    ) {
      return;
    }
    this.cameraZoom = SCENE_CAMERA_ZOOM_DEFAULT;
    this.cameraRotation = 0;
    this.updateCameraTransform();
    this.notifyCameraView();
  }

  enqueuePulse(pulse: VisualPulse): void {
    const runtime = this.runtimeForPulse(pulse.entityId, pulse.eventId);
    const gate = runtime?.eventNodes.get(pulse.eventId);
    const startsAt =
      performance.now() +
      pulseDelayMsFromTicks(
        pulse.scheduledTick,
        this.options.readTransportTicks(),
        this.tempoBpm,
      );
    this.appendPulseWindow(this.pulseWindows, pulse.entityId, {
      startsAt,
      expiresAt: startsAt + 90 + pulse.velocity * 110,
    });
    this.appendPulseWindow(this.eventPulseWindows, pulse.eventId, {
      startsAt,
      expiresAt: startsAt + 110 + pulse.velocity * 150,
      scheduledPhase:
        runtime && gate?.userData.orbitGate
          ? spawnPhaseAtTick(
              runtime.descriptor.phase,
              pulse.scheduledTick,
              runtime.descriptor.loopBars,
            )
          : runtime && gate?.userData.moonOrbitGate
            ? moonOrbitPhaseAtTick(
                gate.userData.moonPhase as number,
                pulse.scheduledTick,
                runtime.descriptor.loopBars,
                gate.userData.orbitRatio as number,
              )
            : undefined,
    });
  }

  private runtimeForPulse(
    sourceEntityId: string,
    eventId: string,
  ): RuntimePlanet | undefined {
    const planet = this.planets.get(sourceEntityId);
    if (planet?.eventNodes.has(eventId)) return planet;
    for (const runtime of this.planets.values()) {
      const node = runtime.eventNodes.get(eventId);
      if (node?.userData.sourceEntityId === sourceEntityId) return runtime;
    }
    return undefined;
  }

  private clearRuntimePulseWindows(runtime: RuntimePlanet): void {
    this.pulseWindows.delete(runtime.descriptor.id);
    for (const moon of runtime.descriptor.moons) {
      this.pulseWindows.delete(moon.id);
    }
    for (const eventId of runtime.eventNodes.keys()) {
      this.eventPulseWindows.delete(eventId);
    }
  }

  private appendPulseWindow(
    windows: Map<string, PulseWindow[]>,
    key: string,
    window: PulseWindow,
  ): void {
    const now = performance.now();
    const pending = (windows.get(key) ?? []).filter(
      ({ expiresAt }) => expiresAt > now,
    );
    pending.push(window);
    windows.set(key, pending.slice(-16));
  }

  private activePulseWindow(
    windows: Map<string, PulseWindow[]>,
    key: string,
    now: number,
  ): PulseWindow | undefined {
    const pending = (windows.get(key) ?? []).filter(
      ({ expiresAt }) => expiresAt > now,
    );
    if (pending.length === 0) {
      windows.delete(key);
      return undefined;
    }
    windows.set(key, pending);
    return pending.find(({ startsAt }) => startsAt <= now);
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera || width <= 0 || height <= 0) return;
    const profile = resolveQualityProfile(
      this.preferences.quality,
      width,
      globalThis.devicePixelRatio || 1,
    );
    this.qualityProfile = profile;
    this.renderer.setPixelRatio(
      Math.min(globalThis.devicePixelRatio || 1, QUALITY_DPR_CAP[profile]),
    );
    this.renderer.setSize(width, height, false);
    this.cameraAspect = width / height;
    this.camera.aspect = this.cameraAspect;
    this.updateCameraTransform();
    this.camera.updateProjectionMatrix();
    this.applyVisualQuality();
    this.notifyCameraView();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.releaseGesture();
    for (const pointerId of this.activePointers.keys()) {
      this.releasePointerCapture(pointerId);
    }
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener(
        "pointercancel",
        this.handlePointerCancel,
      );
      this.canvas.removeEventListener("wheel", this.handleWheel);
      this.canvas.removeEventListener(
        "webglcontextlost",
        this.handleContextLoss,
      );
      this.canvas.removeEventListener(
        "webglcontextrestored",
        this.handleContextRestore,
      );
    }
    for (const runtime of this.planets.values()) runtime.dispose();
    this.planets.clear();
    this.pulseWindows.clear();
    this.eventPulseWindows.clear();
    this.gesture = null;
    this.pinchGesture = null;
    this.activePointers.clear();
    this.star?.dispose();
    if (this.asteroidBelt) disposeObject(this.asteroidBelt);
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.canvas = null;
  }

  private reconcileStar(descriptor: SceneDescriptor): void {
    if (!this.scene) return;
    if (
      this.star?.descriptor.id === descriptor.star.id &&
      this.star.descriptor.presetId === descriptor.star.presetId &&
      this.star.descriptor.visualSeed === descriptor.star.visualSeed
    ) {
      this.star.descriptor = descriptor.star;
      this.star.group.scale.setScalar(0.9 + descriptor.star.intensity * 0.24);
      updateStarSurfaceMaterial(this.star.body.material, {
        intensity: descriptor.star.intensity,
      });
      updateStarGlowMaterial(this.star.glow.material, {
        intensity: this.starGlowIntensity(descriptor.star.intensity),
      });
      this.star.glow.visible = this.starGlowEnabled();
      return;
    }
    if (this.star) {
      this.scene.remove(this.star.group);
      this.star.dispose();
    }
    const geometry = new THREE.IcosahedronGeometry(0.78, 4);
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      geometry,
      createStarSurfaceMaterial(descriptor.star, this.shaderDetail()),
    );
    const glow = new THREE.Mesh(
      geometry,
      createStarGlowMaterial(descriptor.star, this.shaderDetail()),
    );
    const outline = new THREE.Mesh(
      geometry,
      createCelestialOutlineMaterial(
        colorFromHue(descriptor.star.hue, 0.9),
        0.075,
        0.9,
      ),
    );
    body.renderOrder = 2;
    body.userData.entityId = descriptor.star.id;
    glow.scale.setScalar(1.42);
    glow.renderOrder = 1;
    glow.visible = this.starGlowEnabled();
    glow.userData.entityId = descriptor.star.id;
    outline.renderOrder = 3;
    outline.userData.entityId = descriptor.star.id;
    body.add(outline);
    group.add(glow, body);
    group.scale.setScalar(0.9 + descriptor.star.intensity * 0.24);
    updateStarGlowMaterial(glow.material, {
      intensity: this.starGlowIntensity(descriptor.star.intensity),
    });
    this.star = {
      group,
      body,
      outline,
      glow,
      descriptor: descriptor.star,
      dispose: () => disposeObject(group),
    };
    this.scene.add(group);
  }

  private createPlanet(
    descriptor: PlanetSceneDescriptor,
    highlightSpawn: boolean,
  ): RuntimePlanet {
    const group = new THREE.Group();
    const eventNodes = new Map<string, THREE.Mesh>();
    const moons: RuntimeMoon[] = [];
    group.userData.entityId = descriptor.id;
    const orbitPoints = Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 95) * Math.PI * 2;
      return new THREE.Vector3(
        Math.cos(angle) * descriptor.orbitRadius,
        0,
        Math.sin(angle) * descriptor.orbitRadius,
      );
    });
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: colorFromHue(descriptor.hue, 0.58),
      transparent: true,
      opacity: descriptor.muted ? 0.1 : 0.3,
    });
    group.add(new THREE.LineLoop(orbitGeometry, orbitMaterial));

    const bodyGeometry = new THREE.IcosahedronGeometry(descriptor.size, 3);
    const bodyMaterial = createPlanetSurfaceMaterial(
      descriptor,
      this.shaderDetail(),
    );
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    const outline = new THREE.Mesh(
      bodyGeometry,
      createCelestialOutlineMaterial(
        colorFromHue(descriptor.hue + 18, 0.88),
        Math.max(0.026, descriptor.size * 0.11),
        0.88,
      ),
    );
    body.userData.entityId = descriptor.id;
    outline.renderOrder = 3;
    outline.userData.entityId = descriptor.id;
    setOrbitPosition(
      body,
      spawnPhaseAtTick(
        descriptor.phase,
        this.options.readTransportTicks(),
        descriptor.loopBars,
      ),
      descriptor.orbitRadius,
      descriptor.inclination,
    );
    body.add(outline);
    group.add(body);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.66, descriptor.size * 1.7), 12, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.userData.entityId = descriptor.id;
    body.add(hit);

    if (descriptor.events.length > 0) {
      const nodeGeometry = new THREE.TorusGeometry(
        Math.max(0.42, descriptor.size * 1.32),
        0.032,
        6,
        20,
      );
      for (const event of descriptor.events) {
        const nodeMaterial = new THREE.MeshBasicMaterial({
          color: colorFromHue(descriptor.hue, 0.77),
          transparent: true,
          opacity: descriptor.muted ? 0.18 : 0.52,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
        setOrbitPosition(
          node,
          event.gatePhase,
          descriptor.orbitRadius,
          descriptor.inclination,
        );
        orientAcrossOrbit(node, event.gatePhase);
        node.userData.entityId = descriptor.id;
        node.userData.eventId = event.eventId;
        node.userData.orbitGate = true;
        eventNodes.set(event.eventId, node);
        group.add(node);
      }
    }

    const spawnMarkerStartedAt = performance.now();
    const spawnMarker = highlightSpawn
      ? new THREE.Mesh(
          new THREE.TorusGeometry(
            Math.max(0.5, descriptor.size * 1.55),
            0.025,
            6,
            24,
          ),
          new THREE.MeshBasicMaterial({
            color: colorFromHue(descriptor.hue + 38, 0.84),
            transparent: true,
            opacity: 0.84,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
      : null;
    if (spawnMarker) {
      const spawnPhase = spawnPhaseAtTick(
        descriptor.phase,
        this.options.readTransportTicks(),
        descriptor.loopBars,
      );
      setOrbitPosition(
        spawnMarker,
        spawnPhase,
        descriptor.orbitRadius,
        descriptor.inclination,
      );
      orientAcrossOrbit(spawnMarker, spawnPhase);
      spawnMarker.renderOrder = 3;
      spawnMarker.userData.spawnMarker = true;
      group.add(spawnMarker);
    }

    if (descriptor.moons.length > 0) {
      const moonGeometry = new THREE.SphereGeometry(0.11, 10, 8);
      const moonMaterial = new THREE.MeshStandardMaterial({
        color: colorFromHue(descriptor.hue + 25, 0.7),
      });
      const moonGateGeometry = new THREE.TorusGeometry(0.16, 0.022, 6, 16);
      descriptor.moons.forEach((moonDescriptor) => {
        const moonOrbitRadius = descriptor.size + 0.3;
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        setMoonOrbitPosition(
          moon,
          moonOrbitPhaseAtTick(
            moonDescriptor.phase,
            this.options.readTransportTicks(),
            descriptor.loopBars,
            moonDescriptor.orbitRatio,
          ),
          moonOrbitRadius,
        );
        // The inspector edits planets; moon hits intentionally select the parent.
        moon.userData.entityId = moonDescriptor.selectionTargetId;
        moon.userData.sourceEntityId = moonDescriptor.id;
        moons.push({
          body: moon,
          descriptor: moonDescriptor,
          orbitRadius: moonOrbitRadius,
        });
        body.add(moon);
        for (const event of moonDescriptor.events) {
          const gateMaterial = new THREE.MeshBasicMaterial({
            color: colorFromHue(descriptor.hue + 48, 0.74),
            transparent: true,
            opacity: descriptor.muted ? 0.18 : 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const gate = new THREE.Mesh(moonGateGeometry, gateMaterial);
          setMoonOrbitPosition(gate, event.gatePhase, moonOrbitRadius);
          orientAcrossOrbit(gate, event.gatePhase);
          // Moon bodies and gates remain selectable as their parent planet.
          gate.userData.entityId = moonDescriptor.selectionTargetId;
          gate.userData.sourceEntityId = moonDescriptor.id;
          gate.userData.eventId = event.eventId;
          gate.userData.moonOrbitGate = true;
          gate.userData.moonPhase = moonDescriptor.phase;
          gate.userData.orbitRatio = moonDescriptor.orbitRatio;
          gate.userData.moonOrbitRadius = moonOrbitRadius;
          eventNodes.set(event.eventId, gate);
          body.add(gate);
        }
      });
    }

    if (descriptor.ringSegments.length > 0) {
      const ringGeometry = new THREE.BoxGeometry(0.1, 0.035, 0.18);
      let activeMaterial: THREE.MeshBasicMaterial | undefined;
      let inactiveMaterial: THREE.MeshBasicMaterial | undefined;
      descriptor.ringSegments.forEach((segment) => {
        const angle = segment.phase * Math.PI * 2;
        const material = segment.active
          ? (activeMaterial ??= new THREE.MeshBasicMaterial({
              color: colorFromHue(descriptor.hue + 50, 0.76),
            }))
          : (inactiveMaterial ??= new THREE.MeshBasicMaterial({
              color: colorFromHue(descriptor.hue + 50, 0.32),
            }));
        const fragment = new THREE.Mesh(ringGeometry, material);
        fragment.position.set(
          Math.cos(angle) * (descriptor.size + 0.22),
          0,
          Math.sin(angle) * (descriptor.size + 0.22),
        );
        fragment.rotation.y = -angle;
        fragment.userData.entityId = descriptor.id;
        fragment.userData.eventId = segment.eventId;
        eventNodes.set(segment.eventId, fragment);
        body.add(fragment);
      });
    }

    return {
      group,
      body,
      outline,
      eventNodes,
      moons,
      spawnMarker,
      spawnMarkerStartedAt,
      spawnMarkerExpiresAt: highlightSpawn
        ? spawnMarkerStartedAt + SPAWN_MARKER_DURATION_MS
        : 0,
      descriptor,
      dispose: () => disposeObject(group),
    };
  }

  private reconcileAsteroids(descriptor: SceneDescriptor): void {
    if (!this.scene) return;
    if (this.asteroidBelt) {
      this.scene.remove(this.asteroidBelt);
      disposeObject(this.asteroidBelt);
      this.asteroidBelt = null;
    }
    if (!descriptor.asteroidBelt || this.preferences.reducedParticles) return;
    const positions = new Float32Array(descriptor.asteroidBelt.count * 3);
    let state = descriptor.asteroidBelt.visualSeed >>> 0;
    const random = () => {
      state = Math.imul(1664525, state) + 1013904223;
      return (state >>> 0) / 0x1_0000_0000;
    };
    const outerPlanetRadius = Math.max(
      5.8,
      ...descriptor.planets.map(
        (planet) => planet.orbitRadius + Math.max(0.72, planet.size * 1.65),
      ),
    );
    for (let index = 0; index < descriptor.asteroidBelt.count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = outerPlanetRadius + 0.9 + random() * 0.72;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = (random() - 0.5) * 0.32;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.asteroidBelt = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xb9a39b, size: 0.08 }),
    );
    this.asteroidBelt.userData.entityId = descriptor.asteroidBelt.id;
    this.scene.add(this.asteroidBelt);
  }

  private shaderDetail(): number {
    return QUALITY_SHADER_DETAIL[this.qualityProfile] / 5;
  }

  private starGlowIntensity(intensity: number): number {
    const reducedEffectsMultiplier = this.preferences.reducedParticles
      ? 0.55
      : 1;
    return (
      intensity *
      QUALITY_GLOW_STRENGTH[this.qualityProfile] *
      reducedEffectsMultiplier
    );
  }

  private starGlowEnabled(): boolean {
    return this.qualityProfile !== "low" && !this.preferences.reducedParticles;
  }

  private applyVisualQuality(): void {
    const detail = this.shaderDetail();
    for (const runtime of this.planets.values()) {
      updatePlanetSurfaceMaterial(runtime.body.material, { detail });
    }
    if (this.star) {
      this.star.glow.visible = this.starGlowEnabled();
      updateStarSurfaceMaterial(this.star.body.material, { detail });
      updateStarGlowMaterial(this.star.glow.material, {
        detail,
        intensity: this.starGlowIntensity(this.star.descriptor.intensity),
      });
    }
  }

  private applySelection(): void {
    for (const [id, runtime] of this.planets) {
      const selected = id === this.selectedId;
      updatePlanetSurfaceMaterial(runtime.body.material, {
        selected,
        muted: runtime.descriptor.muted,
      });
      updateCelestialOutlineMaterial(runtime.outline.material, {
        selected,
        muted: runtime.descriptor.muted,
      });
      runtime.body.scale.setScalar(selected ? 1.08 : 1);
    }
    if (this.star) {
      const selected = this.star.descriptor.id === this.selectedId;
      updateStarSurfaceMaterial(this.star.body.material, { selected });
      updateStarGlowMaterial(this.star.glow.material, { selected });
      updateCelestialOutlineMaterial(this.star.outline.material, { selected });
    }
  }

  private entityAtPointer(event: PointerEvent): string | null {
    if (!this.canvas || !this.camera || !this.scene) return null;
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster
      .intersectObjects(this.scene.children, true)
      .find((intersection) => intersection.object.userData.entityId);
    return (hit?.object.userData.entityId as string | undefined) ?? null;
  }

  private systemCenterInClient(): { x: number; y: number } | null {
    if (!this.canvas || !this.camera) return null;
    const bounds = this.canvas.getBoundingClientRect();
    const projected = new THREE.Vector3(0, 0, 0).project(this.camera);
    return {
      x: bounds.left + ((projected.x + 1) / 2) * bounds.width,
      y: bounds.top + ((1 - projected.y) / 2) * bounds.height,
    };
  }

  private currentCameraView(): SceneCameraView {
    const zoomPercent = Math.round(this.cameraZoom * 100);
    const rotationDegrees = Math.round(
      (normalizeSceneRotation(this.cameraRotation) * 180) / Math.PI,
    );
    return {
      zoomPercent,
      rotationDegrees,
      canZoomIn: this.cameraZoom < SCENE_CAMERA_ZOOM_MAX - 0.0001,
      canZoomOut: this.cameraZoom > SCENE_CAMERA_ZOOM_MIN + 0.0001,
      canReset:
        Math.abs(this.cameraZoom - SCENE_CAMERA_ZOOM_DEFAULT) > 0.0001 ||
        Math.abs(this.cameraRotation) > 0.0001,
    };
  }

  private notifyCameraView(): void {
    const view = this.currentCameraView();
    const signature = `${view.zoomPercent}:${view.rotationDegrees}:${view.canZoomIn}:${view.canZoomOut}:${view.canReset}`;
    if (signature === this.lastCameraViewSignature) return;
    this.lastCameraViewSignature = signature;
    this.options.onCameraViewChange?.(view);
  }

  private updateCameraTransform(): void {
    if (!this.camera) return;
    const distance =
      cameraDistanceForView(this.cameraAspect, this.cameraZoom) *
      this.cameraSystemFitScale;
    const initialDistance = Math.hypot(
      CAMERA_DEFAULT_POSITION.y,
      CAMERA_DEFAULT_POSITION.z,
    );
    const y = (CAMERA_DEFAULT_POSITION.y / initialDistance) * distance;
    const horizontalDistance =
      (CAMERA_DEFAULT_POSITION.z / initialDistance) * distance;
    this.camera.position.set(
      Math.sin(this.cameraRotation) * horizontalDistance,
      y,
      Math.cos(this.cameraRotation) * horizontalDistance,
    );
    this.camera.lookAt(0, 0, 0);
    if (this.scene?.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = clamp(
        (0.025 * CAMERA_BASE_DISTANCE) / distance,
        0.006,
        0.032,
      );
    }
  }

  private setCameraZoom(zoom: number): void {
    const nextZoom = clampSceneZoom(zoom);
    if (Math.abs(nextZoom - this.cameraZoom) < 0.0001) return;
    this.cameraZoom = nextZoom;
    this.updateCameraTransform();
    this.notifyCameraView();
  }

  private setCameraRotation(rotation: number): void {
    const nextRotation = normalizeSceneRotation(rotation);
    if (Math.abs(nextRotation - this.cameraRotation) < 0.0001) return;
    this.cameraRotation = nextRotation;
    this.updateCameraTransform();
    this.notifyCameraView();
  }

  private beginPinchGesture(): boolean {
    const entries = [...this.activePointers.entries()];
    const first = entries[0];
    const second = entries[1];
    if (!first || !second) return false;
    const startDistance = Math.hypot(
      second[1].x - first[1].x,
      second[1].y - first[1].y,
    );
    if (startDistance <= 0) return false;
    this.gesture = null;
    this.pinchGesture = {
      pointerIds: [first[0], second[0]],
      startDistance,
      startZoom: this.cameraZoom,
    };
    return true;
  }

  private releasePointerCapture(pointerId: number): void {
    if (this.canvas?.hasPointerCapture(pointerId)) {
      this.canvas.releasePointerCapture(pointerId);
    }
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.canvas) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    this.canvas.setPointerCapture(event.pointerId);
    if (this.activePointers.size >= 2) {
      if (this.beginPinchGesture()) event.preventDefault();
      return;
    }
    if (this.gesture) return;
    const entityId = this.entityAtPointer(event);
    const center = this.systemCenterInClient();
    if (!center) {
      this.activePointers.delete(event.pointerId);
      this.releasePointerCapture(event.pointerId);
      return;
    }
    const offsetX = event.clientX - center.x;
    const offsetY = event.clientY - center.y;
    const length = Math.hypot(offsetX, offsetY) || 1;
    const candidate = entityId ? this.planets.get(entityId) : undefined;
    const planet =
      candidate && entityId === this.selectedId && !candidate.descriptor.locked
        ? candidate
        : undefined;
    this.gesture = {
      pointerId: event.pointerId,
      entityId,
      planet,
      startX: event.clientX,
      startY: event.clientY,
      radialX: offsetX / length,
      radialY: offsetY / length,
      startAngle: Math.atan2(offsetY, offsetX),
      mode: null,
      startCameraRotation: this.cameraRotation,
    };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const activePointer = this.activePointers.get(event.pointerId);
    if (!activePointer) return;
    activePointer.x = event.clientX;
    activePointer.y = event.clientY;

    const pinch = this.pinchGesture;
    if (pinch) {
      const first = this.activePointers.get(pinch.pointerIds[0]);
      const second = this.activePointers.get(pinch.pointerIds[1]);
      if (!first || !second) return;
      this.setCameraZoom(
        sceneZoomFromPinch(
          pinch.startZoom,
          pinch.startDistance,
          Math.hypot(second.x - first.x, second.y - first.y),
        ),
      );
      event.preventDefault();
      return;
    }

    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.planet) {
      if (gesture.entityId !== null) return;
      if (
        gesture.mode === null &&
        Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX
      ) {
        gesture.mode = "camera-rotate";
      }
      if (gesture.mode !== "camera-rotate") return;
      this.setCameraRotation(
        sceneRotationFromDrag(gesture.startCameraRotation, deltaX),
      );
      event.preventDefault();
      return;
    }

    gesture.mode ??= classifyPlanetDrag(
      deltaX,
      deltaY,
      gesture.radialX,
      gesture.radialY,
    );
    if (!gesture.mode) return;

    if (gesture.mode === "radial") {
      const radialDistance =
        deltaX * gesture.radialX + deltaY * gesture.radialY;
      const startLoopBars = gesture.planet.descriptor.loopBars;
      gesture.previewLoopBars = quantizeLoopBarsFromRadialDrag(
        startLoopBars,
        radialDistance,
      );
    } else {
      const center = this.systemCenterInClient();
      if (!center) return;
      const currentAngle = Math.atan2(
        event.clientY - center.y,
        event.clientX - center.x,
      );
      gesture.previewPhase = phaseFromTangentialDrag(
        gesture.planet.descriptor.phase,
        gesture.startAngle,
        currentAngle,
      );
    }
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const wasPinching = this.pinchGesture !== null;
    this.activePointers.delete(event.pointerId);
    if (wasPinching) {
      const pinch = this.pinchGesture;
      if (
        pinch &&
        (!this.activePointers.has(pinch.pointerIds[0]) ||
          !this.activePointers.has(pinch.pointerIds[1]))
      ) {
        this.pinchGesture = null;
      }
      this.releasePointerCapture(event.pointerId);
      return;
    }

    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      this.releasePointerCapture(event.pointerId);
      return;
    }
    if (gesture.mode === "radial" && gesture.planet) {
      const loopBars =
        gesture.previewLoopBars ?? gesture.planet.descriptor.loopBars;
      if (loopBars !== gesture.planet.descriptor.loopBars) {
        this.options.onInteraction?.({
          type: "set-orbit-loop-bars",
          entityId: gesture.planet.descriptor.id,
          loopBars,
        });
      }
    } else if (gesture.mode === "tangential" && gesture.planet) {
      const phase = gesture.previewPhase ?? gesture.planet.descriptor.phase;
      if (Math.abs(phase - gesture.planet.descriptor.phase) > 0.0001) {
        this.options.onInteraction?.({
          type: "set-orbit-phase",
          entityId: gesture.planet.descriptor.id,
          phase,
        });
      }
    } else if (gesture.mode !== "camera-rotate") {
      this.options.onInteraction?.({
        type: "select",
        entityId: gesture.entityId,
      });
    }
    this.releaseGesture();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.activePointers.delete(event.pointerId);
    if (this.pinchGesture) {
      const { pointerIds } = this.pinchGesture;
      if (
        !this.activePointers.has(pointerIds[0]) ||
        !this.activePointers.has(pointerIds[1])
      ) {
        this.pinchGesture = null;
      }
    }
    if (this.gesture?.pointerId === event.pointerId) this.releaseGesture();
    else this.releasePointerCapture(event.pointerId);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.canvas) return;
    const deltaScale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.canvas.clientHeight
          : 1;
    this.setCameraZoom(
      sceneZoomFromWheel(this.cameraZoom, event.deltaY * deltaScale),
    );
    event.preventDefault();
  };

  private releaseGesture(): void {
    if (
      this.canvas &&
      this.gesture &&
      this.canvas.hasPointerCapture(this.gesture.pointerId)
    ) {
      this.releasePointerCapture(this.gesture.pointerId);
    }
    this.gesture = null;
  }

  private readonly handleContextLoss = (event: Event): void => {
    event.preventDefault();
    cancelAnimationFrame(this.frame);
  };

  private readonly handleContextRestore = (): void => {
    this.animate();
  };

  private readonly animate = (): void => {
    if (!this.renderer || !this.scene || !this.camera) return;
    const ticks = this.options.readTransportTicks();
    const now = performance.now();
    for (const [id, runtime] of this.planets) {
      const activeGesture =
        this.gesture?.planet === runtime ? this.gesture : undefined;
      const phase = orbitPhaseAtTick(
        activeGesture?.previewPhase ?? runtime.descriptor.phase,
        ticks,
        activeGesture?.previewLoopBars ?? runtime.descriptor.loopBars,
        SCENE_TICKS_PER_BEAT,
      );
      setOrbitPosition(
        runtime.body,
        phase,
        runtime.descriptor.orbitRadius,
        runtime.descriptor.inclination,
      );
      const pulsing = Boolean(
        this.activePulseWindow(this.pulseWindows, id, now),
      );
      const selectedScale = id === this.selectedId ? 1.08 : 1;
      runtime.body.scale.setScalar(
        pulsing && !this.preferences.reducedFlash
          ? selectedScale * 1.16
          : selectedScale,
      );
      updatePlanetSurfaceMaterial(runtime.body.material, {
        time: this.preferences.reducedMotion ? 0 : ticks,
        pulse: pulsing && !this.preferences.reducedFlash ? 1 : 0,
        selected: id === this.selectedId,
        muted: runtime.descriptor.muted,
        detail: this.shaderDetail(),
        roughness: runtime.descriptor.roughness,
      });
      updateCelestialOutlineMaterial(runtime.outline.material, {
        pulse: pulsing && !this.preferences.reducedFlash ? 1 : 0,
        selected: id === this.selectedId,
        muted: runtime.descriptor.muted,
      });
      for (const moon of runtime.moons) {
        setMoonOrbitPosition(
          moon.body,
          moonOrbitPhaseAtTick(
            moon.descriptor.phase,
            ticks,
            runtime.descriptor.loopBars,
            moon.descriptor.orbitRatio,
          ),
          moon.orbitRadius,
        );
      }
      const pulsingNodes = new Set<THREE.Mesh>();
      for (const [eventId, node] of runtime.eventNodes) {
        const pulseWindow = this.activePulseWindow(
          this.eventPulseWindows,
          eventId,
          now,
        );
        if (pulseWindow) {
          pulsingNodes.add(node);
          if (
            node.userData.orbitGate &&
            pulseWindow.scheduledPhase !== undefined
          ) {
            setOrbitPosition(
              node,
              pulseWindow.scheduledPhase,
              runtime.descriptor.orbitRadius,
              runtime.descriptor.inclination,
            );
            orientAcrossOrbit(node, pulseWindow.scheduledPhase);
          } else if (
            node.userData.moonOrbitGate &&
            pulseWindow.scheduledPhase !== undefined
          ) {
            setMoonOrbitPosition(
              node,
              pulseWindow.scheduledPhase,
              node.userData.moonOrbitRadius as number,
            );
            orientAcrossOrbit(node, pulseWindow.scheduledPhase);
          }
        }
      }
      for (const node of new Set(runtime.eventNodes.values())) {
        const isPulsing = pulsingNodes.has(node);
        node.scale.setScalar(
          isPulsing && !this.preferences.reducedFlash
            ? node.userData.orbitGate
              ? 1.42
              : node.userData.moonOrbitGate
                ? 1.55
                : 1.9
            : 1,
        );
        if (node.userData.orbitGate || node.userData.moonOrbitGate) {
          const material = node.material as THREE.MeshBasicMaterial;
          material.opacity = isPulsing
            ? this.preferences.reducedFlash
              ? 0.72
              : 1
            : runtime.descriptor.muted
              ? 0.18
              : node.userData.moonOrbitGate
                ? 0.5
                : 0.52;
        }
      }
      if (runtime.spawnMarker) {
        const marker = runtime.spawnMarker;
        if (now >= runtime.spawnMarkerExpiresAt) {
          runtime.group.remove(marker);
          disposeObject(marker);
          runtime.spawnMarker = null;
        } else {
          const progress = Math.min(
            1,
            (now - runtime.spawnMarkerStartedAt) / SPAWN_MARKER_DURATION_MS,
          );
          const reducedMarkerEffects =
            this.preferences.reducedMotion || this.preferences.reducedFlash;
          const material = marker.material as THREE.MeshBasicMaterial;
          material.opacity = Math.max(
            0,
            (reducedMarkerEffects ? 0.34 : 0.86) * (1 - progress),
          );
          marker.scale.setScalar(
            reducedMarkerEffects ? 1 : 0.86 + progress * 0.72,
          );
        }
      }
    }
    if (this.star) {
      const materialTime = this.preferences.reducedMotion ? 0 : ticks;
      const stellarPulse = this.preferences.reducedFlash
        ? 0
        : Math.max(0, Math.sin((ticks / SCENE_TICKS_PER_BEAT) * Math.PI)) *
          0.18;
      updateStarSurfaceMaterial(this.star.body.material, {
        time: materialTime,
        pulse: stellarPulse,
        selected: this.star.descriptor.id === this.selectedId,
        detail: this.shaderDetail(),
        intensity: this.star.descriptor.intensity,
      });
      updateStarGlowMaterial(this.star.glow.material, {
        time: materialTime,
        pulse: stellarPulse,
        selected: this.star.descriptor.id === this.selectedId,
        detail: this.shaderDetail(),
        intensity: this.starGlowIntensity(this.star.descriptor.intensity),
      });
      updateCelestialOutlineMaterial(this.star.outline.material, {
        pulse: stellarPulse,
        selected: this.star.descriptor.id === this.selectedId,
      });
      if (!this.preferences.reducedMotion) {
        this.star.group.rotation.y = ticks / 2_600;
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };
}
