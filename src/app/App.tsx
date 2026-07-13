import { useId } from "react";

import { CURRENT_SCHEMA_VERSION } from "../domain/composition";
import { useAppStore } from "../state/store";

export function App() {
  const tempoId = useId();
  const history = useAppStore((state) => state.compositionHistory);
  const ui = useAppStore((state) => state.ui);
  const dispatch = useAppStore((state) => state.dispatch);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const selectObject = useAppStore((state) => state.selectObject);
  const composition = history.present;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="product-mark">Cosmic Beatmaker</p>
          <h1>{composition.name}</h1>
        </div>
        <div className="transport" aria-label="Transport controls">
          <button type="button" aria-label="Play composition" disabled>
            Play
          </button>
          <button type="button" aria-label="Stop composition" disabled>
            Stop
          </button>
          <label htmlFor={tempoId}>Tempo</label>
          <input
            id={tempoId}
            type="range"
            min="70"
            max="140"
            value={composition.bpm}
            onChange={(event) =>
              dispatch({ type: "SetTempo", bpm: Number(event.target.value) })
            }
          />
          <output htmlFor={tempoId}>{composition.bpm} BPM</output>
          <button
            type="button"
            onClick={undo}
            disabled={history.past.length === 0}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={history.future.length === 0}
          >
            Redo
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="object-panel" aria-labelledby="object-list-heading">
          <h2 id="object-list-heading">Your system</h2>
          <button
            type="button"
            className="object-row selected"
            onClick={() => selectObject(composition.star.id)}
          >
            <span aria-hidden="true" className="object-symbol star-symbol" />
            <span>
              <strong>Radiant star</strong>
              <small>Sets the mood</small>
            </span>
          </button>
          {composition.planets.map((planet) => (
            <button
              type="button"
              className={`object-row${ui.selectedObjectId === planet.id ? " selected" : ""}`}
              key={planet.id}
              onClick={() => selectObject(planet.id)}
              aria-pressed={ui.selectedObjectId === planet.id}
            >
              <span
                aria-hidden="true"
                className="object-symbol planet-symbol"
              />
              <span>
                <strong>{planet.name}</strong>
                <small>
                  {planet.role} · {planet.orbit.loopBars} bar loop
                </small>
              </span>
            </button>
          ))}
        </aside>

        <section
          className="scene-panel"
          aria-label="Cosmic instrument scene placeholder"
        >
          <div className="placeholder-cosmos" aria-hidden="true">
            <span className="placeholder-star" />
            <span className="placeholder-orbit" />
            <span className="placeholder-planet" />
          </div>
          <div className="scene-copy">
            <p>Scene connection ready</p>
            <span>Three.js arrives with the first playable orbit.</span>
          </div>
        </section>

        <aside className="inspector" aria-labelledby="inspector-heading">
          <p className="panel-label">Selected object</p>
          <h2 id="inspector-heading">Pulse</h2>
          <p>A clean beat planet on a one-bar orbit.</p>
          <div className="diagnostic" aria-label="Development diagnostics">
            <span>Seed</span>
            <code>{composition.seed}</code>
            <span>Schema</span>
            <code>v{CURRENT_SCHEMA_VERSION}</code>
          </div>
        </aside>
      </div>

      <section className="bottom-sheet" aria-label="Mobile object controls">
        <div>
          <span className="object-symbol planet-symbol" aria-hidden="true" />
          <span>
            <strong>Pulse</strong>
            <small>Beat · one bar</small>
          </span>
        </div>
        <button type="button" disabled>
          Edit pattern
        </button>
      </section>

      <p className="sr-only" aria-live="polite">
        {ui.announcement}
      </p>
    </main>
  );
}
