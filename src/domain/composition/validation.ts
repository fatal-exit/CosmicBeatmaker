import { z } from "zod";

import {
  CURRENT_SCHEMA_VERSION,
  type Composition,
  type EntityId,
  type LoopBars,
} from "./types";
import { LOOP_BAR_RATES, isLoopBars } from "./loopRates";
import { migrateCompositionInput } from "./migrations";

const normalized = z.number().finite().min(0).max(1);
const normalizedPhase = z.number().finite().min(0).lt(1);
const loopBarsSchema = z.custom<LoopBars>(isLoopBars, {
  message: `Loop length must be one of: ${LOOP_BAR_RATES.join(", ")} bars.`,
});

const pitchIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("scaleDegree"),
    degree: z.number().int(),
    octaveOffset: z.number().int(),
  }),
  z.object({
    kind: z.literal("chordTone"),
    index: z.number().int().nonnegative(),
    octaveOffset: z.number().int(),
  }),
  z.object({ kind: z.literal("root"), octaveOffset: z.number().int() }),
  z.object({ kind: z.literal("fifth"), octaveOffset: z.number().int() }),
  z.object({
    kind: z.literal("absoluteMidi"),
    note: z.number().int().min(0).max(127),
  }),
]);

const patternEventSchema = z.object({
  id: z.string().min(1),
  step: z.number().int().nonnegative(),
  velocity: normalized,
  probability: normalized,
  durationSteps: z.number().positive(),
  pitch: pitchIntentSchema.optional(),
  drumVoice: z
    .enum(["kick", "snare", "clap", "closed-hat", "open-hat", "rim", "perc"])
    .optional(),
  chordAction: z.enum(["strike", "hold", "release"]).optional(),
});

const patternSchema = z
  .object({
    gridSize: z.union([
      z.literal(4),
      z.literal(6),
      z.literal(8),
      z.literal(12),
      z.literal(16),
      z.literal(24),
      z.literal(32),
    ]),
    events: z.array(patternEventSchema),
    templateId: z.string().optional(),
    humanize: normalized,
  })
  .superRefine((pattern, context) => {
    if (pattern.events.length > pattern.gridSize) {
      context.addIssue({
        code: "custom",
        message: `Pattern has more than ${pattern.gridSize} events.`,
        path: ["events"],
      });
    }
    for (const event of pattern.events) {
      if (event.step >= pattern.gridSize) {
        context.addIssue({
          code: "custom",
          message: `Event ${event.id} is outside its ${pattern.gridSize}-step pattern.`,
          path: ["events"],
        });
      }
    }
  });

const moonSchema = z.object({
  id: z.string().min(1),
  behaviorPresetId: z.enum([
    "accent",
    "echo",
    "harmony",
    "pickup",
    "fill",
    "counterpulse",
  ]),
  pattern: patternSchema,
  orbitRatio: z.number().positive(),
  phase: normalizedPhase,
  level: normalized,
  probability: normalized,
  appearanceSeed: z.number().int(),
  muted: z.boolean(),
  locked: z.boolean(),
});

const ringSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["hat", "shaker", "perc", "gate", "delay", "filter"]),
    segments: z.union([z.literal(8), z.literal(16)]),
    active: z.array(z.boolean()),
    phase: normalizedPhase,
    velocityVariation: normalized,
    probability: normalized,
    soundPresetId: z.string().min(1),
    level: normalized,
  })
  .superRefine((ring, context) => {
    if (ring.active.length !== ring.segments) {
      context.addIssue({
        code: "custom",
        message: "Ring active-segment state must match its segment count.",
        path: ["active"],
      });
    }
  });

const planetExpressionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chords"),
    voicingSpread: normalized,
    chordComplexity: normalized,
  }),
  z.object({
    kind: z.literal("melody"),
    pitchVariety: normalized,
    contour: z.enum(["ascending", "alternating", "descending"]),
  }),
  z.object({ kind: z.literal("default") }),
]);

const planetSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["beat", "bass", "chords", "melody", "texture"]),
  name: z.string().min(1).max(80),
  soundPresetId: z.string().min(1),
  orbit: z.object({
    loopBars: loopBarsSchema,
    phase: normalizedPhase,
    inclination: z.number().min(-1).max(1),
    shellIndex: z.number().int().min(0).max(7),
    direction: z.literal(1),
  }),
  pattern: patternSchema,
  mix: z.object({
    level: normalized,
    pan: z.number().min(-1).max(1),
    filter: normalized,
    reverbSend: normalized,
    delaySend: normalized,
  }),
  appearance: z.object({
    visualSeed: z.number().int(),
    hue: z.number().min(0).max(360),
    size: z.number().positive().max(4),
    roughness: normalized,
  }),
  expression: planetExpressionSchema,
  moons: z.array(moonSchema).max(3),
  ring: ringSchema.optional(),
  muted: z.boolean(),
  soloed: z.boolean(),
  locked: z.boolean(),
});

