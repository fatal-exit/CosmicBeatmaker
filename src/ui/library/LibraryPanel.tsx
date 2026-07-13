import type { CompositionSummary } from "../../persistence/LocalCompositionRepository";

export interface LibraryPanelProps {
  saves: CompositionSummary[];
  loading: boolean;
  onLoad: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onClose: () => void;
}

export function LibraryPanel({
  saves,
  loading,
  onLoad,
  onDelete,
  onClose,
}: LibraryPanelProps) {
  return (
    <section
      className="side-sheet library-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-heading"
    >
      <header>
        <div>
          <p className="panel-label">Local library</p>
          <h2 id="library-heading">Saved systems</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close saved systems"
        >
          ×
        </button>
      </header>
      {loading ? (
        <p role="status">Reading local orbits…</p>
      ) : saves.length === 0 ? (
        <div className="empty-state">
          <span className="mini-star" aria-hidden="true" />
          <h3>Your first save will appear here.</h3>
          <p>
            Save the current system from the top bar. Everything stays in this
            browser.
          </p>
        </div>
      ) : (
        <ul className="save-list">
          {saves.map((save) => (
            <li key={save.id}>
              <button
                type="button"
                className="save-main"
                onClick={() => void onLoad(save.id)}
              >
                <strong>{save.name}</strong>
                <small>
                  {save.planetCount} planets · {save.seed}
                </small>
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={() => void onDelete(save.id)}
                aria-label={`Delete ${save.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
