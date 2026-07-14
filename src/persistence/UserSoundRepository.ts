import {
  USER_SOUND_SCHEMA_VERSION,
  type UserSoundRecord,
} from "../content/userSounds";

const DATABASE_NAME = "cosmic-beatmaker-user-audio";
const DATABASE_VERSION = 1;
const STORE_NAME = "sounds";
const MAX_SAMPLE_BYTES = 12 * 1024 * 1024;
const MAX_DRUM_KIT_BYTES = 24 * 1024 * 1024;
const DRUM_VOICES = new Set([
  "kick",
  "snare",
  "clap",
  "closed-hat",
  "open-hat",
  "rim",
  "perc",
]);
const SAMPLE_CATEGORIES = new Set([
  "bass",
  "crash",
  "hi-hat",
  "kick",
  "other",
  "ride",
  "rimshot",
  "snare",
  "synth",
  "tom",
]);

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("Audio-library request failed.")),
      { once: true },
    );
  });
}

function isUserSoundRecord(value: unknown): value is UserSoundRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<UserSoundRecord>;
  if (
    record.schemaVersion !== USER_SOUND_SCHEMA_VERSION ||
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.createdAt !== "string" ||
    !["beat", "bass", "chords", "melody", "texture"].includes(
      record.role ?? "",
    ) ||
    (record.kind !== "drum-kit" && record.kind !== "pitched") ||
    !Array.isArray(record.samples) ||
    record.samples.length === 0
  ) {
    return false;
  }
  const samplesValid = record.samples.every(
    (sample) =>
      sample &&
      typeof sample.assetId === "string" &&
      typeof sample.name === "string" &&
      SAMPLE_CATEGORIES.has(sample.category) &&
      sample.blob instanceof Blob &&
      sample.blob.size <= MAX_SAMPLE_BYTES &&
      Number.isFinite(sample.durationSeconds) &&
      sample.durationSeconds > 0 &&
      Number.isFinite(sample.attackSeconds) &&
      sample.attackSeconds >= 0 &&
      Number.isFinite(sample.releaseSeconds) &&
      sample.releaseSeconds >= 0,
  );
  if (!samplesValid) return false;

  if (record.kind === "pitched") {
    const sample = record.samples[0];
    return (
      record.role !== "beat" &&
      record.samples.length === 1 &&
      Number.isFinite(sample.rootMidi) &&
      (sample.rootMidi ?? -1) >= 0 &&
      (sample.rootMidi ?? 128) <= 127 &&
      sample.durationSeconds <= 12
    );
  }

  const drumVoices = record.samples.map((sample) => sample.drumVoice);
  return (
    record.role === "beat" &&
    record.samples.every(
      (sample) =>
        typeof sample.drumVoice === "string" &&
        DRUM_VOICES.has(sample.drumVoice) &&
        sample.durationSeconds <= 4,
    ) &&
    new Set(drumVoices).size === drumVoices.length &&
    record.samples.reduce((total, sample) => total + sample.blob.size, 0) <=
      MAX_DRUM_KIT_BYTES
  );
}

export class UserSoundRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) {
      return Promise.reject(
        new Error("Local sample storage is not available in this browser."),
      );
    }
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result), {
        once: true,
      });
      request.addEventListener(
        "error",
        () =>
          reject(request.error ?? new Error("Could not open local samples.")),
        { once: true },
      );
    });
    return this.databasePromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.open();
    return database.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  async list(): Promise<UserSoundRecord[]> {
    const values = await requestResult(
      (await this.store("readonly")).getAll() as IDBRequest<unknown[]>,
    );
    return values
      .filter(isUserSoundRecord)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async save(record: UserSoundRecord): Promise<void> {
    if (!isUserSoundRecord(record)) {
      throw new Error("The imported sound could not be stored safely.");
    }
    await requestResult(
      (await this.store("readwrite")).put(structuredClone(record)),
    );
  }

  async remove(id: string): Promise<void> {
    await requestResult((await this.store("readwrite")).delete(id));
  }
}
