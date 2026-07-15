import { describe, expect, it } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
import {
  GATE_RHYTHM_PRESETS,
  applyGateRhythmPreset,
  inferGateRhythmPreset,
} from "../src/domain/rhythm/gatePresets";
import {
  describeGateTiming,
  fitPatternGridToLoopBars,
  gateStepEmphasis,
  naturalPatternGridSizesForLoopBars,
  nudgeGatePhase,
  resizePatternGrid,
  shiftMelodyGatePitch,
  signedGateOffsetSteps,
  summarizeGateTiming,
  togglePatternGate,
} from "../src/domain/rhythm/directGateEditing";

describe("orbit gate rhythm presets", () => {
  it("offers four common beginner-safe gate layouts", () => {
    expect(GATE_RHYTHM_PRESETS.map(({ id }) => id)).toEqual([
      "steady",
      "offbeat",
      "sparse",
      "syncopated",
    ]);
  });

  it("scales common layouts to the pattern grid with stable unique IDs", () => {
    const planet = createStarterComposition("gate-preset").planets[0];
    const pattern = applyGateRhythmPreset(
      { ...planet.pattern, gridSize: 8, events: [] },
      "beat",
      "syncopated",
      planet.id,
    );

    expect(pattern.events.map(({ step }) => step)).toEqual([0, 2, 3, 5, 6]);
    expect(new Set(pattern.events.map(({ id }) => id)).size).toBe(
      pattern.events.length,
    );
    expect(inferGateRhythmPreset(pattern)).toBe("syncopated");
  });

  it("preserves authored events that already occupy a selected gate", () => {
    const planet = createStarterComposition("gate-preserve").planets[0];
    const original = planet.pattern.events.find(({ step }) => step === 0);
    const pattern = applyGateRhythmPreset(
      planet.pattern,
      planet.role,
      "sparse",
      planet.id,
    );

    expect(pattern.events[0]).toBe(original);
    expect(pattern.events.map(({ step }) => step)).toEqual([0, 8]);
  });
});

