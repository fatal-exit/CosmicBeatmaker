import type {
  BinaryRhythmMode,
  PatternEvent,
  PatternState,
  StarState,
} from "../composition/types";
import type { StarAffinity } from "../composition/starSystems";

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

function sortedEvents(events: readonly PatternEvent[]): PatternEvent[] {
  return [...events].sort(
    (left, right) => left.step - right.step || left.id.localeCompare(right.id),
  );
}

function clonePattern(
  pattern: PatternState,
  events: readonly PatternEvent[],
  clearTemplate = false,
): PatternState {
  const next: PatternState = {
    ...pattern,
    events: events.map((event) => ({ ...event })),
  };
  if (clearTemplate) delete next.templateId;
  return next;
}

/**
 * Projects a black-hole primary's pattern to half-time without changing its
 * serialized loop length. The first half of the source cycle is stretched
 * across the full cycle and template provenance is intentionally discarded.
 */
export function projectBlackHoleHalfSpeedPattern(
  pattern: PatternState,
): PatternState {
  const halfGrid = pattern.gridSize / 2;
  const sourceEvents = sortedEvents(pattern.events).filter(
    (event) => event.step < halfGrid,
  );
  const selectedEvents =
    sourceEvents.length > 0
      ? sourceEvents
      : sortedEvents(pattern.events).slice(0, 1);

  const events = selectedEvents.map((event) => {
    // If a malformed/sparse source has no event in the first half, fold the
    // deterministic earliest event into the first half before stretching it.
    const sourceStep =
      sourceEvents.length > 0 ? event.step : event.step % halfGrid;
    return {
      ...event,
      step: Math.min(pattern.gridSize - 1, sourceStep * 2),
      durationSteps: event.durationSteps * 2,
    };
  });

  return clonePattern(pattern, events, true);
}

export function projectBinaryPattern(
  pattern: PatternState,
  rhythmMode: BinaryRhythmMode,
): PatternState {
  const events = sortedEvents(pattern.events).map((event) => {
    let step = event.step;
    switch (rhythmMode) {
      case "interlock":
        // One gate is the natural subdivision for every supported pattern.
        step = positiveModulo(event.step + 1, pattern.gridSize);
        break;
      case "mirror":
        step = pattern.gridSize - 1 - event.step;
        break;
      case "call-response":
        step = positiveModulo(
          event.step + pattern.gridSize / 2,
          pattern.gridSize,
        );
        break;
    }
    return { ...event, step };
  });

  return clonePattern(pattern, sortedEvents(events));
}

/**
 * Pure runtime projection used by audio and scene compilers. It never writes
 * transformed data back into Composition. Black-hole half-time is applied
 * before the companion's binary rhythm mode when both are active.
 */
export function projectCelestialRhythm(
  pattern: PatternState,
  star: Pick<StarState, "presetId" | "companion">,
  affinity: StarAffinity,
): PatternState {
  if (star.presetId !== "black-hole" && affinity === "primary") {
    return clonePattern(pattern, pattern.events);
  }
  if (
    star.presetId !== "black-hole" &&
    affinity === "companion" &&
    !star.companion
  ) {
    return clonePattern(pattern, pattern.events);
  }

  let projected = clonePattern(pattern, pattern.events);

  if (star.presetId === "black-hole") {
    projected = projectBlackHoleHalfSpeedPattern(projected);
  }

  if (affinity === "companion" && star.companion) {
    projected = projectBinaryPattern(projected, star.companion.rhythmMode);
  }

  return clonePattern(projected, sortedEvents(projected.events));
}

export const projectCelestialPattern = projectCelestialRhythm;
export const projectPatternForCelestialSystem = projectCelestialRhythm;
export const projectBlackHolePattern = projectBlackHoleHalfSpeedPattern;
export const applyBlackHoleHalfSpeed = projectBlackHoleHalfSpeedPattern;
export const applyBinaryRhythmTransform = projectBinaryPattern;
export const transformBinaryPattern = projectBinaryPattern;
export const projectBinaryRhythmPattern = projectBinaryPattern;
export const transformBinaryRhythm = projectBinaryPattern;
