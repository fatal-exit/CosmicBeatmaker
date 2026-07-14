import type { PlanetRole } from "../domain/composition";

export type PlanetVisualKind =
  "rocky" | "gas-giant" | "super-earth" | "ice-world" | "dwarf-world";

export interface PlanetVisualProfile {
  kind: PlanetVisualKind;
  baseRadius: number;
  appearanceInfluence: number;
  minRadius: number;
  maxRadius: number;
  bodyScale: readonly [number, number, number];
  ringGap: number;
  ringFragmentScale: number;
  ringTilt: number;
}

/**
 * Musical roles already own distinct procedural surfaces. These profiles make
 * their implied physical planet classes legible in silhouette and scale too.
 */
export const PLANET_VISUAL_PROFILES = {
  beat: {
    kind: "rocky",
    baseRadius: 0.37,
    appearanceInfluence: 0.16,
    minRadius: 0.34,
    maxRadius: 0.43,
    bodyScale: [1.04, 0.95, 0.98],
    ringGap: 0.1,
    ringFragmentScale: 0.82,
    ringTilt: 0.13,
  },
  bass: {
    kind: "gas-giant",
    baseRadius: 0.62,
    appearanceInfluence: 0.18,
    minRadius: 0.58,
    maxRadius: 0.7,
    bodyScale: [1.07, 0.88, 1.07],
    ringGap: 0.14,
    ringFragmentScale: 1.28,
    ringTilt: 0.2,
  },
  chords: {
    kind: "super-earth",
    baseRadius: 0.51,
    appearanceInfluence: 0.16,
    minRadius: 0.47,
    maxRadius: 0.58,
    bodyScale: [1.01, 0.98, 1.01],
    ringGap: 0.12,
    ringFragmentScale: 1.1,
    ringTilt: 0.28,
  },
  melody: {
    kind: "ice-world",
    baseRadius: 0.42,
    appearanceInfluence: 0.15,
    minRadius: 0.38,
    maxRadius: 0.47,
    bodyScale: [0.98, 1.04, 0.98],
    ringGap: 0.11,
    ringFragmentScale: 0.94,
    ringTilt: -0.22,
  },
  texture: {
    kind: "dwarf-world",
    baseRadius: 0.31,
    appearanceInfluence: 0.12,
    minRadius: 0.27,
    maxRadius: 0.36,
    bodyScale: [1.03, 0.97, 0.95],
    ringGap: 0.09,
    ringFragmentScale: 0.74,
    ringTilt: 0.34,
  },
} as const satisfies Record<PlanetRole, PlanetVisualProfile>;

export interface PlanetRingVisualMetrics {
  radius: number;
  fragmentRadialSize: number;
  fragmentHeight: number;
  fragmentTangentialSize: number;
  tilt: number;
}

export interface PlanetVisualMetrics {
  kind: PlanetVisualKind;
  bodyRadius: number;
  bodyScale: readonly [number, number, number];
  bodyExtent: number;
  gateRadius: number;
  moonOrbitRadius: number;
  ring: PlanetRingVisualMetrics;
  /** Maximum radial envelope used to keep neighboring lanes apart. */
  visualExtent: number;
}

export interface PlanetVisualMetricOptions {
  hasEvents?: boolean;
  hasMoons?: boolean;
  hasRing?: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export function planetBodyRadius(
  role: PlanetRole,
  appearanceSize: number,
): number {
  const profile = PLANET_VISUAL_PROFILES[role];
  const radius =
    profile.baseRadius +
    (finiteOr(appearanceSize, 1) - 1) * profile.appearanceInfluence;
  return clamp(radius, profile.minRadius, profile.maxRadius);
}

export function planetVisualMetrics(
  role: PlanetRole,
  appearanceSize: number,
  options: PlanetVisualMetricOptions = {},
): PlanetVisualMetrics {
  const profile = PLANET_VISUAL_PROFILES[role];
  const bodyRadius = planetBodyRadius(role, appearanceSize);
  const bodyExtent = bodyRadius * Math.max(...profile.bodyScale);
  const gateRadius = Math.max(0.4, bodyExtent * 1.14);
  const fragmentRadialSize = clamp(
    bodyRadius * 0.22 * profile.ringFragmentScale,
    0.065,
    0.15,
  );
  const fragmentHeight = clamp(
    bodyRadius * 0.07 * profile.ringFragmentScale,
    0.022,
    0.05,
  );
  const fragmentTangentialSize = clamp(
    bodyRadius * 0.42 * profile.ringFragmentScale,
    0.12,
    0.32,
  );
  const ring: PlanetRingVisualMetrics = {
    radius: bodyExtent + profile.ringGap + fragmentRadialSize * 0.5,
    fragmentRadialSize,
    fragmentHeight,
    fragmentTangentialSize,
    tilt: profile.ringTilt,
  };
  const moonOrbitRadius = bodyExtent + 0.24 + bodyRadius * 0.16;

  let visualExtent = bodyExtent;
  if (options.hasEvents)
    visualExtent = Math.max(visualExtent, gateRadius + 0.032);
  if (options.hasRing) {
    visualExtent = Math.max(
      visualExtent,
      ring.radius + fragmentRadialSize * 0.5,
    );
  }
  if (options.hasMoons) {
    // Includes the larger invisible/visible moon gate envelope.
    visualExtent = Math.max(visualExtent, moonOrbitRadius + 0.19);
  }

  return {
    kind: profile.kind,
    bodyRadius,
    bodyScale: profile.bodyScale,
    bodyExtent,
    gateRadius,
    moonOrbitRadius,
    ring,
    // Selection grows the whole planet subtree by eight percent.
    visualExtent: visualExtent * 1.08,
  };
}

export const MIN_PLANET_ORBIT_RADIUS = 2.2;
export const PLANET_ORBIT_LANE_GAP = 0.18;

export interface PlanetOrbitLaneVisual {
  id: string;
  laneIndex: number;
  visualExtent: number;
}

/**
 * Accumulates center radii from real visual envelopes instead of assuming all
 * planets and their satellites occupy the same width.
 */
export function deriveSizeAwareOrbitRadii(
  lanes: readonly PlanetOrbitLaneVisual[],
): ReadonlyMap<string, number> {
  const ordered = [...lanes].sort(
    (left, right) =>
      left.laneIndex - right.laneIndex || left.id.localeCompare(right.id),
  );
  const radii = new Map<string, number>();
  let previous: { radius: number; visualExtent: number } | undefined;

  for (const lane of ordered) {
    const visualExtent = Math.max(0, finiteOr(lane.visualExtent, 0));
    const radius = previous
      ? previous.radius +
        previous.visualExtent +
        visualExtent +
        PLANET_ORBIT_LANE_GAP
      : Math.max(
          MIN_PLANET_ORBIT_RADIUS,
          1.08 + visualExtent + PLANET_ORBIT_LANE_GAP,
        );
    radii.set(lane.id, radius);
    previous = { radius, visualExtent };
  }

  return radii;
}
