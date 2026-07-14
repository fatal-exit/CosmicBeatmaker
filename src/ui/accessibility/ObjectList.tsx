import { getSoundPresetDefinition } from "../../content/soundPresets";
import type { Composition } from "../../domain/composition";
import { PLANET_MATERIAL_PROFILES } from "../../scene/materials/profiles";
import {
  formatOrbitLoop,
  formatOrbitRate,
} from "../inspector/orbitRateOptions";

export interface ObjectListProps {
  composition: Composition;
  selectedId: string | null;
  onSelect: (id: string) => void;
  advanced?: boolean;
  headingId?: string;
}

export function ObjectList({
  composition,
  selectedId,
  onSelect,
  advanced = false,
  headingId = "object-list-heading",
}: ObjectListProps) {
  return (
    <nav
      className="object-panel"
      aria-labelledby={headingId}
      data-advanced={advanced}
    >
      <div className="panel-heading-row">
        <div>
          <p className="panel-label">Navigator</p>
          <h2 id={headingId}>Your system</h2>
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
            <small>{advanced ? "Sets mood and harmony" : "System mood"}</small>
          </span>
        </button>
        {composition.planets.map((planet) => {
          const material = PLANET_MATERIAL_PROFILES[planet.role];
          const soundName =
            getSoundPresetDefinition(planet.soundPresetId)?.name ??
            planet.soundPresetId.replaceAll("-", " ");

          return (
            <button
              type="button"
              className={`object-row${selectedId === planet.id ? " selected" : ""}`}
              key={planet.id}
              onClick={() => onSelect(planet.id)}
              aria-pressed={selectedId === planet.id}
              aria-label={`${planet.name}, ${planet.role} role, ${material.label} material, ${soundName} sound, ${formatOrbitLoop(planet.orbit.loopBars)}, ${planet.moons.length} ${planet.moons.length === 1 ? "moon" : "moons"}${planet.ring ? ", rhythmic ring" : ""}${planet.muted ? ", muted" : ""}${planet.soloed ? ", soloed" : ""}${planet.locked ? ", locked" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`object-symbol role-${planet.role}`}
              />
              <span>
                <strong>{planet.name}</strong>
                <small>
                  {planet.role} · {soundName}
                  {advanced ? (
                    <>
                      {" · "}
                      <span className="object-material-label">
                        {material.label}
                      </span>{" "}
                      · {formatOrbitRate(planet.orbit.loopBars)}
                      {planet.moons.length > 0
                        ? ` · ${planet.moons.length} moon${planet.moons.length === 1 ? "" : "s"}`
                        : ""}
                    </>
                  ) : planet.ring ? (
                    " · ring"
                  ) : null}
                  {planet.muted ? " · muted" : ""}
                </small>
              </span>
              {planet.locked ? (
                <span className="state-glyph" title="Locked" aria-hidden="true">
                  ◆
                </span>
              ) : null}
            </button>
          );
        })}
        {composition.asteroidBelt ? (
          <div className="object-row structural-object" role="status">
            <span
              aria-hidden="true"
              className="object-symbol asteroid-symbol"
            />
            <span>
              <strong>Asteroid belt</strong>
              <small>Seeded irregular percussion</small>
            </span>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
