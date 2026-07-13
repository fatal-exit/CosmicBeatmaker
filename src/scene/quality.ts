import type { QualityPreference, QualityProfile } from "./contracts";

export const QUALITY_DPR_CAP: Record<QualityProfile, number> = {
  low: 1,
  balanced: 1.5,
  high: 2,
};

export const QUALITY_SHADER_DETAIL: Record<QualityProfile, number> = {
  low: 0,
  balanced: 3,
  high: 5,
};

export const QUALITY_GLOW_STRENGTH: Record<QualityProfile, number> = {
  low: 0.38,
  balanced: 0.7,
  high: 1,
};

export function resolveQualityProfile(
  preference: QualityPreference,
  width: number,
  devicePixelRatio: number,
): QualityProfile {
  if (preference !== "auto") return preference;
  if (width < 500 || devicePixelRatio > 2.5) return "low";
  if (width < 1100 || devicePixelRatio > 1.75) return "balanced";
  return "high";
}
