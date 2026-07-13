import { describe, expect, it } from "vitest";

import {
  AudioHealthGuard,
  ScheduledVoiceBudget,
  type AudioHealthLimits,
} from "../src/audio/AudioHealth";
import {
  AUDIO_OUTPUT_SAFETY,
  AUDIO_RUNTIME_PROFILES,
  applySchedulingProfile,
  classifyAudioDevice,
  toneContextOptionsFor,
} from "../src/audio/AudioRuntimeProfile";

const stressLimits: AudioHealthLimits = {
  maxEventLatenessSeconds: 0.08,
  maxConsecutiveLateCallbacks: 16,
  callbackBurstWindowSeconds: 0.05,
  maxCallbacksPerBurstWindow: 128,
  maxOccurrenceLedgerEntries: 256,
  maxConsecutiveTriggerErrors: 4,
};

describe("audio runtime profiles", () => {
  it("keeps fixed master headroom in front of a brick-wall limiter", () => {
    expect(AUDIO_OUTPUT_SAFETY).toEqual({
      masterHeadroom: 0.72,
      limiterThresholdDb: -3,
      emergencyFadeSeconds: 0.015,
    });
  });

  it("selects a larger conservative scheduling buffer for touch-first mobile", () => {
    expect(
      classifyAudioDevice({
        userAgent: "Mozilla/5.0 (iPhone)",
        maxTouchPoints: 5,
        coarsePointer: true,
      }),
    ).toBe("mobile");
    expect(
      classifyAudioDevice({
        userAgent: "Mozilla/5.0 (Macintosh)",
        maxTouchPoints: 0,
        coarsePointer: false,
      }),
    ).toBe("desktop");
    expect(AUDIO_RUNTIME_PROFILES.mobile.lookAheadSeconds).toBe(0.18);
    expect(AUDIO_RUNTIME_PROFILES.mobile.updateIntervalSeconds).toBe(0.045);
    expect(AUDIO_RUNTIME_PROFILES.desktop.lookAheadSeconds).toBe(0.12);
    expect(AUDIO_RUNTIME_PROFILES.desktop.updateIntervalSeconds).toBe(0.03);
  });

  it("passes latencyHint at context creation and applies cadence after lookahead", () => {
    const assignments: string[] = [];
    let lookAhead = 0;
    let updateInterval = 0;
    const context = {
      get lookAhead() {
        return lookAhead;
      },
      set lookAhead(value: number) {
        assignments.push(`lookAhead:${value}`);
        lookAhead = value;
      },
      get updateInterval() {
        return updateInterval;
      },
      set updateInterval(value: number) {
        assignments.push(`updateInterval:${value}`);
        updateInterval = value;
      },
    };

    const profile = AUDIO_RUNTIME_PROFILES.mobile;
    expect(toneContextOptionsFor(profile)).toEqual({
      latencyHint: "balanced",
      lookAhead: 0.18,
      updateInterval: 0.045,
      clockSource: "worker",
    });
    applySchedulingProfile(context, profile);
    expect(assignments).toEqual(["lookAhead:0.18", "updateInterval:0.045"]);
  });
});

describe("audio callback health", () => {
  it("drops a late catch-up burst before it can sound and trips at a fixed bound", () => {
    const guard = new AudioHealthGuard(stressLimits);
    for (let index = 0; index < 15; index += 1) {
      expect(
        guard.inspect({
          occurrenceKey: `event:${index}`,
          repeatIndex: 4,
          scheduledAudioTime: 10 + index * 0.001,
          currentAudioTime: 12,
        }).status,
      ).toBe("late");
    }
    const trip = guard.inspect({
      occurrenceKey: "event:15",
      repeatIndex: 4,
      scheduledAudioTime: 10.015,
      currentAudioTime: 12,
    });
    expect(trip).toMatchObject({
      status: "tripped",
      failure: { reason: "late-callback-backlog" },
    });
    expect(guard.snapshot).toMatchObject({
      occurrenceLedgerSize: 0,
      tripped: true,
    });
  });

  it("keeps exactly-once occurrence state bounded over accelerated long play", () => {
    const guard = new AudioHealthGuard(stressLimits);
    const occurrencesPerLoop = 64;
    for (let loopIndex = 0; loopIndex < 500; loopIndex += 1) {
      for (
        let occurrence = 0;
        occurrence < occurrencesPerLoop;
        occurrence += 1
      ) {
        const scheduledAudioTime = loopIndex * 8 + occurrence * 0.08;
        const candidate = {
          occurrenceKey: `event:${occurrence}`,
          repeatIndex: loopIndex,
          scheduledAudioTime,
          currentAudioTime: scheduledAudioTime - 0.03,
        };
        expect(guard.inspect(candidate).status).toBe("accepted");
        expect(guard.inspect(candidate).status).toBe("duplicate");
      }
    }
    expect(guard.snapshot).toMatchObject({
      occurrenceLedgerSize: occurrencesPerLoop,
      tripped: false,
    });
  });

  it("trips after repeated voice failures instead of throwing forever", () => {
    const guard = new AudioHealthGuard(stressLimits);
    expect(guard.recordTriggerError(1, 1)).toBeUndefined();
    expect(guard.recordTriggerError(2, 2)).toBeUndefined();
    expect(guard.recordTriggerError(3, 3)).toBeUndefined();
    expect(guard.recordTriggerError(4, 4)).toMatchObject({
      reason: "voice-trigger-errors",
    });
  });
});

describe("scheduled sampler voice budget", () => {
  it("bounds overlapping sources and reclaims completed slots deterministically", () => {
    const budget = new ScheduledVoiceBudget(4);
    expect(budget.admit(1, [2, 2, 3, 4, 5])).toHaveLength(4);
    expect(budget.activeCount).toBe(4);
    expect(budget.admit(1.5, [6, 7])).toHaveLength(0);
    expect(budget.admit(2, [6, 7])).toHaveLength(2);
    expect(budget.activeCount).toBe(4);

    for (let time = 8; time < 10_000; time += 1) {
      budget.admit(time, [time + 10, time + 10]);
      expect(budget.activeCount).toBeLessThanOrEqual(4);
    }
    budget.clear();
    expect(budget.activeCount).toBe(0);
  });
});
