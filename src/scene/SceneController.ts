import * as THREE from "three";

import type { LoopBars } from "../domain/composition";
import type {
  PlanetSceneDescriptor,
  SceneDescriptor,
  SceneInteractionIntent,
  VisualPreferences,
  VisualPulse,
} from "./contracts";
import { orbitPhaseAtTick } from "./phase";
import { QUALITY_DPR_CAP, resolveQualityProfile } from "./quality";

interface RuntimePlanet {
  group: THREE.Group;
  body: THREE.Mesh;
  eventNodes: Map<string, THREE.Mesh>;
  descriptor: PlanetSceneDescriptor;
  dispose: () => void;
}

export type PlanetDragMode = "radial" | "tangential";

interface PointerGesture {
  pointerId: number;
  entityId: string | null;
  planet?: RuntimePlanet;
  startX: number;
  startY: number;
  radialX: number;
  radialY: number;
  startAngle: number;
  mode: PlanetDragMode | null;
  previewLoopBars?: LoopBars;
  previewOrbitRadius?: number;
  previewPhase?: number;
}

export interface SceneControllerOptions {
  readTransportTicks: () => number;
  onInteraction?: (intent: SceneInteractionIntent) => void;
}

const defaultPreferences: VisualPreferences = {
  quality: "auto",
  reducedMotion: false,
  reducedParticles: false,
  reducedFlash: false,
};

