import { describe, expect, it } from "vitest";

import { encodePcm16Wav } from "../src/audio/WavEncoder";

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

describe("PCM16 WAV encoder", () => {
  it("writes a stereo header whose data length represents the exact duration", () => {
    const sampleRate = 8_000;
    const frameCount = 800;
    const left = new Float32Array(frameCount).fill(0.5);
    const right = new Float32Array(frameCount).fill(-0.5);
    const wav = encodePcm16Wav({ sampleRate, channels: [left, right] });
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(frameCount * 2 * 2);
    expect(view.getUint32(40, true) / (sampleRate * 2 * 2)).toBe(0.1);
    expect(wav.byteLength).toBe(44 + frameCount * 2 * 2);
  });

  it("rejects mismatched channel lengths", () => {
    expect(() =>
      encodePcm16Wav({
        sampleRate: 44_100,
        channels: [new Float32Array(4), new Float32Array(3)],
      }),
    ).toThrow(/same frame count/);
  });
});
