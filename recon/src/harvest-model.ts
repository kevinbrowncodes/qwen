/**
 * What the harvest (STORY_003) is allowed to write, and how it records it.
 *
 * The write is an allow-list decided by CONTENT, not by file name: a response
 * saved as `x.css` that is really JavaScript never lands in docs/recon/.
 */
import { createHash } from "node:crypto";

export type Kind = "css" | "svg" | "png" | "jpeg" | "webp" | "gif";

const JS_START = /^\s*(?:import[\s{*"']|export[\s{*]|const\s|let\s|var\s|function[\s(]|\(function|!function|"use strict"|'use strict'|window\.|self\.|define\(|require\()/;

function startsWith(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  return magic.every((b, i) => bytes[offset + i] === b);
}

/** Decides what a file is from its bytes; null means it must not be written. */
export function sniffKind(fileName: string, bytes: Uint8Array): Kind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^﻿/, "");
  const lead = text.replace(/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/, "");
  if (/^<svg[\s>]/i.test(lead)) return "svg";
  if (!fileName.toLowerCase().endsWith(".css")) return null;
  // A stylesheet never opens with markup, JSON or a JavaScript statement.
  if (/^\s*[<[]/.test(text) || /^\s*\{\s*"/.test(text) || JS_START.test(text)) return null;
  return "css";
}

export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The file name a CDN URL is harvested under: its last path segment, with no query or hash. */
export function cdnFileName(url: string): string {
  const pathOnly = url.split(/[?#]/)[0] ?? "";
  const name = pathOnly.split("/").pop() ?? "";
  if (name === "" || name === "." || name === "..") throw new Error(`no file name in ${url}`);
  return name;
}

/** `//host/path` → `https://host/path`; the query and hash are dropped. */
export function canonicalUrl(url: string): string {
  const noQuery = url.split(/[?#]/)[0] ?? "";
  return noQuery.startsWith("//") ? `https:${noQuery}` : noQuery;
}

export type IndexEntry = {
  path: string;
  /** The CDN URL without query, or "inline" for markup lifted from the snapshot. */
  source: string;
  bytes: number;
  sha256: string;
  origin?: string;
};

export function indexEntry(path: string, source: string, content: string | Uint8Array, origin?: string): IndexEntry {
  const bytes = typeof content === "string" ? Buffer.byteLength(content) : content.byteLength;
  const entry: IndexEntry = { path, source, bytes, sha256: sha256(content) };
  if (origin !== undefined) entry.origin = origin;
  return entry;
}

export type UrlReference = { url: string; in: string; harvested: false; reason: string };

/** Every url(...) in a stylesheet that is not a data: URI, with the reason it was not fetched. */
export function cssUrlReferences(css: string, file: string): UrlReference[] {
  const seen = new Set<string>();
  const out: UrlReference[] = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
    const raw = m[2]?.trim() ?? "";
    // "#id" and its encoded form "%23id" point inside the document (an SVG filter or gradient), not at a file.
    if (raw === "" || raw.startsWith("data:") || raw.startsWith("#") || raw.startsWith("%23")) continue;
    const url = canonicalUrl(raw);
    if (seen.has(url)) continue;
    seen.add(url);
    const reason = /\/fonts\/KaTeX_/.test(url)
      ? "KaTeX math font; the image generation flow shows no math"
      : "not fetched: the harvest makes no network request; raise with the owner if a clone surface needs it";
    out.push({ url, in: file, harvested: false, reason });
  }
  return out;
}

export type HarvestIndex = { files: IndexEntry[]; references: UrlReference[] };

export function sortIndex(index: HarvestIndex): HarvestIndex {
  return {
    files: [...index.files].sort((a, b) => a.path.localeCompare(b.path)),
    references: [...index.references].sort((a, b) => a.url.localeCompare(b.url) || a.in.localeCompare(b.in)),
  };
}

/** One day's assets over this size wait for the owner before commit (STORY_003). */
export const SIZE_LIMIT_BYTES = 20 * 1024 * 1024;
