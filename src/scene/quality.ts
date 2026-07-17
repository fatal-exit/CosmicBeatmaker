import type { QualityPreference, QualityProfile } from "./contracts";

export const QUALITY_DPR_CAP: Record<QualityProfile, number> = {
  low: 1,
  balanced: 1.5,
  high: 2,
};

export const QUALITY_PLANET_GEOMETRY_DETAIL: Record<QualityProfile, number> = {
  // Lower subdivision is intentional: non-indexed icosahedron faces carry
  // the broad low-poly silhouette, while shader detail supplies only role
  // texture at the High tier.
  low: 1,
  balanced: 2,
  high: 3,
};

export const QUALITY_STAR_GEOMETRY_DETAIL: Record<QualityProfile, number> = {
  low: 2,
  balanced: 3,
  high: 4,
};

export const QUALITY_SHADER_DETAIL: Record<QualityProfile, number> = {
  low: 0,
  balanced: 2,
  high: 4,
};

export const QUALITY_GLOW_STRENGTH: Record<QualityProfile, number> = {
  low: 0.42,
  balanced: 0.76,
  high: 0.9,
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
  // Keep the threshold below stellar whites but above the chromatic sky; only
  // compact star/planet highlights should contribute to the bloom kernel.
  high: { enabled: true, strength: 0.42, radius: 0.24, threshold: 0.78 },
};

export const QUALITY_DEEP_SPACE_STRENGTH: Record<QualityProfile, number> = {
  low: 0.9,
  balanced: 0.97,
  high: 1,
};

export function resolveQualityProfile(
  preference: QualityPreference,
  width: number,
  devicePixelRatio: number,
): QualityProfile {
  if (preference !== "auto") return preference;
  if (width < 600 || (width < 900 && devicePixelRatio > 2.5)) return "low";
  // The detailed sky plus High bloom is reserved for genuinely wide canvases;
  // common 1280/1366 CSS-pixel laptops stay Balanced to preserve audio and
  // interaction headroom. An explicit High preference still remains honored.
  if (width < 1440) return "balanced";
  return "high";
}
