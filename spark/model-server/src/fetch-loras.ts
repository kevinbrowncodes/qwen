/**
 * Fetching the community add-ons (STORY_021): the engine behind spark/fetch-loras.sh, which runs fetch-loras-cli.ts
 * in a node container on the Spark. Each manifest entry (spark/loras.json) names where its bytes come from, a
 * Hugging Face repo at a pinned revision or a Civitai model version, and the creator's published sha256. A file
 * streams to <dir>/<id>/<file>.part, is hashed as it arrives, and is renamed into place only when the hash matches;
 * one that differs is removed and reported. Tokens come in as strings read from files and are never printed.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type Source = { readonly kind: "huggingface"; readonly repo: string; readonly revision: string } | { readonly kind: "civitai"; readonly versionId: number };

export interface FetchEntry {
  readonly id: string;
  readonly file: string;
  readonly sha256: string;
  readonly source: Source;
}

export interface Refused {
  readonly id: string;
  readonly reason: string;
}

/** Where each source is reached; the tests point these at a local fake. */
export interface Bases {
  readonly huggingface: string;
  readonly civitai: string;
}
export const DEFAULT_BASES: Bases = { huggingface: "https://huggingface.co", civitai: "https://civitai.com" };

export interface Tokens {
  readonly huggingface?: string;
  readonly civitai?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const SHA256 = /^[0-9a-f]{64}$/i;

function readSource(v: unknown): Source | string {
  if (!isObj(v)) return "no source";
  if (v["kind"] === "huggingface") return text(v["repo"]) && text(v["revision"]) ? { kind: "huggingface", repo: v["repo"], revision: v["revision"] } : "a huggingface source needs repo and revision";
  if (v["kind"] === "civitai") return typeof v["versionId"] === "number" && Number.isInteger(v["versionId"]) && v["versionId"] > 0 ? { kind: "civitai", versionId: v["versionId"] } : "a civitai source needs a versionId";
  return `unknown source kind ${JSON.stringify(v["kind"])}`;
}

/** The entries the fetch can act on, and those it refuses, by id and reason. The model server's own reading of the
 * manifest (loras.ts) is separate: it needs neither a source nor a checksum to offer a file already on disk. */
export function readFetchManifest(json: string): { entries: FetchEntry[]; refused: Refused[] } {
  const entries: FetchEntry[] = [];
  const refused: Refused[] = [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { entries, refused: [{ id: "(manifest)", reason: "not JSON" }] };
  }
  const list = isObj(data) && Array.isArray(data["loras"]) ? data["loras"] : [];
  for (const e of list) {
    const id = isObj(e) && text(e["id"]) ? e["id"] : "(no id)";
    if (!isObj(e) || !text(e["file"])) {
      refused.push({ id, reason: "no file" });
      continue;
    }
    if (!text(e["sha256"]) || !SHA256.test(e["sha256"])) {
      refused.push({ id, reason: "no sha256 (every entry needs the creator's published checksum)" });
      continue;
    }
    const source = readSource(e["source"]);
    if (typeof source === "string") {
      refused.push({ id, reason: source });
      continue;
    }
    entries.push({ id, file: e["file"], sha256: e["sha256"].toLowerCase(), source });
  }
  return { entries, refused };
}

/** The URL an entry's bytes come from. A Hugging Face path is encoded a segment at a time, so a file name with spaces works. */
export function downloadUrl(entry: FetchEntry, bases: Bases = DEFAULT_BASES): string {
  if (entry.source.kind === "huggingface") {
    const file = entry.file.split("/").map(encodeURIComponent).join("/");
    return `${bases.huggingface}/${entry.source.repo}/resolve/${entry.source.revision}/${file}`;
  }
  return `${bases.civitai}/api/download/models/${String(entry.source.versionId)}?type=Model&format=SafeTensor`;
}

/** Where the file lands: <dir>/<id>/<base name of file>, as the model server resolves it (loras.ts). */
export function localPath(dir: string, entry: FetchEntry): string {
  return path.join(dir, entry.id, path.basename(entry.file));
}

export function plan(entries: readonly FetchEntry[], dir: string): { fetched: FetchEntry[]; missing: FetchEntry[] } {
  const fetched: FetchEntry[] = [];
  const missing: FetchEntry[] = [];
  for (const e of entries) (existsSync(localPath(dir, e)) ? fetched : missing).push(e);
  return { fetched, missing };
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => {
        resolve(hash.digest("hex"));
      });
  });
}

/** Streams `url` to `dest`, checking the hash as it goes; returns the byte count. Anything short of a matching file
 * leaves nothing behind. */
