import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installedLoras, loraInfo, parseManifest, withTrigger } from "./loras.ts";

// STORY_019: the manifest (spark/loras.json) as the model server reads it.
const manifest = (loras: unknown[]): string => JSON.stringify({ loras });
const entry = { id: "uncensored", label: "Uncensored", file: "sub/qwen-image-2.1-uncensored-lora.safetensors", scale: 0.8 };

describe("parseManifest", () => {
  it("resolves each entry's file under its own directory, by base name", () => {
    expect(parseManifest(manifest([entry]), "/loras")).toEqual([{ id: "uncensored", label: "Uncensored", path: "/loras/uncensored/qwen-image-2.1-uncensored-lora.safetensors", scale: 0.8 }]);
  });

  it("keeps a trigger, trimmed, and defaults a missing or out-of-range scale to 1", () => {
    const [a, b, c] = parseManifest(manifest([{ ...entry, id: "a", trigger: "  nsfw  " }, { ...entry, id: "b", scale: 0 }, { ...entry, id: "c", scale: undefined }]), "/l");
    expect(a).toMatchObject({ trigger: "nsfw", scale: 0.8 });
    expect([b?.scale, c?.scale]).toEqual([1, 1]);
    expect(parseManifest(manifest([{ ...entry, scale: 3 }]), "/l")[0]?.scale).toBe(1);
  });

  it("keeps a guidance between 1 and 10, and drops one outside that or not a number (STORY_021)", () => {
    const [a, b, c, d, e] = parseManifest(manifest([{ ...entry, id: "a", guidance: 3 }, { ...entry, id: "b", guidance: 1 }, { ...entry, id: "c", guidance: 0.5 }, { ...entry, id: "d", guidance: 11 }, { ...entry, id: "e", guidance: "3" }]), "/l");
    expect([a?.guidance, b?.guidance]).toEqual([3, 1]);
    for (const l of [c, d, e, parseManifest(manifest([entry]), "/l")[0]]) expect(l).not.toHaveProperty("guidance");
  });

  it("skips malformed entries, the reserved id none, and a repeated id, saying why", () => {
    const warnings: string[] = [];
    const out = parseManifest(manifest([entry, { ...entry }, { ...entry, id: "none" }, { ...entry, id: "Bad Id" }, { id: "x", label: "X" }, "junk"]), "/l", (w) => warnings.push(w));
    expect(out.map((l) => l.id)).toEqual(["uncensored"]);
    expect(warnings).toHaveLength(5);
  });

  it("reads nothing from a file that is not a manifest", () => {
    const warnings: string[] = [];
    expect(parseManifest("{", "/l", (w) => warnings.push(w))).toEqual([]);
    expect(warnings[0]).toMatch(/not JSON/);
    expect(parseManifest("[]", "/l")).toEqual([]);
    expect(parseManifest('{"loras":{}}', "/l")).toEqual([]);
  });
});

