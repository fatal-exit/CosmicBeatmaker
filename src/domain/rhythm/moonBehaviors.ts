import type {
  DrumVoiceId,
  MoonBehaviorPresetId,
  PatternEvent,
  PatternState,
  PitchIntent,
  PlanetRole,
} from "../composition/types";

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const clamp01 = (value: number): number =>
  clamp(Number.isFinite(value) ? value : 0, 0, 1);

function clonePitch(pitch: PitchIntent | undefined): PitchIntent | undefined {
  return pitch ? { ...pitch } : undefined;
}

function normalizedEvent(
  event: PatternEvent,
  gridSize: PatternState["gridSize"],
): PatternEvent {
  return {
    ...event,
    step: positiveModulo(Math.round(event.step), gridSize),
    velocity: clamp01(event.velocity),
    probability: clamp01(event.probability),
    durationSteps:
      Number.isFinite(event.durationSteps) && event.durationSteps > 0
        ? Math.min(gridSize, event.durationSteps)
        : 1,
    ...(event.pitch ? { pitch: clonePitch(event.pitch) } : {}),
  };
}

function relatedDrumVoice(voice: DrumVoiceId | undefined): DrumVoiceId {
  switch (voice) {
    case "kick":
      return "clap";
    case "snare":
    case "clap":
      return "rim";
    case "closed-hat":
      return "open-hat";
    case "open-hat":
      return "closed-hat";
    case "rim":
    case "perc":
    case undefined:
      return "clap";
  }
}

function relatedPitch(
  pitch: PitchIntent | undefined,
  role: Exclude<PlanetRole, "beat">,
): PitchIntent {
  const relatedIndex =
    pitch?.kind === "chordTone"
      ? positiveModulo(pitch.index + 1, 3)
      : pitch?.kind === "scaleDegree"
        ? positiveModulo(pitch.degree + 2, 7)
        : 1;

  switch (role) {
    case "bass":
      return { kind: "fifth", octaveOffset: -1 };
    case "chords":
      return { kind: "chordTone", index: relatedIndex, octaveOffset: 0 };
    case "melody":
      return { kind: "chordTone", index: relatedIndex, octaveOffset: 1 };
    case "texture":
      return { kind: "scaleDegree", degree: relatedIndex, octaveOffset: 0 };
  }
}

function raisedPitch(
  pitch: PitchIntent | undefined,
  role: Exclude<PlanetRole, "beat">,
): PitchIntent {
  if (!pitch) {
    if (role === "bass") return { kind: "fifth", octaveOffset: -1 };
    if (role === "chords") {
      return { kind: "chordTone", index: 1, octaveOffset: 0 };
    }
    return {
      kind: "scaleDegree",
      degree: 1,
      octaveOffset: role === "melody" ? 1 : 0,
    };
  }

  switch (pitch.kind) {
    case "scaleDegree":
      return {
        ...pitch,
        degree: clamp(Math.round(pitch.degree) + 1, -14, 14),
        octaveOffset: clamp(Math.round(pitch.octaveOffset), -2, 2),
      };
    case "chordTone":
      return {
        ...pitch,
        // Chord-tone indices intentionally continue past the triad so the
        // resolver selects the next inversion instead of wrapping downward.
        index: clamp(Math.round(pitch.index) + 1, -14, 14),
        octaveOffset: clamp(Math.round(pitch.octaveOffset), -2, 2),
      };
    case "root":
      return {
        kind: "fifth",
        octaveOffset: clamp(Math.round(pitch.octaveOffset), -2, 2),
      };
    case "fifth":
      return {
        kind: "root",
        octaveOffset: clamp(Math.round(pitch.octaveOffset) + 1, -2, 2),
      };
    case "absoluteMidi":
      return {
        kind: "absoluteMidi",
        note: clamp(Math.round(pitch.note) + 2, 0, 127),
      };
  }
}

function harmonyEvent(event: PatternEvent, role: PlanetRole): PatternEvent {
  if (role === "beat") {
    const related: PatternEvent = {
      ...event,
      drumVoice: relatedDrumVoice(event.drumVoice),
      velocity: clamp01(event.velocity * 0.9),
    };
    delete related.pitch;
    return related;
  }
  return {
    ...event,
    pitch: relatedPitch(event.pitch, role),
    velocity: clamp01(event.velocity * 0.9),
  };
}

function pickupEvent(event: PatternEvent, role: PlanetRole): PatternEvent {
  const pickup: PatternEvent = {
    ...event,
    velocity: clamp01(event.velocity + 0.08),
    durationSteps: Math.min(event.durationSteps, 0.75),
  };
  if (role === "beat") {
    pickup.drumVoice = "rim";
    delete pickup.pitch;
  } else {
    pickup.pitch = raisedPitch(event.pitch, role);
  }
  return pickup;
}

function sortEvents(events: readonly PatternEvent[]): PatternEvent[] {
  return [...events].sort(
    (left, right) => left.step - right.step || left.id.localeCompare(right.id),
  );
}

/**
 * Projects one saved moon pattern into its selected musical behavior. The
 * result is a disposable performance view: IDs, event count, and grid remain
 * stable while canonical MoonState is never mutated.
 */
export function projectMoonBehavior(
  pattern: PatternState,
  behaviorPresetId: MoonBehaviorPresetId,
  parentRole: PlanetRole,
): PatternState {
  const sourceEvents = sortEvents(
    pattern.events.map((event) => normalizedEvent(event, pattern.gridSize)),
  );
  let events: PatternEvent[];

  switch (behaviorPresetId) {
    case "accent":
      events = sourceEvents.map((event) => ({
        ...event,
        velocity: clamp01(event.velocity + 0.18),
        probability: clamp01(event.probability + 0.08),
      }));
      break;
    case "echo":
      events = sourceEvents.map((event) => ({
        ...event,
        step: positiveModulo(event.step + 1, pattern.gridSize),
        velocity: clamp01(event.velocity * 0.68),
        probability: clamp01(event.probability * 0.92),
        durationSteps: Math.min(event.durationSteps, 1),
      }));
      break;
    case "harmony":
      events = sourceEvents.map((event) => harmonyEvent(event, parentRole));
      break;
    case "pickup":
      events = sourceEvents.map((event) => ({
        ...pickupEvent(event, parentRole),
        step: positiveModulo(event.step - 1, pattern.gridSize),
      }));
      break;
    case "fill": {
      const finalQuarterStart = Math.ceil(pattern.gridSize * 0.75);
      const finalQuarterLength = Math.max(
        1,
        pattern.gridSize - finalQuarterStart,
      );
      const finalQuarterEnd = pattern.gridSize - 1;
      events = sourceEvents.map((event, index) => {
        const progress =
          sourceEvents.length <= 1 ? 1 : index / (sourceEvents.length - 1);
        return {
          ...event,
          step:
            finalQuarterStart +
            Math.min(
              finalQuarterLength - 1,
              Math.round(progress * (finalQuarterEnd - finalQuarterStart)),
            ),
          velocity: clamp01(event.velocity + 0.06 + progress * 0.12),
          probability: clamp01(event.probability + 0.05),
          durationSteps: Math.min(event.durationSteps, 1),
        };
      });
      break;
    }
    case "counterpulse":
      events = sourceEvents.map((event) => ({
        ...event,
        step: positiveModulo(
          event.step + Math.floor(pattern.gridSize / 2),
          pattern.gridSize,
        ),
        velocity: clamp01(event.velocity * 0.88),
      }));
      break;
  }

  const projected: PatternState = {
    ...pattern,
    events: sortEvents(events),
  };
  delete projected.templateId;
  return projected;
}
