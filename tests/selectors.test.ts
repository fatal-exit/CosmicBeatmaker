import { describe, expect, it } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
import { selectAudiblePlanets } from "../src/state/selectors";

describe("audible planet selector", () => {
  it("respects mute and solo state", () => {
    const base = createStarterComposition("audible");
    const second = {
      ...structuredClone(base.planets[0]),
      id: "planet_second",
      name: "Second",
      soloed: true,
    };
    const composition = { ...base, planets: [base.planets[0], second] };
    expect(
      selectAudiblePlanets(composition).map((planet) => planet.id),
    ).toEqual(["planet_second"]);
  });
});
