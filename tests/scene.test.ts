import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
import {
  classifyPlanetDrag,
  disposeObject,
  phaseFromTangentialDrag,
  quantizeLoopBarsFromRadialDrag,
} from "../src/scene/SceneController";
import { compositionToSceneDescriptor } from "../src/scene/descriptors";
import { orbitPhaseAtTick } from "../src/scene/phase";
import { resolveQualityProfile } from "../src/scene/quality";
import { planSceneReconciliation } from "../src/scene/reconcile";

describe("scene contracts", () => {
  it("derives orbit phase from authoritative ticks", () => {
    expect(orbitPhaseAtTick(0, 384, 1)).toBe(0.5);
    expect(orbitPhaseAtTick(0.75, 384, 1)).toBe(0.25);
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
    composition.planets[0].orbit.phase = 0.875;
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

    expect(descriptor.planets[0].events).toEqual(
      composition.planets[0].pattern.events.map((event) => ({
        eventId: event.id,
        step: event.step,
        phase: (event.step / 16 + 0.875) % 1,
      })),
    );
    expect(descriptor.planets[0].moons[0]).toMatchObject({
      id: "moon-one",
      selectionTargetId: composition.planets[0].id,
      phase: 0.125,
      events: [{ eventId: "moon-event", step: 2, phase: 0.375 }],
    });
    expect(descriptor.planets[0].ringSegments[0]).toEqual({
      eventId: "ring-one:segment:0",
      active: true,
      phase: 0,
    });
  });

  it("locks drag direction after the movement threshold and quantizes shells", () => {
    expect(classifyPlanetDrag(4, 2, 1, 0)).toBeNull();
    expect(classifyPlanetDrag(12, 3, 1, 0)).toBe("radial");
    expect(classifyPlanetDrag(2, 12, 1, 0)).toBe("tangential");
    expect(quantizeLoopBarsFromRadialDrag(1, 50)).toBe(2);
    expect(quantizeLoopBarsFromRadialDrag(1, -50)).toBe(0.5);
    expect(quantizeLoopBarsFromRadialDrag(2, 500)).toBe(4);
  });

  it("turns tangential pointer angle into a wrapped normalized phase", () => {
    expect(phaseFromTangentialDrag(0.95, 0, Math.PI / 2)).toBeCloseTo(0.2);
    expect(phaseFromTangentialDrag(0.05, 0, -Math.PI / 2)).toBeCloseTo(0.8);
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
  });
});
