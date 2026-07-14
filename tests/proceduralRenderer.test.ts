import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  promoteCompleteBuild,
  validateCompleteSampleBuild,
  validatePackAssetIdentity,
} from "../scripts/build-samples.mjs";
import {
  applySpaceReverb,
  validateEncodedContract,
  validateLevelStats,
  validatePreviousProceduralEntry,
  validateRenderedChannels,
} from "../scripts/render-procedural-samples.mjs";

describe("procedural sample renderer validation", () => {
  it("accepts the complete staged-pack contract", () => {
    expect(() =>
      validateCompleteSampleBuild(
        "public/audio/cosmic-samples",
        "src/content/generatedProceduralSampleAssets.ts",
      ),
    ).not.toThrow();
  });

  it("rejects traversal and malformed IDs before building pack paths", () => {
    const valid = {
      id: "safe-asset",
      url: "audio/cosmic-samples/safe-asset.ogg",
    };
    expect(validatePackAssetIdentity(valid)).toBe("safe-asset");
    for (const invalid of [
      { ...valid, id: "../manifest" },
      { ...valid, id: "nested/path" },
      { ...valid, url: "audio/cosmic-samples/../manifest.json" },
    ]) {
      expect(() => validatePackAssetIdentity(invalid)).toThrow(/invalid ID/);
    }
  });

  it("restores the previous complete pack when promotion fails", () => {
    const root = mkdtempSync(join(tmpdir(), "cosmic-pack-rollback-"));
    const packOutput = join(root, "live-pack");
    const runtimeAssetsOutput = join(root, "live-runtime.ts");
    const stagedPack = join(root, "staged-pack");
    const stagedRuntimeAssets = join(root, "staged-runtime.ts");
    const buildDirectory = join(root, "transaction");
    mkdirSync(packOutput);
    mkdirSync(stagedPack);
    mkdirSync(buildDirectory);
    writeFileSync(join(packOutput, "old.ogg"), "old-pack");
    writeFileSync(runtimeAssetsOutput, "old-runtime");
    writeFileSync(join(stagedPack, "new.ogg"), "new-pack");
    writeFileSync(stagedRuntimeAssets, "new-runtime");

    try {
      expect(() =>
        promoteCompleteBuild(stagedPack, stagedRuntimeAssets, buildDirectory, {
          packOutput,
          runtimeAssetsOutput,
          failAt(stage) {
            if (stage === "after-runtime-promotion") {
              throw new Error("injected failure");
            }
          },
        }),
      ).toThrow(/injected failure/);
      expect(readFileSync(join(packOutput, "old.ogg"), "utf8")).toBe(
        "old-pack",
      );
      expect(readFileSync(runtimeAssetsOutput, "utf8")).toBe("old-runtime");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts finite audible PCM and level statistics", () => {
    expect(
      validateRenderedChannels("valid", [new Float32Array([0.1, -0.1, 0.05])]),
    ).toBeGreaterThan(0);
    expect(() =>
      validateLevelStats("valid", "encoded", {
        peakDb: -3,
        meanDb: -18,
      }),
    ).not.toThrow();
  });

  it("turns a legacy-dry mono impulse into a bounded decorrelated stereo tail", () => {
    const dry = new Float32Array(4_800);
    dry[0] = 0.7;
    const rendered = applySpaceReverb([dry], {
      preDelaySeconds: 0.018,
      tailSeconds: 0.4,
      roomSize: 0.72,
      damping: 0.3,
      dryGain: 1,
      wetGain: 0.65,
      inputGain: 0.32,
    });

    expect(rendered.channels).toHaveLength(2);
    expect(rendered.channels[0]).toHaveLength(24_000);
    expect(rendered.durationSeconds).toBe(0.5);
    const lateLeft = rendered.channels[0].slice(dry.length);
    const lateRight = rendered.channels[1].slice(dry.length);
    expect(lateLeft.some((sample) => Math.abs(sample) > 1e-5)).toBe(true);
    expect(lateRight.some((sample) => Math.abs(sample) > 1e-5)).toBe(true);
    expect(Array.from(lateLeft)).not.toEqual(Array.from(lateRight));
    for (const channel of rendered.channels) {
      expect(
        Math.max(...channel.map((sample) => Math.abs(sample))),
      ).toBeLessThanOrEqual(0.68);
    }
  });

  it("rejects non-finite PCM and silent renders", () => {
    expect(() =>
      validateRenderedChannels("nan", [new Float32Array([0, Number.NaN])]),
    ).toThrow(/non-finite PCM/);
    expect(() =>
      validateRenderedChannels("silent", [new Float32Array([0, 0, 0])]),
    ).toThrow(/silence below the RMS/);
  });

  it("rejects missing, infinite, and inaudible level statistics", () => {
    for (const levels of [
      { peakDb: null, meanDb: -18 },
      { peakDb: Number.NEGATIVE_INFINITY, meanDb: -18 },
      { peakDb: -6, meanDb: Number.NaN },
      { peakDb: -110, meanDb: -120 },
    ]) {
      expect(() => validateLevelStats("invalid", "encoded", levels)).toThrow();
    }
  });

  it("rejects encoded duration, format, and size drift", () => {
    const validProbe = {
      codec: "vorbis",
      sampleRate: 48_000,
      channels: 2,
      durationSeconds: 1.5,
    };
    expect(() =>
      validateEncodedContract("valid", 1.5, 2, validProbe, 32_000),
    ).not.toThrow();
    expect(() =>
      validateEncodedContract(
        "duration",
        1.5,
        2,
        { ...validProbe, durationSeconds: 1.51 },
        32_000,
      ),
    ).toThrow(/duration contract/);
    expect(() =>
      validateEncodedContract(
        "format",
        1.5,
        2,
        { ...validProbe, channels: 1 },
        32_000,
      ),
    ).toThrow(/format contract/);
    expect(() =>
      validateEncodedContract("size", 1.5, 2, validProbe, 1_000_000),
    ).toThrow(/size contract/);
  });

  it("accepts only canonical procedural manifest paths", () => {
    const valid = {
      id: "old-render-c4",
      sourceKind: "procedural",
      sourceFile: "procedural:old-render-c4",
      url: "audio/cosmic-samples/old-render-c4.ogg",
    };
    expect(validatePreviousProceduralEntry(valid)).toBe("old-render-c4");
    for (const invalid of [
      { ...valid, id: "../manifest" },
      { ...valid, url: "audio/cosmic-samples/../manifest.json" },
      { ...valid, sourceFile: "procedural:someone-else" },
      { ...valid, sourceKind: "authored" },
    ]) {
      expect(() => validatePreviousProceduralEntry(invalid)).toThrow(/unsafe/);
    }
  });
});
