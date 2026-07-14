import { describe, expect, it, vi } from "vitest";

import {
  RuntimeVoiceEventPool,
  RuntimeVoiceSourceBudget,
  type RuntimeVoiceEventClock,
  type RuntimeVoiceEventHandle,
} from "../src/audio/VoiceFactory";

class ManualAudioClock implements RuntimeVoiceEventClock {
  private now = 0;
  private nextTimerId = 1;
  private readonly timers = new Map<
    number,
    { readonly callback: () => void; readonly dueAt: number }
  >();

  rawAudioTime(): number {
    return this.now;
  }

  setTimeout(callback: () => void, delaySeconds: number): number {
    const timerId = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(timerId, {
      callback,
      dueAt: this.now + Math.max(0, delaySeconds),
    });
    return timerId;
  }

  clearTimeout(timerId: number): void {
    this.timers.delete(timerId);
  }

  advanceTo(audioTime: number): void {
    if (audioTime < this.now) throw new Error("Audio time cannot go backward.");
    this.now = audioTime;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= this.now)
        .sort(([, left], [, right]) => left.dueAt - right.dueAt)[0];
      if (!next) return;
      const [timerId, timer] = next;
      this.timers.delete(timerId);
      timer.callback();
    }
  }

  get pendingTimerCount(): number {
    return this.timers.size;
  }
}

function fakeEvent(
  startAudioTime: number,
  endAudioTime: number,
  tailAudioTime: number,
): {
  readonly handle: RuntimeVoiceEventHandle;
  readonly cancel: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
} {
  const cancel = vi.fn();
  const release = vi.fn();
  const dispose = vi.fn();
  return {
    handle: {
      startAudioTime,
      endAudioTime,
      tailAudioTime,
      cancel,
      release,
      dispose,
    },
    cancel,
    release,
    dispose,
  };
}

