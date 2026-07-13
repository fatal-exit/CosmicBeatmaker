import type { StarPresetId } from "../domain/composition/types";

export interface ShowcaseSystemDefinition {
  id: string;
  name: string;
  description: string;
  seed: string;
  starPresetId: StarPresetId;
}

/** Curated deterministic entry points for demos and first exploration. */
export const SHOWCASE_SYSTEMS = [
  {
    id: "first-light",
    name: "First Light",
    description: "A bright, balanced groove with a clear melodic lift.",
    seed: "showcase-first-light-v1",
    starPresetId: "radiant",
  },
  {
    id: "ember-drift",
    name: "Ember Drift",
    description: "Warm half-time motion suspended in a wide orbit.",
    seed: "showcase-ember-drift-v1",
    starPresetId: "red-giant",
  },
  {
    id: "glass-moons",
    name: "Glass Moons",
    description: "Delicate percussion and small melodic details.",
    seed: "showcase-glass-moons-v1",
    starPresetId: "dwarf",
  },
  {
    id: "pulse-engine",
    name: "Pulse Engine",
    description: "Fast syncopation powered by a compact neutron star.",
    seed: "showcase-pulse-engine-v1",
    starPresetId: "neutron",
  },
  {
    id: "dark-matter",
    name: "Dark Matter",
    description: "Sparse, atmospheric rhythm with room between events.",
    seed: "showcase-dark-matter-v1",
    starPresetId: "void",
  },
] as const satisfies readonly ShowcaseSystemDefinition[];

export function getShowcaseSystem(
  id: string,
): ShowcaseSystemDefinition | undefined {
  return SHOWCASE_SYSTEMS.find((showcase) => showcase.id === id);
}
