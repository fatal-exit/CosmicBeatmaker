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

export interface MacroControlsProps {
  macros: MacroState;
  onBegin: (key: keyof MacroState) => void;
  onChange: (key: keyof MacroState, value: number) => void;
  onCommit: () => void;
}

export function MacroControls({
  macros,
  onBegin,
  onChange,
  onCommit,
}: MacroControlsProps) {
  return (
    <section
      className="macro-bar"
      aria-labelledby="macro-heading"
      aria-describedby="macro-live-help"
    >
      <div className="macro-heading">
        <p className="panel-label">Shape the whole system</p>
        <h2 id="macro-heading">Performance controls</h2>
        <small id="macro-live-help">
          Changes reshape the playing loop live without replacing your pattern.
        </small>
      </div>
      <div className="macro-controls">
        {MACROS.map((macro) => (
          <label className="macro-control" key={macro.key}>
            <span>
              <strong>{macro.label}</strong>
              <output>{Math.round(macros[macro.key] * 100)}</output>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={macros[macro.key]}
              aria-describedby="macro-live-help"
              onPointerDown={() => onBegin(macro.key)}
              onChange={(event) =>
                onChange(macro.key, Number(event.target.value))
              }
              onPointerUp={onCommit}
              onKeyUp={onCommit}
            />
            <small>
              <span>{macro.low}</span>
              <span>{macro.high}</span>
            </small>
          </label>
        ))}
      </div>
    </section>
  );
}
