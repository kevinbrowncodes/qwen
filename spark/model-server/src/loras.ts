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
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const ID = /^[a-z0-9][a-z0-9-]*$/;

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
    out.push({
      id: e["id"],
      label: e["label"],
      path: path.join(dir, e["id"], path.basename(e["file"])),
      scale,
      ...(text(e["trigger"]) ? { trigger: e["trigger"].trim() } : {}),
    });
  }
  return out;
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
