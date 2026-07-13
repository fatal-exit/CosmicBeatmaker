import { deriveSeed } from "../generation/prng";

function hashText(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

export function createStableId(
  prefix: string,
  rootSeed: string,
  ...path: string[]
): string {
  return `${prefix}_${hashText(deriveSeed(rootSeed, ...path))}`;
}

export function createId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();

  if (randomId) {
    return `${prefix}_${randomId}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${hashText(String(performance.now()))}`;
}
