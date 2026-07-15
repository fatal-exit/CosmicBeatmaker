import {
  isUserSoundPreset,
  STAR_SOUND_PALETTES,
} from "../../content/soundPresets";
import type {
  BinaryStarState,
  CompanionStarPresetId,
  Composition,
  PlanetRole,
  PlanetState,
  StarPresetId,
  StarState,
} from "./types";
import { createSeededRandom, deriveSeed } from "../generation/prng";

/** The side of a binary system that supplies a planet's palette and intent. */
export type StarAffinity = "primary" | "companion";

type CompositionStarView = Pick<Composition, "star" | "planets">;

const ORDINARY_STAR_PRESET_IDS: readonly CompanionStarPresetId[] = [
  "radiant",
  "red-giant",
  "dwarf",
  "neutron",
  "void",
];

function assertPlanetIndex(planetIndex: number): void {
  if (!Number.isSafeInteger(planetIndex) || planetIndex < 0) {
    throw new Error("Planet affinity requires a non-negative integer index.");
  }
}

/**
 * Alternates binary affinity by stable composition order. The companion's
 * visual seed chooses which side starts, so a seed produces a repeatable but
 * visibly varied arrangement. Single-star systems always resolve to primary.
 */
export function getPlanetStarAffinity(
  composition: CompositionStarView,
  planetIndex: number,
): StarAffinity;
export function getPlanetStarAffinity(
  composition: CompositionStarView,
  planet: Pick<PlanetState, "id">,
): StarAffinity;
export function getPlanetStarAffinity(
  composition: CompositionStarView,
  planetOrIndex: number | Pick<PlanetState, "id">,
): StarAffinity {
  const planetIndex =
    typeof planetOrIndex === "number"
      ? planetOrIndex
      : composition.planets.findIndex(
          (planet) => planet.id === planetOrIndex.id,
        );
  assertPlanetIndex(planetIndex);

  const companion = composition.star.companion;
  if (!companion) return "primary";

  const companionStarts = (companion.visualSeed >>> 0) % 2 === 1;
  const companionSlot = planetIndex % 2 === (companionStarts ? 0 : 1);
  return companionSlot ? "companion" : "primary";
}

/** Alias retained for callers that name the result after the planet. */
export const starAffinityForPlanet = getPlanetStarAffinity;

/** Alias used by generation/audio callers. */
export const getStarAffinityForPlanet = getPlanetStarAffinity;
export const getPlanetAffinity = getPlanetStarAffinity;

export function starForAffinity(
  composition: CompositionStarView,
  affinity: StarAffinity,
): StarState | BinaryStarState {
  if (affinity === "companion") {
    if (!composition.star.companion) {
      throw new Error("Companion affinity requires a binary star.");
    }
    return composition.star.companion;
  }
  return composition.star;
}

export function starPresetIdForAffinity(
  composition: CompositionStarView,
  affinity: StarAffinity,
): StarPresetId {
  return starForAffinity(composition, affinity).presetId;
}

export const getStarPresetIdForAffinity = starPresetIdForAffinity;

export function starSoundPaletteForAffinity(
  composition: CompositionStarView,
  affinity: StarAffinity,
): Readonly<Record<PlanetRole, readonly string[]>> {
  return STAR_SOUND_PALETTES[starPresetIdForAffinity(composition, affinity)];
}

export const getStarSoundPaletteForAffinity = starSoundPaletteForAffinity;

/**
 * Black-hole pitch displacement is intentionally a derived intent. It never
 * changes saved pattern pitch data and therefore remains reversible and safe.
 */
export function blackHolePitchIntentSemitones(
  star: Pick<StarState, "presetId"> | StarPresetId,
): -12 | 0 {
  const presetId = typeof star === "string" ? star : star.presetId;
  return presetId === "black-hole" ? -12 : 0;
}

export const deriveBlackHolePitchIntent = blackHolePitchIntentSemitones;
export const getBlackHolePitchIntent = blackHolePitchIntentSemitones;
export const blackHolePitchIntent = blackHolePitchIntentSemitones;

