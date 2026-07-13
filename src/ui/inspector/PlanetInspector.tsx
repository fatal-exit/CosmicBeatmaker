import { useId } from "react";

import type { LoopBars, PlanetState } from "../../domain/composition";
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
  gateRhythmPreset: GateRhythmPresetId | "custom";
  onGateRhythmPreset: (presetId: GateRhythmPresetId) => void;
  onPattern: () => void;
  onRing: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  headingId?: string;
}

export function PlanetInspector({ planet, ...actions }: PlanetInspectorProps) {
  const gateRhythmId = useId();
  const deleteHintId = useId();
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
          <p>{planet.soundPresetId.replaceAll("-", " ")}</p>
          <p className="selected-material">
            <strong>{material.label}</strong>
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
