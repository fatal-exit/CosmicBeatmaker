import {
  resolveAudioSampleEnvelope,
  type AudioSampleAssetDefinition,
} from "../content/soundPresets";

/** Generated 2.182-second sources are treated as authored long-tail samples. */
export const LONG_SAMPLE_BOUNDARY_SECONDS = 2;
export const SAMPLE_BOUNDARY_SAFETY_SECONDS = 0.002;

export interface SamplePlaybackPlan {
  playbackDurationSeconds: number;
  releaseSeconds: number;
  /** Undefined preserves the complete natural tail without scheduling note-off. */
  releaseStartSeconds?: number;
  boundaryLimited: boolean;
}

export interface OneShotSampleTrigger {
  triggerAttack(note: number, time: number, velocity: number): unknown;
  triggerAttackRelease(
    note: number,
    duration: number,
    time: number,
    velocity: number,
  ): unknown;
}

/** Chooses exactly one Tone trigger path, avoiding a second manual stop. */
export function triggerPlannedOneShot(
  sampler: OneShotSampleTrigger,
  note: number,
  plan: SamplePlaybackPlan,
  scheduledAudioTime: number,
  velocity: number,
): void {
  if (plan.releaseStartSeconds === undefined) {
    sampler.triggerAttack(note, scheduledAudioTime, velocity);
  } else {
    sampler.triggerAttackRelease(
      note,
      plan.releaseStartSeconds,
      scheduledAudioTime,
      velocity,
    );
  }
}

/**
 * Plans one release per triggered source. Transposition changes the natural
 * buffer duration, so the release boundary is calculated per target note.
 */
export function planSamplePlayback(
  asset: AudioSampleAssetDefinition,
  rootMidi: number,
  targetMidi: number,
  requestedHoldSeconds?: number,
): SamplePlaybackPlan {
  const playbackRate = 2 ** ((targetMidi - rootMidi) / 12);
  const playbackDurationSeconds = asset.durationSeconds / playbackRate;
  const envelope = resolveAudioSampleEnvelope(asset);
  const releaseSeconds = Math.min(
    envelope.releaseSeconds,
    Math.max(0, playbackDurationSeconds - SAMPLE_BOUNDARY_SAFETY_SECONDS),
  );
  const boundaryReleaseStart = Math.max(
    0,
    playbackDurationSeconds - releaseSeconds - SAMPLE_BOUNDARY_SAFETY_SECONDS,
  );
  const requiresBoundaryFade =
    asset.durationSeconds >= LONG_SAMPLE_BOUNDARY_SECONDS;

  if (requestedHoldSeconds === undefined && !requiresBoundaryFade) {
    return {
      playbackDurationSeconds,
      releaseSeconds,
      boundaryLimited: false,
    };
  }

  const requestedReleaseStart =
    requestedHoldSeconds === undefined
      ? boundaryReleaseStart
      : Math.max(0, requestedHoldSeconds);
  return {
    playbackDurationSeconds,
    releaseSeconds,
    releaseStartSeconds: Math.min(requestedReleaseStart, boundaryReleaseStart),
    boundaryLimited: requestedReleaseStart >= boundaryReleaseStart,
  };
}
