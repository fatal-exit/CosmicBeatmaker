import type {
  AsteroidBeltState,
  PatternEvent,
  PatternState,
} from "../composition/types";
import { createSeededRandom, deriveSeed } from "../generation/prng";

export const ASTEROID_ACCENT_VELOCITY_BOOST = 0.18;

type AsteroidPerformanceSource = Pick<
  AsteroidBeltState,
  "id" | "gridSize" | "events" | "turbulence" | "accentChance"
>;

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function shouldAccentEvent(
  compositionSeed: string,
  beltId: string,
  eventId: string,
  accentChance: number,
): boolean {
  if (accentChance <= 0) return false;
  if (accentChance >= 1) return true;
  return createSeededRandom(
    deriveSeed(compositionSeed, "asteroid-accent", beltId, eventId),
  ).chance(accentChance);
}

function projectEventVelocity(
  event: PatternEvent,
  accented: boolean,
): PatternEvent {
  if (!accented) return { ...event };
  return {
    ...event,
    velocity: Math.min(
      1,
      clamp01(event.velocity) + ASTEROID_ACCENT_VELOCITY_BOOST,
    ),
  };
}

/**
 * Derives the belt's audible/visible performance pattern without changing its
 * canonical events. Accent decisions are stable per composition, belt, and
 * event, so event order and render timing cannot affect them.
 */
export function deriveAsteroidPerformancePattern(
  compositionSeed: string,
  belt: AsteroidPerformanceSource,
): PatternState {
  const accentChance = clamp01(belt.accentChance);
  return {
    gridSize: belt.gridSize,
    humanize: belt.turbulence,
    events: belt.events.map((event) =>
      projectEventVelocity(
        event,
        shouldAccentEvent(compositionSeed, belt.id, event.id, accentChance),
      ),
    ),
  };
}
