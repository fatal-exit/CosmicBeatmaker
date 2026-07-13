import { useEffect, useMemo, useRef, useState } from "react";

import type { Composition } from "../../domain/composition";
import { SceneController } from "../../scene/SceneController";
import { compositionToSceneDescriptor } from "../../scene/descriptors";
import type { VisualPreferences, VisualPulse } from "../../scene/contracts";

export interface SceneCanvasProps {
  composition: Composition;
  selectedId: string | null;
  visualPreferences: VisualPreferences;
  readTransportTicks: () => number;
  pulse?: VisualPulse | null;
  onSelect: (id: string | null) => void;
}

export function SceneCanvas({
  composition,
  selectedId,
  visualPreferences,
  readTransportTicks,
  pulse,
  onSelect,
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const controller = useMemo(
    () =>
      new SceneController({
        readTransportTicks,
        onInteraction: (intent) => onSelect(intent.entityId),
      }),
    [onSelect, readTransportTicks],
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
    controller.reconcile(compositionToSceneDescriptor(composition));
  }, [composition, controller]);

  useEffect(
    () => controller.setSelection(selectedId),
    [controller, selectedId],
  );
  useEffect(
    () => controller.setVisualPreferences(visualPreferences),
    [controller, visualPreferences],
  );
  useEffect(() => {
    if (pulse) controller.enqueuePulse(pulse);
  }, [controller, pulse]);

  return (
    <div className="scene-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="cosmic-canvas"
        aria-hidden="true"
        tabIndex={-1}
      />
      {failed ? (
        <div className="scene-fallback" role="status">
          <strong>The visual cosmos is unavailable.</strong>
          <span>Your music and accessible controls still work.</span>
        </div>
      ) : null}
    </div>
  );
}
