import type { Composition } from "../../domain/composition";

export interface ObjectListProps {
  composition: Composition;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ObjectList({
  composition,
  selectedId,
  onSelect,
}: ObjectListProps) {
  return (
    <nav className="object-panel" aria-labelledby="object-list-heading">
      <div className="panel-heading-row">
        <div>
          <p className="panel-label">Navigator</p>
          <h2 id="object-list-heading">Your system</h2>
        </div>
        <span>{composition.planets.length + 1}</span>
      </div>
      <div className="object-list">
        <button
          type="button"
          className={`object-row${selectedId === composition.star.id ? " selected" : ""}`}
          onClick={() => onSelect(composition.star.id)}
          aria-pressed={selectedId === composition.star.id}
        >
          <span aria-hidden="true" className="object-symbol star-symbol" />
          <span>
            <strong>{composition.star.presetId.replace("-", " ")} star</strong>
            <small>Sets mood and harmony</small>
          </span>
        </button>
        {composition.planets.map((planet) => (
          <button
            type="button"
            className={`object-row${selectedId === planet.id ? " selected" : ""}`}
            key={planet.id}
            onClick={() => onSelect(planet.id)}
            aria-pressed={selectedId === planet.id}
            aria-label={`${planet.name}, ${planet.role}, ${planet.soundPresetId}, ${planet.orbit.loopBars} bar loop${planet.muted ? ", muted" : ""}${planet.soloed ? ", soloed" : ""}${planet.locked ? ", locked" : ""}`}
          >
            <span
              aria-hidden="true"
              className={`object-symbol role-${planet.role}`}
            />
            <span>
              <strong>{planet.name}</strong>
              <small>
                {planet.role} · {planet.orbit.loopBars} bar
                {planet.muted ? " · muted" : ""}
              </small>
            </span>
            {planet.locked ? (
              <span className="state-glyph" title="Locked" aria-hidden="true">
                ◆
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