const DRAG_THRESHOLD_PX = 7;
const PIXELS_PER_ORBIT_SHELL = 44;
const LOOP_BAR_SHELLS: readonly LoopBars[] = [0.5, 1, 2, 4];

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
  const startIndex = LOOP_BAR_SHELLS.indexOf(startLoopBars);
  const shellDelta = Math.round(radialDistance / pixelsPerShell);
  const index = Math.max(
    0,
    Math.min(LOOP_BAR_SHELLS.length - 1, startIndex + shellDelta),
  );
  return LOOP_BAR_SHELLS[index];
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
  private star: THREE.Mesh | null = null;
  private planets = new Map<string, RuntimePlanet>();
  private asteroidBelt: THREE.Points | null = null;
  private frame = 0;
  private selectedId: string | null = null;
  private preferences = defaultPreferences;
  private pulseExpiry = new Map<string, number>();
  private eventPulseExpiry = new Map<string, number>();
  private gesture: PointerGesture | null = null;
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
    this.camera.position.set(0, 8.8, 10.5);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const light = new THREE.PointLight(0xff9b58, 32, 22);
    light.position.set(0, 1.2, 0);
    this.scene.add(light);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerCancel);
    canvas.addEventListener("webglcontextlost", this.handleContextLoss);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestore);
    this.resize(canvas.clientWidth, canvas.clientHeight);
    this.animate();
  }

  reconcile(descriptor: SceneDescriptor): void {
    if (!this.scene) return;
    this.descriptor = descriptor;
    this.reconcileStar(descriptor);

    const nextIds = new Set(descriptor.planets.map((planet) => planet.id));
    for (const [id, runtime] of this.planets) {
      if (!nextIds.has(id)) {
        if (this.gesture?.planet === runtime) this.releaseGesture();
        this.scene.remove(runtime.group);
        runtime.dispose();
        this.planets.delete(id);
        this.pulseExpiry.delete(id);
        for (const eventId of runtime.eventNodes.keys()) {
          this.eventPulseExpiry.delete(eventId);
        }
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
          existing.dispose();
        }
        const runtime = this.createPlanet(planet);
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
    this.preferences = { ...this.preferences, ...preferences };
    if (this.canvas)
      this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  enqueuePulse(pulse: VisualPulse): void {
    this.pulseExpiry.set(
      pulse.entityId,
      performance.now() + 90 + pulse.velocity * 110,
    );
    this.eventPulseExpiry.set(
      pulse.eventId,
      performance.now() + 110 + pulse.velocity * 150,
    );
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera || width <= 0 || height <= 0) return;
    const profile = resolveQualityProfile(
      this.preferences.quality,
      width,
      globalThis.devicePixelRatio || 1,
    );
    this.renderer.setPixelRatio(
      Math.min(globalThis.devicePixelRatio || 1, QUALITY_DPR_CAP[profile]),
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.releaseGesture();
    if (this.canvas) {
      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener(
        "pointercancel",
        this.handlePointerCancel,
      );
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
    this.pulseExpiry.clear();
    this.eventPulseExpiry.clear();
    this.gesture = null;
    if (this.star) disposeObject(this.star);
    if (this.asteroidBelt) disposeObject(this.asteroidBelt);
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.canvas = null;
  }

  private reconcileStar(descriptor: SceneDescriptor): void {
    if (!this.scene) return;
    if (this.star?.userData.entityId === descriptor.star.id) {
      const material = this.star.material as THREE.MeshBasicMaterial;
      material.color = colorFromHue(descriptor.star.hue, 0.64);
      this.star.scale.setScalar(0.9 + descriptor.star.intensity * 0.24);
      return;
    }
    if (this.star) {
      this.scene.remove(this.star);
      disposeObject(this.star);
    }
    const geometry = new THREE.IcosahedronGeometry(0.88, 4);
    const material = new THREE.MeshBasicMaterial({
      color: colorFromHue(descriptor.star.hue, 0.65),
    });
    this.star = new THREE.Mesh(geometry, material);
    this.star.scale.setScalar(0.9 + descriptor.star.intensity * 0.24);
    this.star.renderOrder = 2;
    this.star.userData.entityId = descriptor.star.id;
    this.scene.add(this.star);
  }

  private createPlanet(descriptor: PlanetSceneDescriptor): RuntimePlanet {
    const group = new THREE.Group();
    const eventNodes = new Map<string, THREE.Mesh>();
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

    const bodyGeometry = new THREE.IcosahedronGeometry(descriptor.size, 2);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: colorFromHue(descriptor.hue),
      roughness: 0.62,
      emissive: colorFromHue(descriptor.hue, 0.24),
      emissiveIntensity: descriptor.muted ? 0.05 : 0.34,
      transparent: descriptor.muted,
      opacity: descriptor.muted ? 0.42 : 1,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.userData.entityId = descriptor.id;
    group.add(body);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.66, descriptor.size * 1.7), 12, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.userData.entityId = descriptor.id;
    body.add(hit);

    if (descriptor.events.length > 0) {
      const nodeGeometry = new THREE.SphereGeometry(0.055, 8, 6);
      const nodeMaterial = new THREE.MeshBasicMaterial({
        color: colorFromHue(descriptor.hue, 0.76),
      });
      for (const event of descriptor.events) {
        const angle = event.phase * Math.PI * 2;
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
        node.position.set(
          Math.cos(angle) * descriptor.orbitRadius,
          0.02,
          Math.sin(angle) * descriptor.orbitRadius,
        );
        node.userData.entityId = descriptor.id;
        node.userData.eventId = event.eventId;
        eventNodes.set(event.eventId, node);
        group.add(node);
      }
    }

    if (descriptor.moons.length > 0) {
      const moonGeometry = new THREE.SphereGeometry(0.11, 10, 8);
      const moonMaterial = new THREE.MeshStandardMaterial({
        color: colorFromHue(descriptor.hue + 25, 0.7),
      });
      descriptor.moons.forEach((moonDescriptor) => {
        const angle = moonDescriptor.phase * Math.PI * 2;
        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.position.set(
          Math.cos(angle) * (descriptor.size + 0.3),
          0.06,
          Math.sin(angle) * (descriptor.size + 0.3),
        );
        // The inspector edits planets; moon hits intentionally select the parent.
        moon.userData.entityId = moonDescriptor.selectionTargetId;
        moon.userData.sourceEntityId = moonDescriptor.id;
        for (const event of moonDescriptor.events) {
          eventNodes.set(event.eventId, moon);
        }
        body.add(moon);
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
      eventNodes,
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
    for (let index = 0; index < descriptor.asteroidBelt.count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 7.1 + random() * 0.72;
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

  private applySelection(): void {
    for (const [id, runtime] of this.planets) {
      const material = runtime.body.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity =
        id === this.selectedId ? 0.82 : runtime.descriptor.muted ? 0.05 : 0.34;
      runtime.body.scale.setScalar(id === this.selectedId ? 1.08 : 1);
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

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.canvas || this.gesture) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const entityId = this.entityAtPointer(event);
    const center = this.systemCenterInClient();
    if (!center) return;
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
    };
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId || !gesture.planet)
      return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
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
      const startShell = LOOP_BAR_SHELLS.indexOf(startLoopBars);
      const previewShell = LOOP_BAR_SHELLS.indexOf(gesture.previewLoopBars);
      gesture.previewOrbitRadius =
        gesture.planet.descriptor.orbitRadius +
        (previewShell - startShell) * 1.25;
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
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
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
    } else {
      this.options.onInteraction?.({
        type: "select",
        entityId: gesture.entityId,
      });
    }
    this.releaseGesture();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (!this.gesture || event.pointerId !== this.gesture.pointerId) return;
    this.releaseGesture();
  };

  private releaseGesture(): void {
    if (
      this.canvas &&
      this.gesture &&
      this.canvas.hasPointerCapture(this.gesture.pointerId)
    ) {
      this.canvas.releasePointerCapture(this.gesture.pointerId);
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
        480,
      );
      const angle = phase * Math.PI * 2;
      const orbitRadius =
        activeGesture?.previewOrbitRadius ?? runtime.descriptor.orbitRadius;
      runtime.body.position.set(
        Math.cos(angle) * orbitRadius,
        Math.sin(angle * 2) * runtime.descriptor.inclination,
        Math.sin(angle) * orbitRadius,
      );
      const pulsing = (this.pulseExpiry.get(id) ?? 0) > now;
      const selectedScale = id === this.selectedId ? 1.08 : 1;
      runtime.body.scale.setScalar(
        pulsing && !this.preferences.reducedFlash
          ? selectedScale * 1.16
          : selectedScale,
      );
      const pulsingNodes = new Set<THREE.Mesh>();
      for (const [eventId, node] of runtime.eventNodes) {
        if ((this.eventPulseExpiry.get(eventId) ?? 0) > now) {
          pulsingNodes.add(node);
        }
      }
      for (const node of new Set(runtime.eventNodes.values())) {
        node.scale.setScalar(
          pulsingNodes.has(node) && !this.preferences.reducedFlash ? 1.9 : 1,
        );
      }
    }
    if (this.star && !this.preferences.reducedMotion) {
      this.star.rotation.y = ticks / 2600;
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };
}
