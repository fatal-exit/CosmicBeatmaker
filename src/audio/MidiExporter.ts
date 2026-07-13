import { Midi } from "@tonejs/midi";

import type { Composition } from "../domain/composition/types";
import { compileComposition } from "./CompositionCompiler";
import { AUDIO_PPQ } from "./constants";
import type { CompiledTrack } from "./types";

export interface MidiExportOptions {
  loops?: number;
}

const ROLE_ORDER: Record<CompiledTrack["role"], number> = {
  beat: 0,
  bass: 2,
  chords: 3,
  melody: 4,
  texture: 5,
};

function trackOrder(track: CompiledTrack): number {
  if (track.sourceKind === "ring" || track.sourceKind === "asteroid") return 1;
  if (track.sourceKind === "moon") return 6;
  return ROLE_ORDER[track.role];
}

export function createCompositionMidi(
  composition: Composition,
  options: MidiExportOptions = {},
): Midi {
  const sequence = compileComposition(composition, {
    loops: options.loops ?? 1,
  });
  const midi = new Midi();
  if (midi.header.ppq !== AUDIO_PPQ) {
    throw new Error(
      `MIDI encoder PPQ ${midi.header.ppq} does not match ${AUDIO_PPQ}.`,
    );
  }

  midi.name = composition.name;
  midi.header.setTempo(composition.bpm);
  midi.header.timeSignatures = [
    { ticks: 0, timeSignature: [composition.beatsPerBar, 4] },
  ];
  midi.header.update();

  const tracks = [...sequence.tracks].sort(
    (left, right) =>
      trackOrder(left) - trackOrder(right) ||
      left.name.localeCompare(right.name),
  );
  let melodicChannel = 0;

  for (const source of tracks) {
    const track = midi.addTrack();
    track.name = source.name;
    track.channel = source.role === "beat" ? 9 : melodicChannel;
    if (source.role !== "beat") {
      melodicChannel += 1;
      if (melodicChannel === 9) melodicChannel += 1;
      melodicChannel %= 16;
    }

    for (const occurrence of sequence.occurrences) {
      if (occurrence.trackId !== source.id) continue;
      for (const note of occurrence.midiNotes) {
        track.addNote({
          midi: note,
          ticks: occurrence.startTick,
          durationTicks: occurrence.durationTicks,
          velocity: occurrence.velocity,
        });
      }
    }
    track.endOfTrackTicks = sequence.totalTicks;
  }

  return midi;
}

export function exportCompositionToMidi(
  composition: Composition,
  options: MidiExportOptions = {},
): Uint8Array {
  return createCompositionMidi(composition, options).toArray();
}
