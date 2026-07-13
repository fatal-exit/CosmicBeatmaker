import { describe, expect, it } from "vitest";

import {
  RHYTHM_TEMPLATE_IDS,
  RHYTHM_TEMPLATES,
  type RhythmTemplateId,
} from "../src/content/rhythmTemplates";
import {
  calculateSwingOffset,
  getRhythmAnchorKeys,
  instantiateRhythmTemplate,
  rotatePattern,
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
