import { describe, expect, it } from "vitest";

import { compileComposition } from "../src/audio/CompositionCompiler";
import type {
  PatternState,
  PlanetState,
  RingState,
} from "../src/domain/composition";
import { generateCompleteSystem } from "../src/domain/generation";
import {
  deriveRingPattern,
  ringActiveSegmentsForDensity,
} from "../src/domain/rhythm/ringPatterns";
import { applyCompositionCommand } from "../src/state/commands";

function ring(
  id: string,
  type: RingState["type"],
  activeSegments: readonly number[],
): RingState {
  const active = Array.from({ length: 16 }, () => false);
  for (const segment of activeSegments) active[segment] = true;
  return {
    id,
    type,
    segments: 16,
    active,
    phase: 0,
    velocityVariation: 0.18,
    probability: 1,
    soundPresetId: "orbital-hat",
    level: 0.3,
  };
}

function planetForRole(role: PlanetState["role"]): PlanetState {
  const composition = generateCompleteSystem(`ring-${role}`);
  return composition.planets.find((planet) => planet.role === role)!;
}

describe("role-aware ring patterns", () => {
  it("places quiet melody ghosts immediately before and after motif notes", () => {
    const parent = planetForRole("melody");
    const pattern: PatternState = {
      gridSize: 16,
      humanize: 0,
      events: [4, 12].map((step, index) => ({
        id: `melody-${index}`,
        step,
        velocity: 0.72,
        probability: 1,
        durationSteps: 2,
        pitch: {
          kind: "scaleDegree" as const,
          degree: index + 1,
          octaveOffset: 1,
        },
      })),
    };
    const melodyRing = ring("melody-ring", "delay", [4, 12]);
    const result = deriveRingPattern(
      { ...parent, pattern },
      pattern,
      melodyRing,
    );

    expect(result.events.map(({ id }) => id)).toEqual([
      "melody-ring:segment:4",
      "melody-ring:segment:12",
    ]);
    expect(result.events.map(({ step }) => step)).toEqual([3, 13]);
    expect(result.events.map(({ pitch }) => pitch)).toEqual(
      pattern.events.map(({ pitch }) => pitch),
    );
    expect(
      result.events.every(
        (event, index) => event.velocity < pattern.events[index].velocity,
      ),
    ).toBe(true);
  });

  it("switches a chord planet from sustained voicings to an articulated arpeggio", () => {
    const composition = generateCompleteSystem("ring-chord-arp");
    composition.star = {
      ...composition.star,
      presetId: "radiant",
      companion: undefined,
    };
    composition.swing = 0;
    composition.macros = {
      energy: 0.5,
      density: 0.5,
      groove: 0,
      space: 0.5,
      complexity: 0.5,
    };
    const chords = composition.planets.find(
      (planet) => planet.role === "chords",
    )!;
    chords.orbit.phase = 0;
    const sustainedSequence = compileComposition(composition);
    const sustainedChords = sustainedSequence.occurrences.filter(
      (event) => event.trackId === chords.id,
    );
    expect(sustainedChords.length).toBeGreaterThan(0);
    expect(sustainedChords.every((event) => event.midiNotes.length >= 3)).toBe(
      true,
    );

    chords.ring = ring(
      "chord-ring",
      "gate",
      Array.from({ length: 16 }, (_, index) => index),
    );

    const sequence = compileComposition(composition);
    const chordBed = sequence.occurrences.filter(
      (event) => event.trackId === chords.id,
    );
    const arpeggio = sequence.occurrences.filter(
      (event) => event.trackId === chords.ring!.id,
    );

    expect(chordBed).toHaveLength(0);
    expect(arpeggio).toHaveLength(16);
    expect(arpeggio.every((event) => event.midiNotes.length === 1)).toBe(true);
    expect(
      new Set(arpeggio.map((event) => event.midiNotes[0])).size,
    ).toBeGreaterThan(2);
    expect(arpeggio.every((event) => event.durationTicks < 480)).toBe(true);
    expect(arpeggio.map(({ startTick }) => startTick).slice(0, 5)).toEqual([
      0, 480, 960, 1_440, 1_920,
    ]);
  });

  it("adds bass octave pickups on syncopated eighth-note positions", () => {
    const composition = generateCompleteSystem("ring-bass-pickups");
    composition.star = {
      ...composition.star,
      presetId: "radiant",
      companion: undefined,
    };
    composition.swing = 0;
    composition.macros = {
      energy: 0.5,
      density: 0.5,
      groove: 0,
      space: 0.5,
      complexity: 0.5,
    };
    const bass = composition.planets.find((planet) => planet.role === "bass")!;
    bass.orbit.phase = 0;
    bass.pattern = {
      gridSize: 32,
      humanize: 0,
      events: [0, 8, 16, 24].map((step, index) => ({
        id: `bass-anchor-${index}`,
        step,
        velocity: 0.72,
        probability: 1,
        durationSteps: 3,
        pitch: { kind: "root" as const, octaveOffset: -1 },
      })),
    };
    bass.ring = ring("bass-ring", "gate", [3, 7, 11, 15]);

    const sequence = compileComposition(composition);
    const parentRoot = sequence.occurrences.find(
      (event) => event.trackId === bass.id,
    )!;
    const pickups = sequence.occurrences.filter(
      (event) => event.trackId === bass.ring!.id,
    );

    expect(pickups.map(({ startTick }) => startTick)).toEqual([
      1_680, 3_600, 5_520, 7_440,
    ]);
    expect(pickups[0].midiNotes[0]).toBe(parentRoot.midiNotes[0] + 12);
    expect(
      pickups.slice(0, 3).every((event) => event.startTick % 240 === 0),
    ).toBe(true);
  });

  it("fills ring density deterministically in role-safe priority order", () => {
    const bass = planetForRole("bass");
    const bassRing = ring("bass-density", "gate", []);
    expect(
      ringActiveSegmentsForDensity(bass, bassRing, 0.25).flatMap(
        (active, index) => (active ? [index] : []),
      ),
    ).toEqual([3, 7, 11, 15]);

    const chords = planetForRole("chords");
    const chordRing = ring("chord-density", "gate", []);
    expect(
      ringActiveSegmentsForDensity(chords, chordRing, 0.25).filter(Boolean),
    ).toHaveLength(4);
    expect(
      ringActiveSegmentsForDensity(chords, chordRing, 1).every(Boolean),
    ).toBe(true);
  });

  it("applies ring density through an undoable composition command", () => {
    const composition = generateCompleteSystem("ring-density-command");
    const bass = composition.planets.find((planet) => planet.role === "bass")!;
    bass.ring = ring("command-ring", "gate", []);

    const result = applyCompositionCommand(composition, {
      type: "SetRingDensity",
      planetId: bass.id,
      density: 0.25,
      timestamp: composition.updatedAt,
    });
    const updatedBass = result.composition.planets.find(
      (planet) => planet.id === bass.id,
    )!;

    expect(result.description).toBe("Changed ring density");
    expect(
      updatedBass.ring!.active.flatMap((active, index) =>
        active ? [index] : [],
      ),
    ).toEqual([3, 7, 11, 15]);
    expect(
      composition.planets.find((planet) => planet.id === bass.id)!.ring,
    ).toBe(bass.ring);
  });
});
