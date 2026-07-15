import { useEffect, useMemo, useRef, useState } from "react";

import type { Composition, LoopBars } from "../../domain/composition";
import {
  SCENE_CAMERA_TILT_DEFAULT,
  SceneController,
  type SceneCameraView,
} from "../../scene/SceneController";
import { compositionToSceneDescriptor } from "../../scene/descriptors";
import type { VisualPreferences, VisualPulse } from "../../scene/contracts";

export interface SceneCanvasProps {
  composition: Composition;
  selectedId: string | null;
  gateEditing: boolean;
  isPlaying: boolean;
  visualPreferences: VisualPreferences;
  readTransportTicks: () => number;
  pulseRevision: number;
  drainVisualPulses: () => VisualPulse[];
  onSelect: (id: string | null) => void;
  onOrbitLoopBarsChange?: (planetId: string, loopBars: LoopBars) => void;
  onOrbitPhaseChange?: (planetId: string, phase: number) => void;
  onGateToggle?: (planetId: string, step: number) => void;
  onMelodyGatePitchShift?: (
    planetId: string,
    eventId: string,
    scaleDegreeDelta: number,
  ) => void;
}

export function SceneCanvas({
  composition,
  selectedId,
  gateEditing,
  isPlaying,
  visualPreferences,
  readTransportTicks,
  pulseRevision,
  drainVisualPulses,
  onSelect,
  onOrbitLoopBarsChange,
  onOrbitPhaseChange,
  onGateToggle,
  onMelodyGatePitchShift,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [cameraView, setCameraView] = useState<SceneCameraView>({
    zoomPercent: 100,
    rotationDegrees: 0,
    tiltDegrees: Math.round((SCENE_CAMERA_TILT_DEFAULT * 180) / Math.PI),
    canZoomIn: true,
    canZoomOut: true,
    canTiltUp: true,
    canTiltDown: true,
    canReset: false,
  });
  const controller = useMemo(
    () =>
      new SceneController({
        readTransportTicks,
        onCameraViewChange: setCameraView,
        onInteraction: (intent) => {
          switch (intent.type) {
            case "select":
              onSelect(intent.entityId);
              break;
            case "set-orbit-loop-bars":
              onOrbitLoopBarsChange?.(intent.entityId, intent.loopBars);
              break;
            case "set-orbit-phase":
              onOrbitPhaseChange?.(intent.entityId, intent.phase);
              break;
            case "toggle-planet-gate":
              onGateToggle?.(intent.entityId, intent.step);
              break;
            case "shift-melody-gate-pitch":
              onMelodyGatePitchShift?.(
                intent.entityId,
                intent.eventId,
                intent.scaleDegreeDelta,
              );
              break;
          }
        },
      }),
    [
      onGateToggle,
      onMelodyGatePitchShift,
      onOrbitLoopBarsChange,
      onOrbitPhaseChange,
      onSelect,
      readTransportTicks,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      controller.mount(canvas);
      const observer = new ResizeObserver((entries) => {
        const bounds = entries[0]?.contentRect;
        if (bounds) controller.resize(bounds.width, bounds.height);
      });
      observer.observe(canvas);
      return () => {
        observer.disconnect();
        controller.destroy();
      };
    } catch {
      queueMicrotask(() => setFailed(true));
      controller.destroy();
      return undefined;
    }
  }, [controller]);

  useEffect(() => {
    controller.setTempo(composition.bpm);
    controller.reconcile(compositionToSceneDescriptor(composition));
  }, [composition, controller]);

  useEffect(
    () => controller.setSelection(selectedId),
    [controller, selectedId],
  );
  useEffect(
    () => controller.setGateEditingEnabled(gateEditing),
    [controller, gateEditing],
  );
  useEffect(
    () => controller.setVisualPreferences(visualPreferences),
    [controller, visualPreferences],
  );
  useEffect(
    () => controller.setPlaybackActive(isPlaying),
    [controller, isPlaying],
  );
  useEffect(() => {
    for (const pulse of drainVisualPulses()) controller.enqueuePulse(pulse);
  }, [controller, drainVisualPulses, pulseRevision]);

  return (
    <div className="scene-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="cosmic-canvas"
        aria-hidden="true"
        tabIndex={-1}
        style={{ touchAction: "none" }}
      />
      <div
        className="scene-view-controls"
        role="group"
        aria-label="Scene view controls"
        hidden={failed}
        data-zoom={cameraView.zoomPercent}
        data-rotation={cameraView.rotationDegrees}
        data-tilt={cameraView.tiltDegrees}
      >
        <div className="scene-view-control-row">
          <button
            type="button"
            aria-label="Rotate left"
            title="Rotate left"
            onClick={() => controller.rotateLeft()}
          >
            <span aria-hidden="true">↶</span>
          </button>
          <button
            type="button"
            className="scene-view-reset"
            aria-label="Reset view"
            title="Reset zoom, rotation, and tilt"
            disabled={!cameraView.canReset}
            onClick={() => controller.resetView()}
          >
            Reset
          </button>
          <button
            type="button"
            aria-label="Rotate right"
            title="Rotate right"
            onClick={() => controller.rotateRight()}
          >
            <span aria-hidden="true">↷</span>
          </button>
        </div>
        <div className="scene-view-control-row">
          <button
            type="button"
            aria-label="Tilt down"
            title="Tilt down"
            disabled={!cameraView.canTiltDown}
            onClick={() => controller.tiltDown()}
          >
            <span aria-hidden="true">↓</span>
          </button>
          <output
            className="scene-view-readout"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`Scene tilt ${cameraView.tiltDegrees} degrees`}
          >
            {cameraView.tiltDegrees}°
          </output>
          <button
            type="button"
            aria-label="Tilt up"
            title="Tilt up"
            disabled={!cameraView.canTiltUp}
            onClick={() => controller.tiltUp()}
          >
            <span aria-hidden="true">↑</span>
          </button>
        </div>
        <div className="scene-view-control-row">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!cameraView.canZoomOut}
            onClick={() => controller.zoomOut()}
          >
            <span aria-hidden="true">−</span>
          </button>
          <output
            className="scene-view-readout"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`Scene zoom ${cameraView.zoomPercent}%`}
          >
            {cameraView.zoomPercent}%
          </output>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={!cameraView.canZoomIn}
            onClick={() => controller.zoomIn()}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
      {failed ? (
        <div className="scene-fallback" role="status">
          <strong>The visual cosmos is unavailable.</strong>
          <span>Your music and accessible controls still work.</span>
        </div>
      ) : null}
    </div>
  );
}
