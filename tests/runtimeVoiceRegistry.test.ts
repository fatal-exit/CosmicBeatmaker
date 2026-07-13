import { describe, expect, it, vi } from "vitest";

import { RuntimeVoiceRegistry } from "../src/audio/RuntimeVoiceRegistry";
import { compileLiveSchedule } from "../src/audio/CompositionCompiler";
import { createLiveScheduleKey } from "../src/audio/LiveScheduleKey";
import { RuntimeValueGate } from "../src/audio/RuntimeValueGate";
import type { RuntimeVoice } from "../src/audio/VoiceFactory";
import type { CompiledTrack } from "../src/audio/types";
import { createStarterComposition } from "../src/domain/composition/starter";

function makeTrack(index: number, preset = "stellar-kick"): CompiledTrack {
  return {
    id: `track:${index}`,
    name: `Track ${index}`,
    role: "beat",
    sourceKind: "planet",
    soundPresetId: preset,
    level: 0.6,
    pan: 0,
    filter: 0.8,
  };
}

describe("runtime voice reconciliation", () => {
  it("does not churn the live schedule for mix or preset-only edits", () => {
    const original = createStarterComposition("schedule-key-stress");
    const expected = createLiveScheduleKey(
      original,
      compileLiveSchedule(original),
    );

    for (let revision = 0; revision < 2_000; revision += 1) {
      const edited = structuredClone(original);
      edited.mix.level = (revision % 100) / 100;
      edited.planets[0].mix.level = (revision % 80) / 100;
      edited.planets[0].soundPresetId =
        revision % 2 === 0 ? "stellar-kick" : "deep-impact";
      expect(createLiveScheduleKey(edited, compileLiveSchedule(edited))).toBe(
        expected,
      );
    }

    const tempoEdit = structuredClone(original);
    tempoEdit.bpm += 1;
    expect(
      createLiveScheduleKey(tempoEdit, compileLiveSchedule(tempoEdit)),
    ).not.toBe(expected);

    const patternEdit = structuredClone(original);
    patternEdit.planets[0].pattern.events[0].velocity = 0.123;
    expect(
      createLiveScheduleKey(patternEdit, compileLiveSchedule(patternEdit)),
    ).not.toBe(expected);
  });

  it("does not add redundant master ramps for macro-only updates", () => {
    const gate = new RuntimeValueGate(0);
    const ramp = vi.fn();
    const starter = createStarterComposition("master-ramp-stress");

    for (let revision = 0; revision < 2_000; revision += 1) {
      const composition = structuredClone(starter);
      composition.macros.density = (revision % 101) / 100;
      composition.macros.energy = ((revision * 3) % 101) / 100;
      const target = composition.mix.level * 0.72;
      if (gate.shouldApply(target)) ramp(target);
    }
    expect(ramp).toHaveBeenCalledOnce();

    gate.reset(0);
    if (gate.shouldApply(starter.mix.level * 0.72)) {
      ramp(starter.mix.level * 0.72);
    }
    expect(ramp).toHaveBeenCalledTimes(2);
  });

  it("reuses decoded/runtime voices across thousands of schedule rebuilds", () => {
    const registry = new RuntimeVoiceRegistry();
    const created: {
      voice: RuntimeVoice;
      dispose: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    }[] = [];
    const createVoice = vi.fn(() => {
      const dispose = vi.fn();
      const update = vi.fn();
      const voice: RuntimeVoice = {
        trigger: vi.fn(),
        update,
        releaseAll: vi.fn(),
        dispose,
      };
      created.push({ voice, dispose, update });
      return voice;
    });
    const tracks = Array.from({ length: 32 }, (_, index) => makeTrack(index));

    for (let rebuild = 0; rebuild < 2_000; rebuild += 1) {
      registry.reconcile(
        tracks.map((track) => ({
          ...track,
          level: (rebuild % 100) / 100,
        })),
        createVoice,
      );
      expect(registry.size).toBe(32);
    }

    expect(createVoice).toHaveBeenCalledTimes(32);
    expect(
      created.every(({ dispose }) => dispose.mock.calls.length === 0),
    ).toBe(true);
    expect(
      created.every(({ update }) => update.mock.calls.length === 1_999),
    ).toBe(true);

    const replacementTracks = tracks.map((track, index) =>
      index === 0 ? makeTrack(index, "deep-impact") : track,
    );
    registry.reconcile(replacementTracks, createVoice);
    expect(createVoice).toHaveBeenCalledTimes(33);
    expect(created[0].dispose).toHaveBeenCalledOnce();

    registry.dispose();
    registry.dispose();
    expect(registry.size).toBe(0);
    expect(
      created.every(({ dispose }) => dispose.mock.calls.length === 1),
    ).toBe(true);
  });
});
