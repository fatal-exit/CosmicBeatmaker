import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  generateCompleteSystem,
  generateBinaryCompanionForComposition,
} from "../src/domain/generation";
import { getPlanetStarAffinity } from "../src/domain/composition/starSystems";
import { applyPlanetExpression } from "../src/domain/harmony/expression";
import { derivePerformancePattern } from "../src/domain/rhythm/performanceMacros";
import { projectCelestialRhythm } from "../src/domain/rhythm/celestialTransforms";
import { compositionToSceneDescriptor } from "../src/scene/descriptors";
import type { SceneDescriptor } from "../src/scene/contracts";
import {
  asteroidInstanceCountForQuality,
  binaryBodyOffsetsAtTick,
  SceneController,
} from "../src/scene/SceneController";
import { createBlackHoleModel } from "../src/scene/materials/blackHoleMaterial";

describe("stellar scene projections", () => {
  it("describes black-hole, binary, and projected belt causes deterministically", () => {
    const composition = generateCompleteSystem("scene-black-hole", {
      starPresetId: "black-hole",
      binaryCompanion: { presetId: "void", rhythmMode: "mirror" },
    });
    const first = compositionToSceneDescriptor(composition);
    const second = compositionToSceneDescriptor(composition);

    expect(first).toEqual(second);
    expect(first.star.presetId).toBe("black-hole");
    expect(first.star.companion).toMatchObject({
      presetId: "void",
      rhythmMode: "mirror",
    });
    expect(first.asteroidBelt?.events.length).toBeGreaterThan(0);
    expect(
      first.planets.every((planet) =>
        planet.events.every(
          (event) =>
            event.eventId.length > 0 && event.phase >= 0 && event.phase < 1,
        ),
      ),
    ).toBe(true);
    expect(
      new Set(
        composition.planets.map((_, index) =>
          getPlanetStarAffinity(composition, index),
        ),
      ),
    ).toEqual(new Set(["primary", "companion"]));

    const sourcePlanet = composition.planets[0];
    const affinity = getPlanetStarAffinity(composition, 0);
    const sourcePattern = applyPlanetExpression(
      derivePerformancePattern(
        sourcePlanet.pattern,
        sourcePlanet.role,
        sourcePlanet.id,
        composition.macros,
      ),
      sourcePlanet.expression,
    );
    const projected = projectCelestialRhythm(
      sourcePattern,
      composition.star,
      affinity,
    );
    expect(
      first.planets[0].events.map(({ eventId, step, phase }) => ({
        eventId,
        step,
        phase,
      })),
    ).toEqual(
      projected.events.map((event) => ({
        eventId: event.id,
        step: event.step,
        phase:
          (((event.step / projected.gridSize + sourcePlanet.orbit.phase) % 1) +
            1) %
          1,
      })),
    );
  });

  it("keeps binary barycenter motion deterministic and reduced motion frozen", () => {
    expect(binaryBodyOffsetsAtTick(0)).toEqual(binaryBodyOffsetsAtTick(0));
    expect(binaryBodyOffsetsAtTick(384)).not.toEqual(
      binaryBodyOffsetsAtTick(0),
    );
    expect(binaryBodyOffsetsAtTick(384, 1.2, true)).toEqual(
      binaryBodyOffsetsAtTick(0, 1.2, true),
    );
  });

  it("keeps a scaled Black Hole binary pair physically separated", () => {
    const composition = generateCompleteSystem("scene-spacious-binary", {
      starPresetId: "black-hole",
      binaryCompanion: { presetId: "void", rhythmMode: "interlock" },
    });
    const descriptor = compositionToSceneDescriptor(composition);
    const controller = new SceneController({ readTransportTicks: () => 0 });
    const internals = controller as unknown as {
      scene: THREE.Scene;
      descriptor: SceneDescriptor;
      qualityProfile: "low" | "balanced" | "high";
      preferences: {
        quality: "auto" | "low" | "balanced" | "high";
        reducedMotion: boolean;
        reducedParticles: boolean;
        reducedFlash: boolean;
      };
      star: {
        primaryAnchor: THREE.Group;
        companionAnchor: THREE.Group;
        blackHoleModel: { group: THREE.Group };
      } | null;
      reconcileStar: (next: SceneDescriptor) => void;
    };
    internals.scene = new THREE.Scene();
    internals.descriptor = descriptor;
    internals.qualityProfile = "balanced";
    internals.preferences = {
      quality: "balanced",
      reducedMotion: false,
      reducedParticles: false,
      reducedFlash: false,
    };

    internals.reconcileStar(descriptor);
    const runtime = internals.star!;
    const centerDistance = runtime.primaryAnchor.position.distanceTo(
      runtime.companionAnchor.position,
    );
    const diskRadius =
      1.76 *
      runtime.blackHoleModel.group.scale.x *
      runtime.primaryAnchor.scale.x;
    const companionRadius = 0.78 * runtime.companionAnchor.scale.x;

    expect(runtime.primaryAnchor.scale.x).toBeLessThan(0.75);
    expect(runtime.companionAnchor.scale.x).toBeLessThan(0.75);
    expect(centerDistance).toBeGreaterThan(2.1);
    expect(centerDistance).toBeGreaterThan(diskRadius + companionRadius + 0.2);
  });

  it("contains a readable horizon, photon ring, disk, and restrained lensing arc", () => {
    const model = createBlackHoleModel(
      {
        id: "black-hole",
        presetId: "black-hole",
        visualSeed: 44,
        intensity: 0.8,
      },
      0.5,
    );
    expect(model.group.children.map((child) => child.name)).toEqual([
      "accretion-disk",
      "lensing-arc",
      "photon-ring",
      "event-horizon",
    ]);
    expect(model.eventHorizon.material.uniforms.uColor.value).toBeInstanceOf(
      THREE.Color,
    );
    expect(model.photonRing.material.uniforms.uPulse.value).toBe(0);
    model.update({ time: 192, pulse: 1, reducedFlash: true });
    expect(model.accretionDisk.material.uniforms.uTick.value).toBe(192);
    expect(model.accretionDisk.material.uniforms.uReducedFlash.value).toBe(1);
    model.dispose();
  });

  it("retains one stellar aggregate and exposes companion reconciliation as one update", () => {
    const composition = generateCompleteSystem("scene-binary", {
      binaryCompanion: { presetId: "dwarf", rhythmMode: "interlock" },
    });
    const descriptor = compositionToSceneDescriptor(composition);
    type BinarySceneDescriptor = SceneDescriptor;
    const controller = new SceneController({ readTransportTicks: () => 0 });
    const internals = controller as unknown as {
      scene: THREE.Scene;
      descriptor: BinarySceneDescriptor;
      qualityProfile: "low" | "balanced" | "high";
      preferences: {
        quality: "auto" | "low" | "balanced" | "high";
        reducedMotion: boolean;
        reducedParticles: boolean;
        reducedFlash: boolean;
      };
      star: { group: THREE.Group } | null;
      reconcileStar: (descriptor: BinarySceneDescriptor) => void;
    };
    internals.scene = new THREE.Scene();
    internals.descriptor = descriptor;
    internals.qualityProfile = "balanced";
    internals.preferences = {
      quality: "balanced",
      reducedMotion: false,
      reducedParticles: false,
      reducedFlash: false,
    };
    internals.reconcileStar(descriptor);
    const aggregate = internals.star?.group;
    expect(aggregate?.name).toBe("stellar-aggregate");
    expect(
      aggregate?.children.filter((child) => child.name.includes("star-anchor")),
    ).toHaveLength(2);
    const stellarBodies: THREE.Object3D[] = [];
    aggregate?.traverse((child) => {
      if (child.userData.stellarBody) stellarBodies.push(child);
    });
    expect(stellarBodies).toHaveLength(2);
    const companion = generateBinaryCompanionForComposition(composition, {
      presetId: "radiant",
      rhythmMode: "call-response",
    });
    const next = compositionToSceneDescriptor({
      ...composition,
      star: { ...composition.star, companion },
    });
    internals.reconcileStar(next);
    expect(internals.star?.group.name).toBe("stellar-aggregate");
    expect(
      internals.scene.children.filter(
        (child) => child.name === "stellar-aggregate",
      ),
    ).toHaveLength(1);
  });

  it("bounds deterministic asteroid instances and keeps projected phases as cluster centers", () => {
    const composition = generateCompleteSystem("scene-belt", {
      starPresetId: "black-hole",
    });
    const descriptor = compositionToSceneDescriptor(composition);
    const belt = {
      ...descriptor.asteroidBelt!,
      clustering: 1,
      turbulence: 0,
    };
    const nextDescriptor = { ...descriptor, asteroidBelt: belt };
    const controller = new SceneController({ readTransportTicks: () => 0 });
    const internals = controller as unknown as {
      scene: THREE.Scene;
      descriptor: typeof nextDescriptor;
      qualityProfile: "low" | "balanced" | "high";
      preferences: {
        quality: "auto" | "low" | "balanced" | "high";
        reducedMotion: boolean;
        reducedParticles: boolean;
        reducedFlash: boolean;
      };
      asteroidBelt: THREE.InstancedMesh | null;
      reconcileAsteroids: (descriptor: typeof nextDescriptor) => void;
      eventPulseWindows: Map<string, unknown[]>;
    };
    internals.scene = new THREE.Scene();
    internals.descriptor = nextDescriptor;
    internals.qualityProfile = "high";
    internals.preferences = {
      quality: "high",
      reducedMotion: false,
      reducedParticles: false,
      reducedFlash: false,
    };
    internals.reconcileAsteroids(nextDescriptor);
    const firstBelt = internals.asteroidBelt!;
    const firstMatrices = firstBelt.instanceMatrix.array.slice();
    expect(firstBelt.count).toBeLessThanOrEqual(belt.count);
    expect(
      asteroidInstanceCountForQuality(belt.count, "low", false),
    ).toBeLessThan(asteroidInstanceCountForQuality(belt.count, "high", false));
    expect(
      asteroidInstanceCountForQuality(belt.count, "high", true),
    ).toBeLessThan(asteroidInstanceCountForQuality(belt.count, "high", false));

    const eventPhases = firstBelt.userData.eventPhases as number[];
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let index = 0; index < firstBelt.count; index += 1) {
      matrix.fromArray(firstBelt.instanceMatrix.array, index * 16);
      position.setFromMatrixPosition(matrix);
      const phase =
        (Math.atan2(position.z, position.x) / (Math.PI * 2) + 1) % 1;
      expect(Math.abs(phase - eventPhases[index])).toBeLessThan(0.0001);
    }
    internals.reconcileAsteroids(nextDescriptor);
    expect(Array.from(internals.asteroidBelt!.instanceMatrix.array)).toEqual(
      Array.from(firstMatrices),
    );
    controller.setPlaybackActive(true);
    controller.enqueuePulse({
      occurrenceId: "asteroid-occurrence",
      entityId: belt.id,
      eventId: belt.events[0].eventId,
      scheduledTick: 0,
      scheduledAudioTime: 0,
      velocity: belt.events[0].velocity,
    });
    expect(internals.eventPulseWindows.has(belt.events[0].eventId)).toBe(true);
  });
});
