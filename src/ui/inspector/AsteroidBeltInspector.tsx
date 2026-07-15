import { useId } from "react";

import type { AsteroidBeltState } from "../../domain/composition";

type BeltParameter =
  "population" | "clustering" | "turbulence" | "accentChance" | "level";

const PARAMETERS: ReadonlyArray<{
  key: BeltParameter;
  label: string;
  start: string;
  end: string;
  description: string;
}> = [
  {
    key: "population",
    label: "Population",
    start: "Sparse",
    end: "Busy",
    description: "How many small percussion events gather in the belt.",
  },
  {
    key: "clustering",
    label: "Clustering",
    start: "Scattered",
    end: "Clusters",
    description: "Whether events spread out or gather into groups.",
  },
  {
    key: "turbulence",
    label: "Turbulence",
    start: "Steady",
    end: "Unruly",
    description: "How much the dust drifts away from a regular pulse.",
  },
  {
    key: "accentChance",
    label: "Accent chance",
    start: "Even",
    end: "Punctuated",
    description: "How often a dust hit gets a brighter accent.",
  },
  {
    key: "level",
    label: "Level",
    start: "Quiet",
    end: "Loud",
    description: "The belt's volume relative to the planets.",
  },
];

export interface AsteroidBeltInspectorProps {
  belt?: AsteroidBeltState;
  onParametersBegin?: (parameter: BeltParameter) => void;
  onParametersChange: (parameter: BeltParameter, value: number) => void;
  onParametersCommit?: () => void;
  onLock: () => void;
  onRemove: () => void;
  headingId?: string;
}

export function AsteroidBeltInspector({
  belt,
  onParametersBegin,
  onParametersChange,
  onParametersCommit,
  onLock,
  onRemove,
  headingId = "inspector-heading",
}: AsteroidBeltInspectorProps) {
  const controlPrefix = useId();

  if (!belt) {
    return (
      <aside className="inspector" aria-labelledby={headingId}>
        <p className="panel-label">Asteroid belt</p>
        <h2 id={headingId}>Select the belt to shape its dust.</h2>
        <p>
          Scattered percussion gives the system a little unpredictable motion.
        </p>
      </aside>
    );
  }

  return (
    <aside className="inspector asteroid-inspector" aria-labelledby={headingId}>
      <div className="selected-summary">
        <span
          aria-hidden="true"
          className="large-object-symbol asteroid-symbol"
        />
        <div>
          <p className="panel-label">Selected structure</p>
          <h2 id={headingId}>Asteroid belt</h2>
          <p className="selected-star-summary">
            <strong>{belt.events.length} seeded dust hits</strong>
            <span>
              Irregular percussion that keeps moving around the groove.
            </span>
          </p>
        </div>
      </div>

      <div className="segmented-actions" aria-label="Asteroid belt states">
        <button type="button" onClick={onLock} aria-pressed={belt.locked}>
          {belt.locked ? "Unlock" : "Lock"}
        </button>
        <button type="button" className="danger-action" onClick={onRemove}>
          Remove
        </button>
      </div>

      <fieldset className="belt-parameter-controls">
        <legend>Dust controls</legend>
        <p>Shape the belt without changing the planets' patterns.</p>
        {PARAMETERS.map((parameter) => {
          const id = `${controlPrefix}-${parameter.key}`;
          const hintId = `${id}-hint`;
          return (
            <label className="belt-slider" htmlFor={id} key={parameter.key}>
              <span>
                <strong>{parameter.label}</strong>
                <output htmlFor={id}>
                  {Math.round(belt[parameter.key] * 100)}%
                </output>
              </span>
              <input
                id={id}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={belt[parameter.key]}
                disabled={belt.locked}
                aria-describedby={hintId}
                onPointerDown={() => onParametersBegin?.(parameter.key)}
                onInput={(event) => {
                  onParametersBegin?.(parameter.key);
                  onParametersChange(
                    parameter.key,
                    Number(event.currentTarget.value),
                  );
                }}
                onPointerUp={onParametersCommit}
                onPointerCancel={onParametersCommit}
                onKeyUp={onParametersCommit}
                onBlur={onParametersCommit}
              />
              <small id={hintId}>
                <span>{parameter.start}</span>
                <span>{parameter.end}</span>
                <em>{parameter.description}</em>
              </small>
            </label>
          );
        })}
      </fieldset>

      <div className="inspector-footer">
        <small>
          {belt.locked
            ? "Locked belts stay unchanged when the system is regenerated."
            : "Lock the belt to protect its dust pattern during regeneration."}
        </small>
        <button type="button" className="danger-action" onClick={onRemove}>
          Remove belt
        </button>
      </div>
    </aside>
  );
}

export type { BeltParameter };
