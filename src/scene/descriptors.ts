import type { Composition } from "../domain/composition";
import type { SceneDescriptor } from "./contracts";

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

export function compositionToSceneDescriptor(
  composition: Composition,
): SceneDescriptor {
  return {
    star: {
      id: composition.star.id,
      hue: STAR_HUES[composition.star.presetId],
      intensity: composition.star.intensity,
      presetId: composition.star.presetId,
    },
    planets: composition.planets.map((planet) => ({
      id: planet.id,
      role: planet.role,
      orbitRadius: 2.2 + planet.orbit.shellIndex * 1.25,
      loopBars: planet.orbit.loopBars,
      phase: planet.orbit.phase,
      inclination: planet.orbit.inclination,
      size: 0.32 + planet.appearance.size * 0.14,
      hue: Number.isFinite(planet.appearance.hue)
        ? planet.appearance.hue
        : ROLE_HUES[planet.role],
      muted: planet.muted,
      soloed: planet.soloed,
      locked: planet.locked,
      events: planet.pattern.events.map((event) => ({
        eventId: event.id,
        step: event.step,
        phase: normalizePhase(
          event.step / planet.pattern.gridSize + planet.orbit.phase,
        ),
      })),
      moons: planet.moons.map((moon) => ({
        id: moon.id,
        selectionTargetId: planet.id,
        phase: normalizePhase(planet.orbit.phase + moon.phase),
        events: moon.pattern.events.map((event) => ({
          eventId: event.id,
          step: event.step,
          phase: normalizePhase(
            event.step / moon.pattern.gridSize +
              planet.orbit.phase +
              moon.phase,
          ),
        })),
      })),
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
    })),
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
