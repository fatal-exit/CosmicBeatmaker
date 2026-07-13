import { describe, expect, it, vi } from "vitest";

import generatedManifestJson from "../public/audio/cosmic-samples/manifest.json";
import {
  createSampleWithFallbackVoice,
  type OptionalSampleVoice,
  type RuntimeVoice,
} from "../src/audio/VoiceFactory";
import {
  SAMPLE_BOUNDARY_SAFETY_SECONDS,
  planSamplePlayback,
  triggerPlannedOneShot,
} from "../src/audio/samplePlayback";
import type { ScheduledOccurrence } from "../src/audio/types";
import {
  AUDIO_SAMPLE_MANIFEST,
  resolveAudioSampleEnvelope,
  resolveAudioSampleUrl,
  SAMPLE_VOICE_PRESETS,
  SOUND_PRESETS,
} from "../src/content/soundPresets";

interface GeneratedManifest {
  schemaVersion: number;
  pack: {
    codec: string;
    sampleRate: number;
    quality: number;
  };
  samples: {
    id: string;
    url: string;
    category: string;
    durationSeconds: number;
    attackSeconds: number;
    releaseSeconds: number;
    sourceDurationSeconds: number;
    trimmedSeconds: number;
    encodedBytes: number;
    encodedPeakDb: number;
  }[];
}

const generatedManifest = generatedManifestJson as GeneratedManifest;

const occurrence: ScheduledOccurrence = {
  occurrenceId: "occurrence:test",
  eventId: "event:test",
  trackId: "track:test",
  role: "beat",
  sourceKind: "planet",
  startTick: 0,
  durationTicks: 120,
  velocity: 0.8,
  probability: 1,
  loopIndex: 0,
  midiNotes: [36],
  drumVoice: "kick",
};

