import type { PlanetRole } from "../domain/composition";

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
  loopBars: number;
  phase: number;
  inclination: number;
  size: number;
  hue: number;
  muted: boolean;
  soloed: boolean;
  locked: boolean;
  eventIds: string[];
  moonIds: string[];
  ringSegments: boolean[];
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

export interface SceneInteractionIntent {
  type: "select";
  entityId: string | null;
}
