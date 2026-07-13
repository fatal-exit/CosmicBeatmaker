import type { Composition, PatternState } from "../domain/composition";
import { derivePlanetOrbitLanes } from "../domain/composition/orbitLanes";
import { derivePerformancePattern } from "../domain/rhythm";
import type { SceneDescriptor } from "./contracts";
import { gatePhaseForTrigger } from "./gates";

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

const MIN_ORBIT_RADIUS = 2.2;
const ORBIT_RADIUS_STEP = 1.08;
const MAX_VISUAL_ORBIT_LANE_INDEX = 7;

/** Each of the eight supported planets can occupy its own visual orbit lane. */
export function orbitRadiusForShellIndex(shellIndex: number): number {
  const boundedIndex = Math.min(
    MAX_VISUAL_ORBIT_LANE_INDEX,
    Math.max(0, Number.isFinite(shellIndex) ? Math.round(shellIndex) : 0),
  );
  return MIN_ORBIT_RADIUS + boundedIndex * ORBIT_RADIUS_STEP;
}

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
  return {
    star: {
      id: composition.star.id,
      hue: STAR_HUES[composition.star.presetId],
      intensity: composition.star.intensity,
      presetId: composition.star.presetId,
      visualSeed: composition.star.visualSeed,
    },
    planets: composition.planets.map((planet) => {
      const performancePattern = derivePerformancePattern(
        planet.pattern,
        planet.role,
        planet.id,
        composition.macros,
      );
      return {
        id: planet.id,
        role: planet.role,
        orbitRadius: orbitRadiusForShellIndex(orbitLanes.get(planet.id) ?? 0),
        loopBars: planet.orbit.loopBars,
        phase: planet.orbit.phase,
        inclination: planet.orbit.inclination,
        size: 0.28 + planet.appearance.size * 0.11,
        hue: Number.isFinite(planet.appearance.hue)
          ? planet.appearance.hue
          : ROLE_HUES[planet.role],
        visualSeed: planet.appearance.visualSeed,
        roughness: planet.appearance.roughness,
        muted: planet.muted,
        soloed: planet.soloed,
        locked: planet.locked,
        events: describePatternEvents(
          performancePattern,
          planet.orbit.phase,
          planet.orbit.phase,
        ),
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
