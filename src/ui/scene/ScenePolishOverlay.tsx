import type { PlanetRole } from "../../domain/composition";
import { PLANET_MATERIAL_PROFILES } from "../../scene/materials/profiles";

export interface ScenePolishOverlayProps {
  selectedPlanetRole?: PlanetRole;
  selectedPlanetName?: string;
  isPlaying: boolean;
  isLocked?: boolean;
  gateEditing: boolean;
  onGateEditingChange: (editing: boolean) => void;
}

export function ScenePolishOverlay({
  selectedPlanetRole,
  selectedPlanetName,
  isPlaying,
  isLocked = false,
  gateEditing,
  onGateEditingChange,
}: ScenePolishOverlayProps) {
  if (!selectedPlanetRole || !selectedPlanetName) return null;

  const material = PLANET_MATERIAL_PROFILES[selectedPlanetRole];

  return (
    <div
      className="scene-polish-overlay"
      data-role={selectedPlanetRole}
      data-playing={isPlaying}
      data-locked={isLocked}
      data-gate-editing={gateEditing}
    >
      <div className="scene-material-identity" aria-hidden="true">
        <span className="scene-material-swatch" />
        <span>
          <strong>{selectedPlanetName}</strong>
          <small>
            {selectedPlanetRole} · {material.label}
          </small>
        </span>
        {isLocked ? <span className="scene-lock-state">Locked</span> : null}
      </div>
      <button
        type="button"
        className="scene-gate-edit-toggle"
        aria-pressed={gateEditing}
        disabled={isLocked}
        onClick={() => onGateEditingChange(!gateEditing)}
      >
        <span>{gateEditing ? "Done editing gates" : "Edit gates"}</span>
        <small>
          {isLocked
            ? "Unlock this planet first"
            : gateEditing
              ? "Inactive slots are visible and tappable"
              : "Inactive slots are hidden and protected"}
        </small>
      </button>
      {gateEditing ? (
        <>
          <p className="scene-gate-note" aria-hidden="true">
            <b>Gate edit on</b> Tap a slot to turn it on or off
          </p>
          <div className="scene-gesture-guides" aria-hidden="true">
            <span>
              <b>↕</b> Planet drag · change loop
            </span>
            <span>
              <b>↺</b> Orbit arc · rotate gates
            </span>
            {selectedPlanetRole === "melody" ? (
              <span>
                <b>↕</b> Gate drag · change pitch
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="scene-gate-safe-note" aria-hidden="true">
          Active gates stay visible. Gate taps and arc rotation are off.
        </p>
      )}
    </div>
  );
}
