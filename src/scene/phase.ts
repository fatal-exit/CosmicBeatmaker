import {
  loopBarsToQuarterBarUnits,
  type SupportedLoopBars,
} from "../domain/composition/loopRates";

export function orbitPhaseAtTick(
  storedPhase: number,
  transportTicks: number,
  loopBars: SupportedLoopBars,
  ticksPerBeat = 192,
): number {
  const loopTicks = ticksPerBeat * loopBarsToQuarterBarUnits(loopBars);
  if (loopTicks <= 0 || !Number.isFinite(loopTicks)) return storedPhase;
  const phase = storedPhase + transportTicks / loopTicks;
  return ((phase % 1) + 1) % 1;
}
