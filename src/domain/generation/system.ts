import {
  STAR_PRESETS,
  type StarPresetDefinition,
} from "../../content/starPresets";
import {
  CURRENT_SCHEMA_VERSION,
  type AsteroidBeltState,
  type Composition,
  type GenerationDomain,
  type HarmonyState,
  type LoopBars,
  type MacroState,
  type MoonState,
  type PatternEvent,
  type PlanetRole,
  type PlanetState,
  type RingState,
  type StarPresetId,
  type StarState,
} from "../composition/types";
import {
  createGateEvent,
  fitPatternGridToLoopBars,
  ringActiveSegmentsForDensity,
} from "../rhythm";
import { createStableId } from "../serialization/ids";
import { createSeededRandom, deriveSeed } from "./prng";
import { generateRolePlanet } from "./rolePatterns";
import { createSafeMasterMix } from "./rules";

export const GENERATOR_VERSION = "2.1.0";

const DEFAULT_CREATED_AT = "2026-01-01T00:00:00.000Z";
const STAR_PRESET_IDS = Object.keys(STAR_PRESETS) as StarPresetId[];
const PLANET_ROLES = [
  "beat",
  "bass",
  "chords",
  "melody",
  "texture",
] as const satisfies readonly PlanetRole[];
const REGENERATABLE_DOMAINS = [
  "star",
  "harmony",
  ...PLANET_ROLES,
] as const satisfies readonly GenerationDomain[];

const round = (value: number): number => Math.round(value * 1_000) / 1_000;

function generateStar(
  rootSeed: string,
  generationSeed: string,
  forcedPresetId?: StarPresetId,
): StarState {
  const random = createSeededRandom(generationSeed).derive("star");
  const presetId = forcedPresetId ?? random.pick(STAR_PRESET_IDS);
  const preset = STAR_PRESETS[presetId];

  return {
    id: createStableId("star", rootSeed),
    presetId,
    visualSeed: random.integer(0, 0x7fff_ffff),
    intensity: round(
      preset.intensityRange[0] +
        random.next() * (preset.intensityRange[1] - preset.intensityRange[0]),
    ),
    locked: false,
  };
}

function generateHarmony(
  generationSeed: string,
  starPreset: StarPresetDefinition,
): HarmonyState {
  const random = createSeededRandom(generationSeed).derive("harmony");

  return {
    rootMidi: 48 + random.integer(0, 12),
    scaleId: random.pick(starPreset.scales),
    progressionId: random.pick(starPreset.progressions),
    safeHarmony: true,
    voicingId: random.pick(starPreset.voicings),
  };
}

function generateMacros(
  generationSeed: string,
  presetId: StarPresetId,
): MacroState {
  const random = createSeededRandom(generationSeed).derive("macros");
  const densityRange: readonly [number, number] =
    presetId === "void" || presetId === "dwarf"
      ? [0.25, 0.48]
      : presetId === "neutron"
        ? [0.52, 0.72]
        : [0.38, 0.62];

  return {
    energy: round(0.42 + random.next() * 0.34),
    density: round(
      densityRange[0] + random.next() * (densityRange[1] - densityRange[0]),
    ),
    groove: round(0.24 + random.next() * 0.42),
    space: round(
      (presetId === "void" || presetId === "red-giant" ? 0.58 : 0.32) +
        random.next() * 0.25,
    ),
    complexity: round(0.18 + random.next() * 0.36),
  };
}

function generatePlanets(
  generationSeed: string,
  starPreset: StarPresetDefinition,
  harmony: HarmonyState,
  macros: MacroState,
): PlanetState[] {
  const planets: PlanetState[] = [];
  let beatPattern: PlanetState["pattern"] | undefined;

  for (const role of PLANET_ROLES) {
    const planet = generateRolePlanet({
      seed: deriveSeed(generationSeed, "role", role),
      role,
      starPreset,
      voicingId: harmony.voicingId,
      macros,
      beatPattern,
    });
    planets.push(planet);
    if (role === "beat") beatPattern = planet.pattern;
  }

  return planets;
}

