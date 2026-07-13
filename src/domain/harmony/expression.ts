import type {
  PatternEvent,
  PatternState,
  PlanetExpressionState,
} from "../composition/types";

function contourPosition(
  index: number,
  pitchCount: number,
  contour: Extract<PlanetExpressionState, { kind: "melody" }>["contour"],
): number {
  if (pitchCount <= 1) return 0;
  if (contour === "ascending") return index % pitchCount;
  if (contour === "descending") return pitchCount - 1 - (index % pitchCount);

  const period = (pitchCount - 1) * 2;
  const position = index % period;
  return position < pitchCount ? position : period - position;
}

function shapeMelodyPitch(
  event: PatternEvent,
  eventIndex: number,
  expression: Extract<PlanetExpressionState, { kind: "melody" }>,
): PatternEvent["pitch"] {
  if (!event.pitch) return undefined;
  const pitchCount = 1 + Math.round(expression.pitchVariety * 4);
  const degree = contourPosition(eventIndex, pitchCount, expression.contour);

  if (event.pitch.kind === "chordTone") {
    return {
      ...event.pitch,
      index: degree % Math.min(3, pitchCount),
    };
  }
  if (event.pitch.kind === "scaleDegree") {
    return { ...event.pitch, degree };
  }
  return {
    kind: "scaleDegree",
    degree,
    octaveOffset:
      event.pitch.kind === "absoluteMidi" ? 1 : event.pitch.octaveOffset,
  };
}

/** Applies stored role expression without rewriting the canonical pattern. */
export function applyPlanetExpression(
  pattern: PatternState,
  expression: PlanetExpressionState,
): PatternState {
  if (expression.kind !== "melody") return pattern;

  const eventOrder = new Map(
    [...pattern.events]
      .sort(
        (left, right) =>
          left.step - right.step || left.id.localeCompare(right.id),
      )
      .map((event, index) => [event.id, index] as const),
  );

  return {
    ...pattern,
    events: pattern.events.map((event) => ({
      ...event,
      pitch: shapeMelodyPitch(event, eventOrder.get(event.id) ?? 0, expression),
    })),
  };
}
