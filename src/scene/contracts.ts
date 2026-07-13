import type { LoopBars, PlanetRole } from "../domain/composition";

export type QualityProfile = "low" | "balanced" | "high";
export type QualityPreference = QualityProfile | "auto";

export interface VisualPreferences {
  quality: QualityPreference;
  reducedMotion: boolean;
  reducedParticles: boolean;
  reducedFlash: boolean;
}

export interface PlanetSceneDescriptor {
  id: string;
  role: PlanetRole;
  orbitRadius: number;
  loopBars: LoopBars;
  phase: number;
  inclination: number;
  size: number;
  hue: number;
  muted: boolean;
  soloed: boolean;
  locked: boolean;
  events: SceneEventDescriptor[];
  moons: MoonSceneDescriptor[];
  ringSegments: RingSegmentSceneDescriptor[];
}

export interface SceneEventDescriptor {
  eventId: string;
  step: number;
  /** Normalized position after the planet's pattern phase is applied. */
  phase: number;
}

export interface RingSegmentSceneDescriptor {
  eventId: string;
  active: boolean;
  phase: number;
}

export interface MoonSceneDescriptor {
  id: string;
  selectionTargetId: string;
  phase: number;
  events: SceneEventDescriptor[];
}

export interface SceneDescriptor {
  star: {
    id: string;
    hue: number;
    intensity: number;
    presetId: string;
  };
  planets: PlanetSceneDescriptor[];
  asteroidBelt?: {
    id: string;
    count: number;
    visualSeed: number;
  };
}

export interface VisualPulse {
  entityId: string;
  eventId: string;
  scheduledTick: number;
  velocity: number;
}

export type SceneInteractionIntent =
  | {
      type: "select";
      entityId: string | null;
    }
  | {
      type: "set-orbit-loop-bars";
      entityId: string;
      loopBars: LoopBars;
    }
  | {
      type: "set-orbit-phase";
      entityId: string;
      phase: number;
    };
