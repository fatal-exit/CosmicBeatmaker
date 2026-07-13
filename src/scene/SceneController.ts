import * as THREE from "three";

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
  descriptor: PlanetSceneDescriptor;
  dispose: () => void;
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

function colorFromHue(hue: number, lightness = 0.62): THREE.Color {
  const color = new THREE.Color();
  color.setHSL((((hue % 360) + 360) % 360) / 360, 0.62, lightness);
  return color;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    const renderable = child as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;
    renderable.geometry.dispose();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of materials) material.dispose();
  });
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
    canvas.addEventListener("pointerup", this.handlePointer);
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
        this.scene.remove(runtime.group);
        runtime.dispose();
        this.planets.delete(id);
        this.pulseExpiry.delete(id);
      }
    }

    for (const planet of descriptor.planets) {
      const existing = this.planets.get(planet.id);
      if (
        !existing ||
        JSON.stringify(existing.descriptor) !== JSON.stringify(planet)
      ) {
        if (existing) {
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
    if (this.canvas) {
      this.canvas.removeEventListener("pointerup", this.handlePointer);
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

    const nodeGeometry = new THREE.SphereGeometry(0.055, 8, 6);
    for (let index = 0; index < descriptor.eventIds.length; index += 1) {
      const angle =
        (index / Math.max(1, descriptor.eventIds.length)) * Math.PI * 2;
      const node = new THREE.Mesh(
        nodeGeometry.clone(),
        new THREE.MeshBasicMaterial({
          color: colorFromHue(descriptor.hue, 0.76),
        }),
      );
      node.position.set(
        Math.cos(angle) * descriptor.orbitRadius,
        0.02,
        Math.sin(angle) * descriptor.orbitRadius,
      );
      group.add(node);
    }

    descriptor.moonIds.forEach((id, index) => {
      const angle =
        (index / Math.max(1, descriptor.moonIds.length)) * Math.PI * 2;
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshStandardMaterial({
          color: colorFromHue(descriptor.hue + 25, 0.7),
        }),
      );
      moon.position.set(
        Math.cos(angle) * (descriptor.size + 0.3),
        0.06,
        Math.sin(angle) * (descriptor.size + 0.3),
      );
      moon.userData.entityId = id;
      body.add(moon);
    });

    if (descriptor.ringSegments.length > 0) {
      const ringGeometry = new THREE.BoxGeometry(0.1, 0.035, 0.18);
      descriptor.ringSegments.forEach((active, index) => {
        const angle = (index / descriptor.ringSegments.length) * Math.PI * 2;
        const fragment = new THREE.Mesh(
          ringGeometry.clone(),
          new THREE.MeshBasicMaterial({
            color: colorFromHue(descriptor.hue + 50, active ? 0.76 : 0.32),
          }),
        );
        fragment.position.set(
          Math.cos(angle) * (descriptor.size + 0.22),
          0,
          Math.sin(angle) * (descriptor.size + 0.22),
        );
        fragment.rotation.y = -angle;
        body.add(fragment);
      });
    }

    return {
      group,
      body,
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

  private readonly handlePointer = (event: PointerEvent): void => {
    if (!this.canvas || !this.camera || !this.scene) return;
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster
      .intersectObjects(this.scene.children, true)
      .find((intersection) => intersection.object.userData.entityId);
    this.options.onInteraction?.({
      type: "select",
      entityId: (hit?.object.userData.entityId as string | undefined) ?? null,
    });
  };

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
      const phase = orbitPhaseAtTick(
        runtime.descriptor.phase,
        ticks,
        runtime.descriptor.loopBars,
      );
      const angle = phase * Math.PI * 2;
      runtime.body.position.set(
        Math.cos(angle) * runtime.descriptor.orbitRadius,
        Math.sin(angle * 2) * runtime.descriptor.inclination,
        Math.sin(angle) * runtime.descriptor.orbitRadius,
      );
      const pulsing = (this.pulseExpiry.get(id) ?? 0) > now;
      const selectedScale = id === this.selectedId ? 1.08 : 1;
      runtime.body.scale.setScalar(
        pulsing && !this.preferences.reducedFlash
          ? selectedScale * 1.16
          : selectedScale,
      );
    }
    if (this.star && !this.preferences.reducedMotion) {
      this.star.rotation.y = ticks / 2600;
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };
}
