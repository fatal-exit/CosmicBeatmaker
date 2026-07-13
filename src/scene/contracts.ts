import type { LoopBars, PlanetRole, StarPresetId } from "../domain/composition";

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
  visualSeed: number;
  roughness: number;
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
  /** Normalized audio trigger position after pattern phase is applied. */
  phase: number;
  /** Fixed orbit position where the moving planet meets this trigger. */
  gatePhase: number;
}

export interface RingSegmentSceneDescriptor {
  eventId: string;
  active: boolean;
  phase: number;
}

export interface MoonSceneDescriptor {
  id: string;
  selectionTargetId: string;
  /** Audio-source phase shared by the compiler and the moon orbit renderer. */
  phase: number;
  /** Number of moon revolutions during one parent-planet orbit. */
  orbitRatio: number;
  events: SceneEventDescriptor[];
}

export interface SceneDescriptor {
  star: {
    id: string;
    hue: number;
    intensity: number;
    presetId: StarPresetId;
    visualSeed: number;
  };
  planets: PlanetSceneDescriptor[];
  asteroidBelt?: {
    id: string;
    count: number;
    visualSeed: number;
  };
}

export interface VisualPulse {
  occurrenceId: string;
  entityId: string;
  eventId: string;
  scheduledTick: number;
  scheduledAudioTime: number;
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