describe("runtime voice event isolation", () => {
  it("cancels a future attack without touching an occurrence on the raw boundary", () => {
    const clock = new ManualAudioClock();
    clock.advanceTo(5);
    const pool = new RuntimeVoiceEventPool(4, clock);
    const active = fakeEvent(5, 5.5, 6);
    const future = fakeEvent(5.1, 5.7, 6.2);

    pool.schedule(active.handle, vi.fn());
    pool.schedule(future.handle, vi.fn());
    pool.cancelScheduledAfter(5);

    expect(future.cancel).toHaveBeenCalledExactlyOnceWith(5);
    expect(future.dispose).toHaveBeenCalledOnce();
    expect(active.cancel).not.toHaveBeenCalled();
    expect(active.dispose).not.toHaveBeenCalled();
    expect(pool.size).toBe(1);

    clock.advanceTo(5.999);
    expect(active.dispose).not.toHaveBeenCalled();
    clock.advanceTo(6);
    expect(active.cancel).not.toHaveBeenCalled();
    expect(active.dispose).toHaveBeenCalledOnce();
    expect(pool.size).toBe(0);
  });

  it("retires only after the latest admitted active tail and rejects new work", () => {
    const clock = new ManualAudioClock();
    clock.advanceTo(2);
    const pool = new RuntimeVoiceEventPool(6, clock);
    const firstActive = fakeEvent(1.8, 2.3, 2.8);
    const lastActive = fakeEvent(2, 2.6, 3.2);
    const future = fakeEvent(2.1, 2.7, 3.3);
    const retired = vi.fn();

    pool.schedule(firstActive.handle, vi.fn());
    pool.schedule(lastActive.handle, vi.fn());
    pool.schedule(future.handle, vi.fn());
    pool.retireAfterActive(2, retired);

    expect(pool.acceptsTriggers).toBe(false);
    expect(pool.canSchedule(2.2, 2.4, 2.5)).toBe(false);
    expect(future.cancel).toHaveBeenCalledExactlyOnceWith(2);
    expect(future.dispose).toHaveBeenCalledOnce();
    expect(firstActive.cancel).not.toHaveBeenCalled();
    expect(lastActive.cancel).not.toHaveBeenCalled();
    expect(retired).not.toHaveBeenCalled();

    clock.advanceTo(2.8);
    expect(firstActive.dispose).toHaveBeenCalledOnce();
    expect(lastActive.dispose).not.toHaveBeenCalled();
    expect(retired).not.toHaveBeenCalled();

    clock.advanceTo(3.2);
    expect(lastActive.dispose).toHaveBeenCalledOnce();
    expect(retired).toHaveBeenCalledOnce();
    expect(pool.size).toBe(0);
    expect(clock.pendingTimerCount).toBe(0);
  });

  it("bounds event resources and owns only one cleanup timer during a trigger burst", () => {
    const clock = new ManualAudioClock();
    const pool = new RuntimeVoiceEventPool(3, clock);
    const created: ReturnType<typeof fakeEvent>[] = [];

    for (let index = 0; index < 100; index += 1) {
      const startAudioTime = 0.1 + index * 0.001;
      const endAudioTime = startAudioTime + 0.2;
      const tailAudioTime = endAudioTime + 0.1;
      if (!pool.canSchedule(startAudioTime, endAudioTime, tailAudioTime)) {
        continue;
      }
      const event = fakeEvent(startAudioTime, endAudioTime, tailAudioTime);
      created.push(event);
      pool.schedule(event.handle, vi.fn());
    }

    expect(created).toHaveLength(3);
    expect(pool.size).toBe(3);
    expect(clock.pendingTimerCount).toBe(1);

    pool.cancelScheduledAfter(0);
    expect(pool.size).toBe(0);
    expect(clock.pendingTimerCount).toBe(0);
    expect(created.every(({ cancel }) => cancel.mock.calls.length === 1)).toBe(
      true,
    );
    expect(
      created.every(({ dispose }) => dispose.mock.calls.length === 1),
    ).toBe(true);
  });

  it("releases a cancelled handle's source reservation before every reschedule", () => {
    const clock = new ManualAudioClock();
    const pool = new RuntimeVoiceEventPool(1, clock);
    const budget = new RuntimeVoiceSourceBudget(1);
    const attacks = vi.fn();

    for (let revision = 0; revision < 20; revision += 1) {
      const startAudioTime = 1 + revision * 0.001;
      const endAudioTime = startAudioTime + 0.2;
      const tailAudioTime = endAudioTime + 0.1;
      expect(
        pool.canSchedule(startAudioTime, endAudioTime, tailAudioTime),
      ).toBe(true);
      const reservation = budget.admit(startAudioTime, [tailAudioTime]);
      expect(reservation.admittedCount).toBe(1);
      const event = fakeEvent(startAudioTime, endAudioTime, tailAudioTime);
      pool.schedule(
        {
          ...event.handle,
          dispose: () => {
            event.handle.dispose();
            reservation.release();
          },
        },
        attacks,
      );
      pool.cancelScheduledAfter(0);
    }

    expect(attacks).toHaveBeenCalledTimes(20);
    expect(pool.size).toBe(0);
    expect(clock.pendingTimerCount).toBe(0);
  });

  it("waits through the configured render-quantum grace after the natural tail", () => {
    const clock = new ManualAudioClock();
    const pool = new RuntimeVoiceEventPool(1, clock, 0.01);
    const active = fakeEvent(0, 0.8, 1);
    const retired = vi.fn();

    pool.schedule(active.handle, vi.fn());
    pool.retireAfterActive(0, retired);
    clock.advanceTo(1);
    expect(active.dispose).not.toHaveBeenCalled();
    expect(retired).not.toHaveBeenCalled();

    clock.advanceTo(1.01);
    expect(active.dispose).toHaveBeenCalledOnce();
    expect(retired).toHaveBeenCalledOnce();
  });
});
