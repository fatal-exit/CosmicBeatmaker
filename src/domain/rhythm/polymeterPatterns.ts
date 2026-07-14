import type {
  LoopBars,
  PatternEvent,
  PatternGridSize,
  PatternState,
} from "../composition/types";

export type PolymeterPatternGridSize = 12 | 24;

export function isPolymeterLoopBars(loopBars: LoopBars): boolean {
  return loopBars === 1.5 || loopBars === 3;
}

function polymeterGridSizeFor(
  gridSize: PatternGridSize,
): PolymeterPatternGridSize {
  return gridSize >= 24 ? 24 : 12;
}

function earliestEvent(
  events: readonly PatternEvent[],
): PatternEvent | undefined {
  return [...events].sort(
    (left, right) => left.step - right.step || left.id.localeCompare(right.id),
  )[0];
}

/**
 * Keeps polymetric patterns on ordinary bar subdivisions. Existing 16-step
 * detail simplifies to 12 steps and 32-step detail simplifies to 24 steps.
 * Events that no longer fit are omitted; if that would silence the planet,
 * its earliest event is wrapped into the shorter grid.
 */
export function simplifyPatternForPolymeter(
  pattern: PatternState,
  loopBars: LoopBars,
): PatternState {
  if (!isPolymeterLoopBars(loopBars)) return pattern;

  const gridSize = polymeterGridSizeFor(pattern.gridSize);
  if (pattern.gridSize === gridSize) return pattern;

  const retainedEvents = pattern.events.filter(
    (event) => event.step < gridSize,
  );
  const fallbackEvent =
    retainedEvents.length === 0 ? earliestEvent(pattern.events) : undefined;
  const events = fallbackEvent
    ? [{ ...fallbackEvent, step: fallbackEvent.step % gridSize }]
    : retainedEvents;
  const customPattern: PatternState = { ...pattern };
  delete customPattern.templateId;

  return {
    ...customPattern,
    gridSize,
    events,
  };
}

/**
 * Keeps primary-planet detail tiers compatible with the selected orbit rate.
 * Returning from polymeter expands 12 steps back to 16 and 24 back to 32
 * without inventing replacements for events omitted during simplification.
 */
export function normalizePatternForLoopBars(
  pattern: PatternState,
  loopBars: LoopBars,
): PatternState {
  if (isPolymeterLoopBars(loopBars)) {
    return simplifyPatternForPolymeter(pattern, loopBars);
  }

  const gridSize =
    pattern.gridSize === 12
      ? 16
      : pattern.gridSize === 24
        ? 32
        : pattern.gridSize;
  if (pattern.gridSize === gridSize) return pattern;

  const customPattern: PatternState = { ...pattern };
  delete customPattern.templateId;

  return {
    ...customPattern,
    gridSize,
  };
}