export interface GenerateCompleteSystemOptions {
  name?: string;
  createdAt?: string;
  starPresetId?: StarPresetId;
  harmony?: HarmonyState;
  lockedDomains?: readonly GenerationDomain[];
}

export function generateCompleteSystem(
  seed: string,
  options: GenerateCompleteSystemOptions = {},
): Composition {
  if (seed.length === 0) throw new Error("A generated system needs a seed.");

  const createdAt = options.createdAt ?? DEFAULT_CREATED_AT;
  const generationSeed = deriveSeed(seed, "generation", "0");
  const star = generateStar(seed, generationSeed, options.starPresetId);
  const starPreset = STAR_PRESETS[star.presetId];
  const harmony =
    options.harmony ?? generateHarmony(generationSeed, starPreset);
  const macros = generateMacros(generationSeed, star.presetId);
  const tempoRandom = createSeededRandom(generationSeed).derive("tempo");

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: createStableId("composition", seed),
    name: options.name ?? `${starPreset.mood} System`,
    createdAt,
    updatedAt: createdAt,
    seed,
    bars: 4,
    beatsPerBar: 4,
    bpm: tempoRandom.integer(
      starPreset.bpmRange[0],
      starPreset.bpmRange[1] + 1,
    ),
    swing: round(
      (star.presetId === "neutron" ? 0.12 : 0.04) + tempoRandom.next() * 0.16,
    ),
    star,
    harmony,
    macros,
    mix: createSafeMasterMix(
      createSeededRandom(generationSeed).derive("master-mix"),
    ),
    planets: generatePlanets(generationSeed, starPreset, harmony, macros),
    generation: {
      revision: 0,
      generatorVersion: GENERATOR_VERSION,
      lockedDomains: [...(options.lockedDomains ?? [])],
    },
  };
}

export interface RegenerateSystemOptions {
  domains?: readonly GenerationDomain[];
  updatedAt?: string;
}

export interface SurpriseOptions {
  updatedAt?: string;
}

export interface GeneratePlanetForRoleOptions {
  ordinal?: number;
}

export function generatePlanetForRole(
  composition: Composition,
  role: PlanetRole,
  options: GeneratePlanetForRoleOptions = {},
): PlanetState {
  const existingIds = new Set(composition.planets.map((planet) => planet.id));
  const starPreset = STAR_PRESETS[composition.star.presetId];
  const beatPattern = composition.planets.find(
    (planet) => planet.role === "beat",
  )?.pattern;
  let ordinal =
    options.ordinal ??
    composition.planets.filter((planet) => planet.role === role).length;

  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new Error("Generated planet ordinal must be a non-negative integer.");
  }

  while (true) {
    const planet = generateRolePlanet({
      seed: deriveSeed(
        composition.seed,
        "generation",
        String(composition.generation.revision),
        "add",
        role,
        String(ordinal),
      ),
      role,
      ordinal,
      starPreset,
      voicingId: composition.harmony.voicingId,
      macros: composition.macros,
      beatPattern,
    });

    if (!existingIds.has(planet.id)) return planet;
    ordinal += 1;
  }
}

