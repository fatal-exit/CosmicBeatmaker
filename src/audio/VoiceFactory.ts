import {
  Filter,
  Gain,
  MembraneSynth,
  MetalSynth,
  MonoSynth,
  NoiseSynth,
  Panner,
  PolySynth,
  Synth,
  type InputNode,
} from "tone";

import { AUDIO_PPQ } from "./constants";
import { ticksToSeconds } from "./timing";
import type { CompiledTrack, ScheduledOccurrence } from "./types";

export interface RuntimeVoice {
  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void;
  dispose(): void;
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

class TrackStrip {
  readonly filter: Filter;
  private readonly panner: Panner;
  private readonly gain: Gain;

  constructor(track: CompiledTrack, output: InputNode, headroom: number) {
    const frequency = 160 + track.filter ** 2 * 15_000;
    this.filter = new Filter({ frequency, type: "lowpass", rolloff: -12 });
    this.panner = new Panner(track.pan);
    this.gain = new Gain(Math.max(0, Math.min(1, track.level)) * headroom);
    this.filter.connect(this.panner);
    this.panner.connect(this.gain);
    this.gain.connect(output);
  }

  dispose(): void {
    this.filter.dispose();
    this.panner.dispose();
    this.gain.dispose();
  }
}

class BeatFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly kick = new MembraneSynth({
    pitchDecay: 0.025,
    octaves: 5,
    envelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.08 },
  });
  private readonly noise = new NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.03 },
  });
  private readonly metal = new MetalSynth({
    envelope: { attack: 0.001, decay: 0.055, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 16,
    resonance: 4_800,
    octaves: 1.2,
  });

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(track, output, 0.42);
    this.kick.connect(this.strip.filter);
    this.noise.connect(this.strip.filter);
    this.metal.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    const duration = Math.max(
      0.015,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    const velocity = occurrence.velocity;
    if (occurrence.drumVoice === "kick") {
      this.kick.triggerAttackRelease(
        midiToFrequency(occurrence.midiNotes[0] ?? 36),
        duration,
        scheduledAudioTime,
        velocity,
      );
    } else if (
      occurrence.drumVoice === "snare" ||
      occurrence.drumVoice === "clap" ||
      occurrence.drumVoice === "open-hat"
    ) {
      this.noise.triggerAttackRelease(
        duration,
        scheduledAudioTime,
        velocity * 0.72,
      );
    } else {
      this.metal.triggerAttackRelease(
        midiToFrequency(occurrence.midiNotes[0] ?? 50),
        duration,
        scheduledAudioTime,
        velocity * 0.48,
      );
    }
  }

  dispose(): void {
    this.kick.dispose();
    this.noise.dispose();
    this.metal.dispose();
    this.strip.dispose();
  }
}

class PitchedFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly synth: MonoSynth | PolySynth;

  constructor(track: CompiledTrack, output: InputNode) {
    const headroom = track.role === "bass" ? 0.32 : 0.24;
    this.strip = new TrackStrip(track, output, headroom);
    if (track.role === "bass") {
      this.synth = new MonoSynth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 0.18, sustain: 0.35, release: 0.12 },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.15,
          sustain: 0.2,
          release: 0.2,
          baseFrequency: 90,
          octaves: 2.4,
        },
      });
    } else {
      this.synth = new PolySynth(Synth, {
        oscillator: { type: track.role === "melody" ? "triangle" : "sine" },
        envelope: {
          attack: track.role === "chords" ? 0.05 : 0.005,
          decay: 0.18,
          sustain: track.role === "chords" ? 0.5 : 0.2,
          release: track.role === "chords" ? 0.5 : 0.14,
        },
      });
    }
    this.synth.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    const notes = occurrence.midiNotes.map(midiToFrequency);
    const duration = Math.max(
      1 / AUDIO_PPQ,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    if (this.synth instanceof MonoSynth) {
      this.synth.triggerAttackRelease(
        notes[0] ?? midiToFrequency(48),
        duration,
        scheduledAudioTime,
        occurrence.velocity,
      );
    } else {
      this.synth.triggerAttackRelease(
        notes,
        duration,
        scheduledAudioTime,
        occurrence.velocity,
      );
    }
  }

  dispose(): void {
    this.synth.dispose();
    this.strip.dispose();
  }
}

class TextureFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly synth = new NoiseSynth({
    noise: { type: "pink" },
    envelope: { attack: 0.04, decay: 0.2, sustain: 0.12, release: 0.35 },
  });

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(track, output, 0.1);
    this.synth.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    this.synth.triggerAttackRelease(
      Math.max(0.02, ticksToSeconds(occurrence.durationTicks, bpm)),
      scheduledAudioTime,
      occurrence.velocity * 0.5,
    );
  }

  dispose(): void {
    this.synth.dispose();
    this.strip.dispose();
  }
}

/** Synthesized fallback coverage for every MVP role and failed sample asset. */
export function createFallbackVoice(
  track: CompiledTrack,
  output: InputNode,
): RuntimeVoice {
  if (track.role === "beat") return new BeatFallbackVoice(track, output);
  if (track.role === "texture") return new TextureFallbackVoice(track, output);
  return new PitchedFallbackVoice(track, output);
}
