const UINT32_RANGE = 0x1_0000_0000;

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function deriveSeed(rootSeed: string, ...namespaces: string[]): string {
  return [rootSeed, ...namespaces]
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export interface SeededRandom {
  readonly seed: string;
  next(): number;
  integer(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
  pick<T>(values: readonly T[]): T;
  derive(...namespaces: string[]): SeededRandom;
}

export function createSeededRandom(seed: string): SeededRandom {
  if (seed.length === 0) {
    throw new Error("A deterministic seed cannot be empty.");
  }

  let state = hashSeed(seed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };

  return {
    seed,
    next,
    integer(minInclusive, maxExclusive) {
      if (
        !Number.isSafeInteger(minInclusive) ||
        !Number.isSafeInteger(maxExclusive)
      ) {
        throw new Error("Random integer bounds must be integers.");
      }
      if (maxExclusive <= minInclusive) {
        throw new Error(
          "The exclusive upper bound must be greater than the lower bound.",
        );
      }
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    chance(probability) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new Error("Probability must be between zero and one.");
      }
      return next() < probability;
    },
    pick<T>(values: readonly T[]) {
      if (values.length === 0) {
        throw new Error("Cannot pick from an empty collection.");
      }
      return values[this.integer(0, values.length)];
    },
    derive(...namespaces) {
      return createSeededRandom(deriveSeed(seed, ...namespaces));
    },
  };
}
