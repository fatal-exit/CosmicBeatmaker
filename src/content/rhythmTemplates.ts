import type { DrumVoiceId } from "../domain/composition/types";

export type RhythmTemplateId =
  | "four-on-floor"
  | "backbeat"
  | "half-time"
  | "broken-orbit"
  | "three-three-two"
  | "minimal-pulse"
  | "shuffled-dust"
  | "neutron-drive";

export interface RhythmTemplateEvent {
  step: number;
  drumVoice: DrumVoiceId;
  velocity: number;
  anchor: boolean;
  probability?: number;
}

export interface RhythmTemplateDefinition {
  id: RhythmTemplateId;
  name: string;
  gridSize: 16;
  events: readonly RhythmTemplateEvent[];
}

export const RHYTHM_TEMPLATES = {
  "four-on-floor": {
    id: "four-on-floor",
    name: "Four on Floor",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 1, anchor: true },
      { step: 4, drumVoice: "kick", velocity: 0.86, anchor: true },
      { step: 8, drumVoice: "kick", velocity: 0.92, anchor: true },
      { step: 12, drumVoice: "kick", velocity: 0.86, anchor: true },
      { step: 4, drumVoice: "clap", velocity: 0.8, anchor: true },
      { step: 12, drumVoice: "clap", velocity: 0.86, anchor: true },
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({
        step,
        drumVoice: "closed-hat" as const,
        velocity: step % 4 === 0 ? 0.5 : 0.38,
        anchor: step === 0 || step === 8,
      })),
    ],
  },
  backbeat: {
    id: "backbeat",
    name: "Backbeat",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 1, anchor: true },
      { step: 7, drumVoice: "kick", velocity: 0.72, anchor: false },
      { step: 10, drumVoice: "kick", velocity: 0.84, anchor: true },
      { step: 4, drumVoice: "snare", velocity: 0.86, anchor: true },
      { step: 12, drumVoice: "snare", velocity: 0.92, anchor: true },
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({
        step,
        drumVoice: "closed-hat" as const,
        velocity: step % 4 === 0 ? 0.48 : 0.34,
        anchor: step === 0 || step === 8,
      })),
    ],
  },
  "half-time": {
    id: "half-time",
    name: "Half Time",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 1, anchor: true },
      { step: 6, drumVoice: "kick", velocity: 0.68, anchor: false },
      { step: 11, drumVoice: "kick", velocity: 0.8, anchor: false },
      { step: 8, drumVoice: "snare", velocity: 0.96, anchor: true },
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({
        step,
        drumVoice: "closed-hat" as const,
        velocity: step === 14 ? 0.46 : 0.34,
        anchor: step === 0 || step === 8,
      })),
    ],
  },
  "broken-orbit": {
    id: "broken-orbit",
    name: "Broken Orbit",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 1, anchor: true },
      { step: 3, drumVoice: "kick", velocity: 0.62, anchor: false },
      { step: 9, drumVoice: "kick", velocity: 0.82, anchor: true },
      { step: 14, drumVoice: "kick", velocity: 0.58, anchor: false },
      { step: 4, drumVoice: "snare", velocity: 0.84, anchor: true },
      { step: 12, drumVoice: "snare", velocity: 0.9, anchor: true },
      { step: 2, drumVoice: "closed-hat", velocity: 0.38, anchor: false },
      { step: 6, drumVoice: "closed-hat", velocity: 0.34, anchor: false },
      { step: 11, drumVoice: "open-hat", velocity: 0.42, anchor: false },
      { step: 15, drumVoice: "rim", velocity: 0.3, anchor: false },
    ],
  },
  "three-three-two": {
    id: "three-three-two",
    name: "3-3-2",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 1, anchor: true },
      { step: 6, drumVoice: "kick", velocity: 0.82, anchor: true },
      { step: 12, drumVoice: "kick", velocity: 0.88, anchor: true },
      { step: 4, drumVoice: "clap", velocity: 0.72, anchor: true },
      { step: 12, drumVoice: "clap", velocity: 0.84, anchor: true },
      { step: 3, drumVoice: "closed-hat", velocity: 0.35, anchor: false },
      { step: 9, drumVoice: "closed-hat", velocity: 0.35, anchor: false },
      { step: 14, drumVoice: "closed-hat", velocity: 0.38, anchor: false },
    ],
  },
  "minimal-pulse": {
    id: "minimal-pulse",
    name: "Minimal Pulse",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 0.96, anchor: true },
      { step: 8, drumVoice: "snare", velocity: 0.78, anchor: true },
      { step: 4, drumVoice: "closed-hat", velocity: 0.32, anchor: false },
      { step: 12, drumVoice: "closed-hat", velocity: 0.36, anchor: false },
      { step: 15, drumVoice: "rim", velocity: 0.28, anchor: false },
    ],
  },
  "shuffled-dust": {
    id: "shuffled-dust",
    name: "Shuffled Dust",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 0.96, anchor: true },
      { step: 10, drumVoice: "kick", velocity: 0.78, anchor: true },
      { step: 4, drumVoice: "snare", velocity: 0.78, anchor: true },
      { step: 12, drumVoice: "snare", velocity: 0.86, anchor: true },
      { step: 2, drumVoice: "closed-hat", velocity: 0.34, anchor: false },
      { step: 6, drumVoice: "closed-hat", velocity: 0.42, anchor: false },
      { step: 11, drumVoice: "closed-hat", velocity: 0.32, anchor: false },
      { step: 14, drumVoice: "open-hat", velocity: 0.4, anchor: false },
      { step: 15, drumVoice: "perc", velocity: 0.28, anchor: false },
    ],
  },
  "neutron-drive": {
    id: "neutron-drive",
    name: "Neutron Drive",
    gridSize: 16,
    events: [
      { step: 0, drumVoice: "kick", velocity: 1, anchor: true },
      { step: 3, drumVoice: "kick", velocity: 0.66, anchor: false },
      { step: 8, drumVoice: "kick", velocity: 0.9, anchor: true },
      { step: 10, drumVoice: "kick", velocity: 0.72, anchor: false },
      { step: 4, drumVoice: "snare", velocity: 0.88, anchor: true },
      { step: 12, drumVoice: "snare", velocity: 0.94, anchor: true },
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((step) => ({
        step,
        drumVoice: "closed-hat" as const,
        velocity: step % 4 === 0 ? 0.52 : 0.4,
        anchor: step === 0 || step === 8,
      })),
      { step: 15, drumVoice: "open-hat", velocity: 0.46, anchor: false },
    ],
  },
} as const satisfies Record<RhythmTemplateId, RhythmTemplateDefinition>;

export const RHYTHM_TEMPLATE_IDS = Object.keys(
  RHYTHM_TEMPLATES,
) as RhythmTemplateId[];
