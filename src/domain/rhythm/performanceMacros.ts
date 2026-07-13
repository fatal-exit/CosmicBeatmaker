import type {
  MacroState,
  PatternEvent,
  PatternState,
  PitchIntent,
  PlanetRole,
} from "../composition/types";
import { createSeededRandom } from "../generation/prng";
import { createStableId } from "../serialization/ids";

const MAX_HUMANIZE = 0.12;
const MIN_DURATION_STEPS = 0.125;

const MAX_DENSITY_EVENTS: Record<PlanetRole, number> = {
  beat: 6,
  bass: 4,
  chords: 3,
  melody: 6,
  texture: 5,
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const clamp01 = (value: number): number =>
  clamp(Number.isFinite(value) ? value : 0.5, 0, 1);

const round = (value: number): number => Math.round(value * 1_000) / 1_000;

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

function stableValue(
  sourceId: string,
  namespace: string,
  value: string,
): number {
  return createSeededRandom(sourceId || "performance-track")
    .derive("performance", namespace, value)
    .next();
}

function normalizedMacros(macros: MacroState): MacroState {
  return {
    energy: clamp01(macros.energy),
    density: clamp01(macros.density),
    groove: clamp01(macros.groove),
    space: clamp01(macros.space),
    complexity: clamp01(macros.complexity),
  };
}

function isStructuralEvent(
  event: PatternEvent,
  eventIndex: number,
  role: PlanetRole,
  gridSize: PatternState["gridSize"],
): boolean {
  if (eventIndex === 0 || event.step === 0) return true;
  if (role !== "beat") return false;

  const quarter = gridSize / 4;
  const isBackbeat =
    (event.drumVoice === "snare" || event.drumVoice === "clap") &&
    (event.step === quarter || event.step === quarter * 3);
  return isBackbeat;
}

function rankEvents(
  events: readonly PatternEvent[],
  sourceId: string,
): PatternEvent[] {
  return [...events].sort(
    (left, right) =>
      stableValue(sourceId, "event-rank", right.id) -
        stableValue(sourceId, "event-rank", left.id) ||
      left.step - right.step ||
      left.id.localeCompare(right.id),
  );
}

function selectCanonicalEvents(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  density: number,
): PatternEvent[] {
  if (density >= 0.5) return [...pattern.events];

  const structural: PatternEvent[] = [];
  const optional: PatternEvent[] = [];
  pattern.events.forEach((event, eventIndex) => {
    (isStructuralEvent(event, eventIndex, role, pattern.gridSize)
      ? structural
      : optional
    ).push(event);
  });
  const optionalCount = Math.round(optional.length * density * 2);
  const keptIds = new Set([
    ...structural.map((event) => event.id),
    ...rankEvents(optional, sourceId)
      .slice(0, optionalCount)
      .map((event) => event.id),
  ]);
  return pattern.events.filter((event) => keptIds.has(event.id));
}

function nearestEvent(
  events: readonly PatternEvent[],
  step: number,
  gridSize: number,
): PatternEvent | undefined {
  return [...events].sort((left, right) => {
    const leftDistance = Math.min(
      positiveModulo(left.step - step, gridSize),
      positiveModulo(step - left.step, gridSize),
    );
    const rightDistance = Math.min(
      positiveModulo(right.step - step, gridSize),
      positiveModulo(step - right.step, gridSize),
    );
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  })[0];
}

function pitchForAddedEvent(
  role: Exclude<PlanetRole, "beat">,
  step: number,
  complexity: number,
  sourceId: string,
): PitchIntent {
  const variation = stableValue(sourceId, "added-pitch", String(step));
  if (role === "bass") {
    return complexity > 0.62 && variation > 0.56
      ? { kind: "fifth", octaveOffset: -1 }
      : { kind: "root", octaveOffset: -1 };
  }
  if (role === "chords") {
    return {
      kind: "chordTone",
      index: complexity > 0.72 ? Math.floor(variation * 3) : 0,
      octaveOffset: 0,
    };
  }
  return {
    kind: "scaleDegree",
    degree: Math.floor(variation * 5),
    octaveOffset: role === "melody" ? 1 : 0,
  };
}

function drumVoiceForAddedEvent(
  step: number,
  complexity: number,
  sourceId: string,
): PatternEvent["drumVoice"] {
  const variation = stableValue(sourceId, "added-drum", String(step));
  if (complexity > 0.76 && variation > 0.72) return "open-hat";
  if (complexity > 0.58 && variation > 0.48) return "perc";
  return step % 4 === 0 ? "kick" : "closed-hat";
}

function createAddedEvent(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  step: number,
  namespace: "density" | "complexity",
  macros: MacroState,
): PatternEvent {
  const prototype = nearestEvent(pattern.events, step, pattern.gridSize);
  const roleFields =
    role === "beat"
      ? {
          drumVoice: drumVoiceForAddedEvent(step, macros.complexity, sourceId),
        }
      : {
          pitch: pitchForAddedEvent(role, step, macros.complexity, sourceId),
          ...(role === "chords" ? { chordAction: "strike" as const } : {}),
        };

  return {
    id: createStableId(
      "performance-event",
      sourceId || "performance-track",
      role,
      namespace,
      String(step),
    ),
    step,
    velocity: prototype?.velocity ?? (role === "texture" ? 0.38 : 0.56),
    probability: round(
      0.94 -
        macros.complexity * 0.2 +
        stableValue(sourceId, "added-probability", `${namespace}:${step}`) *
          0.05,
    ),
    durationSteps: role === "chords" ? 2 : (prototype?.durationSteps ?? 0.75),
    ...roleFields,
  };
}

function candidateSteps(
  pattern: PatternState,
  events: readonly PatternEvent[],
  sourceId: string,
  groove: number,
): number[] {
  const occupied = new Set(events.map((event) => event.step));
  const grooveBias = (groove - 0.5) * 2;
  const candidates = Array.from(
    { length: pattern.gridSize },
    (_, step) => step,
  ).filter((step) => !occupied.has(step));

  return candidates.sort((left, right) => {
    const score = (step: number): number => {
      const syncopated = step % 2 === 1 ? 1 : -0.3;
      return (
        stableValue(sourceId, "candidate", String(step)) +
        syncopated * grooveBias * 0.34
      );
    };
    return score(right) - score(left) || left - right;
  });
}

function addDensityEvents(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  macros: MacroState,
  events: readonly PatternEvent[],
): PatternEvent[] {
  if (macros.density <= 0.5) return [...events];
  const requested = Math.floor(
    (macros.density - 0.5) * 2 * MAX_DENSITY_EVENTS[role] + 1e-9,
  );
  const steps = candidateSteps(pattern, events, sourceId, macros.groove).slice(
    0,
    requested,
  );
  return [
    ...events,
    ...steps.map((step) =>
      createAddedEvent(pattern, role, sourceId, step, "density", macros),
    ),
  ];
}

function addComplexityEvents(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  macros: MacroState,
  events: readonly PatternEvent[],
): PatternEvent[] {
  if (macros.complexity <= 0.65) return [...events];
  const requested = Math.floor(((macros.complexity - 0.65) / 0.35) * 2 + 1e-9);
  const steps = candidateSteps(pattern, events, sourceId, macros.groove).slice(
    0,
    requested,
  );
  return [
    ...events,
    ...steps.map((step) =>
      createAddedEvent(pattern, role, sourceId, step, "complexity", macros),
    ),
  ];
}

function removeForSpace(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  space: number,
  events: readonly PatternEvent[],
): PatternEvent[] {
  if (space <= 0.62 || events.length <= 1) return [...events];
  const removable = events.filter(
    (event) =>
      !isStructuralEvent(
        event,
        pattern.events.findIndex((candidate) => candidate.id === event.id),
        role,
        pattern.gridSize,
      ),
  );
  const removeCount = Math.min(
    Math.max(0, events.length - 1),
    Math.floor(((space - 0.62) / 0.38) * removable.length * 0.45 + 1e-9),
  );
  const removedIds = new Set(
    removeCount === 0
      ? []
      : rankEvents(removable, `${sourceId}:space`)
          .slice(-removeCount)
          .map((event) => event.id),
  );
  return events.filter((event) => !removedIds.has(event.id));
}

function shiftForGroove(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  groove: number,
  events: readonly PatternEvent[],
): PatternEvent[] {
  const wantsSyncopation = groove > 0.66;
  const wantsStraightening = groove < 0.34;
  if (!wantsSyncopation && !wantsStraightening) return [...events];

  const strength = wantsSyncopation
    ? (groove - 0.66) / 0.34
    : (0.34 - groove) / 0.34;
  const occupied = new Set(events.map((event) => event.step));
  const eligible = rankEvents(
    events.filter((event) => {
      const canonicalIndex = pattern.events.findIndex(
        (candidate) => candidate.id === event.id,
      );
      if (isStructuralEvent(event, canonicalIndex, role, pattern.gridSize)) {
        return false;
      }
      return wantsSyncopation ? event.step % 2 === 0 : event.step % 2 === 1;
    }),
    `${sourceId}:groove`,
  );
  const shiftIds = new Set(
    eligible
      .slice(0, Math.ceil(eligible.length * strength))
      .map(({ id }) => id),
  );

  return events.map((event) => {
    if (!shiftIds.has(event.id)) return event;
    occupied.delete(event.step);
    const preferredDirection =
      stableValue(sourceId, "groove-direction", event.id) < 0.5 ? -1 : 1;
    const candidates = [preferredDirection, -preferredDirection].map(
      (direction) => positiveModulo(event.step + direction, pattern.gridSize),
    );
    const step = candidates.find((candidate) => !occupied.has(candidate));
    occupied.add(step ?? event.step);
    return step === undefined ? event : { ...event, step };
  });
}

function varyPitch(
  pitch: PitchIntent | undefined,
  complexity: number,
  variation: number,
): PitchIntent | undefined {
  if (!pitch || complexity < 0.58) return pitch ? { ...pitch } : undefined;
  const direction = variation < 0.5 ? -1 : 1;
  const distance = complexity > 0.86 ? 2 : 1;
  switch (pitch.kind) {
    case "scaleDegree":
      return { ...pitch, degree: pitch.degree + direction * distance };
    case "chordTone":
      return { ...pitch, index: Math.max(0, pitch.index + direction) };
    case "root":
      return complexity > 0.78
        ? { kind: "fifth", octaveOffset: pitch.octaveOffset }
        : { ...pitch };
    case "fifth":
      return complexity > 0.9
        ? { kind: "root", octaveOffset: pitch.octaveOffset + 1 }
        : { ...pitch };
    case "absoluteMidi":
      return {
        ...pitch,
        note: clamp(Math.round(pitch.note + direction * distance), 0, 127),
      };
  }
}

function shapeEvent(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  macros: MacroState,
  event: PatternEvent,
): PatternEvent {
  const canonicalIndex = pattern.events.findIndex(
    (candidate) => candidate.id === event.id,
  );
  const structural = isStructuralEvent(
    event,
    canonicalIndex,
    role,
    pattern.gridSize,
  );
  const energyDirection = (macros.energy - 0.5) * 2;
  const accent = structural ? 0.09 : event.step % 2 === 1 ? 0.025 : 0.045;
  const velocity = clamp(
    event.velocity + energyDirection * (event.velocity * 0.2 + accent),
    0.08,
    1,
  );
  const durationFactor =
    macros.space < 0.4
      ? 0.6 + macros.space
      : macros.space <= 0.6
        ? 1
        : 1 + ((macros.space - 0.6) / 0.4) * 0.45;
  const probabilityVariation = structural
    ? 0
    : (0.5 - macros.complexity) * 0.18 - Math.max(0, macros.space - 0.5) * 0.2;

  return {
    ...event,
    velocity: round(velocity),
    probability: round(clamp01(event.probability + probabilityVariation)),
    durationSteps: round(
      clamp(
        event.durationSteps * durationFactor,
        MIN_DURATION_STEPS,
        pattern.gridSize,
      ),
    ),
    ...(event.pitch
      ? {
          pitch: varyPitch(
            event.pitch,
            macros.complexity,
            stableValue(sourceId, "pitch-variation", event.id),
          ),
        }
      : {}),
  };
}

function humanizeForGroove(canonicalHumanize: number, groove: number): number {
  const safeCanonical = clamp(canonicalHumanize, 0, MAX_HUMANIZE);
  if (groove <= 0.5) return round(safeCanonical * groove * 2);
  return round(
    safeCanonical + ((groove - 0.5) / 0.5) * (MAX_HUMANIZE - safeCanonical),
  );
}

/**
 * Pure, absolute performance projection. Canonical pattern events are never
 * mutated or rewritten, so moving a macro back restores the same projection.
 */
export function derivePerformancePattern(
  pattern: PatternState,
  role: PlanetRole,
  sourceId: string,
  macroState: MacroState,
): PatternState {
  const macros = normalizedMacros(macroState);
  let events = selectCanonicalEvents(pattern, role, sourceId, macros.density);
  events = addDensityEvents(pattern, role, sourceId, macros, events);
  events = addComplexityEvents(pattern, role, sourceId, macros, events);
  events = removeForSpace(pattern, role, sourceId, macros.space, events);
  events = shiftForGroove(pattern, role, sourceId, macros.groove, events);

  return {
    ...pattern,
    humanize: humanizeForGroove(pattern.humanize, macros.groove),
    events: events
      .map((event) => shapeEvent(pattern, role, sourceId, macros, event))
      .sort(
        (left, right) =>
          left.step - right.step || left.id.localeCompare(right.id),
      ),
  };
}

/**
 * Deterministic microtiming in pattern-step units. Source-cycle seeding keeps
 * live repeating schedules, offline renders, and MIDI exports identical.
 */
export function performanceHumanizeOffsetSteps(
  pattern: PatternState,
  compositionSeed: string,
  event: PatternEvent,
  sourceCycleIndex: number,
): number {
  const amount = clamp(pattern.humanize, 0, MAX_HUMANIZE);
  if (amount === 0 || event.step === 0) return 0;
  const random = createSeededRandom(
    compositionSeed || "performance-composition",
  )
    .derive("performance-humanize", event.id, String(sourceCycleIndex))
    .next();
  const microtiming = (random * 2 - 1) * amount;
  const shuffle = event.step % 2 === 1 ? amount : 0;
  return clamp(microtiming + shuffle, -amount, amount * 2);
}
