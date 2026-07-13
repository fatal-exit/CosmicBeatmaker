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
  if (!isRecord(input) || input.schemaVersion !== 1) return input;

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

  return {
    ...input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    planets,
  };
}
