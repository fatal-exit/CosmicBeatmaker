import { describe, expect, it, vi } from "vitest";

import { Scheduler, type SchedulerBackend } from "../src/audio/Scheduler";
import { compileComposition } from "../src/audio/CompositionCompiler";
import { RuntimeVoiceRegistry } from "../src/audio/RuntimeVoiceRegistry";
import type { RuntimeVoice } from "../src/audio/VoiceFactory";
import type { ScheduledOccurrence } from "../src/audio/types";
import { createStarterComposition } from "../src/domain/composition/starter";
import { generateCompleteSystem } from "../src/domain/generation";

class FakeSchedulerBackend implements SchedulerBackend {
  callbacks = new Map<number, (time: number) => void>();
  cleared = new Set<number>();
  tickAtTime = 0;
  currentAudioTime = 0;
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

  getCurrentAudioTime(): number {
    return this.currentAudioTime;
  }
}

describe("audio scheduler", () => {
  it("guards queued callbacks by revision and emits visual events from audio time", () => {
    vi.useFakeTimers();
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
    backend.currentAudioTime = 3.25;
    const currentCallback = [...backend.callbacks.values()][0];
    currentCallback(3.25);
    expect(trigger.mock.calls.length).toBeGreaterThan(0);
    for (const [occurrence] of trigger.mock.calls) {
      expect(occurrence).toMatchObject({ loopIndex: 1 });
    }
    vi.runAllTimers();
    expect(onVisualEvent).toHaveBeenCalledTimes(trigger.mock.calls.length);
    expect(onVisualEvent).toHaveBeenCalledWith(
      expect.objectContaining({ loopIndex: 1 }),
    );
    vi.useRealTimers();
  });

  it("cancels lookahead visual events immediately without clearing audio registrations", () => {
    vi.useFakeTimers();
    const backend = new FakeSchedulerBackend();
    const trigger = vi.fn();
    const onVisualEvent = vi.fn();
    const scheduler = new Scheduler(backend, trigger, { onVisualEvent });
    scheduler.setComposition(createStarterComposition("pause-visuals"));

    backend.currentAudioTime = 1;
    backend.tickAtTime = 0;
    for (const callback of backend.callbacks.values()) callback(1.15);
    expect(trigger).toHaveBeenCalled();

    const registrationCount = scheduler.scheduledRegistrationCount;
    scheduler.cancelPendingVisualEvents();
    vi.runAllTimers();

    expect(onVisualEvent).not.toHaveBeenCalled();
    expect(scheduler.scheduledRegistrationCount).toBe(registrationCount);
    vi.useRealTimers();
  });

  it("joins a newly rebuilt chord arpeggio to the current transport cycle", () => {
    const backend = new FakeSchedulerBackend();
    backend.currentAudioTime = 4;
    backend.tickAtTime = 600;
    const triggered: Array<{
      occurrence: ScheduledOccurrence;
      scheduledAudioTime: number;
    }> = [];
    const scheduler = new Scheduler(
      backend,
      (occurrence, scheduledAudioTime) => {
        triggered.push({ occurrence, scheduledAudioTime });
      },
    );
    const composition = generateCompleteSystem("live-chord-arp");
    composition.swing = 0;
    const chords = composition.planets.find(
      (planet) => planet.role === "chords",
    )!;
    chords.orbit.loopBars = 4;
    chords.orbit.phase = 0;
    chords.ring = {
      id: "live-chord-ring",
      type: "gate",
      segments: 16,
      active: Array.from({ length: 16 }, () => true),
      phase: 0,
      velocityVariation: 0.18,
      probability: 1,
      soundPresetId: chords.soundPresetId,
      level: 1,
    };

    scheduler.setComposition(composition, { continueFromTick: 600 });

    const arpCalls = triggered.filter(
      ({ occurrence }) => occurrence.trackId === chords.ring!.id,
    );
    expect(arpCalls.length).toBeGreaterThan(0);
    expect(
      triggered.some(({ occurrence }) => occurrence.trackId === chords.id),
    ).toBe(false);
    expect(arpCalls[0].occurrence).toMatchObject({
      sourceKind: "ring",
      startTick: 960,
      midiNotes: [expect.any(Number)],
    });
    expect(arpCalls[0].scheduledAudioTime).toBeGreaterThan(
      backend.currentAudioTime,
    );
    expect(
      arpCalls.every(({ occurrence }) => occurrence.startTick >= 600),
    ).toBe(true);
  });

  it("keeps callbacks and runtime voices bounded through thousands of macro rebuilds", () => {
    const backend = new FakeSchedulerBackend();
    const registry = new RuntimeVoiceRegistry();
    const disposals: ReturnType<typeof vi.fn>[] = [];
    const updates: ReturnType<typeof vi.fn>[] = [];
    const createVoice = vi.fn((): RuntimeVoice => {
      const dispose = vi.fn();
      const update = vi.fn();
      disposals.push(dispose);
      updates.push(update);
      return {
        trigger: vi.fn(),
        update,
        releaseAll: vi.fn(),
        dispose,
      };
    });
    const trigger = vi.fn((occurrence: ScheduledOccurrence, time: number) =>
      registry.trigger(occurrence, time, 120),
    );
    const scheduler = new Scheduler(backend, trigger);
    const starter = createStarterComposition("macro-audio-stress");
    const expectedTrackCount = compileComposition(starter, {
      probabilityMode: "defer",
    }).tracks.length;
    let maximumRegistrations = 0;
    let maximumTriggersPerRebuild = 0;

    for (let revision = 0; revision < 2_000; revision += 1) {
      const composition = structuredClone(starter);
      composition.macros.density = (revision % 101) / 100;
      composition.macros.energy = ((revision * 7) % 101) / 100;
      const template = compileComposition(composition, {
        probabilityMode: "defer",
      });
      registry.reconcile(template.tracks, createVoice);
      scheduler.setComposition(composition);
      maximumRegistrations = Math.max(
        maximumRegistrations,
        backend.callbacks.size,
      );

      backend.tickAtTime = revision * template.totalTicks;
      backend.currentAudioTime = revision * 10;
      const triggersBefore = trigger.mock.calls.length;
      for (const callback of [...backend.callbacks.values()]) {
        callback(backend.currentAudioTime);
      }
      maximumTriggersPerRebuild = Math.max(
        maximumTriggersPerRebuild,
        trigger.mock.calls.length - triggersBefore,
      );
    }

    expect(maximumRegistrations).toBe(expectedTrackCount);
    expect(scheduler.scheduledRegistrationCount).toBe(expectedTrackCount);
    expect(maximumTriggersPerRebuild).toBeLessThanOrEqual(128);
    expect(createVoice).toHaveBeenCalledTimes(expectedTrackCount);
    expect(updates.every((update) => update.mock.calls.length === 0)).toBe(
      true,
    );
    expect(disposals.every((dispose) => dispose.mock.calls.length === 0)).toBe(
      true,
    );

    scheduler.dispose();
    registry.dispose();
    expect(disposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it("fails silent after a bounded past-due callback backlog", () => {
    const backend = new FakeSchedulerBackend();
    backend.currentAudioTime = 100;
    const trigger = vi.fn();
    const onHealthFailure = vi.fn();
    const scheduler = new Scheduler(backend, trigger, { onHealthFailure });
    scheduler.setComposition(createStarterComposition("late-backlog"));
    const callbacks = [...backend.callbacks.values()];
    expect(callbacks.length).toBeGreaterThan(0);

    for (let callbackIndex = 0; callbackIndex < 100; callbackIndex += 1) {
      backend.tickAtTime = callbackIndex * 1_920;
      callbacks[callbackIndex % callbacks.length](1);
    }

    expect(trigger).not.toHaveBeenCalled();
    expect(onHealthFailure).toHaveBeenCalledOnce();
    expect(onHealthFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "late-callback-backlog" }),
    );
    expect(scheduler.scheduledRegistrationCount).toBe(0);
    expect(backend.callbacks.size).toBe(0);
  });
});
