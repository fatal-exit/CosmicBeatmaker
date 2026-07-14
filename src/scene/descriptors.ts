import type { Composition, PatternState } from "../domain/composition";
import { derivePlanetOrbitLanes } from "../domain/composition/orbitLanes";
import { derivePerformancePattern } from "../domain/rhythm";
import type { SceneDescriptor } from "./contracts";
import { gatePhaseForTrigger } from "./gates";
import {
  deriveSizeAwareOrbitRadii,
  planetVisualMetrics,
} from "./planetVisuals";

const ROLE_HUES = {
  beat: 31,
  bass: 195,
  chords: 92,
  melody: 325,
  texture: 245,
} as const;

const STAR_HUES = {
  radiant: 43,
  "red-giant": 26,
  dwarf: 190,
  neutron: 320,
  void: 260,
} as const;

function normalizePhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

function describePatternEvents(
  pattern: PatternState,
  triggerOffset: number,
  orbitPhase: number,
) {
  return pattern.events.map((event) => {
    const phase = normalizePhase(event.step / pattern.gridSize + triggerOffset);
    return {
      eventId: event.id,
      step: event.step,
      phase,
      gatePhase: gatePhaseForTrigger(phase, orbitPhase),
    };
  });
}

export function compositionToSceneDescriptor(
  composition: Composition,
): SceneDescriptor {
  const orbitLanes = derivePlanetOrbitLanes(composition.planets);
  const preparedPlanets = composition.planets.map((planet) => {
    const performancePattern = derivePerformancePattern(
      planet.pattern,
      planet.role,
      planet.id,
      composition.macros,
    );
    const events = describePatternEvents(
      planet.role === "chords" && planet.ring
        ? { ...performancePattern, events: [] }
        : performancePattern,
      planet.orbit.phase,
      planet.orbit.phase,
    );
    const visual = planetVisualMetrics(planet.role, planet.appearance.size, {
      hasEvents: events.length > 0,
      hasMoons: planet.moons.length > 0,
      hasRing: planet.ring !== undefined,
    });
    return { planet, events, visual };
  });
  const orbitRadii = deriveSizeAwareOrbitRadii(
    preparedPlanets.map(({ planet, visual }) => ({
      id: planet.id,
      laneIndex: orbitLanes.get(planet.id) ?? 0,
      visualExtent: visual.visualExtent,
    })),
  );

  return {
    star: {
      id: composition.star.id,
      hue: STAR_HUES[composition.star.presetId],
      intensity: composition.star.intensity,
      presetId: composition.star.presetId,
      visualSeed: composition.star.visualSeed,
    },
    planets: preparedPlanets.map(({ planet, events, visual }) => {
      return {
        id: planet.id,
        role: planet.role,
        visualKind: visual.kind,
        orbitRadius: orbitRadii.get(planet.id) ?? 0,
        loopBars: planet.orbit.loopBars,
        phase: planet.orbit.phase,
        inclination: planet.orbit.inclination,
        size: visual.bodyRadius,
        bodyScale: visual.bodyScale,
        bodyExtent: visual.bodyExtent,
        visualExtent: visual.visualExtent,
        gateRadius: visual.gateRadius,
        moonOrbitRadius: visual.moonOrbitRadius,
        ringVisual: visual.ring,
        hue: Number.isFinite(planet.appearance.hue)
          ? planet.appearance.hue
          : ROLE_HUES[planet.role],
        visualSeed: planet.appearance.visualSeed,
        roughness: planet.appearance.roughness,
        muted: planet.muted,
        soloed: planet.soloed,
        locked: planet.locked,
        events,
        moons: planet.moons.map((moon) => {
          const moonPerformancePattern = derivePerformancePattern(
            moon.pattern,
            planet.role,
            moon.id,
            composition.macros,
          );
          const moonOrbitPhase = normalizePhase(
            planet.orbit.phase + moon.phase,
          );
          return {
            id: moon.id,
            selectionTargetId: planet.id,
            phase: moonOrbitPhase,
            orbitRatio: moon.orbitRatio,
            events: describePatternEvents(
              moonPerformancePattern,
              moonOrbitPhase,
              moonOrbitPhase,
            ),
          };
        }),
        ringSegments: planet.ring
          ? planet.ring.active.map((active, index) => ({
              sourceEntityId: planet.ring!.id,
              eventId: `${planet.ring?.id}:segment:${index}`,
              active,
              phase: normalizePhase(
                index / planet.ring!.segments +
                  planet.orbit.phase +
                  planet.ring!.phase,
              ),
            }))
          : [],
      };
    }),
    asteroidBelt: composition.asteroidBelt
      ? {
          id: composition.asteroidBelt.id,
          count: Math.max(
            12,
            Math.round(18 + composition.asteroidBelt.population * 54),
          ),
          visualSeed: composition.asteroidBelt.visualSeed,
        }
      : undefined,
  };
}
