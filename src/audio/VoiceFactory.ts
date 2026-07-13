import {
  Filter,
  Gain,
  MembraneSynth,
  MetalSynth,
  MonoSynth,
  NoiseSynth,
  Panner,
  PolySynth,
  Sampler,
  Synth,
  type InputNode,
} from "tone";

import {
  getAudioSampleAsset,
  getSampleVoicePreset,
  resolveAudioSampleUrl,
  type AudioSampleAssetDefinition,
  type AudioSampleId,
  type DrumSampleVoiceDefinition,
  type PitchedSampleVoiceDefinition,
  type SampleVoiceDefinition,
} from "../content/soundPresets";
import type { DrumVoiceId } from "../domain/composition/types";
import { ScheduledVoiceBudget } from "./AudioHealth";
import { AUDIO_PPQ, MIDI_DRUM_NOTES } from "./constants";
import { planSamplePlayback, triggerPlannedOneShot } from "./samplePlayback";
import { ticksToSeconds } from "./timing";
import type { CompiledTrack, ScheduledOccurrence } from "./types";

export interface RuntimeVoice {
  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void;
  update?(track: CompiledTrack): void;
  releaseAll?(scheduledAudioTime?: number): void;
  dispose(): void;
}

export interface OptionalSampleVoice extends RuntimeVoice {
  canTrigger(occurrence: ScheduledOccurrence): boolean;
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

class TrackStrip {
  readonly filter: Filter;
  private readonly panner: Panner;
  private readonly gain: Gain;
  private disposed = false;

  constructor(
    track: CompiledTrack,
    output: InputNode,
    private readonly headroom: number,
  ) {
    const frequency = this.filterFrequency(track);
    this.filter = new Filter({ frequency, type: "lowpass", rolloff: -12 });
    this.panner = new Panner(track.pan);
    this.gain = new Gain(this.trackGain(track));
    this.filter.connect(this.panner);
    this.panner.connect(this.gain);
    this.gain.connect(output);
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.filter.frequency.rampTo(this.filterFrequency(track), 0.03);
    this.panner.pan.rampTo(Math.max(-1, Math.min(1, track.pan)), 0.03);
    this.gain.gain.rampTo(this.trackGain(track), 0.03);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.filter.dispose();
    this.panner.dispose();
    this.gain.dispose();
  }

  private filterFrequency(track: CompiledTrack): number {
    return 160 + Math.max(0, Math.min(1, track.filter)) ** 2 * 15_000;
  }

  private trackGain(track: CompiledTrack): number {
    return Math.max(0, Math.min(1, track.level)) * this.headroom;
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
  private disposed = false;

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
    if (this.disposed) return;
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

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.kick.triggerRelease(scheduledAudioTime);
    this.noise.triggerRelease(scheduledAudioTime);
    this.metal.triggerRelease(scheduledAudioTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    this.kick.dispose();
    this.noise.dispose();
    this.metal.dispose();
    this.strip.dispose();
  }
}

class PitchedFallbackVoice implements RuntimeVoice {
  private readonly strip: TrackStrip;
  private readonly synth: MonoSynth | PolySynth;
  private disposed = false;

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
      this.synth.maxPolyphony = 12;
    }
    this.synth.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
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

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    if (this.synth instanceof MonoSynth) {
      this.synth.triggerRelease(scheduledAudioTime);
    } else {
      this.synth.releaseAll(scheduledAudioTime);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
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
  private disposed = false;

  constructor(track: CompiledTrack, output: InputNode) {
    this.strip = new TrackStrip(track, output, 0.1);
    this.synth.connect(this.strip.filter);
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    this.synth.triggerAttackRelease(
      Math.max(0.02, ticksToSeconds(occurrence.durationTicks, bpm)),
      scheduledAudioTime,
      occurrence.velocity * 0.5,
    );
  }

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.synth.triggerRelease(scheduledAudioTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    this.synth.dispose();
    this.strip.dispose();
  }
}

interface DrumSampleState {
  asset: AudioSampleAssetDefinition;
  sampler: Sampler;
  failed: boolean;
  rootMidi: number;
  budget: ScheduledVoiceBudget;
}

class DrumSampleVoice implements OptionalSampleVoice {
  private readonly strip: TrackStrip;
  private readonly statesByVoice = new Map<DrumVoiceId, DrumSampleState>();
  private readonly uniqueStates = new Map<AudioSampleId, DrumSampleState>();
  private disposed = false;

