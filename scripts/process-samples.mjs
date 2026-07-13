#!/usr/bin/env node

/**
 * Build the first-party web sample pack from every WAV below `sample inputs/`.
 *
 * Exact audio policy (requires ffmpeg + ffprobe + Xiph oggenc on PATH):
 * - inspect source metadata with ffprobe JSON;
 * - detect silence with `silencedetect=noise=-60dB:d=0.04`;
 * - trim only terminal silence lasting >= 120 ms, keeping 30 ms after the
 *   detected audible tail (internal gaps and shorter/reverb tails are kept);
 * - preserve the source channel count, apply no gain/normalization, resample to
 *   48 kHz, and encode Ogg Vorbis with Xiph
 *   `oggenc --quality 5 --serial 0` for deterministic output;
 * - inspect decoded source/output levels with ffmpeg `volumedetect` and record
 *   all source/output metadata in the generated manifest.
 *
 * Run from anywhere with: `node scripts/process-samples.mjs`
 * Optional: `--input <dir>` and `--output <dir>`.
 */

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_INPUT = join(REPOSITORY_ROOT, "sample inputs");
const DEFAULT_OUTPUT = join(REPOSITORY_ROOT, "public/audio/cosmic-samples");

const ENCODE_SAMPLE_RATE = 48_000;
const VORBIS_QUALITY = 5;
const SILENCE_THRESHOLD_DB = -60;
const SILENCE_DETECTION_SECONDS = 0.04;
const MINIMUM_TERMINAL_SILENCE_SECONDS = 0.12;
const TAIL_PADDING_SECONDS = 0.03;
const TERMINAL_TOLERANCE_SECONDS = 0.025;

// Musical-character defaults keep future manifest entries safe without a
// hard-coded inventory. Overrides remain explicit for authored exceptions.
const PLAYBACK_ENVELOPES_BY_CATEGORY = {
  bass: { attackSeconds: 0.004, releaseSeconds: 0.055 },
  crash: { attackSeconds: 0.0015, releaseSeconds: 0.04 },
  "hi-hat": { attackSeconds: 0.0015, releaseSeconds: 0.04 },
  kick: { attackSeconds: 0.0005, releaseSeconds: 0.018 },
  other: { attackSeconds: 0.008, releaseSeconds: 0.075 },
  ride: { attackSeconds: 0.0015, releaseSeconds: 0.04 },
  rimshot: { attackSeconds: 0.0005, releaseSeconds: 0.018 },
  snare: { attackSeconds: 0.0005, releaseSeconds: 0.018 },
  synth: { attackSeconds: 0.008, releaseSeconds: 0.075 },
  tom: { attackSeconds: 0.0015, releaseSeconds: 0.04 },
};
const PLAYBACK_ENVELOPE_OVERRIDES = {
  "reverb-square-saw-long": {
    attackSeconds: 0.01,
    releaseSeconds: 0.08,
  },
  "sub-long": { attackSeconds: 0.006, releaseSeconds: 0.065 },
  "techno-crash": { attackSeconds: 0.002, releaseSeconds: 0.06 },
  "techno-ride": { attackSeconds: 0.002, releaseSeconds: 0.06 },
};

function usage() {
  return `Usage: node scripts/process-samples.mjs [--input <dir>] [--output <dir>]

Discovers every .wav recursively, derives a stable collision-checked ID from
its relative path, writes optimized .ogg files, and regenerates manifest.json.
Unknown future filenames are retained with category "other".`;
}

