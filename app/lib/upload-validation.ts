/**
 * The app checks reference images before anything is forwarded (STORY_007): at most 10, PNG / JPEG / WebP by their
 * magic bytes (not by the declared type alone), at most 20 MB each. Contract v1's limits.
 */
export const MAX_REFERENCES = 10;
export const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;

export type ImageKind = "image/png" | "image/jpeg" | "image/webp";
export type Verdict = { readonly ok: true } | { readonly ok: false; readonly status: 400 | 413 | 415; readonly code: string; readonly message: string; readonly field: "referenceImage" };

export function sniffImage(head: Uint8Array): ImageKind | null {
  const at = (i: number): number | undefined => head[i];
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number): string => String.fromCharCode(...head.subarray(from, to));
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export interface Candidate {
  readonly name: string;
  readonly size: number;
  readonly head: Uint8Array;
}

export function validateReferences(files: readonly Candidate[]): Verdict {
  const refuse = (status: 400 | 413 | 415, code: string, message: string): Verdict => ({ ok: false, status, code, message, field: "referenceImage" });
  if (files.length > MAX_REFERENCES) return refuse(400, "validation", `Attach at most ${String(MAX_REFERENCES)} reference images.`);
  for (const f of files) {
    if (f.size > MAX_REFERENCE_BYTES) return refuse(413, "too_large", `${f.name} is larger than 20 MB.`);
    if (sniffImage(f.head) === null) return refuse(415, "unsupported_media_type", `${f.name} is not a PNG, JPEG or WebP image.`);
  }
  return { ok: true };
}

/** Checks files being added to `existing` already-attached references: the count over all, the type and size of each new one. */
export function validateAddition(existing: number, added: readonly Candidate[]): Verdict {
  if (existing + added.length > MAX_REFERENCES) {
    return { ok: false, status: 400, code: "validation", message: `Attach at most ${String(MAX_REFERENCES)} reference images.`, field: "referenceImage" };
  }
  return validateReferences(added);
}
