import type { SceneDescriptor } from "./contracts";

export interface ReconciliationPlan {
  add: string[];
  update: string[];
  remove: string[];
}

function signatures(descriptor: SceneDescriptor): Map<string, string> {
  const result = new Map<string, string>();
  result.set(descriptor.star.id, JSON.stringify(descriptor.star));
  for (const planet of descriptor.planets) {
    result.set(planet.id, JSON.stringify(planet));
  }
  if (descriptor.asteroidBelt) {
    result.set(
      descriptor.asteroidBelt.id,
      JSON.stringify(descriptor.asteroidBelt),
    );
  }
  return result;
}

export function planSceneReconciliation(
  previous: SceneDescriptor | null,
  next: SceneDescriptor,
): ReconciliationPlan {
  const oldSignatures = previous
    ? signatures(previous)
    : new Map<string, string>();
  const nextSignatures = signatures(next);
  const add: string[] = [];
  const update: string[] = [];
  const remove: string[] = [];

  for (const [id, signature] of nextSignatures) {
    const prior = oldSignatures.get(id);
    if (prior === undefined) add.push(id);
    else if (prior !== signature) update.push(id);
  }
  for (const id of oldSignatures.keys()) {
    if (!nextSignatures.has(id)) remove.push(id);
  }
  return { add, update, remove };
}
