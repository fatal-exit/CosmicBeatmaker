import type { Composition } from "../../domain/composition";
import { serializeComposition } from "../../domain/serialization/codec";

export function sanitizeFilename(name: string): string {
  const safe = name
    .trim()
    .replace(/[^a-z0-9-_]+/giu, "-")
    .replace(/^-+|-+$/gu, "");
  return safe || "cosmic-system";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCompositionJson(composition: Composition): void {
  downloadBlob(
    new Blob([serializeComposition(composition)], {
      type: "application/json",
    }),
    `${sanitizeFilename(composition.name)}.cosmic.json`,
  );
}