describe("first-party sample pack", () => {
  it("keeps the generated web manifest aligned with playable runtime assets", () => {
    expect(generatedManifest.schemaVersion).toBe(1);
    expect(generatedManifest.pack).toMatchObject({
      codec: "Ogg Vorbis",
      sampleRate: 48_000,
      quality: 5,
    });
    expect(generatedManifest.samples.length).toBeGreaterThan(0);
    expect(AUDIO_SAMPLE_MANIFEST).toHaveLength(
      generatedManifest.samples.length,
    );

    const generatedById = new Map(
      generatedManifest.samples.map((sample) => [sample.id, sample]),
    );
    expect(generatedById.size).toBe(generatedManifest.samples.length);
    for (const runtimeAsset of AUDIO_SAMPLE_MANIFEST) {
      const generated = generatedById.get(runtimeAsset.id);
      expect(generated).toMatchObject({
        url: runtimeAsset.url,
        category: runtimeAsset.category,
        durationSeconds: runtimeAsset.durationSeconds,
        attackSeconds: runtimeAsset.attackSeconds,
        releaseSeconds: runtimeAsset.releaseSeconds,
      });
      expect(generated?.encodedBytes).toBeGreaterThan(0);
      expect(generated?.encodedPeakDb).toBeLessThan(0);
      expect(generated?.durationSeconds).toBeLessThanOrEqual(
        generated?.sourceDurationSeconds ?? 0,
      );
    }
  });

  it("maps every sound preset and every first-party sample into live playback", () => {
    const referencedSampleIds = new Set<string>();
    for (const preset of SOUND_PRESETS) {
      const definition = SAMPLE_VOICE_PRESETS[preset.id];
      expect(definition).toBeDefined();
      if (definition.kind === "drum-kit") {
        expect(preset.role).toBe("beat");
        for (const sampleId of Object.values(definition.samples)) {
          if (sampleId) referencedSampleIds.add(sampleId);
        }
      } else {
        expect(preset.role).not.toBe("beat");
        referencedSampleIds.add(definition.sampleId);
      }
    }
    expect([...referencedSampleIds].sort()).toEqual(
      AUDIO_SAMPLE_MANIFEST.map((asset) => asset.id).sort(),
    );
  });

  it("maps the six C-rooted lead variants at their authored octaves", () => {
    expect(SAMPLE_VOICE_PRESETS["signal-lead"]).toMatchObject({
      sampleId: "lead-high-long",
      rootMidi: 60,
    });
    expect(SAMPLE_VOICE_PRESETS["ice-bell"]).toMatchObject({
      sampleId: "lead-high-short",
      rootMidi: 60,
    });
    expect(SAMPLE_VOICE_PRESETS["midnight-lead"]).toMatchObject({
      sampleId: "lead-mid-long",
      rootMidi: 48,
    });
    expect(SAMPLE_VOICE_PRESETS["star-pluck"]).toMatchObject({
      sampleId: "lead-mid-short",
      rootMidi: 48,
    });
    expect(SAMPLE_VOICE_PRESETS["deep-signal"]).toMatchObject({
      sampleId: "lead-low-long",
      rootMidi: 36,
    });
    expect(SAMPLE_VOICE_PRESETS["organic-mallet"]).toMatchObject({
      sampleId: "lead-low-short",
      rootMidi: 36,
    });
  });

  it("preserves authored long and reverberant tails", () => {
    const generatedById = new Map(
      generatedManifest.samples.map((sample) => [sample.id, sample]),
    );
    const preservedTailIds = [
      "chunk-bass-long",
      "reverb-square-saw-long",
      "sub-long",
      "techno-crash",
      "techno-ride",
      "techno-rimshot",
      "techno-tom",
    ];
    for (const id of preservedTailIds) {
      expect(generatedById.get(id)?.trimmedSeconds).toBe(0);
    }
    expect(generatedById.get("techno-kick")?.trimmedSeconds).toBeGreaterThan(
      1.9,
    );
    expect(generatedById.get("techno-snare")?.trimmedSeconds).toBeGreaterThan(
      1.9,
    );
  });

  it("resolves subtle style defaults while preserving per-sample overrides", () => {
    const punchy = resolveAudioSampleEnvelope({ category: "kick" });
    const soft = resolveAudioSampleEnvelope({ category: "synth" });
    const overridden = resolveAudioSampleEnvelope({
      category: "synth",
      attackSeconds: 0.003,
      releaseSeconds: 0.045,
    });

    expect(punchy).toMatchObject({
      style: "punchy",
      attackSeconds: 0.0005,
    });
    expect(soft.style).toBe("soft");
    expect(soft.attackSeconds).toBeGreaterThan(punchy.attackSeconds);
    expect(overridden).toMatchObject({
      attackSeconds: 0.003,
      releaseSeconds: 0.045,
    });
  });

  it("keeps punchy transient attacks essentially immediate", () => {
    for (const id of [
      "techno-kick",
      "techno-snare",
      "techno-rimshot",
    ] as const) {
      expect(
        AUDIO_SAMPLE_MANIFEST.find((asset) => asset.id === id)?.attackSeconds,
      ).toBeLessThanOrEqual(0.001);
    }
  });

  it("releases every long sample once before its natural file boundary", () => {
    const longAssets = AUDIO_SAMPLE_MANIFEST.filter(
      (asset) => asset.durationSeconds >= 2,
    );
    expect(longAssets).not.toHaveLength(0);

    for (const asset of longAssets) {
      const plan = planSamplePlayback(asset, 60, 60);
      expect(plan.releaseStartSeconds).toBeDefined();
      expect(plan.releaseStartSeconds).toBeGreaterThan(0);
      expect(
        (plan.releaseStartSeconds ?? 0) + plan.releaseSeconds,
      ).toBeLessThanOrEqual(
        plan.playbackDurationSeconds - SAMPLE_BOUNDARY_SAFETY_SECONDS,
      );
      expect(plan.boundaryLimited).toBe(true);
    }
  });

  it("keeps short one-shot tails natural and caps pitched releases after transposition", () => {
    const short = AUDIO_SAMPLE_MANIFEST.find(
      (asset) => asset.id === "techno-kick",
    );
    const long = AUDIO_SAMPLE_MANIFEST.find((asset) => asset.id === "sub-long");
    expect(short).toBeDefined();
    expect(long).toBeDefined();
    if (!short || !long) return;

    expect(
      planSamplePlayback(short, 36, 36).releaseStartSeconds,
    ).toBeUndefined();

    const held = planSamplePlayback(long, 36, 48, 10);
    expect(held.playbackDurationSeconds).toBeCloseTo(long.durationSeconds / 2);
    expect((held.releaseStartSeconds ?? 0) + held.releaseSeconds).toBeLessThan(
      held.playbackDurationSeconds,
    );

    const shortNote = planSamplePlayback(long, 36, 36, 0.125);
    expect(shortNote.releaseStartSeconds).toBe(0.125);
    expect(shortNote.boundaryLimited).toBe(false);
  });

  it("selects one stop path per one-shot instead of double-stopping", () => {
    const short = AUDIO_SAMPLE_MANIFEST.find(
      (asset) => asset.id === "techno-snare",
    );
    const long = AUDIO_SAMPLE_MANIFEST.find(
      (asset) => asset.id === "techno-rimshot",
    );
    expect(short).toBeDefined();
    expect(long).toBeDefined();
    if (!short || !long) return;

    const triggerAttack = vi.fn();
    const triggerAttackRelease = vi.fn();
    const sampler = { triggerAttack, triggerAttackRelease };

    triggerPlannedOneShot(
      sampler,
      440,
      planSamplePlayback(short, 60, 60),
      1,
      0.8,
    );
    expect(triggerAttack).toHaveBeenCalledOnce();
    expect(triggerAttackRelease).not.toHaveBeenCalled();

    triggerPlannedOneShot(
      sampler,
      440,
      planSamplePlayback(long, 60, 60),
      2,
      0.8,
    );
    expect(triggerAttack).toHaveBeenCalledOnce();
    expect(triggerAttackRelease).toHaveBeenCalledOnce();
  });

  it("resolves runtime samples below the GitHub Pages repository path", () => {
    const asset = AUDIO_SAMPLE_MANIFEST[0];
    expect(asset.url.startsWith("/")).toBe(false);
    expect(resolveAudioSampleUrl(asset.url, "/CosmicBeatmaker/")).toBe(
      `/CosmicBeatmaker/${asset.url}`,
    );
  });
});