export const compositionSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    seed: z.string().min(1),
    bars: z.literal(4),
    beatsPerBar: z.literal(4),
    bpm: z.number().min(70).max(140),
    swing: z.number().min(0).max(0.6),
    star: z.object({
      id: z.string().min(1),
      presetId: z.enum(["radiant", "red-giant", "dwarf", "neutron", "void"]),
      visualSeed: z.number().int(),
      intensity: normalized,
      locked: z.boolean(),
    }),
    harmony: z.object({
      rootMidi: z.number().int().min(36).max(84),
      scaleId: z.enum([
        "major-pentatonic",
        "minor-pentatonic",
        "dorian",
        "major",
      ]),
      progressionId: z.enum([
        "bright",
        "hopeful",
        "reflective",
        "driving",
        "dark",
        "floating",
        "minimal",
      ]),
      customProgression: z.array(z.number().int()).optional(),
      safeHarmony: z.boolean(),
      voicingId: z.enum(["compact", "open", "wide"]),
    }),
    macros: z.object({
      energy: normalized,
      density: normalized,
      groove: normalized,
      space: normalized,
      complexity: normalized,
    }),
    mix: z.object({
      level: normalized,
      brightness: normalized,
      limiterEnabled: z.literal(true),
    }),
    planets: z.array(planetSchema).min(1).max(8),
    asteroidBelt: z
      .object({
        id: z.string().min(1),
        materialPresetId: z.string().min(1),
        gridSize: z.union([z.literal(16), z.literal(32)]),
        events: z.array(patternEventSchema),
        population: normalized,
        clustering: normalized,
        turbulence: normalized,
        accentChance: normalized,
        level: normalized,
        locked: z.boolean(),
        visualSeed: z.number().int(),
      })
      .optional(),
    generation: z.object({
      revision: z.number().int().nonnegative(),
      generatorVersion: z.string().min(1),
      lockedDomains: z.array(
        z.enum([
          "star",
          "harmony",
          "beat",
          "bass",
          "chords",
          "melody",
          "texture",
          "moons",
          "ring",
          "asteroids",
        ]),
      ),
    }),
  })
  .superRefine((composition, context) => {
    const ids: EntityId[] = [composition.id, composition.star.id];

    for (const planet of composition.planets) {
      ids.push(planet.id, ...planet.pattern.events.map((event) => event.id));
      ids.push(
        ...planet.moons.flatMap((moon) => [
          moon.id,
          ...moon.pattern.events.map((event) => event.id),
        ]),
      );
      for (const moon of planet.moons) {
        if (!isLoopBars(planet.orbit.loopBars / moon.orbitRatio)) {
          context.addIssue({
            code: "custom",
            message: `Moon ${moon.id} must resolve to a supported exact loop length.`,
            path: ["planets"],
          });
        }
      }
      if (planet.ring) ids.push(planet.ring.id);

      const expectedExpressionKind =
        planet.role === "chords"
          ? "chords"
          : planet.role === "melody"
            ? "melody"
            : "default";
      if (planet.expression.kind !== expectedExpressionKind) {
        context.addIssue({
          code: "custom",
          message: `${planet.role} planet ${planet.id} has incompatible expression controls.`,
          path: ["planets"],
        });
      }

      for (const event of planet.pattern.events) {
        if (planet.role === "beat" && !event.drumVoice) {
          context.addIssue({
            code: "custom",
            message: `Beat event ${event.id} requires a drum voice.`,
            path: ["planets"],
          });
        }
        if (planet.role !== "beat" && event.drumVoice) {
          context.addIssue({
            code: "custom",
            message: "Only beat events may declare a drum voice.",
            path: ["planets"],
          });
        }
      }
    }

    if (composition.asteroidBelt) {
      ids.push(
        composition.asteroidBelt.id,
        ...composition.asteroidBelt.events.map((event) => event.id),
      );
      if (
        composition.asteroidBelt.events.length >
        composition.asteroidBelt.gridSize
      ) {
        context.addIssue({
          code: "custom",
          message: `Asteroid belt has more than ${composition.asteroidBelt.gridSize} events.`,
          path: ["asteroidBelt", "events"],
        });
      }
      for (const event of composition.asteroidBelt.events) {
        if (event.step >= composition.asteroidBelt.gridSize) {
          context.addIssue({
            code: "custom",
            message: `Asteroid event ${event.id} is outside the belt grid.`,
            path: ["asteroidBelt", "events"],
          });
        }
      }
    }

    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Every composition entity must have a unique stable ID.",
        path: ["id"],
      });
    }
  });

export type CompositionValidation =
  | { success: true; composition: Composition }
  | { success: false; issues: string[] };

export function validateComposition(input: unknown): CompositionValidation {
  const result = compositionSchema.safeParse(migrateCompositionInput(input));

  if (result.success) {
    return { success: true, composition: result.data };
  }

  return {
    success: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "composition"}: ${issue.message}`,
    ),
  };
}
