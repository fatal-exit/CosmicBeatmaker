import { describe, expect, it } from "vitest";

import { createStarterComposition } from "../src/domain/composition";
import { compositionToSceneDescriptor } from "../src/scene/descriptors";
import { orbitPhaseAtTick } from "../src/scene/phase";
import { resolveQualityProfile } from "../src/scene/quality";
import { planSceneReconciliation } from "../src/scene/reconcile";

describe("scene contracts", () => {
  it("derives orbit phase from authoritative ticks", () => {
    expect(orbitPhaseAtTick(0, 384, 1)).toBe(0.5);
    expect(orbitPhaseAtTick(0.75, 384, 1)).toBe(0.25);
  });

  it("creates stable descriptors and idempotent plans", () => {
    const descriptor = compositionToSceneDescriptor(
      createStarterComposition("scene"),
    );
    expect(planSceneReconciliation(null, descriptor).add).toHaveLength(2);
    expect(planSceneReconciliation(descriptor, descriptor)).toEqual({
      add: [],
      update: [],
      remove: [],
    });
  });

  it("resolves conservative automatic mobile quality", () => {
    expect(resolveQualityProfile("auto", 390, 3)).toBe("low");
    expect(resolveQualityProfile("auto", 900, 2)).toBe("balanced");
    expect(resolveQualityProfile("high", 390, 3)).toBe("high");
  });
});
