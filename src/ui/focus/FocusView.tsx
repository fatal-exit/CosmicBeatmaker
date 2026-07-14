import { useEffect, useRef, type CSSProperties } from "react";

import type { PatternGridSize, PlanetState } from "../../domain/composition";
import {
  FRIENDLY_PATTERN_GRID_SIZES,
  gateStepEmphasis,
  melodyGatePitchLabel,
  naturalPatternGridSizesForLoopBars,
  POLYRHYTHM_PATTERN_GRID_SIZES,
} from "../../domain/rhythm";

export interface FocusViewProps {
  planet: PlanetState | undefined;
  advanced: boolean;
  onToggleGate: (step: number) => void;
  onPatternGridSize: (gridSize: PatternGridSize) => void;
  onPitchShift: (eventId: string, scaleDegreeDelta: number) => void;
  onClose: () => void;
}

export function FocusView({
  planet,
  advanced,
  onToggleGate,
  onPatternGridSize,
  onPitchShift,
  onClose,
}: FocusViewProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (!planet) return null;
  const activeSteps = new Set(planet.pattern.events.map((event) => event.step));
  const naturalStepCounts = naturalPatternGridSizesForLoopBars(
    planet.orbit.loopBars,
  );
  const friendlyStepCounts = FRIENDLY_PATTERN_GRID_SIZES.filter((gridSize) =>
    naturalStepCounts.includes(gridSize),
  );
  const polyrhythmStepCounts = POLYRHYTHM_PATTERN_GRID_SIZES.filter(
    (gridSize) => naturalStepCounts.includes(gridSize),
  );

  const editableMelodyEvents =
    planet.role === "melody"
      ? planet.pattern.events.filter(
          (event) => event.pitch?.kind === "scaleDegree",
        )
      : [];

  return (
    <section
      className="focus-view"
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-heading"
    >
      <header>
        <div>
          <p className="panel-label">Orbit Lab</p>
          <h2 id="focus-heading">{planet.name} pattern</h2>
          <p>
            Fine-tune individual orbit gates. A bright gate pulses when its
            event plays.
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close pattern editor"
        >
          ×
        </button>
      </header>
      <fieldset className="gate-count-control focus-step-count">
        <legend>Steps around this orbit</legend>
        <p>Four is clearest. Add more steps when you want finer rhythm.</p>
        {friendlyStepCounts.length > 0 ? (
          <div aria-label="Recommended step counts">
            {friendlyStepCounts.map((gridSize) => (
              <button
                type="button"
                key={gridSize}
                aria-label={`${gridSize} steps`}
                aria-pressed={planet.pattern.gridSize === gridSize}
                disabled={planet.locked}
                onClick={() => onPatternGridSize(gridSize)}
              >
                {gridSize}
              </button>
            ))}
          </div>
        ) : null}
        {advanced && polyrhythmStepCounts.length > 0 ? (
          <div className="polyrhythm-step-options">
            <span>Polyrhythm</span>
            <div aria-label="Polyrhythm step counts">
              {polyrhythmStepCounts.map((gridSize) => (
                <button
                  type="button"
                  key={gridSize}
                  aria-label={`${gridSize} polyrhythm steps`}
                  aria-pressed={planet.pattern.gridSize === gridSize}
                  disabled={planet.locked}
                  onClick={() => onPatternGridSize(gridSize)}
                >
                  {gridSize}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>
      <div className="circular-pattern" aria-hidden="true">
        <span className={`focus-planet role-${planet.role}`} />
        {Array.from({ length: planet.pattern.gridSize }, (_, step) => (
          <span
            key={step}
            className={`${gateStepEmphasis(planet.pattern.gridSize, step)}-step${
              activeSteps.has(step) ? " active" : ""
            }`}
            style={
              {
                "--step": step,
                "--steps": planet.pattern.gridSize,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div
        className="linear-pattern"
        aria-label={`${planet.pattern.gridSize} step pattern`}
      >
        {Array.from({ length: planet.pattern.gridSize }, (_, step) => (
          <button
            type="button"
            key={step}
            className={`${gateStepEmphasis(planet.pattern.gridSize, step)}-step${
              activeSteps.has(step) ? " active" : ""
            }`}
            aria-pressed={activeSteps.has(step)}
            aria-label={`Step ${step + 1}${activeSteps.has(step) ? ", active" : ""}`}
            aria-description={
              gateStepEmphasis(planet.pattern.gridSize, step) === "beat"
                ? "Main beat"
                : gateStepEmphasis(planet.pattern.gridSize, step) === "offbeat"
                  ? "Offbeat eighth"
                  : "Fine subdivision"
            }
            onClick={() => onToggleGate(step)}
          >
            <span>{step + 1}</span>
          </button>
        ))}
      </div>
      {editableMelodyEvents.length > 0 ? (
        <section
          className="melody-gate-pitches"
          aria-labelledby="melody-gate-pitches-heading"
        >
          <div>
            <h3 id="melody-gate-pitches-heading">Melody gate pitches</h3>
            <p>Move each active gate through the safe scale.</p>
          </div>
          <div className="melody-gate-pitch-list">
            {editableMelodyEvents.map((event) => {
              const label = melodyGatePitchLabel(event);
              const degree =
                event.pitch?.kind === "scaleDegree" ? event.pitch.degree : 0;
              return (
                <div className="melody-gate-pitch-row" key={event.id}>
                  <span>
                    <strong>Gate {event.step + 1}</strong>
                    <small>{label}</small>
                  </span>
                  <button
                    type="button"
                    aria-label={`Lower gate ${event.step + 1} pitch`}
                    disabled={degree <= -7}
                    onClick={() => onPitchShift(event.id, -1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`Raise gate ${event.step + 1} pitch`}
                    disabled={degree >= 14}
                    onClick={() => onPitchShift(event.id, 1)}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}
