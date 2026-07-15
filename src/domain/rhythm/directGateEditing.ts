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
export type GateTimingCharacter = "beat" | "offbeat" | "subdivision";

export interface GateTimingDescription {
  bar: number;
  beat: number;
  character: GateTimingCharacter;
  positionLabel: string;
  characterLabel: string;
  guidance: string;
}

export interface GateTimingSummary {
  activeGates: number;
  onBeat: number;
  betweenBeats: number;
  label: string;
  guidance: string;
}

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

function normalizePhase(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  return ((phase % 1) + 1) % 1;
}

/** Return the stored phase as the nearest whole gate-slot offset. */
export function gateOffsetSteps(
  phase: number,
  gridSize: PatternGridSize,
): number {
  return Math.round(normalizePhase(phase) * gridSize) % gridSize;
}

/** Present wrapped offsets around zero so one step earlier reads as -1. */
export function signedGateOffsetSteps(
  phase: number,
  gridSize: PatternGridSize,
): number {
  const offset = gateOffsetSteps(phase, gridSize);
  return offset > gridSize / 2 ? offset - gridSize : offset;
}

/** Snap the current phase to the gate grid, then move every gate one slot. */
export function nudgeGatePhase(
  phase: number,
  gridSize: PatternGridSize,
  direction: -1 | 1,
): number {
  const nextOffset =
    (gateOffsetSteps(phase, gridSize) + direction + gridSize) % gridSize;
  return nextOffset / gridSize;
}

function gatePositionFractionLabel(quarterBeat: number): string {
  switch (quarterBeat) {
    case 1:
      return " + ¼";
    case 2:
      return " + ½";
    case 3:
      return " + ¾";
    default:
      return "";
  }
}

/**
 * Describe where a canonical gate lands in ordinary bar-and-beat language.
 * Phase is snapped only for this teaching readout; the audio compiler remains
 * authoritative and continues to consume the stored normalized phase.
 */
export function describeGateTiming(
  loopBars: LoopBars,
  gridSize: PatternGridSize,
  step: number,
  phase: number,
): GateTimingDescription {
  const normalizedStep =
    (((Math.round(step) + gateOffsetSteps(phase, gridSize)) % gridSize) +
      gridSize) %
    gridSize;
  const totalBeats = (normalizedStep / gridSize) * loopBars * 4;
  const bar = Math.floor(totalBeats / 4) + 1;
  const beatPosition = totalBeats % 4;
  const beat = Math.floor(beatPosition) + 1;
  const quarterBeat = Math.round((beatPosition % 1) * 4) % 4;
  const positionLabel = `Bar ${bar} · Beat ${beat}${gatePositionFractionLabel(quarterBeat)}`;

  if (quarterBeat === 0) {
    return {
      bar,
      beat,
      character: "beat",
      positionLabel,
      characterLabel: "On the beat",
      guidance: "A strong, steady anchor.",
    };
  }
  if (quarterBeat === 2) {
    return {
      bar,
      beat,
      character: "offbeat",
      positionLabel,
      characterLabel: "Halfway between beats",
      guidance: "An offbeat placement that adds syncopation.",
    };
  }
  return {
    bar,
    beat,
    character: "subdivision",
    positionLabel,
    characterLabel: "Fine subdivision",
    guidance: "A detailed placement that adds rhythmic movement.",
  };
}

export function summarizeGateTiming(
  pattern: PatternState,
  loopBars: LoopBars,
  phase: number,
): GateTimingSummary {
  const activeSteps = [...new Set(pattern.events.map((event) => event.step))];
  const timings = activeSteps.map((step) =>
    describeGateTiming(loopBars, pattern.gridSize, step, phase),
  );
  const onBeat = timings.filter(({ character }) => character === "beat").length;
  const betweenBeats = timings.length - onBeat;

  if (timings.length === 0) {
    return {
      activeGates: 0,
      onBeat: 0,
      betweenBeats: 0,
      label: "No active gates",
      guidance: "Turn on a strong beat marker to begin a steady pulse.",
    };
  }
  if (betweenBeats === 0) {
    return {
      activeGates: timings.length,
      onBeat,
      betweenBeats,
      label: `${onBeat} on ${onBeat === 1 ? "a beat" : "beats"}`,
      guidance: "Every active gate lands on a beat for a steady pulse.",
    };
  }

  return {
    activeGates: timings.length,
    onBeat,
    betweenBeats,
    label: `${onBeat} on-beat · ${betweenBeats} between beats`,
    guidance: `${betweenBeats === 1 ? "This gate creates" : "These gates create"} syncopation. If you want every gate on a beat, move or remove ${betweenBeats === 1 ? "it" : "them"}.`,
  };
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
