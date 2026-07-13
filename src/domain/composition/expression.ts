import type {
  MacroState,
  MelodyContour,
  PlanetExpressionState,
  PlanetRole,
  VoicingPresetId,
} from "./types";

const VOICING_SPREADS = {
  compact: 0,
  open: 0.5,
  wide: 1,
} as const satisfies Record<VoicingPresetId, number>;

export function voicingSpreadForPreset(voicingId: VoicingPresetId): number {
  return VOICING_SPREADS[voicingId];
}

export interface PlanetExpressionDefaults {
  voicingId?: VoicingPresetId;
  macros?: Pick<MacroState, "complexity">;
  melodyContour?: MelodyContour;
}

export function createPlanetExpression(
  role: PlanetRole,
  defaults: PlanetExpressionDefaults = {},
): PlanetExpressionState {
  if (role === "chords") {
    return {
      kind: "chords",
      voicingSpread: voicingSpreadForPreset(defaults.voicingId ?? "open"),
      chordComplexity: Math.min(
        1,
        Math.max(0, 0.18 + (defaults.macros?.complexity ?? 0.35) * 0.55),
      ),
    };
  }

  if (role === "melody") {
    return {
      kind: "melody",
      pitchVariety: Math.min(
        1,
        Math.max(0, 0.3 + (defaults.macros?.complexity ?? 0.35) * 0.45),
      ),
      contour: defaults.melodyContour ?? "alternating",
    };
  }

  return { kind: "default" };
}
