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
  oneShots = new Map<
    number,
    { callback: (time: number) => void; absoluteTick: number }
  >();
  cleared = new Set<number>();
  tickAtTime = 0;
  currentAudioTime = 0;
  schedulingAudioTime?: number;
  ticksAtAudioTime?: (audioTime: number) => number;
  private nextId = 1;

  scheduleRepeat(callback: (time: number) => void): number {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.set(id, callback);
    return id;
  }

  scheduleOnce(callback: (time: number) => void, absoluteTick: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.oneShots.set(id, { callback, absoluteTick });
    return id;
  }

  clear(id: number): void {
    this.cleared.add(id);
    this.callbacks.delete(id);
    this.oneShots.delete(id);
  }

  getTicksAtTime(audioTime: number): number {
    return this.ticksAtAudioTime?.(audioTime) ?? this.tickAtTime;
  }

  getCurrentAudioTime(): number {
    return this.currentAudioTime;
  }

  getSchedulingAudioTime(): number {
    return this.schedulingAudioTime ?? this.currentAudioTime;
  }
}

describe("audio scheduler", () => {
  it("treats an exact raw playhead tick as sounded", () => {
    const backend = new FakeSchedulerBackend();
    backend.currentAudioTime = 4;
    backend.tickAtTime = 600;
    const scheduler = new Scheduler(backend, vi.fn());

    expect(scheduler.currentClockPosition).toEqual({
      audioTime: 4,
      transportTick: 600,
      nextUnsoundedTick: 601,
      schedulingAudioTime: 4,
      schedulingTransportTick: 600,
    });
  });

  it("directly admits unsounded ticks behind Tone's frontier and keeps later ticks cancellable", () => {
    const backend = new FakeSchedulerBackend();
    backend.currentAudioTime = 4;
    backend.schedulingAudioTime = 4.25;
    backend.ticksAtAudioTime = (audioTime) => {
      const elapsed = audioTime - 4;
      return 600 + 800 * elapsed + 400 * elapsed ** 2;
    };
    const trigger = vi.fn();
    const composition = createStarterComposition("lookahead-continuation");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    composition.planets[0].pattern.templateId = undefined;
    composition.planets[0].pattern.events.push(
      {
        id: "continuation-exact-boundary",
        step: 5,
        velocity: 0.7,
        probability: 1,
        durationSteps: 1,
        drumVoice: "closed-hat",
      },
      {
        id: "continuation-inside-frontier",
        step: 6,
        velocity: 0.8,
        probability: 1,
        durationSteps: 1,
        drumVoice: "closed-hat",
      },
    );
    composition.planets[0].pattern.events.sort(
      (left, right) => left.step - right.step,
    );
    const scheduler = new Scheduler(backend, trigger);

    scheduler.setComposition(composition, {
      continueFromCurrentClock: true,
    });

    const expectedElapsed =
      (-800 + Math.sqrt(800 ** 2 + 4 * 400 * 120)) / (2 * 400);
    expect(trigger).toHaveBeenCalledOnce();
    expect(trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "continuation-inside-frontier",
        startTick: 720,
      }),
      expect.closeTo(4 + expectedElapsed, 6),
    );
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([960, 1_440]);
    expect(scheduler.earliestFutureAdmittedAudioTime).toBeCloseTo(
      4 + expectedElapsed,
      6,
    );
    expect(scheduler.futureAdmittedEventCount).toBe(1);

    // A retained callback for the already-claimed current cycle cannot admit
    // the direct event twice or resurrect exact/past events.
    [...backend.callbacks.values()][0](4);
    expect(trigger).toHaveBeenCalledOnce();
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([960, 1_440]);

    // Exact and past edits were claimed for this cycle, then appear normally in
    // the next orbit rather than being inserted at or behind the raw playhead.
    backend.ticksAtAudioTime = undefined;
    backend.tickAtTime = 1_920;
    [...backend.callbacks.values()][0](6);
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([960, 1_440, 2_400, 2_520, 2_640, 2_880, 3_360]);

    scheduler.clear();
    expect(backend.oneShots.size).toBe(0);
    expect(scheduler.earliestFutureAdmittedAudioTime).toBeUndefined();
  });

  it("continues across a source boundary already crossed by Tone's frontier", () => {
    const backend = new FakeSchedulerBackend();
    backend.currentAudioTime = 4;
    backend.schedulingAudioTime = 4.25;
    backend.ticksAtAudioTime = (audioTime) => 1_850 + (audioTime - 4) * 960;
    const triggered: Array<{
      occurrence: ScheduledOccurrence;
      audioTime: number;
    }> = [];
    const trigger = vi.fn(
      (occurrence: ScheduledOccurrence, audioTime: number) => {
        triggered.push({ occurrence, audioTime });
      },
    );
    const composition = createStarterComposition("frontier-cycle-crossing");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    composition.planets[0].pattern.templateId = undefined;
    composition.planets[0].pattern.events.push(
      {
        id: "next-cycle-inside-frontier",
        step: 1,
        velocity: 0.8,
        probability: 1,
        durationSteps: 1,
        drumVoice: "closed-hat",
      },
      {
        id: "next-cycle-after-frontier",
        step: 2,
        velocity: 0.7,
        probability: 1,
        durationSteps: 1,
        drumVoice: "closed-hat",
      },
    );
    composition.planets[0].pattern.events.sort(
      (left, right) => left.step - right.step,
    );
    const scheduler = new Scheduler(backend, trigger);

    scheduler.setComposition(composition, {
      continueFromCurrentClock: true,
    });

    expect(
      triggered.map(({ occurrence }) => ({
        eventId: occurrence.eventId,
        startTick: occurrence.startTick,
      })),
    ).toEqual([
      {
        eventId: composition.planets[0].pattern.events[0].id,
        startTick: 1_920,
      },
      {
        eventId: "next-cycle-inside-frontier",
        startTick: 2_040,
      },
    ]);
    expect(triggered[0].audioTime).toBeCloseTo(4 + 70 / 960, 6);
    expect(triggered[1].audioTime).toBeCloseTo(4 + 190 / 960, 6);
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([2_160, 2_400, 2_880, 3_360]);

    // Tone may still deliver a retained repeat callback for the crossed
    // boundary; the claimed next cycle must remain exactly-once.
    backend.ticksAtAudioTime = undefined;
    backend.tickAtTime = 1_920;
    [...backend.callbacks.values()][0](5);
    expect(trigger).toHaveBeenCalledTimes(2);
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([2_160, 2_400, 2_880, 3_360]);
  });

  it("aborts source registration when direct continuation trips health", () => {
    const backend = new FakeSchedulerBackend();
    backend.currentAudioTime = 4;
    backend.schedulingAudioTime = 5.6;
    backend.ticksAtAudioTime = (audioTime) => (audioTime - 4) * 960;
    const composition = createStarterComposition("direct-health-trip");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    composition.planets[0].pattern.templateId = undefined;
    composition.planets[0].pattern.events.push({
      id: "direct-health-trip-fourth-event",
      step: 2,
      velocity: 0.7,
      probability: 1,
      durationSteps: 1,
      drumVoice: "closed-hat",
    });
    composition.planets[0].pattern.events.sort(
      (left, right) => left.step - right.step,
    );
    const secondPlanet = structuredClone(composition.planets[0]);
    secondPlanet.id = "direct-health-trip-later-source";
    secondPlanet.pattern.events = secondPlanet.pattern.events.map(
      (event, eventIndex) => ({
        ...event,
        id: `direct-health-trip-later-${eventIndex}`,
      }),
    );
    composition.planets.push(secondPlanet);
    const trigger = vi.fn(() => {
      throw new Error("voice failure");
    });
    const onHealthFailure = vi.fn();
    const scheduler = new Scheduler(backend, trigger, { onHealthFailure });

    scheduler.setComposition(composition, {
      continueFromCurrentClock: true,
    });

    expect(trigger).toHaveBeenCalledTimes(4);
    expect(onHealthFailure).toHaveBeenCalledOnce();
    expect(onHealthFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "voice-trigger-errors" }),
    );
    expect(scheduler.healthSnapshot.tripped).toBe(true);
    expect(scheduler.scheduledRegistrationCount).toBe(0);
    expect(scheduler.pendingScheduledEventCount).toBe(0);
    expect(backend.callbacks.size).toBe(0);
    expect(backend.oneShots.size).toBe(0);
    expect(backend.cleared.size).toBe(1);
  });

  it("bounds and prunes the successful future-admission ledger", () => {
    const backend = new FakeSchedulerBackend();
    const trigger = vi.fn();
    const composition = createStarterComposition("future-admission-ledger");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    composition.planets[0].pattern.templateId = undefined;
    composition.planets[0].pattern.events = [
      composition.planets[0].pattern.events[0],
    ];
    const scheduler = new Scheduler(backend, trigger);
    scheduler.setComposition(composition);
    const sourceCallback = [...backend.callbacks.values()][0];

    for (let cycle = 0; cycle < 4_100; cycle += 1) {
      backend.currentAudioTime = cycle * 0.06;
      backend.tickAtTime = cycle * 1_920;
      sourceCallback(1_000 + cycle);
    }

    expect(trigger).toHaveBeenCalledTimes(4_100);
    expect(scheduler.futureAdmittedEventCount).toBe(4_096);
    expect(scheduler.earliestFutureAdmittedAudioTime).toBe(1_000);

    backend.currentAudioTime = 10_000;
    expect(scheduler.futureAdmittedEventCount).toBe(0);
    expect(scheduler.earliestFutureAdmittedAudioTime).toBeUndefined();
  });

  it("revision-fences stale replacement callbacks and transport one-shots", () => {
    vi.useFakeTimers();
    const backend = new FakeSchedulerBackend();
    const trigger = vi.fn();
    const onVisualEvent = vi.fn();
    const scheduler = new Scheduler(backend, trigger, { onVisualEvent });
    const first = createStarterComposition("scheduler-first");
    first.swing = 0;
    first.planets[0].pattern.humanize = 0;
    scheduler.setComposition(first);
    const staleCallback = [...backend.callbacks.values()][0];
    backend.currentAudioTime = 1;
    backend.tickAtTime = 0;
    staleCallback(1);
    const staleOneShot = [...backend.oneShots.values()][0].callback;
    const callsBeforeReplacement = trigger.mock.calls.length;

    const replacement = createStarterComposition("scheduler-replacement");
    replacement.swing = 0;
    replacement.planets[0].pattern.humanize = 0;
    scheduler.setComposition(replacement);
    staleCallback(2.5);
    staleOneShot(2.5);
    expect(trigger).toHaveBeenCalledTimes(callsBeforeReplacement);

    backend.tickAtTime = 0;
    backend.currentAudioTime = 3;
    const currentCallback = [...backend.callbacks.values()][0];
    currentCallback(3);
    const currentOneShot = [...backend.oneShots.values()][0];
    backend.currentAudioTime = 3.5;
    currentOneShot.callback(3.5);
    vi.runAllTimers();
    expect(onVisualEvent).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAudioTime: 3.5 }),
    );
    vi.useRealTimers();
  });

  it("admits duplicate source and one-shot callbacks exactly once per event", () => {
    const backend = new FakeSchedulerBackend();
    const trigger = vi.fn();
    const composition = createStarterComposition("scheduler-deduplication");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    const scheduler = new Scheduler(backend, trigger);
    scheduler.setComposition(composition);

    const sourceCallback = [...backend.callbacks.values()][0];
    backend.currentAudioTime = 1;
    backend.tickAtTime = 0;
    sourceCallback(1);
    sourceCallback(1);

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(scheduler.pendingScheduledEventCount).toBe(3);
    expect(scheduler.healthSnapshot.occurrenceLedgerSize).toBe(1);
    const firstOneShot = [...backend.oneShots.values()][0].callback;
    backend.currentAudioTime = 1.5;
    firstOneShot(1.5);
    firstOneShot(1.5);

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(scheduler.pendingScheduledEventCount).toBe(2);
    expect(scheduler.healthSnapshot.occurrenceLedgerSize).toBe(2);
  });

  it("continues from the raw audio clock and deduplicates the normal cycle callback", () => {
    const backend = new FakeSchedulerBackend();
    backend.currentAudioTime = 4;
    backend.tickAtTime = 600;
    const trigger = vi.fn();
    const composition = createStarterComposition("continuation-deduplication");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    const scheduler = new Scheduler(backend, trigger);

    scheduler.setComposition(composition, {
      continueFromCurrentClock: true,
    });
    expect(trigger).not.toHaveBeenCalled();
    expect(
      [...backend.oneShots.values()].map(({ absoluteTick }) => absoluteTick),
    ).toEqual([960, 1_440]);

    backend.tickAtTime = 0;
    [...backend.callbacks.values()][0](3);
    expect(trigger).not.toHaveBeenCalled();
    expect(scheduler.pendingScheduledEventCount).toBe(2);
    expect(backend.oneShots.size).toBe(2);

    for (const { callback, absoluteTick } of [...backend.oneShots.values()]) {
      const scheduledAudioTime = 4 + (absoluteTick - 600) / 960;
      backend.currentAudioTime = scheduledAudioTime;
      callback(scheduledAudioTime);
    }
    expect(trigger).toHaveBeenCalledTimes(2);
    expect(
      new Set(
        trigger.mock.calls.map(
          ([occurrence]) => (occurrence as ScheduledOccurrence).occurrenceId,
        ),
      ).size,
    ).toBe(2);
  });

  it("clears pending transport events and fences their retained callbacks", () => {
    const backend = new FakeSchedulerBackend();
    const trigger = vi.fn();
    const composition = createStarterComposition("pending-clear");
    composition.swing = 0;
    composition.planets[0].pattern.humanize = 0;
    const scheduler = new Scheduler(backend, trigger);
    scheduler.setComposition(composition);

    backend.currentAudioTime = 1;
    backend.tickAtTime = 0;
    [...backend.callbacks.values()][0](1);
    const retainedOneShot = [...backend.oneShots.values()][0].callback;
    expect(scheduler.pendingScheduledEventCount).toBe(3);
    const callsBeforeClear = trigger.mock.calls.length;
    expect(scheduler.currentAudioTime).toBe(1);

    scheduler.clear();
    retainedOneShot(1.5);
    expect(scheduler.scheduledRegistrationCount).toBe(0);
    expect(scheduler.pendingScheduledEventCount).toBe(0);
    expect(backend.oneShots.size).toBe(0);
    expect(trigger).toHaveBeenCalledTimes(callsBeforeClear);
    expect(scheduler.earliestFutureAdmittedAudioTime).toBeUndefined();
    expect(scheduler.futureAdmittedEventCount).toBe(0);
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

    scheduler.setComposition(composition, {
      continueFromCurrentClock: true,
    });

    expect(triggered).toHaveLength(0);
    expect(scheduler.pendingScheduledEventCount).toBeGreaterThan(0);
    for (const { callback, absoluteTick } of [...backend.oneShots.values()]) {
      const scheduledAudioTime =
        backend.currentAudioTime +
        ((absoluteTick - 600) * 60) / (composition.bpm * 480);
      callback(scheduledAudioTime);
    }
    expect(scheduler.pendingScheduledEventCount).toBe(0);

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
