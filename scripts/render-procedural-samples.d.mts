export interface ProceduralLevelStats {
  peakDb: number | null;
  meanDb: number | null;
}

export interface SpaceReverbProfile {
  preDelaySeconds: number;
  tailSeconds: number;
  roomSize: number;
  damping: number;
  dryGain: number;
  wetGain: number;
  inputGain: number;
}

export interface SpaceReverbRender {
  channels: [Float32Array, Float32Array];
  durationSeconds: number;
}

export function applySpaceReverb(
  channels: readonly Float32Array[],
  profile: SpaceReverbProfile,
): SpaceReverbRender;

export function validateRenderedChannels(
  id: string,
  channels: readonly ArrayLike<number>[],
): number;

export function validateLevelStats(
  id: string,
  stage: string,
  levels: ProceduralLevelStats,
): void;

export interface ProceduralProbeResult {
  codec: string;
  sampleRate: number;
  channels: number;
  durationSeconds: number;
}

export function validateEncodedContract(
  id: string,
  expectedDurationSeconds: number,
  expectedChannels: number,
  probeResult: ProceduralProbeResult,
  encodedBytes: number,
): void;

export function validatePreviousProceduralEntry(sample: unknown): string;
