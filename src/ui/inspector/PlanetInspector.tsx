import { useId } from "react";

import { getSoundPresetDefinition } from "../../content/soundPresets";
import type {
  LoopBars,
  MelodyContour,
  MoonBehaviorPresetId,
  PatternGridSize,
  PlanetExpressionState,
  PlanetState,
  StarPresetId,
} from "../../domain/composition";
import {
  GATE_RHYTHM_PRESETS,
  type GateRhythmPresetId,
} from "../../domain/rhythm/gatePresets";
import {
  FRIENDLY_PATTERN_GRID_SIZES,
  naturalPatternGridSizesForLoopBars,
  POLYRHYTHM_PATTERN_GRID_SIZES,
} from "../../domain/rhythm/directGateEditing";
import { PLANET_MATERIAL_PROFILES } from "../../scene/materials/profiles";
import { GateOffsetControl } from "../focus/GateOffsetControl";
import {
  SoundChoice,
  type DrumKitImport,
  type PitchedSoundImport,
  type SoundImportResult,
} from "../sound/SoundChoice";
import {
  COMMON_ORBIT_RATE_OPTIONS,
  DEEP_ORBIT_RATE_OPTIONS,
  formatBarCount,
  formatOrbitRate,
  parseOrbitRate,
} from "./orbitRateOptions";

export interface PlanetInspectorProps {
  planet?: PlanetState;
  starPresetId?: StarPresetId;
  superLoopBars: number;
  advanced: boolean;
  onAdvancedChange: (advanced: boolean) => void;
  onSurprise: () => void;
  onMute: () => void;
  onSolo: () => void;
  onLock: () => void;
  onSound?: (soundPresetId: string) => void;
  onImportPitched?: (input: PitchedSoundImport) => Promise<SoundImportResult>;
  onImportDrumKit?: (input: DrumKitImport) => Promise<SoundImportResult>;
  onOrbit: (loopBars: LoopBars) => void;
  onPatternGridSize: (gridSize: PatternGridSize) => void;
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
  onGateOffsetNudge: (direction: -1 | 1) => void;
  onGateOffsetReset: () => void;
  onPattern: () => void;
  onRing: () => void;
  onRingDensityBegin: () => void;
  onRingDensityChange: (density: number) => void;
  onRingDensityCommit: () => void;
  onMoonBehavior: (
    moonId: string,
    behaviorPresetId: MoonBehaviorPresetId,
  ) => void;
  onMoonMute: (moonId: string) => void;
  onRemoveMoon: (moonId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  headingId?: string;
}

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
  const ringDensityId = useId();
  const moonControlPrefix = useId();
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
  const soundName =
    getSoundPresetDefinition(planet.soundPresetId)?.name ??
    planet.soundPresetId.replaceAll("-", " ");
  const gateRhythm = GATE_RHYTHM_PRESETS.find(
    ({ id }) => id === actions.gateRhythmPreset,
  );
  const melodyExpression =
    planet.expression.kind === "melody" ? planet.expression : undefined;
  const ringActiveCount = planet.ring?.active.filter(Boolean).length ?? 0;
  const ringBehavior =
    planet.role === "melody"
      ? "Quiet ghost notes appear just before and after motif notes."
      : planet.role === "chords"
        ? "The ring replaces chord hits with an arpeggio throughout the orbit."
        : planet.role === "bass"
          ? "The ring adds syncopated octave pickups and occasional fifths."
          : planet.role === "texture"
            ? "The ring adds a light, regular shaker texture."
            : "The ring adds a regular high-percussion pulse.";
  const naturalStepCounts = naturalPatternGridSizesForLoopBars(
    planet.orbit.loopBars,
  );
  const friendlyStepCounts = FRIENDLY_PATTERN_GRID_SIZES.filter((gridSize) =>
    naturalStepCounts.includes(gridSize),
  );
  const polyrhythmStepCounts = POLYRHYTHM_PATTERN_GRID_SIZES.filter(
    (gridSize) => naturalStepCounts.includes(gridSize),
  );

