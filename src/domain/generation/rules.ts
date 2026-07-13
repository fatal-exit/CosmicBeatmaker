import type {
  MasterMixState,
  PlanetRole,
  TrackMixState,
} from "../composition/types";
import type { SeededRandom } from "./prng";

export interface NumericRange {
  min: number;
  max: number;
}

export interface TrackMixRanges {
  level: NumericRange;
  pan: NumericRange;
  filter: NumericRange;
  reverbSend: NumericRange;
  delaySend: NumericRange;
}

export const SAFE_TRACK_MIX_RANGES = {
  beat: {
    level: { min: 0.62, max: 0.78 },
    pan: { min: -0.08, max: 0.08 },
    filter: { min: 0.55, max: 0.78 },
    reverbSend: { min: 0.04, max: 0.14 },
    delaySend: { min: 0.01, max: 0.08 },
  },
  bass: {
    level: { min: 0.5, max: 0.66 },
    pan: { min: -0.04, max: 0.04 },
    filter: { min: 0.32, max: 0.58 },
    reverbSend: { min: 0.02, max: 0.1 },
    delaySend: { min: 0, max: 0.06 },
  },
  chords: {
    level: { min: 0.4, max: 0.56 },
    pan: { min: -0.2, max: 0.2 },
    filter: { min: 0.48, max: 0.72 },
    reverbSend: { min: 0.12, max: 0.32 },
    delaySend: { min: 0.05, max: 0.18 },
  },
  melody: {
    level: { min: 0.36, max: 0.52 },
    pan: { min: -0.28, max: 0.28 },
    filter: { min: 0.54, max: 0.82 },
    reverbSend: { min: 0.1, max: 0.3 },
    delaySend: { min: 0.08, max: 0.24 },
  },
  texture: {
    level: { min: 0.2, max: 0.34 },
    pan: { min: -0.38, max: 0.38 },
    filter: { min: 0.3, max: 0.66 },
    reverbSend: { min: 0.18, max: 0.38 },
    delaySend: { min: 0.08, max: 0.26 },
  },
} as const satisfies Record<PlanetRole, TrackMixRanges>;

const lerp = (range: NumericRange, amount: number): number =>
  range.min + (range.max - range.min) * amount;

const round = (value: number): number => Math.round(value * 1_000) / 1_000;

export function createSafeTrackMix(
  role: PlanetRole,
  random: SeededRandom,
  space: number,
): TrackMixState {
  const ranges = SAFE_TRACK_MIX_RANGES[role];
  const safeSpace = Math.min(1, Math.max(0, space));

  return {
    level: round(lerp(ranges.level, random.next())),
    pan: round(lerp(ranges.pan, random.next())),
    filter: round(lerp(ranges.filter, random.next())),
    reverbSend: round(
      lerp(ranges.reverbSend, 0.35 * random.next() + 0.65 * safeSpace),
    ),
    delaySend: round(
      lerp(ranges.delaySend, 0.5 * random.next() + 0.5 * safeSpace),
    ),
  };
}

export function createSafeMasterMix(random: SeededRandom): MasterMixState {
  return {
    level: round(0.76 + random.next() * 0.1),
    brightness: round(0.46 + random.next() * 0.2),
    limiterEnabled: true,
  };
}

export function isTrackMixWithinSafeRange(
  role: PlanetRole,
  mix: TrackMixState,
): boolean {
  const ranges = SAFE_TRACK_MIX_RANGES[role];
  return (Object.keys(ranges) as Array<keyof TrackMixRanges>).every(
    (key) => mix[key] >= ranges[key].min && mix[key] <= ranges[key].max,
  );
}
