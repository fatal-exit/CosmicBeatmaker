import { describe, expect, it } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
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
});
