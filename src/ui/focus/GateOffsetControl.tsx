import { useId } from "react";

import type { PatternGridSize } from "../../domain/composition";
import { gateOffsetSteps, signedGateOffsetSteps } from "../../domain/rhythm";

export interface GateOffsetControlProps {
  phase: number;
  gridSize: PatternGridSize;
  locked: boolean;
  onNudge: (direction: -1 | 1) => void;
  onReset: () => void;
  compact?: boolean;
}

function offsetLabel(offset: number): string {
  if (offset === 0) return "Aligned to start";
  return `${offset > 0 ? "+" : ""}${offset} ${Math.abs(offset) === 1 ? "slot" : "slots"}`;
}

export function GateOffsetControl({
  phase,
  gridSize,
  locked,
  onNudge,
  onReset,
  compact = false,
}: GateOffsetControlProps) {
  const hintId = useId();
  const offset = signedGateOffsetSteps(phase, gridSize);
  const aligned = gateOffsetSteps(phase, gridSize) === 0;

  return (
    <fieldset
      className={`gate-offset-control${compact ? " compact" : ""}`}
      aria-describedby={hintId}
    >
      <legend>Gate offset</legend>
      <p id={hintId}>
        Move every gate together by exactly one slot. The rhythm stays intact.
      </p>
      <div className="gate-offset-stepper">
        <button
          type="button"
          aria-label="Move all gates one slot earlier"
          disabled={locked}
          onClick={() => onNudge(-1)}
        >
          <span aria-hidden="true">←</span>
          Earlier
        </button>
        <output aria-live="polite" aria-atomic="true">
          <strong>{offsetLabel(offset)}</strong>
          <small>of {gridSize} slots</small>
        </output>
        <button
          type="button"
          aria-label="Move all gates one slot later"
          disabled={locked}
          onClick={() => onNudge(1)}
        >
          Later
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <button
        type="button"
        className="gate-offset-reset"
        disabled={locked || aligned}
        onClick={onReset}
      >
        Reset to pattern start
      </button>
    </fieldset>
  );
}
