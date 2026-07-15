import type { DrumVoiceId, PlanetRole } from "../domain/composition/types";

export type AudioSourceKind = "planet" | "moon" | "ring" | "asteroid";

/** Library-neutral description of one exported or playable track. */
export interface CompiledTrack {
  id: string;
  parentId?: string;
  name: string;
  role: PlanetRole;
  sourceKind: AudioSourceKind;
  soundPresetId: string;
  level: number;
  pan: number;
  filter: number;
  /** Derived playback intent. Beat MIDI notes stay canonical; live voices use this shift. */
  readonly pitchShiftSemitones?: -12 | 0;
}

/**
 * One concrete occurrence on the authoritative integer-tick timeline.
 * Tone.js objects and render-frame state deliberately do not cross this boundary.
 */
export interface ScheduledOccurrence {
  occurrenceId: string;
  eventId: string;
  trackId: string;
  role: PlanetRole;
  sourceKind: AudioSourceKind;
  startTick: number;
  durationTicks: number;
  velocity: number;
  probability: number;
  loopIndex: number;
  midiNotes: readonly number[];
  drumVoice?: DrumVoiceId;
}

export interface CompiledSequence {
  ppq: number;
  bpm: number;
  beatsPerBar: number;
  barsPerLoop: number;
  loopCount: number;
  totalTicks: number;
  tracks: readonly CompiledTrack[];
  occurrences: readonly ScheduledOccurrence[];
}

export interface ScheduledVisualEvent extends ScheduledOccurrence {
  /** Exact Web Audio clock time supplied by the scheduler callback. */
  scheduledAudioTime: number;
}
