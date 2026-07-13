import type { StarPresetDefinition } from "../../content/starPresets";
import { createPlanetExpression } from "../composition/expression";
import type {
  MacroState,
  MelodyContour,
  PatternEvent,
  PatternState,
  PlanetRole,
  PlanetState,
  VoicingPresetId,
} from "../composition/types";
import { instantiateRhythmTemplate } from "../rhythm/templates";
import { createStableId } from "../serialization/ids";
import { createSeededRandom, type SeededRandom } from "./prng";
import { createSafeTrackMix } from "./rules";

const ROLE_NAMES = {
  beat: ["Pulse", "Kepler", "Impact"],
  bass: ["Gravity", "Core", "Undertow"],
  chords: ["Halo", "Horizon", "Aurora"],
  melody: ["Signal", "Lumen", "Beacon"],
  texture: ["Dust", "Nebula", "Static"],
} as const satisfies Record<PlanetRole, readonly string[]>;

const ROLE_SIZES = {
  beat: [1.02, 1.28],
  bass: [1.12, 1.42],
  chords: [0.96, 1.24],
  melody: [0.78, 1.02],
  texture: [0.72, 0.94],
} as const satisfies Record<PlanetRole, readonly [number, number]>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round = (value: number): number => Math.round(value * 1_000) / 1_000;

function createEvent(
  seed: string,
  role: PlanetRole,
  index: number,
  event: Omit<PatternEvent, "id">,
): PatternEvent {
  return {
    id: createStableId("event", seed, role, String(index)),
    ...event,
  };
}

function createBassPattern(
  seed: string,
  macros: MacroState,
  beatPattern: PatternState | undefined,
): PatternState {
  const random = createSeededRandom(seed).derive("pattern", "bass");
  const events: PatternEvent[] = [0, 8, 16, 24].map((step, index) =>
    createEvent(seed, "bass", index, {
      step,
      velocity: round(0.72 + macros.energy * 0.18),
      probability: 1,
      durationSteps: macros.space > 0.6 ? 4 : 3,
      pitch: { kind: "chordTone", index: 0, octaveOffset: -1 },
    }),
  );

  const kickSteps = beatPattern?.events
    .filter((event) => event.drumVoice === "kick")
    .map((event) => event.step) ?? [0, 8];
  const secondarySteps = new Set<number>();

  for (let bar = 0; bar < 4; bar += 1) {
    for (const kickStep of kickSteps) {
      const step = bar * 8 + Math.min(7, Math.round(kickStep / 2));
      if (step !== bar * 8) secondarySteps.add(step);
    }
  }

  for (const step of [...secondarySteps].sort((a, b) => a - b)) {
    if (!random.chance(0.12 + macros.density * 0.48)) continue;
    events.push(
      createEvent(seed, "bass", events.length, {
        step,
        velocity: round(0.5 + macros.energy * 0.15),
        probability: 0.92,
        durationSteps: 2,
        pitch: {
          kind: "chordTone",
          index: random.chance(0.72) ? 2 : 0,
          octaveOffset: -1,
        },
      }),
    );
  }

  return {
    gridSize: 32,
    events: events.sort((first, second) => first.step - second.step),
    templateId: "bass-chord-anchors",
    humanize: round(0.01 + macros.groove * 0.025),
  };
}

function createChordPattern(seed: string, macros: MacroState): PatternState {
  const random = createSeededRandom(seed).derive("pattern", "chords");
  const events: PatternEvent[] = [];

  for (let bar = 0; bar < 4; bar += 1) {
    events.push(
      createEvent(seed, "chords", events.length, {
        step: bar * 8,
        velocity: round(0.58 + macros.energy * 0.16),
        probability: 1,
        durationSteps: macros.space > 0.55 ? 7 : 5,
        pitch: { kind: "chordTone", index: 0, octaveOffset: 0 },
        chordAction: "strike",
      }),
    );

    if (random.chance(macros.density * 0.42)) {
      events.push(
        createEvent(seed, "chords", events.length, {
          step: bar * 8 + 4,
          velocity: round(0.42 + macros.energy * 0.12),
          probability: 0.9,
          durationSteps: macros.space > 0.65 ? 4 : 2,
          pitch: { kind: "chordTone", index: 1, octaveOffset: 0 },
          chordAction: "strike",
        }),
      );
    }
  }

  return {
    gridSize: 32,
    events: events.sort((first, second) => first.step - second.step),
    templateId: macros.density > 0.62 ? "chord-pulse" : "chord-sustain",
    humanize: round(0.005 + macros.groove * 0.015),
  };
}

function createMotif(random: SeededRandom): readonly number[] {
  const motif = [random.integer(0, 5)];
  const movements = [-1, 0, 1, 1, 2] as const;

  while (motif.length < 4) {
    const previous = motif[motif.length - 1];
    motif.push(Math.min(4, Math.max(0, previous + random.pick(movements))));
  }

  return motif;
}

