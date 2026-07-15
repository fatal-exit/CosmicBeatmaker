import { describe, expect, it } from "vitest";

import {
  compileComposition,
  compileLiveSchedule,
} from "../src/audio/CompositionCompiler";
import {
  resolveCelestialAudioProfile,
  CELESTIAL_AUDIO_PROFILES,
} from "../src/audio/CelestialEffects";
import { getOfflineRenderTiming } from "../src/audio/OfflineRenderer";
import { planSamplePlayback } from "../src/audio/samplePlayback";
import { getAudioSampleAsset } from "../src/content/soundPresets";
import { createStarterComposition } from "../src/domain/composition/starter";
import { generateBinaryCompanionForComposition } from "../src/domain/generation";
import { getPlanetStarAffinity } from "../src/domain/composition/starSystems";
import { projectCelestialRhythm } from "../src/domain/rhythm";

describe("celestial audio compilation", () => {
  it("projects a Black Hole beat at half speed while preserving GM notes and IDs", () => {
    const composition = createStarterComposition("black-hole-beat");
    composition.star = { ...composition.star, presetId: "black-hole" };
    composition.macros = {
      energy: 0.5,
      density: 0.5,
      groove: 0,
      space: 0.5,
      complexity: 0.5,
    };
    const beat = composition.planets[0];
    beat.pattern = {
      gridSize: 16,
      humanize: 0,
      events: [0, 4, 8, 12].map((step) => ({
        id: `beat-${step}`,
        step,
        velocity: 0.8,
        probability: 1,
        durationSteps: 1,
        drumVoice: "kick" as const,
      })),
    };

    const live = compileLiveSchedule(composition);
    const source = live.sources.find(
      (candidate) => candidate.track.id === beat.id,
    )!;
    expect(source.track.pitchShiftSemitones).toBe(-12);
    expect(
      source.cycles[0].events.map((event) => event.startOffsetTicks),
    ).toEqual([0, 960]);
    expect(source.cycles[0].events.map((event) => event.eventId)).toEqual([
      "beat-0",
      "beat-4",
    ]);
    expect(
      source.cycles[0].events.every((event) => event.midiNotes[0] === 36),
    ).toBe(true);

    const full = compileComposition(composition);
    expect(full.occurrences.map((event) => event.eventId)).toEqual([
      "beat-0",
      "beat-4",
      "beat-0",
      "beat-4",
      "beat-0",
      "beat-4",
      "beat-0",
      "beat-4",
    ]);
    expect(full.occurrences.every((event) => event.midiNotes[0] === 36)).toBe(
      true,
    );
  });

  it("transposes non-beat notes once and clamps the MIDI result", () => {
    const composition = createStarterComposition("black-hole-pitched");
    composition.star = { ...composition.star, presetId: "black-hole" };
    const sourcePlanet = composition.planets[0];
    composition.planets = [
      {
        ...sourcePlanet,
        role: "melody",
        pattern: {
          gridSize: 16,
          humanize: 0,
          events: [
            {
              id: "melody-note",
              step: 0,
              velocity: 0.8,
              probability: 1,
              durationSteps: 1,
              pitch: { kind: "absoluteMidi", note: 60 },
            },
          ],
        },
      },
    ];
    const sequence = compileComposition(composition);
    expect(sequence.tracks[0].pitchShiftSemitones).toBe(-12);
    expect(sequence.occurrences[0].midiNotes).toEqual([48]);
  });

  it("keeps binary projection parity between live cycles and full compile", () => {
    for (const rhythmMode of [
      "interlock",
      "mirror",
      "call-response",
    ] as const) {
      const composition = createStarterComposition(`binary-${rhythmMode}`);
      composition.star.companion = generateBinaryCompanionForComposition(
        composition,
        { presetId: "void", rhythmMode },
      );
      const live = compileLiveSchedule(composition);
      const full = compileComposition(composition);
      for (const source of live.sources) {
        const expected = source.cycles[0].events.map((event) => ({
          id: event.eventId,
          start: event.startOffsetTicks,
        }));
        const actual = full.occurrences
          .filter((event) => event.trackId === source.track.id)
          .map((event) => ({ id: event.eventId, start: event.startTick }));
        expect(actual.slice(0, expected.length)).toEqual(expected);
      }
    }
  });

  it("derives a ring from the unprojected parent and applies one celestial pass", () => {
    const composition = createStarterComposition("black-hole-ring");
    composition.star = { ...composition.star, presetId: "black-hole" };
    composition.swing = 0;
    composition.macros = {
      energy: 0.5,
      density: 0.5,
      groove: 0.5,
      space: 0.5,
      complexity: 0.5,
    };
    const parent = composition.planets[0];
    composition.planets = [
      {
        ...parent,
        role: "melody",
        pattern: {
          gridSize: 16,
          humanize: 0,
          events: [
            {
              id: "late-parent",
              step: 12,
              velocity: 0.7,
              probability: 1,
              durationSteps: 1,
              pitch: { kind: "root", octaveOffset: 0 },
            },
          ],
        },
        ring: {
          id: "melody-ring",
          type: "delay",
          segments: 8,
          active: [false, false, false, true, false, false, false, false],
          phase: 0,
          velocityVariation: 0,
          probability: 1,
          soundPresetId: parent.soundPresetId,
          level: 0.3,
        },
      },
    ];
    const ringSource = compileLiveSchedule(composition).sources.find(
      (source) => source.track.id === "melody-ring",
    );
    expect(ringSource).toBeDefined();
    // The unprojected parent's nearest event puts the ghost at step 11; the
    // single Black Hole fallback projection maps it to step 6 (not step 14,
    // which would result from projecting the parent before ring derivation).
    expect(ringSource?.cycles[0].events[0].startOffsetTicks).toBe(720);
  });

  it("applies Black Hole half-speed before the companion rhythm relationship", () => {
    const composition = createStarterComposition("black-hole-binary-order");
    composition.star = {
      ...composition.star,
      presetId: "black-hole",
      companion: {
        id: "binary-companion",
        presetId: "void",
        visualSeed: 0,
        intensity: 0.6,
        rhythmMode: "interlock",
      },
    };
    composition.macros = {
      energy: 0.5,
      density: 0.5,
      groove: 0.5,
      space: 0.5,
      complexity: 0.5,
    };
    composition.swing = 0;
    const firstPlanet = composition.planets[0];
    composition.planets = [
      firstPlanet,
      { ...firstPlanet, id: "binary-second-planet", name: "Second planet" },
    ];
    const companionIndex = composition.planets.findIndex(
      (_, index) => getPlanetStarAffinity(composition, index) === "companion",
    );
    expect(companionIndex).toBeGreaterThanOrEqual(0);
    const planet = composition.planets[companionIndex];
    planet.pattern = {
      gridSize: 8,
      humanize: 0,
      events: [
        {
          id: "binary-order-event",
          step: 1,
          velocity: 0.7,
          probability: 1,
          durationSteps: 1,
          ...(planet.role === "beat"
            ? { drumVoice: "kick" as const }
            : { pitch: { kind: "root" as const, octaveOffset: 0 } }),
        },
      ],
    };
    const source = compileLiveSchedule(composition).sources.find(
      (candidate) => candidate.track.id === planet.id,
    );
    expect(source?.cycles[0].events[0].startOffsetTicks).toBe(720);
  });

  it("uses bounded bypass and dark Black Hole profiles", () => {
    const bypass = resolveCelestialAudioProfile("void");
    const blackHole = resolveCelestialAudioProfile("black-hole");
    expect(bypass).toEqual(CELESTIAL_AUDIO_PROFILES.bypass);
    expect(bypass.bitCrusherWet).toBe(0);
    expect(bypass.distortionWet).toBe(0);
    expect(bypass.reverbWet).toBe(0);
    expect(blackHole.isBlackHole).toBe(true);
    expect(blackHole.bitCrusherBits).toBeGreaterThanOrEqual(8);
    expect(blackHole.bitCrusherBits).toBeLessThanOrEqual(16);
    expect(blackHole.distortionAmount).toBeGreaterThan(0);
    expect(blackHole.distortionAmount).toBeLessThanOrEqual(0.2);
    expect(blackHole.reverbWet).toBeGreaterThan(0.3);
    expect(blackHole.tailSeconds).toBeGreaterThanOrEqual(1.8);
    expect(blackHole.tailSeconds).toBeLessThanOrEqual(3);
  });

  it("chooses the Black Hole offline tail unless an explicit tail wins", () => {
    const normal = createStarterComposition("normal-tail");
    const blackHole = structuredClone(normal);
    blackHole.star = { ...blackHole.star, presetId: "black-hole" };
    expect(getOfflineRenderTiming(normal).renderDurationSeconds).toBeCloseTo(
      getOfflineRenderTiming(normal).musicalDurationSeconds + 0.4,
      8,
    );
    expect(getOfflineRenderTiming(blackHole).renderDurationSeconds).toBeCloseTo(
      getOfflineRenderTiming(blackHole).musicalDurationSeconds + 2.2,
      8,
    );
    expect(
      getOfflineRenderTiming(blackHole, { tailSeconds: 0.7 })
        .renderDurationSeconds,
    ).toBeCloseTo(
      getOfflineRenderTiming(blackHole, { tailSeconds: 0.7 })
        .musicalDurationSeconds + 0.7,
      8,
    );
  });

  it("doubles a drum sample's natural duration one octave down", () => {
    const asset = getAudioSampleAsset("techno-kick");
    const atRoot = planSamplePlayback(asset, 36, 36);
    const down = planSamplePlayback(asset, 36, 24);
    expect(down.playbackDurationSeconds).toBeCloseTo(
      atRoot.playbackDurationSeconds * 2,
      8,
    );
  });

  it("does not double-transpose a pitched sample whose compiled note is already down", () => {
    const asset = getAudioSampleAsset("lead-mid-long");
    const plan = planSamplePlayback(asset, asset.rootMidi ?? 60, 48);
    expect(plan.playbackDurationSeconds).toBeCloseTo(
      asset.durationSeconds * 2,
      6,
    );
  });

  it("shares the same pure projector used by audio and scene callers", () => {
    const composition = createStarterComposition("projector-parity");
    composition.star = { ...composition.star, presetId: "black-hole" };
    const pattern = composition.planets[0].pattern;
    const projected = projectCelestialRhythm(
      pattern,
      composition.star,
      "primary",
    );
    const source = compileLiveSchedule(composition).sources[0];
    expect(source.cycles[0].events.map((event) => event.eventId)).toEqual(
      projected.events.map((event) => event.id),
    );
  });
});
