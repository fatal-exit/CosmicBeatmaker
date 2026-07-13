import { useEffect, useRef, type CSSProperties } from "react";

import type { PatternState, PlanetState } from "../../domain/composition";
import { createId } from "../../domain/serialization/ids";

export interface FocusViewProps {
  planet: PlanetState | undefined;
  onChange: (pattern: PatternState) => void;
  onClose: () => void;
}

export function FocusView({ planet, onChange, onClose }: FocusViewProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (!planet) return null;
  const activeSteps = new Set(planet.pattern.events.map((event) => event.step));

  const toggleStep = (step: number) => {
    const existing = planet.pattern.events.find((event) => event.step === step);
    const events = existing
      ? planet.pattern.events.filter((event) => event.id !== existing.id)
      : [
          ...planet.pattern.events,
          {
            id: createId("event"),
            step,
            velocity: 0.78,
            probability: 1,
            durationSteps: 1,
            ...(planet.role === "beat"
              ? {
                  drumVoice:
                    step % 4 === 0
                      ? ("kick" as const)
                      : ("closed-hat" as const),
                }
              : {
                  pitch: {
                    kind: "scaleDegree" as const,
                    degree: step % 5,
                    octaveOffset: 0,
                  },
                }),
          },
        ];
    onChange({
      ...planet.pattern,
      templateId: undefined,
      events: events.sort((left, right) => left.step - right.step),
    });
  };

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
      <div className="circular-pattern" aria-hidden="true">
        <span className={`focus-planet role-${planet.role}`} />
        {Array.from({ length: planet.pattern.gridSize }, (_, step) => (
          <span
            key={step}
            className={activeSteps.has(step) ? "active" : ""}
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
            className={activeSteps.has(step) ? "active" : ""}
            aria-pressed={activeSteps.has(step)}
            aria-label={`Step ${step + 1}${activeSteps.has(step) ? ", active" : ""}`}
            onClick={() => toggleStep(step)}
          >
            <span>{step + 1}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
