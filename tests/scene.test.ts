import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { compileComposition } from "../src/audio/CompositionCompiler";
import {
  LOOP_BAR_RATES,
  createStarterComposition,
  derivePlanetOrbitLanes,
  type LoopBars,
} from "../src/domain/composition";
import { generateCompleteSystem } from "../src/domain/generation";
import {
  PLANET_MATERIAL_PROFILES,
  STAR_MATERIAL_PROFILES,
  normalizeVisualSeed,
} from "../src/scene/materials/profiles";
import {
  SCENE_CAMERA_ZOOM_MAX,
  SCENE_CAMERA_ZOOM_MIN,
  SceneController,
  cameraDistanceForView,
  classifyPlanetDrag,
  clampSceneZoom,
  disposeObject,
  highlightedSpawnId,
  moonOrbitPhaseAtTick,
  normalizeSceneRotation,
  phaseFromTangentialDrag,
  pulseDelayMsFromTicks,
  quantizeLoopBarsFromRadialDrag,
  sceneRotationFromDrag,
  sceneZoomFromPinch,
  sceneZoomFromWheel,
} from "../src/scene/SceneController";
import {
  compositionToSceneDescriptor,
  orbitRadiusForShellIndex,
} from "../src/scene/descriptors";
import {
  deletedPlanetId,
  planetDestructionEffectProfile,
} from "../src/scene/effects/planetDestruction";
import { gatePhaseForTrigger, spawnPhaseAtTick } from "../src/scene/gates";
import { orbitPhaseAtTick } from "../src/scene/phase";
import {
  QUALITY_GLOW_STRENGTH,
  QUALITY_SHADER_DETAIL,
  resolveQualityProfile,
} from "../src/scene/quality";
import { planSceneReconciliation } from "../src/scene/reconcile";

