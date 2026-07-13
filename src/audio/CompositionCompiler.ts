import type {
  Composition,
  PatternEvent,
  PatternState,
} from "../domain/composition/types";
import {
  isLoopBars,
  leastCommonMultipleIntegers,
} from "../domain/composition/loopRates";
import {
  derivePerformancePattern,
  performanceHumanizeOffsetSteps,
} from "../domain/rhythm/performanceMacros";
import { resolveMidiNotes } from "./harmony";
import { shouldPlayProbability } from "./probability";
import { applySwing, normalizePhase, ticksForBars } from "./timing";
import { AUDIO_PPQ } from "./constants";
import type {
  CompiledSequence,
  CompiledTrack,
  ScheduledOccurrence,
} from "./types";

export interface CompileCompositionOptions {
  /** Number of complete polymetric super-loops to compile. */
  loops?: number;
  /** Absolute super-loop index used for deterministic probability. */
  startLoopIndex?: number;
  /** Live scheduling defers the probability decision until its callback fires. */
  probabilityMode?: "resolve" | "defer";
  includeMuted?: boolean;
}

interface TrackSource {
  track: CompiledTrack;
  pattern: PatternState;
  loopTicks: number;
  phase: number;
  probability: number;
}

export interface CompiledLiveCycleEvent {
  /** Stable within the source's smallest exact musical template. */
  occurrenceKey: string;
  eventId: string;
  trackId: string;
  role: CompiledTrack["role"];
  sourceKind: CompiledTrack["sourceKind"];
  startOffsetTicks: number;
  durationTicks: number;
  velocity: number;
  probability: number;
  midiNotes: readonly number[];
  drumVoice?: ScheduledOccurrence["drumVoice"];
}

export interface CompiledLiveCycle {
  localCycleIndex: number;
  events: readonly CompiledLiveCycleEvent[];
}

export interface CompiledLiveSource {
  track: CompiledTrack;
  loopTicks: number;
  /** LCM of this source period and the canonical four-bar harmony phrase. */
  musicalTemplateTicks: number;
  cycles: readonly CompiledLiveCycle[];
}

export interface CompiledLiveSchedule {
  ppq: number;
  bpm: number;
  beatsPerBar: number;
  superLoopTicks: number;
  sources: readonly CompiledLiveSource[];
}

export interface CompositionSuperLoop {
  /** Exact integer duration on the shared PPQ timeline. */
  ticks: number;
  /** Derived display value; the LCM itself is always computed from integers. */
  bars: number;
}

function assertOptions(options: CompileCompositionOptions): {
  loops: number;
  startLoopIndex: number;
  probabilityMode: "resolve" | "defer";
} {
  const loops = options.loops ?? 1;
  const startLoopIndex = options.startLoopIndex ?? 0;
  if (!Number.isSafeInteger(loops) || loops <= 0) {
    throw new Error("Compilation loop count must be a positive integer.");
  }
  if (!Number.isSafeInteger(startLoopIndex) || startLoopIndex < 0) {
    throw new Error("The starting loop index must be a non-negative integer.");
  }
  return {
    loops,
    startLoopIndex,
    probabilityMode: options.probabilityMode ?? "resolve",
  };
}

function ringPattern(
  ringId: string,
  active: readonly boolean[],
  probability: number,
  velocityVariation: number,
  drumVoice: "closed-hat" | "perc",
): PatternState {
  const events: PatternEvent[] = [];
  for (let step = 0; step < active.length; step += 1) {
    if (!active[step]) continue;
    const alternatingVelocity =
      step % 2 === 0 ? 1 : 1 - velocityVariation * 0.3;
    events.push({
      id: `${ringId}:segment:${step}`,
      step,
      velocity: 0.72 * alternatingVelocity,
      probability,
      durationSteps: 0.5,
      drumVoice,
    });
  }
  return {
    gridSize: active.length as 8 | 16,
    events,
    humanize: 0,
  };
}

