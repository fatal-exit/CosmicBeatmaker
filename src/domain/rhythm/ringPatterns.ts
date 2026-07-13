import type {
  PatternEvent,
  PatternState,
  PlanetState,
  RingState,
} from "../composition/types";

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function eventId(ring: RingState, segment: number): string {
  return `${ring.id}:segment:${segment}`;
}

function activeSegments(ring: RingState): number[] {
  return ring.active.flatMap((active, segment) => (active ? [segment] : []));
}

function velocityForSegment(
  ring: RingState,
  segment: number,
  base: number,
): number {
  const variation = segment % 2 === 0 ? 1 : 1 - ring.velocityVariation * 0.3;
  return Math.max(0.12, Math.min(0.72, base * variation));
}

function segmentStep(
  segment: number,
  segments: number,
  gridSize: PatternState["gridSize"],
): number {
  return Math.round((segment / segments) * gridSize) % gridSize;
}

function circularDistance(left: number, right: number, size: number): number {
  return Math.min(
    positiveModulo(left - right, size),
    positiveModulo(right - left, size),
  );
}

function nearestEvent(
  events: readonly PatternEvent[],
  step: number,
  gridSize: number,
): PatternEvent | undefined {
  return [...events].sort(
    (left, right) =>
      circularDistance(left.step, step, gridSize) -
        circularDistance(right.step, step, gridSize) ||
      left.id.localeCompare(right.id),
  )[0];
}

function percussionRingPattern(ring: RingState): PatternState {
  const drumVoice =
    ring.type === "hat"
      ? ("closed-hat" as const)
      : ring.type === "shaker"
        ? ("open-hat" as const)
        : ("perc" as const);

  return {
    gridSize: ring.segments,
    humanize: 0,
    events: activeSegments(ring).map((segment) => ({
      id: eventId(ring, segment),
      step: segment,
      velocity: velocityForSegment(ring, segment, 0.72),
      probability: ring.probability,
      durationSteps: 0.5,
      drumVoice,
    })),
  };
}

function melodyGhostPattern(
  parentPattern: PatternState,
  ring: RingState,
): PatternState {
  const occupied = new Set(parentPattern.events.map(({ step }) => step));
  const used = new Set<number>();

  return {
    gridSize: parentPattern.gridSize,
    humanize: 0,
    events: activeSegments(ring).map((segment, index) => {
      const nominalStep = segmentStep(
        segment,
        ring.segments,
        parentPattern.gridSize,
      );
      const parent = nearestEvent(
        parentPattern.events,
        nominalStep,
        parentPattern.gridSize,
      );
      const parentStep = parent?.step ?? nominalStep;
      const direction = index % 2 === 0 ? -1 : 1;
      const candidates = [
        parentStep + direction,
        parentStep - direction,
        parentStep + direction * 2,
        parentStep - direction * 2,
      ].map((step) => positiveModulo(step, parentPattern.gridSize));
      const step =
        candidates.find(
          (candidate) => !occupied.has(candidate) && !used.has(candidate),
        ) ??
        candidates.find((candidate) => !used.has(candidate)) ??
        nominalStep;
      used.add(step);

      return {
        id: eventId(ring, segment),
        step,
        velocity: velocityForSegment(
          ring,
          segment,
          Math.max(0.24, (parent?.velocity ?? 0.58) * 0.56),
        ),
        probability: ring.probability,
        durationSteps: 0.5,
        ...(parent?.pitch ? { pitch: parent.pitch } : {}),
      };
    }),
  };
}

function chordArpeggioPattern(ring: RingState): PatternState {
  return {
    gridSize: ring.segments,
    humanize: 0,
    events: activeSegments(ring).map((segment, index) => ({
      id: eventId(ring, segment),
      step: segment,
      velocity: velocityForSegment(ring, segment, 0.62),
      probability: ring.probability,
      durationSteps: 0.58,
      pitch: {
        kind: "chordTone" as const,
        index: index % 3,
        octaveOffset: index % 6 === 5 ? 1 : 0,
      },
      chordAction: "strike" as const,
    })),
  };
}

