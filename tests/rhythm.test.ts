import { describe, expect, it } from "vitest";

import {
  RHYTHM_TEMPLATE_IDS,
  RHYTHM_TEMPLATES,
  type RhythmTemplateId,
} from "../src/content/rhythmTemplates";
import type { PatternState } from "../src/domain/composition";
import {
  calculateSwingOffset,
  getRhythmAnchorKeys,
  instantiateRhythmTemplate,
  rotatePattern,
  simplifyPatternForPolymeter,
} from "../src/domain/rhythm";

describe("rhythm templates", () => {
  it("provides the eight curated MVP beat templates", () => {
    expect(RHYTHM_TEMPLATE_IDS).toHaveLength(8);
    expect(new Set(RHYTHM_TEMPLATE_IDS).size).toBe(8);
  });

  it.each(RHYTHM_TEMPLATE_IDS)(
    "%s keeps events in bounds and preserves structural anchors",
    (templateId) => {
      const sparse = instantiateRhythmTemplate(templateId, "anchor-seed", {
        density: 0,
      });
      const dense = instantiateRhythmTemplate(templateId, "anchor-seed", {
        density: 1,
      });
      const anchors = getRhythmAnchorKeys(templateId);
      const sparseKeys = sparse.events.map(
        (event) => `${event.step}:${event.drumVoice}`,
      );

      expect(sparse.events.length).toBeLessThanOrEqual(dense.events.length);
      expect(sparse.events.every((event) => event.step < sparse.gridSize)).toBe(
        true,
      );
      expect(anchors.every((anchor) => sparseKeys.includes(anchor))).toBe(true);
      expect(dense.events).toHaveLength(
        RHYTHM_TEMPLATES[templateId].events.length,
      );
    },
  );

  it("instantiates deterministically for the same seed", () => {
    const first = instantiateRhythmTemplate("broken-orbit", "repeatable", {
      density: 0.55,
      energy: 0.7,
    });
    const second = instantiateRhythmTemplate("broken-orbit", "repeatable", {
      density: 0.55,
      energy: 0.7,
    });
    expect(first).toEqual(second);
  });

  it("rotates events with forward and backward wrapping", () => {
    const pattern = instantiateRhythmTemplate("minimal-pulse", "rotate", {
      density: 1,
    });
    const forward = rotatePattern(pattern, 3);
    const backward = rotatePattern(pattern, -2);

    expect(forward.events.map((event) => event.step)).toContain(3);
    expect(backward.events.map((event) => event.step)).toContain(14);
    expect(pattern.events.map((event) => event.step)).toContain(0);
    expect(() => rotatePattern(pattern, 0.5)).toThrow(/whole-step/);
  });

  it("simplifies 16- and 32-step patterns for polymetric orbits", () => {
    const sixteenStepPattern: PatternState = {
      gridSize: 16,
      humanize: 0,
      templateId: "backbeat",
      events: [0, 4, 8, 12, 15].map((step) => ({
        id: `sixteen-${step}`,
        step,
        velocity: 0.8,
        probability: 1,
        durationSteps: 1,
        drumVoice: "kick" as const,
      })),
    };
    const thirtyTwoStepPattern: PatternState = {
      ...sixteenStepPattern,
      gridSize: 32,
      events: [0, 8, 16, 24, 31].map((step) => ({
        id: `thirty-two-${step}`,
        step,
        velocity: 0.8,
        probability: 1,
        durationSteps: 1,
        drumVoice: "kick" as const,
      })),
    };

    const oneAndAHalfBars = simplifyPatternForPolymeter(
      sixteenStepPattern,
      1.5,
    );
    const threeBars = simplifyPatternForPolymeter(thirtyTwoStepPattern, 3);

    expect(oneAndAHalfBars.gridSize).toBe(12);
    expect(oneAndAHalfBars.events.map(({ step }) => step)).toEqual([0, 4, 8]);
    expect(oneAndAHalfBars.events.map(({ id }) => id)).toEqual([
      "sixteen-0",
      "sixteen-4",
      "sixteen-8",
    ]);
    expect(oneAndAHalfBars.templateId).toBeUndefined();
    expect(threeBars.gridSize).toBe(24);
    expect(threeBars.events.map(({ step }) => step)).toEqual([0, 8, 16]);
    expect(threeBars.events.map(({ id }) => id)).toEqual([
      "thirty-two-0",
      "thirty-two-8",
      "thirty-two-16",
    ]);
    expect(threeBars.templateId).toBeUndefined();
    expect(sixteenStepPattern.events).toHaveLength(5);
    expect(thirtyTwoStepPattern.events).toHaveLength(5);
  });

  it("retains one event when polymeter simplification would empty a pattern", () => {
    const pattern: PatternState = {
      gridSize: 16,
      humanize: 0,
      events: [
        {
          id: "late-event",
          step: 14,
          velocity: 0.8,
          probability: 1,
          durationSteps: 1,
          drumVoice: "kick" as const,
        },
      ],
    };

    expect(simplifyPatternForPolymeter(pattern, 1.5)).toMatchObject({
      gridSize: 12,
      events: [{ id: "late-event", step: 2 }],
    });
    expect(simplifyPatternForPolymeter(pattern, 2)).toBe(pattern);
  });

  it("bounds swing and moves only off subdivisions", () => {
    expect(calculateSwingOffset(0, 0.5)).toBe(0);
    expect(calculateSwingOffset(1, 0.5)).toBe(0.25);
    expect(calculateSwingOffset(3, 99)).toBe(0.3);
    expect(calculateSwingOffset(3, -1)).toBe(0);
  });

  it("has a kick anchor in every template", () => {
    for (const templateId of Object.keys(
      RHYTHM_TEMPLATES,
    ) as RhythmTemplateId[]) {
      expect(
        RHYTHM_TEMPLATES[templateId].events.some(
          (event) => event.anchor && event.drumVoice === "kick",
        ),
      ).toBe(true);
    }
  });
});
