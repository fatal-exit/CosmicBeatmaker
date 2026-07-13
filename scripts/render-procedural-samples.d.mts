export interface ProceduralLevelStats {
  peakDb: number | null;
  meanDb: number | null;
}

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
