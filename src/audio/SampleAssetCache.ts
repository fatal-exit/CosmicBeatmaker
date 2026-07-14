import { ToneAudioBuffer } from "tone";

export type SampleAssetLoadStatus = "loading" | "ready" | "failed";
export type SampleAssetLoader = (url: string) => Promise<AudioBuffer>;

/**
 * Stable handle for one first-party asset load. Handles outlive disposable
 * runtime voice generations, so a pending decode and its eventual AudioBuffer
 * are shared instead of restarted after every structural edit.
 */
export class CachedSampleAsset {
  private loadStatus: SampleAssetLoadStatus = "loading";
  private decodedBuffer: AudioBuffer | undefined;
  private loadError: unknown;
  readonly settled: Promise<void>;

  constructor(
    readonly url: string,
    load: SampleAssetLoader,
  ) {
    this.settled = Promise.resolve()
      .then(() => load(url))
      .then(
        (buffer) => {
          this.decodedBuffer = buffer;
          this.loadStatus = "ready";
        },
        (error: unknown) => {
          this.loadError = error;
          this.loadStatus = "failed";
        },
      );
  }

  get status(): SampleAssetLoadStatus {
    return this.loadStatus;
  }

  get buffer(): AudioBuffer | undefined {
    return this.decodedBuffer;
  }

  get error(): unknown {
    return this.loadError;
  }
}

/**
 * Coalesces both in-flight and completed loads by resolved URL. Production
 * callers only request URLs from the finite first-party manifest, bounding
 * fetch/decode work to one attempt per asset for the lifetime of the page.
 */
export class SampleAssetCache {
  private readonly entries = new Map<string, CachedSampleAsset>();

  constructor(private readonly load: SampleAssetLoader) {}

  get(url: string): CachedSampleAsset {
    const existing = this.entries.get(url);
    if (existing) return existing;

    const entry = new CachedSampleAsset(url, this.load);
    this.entries.set(url, entry);
    return entry;
  }

  get size(): number {
    return this.entries.size;
  }

  get loadingCount(): number {
    return this.countWithStatus("loading");
  }

  get readyCount(): number {
    return this.countWithStatus("ready");
  }

  get failedCount(): number {
    return this.countWithStatus("failed");
  }

  private countWithStatus(status: SampleAssetLoadStatus): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === status) count += 1;
    }
    return count;
  }
}

/** Shared decoded buffers are intentionally independent of voice generations. */
export const liveSampleAssetCache = new SampleAssetCache((url) =>
  ToneAudioBuffer.load(url),
);