function chooseSoundPreset(
  composition: CompositionStarView,
  planet: PlanetState,
  planetIndex: number,
  affinity: StarAffinity,
): string {
  const palette = starSoundPaletteForAffinity(composition, affinity)[
    planet.role
  ];
  if (palette.includes(planet.soundPresetId)) return planet.soundPresetId;

  return createSeededRandom(
    deriveSeed(
      composition.star.id,
      "binary",
      "sound",
      planet.id,
      String(planetIndex),
      affinity,
    ),
  ).pick(palette);
}

function isTonalPlanetRole(
  role: PlanetRole,
): role is "bass" | "chords" | "melody" {
  return role === "bass" || role === "chords" || role === "melody";
}

function ensureDistinctCompanionPalette(composition: Composition): Composition {
  const companion = composition.star.companion;
  if (!companion || companion.presetId !== composition.star.presetId) {
    return composition;
  }

  const availablePresets = ORDINARY_STAR_PRESET_IDS.filter(
    (presetId) => presetId !== composition.star.presetId,
  );
  const presetId = createSeededRandom(
    deriveSeed(
      composition.star.id,
      "binary",
      "companion-preset",
      companion.id,
      String(companion.visualSeed),
      composition.star.presetId,
    ),
  ).pick(availablePresets);

  return {
    ...composition,
    star: {
      ...composition.star,
      companion: { ...companion, presetId },
    },
  };
}

/**
 * Reconciles built-in planet voices with the palette supplied by their current
 * star affinity. Affinity is derived from stable planet order, so structural
 * edits can call this function without storing or mutating a second affinity
 * field. Locked planets and local user sounds are intentionally left intact.
 */
export function reconcilePlanetSoundPalettes(
  composition: Composition,
): Composition {
  const distinctComposition = ensureDistinctCompanionPalette(composition);
  let changed = false;
  const planets = distinctComposition.planets.map((planet, planetIndex) => {
    if (planet.locked || isUserSoundPreset(planet.soundPresetId)) return planet;

    const affinity = getPlanetStarAffinity(distinctComposition, planetIndex);
    const soundPresetId = chooseSoundPreset(
      distinctComposition,
      planet,
      planetIndex,
      affinity,
    );
    if (soundPresetId === planet.soundPresetId) return planet;

    changed = true;
    const ring =
      planet.ring && isTonalPlanetRole(planet.role)
        ? { ...planet.ring, soundPresetId }
        : planet.ring;
    return {
      ...planet,
      soundPresetId,
      ...(ring ? { ring } : {}),
    };
  });

  return changed ? { ...distinctComposition, planets } : distinctComposition;
}

/**
 * Adds/replaces the one supported companion and remaps only unlocked planet
 * voices. Pattern, orbit, event, and entity identity remain untouched.
 */
export function applyBinaryCompanion(
  composition: Composition,
  companion: BinaryStarState,
): Composition {
  if ((companion.presetId as StarPresetId) === "black-hole") {
    throw new Error("A black hole cannot be used as a binary companion.");
  }
  const nextStar = {
    ...composition.star,
    companion: { ...companion },
  };
  const nextComposition: Composition = { ...composition, star: nextStar };

  return reconcilePlanetSoundPalettes(nextComposition);
}

/** Removes the companion and restores former companion voices to primary. */
export function removeBinaryCompanion(composition: Composition): Composition {
  const starWithoutCompanion = { ...composition.star };
  delete starWithoutCompanion.companion;
  return reconcilePlanetSoundPalettes({
    ...composition,
    star: starWithoutCompanion,
  });
}

export const setBinaryCompanion = applyBinaryCompanion;
export const clearBinaryCompanion = removeBinaryCompanion;
export const withBinaryCompanion = applyBinaryCompanion;
export const withoutBinaryCompanion = removeBinaryCompanion;
export const addBinaryCompanion = applyBinaryCompanion;
