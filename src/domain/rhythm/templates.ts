import {
  RHYTHM_TEMPLATES,
  type RhythmTemplateDefinition,
  type RhythmTemplateId,
} from "../../content/rhythmTemplates";
import type { PatternState } from "../composition/types";
import { createSeededRandom } from "../generation/prng";
import { createStableId } from "../serialization/ids";

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function getRhythmTemplate(
  templateId: RhythmTemplateId,
): RhythmTemplateDefinition {
  return RHYTHM_TEMPLATES[templateId];
}

export interface InstantiateRhythmTemplateOptions {
  density?: number;
  energy?: number;
  humanize?: number;
}

export function instantiateRhythmTemplate(
  templateId: RhythmTemplateId,
  seed: string,
  options: InstantiateRhythmTemplateOptions = {},
): PatternState {
  const template = getRhythmTemplate(templateId);
  const density = clamp01(options.density ?? 0.5);
  const energy = clamp01(options.energy ?? 0.5);
  const humanize = Math.min(0.12, clamp01(options.humanize ?? 0.02));
  const random = createSeededRandom(seed).derive("rhythm", templateId);
  const optionalKeepProbability = 0.12 + density * 0.88;

  const events = template.events.flatMap((event, index) => {
    if (!event.anchor && !random.chance(optionalKeepProbability)) return [];

    return [
      {
        id: createStableId("event", seed, "rhythm", templateId, String(index)),
        step: event.step,
        velocity: clamp01(event.velocity * (0.84 + energy * 0.2)),
        probability: clamp01(event.probability ?? 1),
        durationSteps: 1,
        drumVoice: event.drumVoice,
      },
    ];
  });

  return {
    gridSize: template.gridSize,
    events,
    templateId,
    humanize,
  };
}

export function getRhythmAnchorKeys(
  templateId: RhythmTemplateId,
): readonly string[] {
  return getRhythmTemplate(templateId)
    .events.filter((event) => event.anchor)
    .map((event) => `${event.step}:${event.drumVoice}`);
}
