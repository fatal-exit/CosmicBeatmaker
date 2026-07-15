import { STAR_PRESETS } from "../../content/starPresets";
import type {
  BinaryRhythmMode,
  CompanionStarPresetId,
  StarPresetId,
  StarState,
} from "../../domain/composition";

const COMPANION_PRESETS = (Object.keys(STAR_PRESETS) as StarPresetId[]).filter(
  (presetId): presetId is CompanionStarPresetId => {
    return presetId !== "black-hole";
  },
);

const RHYTHM_MODES: ReadonlyArray<{
  id: BinaryRhythmMode;
  label: string;
  description: string;
}> = [
  {
    id: "interlock",
    label: "Interlock",
    description:
      "The companion moves one subdivision, weaving the two palettes.",
  },
  {
    id: "mirror",
    label: "Mirror",
    description:
      "The companion reflects its event positions across each orbit.",
  },
  {
    id: "call-response",
    label: "Call and response",
    description: "The companion answers after the primary star speaks.",
  },
];

export interface StarInspectorProps {
  star: StarState;
  onPreset: (presetId: StarPresetId) => void;
  onAddBinary: () => void;
  onUpdateBinary: (options: {
    presetId?: CompanionStarPresetId;
    rhythmMode?: BinaryRhythmMode;
  }) => void;
  onRemoveBinary: () => void;
  headingId?: string;
}

function presetLabel(presetId: StarPresetId): string {
  return STAR_PRESETS[presetId].name;
}

function rhythmModeLabel(mode: BinaryRhythmMode): string {
  return RHYTHM_MODES.find((option) => option.id === mode)?.label ?? mode;
}

export function StarInspector({
  star,
  onPreset,
  onAddBinary,
  onUpdateBinary,
  onRemoveBinary,
  headingId = "inspector-heading",
}: StarInspectorProps) {
  const preset = STAR_PRESETS[star.presetId];
  const companion = star.companion;
  const companionPresets = COMPANION_PRESETS.filter(
    (presetId) =>
      presetId !== star.presetId || presetId === companion?.presetId,
  );
  const rhythm = companion
    ? RHYTHM_MODES.find((mode) => mode.id === companion.rhythmMode)
    : undefined;

  return (
    <aside className="inspector star-inspector" aria-labelledby={headingId}>
      <div className="selected-summary">
        <span
          aria-hidden="true"
          className={`large-object-symbol star-symbol star-symbol-${star.presetId}`}
        />
        <div>
          <p className="panel-label">Selected primary star</p>
          <h2 id={headingId}>{preset.name}</h2>
          <p className="selected-star-summary">
            <strong>{preset.mood} mood</strong>
            <span>{preset.description}</span>
          </p>
        </div>
      </div>

      <fieldset className="star-mood-control">
        <legend>Primary mood</legend>
        <p>
          Choose the musical palette that guides every orbit in this system.
        </p>
        <label htmlFor={`${headingId}-preset`}>Star palette</label>
        <select
          id={`${headingId}-preset`}
          value={star.presetId}
          onChange={(event) => onPreset(event.target.value as StarPresetId)}
        >
          {(Object.keys(STAR_PRESETS) as StarPresetId[]).map((presetId) => (
            <option key={presetId} value={presetId}>
              {presetLabel(presetId)} · {STAR_PRESETS[presetId].description}
            </option>
          ))}
        </select>
      </fieldset>

      {star.presetId === "black-hole" ? (
        <div className="star-behavior-note" role="note">
          <strong>Black Hole behavior</strong>
          <p>
            Half-speed gravity stretches the feel, pulls pitched voices an
            octave down, adds a digital edge, and opens a larger, darker reverb
            space between events.
          </p>
        </div>
      ) : null}

      <section
        className="binary-companion-control"
        aria-labelledby={`${headingId}-binary`}
      >
        <div className="binary-section-heading">
          <div>
            <p className="panel-label">Optional second star</p>
            <h3 id={`${headingId}-binary`}>Binary companion</h3>
          </div>
          {companion ? <span className="binary-status">Active</span> : null}
        </div>
        {companion ? (
          <>
            <p className="binary-summary" aria-live="polite">
              <strong>
                Primary {presetLabel(star.presetId)} palette + companion{" "}
                {presetLabel(companion.presetId)} palette ·{" "}
                {rhythmModeLabel(companion.rhythmMode)}
              </strong>
              <span>
                Planets alternate between the two palettes.{" "}
                {rhythm?.description}
              </span>
            </p>
            <label htmlFor={`${headingId}-companion-preset`}>
              Companion palette
            </label>
            <select
              id={`${headingId}-companion-preset`}
              value={companion.presetId}
              onChange={(event) =>
                onUpdateBinary({
                  presetId: event.target.value as CompanionStarPresetId,
                })
              }
            >
              {companionPresets.map((presetId) => (
                <option key={presetId} value={presetId}>
                  {presetLabel(presetId)} palette
                </option>
              ))}
            </select>
            <label htmlFor={`${headingId}-rhythm-mode`}>
              Rhythm relationship
            </label>
            <select
              id={`${headingId}-rhythm-mode`}
              value={companion.rhythmMode}
              onChange={(event) =>
                onUpdateBinary({
                  rhythmMode: event.target.value as BinaryRhythmMode,
                })
              }
            >
              {RHYTHM_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label} · {mode.description}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="secondary-panel-action"
              onClick={onRemoveBinary}
            >
              Remove binary companion
            </button>
          </>
        ) : (
          <>
            <p>
              Add one ordinary star palette. Its rhythm relationship makes the
              second palette easy to understand without changing your patterns.
            </p>
            <button
              type="button"
              className="primary-panel-action"
              onClick={onAddBinary}
            >
              <span>Add binary companion</span>
              <small>Choose its palette and relationship next</small>
            </button>
          </>
        )}
      </section>
    </aside>
  );
}