describe("direct orbit gate editing", () => {
  it("offers only natural step counts for each orbit length", () => {
    expect(naturalPatternGridSizesForLoopBars(0.25)).toEqual([4]);
    expect(naturalPatternGridSizesForLoopBars(0.5)).toEqual([4, 8]);
    expect(naturalPatternGridSizesForLoopBars(1)).toEqual([8, 16]);
    expect(naturalPatternGridSizesForLoopBars(2)).toEqual([8, 16]);
    expect(naturalPatternGridSizesForLoopBars(4)).toEqual([8, 16, 32]);
    expect(naturalPatternGridSizesForLoopBars(1.5)).toEqual([6, 12]);
    expect(naturalPatternGridSizesForLoopBars(3)).toEqual([12, 24]);
    expect(naturalPatternGridSizesForLoopBars(6)).toEqual([24]);
    expect(naturalPatternGridSizesForLoopBars(8)).toEqual([32]);
  });

  it("fits a new orbit to the nearest allowed steps-per-bar detail", () => {
    const pattern =
      createStarterComposition("fit-orbit-steps").planets[0].pattern;
    expect(fitPatternGridToLoopBars(pattern, 1, 0.5).gridSize).toBe(8);
    expect(fitPatternGridToLoopBars(pattern, 1, 4).gridSize).toBe(32);
    expect(fitPatternGridToLoopBars(pattern, 1, 1.5).gridSize).toBe(12);

    const fourBarDetail = { ...pattern, gridSize: 16 as const };
    expect(fitPatternGridToLoopBars(fourBarDetail, 4, 1.5).gridSize).toBe(6);
    expect(fitPatternGridToLoopBars(fourBarDetail, 4, 3).gridSize).toBe(12);
  });

  it("resizes a gate ring while preserving normalized landmarks", () => {
    const planet = createStarterComposition("resize-gates").planets[0];
    const simplified = resizePatternGrid(
      {
        ...planet.pattern,
        events: [
          ...planet.pattern.events,
          {
            ...planet.pattern.events[0],
            id: "weaker-collision",
            step: 1,
            velocity: 0.1,
          },
        ],
      },
      4,
    );

    expect(simplified.gridSize).toBe(4);
    expect(simplified.events.map(({ step }) => step)).toEqual([0, 1, 2, 3]);
    expect(simplified.events.some(({ id }) => id === "weaker-collision")).toBe(
      false,
    );
    expect(simplified.templateId).toBeUndefined();

    const expanded = resizePatternGrid(simplified, 32);
    expect(expanded.events.map(({ step }) => step)).toEqual([0, 8, 16, 24]);
  });

  it("marks beats and offbeat eighths more strongly than fine subdivisions", () => {
    expect(
      Array.from({ length: 16 }, (_, step) => gateStepEmphasis(16, step)),
    ).toEqual([
      "beat",
      "subdivision",
      "offbeat",
      "subdivision",
      "beat",
      "subdivision",
      "offbeat",
      "subdivision",
      "beat",
      "subdivision",
      "offbeat",
      "subdivision",
      "beat",
      "subdivision",
      "offbeat",
      "subdivision",
    ]);
    expect(
      Array.from({ length: 12 }, (_, step) =>
        gateStepEmphasis(12, step),
      ).filter((emphasis) => emphasis === "beat"),
    ).toHaveLength(4);
  });

  it("describes gate placement in bar-and-beat language after phase offset", () => {
    expect(describeGateTiming(1, 16, 0, 0)).toMatchObject({
      positionLabel: "Bar 1 · Beat 1",
      character: "beat",
    });
    expect(describeGateTiming(1, 16, 1, 0)).toMatchObject({
      positionLabel: "Bar 1 · Beat 1 + ¼",
      character: "subdivision",
    });
    expect(describeGateTiming(1, 16, 2, 0)).toMatchObject({
      positionLabel: "Bar 1 · Beat 1 + ½",
      character: "offbeat",
    });
    expect(describeGateTiming(1, 16, 0, 0.25).positionLabel).toBe(
      "Bar 1 · Beat 2",
    );
  });

  it("nudges the complete gate pattern by one snapped slot", () => {
    const earlier = nudgeGatePhase(0, 16, -1);
    expect(earlier).toBe(15 / 16);
    expect(signedGateOffsetSteps(earlier, 16)).toBe(-1);
    expect(nudgeGatePhase(earlier, 16, 1)).toBe(0);
    expect(nudgeGatePhase(0.249, 16, 1)).toBe(5 / 16);
  });

  it("summarizes one between-beat gate without judging syncopation as wrong", () => {
    const planet = createStarterComposition("gate-timing-summary").planets[0];
    const withSyncopation = togglePatternGate(
      planet.pattern,
      planet.role,
      1,
      "between-beat-gate",
    );
    const summary = summarizeGateTiming(
      withSyncopation,
      planet.orbit.loopBars,
      planet.orbit.phase,
    );

    expect(summary).toMatchObject({
      activeGates: 5,
      onBeat: 4,
      betweenBeats: 1,
      label: "4 on-beat · 1 between beats",
    });
    expect(summary.guidance).toContain("creates syncopation");
  });

  it("turns every event at a tapped step off and adds a role-safe event back", () => {
    const planet = createStarterComposition("direct-gates").planets[0];
    const doubled = {
      ...planet.pattern,
      events: [
        ...planet.pattern.events,
        {
          ...planet.pattern.events[0],
          id: "same-step",
          drumVoice: "clap" as const,
        },
      ],
    };

    const disabled = togglePatternGate(doubled, "beat", 0, "unused");
    expect(disabled.events.some((event) => event.step === 0)).toBe(false);
    expect(disabled.templateId).toBeUndefined();

    const enabled = togglePatternGate(disabled, "melody", 1, "new-gate");
    expect(
      enabled.events.find((event) => event.id === "new-gate"),
    ).toMatchObject({
      step: 1,
      pitch: { kind: "scaleDegree", degree: 1, octaveOffset: 0 },
    });
  });

  it("moves only a selected melodic gate through bounded safe scale degrees", () => {
    const pattern = togglePatternGate(
      { gridSize: 16, events: [], humanize: 0 },
      "melody",
      3,
      "melody-gate",
    );
    const raised = shiftMelodyGatePitch(pattern, "melody-gate", 3);
    const shiftedEvent = raised.events.find(
      (event) => event.id === "melody-gate",
    );
    expect(shiftedEvent?.pitch).toEqual({
      kind: "scaleDegree",
      degree: 6,
      octaveOffset: 0,
    });
    expect(
      shiftMelodyGatePitch(raised, "melody-gate", 99).events[0].pitch,
    ).toEqual({ kind: "scaleDegree", degree: 13, octaveOffset: 0 });
  });
});
