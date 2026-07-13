import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";

import type { Composition } from "../domain/composition";
import {
  deserializeComposition,
  serializeComposition,
} from "../domain/serialization/codec";

const CODEC_VERSION = "cb1";

function checksum(value: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of value) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash >>> 0).toString(36);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const batchSize = 0x8000;
  for (let index = 0; index < bytes.length; index += batchSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + batchSize));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeShareState(composition: Composition): string {
  const compressed = zlibSync(strToU8(serializeComposition(composition)), {
    level: 9,
  });
  return `${CODEC_VERSION}.${toBase64Url(compressed)}.${checksum(compressed)}`;
}

export type ShareDecodeResult =
  | { success: true; composition: Composition }
  | { success: false; message: string };

export function decodeShareState(encoded: string): ShareDecodeResult {
  const [codec, payload, expectedChecksum, extra] = encoded.split(".");
  if (
    codec !== CODEC_VERSION ||
    !payload ||
    !expectedChecksum ||
    extra !== undefined
  ) {
    return {
      success: false,
      message: "This share link format is not supported.",
    };
  }

  try {
    const compressed = fromBase64Url(payload);
    if (checksum(compressed) !== expectedChecksum) {
      return {
        success: false,
        message: "This share link is incomplete or damaged.",
      };
    }
    const decoded = deserializeComposition(strFromU8(unzlibSync(compressed)));
    return decoded.success
      ? decoded
      : { success: false, message: decoded.message };
  } catch {
    return {
      success: false,
      message: "This share link could not be opened safely.",
    };
  }
}

export function createShareUrl(
  composition: Composition,
  baseUrl = window.location.href,
): string {
  const url = new URL(baseUrl);
  url.hash = `s=${encodeShareState(composition)}`;
  return url.toString();
}

export function readShareStateFromHash(
  hash = window.location.hash,
): ShareDecodeResult | null {
  const match = /^#s=(.+)$/u.exec(hash);
  return match?.[1] ? decodeShareState(match[1]) : null;
}