  return (
    <aside
      className="inspector"
      aria-labelledby={headingId}
      data-advanced={actions.advanced}
    >
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
            <strong>{soundName}</strong>
          </p>
          <p className="selected-material advanced-only">
            <strong>Surface · {material.label}</strong>
            <span>{material.description}</span>
          </p>
        </div>
      </div>
      <button
        type="button"
        className="planet-surprise-action"
        onClick={actions.onSurprise}
        disabled={planet.locked}
      >
        <span>Surprise this planet</span>
        <small>
          {planet.locked
            ? "Unlock this planet first"
            : "New sound, orbit, and musical pattern"}
        </small>
      </button>
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
      {actions.starPresetId &&
      actions.onSound &&
      actions.onImportPitched &&
      actions.onImportDrumKit ? (
        <SoundChoice
          key={planet.id}
          planet={planet}
          starPresetId={actions.starPresetId}
          onSound={actions.onSound}
          onImportPitched={actions.onImportPitched}
          onImportDrumKit={actions.onImportDrumKit}
        />
      ) : null}
      {planet.role === "chords" && planet.expression.kind === "chords" ? (
        <fieldset className="role-expression-controls advanced-only">
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
              onInput={(event) => {
                actions.onExpressionBegin("voicing");
                actions.onChordExpression({
                  voicingSpread: Number(event.currentTarget.value),
                });
              }}
              onPointerUp={actions.onExpressionCommit}
              onPointerCancel={actions.onExpressionCommit}
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
              onInput={(event) => {
                actions.onExpressionBegin("chord-complexity");
                actions.onChordExpression({
                  chordComplexity: Number(event.currentTarget.value),
                });
              }}
              onPointerUp={actions.onExpressionCommit}
              onPointerCancel={actions.onExpressionCommit}
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
        <fieldset className="role-expression-controls advanced-only">
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
              onInput={(event) => {
                actions.onExpressionBegin("pitch-variety");
                actions.onMelodyExpression({
                  pitchVariety: Number(event.currentTarget.value),
                });
              }}
              onPointerUp={actions.onExpressionCommit}
              onPointerCancel={actions.onExpressionCommit}
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
        <legend>{actions.advanced ? "Orbit rate" : "Loop speed"}</legend>
        <p>
          {actions.advanced
            ? "One orbit takes this long. The musical pattern repeats at the same rate."
            : "Choose how quickly this planet repeats its musical part."}
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
        <label className="orbit-deeper-control advanced-only">
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
      <p
        className="system-sync advanced-only"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>System sync · {formatBarCount(actions.superLoopBars)}</strong>
        <span>All active patterns meet at the start again here.</span>
      </p>
      <fieldset className="gate-count-control">
        <legend>Steps around this orbit</legend>
        <p>
          Use fewer gates for a clearer rhythm. Larger gates mark beats; medium
          gates mark offbeat 8ths.
        </p>
        {friendlyStepCounts.length > 0 ? (
          <div aria-label="Recommended step counts">
            {friendlyStepCounts.map((gridSize) => (
              <button
                type="button"
                key={gridSize}
                aria-label={`${gridSize} steps`}
                aria-pressed={planet.pattern.gridSize === gridSize}
                disabled={planet.locked}
                onClick={() => actions.onPatternGridSize(gridSize)}
              >
                <strong>{gridSize}</strong>
                <small>
                  {gridSize === 4
                    ? "Beats"
                    : gridSize === 8
                      ? "8ths"
                      : gridSize === 16
                        ? "16ths"
                        : "Fine"}
                </small>
              </button>
            ))}
          </div>
        ) : null}
        {polyrhythmStepCounts.length > 0 ? (
          <div className="polyrhythm-step-options advanced-only">
            <span>Polyrhythm</span>
            <div aria-label="Polyrhythm step counts">
              {polyrhythmStepCounts.map((gridSize) => (
                <button
                  type="button"
                  key={gridSize}
                  aria-label={`${gridSize} polyrhythm steps`}
                  aria-pressed={planet.pattern.gridSize === gridSize}
                  disabled={planet.locked}
                  onClick={() => actions.onPatternGridSize(gridSize)}
                >
                  {gridSize}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>
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
      <GateOffsetControl
        phase={planet.orbit.phase}
        gridSize={planet.pattern.gridSize}
        locked={planet.locked}
        onNudge={actions.onGateOffsetNudge}
        onReset={actions.onGateOffsetReset}
      />
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
      <p className="direct-gate-help">
        On the solar system, choose Edit gates before changing slots. Inactive
        slots stay quiet and cannot be tapped until editing is on. Arc drag
        rotates the gates only in that mode.
        {planet.role === "melody"
          ? " Drag an active melody gate outward for a higher note or inward for a lower one."
          : ""}
      </p>
      {planet.ring ? (
        <div className="ring-density-control">
          <label htmlFor={ringDensityId}>
            <span>Ring density</span>
            <output>{ringActiveCount}</output>
          </label>
          <p id={`${ringDensityId}-hint`}>{ringBehavior}</p>
          <input
            id={ringDensityId}
            type="range"
            min="0"
            max={planet.ring.segments}
            step="1"
            value={ringActiveCount}
            aria-describedby={`${ringDensityId}-hint`}
            aria-valuetext={`${ringActiveCount} of ${planet.ring.segments} ring segments active`}
            onPointerDown={actions.onRingDensityBegin}
            onInput={(event) => {
              actions.onRingDensityBegin();
              actions.onRingDensityChange(
                Number(event.currentTarget.value) / planet.ring!.segments,
              );
            }}
            onPointerUp={actions.onRingDensityCommit}
            onPointerCancel={actions.onRingDensityCommit}
            onKeyUp={actions.onRingDensityCommit}
            onBlur={actions.onRingDensityCommit}
          />
          <small>
            <span>Open</span>
            <span>Full</span>
          </small>
        </div>
      ) : (
        <button
          type="button"
          className="secondary-panel-action"
          onClick={actions.onRing}
        >
          Add rhythmic ring
        </button>
      )}
      {planet.moons.length > 0 ? (
        <fieldset className="moon-controls">
          <legend>Orbiting moons</legend>
          <p>
            Each moon adds a small linked accent. Choose its behavior, silence
            it, or remove it without touching the parent planet.
          </p>
          <div className="moon-list">
            {planet.moons.map((moon, index) => (
              <div className="moon-control" key={moon.id}>
                <div className="moon-control-heading">
                  <strong>Moon {index + 1}</strong>
                  <span>{moon.muted ? "Muted" : "Playing"}</span>
                </div>
                <label htmlFor={`${moonControlPrefix}-${moon.id}`}>
                  Behavior
                  <select
                    id={`${moonControlPrefix}-${moon.id}`}
                    aria-label={`Moon ${index + 1} behavior`}
                    value={moon.behaviorPresetId}
                    disabled={planet.locked}
                    onChange={(event) =>
                      actions.onMoonBehavior(
                        moon.id,
                        event.target.value as MoonBehaviorPresetId,
                      )
                    }
                  >
                    <option value="accent">
                      Accent · highlight the groove
                    </option>
                    <option value="echo">Echo · answer nearby hits</option>
                    <option value="harmony">
                      Harmony · support pitched notes
                    </option>
                    <option value="pickup">
                      Pickup · lead into the next beat
                    </option>
                    <option value="fill">Fill · add a short flourish</option>
                    <option value="counterpulse">
                      Counterpulse · fill the gaps
                    </option>
                  </select>
                </label>
                <div className="moon-control-actions">
                  <button
                    type="button"
                    onClick={() => actions.onMoonMute(moon.id)}
                    disabled={planet.locked}
                    aria-pressed={moon.muted}
                    aria-label={`${moon.muted ? "Unmute" : "Mute"} moon ${index + 1}`}
                  >
                    {moon.muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() => actions.onRemoveMoon(moon.id)}
                    disabled={planet.locked}
                    aria-label={`Remove moon ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      <button
        type="button"
        className="inspector-depth-toggle"
        aria-expanded={actions.advanced}
        onClick={() => actions.onAdvancedChange(!actions.advanced)}
      >
        {actions.advanced ? "Hide advanced controls" : "More planet controls"}
      </button>
      <div className="inspector-footer advanced-only">
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
