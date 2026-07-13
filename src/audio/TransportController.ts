import { getTransport, start as unlockTone } from "tone";

import { AUDIO_PPQ } from "./constants";

export type TransportPlaybackState = "playing" | "paused" | "stopped";

export interface TransportAdapter {
  readonly state: "started" | "paused" | "stopped";
  ticks: number;
  ppq: number;
  bpm: number;
  start(): void;
  pause(): void;
  stop(): void;
}

export type AudioUnlock = () => Promise<void>;

/** Explicit user-gesture and play/pause/stop contract, independently testable. */
export class TransportController {
  private unlocked = false;
  private unlockPromise?: Promise<void>;

  constructor(
    private readonly adapter: TransportAdapter,
    private readonly unlockAudio: AudioUnlock,
  ) {
    this.adapter.ppq = AUDIO_PPQ;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  get state(): TransportPlaybackState {
    if (this.adapter.state === "started") return "playing";
    return this.adapter.state;
  }

  get positionTick(): number {
    return Math.max(0, Math.round(this.adapter.ticks));
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    if (!this.unlockPromise) {
      this.unlockPromise = this.unlockAudio().then(() => {
        this.unlocked = true;
      });
    }
    try {
      await this.unlockPromise;
    } catch (error) {
      this.unlockPromise = undefined;
      throw error;
    }
  }

  play(): void {
    this.requireUnlocked();
    if (this.adapter.state !== "started") this.adapter.start();
  }

  pause(): void {
    this.requireUnlocked();
    if (this.adapter.state === "started") this.adapter.pause();
  }

  /** Stop is distinct from pause and always rewinds probability to loop zero. */
  stop(): void {
    this.requireUnlocked();
    this.adapter.stop();
    this.adapter.ticks = 0;
  }

  setTempo(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm < 70 || bpm > 140) {
      throw new Error("Tempo must be between 70 and 140 BPM.");
    }
    this.adapter.bpm = bpm;
  }

  private requireUnlocked(): void {
    if (!this.unlocked) {
      throw new Error(
        "Audio must be unlocked by a user gesture before playback.",
      );
    }
  }
}

export function createToneTransportController(): TransportController {
  const transport = getTransport();
  transport.loop = false;
  transport.swing = 0;

  const adapter: TransportAdapter = {
    get state() {
      return transport.state;
    },
    get ticks() {
      return transport.ticks;
    },
    set ticks(value) {
      transport.ticks = value;
    },
    get ppq() {
      return transport.PPQ;
    },
    set ppq(value) {
      transport.PPQ = value;
    },
    get bpm() {
      return transport.bpm.value;
    },
    set bpm(value) {
      transport.bpm.value = value;
    },
    start() {
      transport.start();
    },
    pause() {
      transport.pause();
    },
    stop() {
      transport.stop();
    },
  };

  return new TransportController(adapter, unlockTone);
}
