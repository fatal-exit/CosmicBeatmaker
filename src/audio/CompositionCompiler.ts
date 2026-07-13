import type {
  Composition,
  PatternEvent,
  PatternState,
} from "../domain/composition/types";
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
  loops?: number;
  /** Absolute composition-loop index used for deterministic probability. */
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
      pattern: planet.pattern,
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
        pattern: moon.pattern,
        loopTicks: Math.max(1, Math.round(loopTicks / moon.orbitRatio)),
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

function compileSourceLoop(
  composition: Composition,
  source: TrackSource,
  localLoopIndex: number,
  absoluteLoopIndex: number,
  compositionLoopTicks: number,
  probabilityMode: "resolve" | "defer",
): ScheduledOccurrence[] {
  const occurrences: ScheduledOccurrence[] = [];
  const exportLoopStart = localLoopIndex * compositionLoopTicks;
  const phaseTicks = Math.round(
    normalizePhase(source.phase) * source.loopTicks,
  );

  for (
    let cycleStart = 0, cycleIndex = 0;
    cycleStart < compositionLoopTicks;
    cycleStart += source.loopTicks, cycleIndex += 1
  ) {
    for (const event of source.pattern.events) {
      const probability = Math.max(
        0,
        Math.min(1, event.probability * source.probability),
      );
      if (
        probabilityMode === "resolve" &&
        !shouldPlayProbability(
          composition.seed,
          event.id,
          absoluteLoopIndex,
          probability,
        )
      ) {
        continue;
      }
      if (probabilityMode === "defer" && probability <= 0) continue;

      const stepTicks = Math.round(
        (event.step / source.pattern.gridSize) * source.loopTicks,
      );
      const tickInCycle = (stepTicks + phaseTicks) % source.loopTicks;
      const unswungStart = cycleStart + tickInCycle;
      if (unswungStart >= compositionLoopTicks) continue;

      const startWithinComposition = applySwing(
        unswungStart,
        composition.swing,
      );
      const startTick = exportLoopStart + startWithinComposition;
      const durationTicks = Math.max(
        1,
        Math.round(
          (event.durationSteps / source.pattern.gridSize) * source.loopTicks,
        ),
      );
      occurrences.push({
        occurrenceId: `${event.id}@${absoluteLoopIndex}:${cycleIndex}`,
        eventId: event.id,
        trackId: source.track.id,
        role: source.track.role,
        sourceKind: source.track.sourceKind,
        startTick,
        durationTicks,
        velocity: Math.max(0, Math.min(1, event.velocity)),
        probability,
        loopIndex: absoluteLoopIndex,
        midiNotes: resolveMidiNotes(
          composition,
          source.track.role,
          startWithinComposition,
          event.pitch,
          event.drumVoice,
        ),
        ...(event.drumVoice ? { drumVoice: event.drumVoice } : {}),
      });
    }
  }

  return occurrences;
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
  const compositionLoopTicks = ticksForBars(
    composition.bars,
    composition.beatsPerBar,
  );
  const sources = gatherTrackSources(
    composition,
    options.includeMuted ?? false,
  );
  const occurrences: ScheduledOccurrence[] = [];

  for (let localLoopIndex = 0; localLoopIndex < loops; localLoopIndex += 1) {
    const absoluteLoopIndex = startLoopIndex + localLoopIndex;
    for (const source of sources) {
      occurrences.push(
        ...compileSourceLoop(
          composition,
          source,
          localLoopIndex,
          absoluteLoopIndex,
          compositionLoopTicks,
          probabilityMode,
        ),
      );
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
    barsPerLoop: composition.bars,
    loopCount: loops,
    totalTicks: compositionLoopTicks * loops,
    tracks: sources.map((source) => source.track),
    occurrences,
  };
}