export async function download(url: string, token: string | undefined, dest: string, sha256: string): Promise<number> {
  const res = await fetch(url, { headers: token === undefined ? {} : { authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!res.ok || res.body === null) throw new Error(`HTTP ${String(res.status)}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const hash = createHash("sha256");
  let bytes = 0;
  const counting = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counting, createWriteStream(part));
  } catch (error) {
    rmSync(part, { force: true });
    throw error;
  }
  const got = hash.digest("hex");
  if (got !== sha256) {
    rmSync(part, { force: true });
    throw new Error(`sha256 mismatch: got ${got.slice(0, 12)}…, the manifest says ${sha256.slice(0, 12)}…`);
  }
  renameSync(part, dest);
  return bytes;
}

export interface FetchOutcome {
  readonly fetched: string[];
  /** Civitai entries with no token to send: named so the owner knows what to save. */
  readonly waiting: string[];
  readonly failed: Refused[];
}

/** Fetches every entry not yet on disk. The outcome is complete when `waiting` and `failed` are both empty. */
export async function fetchAll(entries: readonly FetchEntry[], dir: string, tokens: Tokens, bases: Bases = DEFAULT_BASES, report: (line: string) => void = () => undefined): Promise<FetchOutcome> {
  const outcome: FetchOutcome = { fetched: [], waiting: [], failed: [] };
  const { fetched, missing } = plan(entries, dir);
  for (const e of fetched) report(`fetch: ${e.id} already there`);
  for (const e of missing) {
    const token = e.source.kind === "huggingface" ? tokens.huggingface : tokens.civitai;
    if (e.source.kind === "civitai" && token === undefined) {
      report(`fetch: ${e.id} waits for a Civitai token (save one at ~/.config/civitai/token)`);
      outcome.waiting.push(e.id);
      continue;
    }
    try {
      const bytes = await download(downloadUrl(e, bases), token, localPath(dir, e), e.sha256);
      report(`fetch: ${e.id} done, ${(bytes / 1e6).toFixed(1)} MB, sha256 ok`);
      outcome.fetched.push(e.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      report(`fetch: ${e.id} failed: ${reason}`);
      outcome.failed.push({ id: e.id, reason });
    }
  }
  return outcome;
}

export type Verdict = "ok" | "mismatch" | "missing";

/** Hashes each entry's file on disk against the manifest. */
export async function verify(entries: readonly FetchEntry[], dir: string): Promise<Array<{ id: string; verdict: Verdict }>> {
  const out: Array<{ id: string; verdict: Verdict }> = [];
  for (const e of entries) {
    const file = localPath(dir, e);
    if (!existsSync(file)) {
      out.push({ id: e.id, verdict: "missing" });
      continue;
    }
    out.push({ id: e.id, verdict: (await sha256File(file)) === e.sha256 ? "ok" : "mismatch" });
  }
  return out;
}

/** One line per entry for `status`: id, whether it is on disk, its size, and its source. */
export function statusLines(entries: readonly FetchEntry[], dir: string): string[] {
  return entries.map((e) => {
    const file = localPath(dir, e);
    const there = existsSync(file);
    const size = there ? `${(statSync(file).size / 1e6).toFixed(1)} MB` : "";
    const source = e.source.kind === "huggingface" ? e.source.repo : `civitai version ${String(e.source.versionId)}`;
    return `${e.id.padEnd(22)} ${(there ? "fetched" : "missing").padEnd(8)} ${size.padStart(9)}  ${source}`;
  });
}

/** One variable's value from the text of a .env file (CHORE_005): `NAME=value`, optionally `export NAME=value`,
 * with surrounding quotes stripped. None for a missing, commented-out or empty entry; other lines are ignored, and
 * nothing in the file is ever executed. */
export function envValue(text: string, name: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match?.[1] !== name) continue;
    let value = (match[2] ?? "").trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    return value === "" ? undefined : value;
  }
  return undefined;
}

/** CIVITAI_TOKEN from a .env file; none when the path is unset or unreadable. The value is never logged. */
export function readEnvToken(file: string | undefined, name = "CIVITAI_TOKEN"): string | undefined {
  if (file === undefined || file === "") return undefined;
  try {
    return envValue(readFileSync(file, "utf8"), name);
  } catch {
    return undefined;
  }
}

/** A token from a file, trimmed; none when the path is unset or unreadable. The value is never logged. */
export function readToken(file: string | undefined): string | undefined {
  if (file === undefined || file === "") return undefined;
  try {
    const value = readFileSync(file, "utf8").trim();
    return value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}
