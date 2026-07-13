import type { LoopBars } from "../domain/composition";
import { AUDIO_PPQ } from "../audio/constants";
import { orbitPhaseAtTick } from "./phase";

export const SCENE_TICKS_PER_BEAT = AUDIO_PPQ;

export function normalizeOrbitPhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

/**
 * Audio events are offset by the planet's stored phase. The rendered planet is
 * also offset by that phase, so its fixed collision gate needs the same offset
 * once more to meet the body at the exact scheduled trigger position.
 */
export function gatePhaseForTrigger(
  triggerPhase: number,
  orbitPhase: number,
): number {
  return normalizeOrbitPhase(triggerPhase + orbitPhase);
}

/**
 * New runtime objects join the shared transport immediately. No creation-time
 * clock is retained, which keeps every planet aligned through the four-bar loop.
 */
export function spawnPhaseAtTick(
  orbitPhase: number,
  transportTicks: number,
  loopBars: LoopBars,
): number {
  return orbitPhaseAtTick(
    orbitPhase,
    transportTicks,
    loopBars,
    SCENE_TICKS_PER_BEAT,
  );
}
