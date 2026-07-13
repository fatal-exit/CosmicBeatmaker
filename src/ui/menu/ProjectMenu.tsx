import {
  SHOWCASE_SYSTEMS,
  type ShowcaseSystemDefinition,
} from "../../content/showcaseSystems";
import type { EphemeralUiState } from "../../state/store";

export interface ProjectMenuProps {
  quality: EphemeralUiState["quality"];
  reducedEffects: boolean;
  reducedFlash: boolean;
  onQuality: (quality: EphemeralUiState["quality"]) => void;
  onReducedEffects: (value: boolean) => void;
  onReducedFlash: (value: boolean) => void;
  onSave: () => void | Promise<void>;
  onLibrary: () => void;
  onShare: () => void | Promise<void>;
  onExport: () => void;
  onJson: () => void;
  onSurprise: () => void;
  onShowcase: (showcase: ShowcaseSystemDefinition) => void;
  onClose: () => void;
}

export function ProjectMenu(props: ProjectMenuProps) {
  return (
    <section
      className="side-sheet project-menu"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-heading"
    >
      <header>
        <div>
          <p className="panel-label">Project</p>
          <h2 id="menu-heading">System menu</h2>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close project menu"
        >
          ×
        </button>
      </header>
      <div className="menu-actions">
        <button type="button" onClick={() => void props.onSave()}>
          <span>Save current system</span>
          <small>Keep it safely in this browser</small>
        </button>
        <button type="button" onClick={props.onLibrary}>
          <span>Saved systems</span>
          <small>Load or remove local projects</small>
        </button>
        <button type="button" onClick={() => void props.onShare()}>
          <span>Copy share link</span>
          <small>Complete state, no account required</small>
        </button>
        <button type="button" onClick={props.onExport}>
          <span>Export audio or MIDI</span>
          <small>Use your loop in another project</small>
        </button>
        <button type="button" onClick={props.onJson}>
          <span>Download project JSON</span>
          <small>A portable safety copy</small>
        </button>
        <button type="button" onClick={props.onSurprise}>
          <span>Surprise me</span>
          <small>Regenerate the unlocked system</small>
        </button>
      </div>
      <section className="showcase-picker" aria-labelledby="showcase-heading">
        <div>
          <p className="panel-label">Curated systems</p>
          <h3 id="showcase-heading">Jump to a showcase</h3>
        </div>
        <div className="showcase-list">
          {SHOWCASE_SYSTEMS.map((showcase) => (
            <button
              type="button"
              key={showcase.id}
              onClick={() => props.onShowcase(showcase)}
            >
              <span>{showcase.name}</span>
              <small>{showcase.description}</small>
            </button>
          ))}
        </div>
      </section>
      <fieldset className="preferences">
        <legend>Visual comfort</legend>
        <label>
          Quality
          <select
            value={props.quality}
            onChange={(event) =>
              props.onQuality(event.target.value as EphemeralUiState["quality"])
            }
          >
            <option value="auto">Auto</option>
            <option value="low">Low</option>
            <option value="balanced">Balanced</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.reducedEffects}
            onChange={(event) => props.onReducedEffects(event.target.checked)}
          />{" "}
          Reduce particles and motion
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.reducedFlash}
            onChange={(event) => props.onReducedFlash(event.target.checked)}
          />{" "}
          Reduce event flashes
        </label>
      </fieldset>
    </section>
  );
}
