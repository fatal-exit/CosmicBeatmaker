import { createSeededRandom } from "../domain/generation/prng";

/** Shared deterministic decision used by live playback and both exporters. */
export function shouldPlayProbability(
  compositionSeed: string,
  eventId: string,
  loopIndex: number,
  probability: number,
): boolean {
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  return createSeededRandom(compositionSeed)
    .derive("probability", eventId, String(loopIndex))
    .chance(probability);
}
