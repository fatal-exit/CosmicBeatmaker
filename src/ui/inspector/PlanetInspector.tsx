import { useId } from "react";

import type {
  LoopBars,
  MelodyContour,
  PlanetExpressionState,
  PlanetState,
} from "../../domain/composition";
import {
  GATE_RHYTHM_PRESETS,
  type GateRhythmPresetId,
} from "../../domain/rhythm/gatePresets";
import { PLANET_MATERIAL_PROFILES } from "../../scene/materials/profiles";
import {
  COMMON_ORBIT_RATE_OPTIONS,
  DEEP_ORBIT_RATE_OPTIONS,
  formatBarCount,
  formatOrbitRate,
  parseOrbitRate,
} from "./orbitRateOptions";

export interface PlanetInspectorProps {
  planet?: PlanetState;
  superLoopBars: number;
  onMute: () => void;
  onSolo: () => void;
  onLock: () => void;
  onOrbit: (loopBars: LoopBars) => void;
  onExpressionBegin: (
    control: "voicing" | "chord-complexity" | "pitch-variety",
  ) => void;
  onExpressionCommit: () => void;
  onChordExpression: (
    expression: Partial<
      Omit<Extract<PlanetExpressionState, { kind: "chords" }>, "kind">
    >,
  ) => void;
  onMelodyExpression: (
    expression: Partial<
      Omit<Extract<PlanetExpressionState, { kind: "melody" }>, "kind">
    >,
  ) => void;
  gateRhythmPreset: GateRhythmPresetId | "custom";
  onGateRhythmPreset: (presetId: GateRhythmPresetId) => void;
  onPattern: () => void;
  onRing: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  headingId?: string;
}

const RANGE_KEYS = [
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
] as const;

function voicingLabel(spread: number): string {
  if (spread < 0.25) return "Closed";
  if (spread < 0.75) return "Open";
  return "Wide";
}

function complexityLabel(complexity: number): string {
  if (complexity < 0.34) return "Simple";
  if (complexity < 0.72) return "Layered";
  return "Rich";
}

function varietyLabel(variety: number): string {
  if (variety < 0.25) return "Focused";
  if (variety < 0.7) return "Balanced";
  return "Varied";
}

