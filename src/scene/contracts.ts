import type {
  BinaryRhythmMode,
  CompanionStarPresetId,
  LoopBars,
  PlanetRole,
  StarPresetId,
} from "../domain/composition";
import type { GateStepEmphasis } from "../domain/rhythm";
import type {
  PlanetRingVisualMetrics,
  PlanetVisualKind,
} from "./planetVisuals";

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
  visualKind: PlanetVisualKind;
  orbitRadius: number;
  loopBars: LoopBars;
  phase: number;
  inclination: number;
  size: number;
  bodyScale: readonly [number, number, number];
  bodyExtent: number;
  visualExtent: number;
  gateRadius: number;
  moonOrbitRadius: number;
  ringVisual: PlanetRingVisualMetrics;
  hue: number;
  visualSeed: number;
  roughness: number;
  muted: boolean;
  soloed: boolean;
  locked: boolean;
  events: SceneEventDescriptor[];
  gateSlots: SceneGateSlotDescriptor[];
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

export interface SceneGateSlotDescriptor {
  step: number;
  gatePhase: number;
  active: boolean;
  emphasis: GateStepEmphasis;
  pitchEventId?: string;
}

export interface RingSegmentSceneDescriptor {
  sourceEntityId: string;
  eventId: string;
  active: boolean;
  phase: number;
}

/** A projected asteroid attack that gives the belt a stable visual cause. */
export interface AsteroidSceneEventDescriptor {
  eventId: string;
  step: number;
  phase: number;
  velocity: number;
}

export interface MoonSceneDescriptor {
  id: string;
  selectionTargetId: string;
  /** Audio-source phase shared by the compiler and the moon orbit renderer. */
  phase: number;
  /** Number of moon revolutions during one parent-planet orbit. */
  orbitRatio: number;
  events: Array<SceneEventDescriptor & { velocity: number }>;
}

export interface SceneDescriptor {
  star: {
    id: string;
    hue: number;
    intensity: number;
    presetId: StarPresetId;
    visualSeed: number;
    companion?: {
      id: string;
      hue: number;
      intensity: number;
      presetId: CompanionStarPresetId;
      rhythmMode: BinaryRhythmMode;
      visualSeed: number;
    };
  };
  planets: PlanetSceneDescriptor[];
  asteroidBelt?: {
    id: string;
    count: number;
    population: number;
    clustering: number;
    turbulence: number;
    materialPresetId: string;
    visualSeed: number;
    events: AsteroidSceneEventDescriptor[];
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
    }
  | {
      type: "toggle-planet-gate";
      entityId: string;
      step: number;
    }
  | {
      type: "shift-melody-gate-pitch";
      entityId: string;
      eventId: string;
      scaleDegreeDelta: number;
    };