export function regenerateSystem(
  composition: Composition,
  options: RegenerateSystemOptions = {},
): Composition {
  const nextRevision = composition.generation.revision + 1;
  const generationSeed = deriveSeed(
    composition.seed,
    "generation",
    String(nextRevision),
  );
  const requestedDomains = new Set<GenerationDomain>(
    options.domains ?? REGENERATABLE_DOMAINS,
  );
  const lockedDomains = new Set(composition.generation.lockedDomains);
  const canRegenerate = (domain: GenerationDomain): boolean =>
    requestedDomains.has(domain) && !lockedDomains.has(domain);

  const generatedStar = generateStar(composition.seed, generationSeed);
  const star =
    canRegenerate("star") && !composition.star.locked
      ? {
          ...generatedStar,
          id: composition.star.id,
          locked: composition.star.locked,
        }
      : composition.star;
  const starPreset = STAR_PRESETS[star.presetId];
  const harmony = canRegenerate("harmony")
    ? generateHarmony(generationSeed, starPreset)
    : composition.harmony;
  const replacements = new Map<string, PlanetState>();
  const additions: PlanetState[] = [];
  let beatPattern = composition.planets.find(
    (planet) => planet.role === "beat",
  )?.pattern;

  for (const role of PLANET_ROLES) {
    const existingPlanets = composition.planets.filter(
      (planet) => planet.role === role,
    );
    const roleCanRegenerate = canRegenerate(role);
    const generatedForRole: PlanetState[] = [];

    for (let ordinal = 0; ordinal < existingPlanets.length; ordinal += 1) {
      const existing = existingPlanets[ordinal];

      if (!roleCanRegenerate || existing.locked) {
        replacements.set(existing.id, existing);
        generatedForRole.push(existing);
        continue;
      }

      const generated = generateRolePlanet({
        seed: deriveSeed(generationSeed, "role", role),
        role,
        ordinal,
        starPreset,
        voicingId: harmony.voicingId,
        macros: composition.macros,
        beatPattern,
      });
      const replacement: PlanetState = {
        ...generated,
        id: existing.id,
        name: existing.name,
        moons: existing.moons,
        ring: existing.ring,
        muted: existing.muted,
        soloed: existing.soloed,
        locked: existing.locked,
      };
      replacements.set(existing.id, replacement);
      generatedForRole.push(replacement);
    }

    if (
      existingPlanets.length === 0 &&
      roleCanRegenerate &&
      composition.planets.length + additions.length < 8
    ) {
      const generated = generateRolePlanet({
        seed: deriveSeed(generationSeed, "role", role),
        role,
        starPreset,
        voicingId: harmony.voicingId,
        macros: composition.macros,
        beatPattern,
      });
      additions.push(generated);
      generatedForRole.push(generated);
    }

    if (role === "beat" && generatedForRole.length > 0) {
      beatPattern = generatedForRole[0].pattern;
    }
  }

  return {
    ...composition,
    updatedAt: options.updatedAt ?? composition.updatedAt,
    star,
    harmony,
    planets: [
      ...composition.planets.map(
        (planet) => replacements.get(planet.id) ?? planet,
      ),
      ...additions,
    ],
    generation: {
      ...composition.generation,
      revision: nextRevision,
      generatorVersion: GENERATOR_VERSION,
    },
  };
}

export const regenerateUnlockedSystem = regenerateSystem;

const COMMON_SURPRISE_RATES = {
  beat: [0.5, 1, 2],
  bass: [1, 2, 4],
  chords: [1, 2, 4],
  melody: [0.5, 1, 2, 4],
  texture: [1, 2, 4],
} as const satisfies Record<PlanetRole, readonly LoopBars[]>;

const MOON_BEHAVIORS = {
  beat: ["accent", "counterpulse", "fill"],
  bass: ["pickup", "echo", "counterpulse"],
  chords: ["harmony", "echo", "counterpulse"],
  melody: ["echo", "harmony", "pickup"],
  texture: ["counterpulse", "echo", "fill"],
} as const satisfies Record<
  PlanetRole,
  readonly MoonState["behaviorPresetId"][]
>;

