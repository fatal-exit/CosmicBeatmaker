import type { ScaleId } from "../composition/types";

export interface ScaleDefinition {
  id: ScaleId;
  name: string;
  intervals: readonly number[];
}

export const SCALE_DEFINITIONS = {
  "major-pentatonic": {
    id: "major-pentatonic",
    name: "Major Pentatonic",
    intervals: [0, 2, 4, 7, 9],
  },
  "minor-pentatonic": {
    id: "minor-pentatonic",
    name: "Minor Pentatonic",
    intervals: [0, 3, 5, 7, 10],
  },
  dorian: {
    id: "dorian",
    name: "Dorian",
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  major: {
    id: "major",
    name: "Major",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
} as const satisfies Record<ScaleId, ScaleDefinition>;

export function getScaleDefinition(scaleId: ScaleId): ScaleDefinition {
  return SCALE_DEFINITIONS[scaleId];
}

export function getScaleIntervals(scaleId: ScaleId): readonly number[] {
  return getScaleDefinition(scaleId).intervals;
}
