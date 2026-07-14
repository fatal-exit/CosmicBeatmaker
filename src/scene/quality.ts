import type { QualityPreference, QualityProfile } from "./contracts";

export const QUALITY_DPR_CAP: Record<QualityProfile, number> = {
  low: 1,
  balanced: 1.5,
  high: 2,
};

export const QUALITY_PLANET_GEOMETRY_DETAIL: Record<QualityProfile, number> = {
  low: 2,
  balanced: 3,
  high: 4,
};

export const QUALITY_STAR_GEOMETRY_DETAIL: Record<QualityProfile, number> = {
  low: 3,
  balanced: 4,
  high: 5,
};

export const QUALITY_SHADER_DETAIL: Record<QualityProfile, number> = {
  low: 0,
  balanced: 3,
  high: 5,
};

export const QUALITY_GLOW_STRENGTH: Record<QualityProfile, number> = {
  low: 0.38,
  balanced: 0.7,
  high: 0.74,
};

export interface BloomSettings {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export const QUALITY_BLOOM_SETTINGS: Record<QualityProfile, BloomSettings> = {
  low: { enabled: false, strength: 0, radius: 0, threshold: 1 },
  balanced: { enabled: false, strength: 0, radius: 0, threshold: 1 },
  high: { enabled: true, strength: 0.24, radius: 0.22, threshold: 0.94 },
};

export const QUALITY_DEEP_SPACE_STRENGTH: Record<QualityProfile, number> = {
  low: 0.76,
  balanced: 0.88,
  high: 1,
};

export function resolveQualityProfile(
  preference: QualityPreference,
  width: number,
  devicePixelRatio: number,
): QualityProfile {
  if (preference !== "auto") return preference;
  if (width < 600 || (width < 900 && devicePixelRatio > 2.5)) return "low";
  if (width < 1100) return "balanced";
  return "high";
}
