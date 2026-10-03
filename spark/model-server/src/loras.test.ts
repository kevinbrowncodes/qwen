import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installedLoras, parseManifest, withTrigger } from "./loras.ts";

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