function createMelodyPattern(seed: string, macros: MacroState): PatternState {
  const random = createSeededRandom(seed).derive("pattern", "melody");
  const motif = createMotif(random);
  const motifSteps = [0, 2, 5, 7] as const;
  const notesPerBar = 2 + Math.floor(macros.density * 2.99);
  const events: PatternEvent[] = [];

  for (let bar = 0; bar < 4; bar += 1) {
    for (let motifIndex = 0; motifIndex < notesPerBar; motifIndex += 1) {
      const isStrongBeat = motifIndex === 0;
      const variedDegree =
        bar > 1 &&
        motifIndex === notesPerBar - 1 &&
        random.chance(macros.complexity * 0.55)
          ? Math.min(4, motif[motifIndex] + 1)
          : motif[motifIndex];

      events.push(
        createEvent(seed, "melody", events.length, {
          step: bar * 8 + motifSteps[motifIndex],
          velocity: round((isStrongBeat ? 0.62 : 0.48) + macros.energy * 0.16),
          probability: isStrongBeat ? 1 : 0.88 + macros.complexity * 0.08,
          durationSteps: macros.space > 0.62 ? 3 : 2,
          pitch: isStrongBeat
            ? {
                kind: "chordTone",
                index: random.pick([0, 1, 2] as const),
                octaveOffset: 1,
              }
            : {
                kind: "scaleDegree",
                degree: variedDegree,
                octaveOffset: 1,
              },
        }),
      );
    }
  }

  return {
    gridSize: 32,
    events,
    templateId: "repeating-motif",
    humanize: round(0.01 + macros.groove * 0.035),
  };
}

function createTexturePattern(seed: string, macros: MacroState): PatternState {
  const random = createSeededRandom(seed).derive("pattern", "texture");
  const eventCount = 2 + Math.floor(macros.density * 3.99);
  const occupiedSteps = new Set<number>();

  while (occupiedSteps.size < eventCount) {
    occupiedSteps.add(random.integer(0, 16));
  }

  const events = [...occupiedSteps]
    .sort((first, second) => first - second)
    .map((step, index) =>
      createEvent(seed, "texture", index, {
        step,
        velocity: round(0.28 + macros.energy * 0.14 + random.next() * 0.08),
        probability: round(0.68 + random.next() * 0.22),
        durationSteps: macros.space > 0.5 ? 4 : 2,
        pitch: {
          kind: "scaleDegree",
          degree: random.integer(0, 5),
          octaveOffset: 0,
        },
      }),
    );

  return {
    gridSize: 16,
    events,
    templateId: "sparse-atmosphere",
    humanize: round(0.025 + macros.complexity * 0.035),
  };
}

export interface GenerateRolePlanetOptions {
  seed: string;
  role: PlanetRole;
  ordinal?: number;
  starPreset: StarPresetDefinition;
  voicingId: VoicingPresetId;
  macros: MacroState;
  beatPattern?: PatternState;
}

export function generateRolePlanet(
  options: GenerateRolePlanetOptions,
): PlanetState {
  const ordinal = options.ordinal ?? 0;
  const random = createSeededRandom(options.seed).derive(
    "planet",
    options.role,
    String(ordinal),
  );
  const patternSeed = random.derive("events").seed;
  let pattern: PatternState;

  switch (options.role) {
    case "beat": {
      const templateId = random.pick(options.starPreset.rhythmTemplates);
      pattern = instantiateRhythmTemplate(templateId, patternSeed, {
        density: options.macros.density,
        energy: options.macros.energy,
        humanize: 0.01 + options.macros.groove * 0.04,
      });
      break;
    }
    case "bass":
      pattern = createBassPattern(
        patternSeed,
        options.macros,
        options.beatPattern,
      );
      break;
    case "chords":
      pattern = createChordPattern(patternSeed, options.macros);
      break;
    case "melody":
      pattern = createMelodyPattern(patternSeed, options.macros);
      break;
    case "texture":
      pattern = createTexturePattern(patternSeed, options.macros);
      break;
  }

  const loopBars = options.role === "beat" ? 1 : 4;
  const sizeRange = ROLE_SIZES[options.role];
  const melodyContour = random
    .derive("expression")
    .pick([
      "ascending",
      "alternating",
      "alternating",
      "descending",
    ] as const satisfies readonly MelodyContour[]);

  return {
    id: createStableId("planet", options.seed, options.role, String(ordinal)),
    role: options.role,
    name: random.pick(ROLE_NAMES[options.role]),
    soundPresetId: random.pick(options.starPreset.sounds[options.role]),
    orbit: {
      loopBars,
      phase: random.pick([0, 0.125, 0.25, 0.375] as const),
      inclination: round(-0.32 + random.next() * 0.64),
      shellIndex: loopBars === 1 ? 1 : 3,
      direction: 1,
    },
    pattern,
    mix: createSafeTrackMix(
      options.role,
      random.derive("mix"),
      options.macros.space,
    ),
    appearance: {
      visualSeed: random.integer(0, 0x7fff_ffff),
      hue: random.integer(0, 361),
      size: round(sizeRange[0] + random.next() * (sizeRange[1] - sizeRange[0])),
      roughness: round(clamp01(0.28 + random.next() * 0.52)),
    },
    expression: createPlanetExpression(options.role, {
      voicingId: options.voicingId,
      macros: options.macros,
      melodyContour,
    }),
    moons: [],
    muted: false,
    soloed: false,
    locked: false,
  };
}
