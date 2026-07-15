import { describe, expect, it } from "vitest";

import { compileComposition } from "../src/audio/CompositionCompiler";
import type {
  DrumVoiceId,
  MoonBehaviorPresetId,
  PatternState,
  PlanetRole,
} from "../src/domain/composition";
import { createStarterComposition } from "../src/domain/composition";
import { getPlanetStarAffinity } from "../src/domain/composition/starSystems";
import { isPitchIntentSafe } from "../src/domain/harmony";
import {
  projectCelestialRhythm,
  projectMoonBehavior,
} from "../src/domain/rhythm";
import { compositionToSceneDescriptor } from "../src/scene/descriptors";

const BEHAVIORS: readonly MoonBehaviorPresetId[] = [
  "accent",
  "echo",
  "harmony",
  "pickup",
  "fill",
  "counterpulse",
];

function melodyPattern(): PatternState {
  return {
    gridSize: 8,
    templateId: "stale-moon-template",
    humanize: 0.04,
    events: [
      {
        id: "moon-a",
        step: 0,
        velocity: 0.48,
        probability: 0.75,
        durationSteps: 2,
        pitch: { kind: "scaleDegree", degree: 0, octaveOffset: 1 },
      },
      {
        id: "moon-b",
        step: 3,
        velocity: 0.67,
        probability: 0.9,
        durationSteps: 1,
        pitch: { kind: "chordTone", index: 2, octaveOffset: 1 },
      },
      {
        id: "moon-c",
        step: 6,
        velocity: 0.82,
        probability: 1,
        durationSteps: 0.5,
        pitch: { kind: "root", octaveOffset: 1 },
      },
    ],
  };
}

function eventById(pattern: PatternState, id: string) {
  const event = pattern.events.find((candidate) => candidate.id === id);
  expect(event).toBeDefined();
  return event!;
}

function beatPattern(): PatternState {
  return {
    gridSize: 8,
    humanize: 0,
    events: [
      {
        id: "beat-moon-a",
        step: 0,
        velocity: 0.48,
        probability: 1,
        durationSteps: 1,
        drumVoice: "kick",
      },
      {
        id: "beat-moon-b",
        step: 3,
        velocity: 0.67,
        probability: 0.9,
        durationSteps: 1,
        drumVoice: "snare",
      },
      {
        id: "beat-moon-c",
        step: 6,
        velocity: 0.82,
        probability: 0.8,
        durationSteps: 0.5,
        drumVoice: "closed-hat",
      },
    ],
  };
}

