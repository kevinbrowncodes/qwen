/**
 * Community add-ons (STORY_019): the LoRAs listed in spark/loras.json and fetched into models/loras/<id>/ by
 * spark/fetch-loras.sh. The server offers only those whose file is on disk and that the worker reports loaded.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface Lora {
  readonly id: string;
  readonly label: string;
  /** The .safetensors file, as the worker opens it. */
  readonly path: string;
  readonly scale: number;
  /** Words the add-on was trained on, appended to the prompt. */
  readonly trigger?: string;
  /** The `true_cfg_scale` for jobs with this add-on (STORY_021); absent means the pipeline's default, no guidance. */
  readonly guidance?: number;
  // What the info card shows (STORY_030), written by hand in the manifest; each is optional.
  readonly creator?: string;
  /** One line from the creator's page on what the LoRA is for, and the day it was read. */
  readonly madeFor?: string;
  readonly madeForReadOn?: string;
  /** The creator's page. */
  readonly origin?: string;
  readonly downloads?: number;
  readonly downloadsReadOn?: string;
  /** Per subject: what the creator claims and what a bench showed (STORY_030). */
  readonly abilities?: readonly Ability[];
  /** Whose judgement the bench lines are, and when. */
  readonly benchSource?: string;
}

export interface Ability {
  readonly subject: string;
  readonly claimed?: string;
  readonly bench?: string;
}

