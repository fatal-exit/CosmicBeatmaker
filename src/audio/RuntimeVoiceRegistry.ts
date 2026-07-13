import type { CompiledTrack, ScheduledOccurrence } from "./types";
import type { RuntimeVoice } from "./VoiceFactory";

export type RuntimeVoiceFactory = (track: CompiledTrack) => RuntimeVoice;

interface RuntimeVoiceEntry {
  readonly compatibilityKey: string;
  readonly parameterKey: string;
  readonly voice: RuntimeVoice;
}

function compatibilityKey(track: CompiledTrack): string {
  return `${track.role}:${track.soundPresetId}`;
}

function parameterKey(track: CompiledTrack): string {
  return `${track.level}:${track.pan}:${track.filter}`;
}

/**
 * Stable-ID reconciliation keeps loaded Samplers, decoded buffers, and synth
 * nodes alive across pattern/mix edits. Only a role/preset replacement creates
 * a new runtime voice.
 */
export class RuntimeVoiceRegistry {
  private entries = new Map<string, RuntimeVoiceEntry>();
  private disposed = false;

  reconcile(
    tracks: readonly CompiledTrack[],
    createVoice: RuntimeVoiceFactory,
  ): void {
    if (this.disposed)
      throw new Error("A disposed voice registry cannot be reused.");
    const previous = new Map(this.entries);
    const next = new Map<string, RuntimeVoiceEntry>();

    for (const track of tracks) {
      const existing = previous.get(track.id);
      const key = compatibilityKey(track);
      if (existing?.compatibilityKey === key) {
        const nextParameterKey = parameterKey(track);
        if (existing.parameterKey !== nextParameterKey) {
          existing.voice.update?.(track);
        }
        next.set(track.id, {
          ...existing,
          parameterKey: nextParameterKey,
        });
        previous.delete(track.id);
        continue;
      }
      if (existing) {
        existing.voice.dispose();
        previous.delete(track.id);
      }
      next.set(track.id, {
        compatibilityKey: key,
        parameterKey: parameterKey(track),
        voice: createVoice(track),
      });
    }

    for (const entry of previous.values()) entry.voice.dispose();
    this.entries = next;
  }

  trigger(
    occurrence: ScheduledOccurrence,
    scheduledAudioTime: number,
    bpm: number,
  ): void {
    if (this.disposed) return;
    this.entries
      .get(occurrence.trackId)
      ?.voice.trigger(occurrence, scheduledAudioTime, bpm);
  }

  releaseAll(scheduledAudioTime?: number): void {
    if (this.disposed) return;
    for (const entry of this.entries.values()) {
      entry.voice.releaseAll?.(scheduledAudioTime);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.releaseAll();
    this.disposed = true;
    for (const entry of this.entries.values()) entry.voice.dispose();
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
