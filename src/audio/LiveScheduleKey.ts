import type { Composition } from "../domain/composition/types";
import type { CompiledLiveSchedule } from "./CompositionCompiler";

/**
 * Mix and preset changes reconcile without rebuilding Tone transport events.
 * The key contains only data captured by scheduled callback closures, including
 * BPM because grouped live events convert within-cycle ticks to audio seconds.
 */
export function createLiveScheduleKey(
  composition: Pick<Composition, "seed" | "bpm">,
  template: Pick<CompiledLiveSchedule, "superLoopTicks" | "sources">,
): string {
  return JSON.stringify([
    composition.seed,
    composition.bpm,
    template.superLoopTicks,
    template.sources.map((source) => [
      source.track.id,
      source.track.role,
      source.track.sourceKind,
      source.loopTicks,
      source.musicalTemplateTicks,
      source.cycles,
    ]),
  ]);
}