function parseArguments(argv) {
  let input = DEFAULT_INPUT;
  let output = DEFAULT_OUTPUT;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (argument === "--input" || argument === "--output") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a directory path.`);
      if (argument === "--input") input = resolve(value);
      else output = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}\n\n${usage()}`);
  }
  return { input, output };
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${arguments_.join(" ")} failed${detail ? `:\n${detail}` : "."}`,
    );
  }
  return result;
}

function assertToolAvailable(command) {
  run(command, ["-version"], { stdio: "ignore" });
}

function discoverWavs(directory) {
  const files = [];
  function visit(current) {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    );
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".wav")
        files.push(path);
    }
  }
  visit(directory);
  return files;
}

function stableIdFor(relativePath) {
  const withoutExtension = relativePath.slice(0, -extname(relativePath).length);
  const id = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!id) {
    throw new Error(`Cannot derive a safe sample ID from ${relativePath}.`);
  }
  return id;
}

function displayNameFor(fileName) {
  return basename(fileName, extname(fileName))
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCategory(id) {
  if (/kick/.test(id)) return "kick";
  if (/snare|clap/.test(id)) return "snare";
  if (/rim/.test(id)) return "rimshot";
  if (/crash/.test(id)) return "crash";
  if (/ride/.test(id)) return "ride";
  if (/hat|hihat/.test(id)) return "hi-hat";
  if (/tom/.test(id)) return "tom";
  if (/bass|sub/.test(id)) return "bass";
  if (/synth|saw|square|lead|pad|pluck/.test(id)) return "synth";
  return "other";
}

function playbackEnvelopeFor(id, category) {
  return {
    ...PLAYBACK_ENVELOPES_BY_CATEGORY[category],
    ...PLAYBACK_ENVELOPE_OVERRIDES[id],
  };
}

function probe(path) {
  const result = run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "format=duration,size:stream=codec_name,sample_rate,channels,bits_per_sample,bits_per_raw_sample",
    "-of",
    "json",
    path,
  ]);
  const data = JSON.parse(result.stdout);
  const stream = data.streams?.[0];
  if (!stream || !data.format)
    throw new Error(`No audio stream found in ${path}.`);
  return {
    codec: String(stream.codec_name),
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    bitDepth: Number(stream.bits_per_raw_sample || stream.bits_per_sample || 0),
    durationSeconds: Number(data.format.duration),
    bytes: Number(data.format.size),
  };
}

function detectTerminalSilence(path, sourceDuration, sampleRate) {
  const result = run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-af",
    `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=${SILENCE_DETECTION_SECONDS}`,
    "-f",
    "null",
    "-",
  ]);
  const events = [];
  const pattern =
    /silence_start:\s*([0-9.]+)[\s\S]*?silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g;
  for (const match of result.stderr.matchAll(pattern)) {
    events.push({
      start: Number(match[1]),
      end: Number(match[2]),
      duration: Number(match[3]),
    });
  }
  const last = events.at(-1);
  const endTolerance = Math.max(
    TERMINAL_TOLERANCE_SECONDS,
    sampleRate > 0 ? 2 / sampleRate : 0,
  );
  if (
    !last ||
    sourceDuration - last.end > endTolerance ||
    last.duration < MINIMUM_TERMINAL_SILENCE_SECONDS
  ) {
    return undefined;
  }
  const trimEnd = Math.min(sourceDuration, last.start + TAIL_PADDING_SECONDS);
  return sourceDuration - trimEnd >= MINIMUM_TERMINAL_SILENCE_SECONDS / 2
    ? { ...last, trimEnd }
    : undefined;
}

function volumeStats(path) {
  const result = run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const mean = /mean_volume:\s*(-?(?:inf|[0-9.]+))\s*dB/i.exec(result.stderr);
  const peak = /max_volume:\s*(-?(?:inf|[0-9.]+))\s*dB/i.exec(result.stderr);
  return {
    meanDb: mean ? Number(mean[1]) : null,
    peakDb: peak ? Number(peak[1]) : null,
  };
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function encode(source, destination, trimEnd) {
  const temporary = `${destination}.tmp.ogg`;
  const intermediate = `${destination}.tmp.wav`;
  rmSync(temporary, { force: true });
  rmSync(intermediate, { force: true });
  try {
    let encodeInput = source;
    if (trimEnd !== undefined) {
      run("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        source,
        "-af",
        `atrim=end=${trimEnd.toFixed(6)},asetpts=PTS-STARTPTS`,
        "-map_metadata",
        "-1",
        "-vn",
        "-ar",
        String(ENCODE_SAMPLE_RATE),
        "-c:a",
        "pcm_s24le",
        intermediate,
      ]);
      encodeInput = intermediate;
    }
    run("oggenc", [
      "--quiet",
      "--discard-comments",
      "--serial",
      "0",
      "--quality",
      String(VORBIS_QUALITY),
      "--resample",
      String(ENCODE_SAMPLE_RATE),
      `--output=${temporary}`,
      encodeInput,
    ]);
    renameSync(temporary, destination);
  } finally {
    rmSync(intermediate, { force: true });
    rmSync(temporary, { force: true });
  }
}

function portablePath(path) {
  return path.split(sep).join("/");
}

function main() {
  const { input, output } = parseArguments(process.argv.slice(2));
  assertToolAvailable("ffmpeg");
  assertToolAvailable("ffprobe");
  run("oggenc", ["--version"], { stdio: "ignore" });
  const wavs = discoverWavs(input);
  if (wavs.length === 0) throw new Error(`No WAV files found below ${input}.`);
  mkdirSync(output, { recursive: true });

  const ids = new Map();
  const samples = [];
  const expectedOutputs = new Set();
  for (const source of wavs) {
    const sourceRelativePath = portablePath(relative(input, source));
    const id = stableIdFor(sourceRelativePath);
    const previous = ids.get(id);
    if (previous) {
      throw new Error(
        `Stable sample ID collision: ${previous} and ${sourceRelativePath} both map to ${id}.`,
      );
    }
    ids.set(id, sourceRelativePath);

    const sourceProbe = probe(source);
    if (sourceProbe.codec !== "pcm_s24le") {
      process.stderr.write(
        `Warning: ${sourceRelativePath} is ${sourceProbe.codec}; processing continues.\n`,
      );
    }
    const terminalSilence = detectTerminalSilence(
      source,
      sourceProbe.durationSeconds,
      sourceProbe.sampleRate,
    );
    const destination = join(output, `${id}.ogg`);
    encode(source, destination, terminalSilence?.trimEnd);
    expectedOutputs.add(basename(destination));

    const encodedProbe = probe(destination);
    if (encodedProbe.codec !== "vorbis") {
      throw new Error(`${destination} was not encoded as Ogg Vorbis.`);
    }
    const sourceLevels = volumeStats(source);
    const encodedLevels = volumeStats(destination);
    const category = inferCategory(id);
    samples.push({
      id,
      name: displayNameFor(sourceRelativePath),
      category,
      url: `audio/cosmic-samples/${id}.ogg`,
      sourceFile: sourceRelativePath,
      durationSeconds: rounded(encodedProbe.durationSeconds),
      ...playbackEnvelopeFor(id, category),
      sourceDurationSeconds: rounded(sourceProbe.durationSeconds),
      trimmedSeconds: rounded(
        Math.max(0, sourceProbe.durationSeconds - encodedProbe.durationSeconds),
      ),
      channels: encodedProbe.channels,
      sampleRate: encodedProbe.sampleRate,
      sourceBitDepth: sourceProbe.bitDepth,
      sourceBytes: sourceProbe.bytes,
      encodedBytes: statSync(destination).size,
      sourcePeakDb: sourceLevels.peakDb,
      sourceMeanDb: sourceLevels.meanDb,
      encodedPeakDb: encodedLevels.peakDb,
      encodedMeanDb: encodedLevels.meanDb,
    });
  }

  for (const entry of readdirSync(output, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      entry.name.endsWith(".ogg") &&
      !expectedOutputs.has(entry.name)
    ) {
      rmSync(join(output, entry.name));
    }
  }

  const manifest = {
    schemaVersion: 1,
    pack: {
      id: "cosmic-first-party",
      name: "Cosmic First-Party Sample Pack",
      author: "Cosmic Beatmaker",
      license: "First-party project asset",
      codec: "Ogg Vorbis",
      sampleRate: ENCODE_SAMPLE_RATE,
      quality: VORBIS_QUALITY,
      generatedBy: "node scripts/process-samples.mjs",
      trimPolicy: {
        thresholdDb: SILENCE_THRESHOLD_DB,
        detectionSeconds: SILENCE_DETECTION_SECONDS,
        minimumTerminalSilenceSeconds: MINIMUM_TERMINAL_SILENCE_SECONDS,
        tailPaddingSeconds: TAIL_PADDING_SECONDS,
      },
    },
    samples,
  };
  writeFileSync(
    join(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const originalBytes = samples.reduce(
    (sum, sample) => sum + sample.sourceBytes,
    0,
  );
  const encodedBytes = samples.reduce(
    (sum, sample) => sum + sample.encodedBytes,
    0,
  );
  process.stdout.write(
    `Processed ${samples.length} WAV files from ${input}\n` +
      `Wrote ${output}/manifest.json and ${samples.length} Ogg Vorbis assets\n` +
      `Settings: -60 dBFS / 40 ms detection, >=120 ms terminal-only trim, 30 ms tail padding, Xiph libVorbis q5, 48 kHz, source channels, no gain\n` +
      `Bytes: ${originalBytes} source -> ${encodedBytes} encoded (${(
        (encodedBytes / originalBytes) *
        100
      ).toFixed(1)}%)\n`,
  );
  for (const sample of samples) {
    process.stdout.write(
      `${sample.id.padEnd(28)} ${sample.sourceDurationSeconds.toFixed(3)}s -> ${sample.durationSeconds.toFixed(3)}s  ${String(sample.sourcePeakDb).padStart(5)} dBFS -> ${String(sample.encodedPeakDb).padStart(5)} dBFS  ${sample.encodedBytes} bytes\n`,
    );
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
