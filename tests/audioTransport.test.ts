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

  start(): void {
    this.state = "started";
  }

  pause(): void {
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

  it("rejects tempo values outside the MVP contract", async () => {
    const adapter = new FakeTransport();
    const transport = new TransportController(adapter, () => Promise.resolve());
    await transport.unlock();

    transport.setTempo(96);
    expect(adapter.bpm).toBe(96);
    expect(() => transport.setTempo(160)).toThrow(/70 and 140/);
  });
});
