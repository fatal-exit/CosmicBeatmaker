export type AudioDeviceClass = "desktop" | "mobile";

export interface AudioRuntimeProfile {
  readonly deviceClass: AudioDeviceClass;
  readonly latencyHint: "balanced";
  readonly lookAheadSeconds: number;
  readonly updateIntervalSeconds: number;
  readonly maxEventLatenessSeconds: number;
}

export interface AudioRuntimeEnvironment {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  readonly coarsePointer: boolean;
}

export interface SchedulingContextAdapter {
  lookAhead: number;
  updateInterval: number;
}

export const AUDIO_OUTPUT_SAFETY = {
  masterHeadroom: 0.72,
  limiterThresholdDb: -3,
  emergencyFadeSeconds: 0.015,
} as const;

/**
 * The groovebox has no live note-entry surface, so a modest scheduling buffer
 * is a better default than minimum output latency. Mobile gets extra room for
 * main-thread stalls and aggressive browser power management.
 */
export const AUDIO_RUNTIME_PROFILES: Readonly<
  Record<AudioDeviceClass, AudioRuntimeProfile>
> = {
  desktop: {
    deviceClass: "desktop",
    latencyHint: "balanced",
    lookAheadSeconds: 0.12,
    updateIntervalSeconds: 0.03,
    maxEventLatenessSeconds: 0.08,
  },
  mobile: {
    deviceClass: "mobile",
    latencyHint: "balanced",
    lookAheadSeconds: 0.18,
    updateIntervalSeconds: 0.045,
    maxEventLatenessSeconds: 0.12,
  },
};

export function classifyAudioDevice(
  environment: AudioRuntimeEnvironment,
): AudioDeviceClass {
  const reportsMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(
    environment.userAgent,
  );
  return reportsMobileUserAgent ||
    (environment.maxTouchPoints > 0 && environment.coarsePointer)
    ? "mobile"
    : "desktop";
}

export function selectAudioRuntimeProfile(
  environment: AudioRuntimeEnvironment = readAudioRuntimeEnvironment(),
): AudioRuntimeProfile {
  return AUDIO_RUNTIME_PROFILES[classifyAudioDevice(environment)];
}

export function applySchedulingProfile(
  context: SchedulingContextAdapter,
  profile: AudioRuntimeProfile,
): void {
  // Tone's lookAhead setter also changes updateInterval, so assignment order
  // is deliberate and covered by a pure adapter test.
  context.lookAhead = profile.lookAheadSeconds;
  context.updateInterval = profile.updateIntervalSeconds;
}

export function toneContextOptionsFor(profile: AudioRuntimeProfile): {
  latencyHint: AudioRuntimeProfile["latencyHint"];
  lookAhead: number;
  updateInterval: number;
  clockSource: "worker";
} {
  return {
    latencyHint: profile.latencyHint,
    lookAhead: profile.lookAheadSeconds,
    updateInterval: profile.updateIntervalSeconds,
    clockSource: "worker",
  };
}

function readAudioRuntimeEnvironment(): AudioRuntimeEnvironment {
  if (typeof navigator === "undefined") {
    return { userAgent: "", maxTouchPoints: 0, coarsePointer: false };
  }
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer:
      typeof matchMedia === "function" &&
      matchMedia("(any-pointer: coarse)").matches,
  };
}
