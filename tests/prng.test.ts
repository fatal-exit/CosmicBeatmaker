import { describe, expect, it } from "vitest";

import { createSeededRandom, deriveSeed } from "../src/domain/generation/prng";

describe("seeded random", () => {
  it("repeats the same sequence for the same seed", () => {
    const first = createSeededRandom("cosmos");
    const second = createSeededRandom("cosmos");
    expect([first.next(), first.next(), first.integer(0, 100)]).toEqual([
      second.next(),
      second.next(),
      second.integer(0, 100),
    ]);
  });

  it("derives independent stable namespaces", () => {
    expect(deriveSeed("root/base", "planet", "bass/0")).toBe(
      "root%2Fbase/planet/bass%2F0",
    );
    expect(deriveSeed("a/b")).not.toBe(deriveSeed("a", "b"));
    expect(createSeededRandom("root").derive("beat").next()).not.toBe(
      createSeededRandom("root").derive("bass").next(),
    );
  });
});
