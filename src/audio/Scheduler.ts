import { getTransport } from "tone";

import type { Composition } from "../domain/composition/types";
import { compileComposition } from "./CompositionCompiler";
import { shouldPlayProbability } from "./probability";
import type { ScheduledOccurrence, ScheduledVisualEvent } from "./types";

export interface SchedulerBackend {
  scheduleRepeat(
    callback: (scheduledAudioTime: number) => void,
    intervalTicks: number,
    startTick: number,
  ): number;
  clear(id: number): void;
  getTicksAtTime(scheduledAudioTime: number): number;
}

export type OccurrenceTrigger = (
  occurrence: ScheduledOccurrence,
  scheduledAudioTime: number,
) => void;

export interface SchedulerOptions {
  onVisualEvent?: (event: ScheduledVisualEvent) => void;
}

/**
 * Registers audio-clock callbacks from the canonical compiler. Render frames may
 * consume visual messages, but have no API through which they can schedule audio.
 */
export class Scheduler {
  private readonly scheduledIds = new Set<number>();
  private revision = 0;
  private disposed = false;

  constructor(
    private readonly backend: SchedulerBackend,
    private readonly trigger: OccurrenceTrigger,
    private readonly options: SchedulerOptions = {},
  ) {}

  setComposition(composition: Composition): void {
    this.assertActive();
    this.clear();
    const revision = this.revision;
    const template = compileComposition(composition, {
      loops: 1,
      probabilityMode: "defer",
    });

    for (const occurrence of template.occurrences) {
      const id = this.backend.scheduleRepeat(
        (scheduledAudioTime) => {
          if (this.disposed || revision !== this.revision) return;
          const currentTick = Math.max(
            0,
            Math.round(this.backend.getTicksAtTime(scheduledAudioTime)),
          );
          const loopIndex = Math.floor(currentTick / template.totalTicks);
          if (
            !shouldPlayProbability(
              composition.seed,
              occurrence.eventId,
              loopIndex,
              occurrence.probability,
            )
          ) {
            return;
          }

          const concrete: ScheduledOccurrence = {
            ...occurrence,
            occurrenceId: `${occurrence.eventId}@${loopIndex}:${occurrence.occurrenceId.split(":").at(-1) ?? "0"}`,
            startTick: occurrence.startTick + loopIndex * template.totalTicks,
            loopIndex,
          };
          this.trigger(concrete, scheduledAudioTime);
          this.options.onVisualEvent?.({
            ...concrete,
            scheduledAudioTime,
          });
        },
        template.totalTicks,
        occurrence.startTick,
      );
      this.scheduledIds.add(id);
    }
  }

  clear(): void {
    this.revision += 1;
    for (const id of this.scheduledIds) this.backend.clear(id);
    this.scheduledIds.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed)
      throw new Error("A disposed scheduler cannot be reused.");
  }
}

export function createToneSchedulerBackend(): SchedulerBackend {
  const transport = getTransport();
  return {
    scheduleRepeat(callback, intervalTicks, startTick) {
      return transport.scheduleRepeat(
        callback,
        `${intervalTicks}i`,
        `${startTick}i`,
      );
    },
    clear(id) {
      transport.clear(id);
    },
    getTicksAtTime(time) {
      return transport.getTicksAtTime(time);
    },
  };
}
