import { createStableId } from "../serialization/ids";
import { createPlanetExpression } from "./expression";
import {
  type Composition,
  CURRENT_SCHEMA_VERSION,
  type PatternEvent,
} from "./types";

const DEFAULT_CREATED_AT = "2026-01-01T00:00:00.000Z";

export interface StarterCompositionOptions {
  name?: string;
  createdAt?: string;
}

export function createStarterComposition(
  seed = "first-light",
  options: StarterCompositionOptions = {},
): Composition {
  const createdAt = options.createdAt ?? DEFAULT_CREATED_AT;
  const beatEvents: PatternEvent[] = [0, 4, 8, 12].map((step, index) => ({
    id: createStableId("event", seed, "beat", String(index)),
    step,
    velocity: index === 0 ? 1 : 0.84,
    probability: 1,
    durationSteps: 1,
    drumVoice: index === 0 || index === 2 ? "kick" : "snare",
  }));

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: createStableId("composition", seed),
    name: options.name ?? "First Light",
    createdAt,
    updatedAt: createdAt,
    seed,
    bars: 4,
    beatsPerBar: 4,
    bpm: 104,
    swing: 0.08,
    star: {
      id: createStableId("star", seed),
      presetId: "radiant",
      visualSeed: 1047,
      intensity: 0.72,
      locked: false,
    },
    harmony: {
      rootMidi: 60,
      scaleId: "major-pentatonic",
      progressionId: "bright",
      safeHarmony: true,
      voicingId: "open",
    },
    macros: {
      energy: 0.58,
      density: 0.42,
      groove: 0.38,
      space: 0.44,
      complexity: 0.24,
    },
    mix: { level: 0.82, brightness: 0.58, limiterEnabled: true },
    planets: [
      {
        id: createStableId("planet", seed, "beat", "0"),
        role: "beat",
        name: "Pulse",
        soundPresetId: "clean-orbit",
        orbit: {
          loopBars: 1,
          phase: 0,
          inclination: 0.08,
          shellIndex: 1,
          direction: 1,
        },
        pattern: {
          gridSize: 16,
          events: beatEvents,
          templateId: "backbeat",
          humanize: 0.02,
        },
        mix: {
          level: 0.76,
          pan: 0,
          filter: 0.68,
          reverbSend: 0.1,
          delaySend: 0.04,
        },
        appearance: { visualSeed: 231, hue: 31, size: 1.05, roughness: 0.46 },
        expression: createPlanetExpression("beat"),
        moons: [],
        muted: false,
        soloed: false,
        locked: false,
      },
    ],
    generation: { revision: 0, generatorVersion: "1.0.0", lockedDomains: [] },
  };
}
