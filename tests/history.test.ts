import { describe, expect, it } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
import { generateCompleteSystem } from "../src/domain/generation";
import { applyCompositionCommand } from "../src/state/commands";
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
} from "../src/state/history";

describe("composition history", () => {
  it("undoes and redoes a meaningful command", () => {
    const original = createStarterComposition("history");
    const changed = applyCompositionCommand(original, {
      type: "SetTempo",
      bpm: 122,
      timestamp: original.updatedAt,
    }).composition;
    const history = commitHistory(createHistory(original), changed);
    expect(undoHistory(history).present).toEqual(original);
    expect(redoHistory(undoHistory(history)).present).toEqual(changed);
  });

  it("restores an undoable planet deletion exactly", () => {
    const original = generateCompleteSystem("delete-history");
    const removedPlanet = original.planets[1];
    const result = applyCompositionCommand(original, {
      type: "RemovePlanet",
      planetId: removedPlanet.id,
      timestamp: original.updatedAt,
    });
    const history = commitHistory(createHistory(original), result.composition);

    expect(result.composition.planets).toHaveLength(
      original.planets.length - 1,
    );
    expect(result.composition.planets).not.toContainEqual(removedPlanet);
    expect(result.description).toBe(`${removedPlanet.name} removed`);
    expect(undoHistory(history).present).toEqual(original);
  });

  it("keeps the last remaining planet in orbit", () => {
    const original = createStarterComposition("last-planet");
    const result = applyCompositionCommand(original, {
      type: "RemovePlanet",
      planetId: original.planets[0].id,
      timestamp: original.updatedAt,
    });

    expect(result.composition).toBe(original);
    expect(result.description).toBe("Kept at least one planet in orbit");
  });
});