  constructor(
    track: CompiledTrack,
    output: InputNode,
    definition: DrumSampleVoiceDefinition,
  ) {
    this.strip = new TrackStrip(track, output, 0.34);
    for (const [drumVoice, sampleId] of Object.entries(definition.samples) as [
      DrumVoiceId,
      AudioSampleId,
    ][]) {
      let state = this.uniqueStates.get(sampleId);
      if (!state) {
        const asset = getAudioSampleAsset(sampleId);
        state = {
          asset,
          sampler: undefined as unknown as Sampler,
          failed: false,
          rootMidi: MIDI_DRUM_NOTES[drumVoice],
          budget: new ScheduledVoiceBudget(6),
        };
        state.sampler = new Sampler({
          urls: { [state.rootMidi]: resolveAudioSampleUrl(asset.url) },
          attack: asset.attackSeconds,
          release: asset.releaseSeconds,
          curve: "linear",
          onerror: () => {
            if (state) state.failed = true;
          },
        }).connect(this.strip.filter);
        this.uniqueStates.set(sampleId, state);
      }
      this.statesByVoice.set(drumVoice, state);
    }
  }

  canTrigger(occurrence: ScheduledOccurrence): boolean {
    if (this.disposed) return false;
    const state = this.stateFor(occurrence);
    return Boolean(state && !state.failed && state.sampler.loaded);
  }

  trigger(occurrence: ScheduledOccurrence, scheduledAudioTime: number): void {
    if (this.disposed) return;
    const state = this.stateFor(occurrence);
    if (!state) throw new Error("No sample is mapped for this drum voice.");
    const frequency = midiToFrequency(state.rootMidi);
    const plan = planSamplePlayback(
      state.asset,
      state.rootMidi,
      state.rootMidi,
    );
    const endTime =
      scheduledAudioTime +
      (plan.releaseStartSeconds === undefined
        ? plan.playbackDurationSeconds
        : plan.releaseStartSeconds + plan.releaseSeconds);
    if (state.budget.admit(scheduledAudioTime, [endTime]).length === 0) {
      return;
    }
    // Short one-shots keep their natural tail; long ones take one
    // boundary-safe release path rather than receiving a second manual stop.
    triggerPlannedOneShot(
      state.sampler,
      frequency,
      plan,
      scheduledAudioTime,
      occurrence.velocity,
    );
  }

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    for (const state of this.uniqueStates.values()) {
      state.sampler.releaseAll(scheduledAudioTime);
      state.budget.clear();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    for (const state of this.uniqueStates.values()) {
      state.sampler.dispose();
      state.budget.clear();
    }
    this.uniqueStates.clear();
    this.statesByVoice.clear();
    this.strip.dispose();
  }

  private stateFor(
    occurrence: ScheduledOccurrence,
  ): DrumSampleState | undefined {
    return this.statesByVoice.get(occurrence.drumVoice ?? "perc");
  }
}

class PitchedSampleVoice implements OptionalSampleVoice {
  private readonly strip: TrackStrip;
  private readonly asset: AudioSampleAssetDefinition;
  private readonly rootMidi: number;
  private readonly sampler: Sampler;
  private readonly budget = new ScheduledVoiceBudget(16);
  private failed = false;
  private disposed = false;

  constructor(
    track: CompiledTrack,
    output: InputNode,
    definition: PitchedSampleVoiceDefinition,
  ) {
    this.asset = getAudioSampleAsset(definition.sampleId);
    this.rootMidi = definition.rootMidi;
    const headroom =
      track.role === "bass" ? 0.25 : track.role === "texture" ? 0.08 : 0.18;
    this.strip = new TrackStrip(track, output, headroom);
    this.sampler = new Sampler({
      urls: {
        [definition.rootMidi]: resolveAudioSampleUrl(this.asset.url),
      },
      attack: this.asset.attackSeconds,
      release: this.asset.releaseSeconds,
      curve: "linear",
      onerror: () => {
        this.failed = true;
      },
    }).connect(this.strip.filter);
  }

