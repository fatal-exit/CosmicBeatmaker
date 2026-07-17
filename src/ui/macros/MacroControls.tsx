import type { CSSProperties } from "react";

import type { MacroState } from "../../domain/composition";

const MACROS: Array<{
  key: keyof MacroState;
  label: string;
  low: string;
  high: string;
}> = [
  { key: "energy", label: "Energy", low: "Calm", high: "Charged" },
  { key: "density", label: "Density", low: "Open", high: "Busy" },
  { key: "groove", label: "Groove", low: "Straight", high: "Bouncy" },
  { key: "space", label: "Space", low: "Close", high: "Vast" },
  {
    key: "complexity",
    label: "Complexity",
    low: "Stable",
    high: "Adventurous",
  },
];

export type MacroControlKey = keyof MacroState | "volume";

const SIMPLE_KEYS: readonly MacroControlKey[] = ["energy", "density", "space"];
const ADVANCED_KEYS: readonly MacroControlKey[] = [
  "energy",
  "density",
  "groove",
  "space",
  "complexity",
  "volume",
];

export interface MacroControlsProps {
  macros: MacroState;
  masterLevel: number;
  advanced: boolean;
  onAdvancedChange: (advanced: boolean) => void;
  onBegin: (key: MacroControlKey) => void;
  onChange: (key: MacroControlKey, value: number) => void;
  onCommit: () => void;
}

function controlDefinition(key: MacroControlKey) {
  if (key === "volume") {
    return { key, label: "Volume", low: "Quiet", high: "Full" } as const;
  }
  const macro = MACROS.find((candidate) => candidate.key === key);
  if (!macro) throw new Error(`Unknown macro control: ${key}`);
  return macro;
}

interface MacroKnobProps {
  controlKey: MacroControlKey;
  label?: string;
  value: number;
  onBegin: (key: MacroControlKey) => void;
  onChange: (key: MacroControlKey, value: number) => void;
  onCommit: () => void;
}

function MacroKnob({
  controlKey,
  label,
  value,
  onBegin,
  onChange,
  onCommit,
}: MacroKnobProps) {
  const definition = controlDefinition(controlKey);
  const visibleLabel = label ?? definition.label;
  const percentage = Math.round(value * 100);
  return (
    <label className="macro-knob">
      <strong>{visibleLabel}</strong>
      <span
        className="macro-knob-control"
        style={
          {
            "--knob-angle": `${-135 + value * 270}deg`,
            "--knob-sweep": `${value * 270}deg`,
          } as CSSProperties
        }
      >
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value}
          aria-label={visibleLabel}
          aria-valuetext={`${percentage} percent, from ${definition.low} to ${definition.high}`}
          onPointerDown={() => onBegin(controlKey)}
          onInput={(event) => {
            onBegin(controlKey);
            onChange(controlKey, Number(event.currentTarget.value));
          }}
          onPointerUp={onCommit}
          onPointerCancel={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
        <span className="macro-knob-face" aria-hidden="true">
          <span />
        </span>
      </span>
      <output>{percentage}</output>
      <small>
        <span>{definition.low}</span>
        <span>{definition.high}</span>
      </small>
    </label>
  );
}

export function MacroControls({
  macros,
  masterLevel,
  advanced,
  onAdvancedChange,
  onBegin,
  onChange,
  onCommit,
}: MacroControlsProps) {
  const controls = advanced ? ADVANCED_KEYS : SIMPLE_KEYS;
  return (
    <section
      className="macro-bar"
      aria-labelledby="macro-heading"
      aria-describedby="macro-live-help"
    >
      <div className="macro-heading">
        <p className="panel-label">Shape the whole system</p>
        <h2 id="macro-heading">Make it yours</h2>
        <small id="macro-live-help">
          Turn three friendly controls. Your pattern stays safe.
        </small>
        <button
          type="button"
          className="advanced-controls-toggle"
          aria-expanded={advanced}
          onClick={() => onAdvancedChange(!advanced)}
        >
          {advanced ? "Use simple controls" : "Show 6 advanced controls"}
        </button>
      </div>
      <p className="macro-scroll-hint">
        {advanced ? "Six detailed controls" : "Three simple controls"}
        <button
          type="button"
          aria-expanded={advanced}
          onClick={() => onAdvancedChange(!advanced)}
        >
          {advanced ? "Simple" : "Advanced"}
        </button>
      </p>
      <div className="macro-scroll-viewport">
        <div className="macro-controls" data-advanced={advanced}>
          {controls.map((controlKey) => (
            <MacroKnob
              key={controlKey}
              controlKey={controlKey}
              label={
                !advanced && controlKey === "density" ? "Activity" : undefined
              }
              value={controlKey === "volume" ? masterLevel : macros[controlKey]}
              onBegin={onBegin}
              onChange={onChange}
              onCommit={onCommit}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
