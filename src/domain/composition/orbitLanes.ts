import { loopBarRateIndex } from "./loopRates";
import type { PlanetState } from "./types";

/**
 * Derives compact, collision-free visual lanes. Rate order is primary, while
 * existing composition order (then stable ID) keeps same-rate planets stable.
 */
export function derivePlanetOrbitLanes(
  planets: readonly Pick<PlanetState, "id" | "orbit">[],
): ReadonlyMap<string, number> {
  const ordered = planets
    .map((planet, compositionIndex) => ({ planet, compositionIndex }))
    .sort(
      (left, right) =>
        loopBarRateIndex(left.planet.orbit.loopBars) -
          loopBarRateIndex(right.planet.orbit.loopBars) ||
        left.compositionIndex - right.compositionIndex ||
        left.planet.id.localeCompare(right.planet.id),
    );
  return new Map(
    ordered.map(({ planet }, laneIndex) => [planet.id, laneIndex]),
  );
}