  canTrigger(): boolean {
    return !this.disposed && !this.failed && this.sampler.loaded;
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    const midiNotes =
      occurrence.midiNotes.length > 0 ? occurrence.midiNotes : [this.rootMidi];
    const notes = midiNotes.map(midiToFrequency);
    const duration = Math.max(
      1 / AUDIO_PPQ,
      ticksToSeconds(occurrence.durationTicks, bpm),
    );
    const plans = midiNotes.map((midi) =>
      planSamplePlayback(this.asset, this.rootMidi, midi, duration),
    );
    const requestedEndTimes = plans.map(
      (plan) =>
        scheduledAudioTime +
        (plan.releaseStartSeconds ?? duration) +
        plan.releaseSeconds,
    );
    const admittedCount = this.budget.admit(
      scheduledAudioTime,
      requestedEndTimes,
    ).length;
    const admittedIndices = requestedEndTimes
      .map((_, index) => index)
      .slice(0, admittedCount);
    if (admittedIndices.length === 0) return;
    const admittedNotes = admittedIndices.map((index) => notes[index]);
    const durations = admittedIndices.map(
      (index) => plans[index].releaseStartSeconds ?? duration,
    );
    this.sampler.triggerAttackRelease(
      admittedNotes,
      durations,
      scheduledAudioTime,
      occurrence.velocity,
    );
  }

  update(track: CompiledTrack): void {
    this.strip.update(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.sampler.releaseAll(scheduledAudioTime);
    this.budget.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    this.sampler.dispose();
    this.budget.clear();
    this.strip.dispose();
  }
}

class SampleWithFallbackVoice implements RuntimeVoice {
  private sampleDisabled = false;
  private disposed = false;
  private fallback: RuntimeVoice | undefined;
  private readonly createFallback: () => RuntimeVoice;
  private latestTrack: CompiledTrack | undefined;

  constructor(
    private readonly sample: OptionalSampleVoice,
    fallback: RuntimeVoice | (() => RuntimeVoice),
  ) {
    if (typeof fallback === "function") {
      this.createFallback = fallback;
    } else {
      this.fallback = fallback;
      this.createFallback = () => fallback;
    }
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    if (!this.sampleDisabled) {
      try {
        if (this.sample.canTrigger(occurrence)) {
          this.sample.trigger(occurrence, scheduledAudioTime, bpm);
          return;
        }
      } catch {
        // A decode/runtime failure must not silence the scheduled musical event.
        this.sampleDisabled = true;
      }
    }
    this.getFallback().trigger(occurrence, scheduledAudioTime, bpm);
  }

  update(track: CompiledTrack): void {
    if (this.disposed) return;
    this.latestTrack = track;
    this.sample.update?.(track);
    this.fallback?.update?.(track);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    this.sample.releaseAll?.(scheduledAudioTime);
    this.fallback?.releaseAll?.(scheduledAudioTime);
  }

  dispose(): void {
    if (this.disposed) return;
    this.sample.releaseAll?.();
    this.fallback?.releaseAll?.();
    this.disposed = true;
    this.sample.dispose();
    this.fallback?.dispose();
    this.fallback = undefined;
  }

  private getFallback(): RuntimeVoice {
    if (!this.fallback) {
      this.fallback = this.createFallback();
      if (this.latestTrack) this.fallback.update?.(this.latestTrack);
    }
    return this.fallback;
  }
}

/** Exported for focused routing tests without constructing a Web Audio context. */
export function createSampleWithFallbackVoice(
  sample: OptionalSampleVoice,
  fallback: RuntimeVoice | (() => RuntimeVoice),
): RuntimeVoice {
  return new SampleWithFallbackVoice(sample, fallback);
}

function createOptionalSampleVoice(
  track: CompiledTrack,
  output: InputNode,
  definition: SampleVoiceDefinition,
): OptionalSampleVoice {
  return definition.kind === "drum-kit"
    ? new DrumSampleVoice(track, output, definition)
    : new PitchedSampleVoice(track, output, definition);
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

/**
 * Live playback loads only the active track preset after audio unlock. While
 * loading, or after any fetch/decode/trigger failure, the synthesized voice is
 * used for the same event. Offline WAV rendering intentionally remains synth-only.
 */
export function createLiveVoice(
  track: CompiledTrack,
  output: InputNode,
): RuntimeVoice {
  const definition = getSampleVoicePreset(track.soundPresetId);
  if (!definition) return createFallbackVoice(track, output);
  try {
    return createSampleWithFallbackVoice(
      createOptionalSampleVoice(track, output, definition),
      () => createFallbackVoice(track, output),
    );
  } catch {
    return createFallbackVoice(track, output);
  }
}
