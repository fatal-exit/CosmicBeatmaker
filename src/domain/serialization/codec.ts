import { CURRENT_SCHEMA_VERSION, type Composition } from "../composition/types";
import { validateComposition } from "../composition/validation";

export interface DecodeFailure {
  success: false;
  message: string;
  issues?: string[];
}

export type DecodeResult =
  { success: true; composition: Composition } | DecodeFailure;

export function serializeComposition(composition: Composition): string {
  return JSON.stringify(composition);
}

export function deserializeComposition(serialized: string): DecodeResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { success: false, message: "This composition is not valid JSON." };
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "schemaVersion" in parsed &&
    typeof parsed.schemaVersion === "number" &&
    parsed.schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    return {
      success: false,
      message: `This composition uses schema version ${parsed.schemaVersion}; this app supports version ${CURRENT_SCHEMA_VERSION}.`,
    };
  }

  const validation = validateComposition(parsed);

  if (!validation.success) {
    return {
      success: false,
      message: "This composition could not be validated.",
      issues: validation.issues,
    };
  }

  return { success: true, composition: validation.composition };
}
