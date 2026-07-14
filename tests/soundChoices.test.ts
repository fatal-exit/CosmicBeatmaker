import { afterEach, describe, expect, it } from "vitest";

import { estimateSamplePitch } from "../src/audio/UserSampleAnalyzer";
import {
  clearUserSounds,
  getAudioSampleAsset,
  getSampleVoicePreset,
  getSoundPresetDefinition,
  getSoundPresetsForRole,
  registerUserSound,
  resolveAudioSampleUrl,
} from "../src/content/soundPresets";
import { generateCompleteSystem } from "../src/domain/generation";
import { applyCompositionCommand } from "../src/state/commands";

afterEach(() => clearUserSounds());

function sineWave(frequency: number, sampleRate = 48_000): Float32Array {
  return Float32Array.from({ length: sampleRate / 2 }, (_, index) =>
    Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
}

describe("accessible sound choices", () => {
  it("offers several named first-party choices for every role", () => {
    for (const role of [
      "beat",
      "bass",
      "chords",
      "melody",
      "texture",
    ] as const) {
      const presets = getSoundPresetsForRole(role);
      expect(presets.length).toBeGreaterThanOrEqual(3);
      expect(presets.every((preset) => preset.description.length > 12)).toBe(
        true,
      );
    }
  });

  it("changes only a planet voice and keeps a tonal ring on the same voice", () => {
    const composition = generateCompleteSystem("sound-command");
    const melody = composition.planets.find(
      (planet) => planet.role === "melody",
    );
    if (!melody) throw new Error("Missing melody planet.");
    const withRing = {
      ...composition,
      planets: composition.planets.map((planet) =>
        planet.id === melody.id
          ? {
              ...planet,
              ring: {
                id: "ring_sound_test",
                type: "delay" as const,
                segments: 8 as const,
                active: [true, false, true, false, true, false, true, false],
                phase: 0,
                velocityVariation: 0.1,
                probability: 1,
                soundPresetId: planet.soundPresetId,
                level: 0.25,
              },
            }
          : planet,
      ),
    };

    const result = applyCompositionCommand(withRing, {
      type: "SetPlanetSoundPreset",
      planetId: melody.id,
      soundPresetId: "deep-signal",
      timestamp: withRing.updatedAt,
    }).composition;
    const changed = result.planets.find((planet) => planet.id === melody.id);

    expect(changed?.soundPresetId).toBe("deep-signal");
    expect(changed?.ring?.soundPresetId).toBe("deep-signal");
    expect(changed?.pattern).toEqual(melody.pattern);
    expect(changed?.orbit).toEqual(melody.orbit);
  });
});

describe("user sound runtime registry", () => {
  it("registers a local pitched sound beside the built-in palette", () => {
    registerUserSound({
      preset: {
        id: "user-sound_test",
        name: "My C tone",
        role: "melody",
        description: "A local analysed sound.",
        source: "user",
      },
      voice: {
        kind: "pitched",
        sampleId: "user-sample_test",
        rootMidi: 60,
      },
      assets: [
        {
          id: "user-sample_test",
          name: "Tone",
          category: "synth",
          url: "data:audio/wav;base64,AAAA",
          durationSeconds: 0.5,
          attackSeconds: 0.004,
          releaseSeconds: 0.05,
          rootMidi: 60,
        },
      ],
    });

    expect(getSoundPresetDefinition("user-sound_test")?.source).toBe("user");
    expect(
      getSoundPresetsForRole("melody").some(
        (preset) => preset.id === "user-sound_test",
      ),
    ).toBe(true);
    expect(getSampleVoicePreset("user-sound_test")).toEqual({
      kind: "pitched",
      sampleId: "user-sample_test",
      rootMidi: 60,
    });
    expect(getAudioSampleAsset("user-sample_test").rootMidi).toBe(60);
    expect(resolveAudioSampleUrl("data:audio/wav;base64,AAAA", "/app/")).toBe(
      "data:audio/wav;base64,AAAA",
    );
  });

  it("supports a partial local drum kit with synth fallback slots", () => {
    registerUserSound({
      preset: {
        id: "user-sound_drums",
        name: "My kick kit",
        role: "beat",
        description: "A local kit with one custom slot.",
        source: "user",
      },
      voice: {
        kind: "drum-kit",
        samples: { kick: "user-sample_kick" },
      },
      assets: [
        {
          id: "user-sample_kick",
          name: "Kick",
          category: "kick",
          url: "data:audio/wav;base64,AAAA",
          durationSeconds: 0.25,
          attackSeconds: 0,
          releaseSeconds: 0.03,
        },
      ],
    });

    expect(getSampleVoicePreset("user-sound_drums")).toEqual({
      kind: "drum-kit",
      samples: { kick: "user-sample_kick" },
    });
    expect(
      getSoundPresetsForRole("beat").some(
        (preset) => preset.id === "user-sound_drums",
      ),
    ).toBe(true);
  });
});

describe("sample pitch analysis", () => {
  it("detects C4 and a low A closely enough for safe transposition", () => {
    const c4 = estimateSamplePitch(sineWave(261.6256), 48_000);
    const a2 = estimateSamplePitch(sineWave(110), 48_000, {
      minFrequency: 32,
      maxFrequency: 520,
    });

    expect(c4?.rootMidi).toBe(60);
    expect(c4?.frequency).toBeCloseTo(261.6256, 0);
    expect(a2?.rootMidi).toBe(45);
    expect(a2?.frequency).toBeCloseTo(110, 0);
  });

  it("does not claim a pitch for silence", () => {
    expect(
      estimateSamplePitch(new Float32Array(8_192), 48_000),
    ).toBeUndefined();
  });
});
