import type { PatternState } from "../composition/types";

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

export function rotatePattern(
  pattern: PatternState,
  stepOffset: number,
): PatternState {
  if (!Number.isInteger(stepOffset)) {
    throw new Error("Pattern rotation must use a whole-step offset.");
  }

  return {
    ...pattern,
    events: pattern.events
      .map((event) => ({
        ...event,
        step: positiveModulo(event.step + stepOffset, pattern.gridSize),
      }))
      .sort((first, second) => first.step - second.step),
  };
}

export function calculateSwingOffset(step: number, swing: number): number {
  if (!Number.isInteger(step) || step < 0) {
    throw new Error("Swing calculation requires a non-negative step.");
  }

  const safeSwing = Math.min(0.6, Math.max(0, swing));
  return step % 2 === 1 ? safeSwing * 0.5 : 0;
}
