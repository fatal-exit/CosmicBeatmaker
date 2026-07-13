import type { LoopBars, PlanetState } from "../../domain/composition";

const ORBITS: LoopBars[] = [0.5, 1, 2, 4];

export interface PlanetInspectorProps {
  planet?: PlanetState;
  onMute: () => void;
  onSolo: () => void;
  onLock: () => void;
  onOrbit: (loopBars: LoopBars) => void;
  onPattern: () => void;
  onRing: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  headingId?: string;
}

export function PlanetInspector({ planet, ...actions }: PlanetInspectorProps) {
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
        <legend>Orbit length</legend>
        <p>Closer orbits repeat faster.</p>
        <div>
          {ORBITS.map((orbit) => (
            <button
              type="button"
              key={orbit}
              className={planet.orbit.loopBars === orbit ? "active" : ""}
              aria-pressed={planet.orbit.loopBars === orbit}
              onClick={() => actions.onOrbit(orbit)}
            >
              {orbit === 0.5 ? "½" : orbit}
              <small>{orbit === 1 ? "bar" : "bars"}</small>
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        className="primary-panel-action"
        onClick={actions.onPattern}
      >
        Edit circular pattern
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
        <button
          type="button"
          className="danger-action"
          onClick={actions.onDelete}
        >
          Delete
        </button>
      </div>
    </aside>
  );
}
