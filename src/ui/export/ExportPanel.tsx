export interface ExportPanelProps {
  status: "idle" | "working" | "error";
  message: string;
  repetitions: 2 | 4 | 8;
  onRepetitions: (value: 2 | 4 | 8) => void;
  onWav: () => void | Promise<void>;
  onMidi: () => void | Promise<void>;
  onJson: () => void;
  onCancel: () => void;
  onClose: () => void;
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
      <fieldset className="repetition-options">
        <legend>Loop repetitions</legend>
        <div>
          {([2, 4, 8] as const).map((value) => (
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
          <small>Stereo mix with a short effects tail</small>
        </button>
        <button
          type="button"
          className="secondary-panel-action"
          onClick={() => void props.onMidi()}
          disabled={props.status === "working"}
        >
          <span>Multitrack MIDI</span>
          <small>One useful track for each orbit</small>
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
