import type { Composition } from "../domain/composition/types";
import type { CompiledLiveSchedule } from "./CompositionCompiler";

/**
 * Mix changes reconcile without rebuilding Tone transport events.
 * The key contains only musical data captured by scheduled callback closures.
 * A preset change is structural because it must retract and re-admit any hit
 * already inside lookahead into the replacement voice. Tempo is owned directly
 * by Tone transport and does not require a rebuild.
 */
export function createLiveScheduleKey(
  composition: Pick<Composition, "seed">,
  template: Pick<CompiledLiveSchedule, "superLoopTicks" | "sources">,
): string {
  return JSON.stringify([
    composition.seed,
    template.superLoopTicks,
    template.sources.map((source) => [
      source.track.id,
      source.track.role,
      source.track.sourceKind,
      source.track.soundPresetId,
      source.loopTicks,
      source.musicalTemplateTicks,
      source.cycles,
    ]),
  ]);
}