function surpriseMoon(
  moon: MoonState,
  parent: PlanetState,
  generationSeed: string,
): MoonState {
  if (moon.locked) return moon;
  const random = createSeededRandom(generationSeed).derive("moon", moon.id);
  const eventCount = random.integer(1, Math.min(3, moon.pattern.gridSize) + 1);
  const steps = new Set<number>();
  while (steps.size < eventCount) {
    steps.add(random.integer(0, moon.pattern.gridSize));
  }
  const orderedSteps = [...steps].sort((left, right) => left - right);
  const events = orderedSteps.map((step, index): PatternEvent => {
    const generated = createGateEvent(
      parent.role,
      step,
      moon.pattern.events[index]?.id ??
        createStableId("event", generationSeed, moon.id, String(index)),
    );
    return {
      ...generated,
      velocity: round(0.44 + random.next() * 0.22),
      probability: round(0.68 + random.next() * 0.28),
      durationSteps: 0.5,
    };
  });

  return {
    ...moon,
    behaviorPresetId: random.pick(MOON_BEHAVIORS[parent.role]),
    pattern: {
      ...moon.pattern,
      templateId: undefined,
      events,
      humanize: round(0.01 + random.next() * 0.05),
    },
    orbitRatio: random.pick([1, 2, 4] as const),
    phase: random.pick([0, 0.125, 0.25, 0.375] as const),
    level: round(0.3 + random.next() * 0.18),
    probability: round(0.68 + random.next() * 0.28),
    appearanceSeed: random.integer(0, 0x7fff_ffff),
  };
}

function surpriseRing(
  ring: RingState,
  parent: PlanetState,
  generationSeed: string,
): RingState {
  const random = createSeededRandom(generationSeed).derive("ring", ring.id);
  const draft: RingState = {
    ...ring,
    phase: random.integer(0, ring.segments) / ring.segments,
    velocityVariation: round(0.08 + random.next() * 0.26),
    probability: round(0.78 + random.next() * 0.2),
    level: round(
      parent.role === "chords"
        ? 0.82 + random.next() * 0.16
        : 0.2 + random.next() * 0.2,
    ),
  };
  const density = 0.25 + random.next() * 0.38;
  return {
    ...draft,
    active: ringActiveSegmentsForDensity(parent, draft, density),
  };
}

function surprisePlanetAttachments(
  planet: PlanetState,
  generationSeed: string,
  lockedDomains: ReadonlySet<GenerationDomain>,
): PlanetState {
  if (planet.locked) return planet;
  return {
    ...planet,
    moons: lockedDomains.has("moons")
      ? planet.moons
      : planet.moons.map((moon) => surpriseMoon(moon, planet, generationSeed)),
    ring:
      planet.ring && !lockedDomains.has("ring")
        ? surpriseRing(planet.ring, planet, generationSeed)
        : planet.ring,
  };
}

function surpriseAsteroidBelt(
  belt: AsteroidBeltState,
  generationSeed: string,
): AsteroidBeltState {
  if (belt.locked) return belt;
  const random = createSeededRandom(generationSeed).derive(
    "asteroids",
    belt.id,
  );
  const eventCount = random.integer(3, Math.min(8, belt.gridSize) + 1);
  const steps = new Set<number>();
  while (steps.size < eventCount) steps.add(random.integer(0, belt.gridSize));
  return {
    ...belt,
    events: [...steps]
      .sort((left, right) => left - right)
      .map((step, index) => ({
        id:
          belt.events[index]?.id ??
          createStableId("event", generationSeed, belt.id, String(index)),
        step,
        velocity: round(0.38 + random.next() * 0.32),
        probability: round(0.58 + random.next() * 0.36),
        durationSteps: 0.5,
        drumVoice: "perc" as const,
      })),
    population: round(0.32 + random.next() * 0.42),
    clustering: round(0.18 + random.next() * 0.52),
    turbulence: round(0.08 + random.next() * 0.34),
    accentChance: round(0.08 + random.next() * 0.3),
    level: round(0.16 + random.next() * 0.16),
    visualSeed: random.integer(0, 0x7fff_ffff),
  };
}

function withSurprisedOrbit(
  planet: PlanetState,
  generationSeed: string,
): PlanetState {
  if (planet.locked) return planet;
  const random = createSeededRandom(generationSeed).derive("orbit", planet.id);
  const loopBars = random.pick(COMMON_SURPRISE_RATES[planet.role]);
  return {
    ...planet,
    pattern: fitPatternGridToLoopBars(
      planet.pattern,
      planet.orbit.loopBars,
      loopBars,
    ),
    orbit: {
      ...planet.orbit,
      loopBars,
      phase: random.pick([0, 0.125, 0.25, 0.375] as const),
      inclination: round(-0.28 + random.next() * 0.56),
    },
  };
}