function gatherTrackSources(
  composition: Composition,
  includeMuted: boolean,
): TrackSource[] {
  const sources: TrackSource[] = [];
  const hasSolo = composition.planets.some((planet) => planet.soloed);

  for (const planet of composition.planets) {
    if ((!includeMuted && planet.muted) || (hasSolo && !planet.soloed))
      continue;
    const loopTicks = ticksForBars(
      planet.orbit.loopBars,
      composition.beatsPerBar,
    );
    sources.push({
      track: {
        id: planet.id,
        name: `${planet.name} · ${planet.role}`,
        role: planet.role,
        sourceKind: "planet",
        soundPresetId: planet.soundPresetId,
        level: planet.mix.level,
        pan: planet.mix.pan,
        filter: planet.mix.filter,
      },
      pattern: derivePerformancePattern(
        planet.pattern,
        planet.role,
        planet.id,
        composition.macros,
      ),
      loopTicks,
      phase: planet.orbit.phase,
      probability: 1,
    });

    for (const moon of planet.moons) {
      if (!includeMuted && moon.muted) continue;
      sources.push({
        track: {
          id: moon.id,
          parentId: planet.id,
          name: `${planet.name} · ${moon.behaviorPresetId} moon`,
          role: planet.role,
          sourceKind: "moon",
          soundPresetId: planet.soundPresetId,
          level: planet.mix.level * moon.level,
          pan: planet.mix.pan,
          filter: planet.mix.filter,
        },
        pattern: derivePerformancePattern(
          moon.pattern,
          planet.role,
          moon.id,
          composition.macros,
        ),
        loopTicks: ticksForBars(
          resolveMoonLoopBars(planet.orbit.loopBars, moon.orbitRatio),
          composition.beatsPerBar,
        ),
        phase: normalizePhase(planet.orbit.phase + moon.phase),
        probability: moon.probability,
      });
    }

    if (planet.ring) {
      const ring = planet.ring;
      const isPercussion =
        ring.type === "hat" || ring.type === "shaker" || ring.type === "perc";
      if (isPercussion) {
        sources.push({
          track: {
            id: ring.id,
            parentId: planet.id,
            name: `${planet.name} · ${ring.type} ring`,
            role: "beat",
            sourceKind: "ring",
            soundPresetId: ring.soundPresetId,
            level: planet.mix.level * ring.level,
            pan: planet.mix.pan,
            filter: planet.mix.filter,
          },
          pattern: ringPattern(
            ring.id,
            ring.active,
            ring.probability,
            ring.velocityVariation,
            ring.type === "hat" ? "closed-hat" : "perc",
          ),
          loopTicks,
          phase: normalizePhase(planet.orbit.phase + ring.phase),
          probability: 1,
        });
      }
    }
  }

  if (composition.asteroidBelt && (!hasSolo || includeMuted)) {
    const belt = composition.asteroidBelt;
    sources.push({
      track: {
        id: belt.id,
        name: "Asteroid Belt · percussion",
        role: "beat",
        sourceKind: "asteroid",
        soundPresetId: belt.materialPresetId,
        level: belt.level,
        pan: 0,
        filter: 0.7,
      },
      pattern: {
        gridSize: belt.gridSize,
        events: belt.events,
        humanize: belt.turbulence,
      },
      loopTicks: ticksForBars(composition.bars, composition.beatsPerBar),
      phase: 0,
      probability: 1,
    });
  }

  return sources;
}

function resolveMoonLoopBars(parentLoopBars: number, orbitRatio: number) {
  if (!Number.isFinite(orbitRatio) || orbitRatio <= 0) {
    throw new Error("Moon orbit ratio must be a positive finite number.");
  }
  const loopBars = parentLoopBars / orbitRatio;
  if (!isLoopBars(loopBars)) {
    throw new Error(
      "Moon orbit ratio must resolve to a supported exact loop rate.",
    );
  }
  return loopBars;
}

function superLoopForSources(
  composition: Composition,
  sources: readonly TrackSource[],
): CompositionSuperLoop {
  // The four-bar composition/harmony phrase remains a musical period even
  // when every active orbit is shorter than it.
  const canonicalLoopTicks = ticksForBars(
    composition.bars,
    composition.beatsPerBar,
  );
  const ticks = leastCommonMultipleIntegers([
    canonicalLoopTicks,
    ...sources.map(({ loopTicks }) => loopTicks),
  ]);
  return {
    ticks,
    bars: ticks / ticksForBars(1, composition.beatsPerBar),
  };
}

/** Exact active-source project period used by playback and both exporters. */
export function getCompositionSuperLoop(
  composition: Composition,
  options: Pick<CompileCompositionOptions, "includeMuted"> = {},
): CompositionSuperLoop {
  return superLoopForSources(
    composition,
    gatherTrackSources(composition, options.includeMuted ?? false),
  );
}

function compileLiveCycle(
  composition: Composition,
  source: TrackSource,
  localCycleIndex: number,
): CompiledLiveCycle {
  const events: CompiledLiveCycleEvent[] = [];
  const cycleStart = localCycleIndex * source.loopTicks;
  const phaseTicks = Math.round(
    normalizePhase(source.phase) * source.loopTicks,
  );

  for (const event of source.pattern.events) {
    const probability = Math.max(
      0,
      Math.min(1, event.probability * source.probability),
    );
    if (probability <= 0) continue;

    const stepTicks = Math.round(
      (event.step / source.pattern.gridSize) * source.loopTicks,
    );
    const tickInCycle = (stepTicks + phaseTicks) % source.loopTicks;
    const unswungStart = cycleStart + tickInCycle;
    const swungStart = applySwing(unswungStart, composition.swing);
    const humanizeTicks = Math.round(
      (performanceHumanizeOffsetSteps(
        source.pattern,
        composition.seed,
        event,
        localCycleIndex,
      ) /
        source.pattern.gridSize) *
        source.loopTicks,
    );
    const cycleEnd = cycleStart + source.loopTicks - 1;
    const startInTemplate = Math.max(
      cycleStart,
      Math.min(cycleEnd, swungStart + humanizeTicks),
    );
    const durationTicks = Math.max(
      1,
      Math.round(
        (event.durationSteps / source.pattern.gridSize) * source.loopTicks,
      ),
    );
    events.push(
      Object.freeze({
        occurrenceKey: `${source.track.id}:${localCycleIndex}:${event.id}`,
        eventId: event.id,
        trackId: source.track.id,
        role: source.track.role,
        sourceKind: source.track.sourceKind,
        startOffsetTicks: startInTemplate - cycleStart,
        durationTicks,
        velocity: Math.max(0, Math.min(1, event.velocity)),
        probability,
        midiNotes: resolveMidiNotes(
          composition,
          source.track.role,
          startInTemplate,
          event.pitch,
          event.drumVoice,
        ),
        ...(event.drumVoice ? { drumVoice: event.drumVoice } : {}),
      }),
    );
  }

  return Object.freeze({
    localCycleIndex,
    events: Object.freeze(events),
  });
}

