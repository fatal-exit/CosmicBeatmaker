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
  composition: Pick<Composition, "seed"> &
    Partial<Pick<Composition, "planets" | "asteroidBelt">>,
  template: Pick<CompiledLiveSchedule, "superLoopTicks" | "sources">,
): string {
  return JSON.stringify([
    composition.seed,
    // Retain canonical event edits even when a macro/projection currently
    // suppresses the edited event. This keeps reconciliation and cancellation
    // semantics deterministic for the next cycle rather than leaving a stale
    // profile in a compatible voice.
    composition.planets?.map((planet) => [
      planet.id,
      planet.pattern,
      planet.expression,
      planet.moons.map((moon) => [moon.id, moon.pattern]),
      planet.ring,
    ]),
    composition.asteroidBelt
      ? [composition.asteroidBelt.id, composition.asteroidBelt.events]
      : undefined,
    template.superLoopTicks,
    template.sources.map((source) => [
      source.track.id,
      source.track.role,
      source.track.sourceKind,
      source.track.soundPresetId,
      source.track.pitchShiftSemitones ?? 0,
      source.loopTicks,
      source.musicalTemplateTicks,
      source.cycles,
    ]),
  ]);
}