describe("moon behavior projections", () => {
  it("gives every preset a distinct deterministic bounded projection", () => {
    const source = melodyPattern();
    const canonicalSnapshot = structuredClone(source);
    const projections = BEHAVIORS.map((behavior) =>
      projectMoonBehavior(source, behavior, "melody"),
    );

    expect(
      new Set(projections.map((pattern) => JSON.stringify(pattern))).size,
    ).toBe(BEHAVIORS.length);
    expect(source).toEqual(canonicalSnapshot);

    for (const projected of projections) {
      expect(projected.gridSize).toBe(source.gridSize);
      expect(projected.humanize).toBe(source.humanize);
      expect(projected.templateId).toBeUndefined();
      expect(projected.events).toHaveLength(source.events.length);
      expect(projected.events.length).toBeGreaterThan(0);
      expect(projected.events.map(({ id }) => id).sort()).toEqual(
        source.events.map(({ id }) => id).sort(),
      );
      for (const event of projected.events) {
        const canonicalEvent = source.events.find(({ id }) => id === event.id)!;
        expect(event).not.toBe(canonicalEvent);
        if (event.pitch && canonicalEvent.pitch) {
          expect(event.pitch).not.toBe(canonicalEvent.pitch);
        }
        expect(Number.isInteger(event.step)).toBe(true);
        expect(event.step).toBeGreaterThanOrEqual(0);
        expect(event.step).toBeLessThan(projected.gridSize);
        expect(event.velocity).toBeGreaterThanOrEqual(0);
        expect(event.velocity).toBeLessThanOrEqual(1);
        expect(event.probability).toBeGreaterThanOrEqual(0);
        expect(event.probability).toBeLessThanOrEqual(1);
        expect(event.durationSteps).toBeGreaterThan(0);
        expect(event.durationSteps).toBeLessThanOrEqual(projected.gridSize);
      }
    }
  });

  it("matches the six declared musical behavior contracts", () => {
    const source = melodyPattern();

    const accent = projectMoonBehavior(source, "accent", "melody");
    expect(accent.events.map(({ step }) => step)).toEqual([0, 3, 6]);
    expect(eventById(accent, "moon-a").velocity).toBeGreaterThan(0.48);

    const echo = projectMoonBehavior(source, "echo", "melody");
    expect(eventById(echo, "moon-a")).toMatchObject({
      step: 1,
      durationSteps: 1,
    });
    expect(eventById(echo, "moon-a").velocity).toBeLessThan(0.48);

    const harmony = projectMoonBehavior(source, "harmony", "melody");
    expect(harmony.events.map(({ step }) => step)).toEqual([0, 3, 6]);
    expect(eventById(harmony, "moon-a").pitch).not.toEqual(
      eventById(source, "moon-a").pitch,
    );

    const pickup = projectMoonBehavior(source, "pickup", "melody");
    expect(eventById(pickup, "moon-a")).toMatchObject({
      step: 7,
      durationSteps: 0.75,
    });
    expect(eventById(pickup, "moon-a").pitch).not.toEqual(
      eventById(source, "moon-a").pitch,
    );
    expect(eventById(pickup, "moon-b").pitch).toEqual({
      kind: "chordTone",
      index: 3,
      octaveOffset: 1,
    });

    const fill = projectMoonBehavior(source, "fill", "melody");
    expect(fill.events.every(({ step }) => step >= 6 && step < 8)).toBe(true);

    const counterpulse = projectMoonBehavior(source, "counterpulse", "melody");
    for (const event of source.events) {
      expect(eventById(counterpulse, event.id).step).toBe(
        (event.step + source.gridSize / 2) % source.gridSize,
      );
    }
  });

  it("keeps harmony and pickup pitches safe and beat voices playable", () => {
    const harmony = createStarterComposition("moon-pitch-safety").harmony;
    const roles: readonly Exclude<PlanetRole, "beat">[] = [
      "bass",
      "chords",
      "melody",
      "texture",
    ];

    for (const role of roles) {
      for (const behavior of ["harmony", "pickup"] as const) {
        const projected = projectMoonBehavior(
          {
            gridSize: 8,
            humanize: 0,
            events: [
              {
                id: `${role}-${behavior}`,
                step: 0,
                velocity: 0.6,
                probability: 1,
                durationSteps: 1,
                pitch: { kind: "scaleDegree", degree: 2, octaveOffset: 0 },
              },
            ],
          },
          behavior,
          role,
        );
        const pitch = projected.events[0].pitch;
        expect(pitch).toBeDefined();
        expect(
          isPitchIntentSafe(pitch!, harmony, { role, chordIndex: 0 }),
        ).toBe(true);
      }
    }

    const voices: readonly DrumVoiceId[] = [
      "kick",
      "snare",
      "clap",
      "closed-hat",
      "open-hat",
      "rim",
      "perc",
    ];
    for (const drumVoice of voices) {
      const projected = projectMoonBehavior(
        {
          gridSize: 8,
          humanize: 0,
          events: [
            {
              id: `drum-${drumVoice}`,
              step: 0,
              velocity: 0.6,
              probability: 1,
              durationSteps: 1,
              drumVoice,
            },
          ],
        },
        "harmony",
        "beat",
      );
      expect(voices).toContain(projected.events[0].drumVoice);
      expect(projected.events[0].drumVoice).not.toBe(drumVoice);
      expect(projected.events[0].pitch).toBeUndefined();
    }
  });

  it("applies moon behavior before Black Hole and binary projections", () => {
    const source: PatternState = {
      gridSize: 8,
      templateId: "order-template",
      humanize: 0,
      events: [
        {
          id: "ordered-moon-event",
          step: 1,
          velocity: 0.8,
          probability: 1,
          durationSteps: 2,
          pitch: { kind: "scaleDegree", degree: 0, octaveOffset: 1 },
        },
      ],
    };
    const star = {
      presetId: "black-hole" as const,
      companion: {
        id: "binary-companion",
        presetId: "void" as const,
        visualSeed: 17,
        intensity: 0.6,
        rhythmMode: "interlock" as const,
      },
    };

    const behavior = projectMoonBehavior(source, "echo", "melody");
    const projected = projectCelestialRhythm(behavior, star, "companion");

    expect(projected.templateId).toBeUndefined();
    expect(projected.events).toEqual([
      {
        ...source.events[0],
        step: 5,
        velocity: 0.544,
        probability: 0.92,
        durationSteps: 2,
        pitch: { ...source.events[0].pitch! },
      },
    ]);

    const composition = createStarterComposition("moon-binary-order");
    composition.star = {
      ...composition.star,
      presetId: "black-hole",
      companion: star.companion,
    };
    composition.swing = 0;
    composition.macros = {
      energy: 0.5,
      density: 0.5,
      groove: 0.5,
      space: 0.5,
      complexity: 0.5,
    };
    const starterPlanet = composition.planets[0];
    composition.planets = [
      { ...starterPlanet, id: "moon-order-primary", moons: [] },
      { ...starterPlanet, id: "moon-order-companion", moons: [] },
    ];
    const companionIndex = composition.planets.findIndex(
      (_, index) => getPlanetStarAffinity(composition, index) === "companion",
    );
    const companionPlanet = composition.planets[companionIndex];
    companionPlanet.moons = [
      {
        id: "ordered-moon",
        behaviorPresetId: "echo",
        pattern: {
          ...source,
          events: [
            {
              ...source.events[0],
              drumVoice: "kick",
              pitch: undefined,
            },
          ],
        },
        orbitRatio: 1,
        phase: 0,
        level: 0.4,
        probability: 1,
        appearanceSeed: 17,
        muted: false,
        locked: false,
      },
    ];

    const occurrence = compileComposition(composition, {
      probabilityMode: "defer",
    }).occurrences.find(({ trackId }) => trackId === "ordered-moon");
    expect(occurrence).toMatchObject({
      eventId: "ordered-moon-event",
      startTick: 1_200,
      durationTicks: 480,
      velocity: 0.544,
      probability: 0.92,
    });
    const sceneMoon =
      compositionToSceneDescriptor(composition).planets[companionIndex]
        .moons[0];
    expect(sceneMoon.events[0]).toMatchObject({
      eventId: "ordered-moon-event",
      step: 5,
      velocity: 0.544,
    });
  });

  it.each(BEHAVIORS)(
    "keeps %s moon event IDs and velocities equal in audio and scene projections",
    (behaviorPresetId) => {
      const composition = createStarterComposition(
        `moon-parity-${behaviorPresetId}`,
      );
      composition.swing = 0;
      composition.macros = {
        energy: 0.5,
        density: 0.5,
        groove: 0.5,
        space: 0.5,
        complexity: 0.5,
      };
      const parent = composition.planets[0];
      parent.orbit.phase = 0;
      parent.moons = [
        {
          id: `moon-${behaviorPresetId}`,
          behaviorPresetId,
          pattern: beatPattern(),
          orbitRatio: 1,
          phase: 0,
          level: 0.4,
          probability: 1,
          appearanceSeed: 17,
          muted: false,
          locked: false,
        },
      ];

      const audioOccurrences = compileComposition(composition, {
        probabilityMode: "defer",
      }).occurrences.filter((occurrence) => occurrence.sourceKind === "moon");
      const audio = [
        ...new Map(
          audioOccurrences.map(({ eventId, velocity }) => [
            eventId,
            { eventId, velocity },
          ]),
        ).values(),
      ].sort((left, right) => left.eventId.localeCompare(right.eventId));

      const sceneMoon =
        compositionToSceneDescriptor(composition).planets[0].moons[0];
      const scene = sceneMoon.events
        .map(({ eventId, velocity }) => ({ eventId, velocity }))
        .sort((left, right) => left.eventId.localeCompare(right.eventId));

      expect(audio).toHaveLength(beatPattern().events.length);
      expect(scene).toEqual(audio);
    },
  );
});
