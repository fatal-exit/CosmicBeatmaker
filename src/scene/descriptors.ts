import type { Composition, PatternState } from "../domain/composition";
import { getPlanetStarAffinity } from "../domain/composition/starSystems";
import { derivePlanetOrbitLanes } from "../domain/composition/orbitLanes";
import {
  deriveAsteroidPerformancePattern,
  derivePerformancePattern,
  deriveRingPattern,
  gateStepEmphasis,
  projectCelestialRhythm,
  projectMoonBehavior,
} from "../domain/rhythm";
import { applyPlanetExpression } from "../domain/harmony/expression";
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
  "black-hole": 286,
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

function describeMoonPatternEvents(
  pattern: PatternState,
  triggerOffset: number,
  orbitPhase: number,
) {
  const velocities = new Map(
    pattern.events.map((event) => [event.id, event.velocity]),
  );
  return describePatternEvents(pattern, triggerOffset, orbitPhase).map(
    (event) => ({
      ...event,
      velocity: velocities.get(event.eventId) ?? 0,
    }),
  );
}

function projectedStarForAffinity(
  composition: Composition,
  affinity: ReturnType<typeof getPlanetStarAffinity>,
): Parameters<typeof projectCelestialRhythm>[1] {
  // The primary mood owns the global Black Hole projection. Affinity selects
  // only whether the binary relationship follows; swapping in the companion's
  // ordinary preset here would incorrectly skip the half-speed transform.
  void affinity;
  return composition.star;
}

function describeGateSlots(pattern: PatternState, orbitPhase: number) {
  return Array.from({ length: pattern.gridSize }, (_, step) => {
    const events = pattern.events.filter((event) => event.step === step);
    const pitchEvent = events.find(
      (event) => event.pitch?.kind === "scaleDegree",
    );
    const triggerPhase = normalizePhase(step / pattern.gridSize + orbitPhase);
    return {
      step,
      gatePhase: gatePhaseForTrigger(triggerPhase, orbitPhase),
      active: events.length > 0,
      emphasis: gateStepEmphasis(pattern.gridSize, step),
      pitchEventId: pitchEvent?.id,
    };
  });
}

export function compositionToSceneDescriptor(
  composition: Composition,
): SceneDescriptor {
  const orbitLanes = derivePlanetOrbitLanes(composition.planets);
  const preparedPlanets = composition.planets.map((planet, planetIndex) => {
    const affinity = getPlanetStarAffinity(composition, planetIndex);
    const projectedStar = projectedStarForAffinity(composition, affinity);
    const performancePattern = applyPlanetExpression(
      derivePerformancePattern(
        planet.pattern,
        planet.role,
        planet.id,
        composition.macros,
      ),
      planet.expression,
    );
    const projectedPattern = projectCelestialRhythm(
      performancePattern,
      projectedStar,
      affinity,
    );
    const events = describePatternEvents(
      planet.role === "chords" && planet.ring
        ? { ...projectedPattern, events: [] }
        : projectedPattern,
      planet.orbit.phase,
      planet.orbit.phase,
    );
    const visual = planetVisualMetrics(planet.role, planet.appearance.size, {
      hasEvents: events.length > 0,
      hasMoons: planet.moons.length > 0,
      hasRing: planet.ring !== undefined,
    });
    return {
      planet,
      events,
      visual,
      affinity,
      projectedStar,
      performancePattern,
      projectedPattern,
    };
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
      companion: composition.star.companion
        ? {
            id: composition.star.companion.id,
            hue: STAR_HUES[composition.star.companion.presetId],
            intensity: composition.star.companion.intensity,
            presetId: composition.star.companion.presetId,
            rhythmMode: composition.star.companion.rhythmMode,
            visualSeed: composition.star.companion.visualSeed,
          }
        : undefined,
    },
    planets: preparedPlanets.map(
      ({
        planet,
        events,
        visual,
        affinity,
        projectedStar,
        performancePattern,
        projectedPattern,
      }) => {
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
          gateSlots: describeGateSlots(projectedPattern, planet.orbit.phase),
          moons: planet.moons.map((moon) => {
            const moonPerformancePattern = applyPlanetExpression(
              derivePerformancePattern(
                moon.pattern,
                planet.role,
                moon.id,
                composition.macros,
              ),
              planet.expression,
            );
            const moonBehaviorPattern = projectMoonBehavior(
              moonPerformancePattern,
              moon.behaviorPresetId,
              planet.role,
            );
            const projectedMoonPattern = projectCelestialRhythm(
              moonBehaviorPattern,
              projectedStar,
              affinity,
            );
            const moonOrbitPhase = normalizePhase(
              planet.orbit.phase + moon.phase,
            );
            return {
              id: moon.id,
              selectionTargetId: planet.id,
              phase: moonOrbitPhase,
              orbitRatio: moon.orbitRatio,
              events: describeMoonPatternEvents(
                projectedMoonPattern,
                moonOrbitPhase,
                moonOrbitPhase,
              ),
            };
          }),
          ringSegments: (() => {
            if (!planet.ring) return [];
            // Derive the role-aware ring source from the macro/expression
            // projection, then apply the shared celestial projector exactly
            // once, matching the audio compiler.
            const derivedRing = deriveRingPattern(
              planet,
              performancePattern,
              planet.ring,
            );
            const projectedRing = projectCelestialRhythm(
              derivedRing,
              projectedStar,
              affinity,
            );
            const projectedEvents = new Map(
              describePatternEvents(
                projectedRing,
                normalizePhase(planet.orbit.phase + planet.ring.phase),
                planet.orbit.phase,
              ).map((event) => [event.eventId, event]),
            );
            return planet.ring.active.map((active, index) => {
              const eventId = `${planet.ring!.id}:segment:${index}`;
              const projectedEvent = projectedEvents.get(eventId);
              return {
                sourceEntityId: planet.ring!.id,
                eventId,
                // An event omitted by a Black Hole half-speed projection is no
                // longer an audible cause and therefore should not glow.
                active: active && projectedEvent !== undefined,
                phase:
                  projectedEvent?.phase ??
                  normalizePhase(
                    index / planet.ring!.segments +
                      planet.orbit.phase +
                      planet.ring!.phase,
                  ),
              };
            });
          })(),
        };
      },
    ),
    asteroidBelt: composition.asteroidBelt
      ? {
          id: composition.asteroidBelt.id,
          count: Math.max(
            12,
            Math.min(
              128,
              Math.round(18 + composition.asteroidBelt.population * 54),
            ),
          ),
          population: composition.asteroidBelt.population,
          clustering: composition.asteroidBelt.clustering,
          turbulence: composition.asteroidBelt.turbulence,
          materialPresetId: composition.asteroidBelt.materialPresetId,
          visualSeed: composition.asteroidBelt.visualSeed,
          events: (() => {
            const belt = composition.asteroidBelt;
            if (!belt) return [];
            const projectedBelt = projectCelestialRhythm(
              deriveAsteroidPerformancePattern(composition.seed, belt),
              projectedStarForAffinity(composition, "primary"),
              "primary",
            );
            return projectedBelt.events.map((event) => ({
              eventId: event.id,
              step: event.step,
              phase: normalizePhase(event.step / projectedBelt.gridSize),
              velocity: event.velocity,
            }));
          })(),
        }
      : undefined,
  };
}
