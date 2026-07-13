export interface ExportPanelProps {
  status: "idle" | "working" | "error";
  message: string;
  superLoopBars: number;
  bpm: number;
  beatsPerBar: number;
  repetitions: 1 | 2 | 4;
  onRepetitions: (value: 1 | 2 | 4) => void;
  onWav: () => void | Promise<void>;
  onMidi: () => void | Promise<void>;
  onJson: () => void;
  onCancel: () => void;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds * 100) / 100;
  if (rounded < 60) return `${rounded} ${rounded === 1 ? "second" : "seconds"}`;
  const minutes = Math.floor(rounded / 60);
  const remainder = Math.round((rounded - minutes * 60) * 10) / 10;
  return remainder === 0
    ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
    : `${minutes} min ${remainder} sec`;
}

export function ExportPanel(props: ExportPanelProps) {
  return (
    <section
      className="side-sheet export-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-heading"
    >
      <header>
        <div>
          <p className="panel-label">Take it with you</p>
          <h2 id="export-heading">Export this system</h2>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close export menu"
        >
          ×
        </button>
      </header>
      <div className="export-loop-summary" aria-live="polite">
        <p>
          <strong>{props.superLoopBars}-bar super-loop</strong>
          <span>Every active pattern resynchronizes at this boundary.</span>
        </p>
        <p>
          <strong>
            {props.superLoopBars * props.repetitions} bars ·{" "}
            {formatDuration(
              (props.superLoopBars *
                props.repetitions *
                props.beatsPerBar *
                60) /
                props.bpm,
            )}
          </strong>
          <span>
            {props.repetitions} complete super-loop
            {props.repetitions === 1 ? "" : "s"}
          </span>
        </p>
      </div>
      <fieldset className="repetition-options">
        <legend>Complete super-loops</legend>
        <div>
          {([1, 2, 4] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={props.repetitions === value ? "active" : ""}
              aria-pressed={props.repetitions === value}
              onClick={() => props.onRepetitions(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </fieldset>
      <div className="export-actions">
        <button
          type="button"
          className="primary-panel-action"
          onClick={() => void props.onWav()}
          disabled={props.status === "working"}
        >
          <span>WAV audio</span>
          <small>Stereo mix; adds a 0.4-second effects tail</small>
        </button>
        <button
          type="button"
          className="secondary-panel-action"
          onClick={() => void props.onMidi()}
          disabled={props.status === "working"}
        >
          <span>Multitrack MIDI</span>
          <small>One useful track per orbit; ends on the sync boundary</small>
        </button>
        <button
          type="button"
          className="secondary-panel-action"
          onClick={props.onJson}
        >
          <span>Project JSON</span>
          <small>Complete editable state</small>
        </button>
      </div>
      {props.status !== "idle" ? (
        <p className={`export-status ${props.status}`} role="status">
          {props.message}
        </p>
      ) : null}
      {props.status === "working" ? (
        <button
          type="button"
          className="secondary-panel-action"
          onClick={props.onCancel}
        >
          Cancel WAV export
        </button>
      ) : null}
    </section>
  );
}
