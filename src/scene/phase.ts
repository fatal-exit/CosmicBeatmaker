export function orbitPhaseAtTick(
  storedPhase: number,
  transportTicks: number,
  loopBars: number,
  ticksPerBeat = 192,
): number {
  const loopTicks = ticksPerBeat * 4 * loopBars;
  if (loopTicks <= 0 || !Number.isFinite(loopTicks)) return storedPhase;
  const phase = storedPhase + transportTicks / loopTicks;
  return ((phase % 1) + 1) % 1;
}
