import { createPlanetExpression } from "./expression";
import { CURRENT_SCHEMA_VERSION, type PlanetRole } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanetRole(value: unknown): value is PlanetRole {
  return (
    value === "beat" ||
    value === "bass" ||
    value === "chords" ||
    value === "melody" ||
    value === "texture"
  );
}

/** Migrates persisted plain data before the current schema validates it. */
export function migrateCompositionInput(input: unknown): unknown {
  if (!isRecord(input)) return input;

  let migrated: Record<string, unknown> = input;

  // Schema v1 did not persist role-specific expression state. Keep the
  // original deterministic defaults, then advance through v2 before landing
  // on the current schema. No runtime objects are introduced here.
  if (input.schemaVersion === 1) {
    const harmony = isRecord(input.harmony) ? input.harmony : {};
    const macros = isRecord(input.macros) ? input.macros : {};
    const voicingId =
      harmony.voicingId === "compact" ||
      harmony.voicingId === "open" ||
      harmony.voicingId === "wide"
        ? harmony.voicingId
        : "open";
    const complexity =
      typeof macros.complexity === "number" ? macros.complexity : 0.35;
    const planets = Array.isArray(input.planets)
      ? input.planets.map((planet: unknown) => {
          if (!isRecord(planet) || !isPlanetRole(planet.role)) return planet;
          return {
            ...planet,
            expression: createPlanetExpression(planet.role, {
              voicingId,
              macros: { complexity },
            }),
          };
        })
      : input.planets;

    migrated = {
      ...input,
      schemaVersion: 2,
      planets,
    };
  }

  if (migrated.schemaVersion !== 2) return migrated;

  // v2 had one star only. Explicitly omit a stray companion field rather
  // than silently accepting a v2-shaped binary object as v3 state.
  const star = isRecord(migrated.star) ? migrated.star : undefined;
  if (!star) {
    return { ...migrated, schemaVersion: CURRENT_SCHEMA_VERSION };
  }
  const v2Star = { ...star };
  delete v2Star.companion;

  return {
    ...migrated,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    star: v2Star,
  };
}