function bassPickupPattern(
  parentPattern: PatternState,
  ring: RingState,
): PatternState {
  const occupied = new Set(parentPattern.events.map(({ step }) => step));
  const used = new Set<number>();

  return {
    gridSize: parentPattern.gridSize,
    humanize: 0,
    events: activeSegments(ring).map((segment, index) => {
      const nominalStep = segmentStep(
        segment,
        ring.segments,
        parentPattern.gridSize,
      );
      const forwardSyncopation =
        nominalStep % 2 === 0 ? nominalStep + 1 : nominalStep;
      const candidates = [
        forwardSyncopation,
        forwardSyncopation + 2,
        forwardSyncopation - 2,
      ].map((step) => positiveModulo(step, parentPattern.gridSize));
      const step =
        candidates.find(
          (candidate) => !occupied.has(candidate) && !used.has(candidate),
        ) ??
        candidates.find((candidate) => !used.has(candidate)) ??
        nominalStep;
      used.add(step);

      return {
        id: eventId(ring, segment),
        step,
        velocity: velocityForSegment(ring, segment, 0.5),
        probability: ring.probability,
        durationSteps: 0.75,
        pitch:
          index % 4 === 3
            ? ({ kind: "fifth", octaveOffset: -1 } as const)
            : ({ kind: "root", octaveOffset: 0 } as const),
      };
    }),
  };
}

/**
 * Turns one visible ring segment collection into role-aware musical events.
 * Stable segment IDs keep live audio, exports, and fragment flashes aligned.
 */
export function deriveRingPattern(
  parent: Pick<PlanetState, "role" | "pattern">,
  parentPerformancePattern: PatternState,
  ring: RingState,
): PatternState {
  switch (parent.role) {
    case "melody":
      return melodyGhostPattern(parentPerformancePattern, ring);
    case "chords":
      return chordArpeggioPattern(ring);
    case "bass":
      return bassPickupPattern(parentPerformancePattern, ring);
    case "beat":
    case "texture":
      return percussionRingPattern(ring);
  }
}

function evenDistributionOrder(segments: number): number[] {
  const order: number[] = [];
  for (let stride = segments; stride >= 1; stride /= 2) {
    const step = Math.max(1, Math.floor(stride));
    for (let segment = 0; segment < segments; segment += step) {
      if (!order.includes(segment)) order.push(segment);
    }
    if (step === 1) break;
  }
  return order;
}

function melodyPriority(parent: PlanetState, segments: number): number[] {
  const eventSegments = parent.pattern.events
    .slice()
    .sort(
      (left, right) =>
        left.step - right.step || left.id.localeCompare(right.id),
    )
    .map(
      ({ step }) =>
        Math.round((step / parent.pattern.gridSize) * segments) % segments,
    );
  const alternating = eventSegments.filter((_, index) => index % 2 === 0);
  return [...new Set([...alternating, ...eventSegments])];
}

function densityPriority(parent: PlanetState, segments: number): number[] {
  const even = evenDistributionOrder(segments);
  if (parent.role === "bass") {
    const anticipations = Array.from(
      { length: Math.max(1, Math.floor(segments / 4)) },
      (_, index) => Math.min(segments - 1, index * 4 + 3),
    );
    const secondary = anticipations.map((segment) =>
      positiveModulo(segment - 2, segments),
    );
    return [...new Set([...anticipations, ...secondary, ...even])];
  }
  if (parent.role === "melody") {
    return [...new Set([...melodyPriority(parent, segments), ...even])];
  }
  if (parent.role === "texture") {
    return [...even.slice(1), even[0]];
  }
  return even;
}

/** Deterministically fills visible segments while preserving role-safe emphasis. */
export function ringActiveSegmentsForDensity(
  parent: PlanetState,
  ring: Pick<RingState, "segments">,
  density: number,
): boolean[] {
  const activeCount = Math.round(clamp01(density) * ring.segments);
  const selected = new Set(
    densityPriority(parent, ring.segments).slice(0, activeCount),
  );
  return Array.from({ length: ring.segments }, (_, segment) =>
    selected.has(segment),
  );
}
