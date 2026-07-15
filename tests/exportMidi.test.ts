import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";

import { exportCompositionToMidi } from "../src/audio/MidiExporter";
import { compileComposition } from "../src/audio/CompositionCompiler";
import { createStarterComposition } from "../src/domain/composition/starter";
import type { PlanetRole, PlanetState } from "../src/domain/composition/types";

function makePlanet(role: PlanetRole, index: number): PlanetState {
  const source = createStarterComposition(`midi-${role}`).planets[0];
  return {
    ...source,
    id: `planet-${role}`,
    role,
    name: `${role} world`,
    pattern: {
      gridSize: 16,
      humanize: 0,
      events: [
        {
          id: `event-${role}`,
          step: index,
          velocity: 0.7,
          probability: 1,
          durationSteps: 2,
          ...(role === "beat"
            ? { drumVoice: "kick" as const }
            : { pitch: { kind: "root" as const, octaveOffset: 0 } }),
        },
      ],
    },
  };
}

describe("MIDI export", () => {
  it("round-trips tempo, meter, track name, timing, duration, and velocity", () => {
    const composition = createStarterComposition("midi-export", {
      name: "MIDI Constellation",
    });
    const bytes = exportCompositionToMidi(composition, { loops: 2 });
    const parsed = new Midi(bytes);

    expect(parsed.header.ppq).toBe(480);
    expect(parsed.header.tempos[0].bpm).toBeCloseTo(104, 4);
    expect(parsed.header.timeSignatures[0].timeSignature).toEqual([4, 4]);
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].name).toBe("Pulse · beat");
    expect(parsed.tracks[0].channel).toBe(9);
    expect(parsed.tracks[0].notes).toHaveLength(32);
    expect(parsed.tracks[0].notes[0]).toMatchObject({
      midi: 36,
      ticks: 0,
      durationTicks: 120,
    });
    expect(parsed.tracks[0].notes[0].velocity).toBeCloseTo(1, 2);
    expect(parsed.tracks[0].notes[1].ticks).toBe(480);
  });

  it("writes a clearly named track for every musical role", () => {
    const composition = createStarterComposition("midi-multitrack");
    const roles: PlanetRole[] = ["beat", "bass", "chords", "melody", "texture"];
    composition.planets = roles.map(makePlanet);

    const parsed = new Midi(exportCompositionToMidi(composition));

    expect(parsed.tracks.map((track) => track.name)).toEqual([
      "beat world · beat",
      "bass world · bass",
      "chords world · chords",
      "melody world · melody",
      "texture world · texture",
    ]);
    expect(parsed.tracks.map((track) => track.channel)).toEqual([
      9, 0, 1, 2, 3,
    ]);
    expect(parsed.tracks.every((track) => track.notes.length > 0)).toBe(true);
  });

  it("transposes Black Hole pitched notes while preserving GM drum mapping", () => {
    const composition = createStarterComposition("midi-black-hole");
    composition.star = { ...composition.star, presetId: "black-hole" };
    composition.planets = [makePlanet("melody", 0), makePlanet("beat", 0)];

    const sequence = compileComposition(composition);
    const parsed = new Midi(exportCompositionToMidi(composition));
    const melodyTrack = parsed.tracks.find((track) =>
      track.name.includes("melody"),
    );
    const beatTrack = parsed.tracks.find((track) =>
      track.name.includes("beat"),
    );
    const melodyOccurrence = sequence.occurrences.find(
      (occurrence) => occurrence.role === "melody",
    );
    expect(melodyTrack?.channel).not.toBe(9);
    expect(melodyTrack?.notes[0].midi).toBe(melodyOccurrence?.midiNotes[0]);
    expect(melodyTrack?.notes[0].midi).toBe(48);
    expect(beatTrack?.channel).toBe(9);
    expect(beatTrack?.notes[0].midi).toBe(36);
  });
});
