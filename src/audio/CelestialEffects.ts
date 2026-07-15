import { BitCrusher, Distortion, Freeverb, type InputNode } from "tone";

import type {
  Composition,
  StarPresetId,
  StarState,
} from "../domain/composition/types";

/** A small, star-level profile rather than one effect graph per source. */
export interface CelestialAudioProfile {
  readonly id: "bypass" | "black-hole";
  readonly isBlackHole: boolean;
  /** Default post-reverb render tail for offline export. */
  readonly defaultTailSeconds: number;
  readonly bitCrusher: {
    readonly bits: number;
    readonly wet: number;
  };
  readonly distortion: {
    readonly amount: number;
    readonly wet: number;
  };
  readonly reverb: {
    readonly roomSize: number;
    readonly dampening: number;
    readonly wet: number;
  };
  // Flat aliases keep the profile convenient for small pure tests and tools.
  readonly bitCrusherBits: number;
  readonly bitCrusherWet: number;
  readonly distortionAmount: number;
  readonly distortionWet: number;
  readonly reverbRoomSize: number;
  readonly reverbDampening: number;
  readonly reverbWet: number;
  readonly tailSeconds: number;
}

const BYPASS_PROFILE: CelestialAudioProfile = Object.freeze({
  id: "bypass",
  isBlackHole: false,
  defaultTailSeconds: 0.4,
  bitCrusher: Object.freeze({ bits: 16, wet: 0 }),
  distortion: Object.freeze({ amount: 0, wet: 0 }),
  reverb: Object.freeze({ roomSize: 0, dampening: 2_400, wet: 0 }),
  bitCrusherBits: 16,
  bitCrusherWet: 0,
  distortionAmount: 0,
  distortionWet: 0,
  reverbRoomSize: 0,
  reverbDampening: 2_400,
  reverbWet: 0,
  tailSeconds: 0.4,
});

const BLACK_HOLE_PROFILE: CelestialAudioProfile = Object.freeze({
  id: "black-hole",
  isBlackHole: true,
  // Keep this inside the documented 1.8–3 second Black Hole tail boundary.
  defaultTailSeconds: 2.2,
  bitCrusher: Object.freeze({ bits: 12, wet: 0.2 }),
  distortion: Object.freeze({ amount: 0.1, wet: 0.16 }),
  reverb: Object.freeze({ roomSize: 0.88, dampening: 1_050, wet: 0.42 }),
  bitCrusherBits: 12,
  bitCrusherWet: 0.2,
  distortionAmount: 0.1,
  distortionWet: 0.16,
  reverbRoomSize: 0.88,
  reverbDampening: 1_050,
  reverbWet: 0.42,
  tailSeconds: 2.2,
});

export const CELESTIAL_AUDIO_PROFILES = Object.freeze({
  bypass: BYPASS_PROFILE,
  "black-hole": BLACK_HOLE_PROFILE,
});

type CelestialProfileSource =
  StarPresetId | Pick<StarState, "presetId"> | Pick<Composition, "star">;

function presetIdFrom(source: CelestialProfileSource): StarPresetId {
  if (typeof source === "string") return source;
  if ("presetId" in source) return source.presetId;
  return source.star.presetId;
}

/** Pure profile resolver shared by live and offline output. */
export function resolveCelestialAudioProfile(
  source: CelestialProfileSource,
): CelestialAudioProfile {
  return presetIdFrom(source) === "black-hole"
    ? BLACK_HOLE_PROFILE
    : BYPASS_PROFILE;
}

export const resolveCelestialEffectsProfile = resolveCelestialAudioProfile;
export const getCelestialAudioProfile = resolveCelestialAudioProfile;

function rampParameter(
  parameter: unknown,
  value: number,
  seconds = 0.03,
): void {
  const candidate = parameter as {
    rampTo?: (next: number, duration: number) => unknown;
    value?: number;
  } | null;
  if (candidate && typeof candidate.rampTo === "function") {
    candidate.rampTo(value, seconds);
    return;
  }
  if (candidate && "value" in candidate) candidate.value = value;
}

/**
 * One bounded effect chain shared by every source in a composition.
 * The input is the first effect so no extra per-generation gain node is
 * required; the caller owns the destination and passes it to the constructor.
 */
export class CelestialEffectsRack {
  readonly input: InputNode;
  private readonly distortion?: Distortion;
  private readonly reverb?: Freeverb;
  private readonly crusher?: BitCrusher;
  private profile: CelestialAudioProfile;
  private disposed = false;

  constructor(
    output: InputNode,
    profile: CelestialAudioProfile = BYPASS_PROFILE,
  ) {
    this.profile = profile;
    let crusher: BitCrusher | undefined;
    let distortion: Distortion | undefined;
    let reverb: Freeverb | undefined;
    try {
      crusher = new BitCrusher({ bits: profile.bitCrusher.bits });
      distortion = new Distortion({
        distortion: profile.distortion.amount,
        oversample: "2x",
      });
      reverb = new Freeverb({
        roomSize: profile.reverb.roomSize,
        dampening: profile.reverb.dampening,
      });
      crusher.connect(distortion);
      distortion.connect(reverb);
      reverb.connect(output);
      this.input = crusher;
      this.crusher = crusher;
      this.distortion = distortion;
      this.reverb = reverb;
    } catch {
      // Tone's effects require a real AudioParam. Small adapter tests and
      // non-browser hosts may provide a deliberately minimal fake context;
      // keep the graph safely bypassed there without adding another node.
      crusher?.dispose();
      distortion?.dispose();
      reverb?.dispose();
      this.input = output;
    }
    this.applyProfile(profile, 0);
  }

  get currentProfile(): CelestialAudioProfile {
    return this.profile;
  }

  update(profile: CelestialAudioProfile): void {
    if (this.disposed) return;
    this.profile = profile;
    this.applyProfile(profile);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.crusher?.dispose();
    this.distortion?.dispose();
    this.reverb?.dispose();
  }

  private applyProfile(profile: CelestialAudioProfile, seconds = 0.03): void {
    if (!this.crusher || !this.distortion || !this.reverb) return;
    rampParameter(this.crusher.bits, profile.bitCrusher.bits, seconds);
    rampParameter(this.crusher.wet, profile.bitCrusher.wet, seconds);
    // Distortion's waveshaper amount is a scalar rather than an AudioParam;
    // its wet mix remains smoothly automated during profile changes.
    this.distortion.distortion = profile.distortion.amount;
    rampParameter(this.distortion.wet, profile.distortion.wet, seconds);
    rampParameter(this.reverb.roomSize, profile.reverb.roomSize, seconds);
    this.reverb.dampening = profile.reverb.dampening;
    rampParameter(this.reverb.wet, profile.reverb.wet, seconds);
  }
}

export function createCelestialEffectsRack(
  output: InputNode,
  profile: CelestialAudioProfile = BYPASS_PROFILE,
): CelestialEffectsRack {
  return new CelestialEffectsRack(output, profile);
}
