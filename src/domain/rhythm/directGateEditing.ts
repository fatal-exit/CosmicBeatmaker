import type {
  LoopBars,
  PatternEvent,
  PatternGridSize,
  PatternState,
  PlanetRole,
} from "../composition/types";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export type GateStepEmphasis = "beat" | "offbeat" | "subdivision";

export const FRIENDLY_PATTERN_GRID_SIZES = [
  4, 8, 16, 32,
] as const satisfies readonly PatternGridSize[];
export const POLYRHYTHM_PATTERN_GRID_SIZES = [
  6, 12, 24,
] as const satisfies readonly PatternGridSize[];

export function naturalPatternGridSizesForLoopBars(
  loopBars: LoopBars,
): readonly PatternGridSize[] {
  switch (loopBars) {
    case 0.25:
      return [4];
    case 0.5:
      return [4, 8];
    case 1:
    case 2:
      return [8, 16];
    case 1.5:
      return [6, 12];
    case 3:
      return [12, 24];
    case 4:
      return [8, 16, 32];
    case 6:
      return [24];
    case 8:
      return [32];
  }
}

export function gateStepEmphasis(
  gridSize: PatternGridSize,
  step: number,
): GateStepEmphasis {
  if ((POLYRHYTHM_PATTERN_GRID_SIZES as readonly number[]).includes(gridSize)) {
    return step % 3 === 0 ? "beat" : "subdivision";
  }

  const stepsPerBeat = gridSize / 4;
  if (step % stepsPerBeat === 0) return "beat";
  if (gridSize >= 8 && step % stepsPerBeat === stepsPerBeat / 2) {
    return "offbeat";
  }
  return "subdivision";
}

/**
 * Changes the number of visible gates while retaining their normalized
 * positions. When several detailed events collapse onto one simpler gate,
 * the strongest musical event wins so the resized pattern stays legible.
 */
export function resizePatternGrid(
  pattern: PatternState,
  gridSize: PatternGridSize,
): PatternState {
  if (pattern.gridSize === gridSize) return pattern;

  const scale = gridSize / pattern.gridSize;
  const strongestByStep = new Map<number, PatternEvent>();
  for (const event of pattern.events) {
    const step = Math.min(
      gridSize - 1,
      Math.round((event.step / pattern.gridSize) * gridSize),
    );
    const candidate = {
      ...event,
      step,
      durationSteps: clamp(event.durationSteps * scale, 0.5, gridSize),
    };
    const existing = strongestByStep.get(step);
    const existingStrength = existing
      ? existing.velocity * existing.probability
      : -1;
    const candidateStrength = candidate.velocity * candidate.probability;
    if (
      !existing ||
      candidateStrength > existingStrength ||
      (candidateStrength === existingStrength &&
        candidate.id.localeCompare(existing.id) < 0)
    ) {
      strongestByStep.set(step, candidate);
    }
  }

  return {
    ...pattern,
    gridSize,
    templateId: undefined,
    events: [...strongestByStep.values()].sort(
      (left, right) =>
        left.step - right.step || left.id.localeCompare(right.id),
    ),
  };
}

export function fitPatternGridToLoopBars(
  pattern: PatternState,
  previousLoopBars: LoopBars,
  nextLoopBars: LoopBars,
): PatternState {
  const allowed = naturalPatternGridSizesForLoopBars(nextLoopBars);
  const desiredGridSize = (pattern.gridSize / previousLoopBars) * nextLoopBars;
  const gridSize = [...allowed].sort(
    (left, right) =>
      Math.abs(left - desiredGridSize) - Math.abs(right - desiredGridSize) ||
      left - right,
  )[0];
  return resizePatternGrid(pattern, gridSize);
}

export function createGateEvent(
  role: PlanetRole,
  step: number,
  id: string,
): PatternEvent {
  const normalizedStep = Math.max(0, Math.round(step));
  const base = {
    id,
    step: normalizedStep,
    velocity: 0.78,
    probability: 1,
    durationSteps: role === "chords" ? 2 : 1,
  };

  if (role === "beat") {
    return {
      ...base,
      drumVoice:
        normalizedStep % 4 === 0
          ? normalizedStep % 8 === 0
            ? "kick"
            : "snare"
          : "closed-hat",
    };
  }

  if (role === "bass") {
    return {
      ...base,
      pitch: { kind: "root", octaveOffset: -1 },
    };
  }

  if (role === "chords") {
    return {
      ...base,
      pitch: { kind: "chordTone", index: normalizedStep % 3, octaveOffset: 0 },
      chordAction: "strike",
    };
  }

  return {
    ...base,
    pitch: {
      kind: "scaleDegree",
      degree: role === "melody" ? normalizedStep % 5 : (normalizedStep * 2) % 5,
      octaveOffset: role === "texture" ? 1 : 0,
    },
  };
}

export function togglePatternGate(
  pattern: PatternState,
  role: PlanetRole,
  step: number,
  addedEventId: string,
): PatternState {
  if (!Number.isInteger(step) || step < 0 || step >= pattern.gridSize) {
    return pattern;
  }

  const eventsAtStep = pattern.events.filter((event) => event.step === step);
  const events =
    eventsAtStep.length > 0
      ? pattern.events.filter((event) => event.step !== step)
      : [...pattern.events, createGateEvent(role, step, addedEventId)];

  return {
    ...pattern,
    templateId: undefined,
    events: events.sort(
      (left, right) =>
        left.step - right.step || left.id.localeCompare(right.id),
    ),
  };
}

export function shiftMelodyGatePitch(
  pattern: PatternState,
  eventId: string,
  scaleDegreeDelta: number,
): PatternState {
  const delta = clamp(Math.round(scaleDegreeDelta), -7, 7);
  if (delta === 0) return pattern;

  let changed = false;
  const events = pattern.events.map((event) => {
    if (event.id !== eventId || event.pitch?.kind !== "scaleDegree") {
      return event;
    }
    changed = true;
    return {
      ...event,
      pitch: {
        ...event.pitch,
        degree: clamp(event.pitch.degree + delta, -7, 14),
      },
    };
  });

  return changed
    ? {
        ...pattern,
        templateId: undefined,
        events,
      }
    : pattern;
}

export function melodyGatePitchLabel(event: PatternEvent): string | null {
  return event.pitch?.kind === "scaleDegree"
    ? `scale step ${event.pitch.degree + 1}`
    : null;
}
