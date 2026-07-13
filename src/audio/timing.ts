import type { LoopBars } from "../domain/composition/types";
import { AUDIO_PPQ } from "./constants";

export function ticksPerBar(beatsPerBar = 4): number {
  return beatsPerBar * AUDIO_PPQ;
}

export function ticksForBars(bars: number, beatsPerBar = 4): number {
  const quarterBarUnits = bars * 4;
  const ticksPerQuarterBar = ticksPerBar(beatsPerBar) / 4;
  if (
    !Number.isSafeInteger(quarterBarUnits) ||
    quarterBarUnits <= 0 ||
    !Number.isSafeInteger(ticksPerQuarterBar) ||
    ticksPerQuarterBar <= 0
  ) {
    throw new Error("Bar durations must resolve to exact quarter-bar ticks.");
  }
  const ticks = quarterBarUnits * ticksPerQuarterBar;
  if (!Number.isSafeInteger(ticks)) {
    throw new Error("Bar duration exceeds the safe integer timing range.");
  }
  return ticks;
}

export function ticksToSeconds(ticks: number, bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("BPM must be a positive finite number.");
  }
  return (ticks / AUDIO_PPQ) * (60 / bpm);
}

export function normalizePhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

/** Read-only phase helper for scene interpolation; it never schedules sound. */
export function orbitPhaseAtTick(
  transportTick: number,
  loopBars: LoopBars,
  phaseOffset = 0,
  beatsPerBar = 4,
): number {
  const loopTicks = ticksForBars(loopBars, beatsPerBar);
  return normalizePhase(transportTick / loopTicks + phaseOffset);
}

/** Apply the composition's eighth-note swing directly to the shared timeline. */
export function applySwing(tick: number, swing: number): number {
  const eighthTicks = AUDIO_PPQ / 2;
  const positionInBeat = ((tick % AUDIO_PPQ) + AUDIO_PPQ) % AUDIO_PPQ;
  if (positionInBeat !== eighthTicks) return tick;
  return tick + Math.round(Math.max(0, Math.min(0.6, swing)) * eighthTicks);
}