function compileLiveSources(
  composition: Composition,
  sources: readonly TrackSource[],
): CompiledLiveSource[] {
  const canonicalLoopTicks = ticksForBars(
    composition.bars,
    composition.beatsPerBar,
  );
  return sources.map((source) => {
    const musicalTemplateTicks = leastCommonMultipleIntegers([
      canonicalLoopTicks,
      source.loopTicks,
    ]);
    const cycleCount = musicalTemplateTicks / source.loopTicks;
    if (!Number.isSafeInteger(cycleCount) || cycleCount <= 0) {
      throw new Error("Live source template does not contain exact cycles.");
    }
    return Object.freeze({
      track: Object.freeze({ ...source.track }),
      loopTicks: source.loopTicks,
      musicalTemplateTicks,
      cycles: Object.freeze(
        Array.from({ length: cycleCount }, (_, localCycleIndex) =>
          compileLiveCycle(composition, source, localCycleIndex),
        ),
      ),
    });
  });
}

/** Immutable bounded templates for real-time source-cycle scheduling. */
export function compileLiveSchedule(
  composition: Composition,
  options: Pick<CompileCompositionOptions, "includeMuted"> = {},
): CompiledLiveSchedule {
  const sources = gatherTrackSources(
    composition,
    options.includeMuted ?? false,
  );
  const superLoop = superLoopForSources(composition, sources);
  return Object.freeze({
    ppq: AUDIO_PPQ,
    bpm: composition.bpm,
    beatsPerBar: composition.beatsPerBar,
    superLoopTicks: superLoop.ticks,
    sources: Object.freeze(compileLiveSources(composition, sources)),
  });
}

/**
 * Pure canonical compiler used by live scheduling, visual-event messages,
 * MIDI export, and offline WAV rendering.
 */
export function compileComposition(
  composition: Composition,
  options: CompileCompositionOptions = {},
): CompiledSequence {
  const { loops, startLoopIndex, probabilityMode } = assertOptions(options);
  const liveSchedule = compileLiveSchedule(composition, options);
  const superLoopTicks = liveSchedule.superLoopTicks;
  const occurrences: ScheduledOccurrence[] = [];

  for (let localLoopIndex = 0; localLoopIndex < loops; localLoopIndex += 1) {
    const absoluteLoopIndex = startLoopIndex + localLoopIndex;
    const loopStartTick = localLoopIndex * superLoopTicks;
    for (const source of liveSchedule.sources) {
      const sourceCycles = superLoopTicks / source.loopTicks;
      if (!Number.isSafeInteger(sourceCycles)) {
        throw new Error("Super-loop does not contain exact source cycles.");
      }
      for (let cycleIndex = 0; cycleIndex < sourceCycles; cycleIndex += 1) {
        const cycle = source.cycles[cycleIndex % source.cycles.length];
        const cycleStartTick = loopStartTick + cycleIndex * source.loopTicks;
        for (const event of cycle.events) {
          if (
            probabilityMode === "resolve" &&
            !shouldPlayProbability(
              composition.seed,
              event.eventId,
              absoluteLoopIndex,
              event.probability,
            )
          ) {
            continue;
          }
          occurrences.push({
            occurrenceId: `${event.eventId}@${absoluteLoopIndex}:${cycleIndex}`,
            eventId: event.eventId,
            trackId: event.trackId,
            role: event.role,
            sourceKind: event.sourceKind,
            startTick: cycleStartTick + event.startOffsetTicks,
            durationTicks: event.durationTicks,
            velocity: event.velocity,
            probability: event.probability,
            loopIndex: absoluteLoopIndex,
            midiNotes: event.midiNotes,
            ...(event.drumVoice ? { drumVoice: event.drumVoice } : {}),
          });
        }
      }
    }
  }

  occurrences.sort(
    (left, right) =>
      left.startTick - right.startTick ||
      left.trackId.localeCompare(right.trackId) ||
      left.eventId.localeCompare(right.eventId),
  );

  return {
    ppq: AUDIO_PPQ,
    bpm: composition.bpm,
    beatsPerBar: composition.beatsPerBar,
    barsPerLoop: superLoopTicks / ticksForBars(1, composition.beatsPerBar),
    loopCount: loops,
    totalTicks: superLoopTicks * loops,
    tracks: liveSchedule.sources.map((source) => source.track),
    occurrences,
  };
}