/**
 * Changes every unlocked musical layer as one deterministic project action.
 * Existing IDs and celestial attachments remain stable so selection, undo,
 * save, playback, and scene reconciliation continue through the surprise.
 */
export function surpriseWholeSystem(
  composition: Composition,
  options: SurpriseOptions = {},
): Composition {
  const nextRevision = composition.generation.revision + 1;
  const generationSeed = deriveSeed(
    composition.seed,
    "generation",
    String(nextRevision),
  );
  const lockedDomains = new Set(composition.generation.lockedDomains);
  const generatedStar = generateStar(composition.seed, generationSeed);
  const starPresetId =
    composition.star.locked || lockedDomains.has("star")
      ? composition.star.presetId
      : generatedStar.presetId;
  const starPreset = STAR_PRESETS[starPresetId];
  const tempoRandom = createSeededRandom(generationSeed).derive("tempo");
  const prepared: Composition = {
    ...composition,
    bpm: tempoRandom.integer(
      starPreset.bpmRange[0],
      starPreset.bpmRange[1] + 1,
    ),
    swing: round(
      (starPresetId === "neutron" ? 0.12 : 0.04) + tempoRandom.next() * 0.16,
    ),
    macros: generateMacros(generationSeed, starPresetId),
    mix: createSafeMasterMix(
      createSeededRandom(generationSeed).derive("master-mix"),
    ),
  };
  const regenerated = regenerateSystem(prepared, options);
  const planets = regenerated.planets.map((planet) =>
    surprisePlanetAttachments(
      withSurprisedOrbit(planet, generationSeed),
      generationSeed,
      lockedDomains,
    ),
  );

  return {
    ...regenerated,
    planets,
    asteroidBelt:
      regenerated.asteroidBelt && !lockedDomains.has("asteroids")
        ? surpriseAsteroidBelt(regenerated.asteroidBelt, generationSeed)
        : regenerated.asteroidBelt,
  };
}

/** Regenerates only one unlocked planet and its attached musical structures. */
export function surprisePlanet(
  composition: Composition,
  planetId: string,
  options: SurpriseOptions = {},
): Composition {
  const existing = composition.planets.find((planet) => planet.id === planetId);
  if (
    !existing ||
    existing.locked ||
    composition.generation.lockedDomains.includes(existing.role)
  ) {
    return composition;
  }

  const nextRevision = composition.generation.revision + 1;
  const generationSeed = deriveSeed(
    composition.seed,
    "generation",
    String(nextRevision),
    "planet",
    existing.id,
  );
  const ordinal = composition.planets
    .filter((planet) => planet.role === existing.role)
    .findIndex((planet) => planet.id === existing.id);
  const generated = generateRolePlanet({
    seed: generationSeed,
    role: existing.role,
    ordinal: Math.max(0, ordinal),
    starPreset: STAR_PRESETS[composition.star.presetId],
    voicingId: composition.harmony.voicingId,
    macros: composition.macros,
    beatPattern: composition.planets.find((planet) => planet.role === "beat")
      ?.pattern,
  });
  const replacement = surprisePlanetAttachments(
    withSurprisedOrbit(
      {
        ...generated,
        id: existing.id,
        name: existing.name,
        moons: existing.moons,
        ring: existing.ring,
        muted: existing.muted,
        soloed: existing.soloed,
        locked: existing.locked,
      },
      generationSeed,
    ),
    generationSeed,
    new Set(composition.generation.lockedDomains),
  );

  return {
    ...composition,
    updatedAt: options.updatedAt ?? composition.updatedAt,
    planets: composition.planets.map((planet) =>
      planet.id === planetId ? replacement : planet,
    ),
    generation: {
      ...composition.generation,
      revision: nextRevision,
      generatorVersion: GENERATOR_VERSION,
    },
  };
}