describe("scene contracts", () => {
  it("defines stable visual material identities for every celestial type", () => {
    expect(Object.keys(PLANET_MATERIAL_PROFILES)).toEqual([
      "beat",
      "bass",
      "chords",
      "melody",
      "texture",
    ]);
    expect(Object.keys(STAR_MATERIAL_PROFILES)).toEqual([
      "radiant",
      "red-giant",
      "dwarf",
      "neutron",
      "void",
    ]);
    expect(STAR_MATERIAL_PROFILES.neutron.glowStrength).toBeGreaterThan(
      STAR_MATERIAL_PROFILES.void.glowStrength,
    );
    expect(normalizeVisualSeed(65_522)).toBeCloseTo(1 / 65_521);
    expect(normalizeVisualSeed(-1)).toBeCloseTo(65_520 / 65_521);
  });

  it("derives orbit phase from authoritative ticks", () => {
    expect(orbitPhaseAtTick(0, 384, 1)).toBe(0.5);
    expect(orbitPhaseAtTick(0.75, 384, 1)).toBe(0.25);
  });

  it("aligns gates with a planet at the scheduled audio phase", () => {
    const orbitPhase = 0.25;
    const triggerPhase = 3 / 16 + orbitPhase;

    expect(gatePhaseForTrigger(triggerPhase, orbitPhase)).toBeCloseTo(0.6875);
    expect(
      spawnPhaseAtTick(orbitPhase, triggerPhase * 4 * 4 * 480, 4),
    ).toBeCloseTo(gatePhaseForTrigger(triggerPhase, orbitPhase));
  });

  it("joins a newly spawned planet to the shared transport position", () => {
    expect(spawnPhaseAtTick(0.125, 2_400, 4)).toBeCloseTo(0.4375);
    expect(spawnPhaseAtTick(0.125, 10_080, 4)).toBeCloseTo(0.4375);
  });

  it("highlights only one genuinely added planet, not initial or replaced systems", () => {
    expect(highlightedSpawnId(new Set(), new Set(["a"]), true)).toBeNull();
    expect(highlightedSpawnId(new Set(["a"]), new Set(["a", "b"]), false)).toBe(
      "b",
    );
    expect(
      highlightedSpawnId(new Set(["a"]), new Set(["b", "c"]), false),
    ).toBeNull();
  });

  it("detects one explicit planet deletion without treating system replacement as destruction", () => {
    expect(deletedPlanetId(new Set(["a", "b"]), new Set(["a"]), false)).toBe(
      "b",
    );
    expect(deletedPlanetId(new Set(["a"]), new Set(), true)).toBeNull();
    expect(
      deletedPlanetId(new Set(["a", "b"]), new Set(["c"]), false),
    ).toBeNull();
  });

  it("bounds destruction spectacle by quality and comfort preferences", () => {
    expect(
      planetDestructionEffectProfile("low", {
        reducedMotion: false,
        reducedParticles: false,
        reducedFlash: false,
      }),
    ).toMatchObject({
      durationMs: 480,
      fragmentCount: 6,
      flashOpacity: 0.9,
    });
    expect(
      planetDestructionEffectProfile("high", {
        reducedMotion: false,
        reducedParticles: false,
        reducedFlash: false,
      }).fragmentCount,
    ).toBe(18);
    expect(
      planetDestructionEffectProfile("high", {
        reducedMotion: true,
        reducedParticles: true,
        reducedFlash: true,
      }),
    ).toMatchObject({
      durationMs: 180,
      fragmentCount: 0,
      flashOpacity: 0.14,
      shockwaveOpacity: 0.42,
      shockwaveExpansion: 1.05,
    });
  });

  it("delays visual pulses until their authoritative scheduled tick", () => {
    expect(pulseDelayMsFromTicks(960, 720, 120)).toBeCloseTo(250);
    expect(pulseDelayMsFromTicks(720, 960, 120)).toBe(0);
    expect(pulseDelayMsFromTicks(960, 720, 0)).toBe(0);
  });

  it("creates stable descriptors and idempotent plans", () => {
    const descriptor = compositionToSceneDescriptor(
      createStarterComposition("scene"),
    );
    expect(planSceneReconciliation(null, descriptor).add).toHaveLength(2);
    expect(planSceneReconciliation(descriptor, descriptor)).toEqual({
      add: [],
      update: [],
      remove: [],
    });
  });

  it("describes exact pattern nodes by stable event ID, step, and phase", () => {
    const composition = createStarterComposition("scene-events");
    composition.swing = 0;
    composition.planets[0].orbit.phase = 0.875;
    composition.planets[0].orbit.loopBars = 4;
    composition.planets[0].orbit.shellIndex = 3;
    composition.planets[0].moons = [
      {
        id: "moon-one",
        behaviorPresetId: "accent",
        pattern: {
          gridSize: 8,
          humanize: 0,
          events: [
            {
              id: "moon-event",
              step: 2,
              velocity: 0.7,
              probability: 1,
              durationSteps: 1,
              drumVoice: "rim",
            },
          ],
        },
        orbitRatio: 2,
        phase: 0.25,
        level: 0.4,
        probability: 1,
        appearanceSeed: 4,
        muted: false,
        locked: false,
      },
    ];
    composition.planets[0].ring = {
      id: "ring-one",
      type: "hat",
      segments: 8,
      active: [true, false, true, false, true, false, true, false],
      phase: 0.125,
      velocityVariation: 0,
      probability: 1,
      soundPresetId: "test-hat",
      level: 0.3,
    };
    const descriptor = compositionToSceneDescriptor(composition);

    expect(descriptor.star.visualSeed).toBe(composition.star.visualSeed);
    expect(descriptor.planets[0]).toMatchObject({
      visualSeed: composition.planets[0].appearance.visualSeed,
      roughness: composition.planets[0].appearance.roughness,
    });

    expect(descriptor.planets[0].events).toEqual(
      composition.planets[0].pattern.events.map((event) => ({
        eventId: event.id,
        step: event.step,
        phase: (event.step / 16 + 0.875) % 1,
        gatePhase: (event.step / 16 + 0.75) % 1,
      })),
    );
    expect(descriptor.planets[0].moons[0]).toMatchObject({
      id: "moon-one",
      selectionTargetId: composition.planets[0].id,
      phase: 0.125,
      orbitRatio: 2,
      events: [
        {
          eventId: "moon-event",
          step: 2,
          phase: 0.375,
          gatePhase: 0.5,
        },
      ],
    });
    const firstMoonOccurrence = compileComposition(composition, {
      probabilityMode: "defer",
    }).occurrences.find(
      (occurrence) =>
        occurrence.sourceKind === "moon" && occurrence.eventId === "moon-event",
    );
    expect(firstMoonOccurrence).toBeDefined();
    expect(
      moonOrbitPhaseAtTick(
        descriptor.planets[0].moons[0].phase,
        firstMoonOccurrence!.startTick,
        descriptor.planets[0].loopBars,
        descriptor.planets[0].moons[0].orbitRatio,
      ),
    ).toBeCloseTo(descriptor.planets[0].moons[0].events[0].gatePhase);
    expect(descriptor.planets[0].ringSegments[0]).toEqual({
      eventId: "ring-one:segment:0",
      active: true,
      phase: 0,
    });
  });

  it("renders and targets one distinct parent-selecting gate per moon event", () => {
    const composition = createStarterComposition("moon-render-gates");
    const planet = composition.planets[0];
    planet.orbit.phase = 0.125;
    planet.moons = [
      {
        id: "moon-render",
        behaviorPresetId: "accent",
        pattern: {
          gridSize: 8,
          humanize: 0,
          events: [1, 5].map((step, index) => ({
            id: `moon-render-event-${index}`,
            step,
            velocity: 0.7,
            probability: 1,
            durationSteps: 1,
            drumVoice: "rim" as const,
          })),
        },
        orbitRatio: 2,
        phase: 0.25,
        level: 0.4,
        probability: 1,
        appearanceSeed: 4,
        muted: false,
        locked: false,
      },
    ];
    const planetDescriptor =
      compositionToSceneDescriptor(composition).planets[0];
    const controller = new SceneController({ readTransportTicks: () => 0 });
    type RuntimeProbe = {
      body: THREE.Mesh;
      eventNodes: Map<string, THREE.Mesh>;
      moons: Array<{ body: THREE.Mesh }>;
      dispose: () => void;
    };
    const internals = controller as unknown as {
      createPlanet: (
        descriptor: typeof planetDescriptor,
        highlightSpawn: boolean,
      ) => RuntimeProbe;
      planets: Map<string, RuntimeProbe>;
      eventPulseWindows: Map<string, Array<{ scheduledPhase?: number }>>;
    };
    const runtime = internals.createPlanet(planetDescriptor, false);
    internals.planets.set(planet.id, runtime);
    const firstGate = runtime.eventNodes.get("moon-render-event-0")!;
    const secondGate = runtime.eventNodes.get("moon-render-event-1")!;

    expect(firstGate).not.toBe(secondGate);
    expect(firstGate).not.toBe(runtime.moons[0].body);
    expect(firstGate.parent).toBe(runtime.body);
    expect(firstGate.userData).toMatchObject({
      entityId: planet.id,
      sourceEntityId: "moon-render",
      eventId: "moon-render-event-0",
      moonOrbitGate: true,
      orbitRatio: 2,
    });
    expect(secondGate.userData.entityId).toBe(planet.id);

    const admittedOccurrence = compileComposition(composition, {
      probabilityMode: "defer",
    }).occurrences.find(
      (occurrence) =>
        occurrence.trackId === "moon-render" &&
        occurrence.eventId === "moon-render-event-0",
    )!;
    controller.enqueuePulse({
      occurrenceId: admittedOccurrence.occurrenceId,
      entityId: admittedOccurrence.trackId,
      eventId: admittedOccurrence.eventId,
      scheduledTick: admittedOccurrence.startTick,
      scheduledAudioTime: 1,
      velocity: admittedOccurrence.velocity,
    });
    expect(internals.eventPulseWindows.has("moon-render-event-0")).toBe(true);
    expect(internals.eventPulseWindows.has("moon-render-event-1")).toBe(false);
    expect(
      internals.eventPulseWindows.get("moon-render-event-0")?.[0]
        .scheduledPhase,
    ).toBeCloseTo(
      moonOrbitPhaseAtTick(
        planetDescriptor.moons[0].phase,
        admittedOccurrence.startTick,
        planetDescriptor.loopBars,
        2,
      ),
    );

    const sharedGateGeometry = firstGate.geometry;
    const disposeGeometry = vi.spyOn(sharedGateGeometry, "dispose");
    const disposeFirstMaterial = vi.spyOn(
      firstGate.material as THREE.Material,
      "dispose",
    );
    const disposeSecondMaterial = vi.spyOn(
      secondGate.material as THREE.Material,
      "dispose",
    );
    runtime.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeFirstMaterial).toHaveBeenCalledTimes(1);
    expect(disposeSecondMaterial).toHaveBeenCalledTimes(1);
  });

  it("locks drag direction after the movement threshold and quantizes orbit rates", () => {
    expect(classifyPlanetDrag(4, 2, 1, 0)).toBeNull();
    expect(classifyPlanetDrag(12, 3, 1, 0)).toBe("radial");
    expect(classifyPlanetDrag(2, 12, 1, 0)).toBe("tangential");
    expect(quantizeLoopBarsFromRadialDrag(1, 50)).toBe(1.5);
    expect(quantizeLoopBarsFromRadialDrag(1, -50)).toBe(0.5);
    expect(quantizeLoopBarsFromRadialDrag(2, 500)).toBe(8);
  });

  it("keeps unique visual lanes separate from orbit-rate phase", () => {
    const phases = LOOP_BAR_RATES.map((rate) =>
      spawnPhaseAtTick(0.125, 480, rate),
    );
    expect(new Set(phases).size).toBe(LOOP_BAR_RATES.length);

    const composition = createStarterComposition("unique-orbit-lanes");
    const source = composition.planets[0];
    const rates = [4, 1, 4, 0.25, 3] as const satisfies readonly LoopBars[];
    composition.planets = rates.map((loopBars, index) => ({
      ...structuredClone(source),
      id: `scene-lane-${index}`,
      orbit: {
        ...source.orbit,
        loopBars,
        shellIndex: 3,
      },
      pattern: {
        ...source.pattern,
        events: source.pattern.events.map((event) => ({
          ...event,
          id: `${event.id}-lane-${index}`,
        })),
      },
    }));

    const lanes = derivePlanetOrbitLanes(composition.planets);
    expect([...lanes.entries()]).toEqual([
      ["scene-lane-3", 0],
      ["scene-lane-1", 1],
      ["scene-lane-4", 2],
      ["scene-lane-0", 3],
      ["scene-lane-2", 4],
    ]);

    const descriptors = compositionToSceneDescriptor(composition).planets;
    expect(
      new Set(descriptors.map(({ orbitRadius }) => orbitRadius)).size,
    ).toBe(descriptors.length);
    for (const descriptor of descriptors) {
      expect(descriptor.orbitRadius).toBe(
        orbitRadiusForShellIndex(lanes.get(descriptor.id)!),
      );
    }

    expect(spawnPhaseAtTick(0.125, 7_680, 8)).toBeCloseTo(0.625);
  });

  it("gives every generated starter planet a unique visible orbit radius", () => {
    const descriptors = compositionToSceneDescriptor(
      generateCompleteSystem("unique-starter-orbits"),
    ).planets;

    expect(descriptors).toHaveLength(5);
    expect(
      new Set(descriptors.map(({ orbitRadius }) => orbitRadius)).size,
    ).toBe(descriptors.length);
  });

  it("turns tangential pointer angle into a wrapped normalized phase", () => {
    expect(phaseFromTangentialDrag(0.95, 0, Math.PI / 2)).toBeCloseTo(0.2);
    expect(phaseFromTangentialDrag(0.05, 0, -Math.PI / 2)).toBeCloseTo(0.8);
  });

  it("bounds scene zoom for buttons, wheels, and two-pointer pinches", () => {
    expect(clampSceneZoom(0.1)).toBe(SCENE_CAMERA_ZOOM_MIN);
    expect(clampSceneZoom(4)).toBe(SCENE_CAMERA_ZOOM_MAX);
    expect(sceneZoomFromWheel(1, -120)).toBeGreaterThan(1);
    expect(sceneZoomFromWheel(1, 120)).toBeLessThan(1);
    expect(sceneZoomFromWheel(1, -100_000)).toBe(SCENE_CAMERA_ZOOM_MAX);
    expect(sceneZoomFromPinch(1, 100, 150)).toBe(1.5);
    expect(sceneZoomFromPinch(1, 100, 10)).toBe(SCENE_CAMERA_ZOOM_MIN);
  });

  it("normalizes renderer-only camera rotation from empty-space drags", () => {
    expect(normalizeSceneRotation(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(normalizeSceneRotation(-Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(sceneRotationFromDrag(0, 240)).toBeCloseTo(Math.PI / 2);
    expect(sceneRotationFromDrag(Math.PI * 0.9, 240)).toBeCloseTo(
      -Math.PI * 0.6,
    );
  });

  it("fits the default camera farther away on narrow viewports", () => {
    const desktopDistance = cameraDistanceForView(1.4);
    const phoneDistance = cameraDistanceForView(0.6);

    expect(phoneDistance).toBeGreaterThan(desktopDistance * 1.8);
    expect(cameraDistanceForView(0.6, 1.8)).toBeLessThan(phoneDistance);
    expect(cameraDistanceForView(0.6, 0.6)).toBeGreaterThan(phoneDistance);
  });

  it("disposes shared geometry and material exactly once", () => {
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshBasicMaterial();
    const group = new THREE.Group();
    group.add(
      new THREE.Mesh(geometry, material),
      new THREE.Mesh(geometry, material),
    );
    const disposeGeometry = vi.spyOn(geometry, "dispose");
    const disposeMaterial = vi.spyOn(material, "dispose");

    disposeObject(group);

    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
  });

  it("resolves conservative automatic mobile quality", () => {
    expect(resolveQualityProfile("auto", 390, 3)).toBe("low");
    expect(resolveQualityProfile("auto", 900, 2)).toBe("balanced");
    expect(resolveQualityProfile("high", 390, 3)).toBe("high");
    expect(QUALITY_SHADER_DETAIL.low).toBeLessThan(QUALITY_SHADER_DETAIL.high);
    expect(QUALITY_SHADER_DETAIL.low).toBe(0);
    expect(QUALITY_GLOW_STRENGTH.low).toBeLessThan(QUALITY_GLOW_STRENGTH.high);
  });
});
