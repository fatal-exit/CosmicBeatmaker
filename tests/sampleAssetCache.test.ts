import { describe, expect, it, vi } from "vitest";

import { SampleAssetCache } from "../src/audio/SampleAssetCache";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("sample asset cache", () => {
  it("bounds thousands of rapid generation requests to one load per asset", async () => {
    const kickUrl = "/audio/kick.ogg";
    const padUrl = "/audio/pad.ogg";
    const failedUrl = "/audio/missing.ogg";
    const kickLoad = deferred<AudioBuffer>();
    const padLoad = deferred<AudioBuffer>();
    const failedLoad = deferred<AudioBuffer>();
    const loadsByUrl = new Map<string, Deferred<AudioBuffer>>([
      [kickUrl, kickLoad],
      [padUrl, padLoad],
      [failedUrl, failedLoad],
    ]);
    const loader = vi.fn((url: string): Promise<AudioBuffer> => {
      const load = loadsByUrl.get(url);
      if (!load) throw new Error(`Unexpected sample URL: ${url}`);
      return load.promise;
    });
    const cache = new SampleAssetCache(loader);
    const urls = [kickUrl, padUrl, failedUrl] as const;

    const loadingGenerationHandles = Array.from(
      { length: 3_000 },
      (_, revision) => cache.get(urls[revision % urls.length]),
    );
    await Promise.resolve();

    expect(new Set(loadingGenerationHandles)).toHaveLength(urls.length);
    expect(loader).toHaveBeenCalledTimes(urls.length);
    expect(loader.mock.calls.map(([url]) => url).sort()).toEqual(
      [...urls].sort(),
    );
    expect(cache.size).toBe(urls.length);
    expect(cache.loadingCount).toBe(urls.length);

    const kickBuffer = {} as AudioBuffer;
    const padBuffer = {} as AudioBuffer;
    kickLoad.resolve(kickBuffer);
    padLoad.resolve(padBuffer);
    failedLoad.reject(new Error("decode failed"));
    await Promise.all(urls.map((url) => cache.get(url).settled));

    expect(cache.loadingCount).toBe(0);
    expect(cache.readyCount).toBe(2);
    expect(cache.failedCount).toBe(1);
    expect(cache.get(kickUrl).buffer).toBe(kickBuffer);
    expect(cache.get(padUrl).buffer).toBe(padBuffer);
    expect(cache.get(failedUrl).status).toBe("failed");

    const laterGenerationHandles = Array.from(
      { length: 3_000 },
      (_, revision) => cache.get(urls[revision % urls.length]),
    );
    await Promise.resolve();

    expect(new Set(laterGenerationHandles)).toHaveLength(urls.length);
    expect(loader).toHaveBeenCalledTimes(urls.length);
    expect(cache.size).toBe(urls.length);
  });
});
