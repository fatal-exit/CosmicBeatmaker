import { describe, expect, it, vi } from "vitest";

import { Scheduler, type SchedulerBackend } from "../src/audio/Scheduler";
import { createStarterComposition } from "../src/domain/composition/starter";

class FakeSchedulerBackend implements SchedulerBackend {
  callbacks = new Map<number, (time: number) => void>();
  cleared = new Set<number>();
  tickAtTime = 0;
  private nextId = 1;

  scheduleRepeat(callback: (time: number) => void): number {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  }

  clear(id: number): void {
    this.cleared.add(id);
    this.callbacks.delete(id);
  }

  getTicksAtTime(): number {
    return this.tickAtTime;
  }
}

describe("audio scheduler", () => {
  it("guards queued callbacks by revision and emits visual events from audio time", () => {
    const backend = new FakeSchedulerBackend();
    const trigger = vi.fn();
    const onVisualEvent = vi.fn();
    const scheduler = new Scheduler(backend, trigger, { onVisualEvent });
    const first = createStarterComposition("scheduler-first");
    scheduler.setComposition(first);
    const staleCallback = [...backend.callbacks.values()][0];

    const replacement = createStarterComposition("scheduler-replacement");
    scheduler.setComposition(replacement);
    staleCallback(2.5);
    expect(trigger).not.toHaveBeenCalled();

    backend.tickAtTime = 7_680;
    const currentCallback = [...backend.callbacks.values()][0];
    currentCallback(3.25);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger.mock.calls[0][0]).toMatchObject({ loopIndex: 1 });
    expect(onVisualEvent).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAudioTime: 3.25, loopIndex: 1 }),
    );
  });
});
