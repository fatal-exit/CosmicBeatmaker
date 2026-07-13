import {
  STAR_PRESETS,
  type StarPresetDefinition,
} from "../../content/starPresets";
import {
  CURRENT_SCHEMA_VERSION,
  type Composition,
  type GenerationDomain,
  type HarmonyState,
  type MacroState,
  type PlanetRole,
  type PlanetState,
  type StarPresetId,
  type StarState,
} from "../composition/types";
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
