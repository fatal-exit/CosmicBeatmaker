import { describe, expect, it, vi } from "vitest";

import {
  TransportController,
  type TransportAdapter,
} from "../src/audio/TransportController";

class FakeTransport implements TransportAdapter {
  state: "started" | "paused" | "stopped" = "stopped";
  ticks = 0;
  ppq = 192;
  bpm = 120;
  readonly pauseTimes: Array<number | undefined> = [];

  start(): void {
    this.state = "started";
  }

  pause(audioTime?: number): void {
    this.pauseTimes.push(audioTime);
    this.state = "paused";
  }

  stop(): void {
    this.state = "stopped";
  }
}

describe("transport controller", () => {
  it("requires explicit unlock and preserves position on pause", async () => {
    const adapter = new FakeTransport();
    const unlock = vi.fn(() => Promise.resolve());
    const transport = new TransportController(adapter, unlock);

    expect(adapter.ppq).toBe(480);
    expect(() => transport.play()).toThrow(/unlocked/i);
    await Promise.all([transport.unlock(), transport.unlock()]);
    expect(unlock).toHaveBeenCalledTimes(1);

    transport.play();
    adapter.ticks = 1_337;
    transport.pause();
    expect(transport.state).toBe("paused");
    expect(transport.positionTick).toBe(1_337);

    transport.play();
    expect(transport.positionTick).toBe(1_337);
  });

  it("makes stop an explicit rewind to loop zero", async () => {
    const adapter = new FakeTransport();
    const transport = new TransportController(adapter, () => Promise.resolve());
    await transport.unlock();
    transport.play();
    adapter.ticks = 7_680;

    transport.stop();

    expect(transport.state).toBe("stopped");
    expect(transport.positionTick).toBe(0);
  });

  it("pauses at the raw audio boundary instead of preserving lookahead ticks", async () => {
    const adapter = new FakeTransport();
    const transport = new TransportController(adapter, () => Promise.resolve());
    await transport.unlock();
    transport.play();
    adapter.ticks = 1_100;

    transport.pause({
      audioTime: 2,
      transportTick: 600,
      schedulingAudioTime: 2.12,
    });

    expect(adapter.pauseTimes).toEqual([2.12]);
    expect(transport.state).toBe("paused");
    expect(transport.positionTick).toBe(600);
  });

  it("cancels a just-scheduled start at Tone's scheduling frontier", async () => {
    class LookaheadTransport extends FakeTransport {
      pendingStartAt = 0;
      rawAudioTime = 0;

      override start(): void {
        this.pendingStartAt = 1.12;
        this.state = "started";
      }

      override pause(audioTime?: number): void {
        super.pause(audioTime);
        if ((audioTime ?? this.rawAudioTime) >= this.pendingStartAt) {
          this.pendingStartAt = 0;
        }
      }
    }

    const adapter = new LookaheadTransport();
    const transport = new TransportController(adapter, () => Promise.resolve());
    await transport.unlock();
    transport.play();

    transport.pause({
      audioTime: 1,
      transportTick: 480,
      schedulingAudioTime: 1.12,
    });

    expect(adapter.pauseTimes).toEqual([1.12]);
    expect(adapter.pendingStartAt).toBe(0);
    expect(adapter.ticks).toBe(480);
    expect(transport.state).toBe("paused");
  });

  it("rejects tempo values outside the MVP contract", async () => {
    const adapter = new FakeTransport();
    const transport = new TransportController(adapter, () => Promise.resolve());
    await transport.unlock();

    transport.setTempo(96);
    expect(adapter.bpm).toBe(96);
    expect(() => transport.setTempo(160)).toThrow(/70 and 140/);
  });

  it("does not rewrite the Tone tempo timeline for unrelated state updates", () => {
    let bpm = 120;
    let writes = 0;
    const adapter: TransportAdapter = {
      state: "stopped",
      ticks: 0,
      ppq: 192,
      get bpm() {
        return bpm;
      },
      set bpm(value: number) {
        writes += 1;
        bpm = value;
      },
      start() {},
      pause() {},
      stop() {},
    };
    const transport = new TransportController(adapter, () => Promise.resolve());

    transport.setTempo(120);
    transport.setTempo(120);
    transport.setTempo(121);
    transport.setTempo(121);

    expect(writes).toBe(1);
    expect(bpm).toBe(121);
  });
});
