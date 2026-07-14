import type { DrumVoiceId, PlanetRole } from "../domain/composition/types";
import {
  registerUserSound,
  type AudioSampleAssetDefinition,
  type AudioSampleCategory,
  type SampleVoiceDefinition,
  type UserSoundRegistration,
} from "./soundPresets";

export const USER_SOUND_SCHEMA_VERSION = 1 as const;

export interface UserSoundSampleRecord {
  assetId: string;
  name: string;
  category: AudioSampleCategory;
  blob: Blob;
  durationSeconds: number;
  attackSeconds: number;
  releaseSeconds: number;
  rootMidi?: number;
  drumVoice?: DrumVoiceId;
}

export interface UserSoundRecord {
  schemaVersion: typeof USER_SOUND_SCHEMA_VERSION;
  id: string;
  name: string;
  role: PlanetRole;
  kind: "drum-kit" | "pitched";
  createdAt: string;
  samples: UserSoundSampleRecord[];
}

function createRegistration(record: UserSoundRecord): UserSoundRegistration {
  const assets: AudioSampleAssetDefinition[] = record.samples.map((sample) => ({
    id: sample.assetId,
    name: sample.name,
    category: sample.category,
    url: URL.createObjectURL(sample.blob),
    durationSeconds: sample.durationSeconds,
    attackSeconds: sample.attackSeconds,
    releaseSeconds: sample.releaseSeconds,
    ...(sample.rootMidi === undefined ? {} : { rootMidi: sample.rootMidi }),
  }));

  let voice: SampleVoiceDefinition;
  if (record.kind === "drum-kit") {
    voice = {
      kind: "drum-kit",
      samples: Object.fromEntries(
        record.samples.flatMap((sample) =>
          sample.drumVoice ? [[sample.drumVoice, sample.assetId]] : [],
        ),
      ),
    };
  } else {
    const sample = record.samples[0];
    if (!sample || sample.rootMidi === undefined) {
      throw new Error(
        "A pitched user sound needs one sample and a source note.",
      );
    }
    voice = {
      kind: "pitched",
      sampleId: sample.assetId,
      rootMidi: sample.rootMidi,
    };
  }

  return {
    preset: {
      id: record.id,
      name: record.name,
      role: record.role,
      description:
        record.kind === "drum-kit"
          ? `Your local kit with ${record.samples.length} custom ${record.samples.length === 1 ? "slot" : "slots"}.`
          : "Your local sample, tuned from its confirmed source note.",
      source: "user",
    },
    voice,
    assets,
  };
}

export function registerUserSoundRecord(record: UserSoundRecord): void {
  registerUserSound(createRegistration(record));
}
