import type {
  DrumVoiceId,
  PatternEvent,
  PatternState,
  PlanetRole,
} from "../composition/types";

export type GateRhythmPresetId = "steady" | "offbeat" | "sparse" | "syncopated";

export interface GateRhythmPresetDefinition {
  id: GateRhythmPresetId;
  label: string;
  description: string;
  referenceSteps: readonly number[];
}

export const GATE_RHYTHM_PRESETS = [
  {
    id: "steady",
    label: "Steady pulse",
    description: "One clear gate on every beat",
    referenceSteps: [0, 4, 8, 12],
  },
  {
    id: "offbeat",
    label: "Offbeat",
    description: "Gates land between the main beats",
    referenceSteps: [2, 6, 10, 14],
  },
  {
    id: "sparse",
    label: "Sparse",
    description: "Two wide landmarks across the orbit",
    referenceSteps: [0, 8],
  },
  {
    id: "syncopated",
    label: "Syncopated",
    description: "A safe uneven pattern with forward motion",
    referenceSteps: [0, 3, 6, 10, 12],
  },
] as const satisfies readonly GateRhythmPresetDefinition[];

function scaledSteps(
  referenceSteps: readonly number[],
  gridSize: PatternState["gridSize"],
): number[] {
  return [
    ...new Set(
      referenceSteps.map((step) =>
        Math.min(gridSize - 1, Math.round((step / 16) * gridSize)),
      ),
    ),
  ].sort((left, right) => left - right);
}

function beatVoice(presetId: GateRhythmPresetId, index: number): DrumVoiceId {
  if (presetId === "offbeat") return index % 2 === 0 ? "closed-hat" : "clap";
  if (presetId === "syncopated") {
    return (["kick", "closed-hat", "snare", "closed-hat", "kick"] as const)[
      index % 5
    ];
  }
  return index % 2 === 0 ? "kick" : "snare";
}

function defaultPitchedEvent(
  role: Exclude<PlanetRole, "beat">,
  index: number,
): Pick<PatternEvent, "pitch" | "chordAction"> {
  if (role === "chords") {
    return {
      pitch: { kind: "chordTone", index: index % 3, octaveOffset: 0 },
      chordAction: "strike",
    };
  }
  if (role === "bass") {
    return { pitch: { kind: "root", octaveOffset: -1 } };
  }
  return {
    pitch: {
      kind: "scaleDegree",
      degree: role === "melody" ? index % 5 : (index * 2) % 5,
      octaveOffset: role === "texture" ? 1 : 0,
    },
  };
}

export function applyGateRhythmPreset(
  pattern: PatternState,
  role: PlanetRole,
  presetId: GateRhythmPresetId,
  planetId: string,
): PatternState {
  const preset = GATE_RHYTHM_PRESETS.find(({ id }) => id === presetId);
  if (!preset) return pattern;
  const existingByStep = new Map(
    pattern.events.map((event) => [event.step, event]),
  );
  const steps = scaledSteps(preset.referenceSteps, pattern.gridSize);
  const events = steps.map((step, index): PatternEvent => {
    const existing = existingByStep.get(step);
    if (existing) return existing;
    const velocity = presetId === "sparse" ? 0.82 : index === 0 ? 0.84 : 0.68;
    return {
      id: `${planetId}:gate:${presetId}:${step}`,
      step,
      velocity,
      probability: 1,
      durationSteps:
        role === "chords" ? Math.max(1, pattern.gridSize / 8) : 0.5,
      ...(role === "beat"
        ? { drumVoice: beatVoice(presetId, index) }
        : defaultPitchedEvent(role, index)),
    };
  });

  return {
    ...pattern,
    templateId: `gate-${presetId}`,
    events,
  };
}

export function inferGateRhythmPreset(
  pattern: PatternState,
): GateRhythmPresetId | "custom" {
  const match = /^gate-(steady|offbeat|sparse|syncopated)$/u.exec(
    pattern.templateId ?? "",
  );
  return (match?.[1] as GateRhythmPresetId | undefined) ?? "custom";
}