/** What `/capabilities` says about a LoRA (contract v1.4, STORY_030): absent fields are null, never left out. */
export interface LoraInfo {
  readonly scale: number;
  readonly guidance: number | null;
  readonly trigger: string | null;
  readonly madeFor: string | null;
  readonly madeForReadOn: string | null;
  readonly creator: string | null;
  readonly origin: string | null;
  readonly downloads: number | null;
  readonly downloadsReadOn: string | null;
  readonly abilities: ReadonlyArray<{ readonly subject: string; readonly claimed: string | null; readonly bench: string | null }>;
  readonly benchSource: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const ID = /^[a-z0-9][a-z0-9-]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The card's limits (STORY_030): longer text is cut, with "…", so a long line never breaks the card. */
export const MADE_FOR_MAX = 200;
export const ABILITY_TEXT_MAX = 120;
export const SUBJECT_MAX = 24;
export const ABILITIES_MAX = 6;

/** Trimmed text cut to `max` characters, ending with "…" when it was cut. */
function clip(v: string, max: number, what: string, warn: (line: string) => void): string {
  const t = v.trim();
  if (t.length <= max) return t;
  warn(`[loras] ${what} is longer than ${String(max)} characters; cut`);
  return `${t.slice(0, max - 1)}…`;
}

/** The descriptive fields (STORY_030). A malformed one is dropped with a warning; the entry itself is kept. */
function describe(e: Record<string, unknown>, id: string, warn: (line: string) => void): Partial<Lora> {
  const out: { -readonly [K in keyof Lora]?: Lora[K] } = {};
  const optionalText = (key: string): string | undefined => {
    const v = e[key];
    if (v === undefined) return undefined;
    if (text(v)) return v;
    warn(`[loras] ${id}: ${key} is not text; dropped`);
    return undefined;
  };
  const day = (key: string): string | undefined => {
    const v = e[key];
    if (v === undefined) return undefined;
    if (typeof v === "string" && DAY.test(v)) return v;
    warn(`[loras] ${id}: ${key} is not a YYYY-MM-DD date; dropped`);
    return undefined;
  };
  const creator = optionalText("creator");
  if (creator !== undefined) out.creator = creator.trim();
  const madeFor = optionalText("madeFor");
  if (madeFor !== undefined) {
    out.madeFor = clip(madeFor, MADE_FOR_MAX, `${id}: madeFor`, warn);
    // The text is still right without its date, so it is kept.
    const readOn = day("madeForReadOn");
    if (readOn !== undefined) out.madeForReadOn = readOn;
  }
  const origin = optionalText("origin");
  if (origin !== undefined) {
    if (/^https?:\/\//i.test(origin.trim())) out.origin = origin.trim();
    else warn(`[loras] ${id}: origin is not an http(s) URL; dropped`);
  }
  const downloads = e["downloads"];
  if (downloads !== undefined) {
    const readOn = day("downloadsReadOn");
    if (typeof downloads !== "number" || !Number.isInteger(downloads) || downloads < 0) warn(`[loras] ${id}: downloads is not a whole number; dropped`);
    // A count with no date is not explained, so it is dropped too.
    else if (readOn === undefined) warn(`[loras] ${id}: downloads has no downloadsReadOn; dropped`);
    else {
      out.downloads = downloads;
      out.downloadsReadOn = readOn;
    }
  }
  const abilities = e["abilities"];
  if (abilities !== undefined) {
    if (Array.isArray(abilities)) out.abilities = parseAbilities(abilities, id, warn);
    else warn(`[loras] ${id}: abilities is not a list; dropped`);
  }
  const benchSource = optionalText("benchSource");
  if (benchSource !== undefined) out.benchSource = clip(benchSource, ABILITY_TEXT_MAX, `${id}: benchSource`, warn);
  return out;
}

function parseAbilities(list: readonly unknown[], id: string, warn: (line: string) => void): Ability[] {
  const out: Ability[] = [];
  for (const a of list) {
    if (!isObj(a) || !text(a["subject"])) {
      warn(`[loras] ${id}: an ability without a subject; dropped`);
      continue;
    }
    const subject = clip(a["subject"], SUBJECT_MAX, `${id}: an ability's subject`, warn);
    if (out.some((o) => o.subject.toLowerCase() === subject.toLowerCase())) {
      warn(`[loras] ${id}: a second ability for ${subject}; dropped`);
      continue;
    }
    if (out.length === ABILITIES_MAX) {
      warn(`[loras] ${id}: more than ${String(ABILITIES_MAX)} abilities; the rest dropped`);
      break;
    }
    const line = (key: "claimed" | "bench"): string | undefined => {
      const v = a[key];
      if (v === undefined || v === null) return undefined;
      if (text(v)) return clip(v, ABILITY_TEXT_MAX, `${id}: ${subject}'s ${key}`, warn);
      warn(`[loras] ${id}: ${subject}'s ${key} is not text; dropped`);
      return undefined;
    };
    const claimed = line("claimed");
    const bench = line("bench");
    out.push({ subject, ...(claimed === undefined ? {} : { claimed }), ...(bench === undefined ? {} : { bench }) });
  }
  return out;
}

/** The manifest's well-formed entries, resolved against `dir`; malformed entries are reported through `warn`. */
export function parseManifest(json: string, dir: string, warn: (line: string) => void = () => undefined): Lora[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    warn("[loras] the manifest is not JSON; no add-ons");
    return [];
  }
  const entries = isObj(data) && Array.isArray(data["loras"]) ? data["loras"] : [];
  const out: Lora[] = [];
  for (const e of entries) {
    if (!isObj(e) || !text(e["id"]) || !ID.test(e["id"]) || e["id"] === "none" || !text(e["label"]) || !text(e["file"])) {
      warn(`[loras] skipping a malformed entry: ${JSON.stringify(e).slice(0, 80)}`);
      continue;
    }
    if (out.some((l) => l.id === e["id"])) {
      warn(`[loras] skipping a second entry with id ${e["id"]}`);
      continue;
    }
    const scale = typeof e["scale"] === "number" && e["scale"] > 0 && e["scale"] <= 2 ? e["scale"] : 1;
    // Guidance below 1 is meaningless to the pipeline and above 10 is far past what any creator recommends.
    const guidance = typeof e["guidance"] === "number" && e["guidance"] >= 1 && e["guidance"] <= 10 ? e["guidance"] : undefined;
    out.push({
      id: e["id"],
      label: e["label"],
      path: path.join(dir, e["id"], path.basename(e["file"])),
      scale,
      ...(text(e["trigger"]) ? { trigger: e["trigger"].trim() } : {}),
      ...(guidance === undefined ? {} : { guidance }),
      ...describe(e, e["id"], warn),
    });
  }
  return out;
}

/** A LoRA as `/capabilities` describes it (contract v1.4, STORY_030): the settings it is applied at, and the card's facts. */
export function loraInfo(l: Lora): LoraInfo {
  return {
    scale: l.scale,
    guidance: l.guidance ?? null,
    trigger: l.trigger ?? null,
    madeFor: l.madeFor ?? null,
    madeForReadOn: l.madeForReadOn ?? null,
    creator: l.creator ?? null,
    origin: l.origin ?? null,
    downloads: l.downloads ?? null,
    downloadsReadOn: l.downloadsReadOn ?? null,
    abilities: (l.abilities ?? []).map((a) => ({ subject: a.subject, claimed: a.claimed ?? null, bench: a.bench ?? null })),
    benchSource: l.benchSource ?? null,
  };
}

/** The add-ons whose file has been fetched. A missing manifest means none. */
export function installedLoras(manifest: string, dir: string, warn: (line: string) => void = () => undefined): Lora[] {
  if (!existsSync(manifest)) return [];
  return parseManifest(readFileSync(manifest, "utf8"), dir, warn).filter((l) => {
    if (existsSync(l.path)) return true;
    warn(`[loras] ${l.id} is not fetched (${l.path}); run spark/fetch-loras.sh`);
    return false;
  });
}

/** The prompt the worker gets: the owner's, then the add-on's trigger words, unless they are already in it. */
export function withTrigger(prompt: string, lora: Lora | undefined): string {
  const trigger = lora?.trigger;
  if (trigger === undefined || prompt.toLowerCase().includes(trigger.toLowerCase())) return prompt;
  return `${prompt}, ${trigger}`;
}
