import type { Composition } from "../domain/composition";
import { validateComposition } from "../domain/composition/validation";

const DATABASE_NAME = "cosmic-beatmaker";
const DATABASE_VERSION = 1;
const STORE_NAME = "compositions";

export interface CompositionSummary {
  id: string;
  name: string;
  updatedAt: string;
  seed: string;
  planetCount: number;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed.")),
      { once: true },
    );
  });
}

export class LocalCompositionRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) {
      return Promise.reject(
        new Error("Local saves are not available in this browser."),
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
        () => reject(request.error ?? new Error("Could not open local saves.")),
        { once: true },
      );
    });
    return this.databasePromise;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const database = await this.open();
    return database.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  async list(): Promise<CompositionSummary[]> {
    const values = await requestResult(
      (await this.store("readonly")).getAll() as IDBRequest<unknown[]>,
    );
    return values
      .map((value) => validateComposition(value))
      .filter((result) => result.success)
      .map(({ composition }) => ({
        id: composition.id,
        name: composition.name,
        updatedAt: composition.updatedAt,
        seed: composition.seed,
        planetCount: composition.planets.length,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async load(id: string): Promise<Composition> {
    const value = await requestResult(
      (await this.store("readonly")).get(id) as IDBRequest<unknown>,
    );
    const result = validateComposition(value);
    if (!result.success) {
      throw new Error(result.issues[0] ?? "The local composition is invalid.");
    }
    return result.composition;
  }

  async save(composition: Composition): Promise<void> {
    const result = validateComposition(composition);
    if (!result.success) {
      throw new Error(result.issues[0] ?? "The composition is invalid.");
    }
    await requestResult(
      (await this.store("readwrite")).put(structuredClone(composition)),
    );
  }

  async remove(id: string): Promise<void> {
    await requestResult((await this.store("readwrite")).delete(id));
  }
}
