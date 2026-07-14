#!/usr/bin/env node

/**
 * Assemble the complete authored + procedural sample pack away from `public/`,
 * validate the complete asset contract, then promote the pack and runtime inventory
 * together with rollback on any failure.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const PACK_OUTPUT = join(REPOSITORY_ROOT, "public/audio/cosmic-samples");
const RUNTIME_ASSETS_OUTPUT = join(
  REPOSITORY_ROOT,
  "src/content/generatedProceduralSampleAssets.ts",
);
const AUTHORED_PROCESSOR = join(SCRIPT_DIR, "process-samples.mjs");
const PROCEDURAL_RENDERER = join(SCRIPT_DIR, "render-procedural-samples.mjs");
const EXPECTED_PROCEDURAL_ASSETS = 41;
const EXPECTED_SPATIALIZED_ASSETS = 30;
const SAFE_ASSET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function runNode(script, arguments_) {
  const result = spawnSync(process.execPath, [script, ...arguments_], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${script} failed${detail ? `:\n${detail}` : " without output."}`,
    );
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

export function validatePackAssetIdentity(sample) {
  if (
    typeof sample?.id !== "string" ||
    !SAFE_ASSET_ID.test(sample.id) ||
    sample.url !== `audio/cosmic-samples/${sample.id}.ogg`
  ) {
    throw new Error("Staged sample pack contains an invalid ID or URL.");
  }
  return sample.id;
}

export function validateCompleteSampleBuild(packDirectory, runtimeAssetsPath) {
  const manifestPath = join(packDirectory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.samples)) {
    throw new Error("Staged sample manifest has an unsupported schema.");
  }
  const authored = manifest.samples.filter(
    (sample) => sample.sourceKind !== "procedural",
  );
  const procedural = manifest.samples.filter(
    (sample) => sample.sourceKind === "procedural",
  );
  if (
    authored.length === 0 ||
    procedural.length !== EXPECTED_PROCEDURAL_ASSETS
  ) {
    throw new Error(
      "Staged sample pack needs authored assets plus exactly 41 procedural assets.",
    );
  }
  const spatialized = procedural.filter(
    (sample) => sample.processing?.effect === "space reverb",
  );
  if (spatialized.length !== EXPECTED_SPATIALIZED_ASSETS) {
    throw new Error(
      "Staged sample pack needs exactly 30 spatialized procedural assets.",
    );
  }
  const legacyDryIds = new Set();
  for (const sample of spatialized) {
    const processing = sample.processing;
    if (
      processing?.sourceVariant !== "legacy dry" ||
      processing.legacyDryAssetPackaged !== false ||
      typeof processing.legacyDryId !== "string" ||
      !SAFE_ASSET_ID.test(processing.legacyDryId) ||
      typeof processing.legacyDryName !== "string" ||
      !processing.legacyDryName.startsWith("Legacy Dry ") ||
      sample.id === processing.legacyDryId
    ) {
      throw new Error(
        `Spatialized sample has an invalid legacy-dry contract: ${sample.id}.`,
      );
    }
    legacyDryIds.add(processing.legacyDryId);
  }

  const ids = new Set();
  const expectedFiles = new Set(["manifest.json"]);
  for (const sample of manifest.samples) {
    const id = validatePackAssetIdentity(sample);
    if (ids.has(id)) throw new Error(`Duplicate staged sample ID: ${id}.`);
    ids.add(id);
    const fileName = `${id}.ogg`;
    expectedFiles.add(fileName);
    const path = join(packDirectory, fileName);
    if (
      !existsSync(path) ||
      !Number.isSafeInteger(sample.encodedBytes) ||
      statSync(path).size !== sample.encodedBytes
    ) {
      throw new Error(`Staged sample asset failed its byte contract: ${id}.`);
    }
  }
  for (const legacyDryId of legacyDryIds) {
    if (ids.has(legacyDryId)) {
      throw new Error(
        `Legacy-dry sample must not be packaged: ${legacyDryId}.`,
      );
    }
  }

  const actualFiles = readdirSync(packDirectory, { withFileTypes: true });
  if (
    actualFiles.length !== expectedFiles.size ||
    actualFiles.some(
      (entry) => !entry.isFile() || !expectedFiles.has(entry.name),
    )
  ) {
    throw new Error("Staged sample pack contains missing or unexpected files.");
  }

  const runtimeSource = readFileSync(runtimeAssetsPath, "utf8");
  for (const sample of procedural) {
    const marker = `id: ${JSON.stringify(sample.id)}`;
    if (runtimeSource.split(marker).length !== 2) {
      throw new Error(`Runtime inventory is not aligned for ${sample.id}.`);
    }
  }
  const runtimeIds = runtimeSource.match(/^\s+id:\s/gm) ?? [];
  if (runtimeIds.length !== EXPECTED_PROCEDURAL_ASSETS) {
    throw new Error("Runtime inventory does not contain exactly 41 assets.");
  }
  return {
    authoredCount: authored.length,
    proceduralCount: procedural.length,
    totalCount: manifest.samples.length,
  };
}

function injectFailure(stage) {
  if (process.env.COSMIC_SAMPLE_BUILD_FAIL_AT === stage) {
    throw new Error(`Injected sample build failure at ${stage}.`);
  }
}

export function promoteCompleteBuild(
  stagedPack,
  stagedRuntimeAssets,
  buildDirectory,
  {
    packOutput = PACK_OUTPUT,
    runtimeAssetsOutput = RUNTIME_ASSETS_OUTPUT,
    failAt = injectFailure,
  } = {},
) {
  const previousPack = join(buildDirectory, "previous-cosmic-samples");
  const previousRuntimeAssets = join(
    buildDirectory,
    "previous-generatedProceduralSampleAssets.ts",
  );
  let packBackedUp = false;
  let runtimeBackedUp = false;
  let packPromoted = false;
  let runtimePromoted = false;

  try {
    if (existsSync(packOutput)) {
      renameSync(packOutput, previousPack);
      packBackedUp = true;
    }
    if (existsSync(runtimeAssetsOutput)) {
      renameSync(runtimeAssetsOutput, previousRuntimeAssets);
      runtimeBackedUp = true;
    }
    renameSync(stagedPack, packOutput);
    packPromoted = true;
    failAt("after-pack-promotion");
    renameSync(stagedRuntimeAssets, runtimeAssetsOutput);
    runtimePromoted = true;
    failAt("after-runtime-promotion");
  } catch (error) {
    if (runtimePromoted) rmSync(runtimeAssetsOutput, { force: true });
    if (packPromoted) rmSync(packOutput, { recursive: true, force: true });
    if (runtimeBackedUp) {
      renameSync(previousRuntimeAssets, runtimeAssetsOutput);
    }
    if (packBackedUp) renameSync(previousPack, packOutput);
    throw error;
  }
}

function main() {
  const buildDirectory = mkdtempSync(
    join(dirname(REPOSITORY_ROOT), ".cosmic-complete-sample-build-"),
  );
  const stagedPack = join(buildDirectory, "cosmic-samples");
  const stagedRuntimeAssets = join(
    buildDirectory,
    "generatedProceduralSampleAssets.ts",
  );
  try {
    runNode(AUTHORED_PROCESSOR, ["--output", stagedPack]);
    runNode(PROCEDURAL_RENDERER, [
      "--output",
      stagedPack,
      "--runtime-assets",
      stagedRuntimeAssets,
    ]);
    const summary = validateCompleteSampleBuild(
      stagedPack,
      stagedRuntimeAssets,
    );
    injectFailure("before-promotion");
    promoteCompleteBuild(stagedPack, stagedRuntimeAssets, buildDirectory);
    process.stdout.write(
      `Promoted complete ${summary.totalCount}-asset sample pack (${summary.authoredCount} authored + ${summary.proceduralCount} procedural) transactionally.\n`,
    );
  } finally {
    rmSync(buildDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
