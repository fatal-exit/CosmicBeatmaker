import type { PlanetRole } from "../../domain/composition";
import { PLANET_MATERIAL_PROFILES } from "../../scene/materials/profiles";

export interface ScenePolishOverlayProps {
  selectedPlanetRole?: PlanetRole;
  selectedPlanetName?: string;
  isPlaying: boolean;
  isLocked?: boolean;
}

export function ScenePolishOverlay({
  selectedPlanetRole,
  selectedPlanetName,
  isPlaying,
  isLocked = false,
}: ScenePolishOverlayProps) {
  if (!selectedPlanetRole || !selectedPlanetName) return null;

  const material = PLANET_MATERIAL_PROFILES[selectedPlanetRole];

  return (
    <div
      className="scene-polish-overlay"
      data-role={selectedPlanetRole}
      data-playing={isPlaying}
      data-locked={isLocked}
      aria-hidden="true"
    >
      <div className="scene-material-identity">
        <span className="scene-material-swatch" />
        <span>
          <strong>{selectedPlanetName}</strong>
          <small>
            {selectedPlanetRole} · {material.label}
          </small>
        </span>
        {isLocked ? <span className="scene-lock-state">Locked</span> : null}
      </div>
      <p className="scene-gate-note">
        <b>Orbit gates</b> Tap a slot to turn it on or off
      </p>
      <div className="scene-gesture-guides">
        <span>
          <b>↕</b> Radial drag · change loop
        </span>
        <span>
          <b>↺</b> Arc drag · rotate gates
        </span>
        {selectedPlanetRole === "melody" ? (
          <span>
            <b>↕</b> Gate drag · change pitch
          </span>
        ) : null}
      </div>
    </div>
  );
}
