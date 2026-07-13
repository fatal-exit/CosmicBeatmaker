import { createSeededRandom } from "./prng";

export function shouldTriggerEvent(
  compositionSeed: string,
  eventId: string,
  loopIndex: number,
  probability: number,
): boolean {
  if (!Number.isSafeInteger(loopIndex) || loopIndex < 0) {
    throw new Error("Probability loop index must be a non-negative integer.");
  }
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("Event probability must be between zero and one.");
  }
  if (probability === 0) return false;
  if (probability === 1) return true;

  return createSeededRandom(compositionSeed)
    .derive("probability", eventId, String(loopIndex))
    .chance(probability);
}