export function PlanetInspector({ planet, ...actions }: PlanetInspectorProps) {
  const gateRhythmId = useId();
  const deleteHintId = useId();
  const voicingId = useId();
  const chordComplexityId = useId();
  const pitchVarietyId = useId();
  const headingId = actions.headingId ?? "inspector-heading";
  if (!planet) {
    return (
      <aside className="inspector">
        <p className="panel-label">System mood</p>
        <h2>Select a planet to shape its sound.</h2>
        <p>The star keeps every orbit in one musical world.</p>
      </aside>
    );
  }

  const material = PLANET_MATERIAL_PROFILES[planet.role];
  const gateRhythm = GATE_RHYTHM_PRESETS.find(
    ({ id }) => id === actions.gateRhythmPreset,
  );
  const melodyExpression =
    planet.expression.kind === "melody" ? planet.expression : undefined;

  return (
    <aside className="inspector" aria-labelledby={headingId}>
      <div className="selected-summary">
        <span
          aria-hidden="true"
          className={`large-object-symbol role-${planet.role}`}
        />
        <div>
          <p className="panel-label">Selected {planet.role}</p>
          <h2 id={headingId}>{planet.name}</h2>
          <p className="selected-sound">
            <span>Sound</span>
            <strong>{planet.soundPresetId.replaceAll("-", " ")}</strong>
          </p>
          <p className="selected-material">
            <strong>Surface · {material.label}</strong>
            <span>{material.description}</span>
          </p>
        </div>
      </div>
      <div className="segmented-actions" aria-label="Planet states">
        <button
          type="button"
          onClick={actions.onMute}
          aria-pressed={planet.muted}
        >
          Mute
        </button>
        <button
          type="button"
          onClick={actions.onSolo}
          aria-pressed={planet.soloed}
        >
          Solo
        </button>
        <button
          type="button"
          onClick={actions.onLock}
          aria-pressed={planet.locked}
        >
          Lock
        </button>
      </div>
      {planet.role === "chords" && planet.expression.kind === "chords" ? (
        <fieldset className="role-expression-controls">
          <legend>Chord shape</legend>
          <p>Spread the notes apart, then choose how much color to add.</p>
          <label className="expression-slider" htmlFor={voicingId}>
            <span>
              <strong>Voicing</strong>
              <output htmlFor={voicingId}>
                {voicingLabel(planet.expression.voicingSpread)}
              </output>
            </span>
            <input
              id={voicingId}
              type="range"
              min="0"
              max="1"
              step="0.5"
              value={planet.expression.voicingSpread}
              onPointerDown={() => actions.onExpressionBegin("voicing")}
              onInput={(event) =>
                actions.onChordExpression({
                  voicingSpread: Number(event.currentTarget.value),
                })
              }
              onPointerUp={actions.onExpressionCommit}
              onPointerCancel={actions.onExpressionCommit}
              onKeyDown={(event) => {
                if (
                  RANGE_KEYS.includes(event.key as (typeof RANGE_KEYS)[number])
                )
                  actions.onExpressionBegin("voicing");
              }}
              onKeyUp={actions.onExpressionCommit}
              onBlur={actions.onExpressionCommit}
            />
            <small>
              <span>Closed</span>
              <span>Wide</span>
            </small>
          </label>
          <label className="expression-slider" htmlFor={chordComplexityId}>
            <span>
              <strong>Chord complexity</strong>
              <output htmlFor={chordComplexityId}>
                {complexityLabel(planet.expression.chordComplexity)}
              </output>
            </span>
            <input
              id={chordComplexityId}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={planet.expression.chordComplexity}
              onPointerDown={() =>
                actions.onExpressionBegin("chord-complexity")
              }
              onInput={(event) =>
                actions.onChordExpression({
                  chordComplexity: Number(event.currentTarget.value),
                })
              }
              onPointerUp={actions.onExpressionCommit}
              onPointerCancel={actions.onExpressionCommit}
              onKeyDown={(event) => {
                if (
                  RANGE_KEYS.includes(event.key as (typeof RANGE_KEYS)[number])
                )
                  actions.onExpressionBegin("chord-complexity");
              }}
              onKeyUp={actions.onExpressionCommit}
              onBlur={actions.onExpressionCommit}
            />
            <small>
              <span>Simple</span>
              <span>Rich</span>
            </small>
          </label>
        </fieldset>
      ) : null}
      {planet.role === "melody" && melodyExpression ? (
        <fieldset className="role-expression-controls">
          <legend>Melody shape</legend>
          <p>Control its pitch range and the direction it tends to travel.</p>
          <label className="expression-slider" htmlFor={pitchVarietyId}>
            <span>
              <strong>Pitch variety</strong>
              <output htmlFor={pitchVarietyId}>
                {varietyLabel(melodyExpression.pitchVariety)}
              </output>
            </span>
            <input
              id={pitchVarietyId}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={melodyExpression.pitchVariety}
              onPointerDown={() => actions.onExpressionBegin("pitch-variety")}
              onInput={(event) =>
                actions.onMelodyExpression({
                  pitchVariety: Number(event.currentTarget.value),
                })
              }
              onPointerUp={actions.onExpressionCommit}
              onPointerCancel={actions.onExpressionCommit}
              onKeyDown={(event) => {
                if (
                  RANGE_KEYS.includes(event.key as (typeof RANGE_KEYS)[number])
                )
                  actions.onExpressionBegin("pitch-variety");
              }}
              onKeyUp={actions.onExpressionCommit}
              onBlur={actions.onExpressionCommit}
            />
            <small>
              <span>Focused</span>
              <span>Varied</span>
            </small>
          </label>
          <fieldset className="contour-options">
            <legend>Preferred motion</legend>
            <div>
              {(
                [
                  ["ascending", "Ascend"],
                  ["alternating", "Alternate"],
                  ["descending", "Descend"],
                ] as const satisfies readonly (readonly [
                  MelodyContour,
                  string,
                ])[]
              ).map(([contour, label]) => (
                <button
                  type="button"
                  key={contour}
                  aria-pressed={melodyExpression.contour === contour}
                  onClick={() => actions.onMelodyExpression({ contour })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </fieldset>
      ) : null}
      <fieldset className="orbit-options">
        <legend>Orbit rate</legend>
        <p>
          One orbit takes this long. The musical pattern repeats at the same
          rate.
        </p>
        <div className="orbit-current" aria-live="polite" aria-atomic="true">
          <span>Current rate</span>
          <strong>{formatOrbitRate(planet.orbit.loopBars)}</strong>
          <small>
            Visible orbit and musical pattern · spatial lane arranged separately
          </small>
        </div>
        <div className="orbit-common-options" aria-label="Common orbit rates">
          {COMMON_ORBIT_RATE_OPTIONS.map((orbit) => (
            <button
              type="button"
              key={orbit.bars}
              className={planet.orbit.loopBars === orbit.bars ? "active" : ""}
              aria-label={`${orbit.label} orbit rate`}
              aria-pressed={planet.orbit.loopBars === orbit.bars}
              onClick={() => actions.onOrbit(orbit.bars)}
            >
              {orbit.compactLabel}
              <small>{orbit.bars <= 1 ? "bar" : "bars"}</small>
            </button>
          ))}
        </div>
        <label className="orbit-deeper-control">
          <span>More orbit rates</span>
          <select
            aria-label="More orbit rates"
            value={
              DEEP_ORBIT_RATE_OPTIONS.some(
                ({ bars }) => bars === planet.orbit.loopBars,
              )
                ? planet.orbit.loopBars
                : ""
            }
            onChange={(event) => {
              const orbit = parseOrbitRate(event.target.value);
              if (orbit !== undefined) actions.onOrbit(orbit);
            }}
          >
            <option value="" disabled>
              Explore ¼ to 8 bars
            </option>
            {DEEP_ORBIT_RATE_OPTIONS.map((orbit) => (
              <option key={orbit.bars} value={orbit.bars}>
                {orbit.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <p className="system-sync" aria-live="polite" aria-atomic="true">
        <strong>System sync · {formatBarCount(actions.superLoopBars)}</strong>
        <span>All active patterns meet at the start again here.</span>
      </p>
      <div className="gate-rhythm-control">
        <label htmlFor={gateRhythmId}>Gate rhythm</label>
        <p id={`${gateRhythmId}-hint`}>
          {gateRhythm?.description ??
            "A custom set of visible gates plays around this orbit"}
        </p>
        <select
          id={gateRhythmId}
          value={actions.gateRhythmPreset}
          aria-describedby={`${gateRhythmId}-hint`}
          onChange={(event) => {
            const presetId = event.target.value;
            if (presetId !== "custom") {
              actions.onGateRhythmPreset(presetId as GateRhythmPresetId);
            }
          }}
        >
          {actions.gateRhythmPreset === "custom" ? (
            <option value="custom">Custom orbit gates</option>
          ) : null}
          {GATE_RHYTHM_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="primary-panel-action"
        onClick={actions.onPattern}
        aria-label="Edit circular pattern"
        aria-describedby={`${gateRhythmId}-pattern-hint`}
      >
        <span>Edit circular pattern</span>
        <small id={`${gateRhythmId}-pattern-hint`}>
          Fine-tune individual orbit gates
        </small>
      </button>
      <button
        type="button"
        className="secondary-panel-action"
        onClick={actions.onRing}
        disabled={Boolean(planet.ring)}
      >
        {planet.ring ? "Rhythmic ring added" : "Add rhythmic ring"}
      </button>
      <div className="inspector-footer">
        <button type="button" onClick={actions.onDuplicate}>
          Duplicate
        </button>
        <div className="destruction-action">
          <button
            type="button"
            className="danger-action"
            onClick={actions.onDelete}
            disabled={!actions.canDelete}
            aria-label={`Delete ${planet.name} planet`}
            aria-describedby={deleteHintId}
          >
            Delete planet
          </button>
          <small id={deleteHintId}>
            {actions.canDelete
              ? "Deletes with a blast. Undo restores it."
              : "Keep at least one planet in orbit."}
          </small>
        </div>
      </div>
    </aside>
  );
}