describe("the info card's fields (STORY_030)", () => {
  const parse = (extra: Record<string, unknown>): { lora: ReturnType<typeof parseManifest>[number] | undefined; warnings: string[] } => {
    const warnings: string[] = [];
    const [lora] = parseManifest(manifest([{ ...entry, ...extra }]), "/l", (w) => warnings.push(w));
    return { lora, warnings };
  };

  it("keeps the creator, the made-for line with its date, the source page and the downloads with theirs, trimmed", () => {
    const { lora, warnings } = parse({ creator: " abenzerps ", madeFor: " A general uncensored LoRA. ", madeForReadOn: "2026-10-16", origin: "https://huggingface.co/x", downloads: 1070, downloadsReadOn: "2026-10-07" });
    expect(lora).toMatchObject({ creator: "abenzerps", madeFor: "A general uncensored LoRA.", madeForReadOn: "2026-10-16", origin: "https://huggingface.co/x", downloads: 1070, downloadsReadOn: "2026-10-07" });
    expect(warnings).toEqual([]);
  });

  it("drops each malformed field with a warning and keeps the LoRA", () => {
    const { lora, warnings } = parse({ creator: "", madeFor: 7, origin: "javascript:alert(1)", downloads: 3.5, downloadsReadOn: "2026-10-07", benchSource: ["x"] });
    expect(lora?.id).toBe("uncensored");
    for (const k of ["creator", "madeFor", "origin", "downloads", "benchSource"]) expect(lora, k).not.toHaveProperty(k);
    expect(warnings).toHaveLength(5);
    expect(parse({ origin: "civitai.com/models/1" }).lora).not.toHaveProperty("origin");
  });

  it("keeps a made-for line whose date is malformed, and drops downloads that have no date", () => {
    const a = parse({ madeFor: "Uncut penises.", madeForReadOn: "16 Oct" });
    expect(a.lora).toMatchObject({ madeFor: "Uncut penises." });
    expect(a.lora).not.toHaveProperty("madeForReadOn");
    expect(a.warnings).toHaveLength(1);
    const b = parse({ downloads: 605 });
    expect(b.lora).not.toHaveProperty("downloads");
    expect(b.warnings[0]).toMatch(/no downloadsReadOn/);
  });

  it("cuts a made-for line over 200 characters to 200, ending with an ellipsis", () => {
    const { lora, warnings } = parse({ madeFor: "x".repeat(201) });
    expect(lora?.madeFor).toHaveLength(200);
    expect(lora?.madeFor?.endsWith("…")).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(parse({ madeFor: "y".repeat(200) }).lora?.madeFor).toBe("y".repeat(200));
  });

  it("keeps the abilities in order and drops or cuts the malformed parts, keeping the LoRA", () => {
    const { lora, warnings } = parse({
      abilities: [
        { subject: "Penis", claimed: "Uncut, a preview.", bench: "b".repeat(121) },
        { claimed: "no subject" },
        { subject: "penis", claimed: "a repeat in another case" },
        { subject: "S".repeat(25) },
        { subject: "Anus", claimed: null, bench: 4 },
        { subject: "3" }, { subject: "4" }, { subject: "5" }, { subject: "6" },
      ],
      benchSource: "  Assistant's review.  ",
    });
    expect(lora?.abilities?.map((a) => a.subject)).toEqual(["Penis", `${"S".repeat(23)}…`, "Anus", "3", "4", "5"]);
    expect(lora?.abilities?.[0]?.bench).toHaveLength(120);
    expect(lora?.abilities?.[2]).toEqual({ subject: "Anus" });
    expect(lora?.benchSource).toBe("Assistant's review.");
    // the long bench line, no subject, the repeat, the long subject, Anus's bench, and the seventh
    expect(warnings).toHaveLength(6);
    expect(parse({ abilities: "Penis" }).lora).not.toHaveProperty("abilities");
  });

  it("describes a LoRA for the capabilities with every field present, absent ones as null", () => {
    expect(loraInfo({ id: "a", label: "A", path: "/p", scale: 1 })).toEqual({ scale: 1, guidance: null, trigger: null, madeFor: null, madeForReadOn: null, creator: null, origin: null, downloads: null, downloadsReadOn: null, abilities: [], benchSource: null });
    expect(loraInfo({ id: "a", label: "A", path: "/p", scale: 0.8, guidance: 3, trigger: "t", abilities: [{ subject: "Penis", claimed: "c" }] })).toMatchObject({ scale: 0.8, guidance: 3, trigger: "t", abilities: [{ subject: "Penis", claimed: "c", bench: null }] });
  });

  it("the committed manifest describes every LoRA, and parses without a warning", () => {
    const warnings: string[] = [];
    const loras = parseManifest(readFileSync(new URL("../../loras.json", import.meta.url), "utf8"), "/l", (w) => warnings.push(w));
    expect(warnings).toEqual([]);
    expect(loras).toHaveLength(7);
    for (const l of loras) {
      expect(l.creator, l.id).toBeTruthy();
      expect(l.madeFor?.length ?? 0, l.id).toBeGreaterThan(0);
      expect(l.madeFor?.endsWith("…"), l.id).toBe(false);
      expect(l.madeForReadOn, l.id).toBe("2026-10-16");
      expect(l.abilities?.map((a) => a.subject), l.id).toEqual(["Penis", "Anus"]);
      if (l.abilities?.some((a) => a.bench !== undefined)) expect(l.benchSource, l.id).toBeTruthy();
    }
  });

  it("keeps the manifest's order, and the committed manifest is in order of downloads, most first (CHORE_006)", () => {
    expect(parseManifest(manifest([{ ...entry, id: "z" }, { ...entry, id: "a" }, { ...entry, id: "m" }]), "/l").map((l) => l.id)).toEqual(["z", "a", "m"]);
    const loras = parseManifest(readFileSync(new URL("../../loras.json", import.meta.url), "utf8"), "/l");
    const counts = loras.map((l) => l.downloads ?? -1);
    expect(counts.every((n) => n >= 0)).toBe(true);
    expect(counts).toEqual([...counts].sort((x, y) => y - x));
    for (const l of loras) expect(l.downloadsReadOn, l.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("installedLoras", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "qwen-loras-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("offers only the entries whose file has been fetched", () => {
    const file = path.join(dir, "loras.json");
    writeFileSync(file, manifest([entry, { ...entry, id: "missing" }]));
    mkdirSync(path.join(dir, "uncensored"));
    writeFileSync(path.join(dir, "uncensored", "qwen-image-2.1-uncensored-lora.safetensors"), "x");
    const warnings: string[] = [];
    expect(installedLoras(file, dir, (w) => warnings.push(w)).map((l) => l.id)).toEqual(["uncensored"]);
    expect(warnings[0]).toMatch(/missing is not fetched/);
  });

  it("has none without a manifest", () => {
    expect(installedLoras(path.join(dir, "nope.json"), dir)).toEqual([]);
  });
});

describe("withTrigger", () => {
  const lora = { id: "a", label: "A", path: "/p", scale: 1, trigger: "NSFW" };
  it("appends the trigger once, and leaves the prompt alone without one", () => {
    expect(withTrigger("a portrait", lora)).toBe("a portrait, NSFW");
    expect(withTrigger("an nsfw portrait", lora)).toBe("an nsfw portrait");
    expect(withTrigger("a portrait", { ...lora, trigger: undefined })).toBe("a portrait");
    expect(withTrigger("a portrait", undefined)).toBe("a portrait");
  });
});