describe("sample voice fallback", () => {
  it("uses synthesis while a sample loads, then switches to the ready sample", () => {
    let ready = false;
    const sampleTrigger = vi.fn();
    const sampleDispose = vi.fn();
    const fallbackTrigger = vi.fn();
    const fallbackDispose = vi.fn();
    const sample: OptionalSampleVoice = {
      canTrigger: vi.fn(() => ready),
      trigger: sampleTrigger,
      dispose: sampleDispose,
    };
    const fallback: RuntimeVoice = {
      trigger: fallbackTrigger,
      dispose: fallbackDispose,
    };
    const voice = createSampleWithFallbackVoice(sample, fallback);

    voice.trigger(occurrence, 1, 120);
    expect(fallbackTrigger).toHaveBeenCalledOnce();
    expect(sampleTrigger).not.toHaveBeenCalled();

    ready = true;
    voice.trigger(occurrence, 2, 120);
    expect(sampleTrigger).toHaveBeenCalledOnce();
    expect(fallbackTrigger).toHaveBeenCalledOnce();
  });

  it("releases and disposes sample and fallback runtimes exactly once", () => {
    const sampleRelease = vi.fn();
    const sampleDispose = vi.fn();
    const fallbackRelease = vi.fn();
    const fallbackDispose = vi.fn();
    const sampleTrigger = vi.fn();
    const fallbackTrigger = vi.fn();
    const sample: OptionalSampleVoice = {
      canTrigger: () => true,
      trigger: sampleTrigger,
      releaseAll: sampleRelease,
      dispose: sampleDispose,
    };
    const fallback: RuntimeVoice = {
      trigger: fallbackTrigger,
      releaseAll: fallbackRelease,
      dispose: fallbackDispose,
    };
    const voice = createSampleWithFallbackVoice(sample, fallback);

    voice.dispose();
    voice.dispose();
    voice.trigger(occurrence, 3, 120);

    expect(sampleRelease).toHaveBeenCalledOnce();
    expect(fallbackRelease).toHaveBeenCalledOnce();
    expect(sampleDispose).toHaveBeenCalledOnce();
    expect(fallbackDispose).toHaveBeenCalledOnce();
    expect(sampleTrigger).not.toHaveBeenCalled();
    expect(fallbackTrigger).not.toHaveBeenCalled();
  });

  it("falls back for the failing event and disables a broken sample voice", () => {
    const sampleTrigger = vi.fn(() => {
      throw new Error("decode failed");
    });
    const sampleDispose = vi.fn();
    const fallbackTrigger = vi.fn();
    const fallbackDispose = vi.fn();
    const sample: OptionalSampleVoice = {
      canTrigger: vi.fn(() => true),
      trigger: sampleTrigger,
      dispose: sampleDispose,
    };
    const fallback: RuntimeVoice = {
      trigger: fallbackTrigger,
      dispose: fallbackDispose,
    };
    const voice = createSampleWithFallbackVoice(sample, fallback);

    voice.trigger(occurrence, 1, 120);
    voice.trigger(occurrence, 2, 120);

    expect(sampleTrigger).toHaveBeenCalledOnce();
    expect(fallbackTrigger).toHaveBeenCalledTimes(2);
    voice.dispose();
    expect(sampleDispose).toHaveBeenCalledOnce();
    expect(fallbackDispose).toHaveBeenCalledOnce();
  });
});
