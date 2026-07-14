import { Context, getTransport, setContext, start as unlockTone } from "tone";

import { AUDIO_PPQ } from "./constants";
import {
  applySchedulingProfile,
  selectAudioRuntimeProfile,
  toneContextOptionsFor,
  type AudioRuntimeProfile,
} from "./AudioRuntimeProfile";

export type TransportPlaybackState = "playing" | "paused" | "stopped";

export interface TransportAdapter {
  readonly state: "started" | "paused" | "stopped";
  ticks: number;
  ppq: number;
  bpm: number;
  start(): void;
  pause(audioTime?: number): void;
  stop(): void;
}

export type AudioUnlock = () => Promise<void>;

export interface TransportPausePosition {
  /** Raw AudioContext time, deliberately excluding scheduling lookahead. */
  audioTime: number;
  /** Fractional transport position at that same raw AudioContext time. */
  transportTick: number;
  /** Tone's scheduling frontier, including its configured lookahead. */
  schedulingAudioTime: number;
}

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

  pause(position?: TransportPausePosition): void {
    this.requireUnlocked();
    if (position) {
      if (
        !Number.isFinite(position.audioTime) ||
        !Number.isFinite(position.transportTick) ||
        !Number.isFinite(position.schedulingAudioTime) ||
        position.schedulingAudioTime < position.audioTime
      ) {
        throw new Error("A pause position must contain finite clock values.");
      }
    }
    if (this.adapter.state === "started") {
      // Tone schedules start/pause state at its lookahead frontier. Pausing at
      // raw AudioContext time can precede a just-queued start and leave that
      // start alive, so revoke it at the same scheduling frontier instead.
      this.adapter.pause(position?.schedulingAudioTime);
      // Tone's public `ticks` getter is evaluated at `now()` (including
      // lookahead). Re-anchor the paused transport to the fractional raw
      // playhead; the scheduler derives the first unsounded integer tick when
      // playback resumes, avoiding both lookahead loss and a double advance.
      if (position) {
        this.adapter.ticks = Math.max(0, position.transportTick);
      }
    }
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
    // App state updates unrelated to tempo are frequent. Avoid adding redundant
    // Tone Param work to the transport automation timeline on every update.
    if (Math.abs(this.adapter.bpm - bpm) > 0.001) this.adapter.bpm = bpm;
  }

  private requireUnlocked(): void {
    if (!this.unlocked) {
      throw new Error(
        "Audio must be unlocked by a user gesture before playback.",
      );
    }
  }
}

let installedToneContext: Context | undefined;

function ensureToneRuntimeContext(profile: AudioRuntimeProfile): Context {
  if (!installedToneContext || installedToneContext.disposed) {
    installedToneContext = new Context(toneContextOptionsFor(profile));
    // This runs before the project's first getTransport()/Tone node creation.
    // The old global is Tone's inert DummyContext in normal startup.
    setContext(installedToneContext, true);
  }
  applySchedulingProfile(installedToneContext, profile);
  return installedToneContext;
}

export function createToneTransportController(
  profile: AudioRuntimeProfile = selectAudioRuntimeProfile(),
): TransportController {
  ensureToneRuntimeContext(profile);
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
    pause(audioTime) {
      transport.pause(audioTime);
    },
    stop() {
      transport.stop();
    },
  };

  return new TransportController(adapter, unlockTone);
}
