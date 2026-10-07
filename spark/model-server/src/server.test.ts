import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RESTARTED } from "./jobs.ts";
import type { Lora } from "./loras.ts";
import { createModelServer, WORKER_STOPPED, type ModelServer } from "./server.ts";

const FAKE = fileURLToPath(new URL("./fake-worker.ts", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../../../tools/stub-generation-server/fixtures/", import.meta.url));
const result = readFileSync(path.join(FIXTURES, "result.png"));
const reference = readFileSync(path.join(FIXTURES, "reference.png"));
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

let dir = "";
let log = "";
let model: ModelServer | null = null;
let base = "";

async function start(extra: { apiKey?: string; maxQueued?: number; loras?: readonly Lora[] } = {}): Promise<void> {
  process.env["FAKE_LOG"] = log;
  model = createModelServer({ outputDir: dir, workerCommand: ["node", FAKE], restartDelayMs: 50, log: () => undefined, ...extra });
  base = `http://127.0.0.1:${String(await model.listen(0))}`;
  await until(async () => (await json(await fetch(`${base}/health`, { headers: auth(extra.apiKey) })))["ready"] === true);
}
const auth = (key?: string): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});

beforeEach(() => {
  delete process.env["FAKE_LORA_FAIL"];
  dir = mkdtempSync(path.join(tmpdir(), "qwen-model-"));
  log = path.join(dir, "worker.log");
});
afterEach(async () => {
  await model?.close();
  model = null;
  rmSync(dir, { recursive: true, force: true });
});

type Json = Record<string, unknown>;
async function json(res: Response): Promise<Json> {
  const body: unknown = await res.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
  return { ...body };
}
async function until(check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out");
}
const create = async (body: unknown): Promise<string> => {
  const res = await fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  expect(res.status).toBe(202);
  return String((await json(res))["id"]);
};
const status = async (id: string): Promise<Json> => json(await fetch(`${base}/jobs/${id}`));
const terminal = async (id: string): Promise<Json> => {
  let last: Json = {};
  await until(async () => {
    last = await status(id);
    return ["done", "failed", "cancelled"].includes(String(last["status"]));
  });
  return last;
};
const sentToWorker = (): Array<Record<string, unknown>> =>
  existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];

describe("the model server", () => {
  it("answers health and the capabilities with the seven ratios", async () => {
    await start();
    expect(await json(await fetch(`${base}/health`))).toMatchObject({ ok: true, server: "qwen-model", ready: true });
    const caps = await json(await fetch(`${base}/capabilities`));
    expect(caps).toMatchObject({ defaultRatio: "16:9", models: [{ id: "qwen-image-2.1" }] });
    expect(Array.isArray(caps["ratios"]) ? caps["ratios"].length : 0).toBe(7);
  });

  it("runs a text-to-image job to done at the ratio's size and serves the image", async () => {
    await start();
    const id = await create({ prompt: "a red bicycle", ratio: "16:9", seed: 42 });
    const done = await terminal(id);
    expect(done).toMatchObject({ status: "done", progress: 100, request: { prompt: "a red bicycle", ratio: "16:9", seed: 42 }, result: { url: `/jobs/${id}/result`, mimeType: "image/png", width: 64, height: 36, sizeBytes: result.length } });
    expect(sentToWorker()[0]).toMatchObject({ type: "job", id, width: 1376, height: 768, steps: 40, seed: 42, references: [] });
    const img = await fetch(`${base}/jobs/${id}/result`);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(sha(new Uint8Array(await img.arrayBuffer()))).toBe(sha(result));
  });

  it("hands an edit's references to the worker as files, with no size, and removes them after", async () => {
    await start();
    const form = new FormData();
    form.set("prompt", "make it blue");
    form.append("referenceImage", new Blob([new Uint8Array(reference)], { type: "image/png" }), "a.png");
    form.append("referenceImage", new Blob([new Uint8Array(reference)], { type: "image/jpeg" }), "b.jpg");
    const res = await fetch(`${base}/jobs`, { method: "POST", body: form });
    expect(res.status).toBe(202);
    const id = String((await json(res))["id"]);
    await terminal(id);
    const job = sentToWorker()[0] ?? {};
    expect(job["width"]).toBeUndefined();
    const refs = Array.isArray(job["references"]) ? job["references"] : [];
    expect(refs.map((r) => path.basename(String(r)))).toEqual(["01.png", "02.jpg"]);
    expect(existsSync(path.join(dir, "uploads", id))).toBe(false);
    expect(await status(id)).toMatchObject({ request: { ratio: null, referenceImages: 2 } });
  });

  it("gives an edit that names a ratio that ratio's size (v1.1, STORY_017)", async () => {
    await start();
    const form = new FormData();
    form.set("prompt", "make it square");
    form.set("ratio", "1:1");
    form.append("referenceImage", new Blob([new Uint8Array(reference)], { type: "image/png" }), "a.png");
    const res = await fetch(`${base}/jobs`, { method: "POST", body: form });
    const id = String((await json(res))["id"]);
    await terminal(id);
    expect(sentToWorker()[0]).toMatchObject({ type: "job", id, width: 1024, height: 1024 });
    expect(await status(id)).toMatchObject({ request: { ratio: "1:1", referenceImages: 1 } });
  });

  it("queues jobs in order, one at a time", async () => {
    await start();
    const a = await create({ prompt: "slow first", ratio: "1:1" });
    const b = await create({ prompt: "second", ratio: "1:1" });
    expect(await status(b)).toMatchObject({ status: "queued", progress: 0 });
    await terminal(a);
    await terminal(b);
    expect(sentToWorker().filter((m) => m["type"] === "job").map((m) => m["id"])).toEqual([a, b]);
  });

  it("cancels a running job on both sides, and the worker moves on", async () => {
    await start();
    const a = await create({ prompt: "slow", ratio: "1:1" });
    await until(async () => (await status(a))["status"] === "running");
    const del = await fetch(`${base}/jobs/${a}`, { method: "DELETE" });
    expect(del.status).toBe(202);
    expect(await status(a)).toMatchObject({ status: "cancelled" });
    await until(() => sentToWorker().some((m) => m["type"] === "cancel" && m["id"] === a));
    const b = await create({ prompt: "next", ratio: "1:1" });
    expect(await terminal(b)).toMatchObject({ status: "done" });
    expect(await status(a)).toMatchObject({ status: "cancelled" });
    const again = await fetch(`${base}/jobs/${a}`, { method: "DELETE" });
    expect(again.status).toBe(409);
  });

  it("cancels a queued job without the worker ever seeing it", async () => {
    await start();
    const a = await create({ prompt: "slow", ratio: "1:1" });
    const b = await create({ prompt: "never runs", ratio: "1:1" });
    expect((await fetch(`${base}/jobs/${b}`, { method: "DELETE" })).status).toBe(202);
    await fetch(`${base}/jobs/${a}`, { method: "DELETE" });
    await until(() => sentToWorker().some((m) => m["type"] === "cancel"));
    expect(sentToWorker().some((m) => m["type"] === "job" && m["id"] === b)).toBe(false);
  });

  it("reports a failure with the worker's message", async () => {
    await start();
    const id = await create({ prompt: "this will fail", ratio: "1:1" });
    expect(await terminal(id)).toMatchObject({ status: "failed", error: { code: "generation_failed", message: "CUDA out of memory (scripted)" } });
    expect((await fetch(`${base}/jobs/${id}/result`)).status).toBe(409);
  });

  it("fails the running job when the worker dies, restarts it, and the next job succeeds", async () => {
    await start();
    const a = await create({ prompt: "crash now", ratio: "1:1" });
    expect(await terminal(a)).toMatchObject({ status: "failed", error: { message: WORKER_STOPPED } });
    const b = await create({ prompt: "the next one", ratio: "1:1" });
    expect(await terminal(b)).toMatchObject({ status: "done" });
  });

  it("keeps finished jobs across a restart and fails the unfinished ones", async () => {
    await start();
    const done = await create({ prompt: "keep me", ratio: "1:1" });
    await terminal(done);
    const running = await create({ prompt: "slow", ratio: "1:1" });
    await until(async () => (await status(running))["status"] === "running");
    await model?.close();
    await start();
    expect(await status(done)).toMatchObject({ status: "done" });
    expect((await fetch(`${base}/jobs/${done}/result`)).status).toBe(200);
    expect(await status(running)).toMatchObject({ status: "failed", error: { message: RESTARTED } });
    expect(readdirSync(dir)).toContain("jobs.json");
  });

  it("answers busy beyond the waiting limit", async () => {
    await start({ maxQueued: 1 });
    await create({ prompt: "slow", ratio: "1:1" });
    await create({ prompt: "waiting", ratio: "1:1" });
    const res = await fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "one too many", ratio: "1:1" }) });
    expect(res.status).toBe(503);
    expect(await json(res)).toMatchObject({ error: { code: "busy" } });
    for (const j of model?.jobs.all() ?? []) await fetch(`${base}/jobs/${j.id}`, { method: "DELETE" });
  });

  it("requires the bearer key when one is set", async () => {
    await start({ apiKey: "sekret" });
    expect((await fetch(`${base}/capabilities`)).status).toBe(401);
    expect((await fetch(`${base}/capabilities`, { headers: auth("sekret") })).status).toBe(200);
  });

  it("refuses what the contract refuses", async () => {
    await start();
    const post = (body: string, type: string) => fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": type }, body });
    expect((await post("hi", "text/plain")).status).toBe(415);
    expect((await post("{", "application/json")).status).toBe(400);
    expect((await post("[1]", "application/json")).status).toBe(400);
    expect((await post(JSON.stringify({ prompt: "x", ratio: "21:9" }), "application/json")).status).toBe(400);
    for (const p of ["/jobs/nope", "/jobs/nope/result", "/nowhere"]) expect((await fetch(`${base}${p}`)).status, p).toBe(404);
    expect((await fetch(`${base}/jobs/nope`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("add-ons (STORY_019)", () => {
  const detail: Lora = { id: "fake-detail", label: "Fake detail", path: "/loras/fake-detail/d.safetensors", scale: 0.8, trigger: "sharp focus", guidance: 3 };
  const style: Lora = { id: "fake-style", label: "Fake style", path: "/loras/fake-style/s.safetensors", scale: 1 };
  const jobs = (): Array<Record<string, unknown>> => sentToWorker().filter((m) => m["type"] === "job");

  it("tells the worker what to load, and offers only what it reports loaded", async () => {
    process.env["FAKE_LORA_FAIL"] = "fake-style";
    await start({ loras: [detail, style] });
    await until(async () => (await json(await fetch(`${base}/capabilities`)))["loras"] !== undefined);
    expect(sentToWorker()[0]).toEqual({ type: "init", loras: [{ id: "fake-detail", path: detail.path }, { id: "fake-style", path: style.path }] });
    await until(async () => JSON.stringify((await json(await fetch(`${base}/capabilities`)))["loras"]) === JSON.stringify([{ id: "fake-detail", label: "Fake detail" }]));
    const res = await fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "x", ratio: "1:1", lora: "fake-style" }) });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: { code: "unsupported_option", field: "lora" } });
  });

  it("sends a job its add-on with the manifest's strength, trigger words and guidance, and the next job none", async () => {
    await start({ loras: [detail, style] });
    await until(async () => JSON.stringify((await json(await fetch(`${base}/capabilities`)))["loras"]) === JSON.stringify([{ id: "fake-detail", label: "Fake detail" }, { id: "fake-style", label: "Fake style" }]));
    const a = await create({ prompt: "a portrait", ratio: "1:1", lora: "fake-detail" });
    expect(await terminal(a)).toMatchObject({ status: "done", request: { prompt: "a portrait", lora: "fake-detail" } });
    const b = await create({ prompt: "a portrait", ratio: "1:1" });
    expect(await terminal(b)).toMatchObject({ status: "done", request: { lora: null } });
    const c = await create({ prompt: "a portrait", ratio: "1:1", lora: "fake-style" });
    expect(await terminal(c)).toMatchObject({ status: "done", request: { lora: "fake-style" } });
    const [first, second, third] = jobs();
    expect(first).toMatchObject({ id: a, prompt: "a portrait, sharp focus" });
    expect(first?.["lora"]).toEqual({ id: "fake-detail", scale: 0.8, guidance: 3 });
    expect(second).toMatchObject({ id: b, prompt: "a portrait" });
    expect(second?.["lora"]).toBeUndefined();
    // An add-on with no guidance leaves the pipeline's default alone (STORY_021).
    expect(third?.["lora"]).toEqual({ id: "fake-style", scale: 1 });
  });

  it("echoes what the add-on contributed and sends the worker the PNG's settings text (STORY_024)", async () => {
    await start({ loras: [detail, style] });
    await until(async () => JSON.stringify((await json(await fetch(`${base}/capabilities`)))["loras"]) === JSON.stringify([{ id: "fake-detail", label: "Fake detail" }, { id: "fake-style", label: "Fake style" }]));
    const a = await create({ prompt: "a red bicycle", ratio: "3:4", seed: 7, lora: "fake-detail" });
    expect(await terminal(a)).toMatchObject({ request: { lora: "fake-detail", loraScale: 0.8, loraGuidance: 3, promptSent: "a red bicycle, sharp focus" } });
    const b = await create({ prompt: "a red bicycle", ratio: "3:4", lora: "fake-style" });
    expect(await terminal(b)).toMatchObject({ request: { loraScale: 1, loraGuidance: null, promptSent: "a red bicycle" } });
    const c = await create({ prompt: "a red bicycle", ratio: "3:4" });
    expect(await terminal(c)).toMatchObject({ request: { lora: null, loraScale: null, loraGuidance: null, promptSent: "a red bicycle" } });
    const [first, , third] = jobs();
    expect(first?.["parameters"]).toEqual({ lines: ["Prompt: a red bicycle", "Sent: a red bicycle, sharp focus", "Model: Qwen-Image 2.1", "Size: 3:4", "Seed: 7", "Add-on: Fake detail · strength 0.8 · guidance 3"], sizeLine: 3 });
    expect(JSON.stringify(third?.["parameters"])).toContain('"Add-on: None"');
  });

  it("keeps a finished job's recorded settings when the server restarts with a changed strength (STORY_024)", async () => {
    await start({ loras: [detail] });
    await until(async () => JSON.stringify((await json(await fetch(`${base}/capabilities`)))["loras"]) === JSON.stringify([{ id: "fake-detail", label: "Fake detail" }]));
    const a = await create({ prompt: "a red bicycle", ratio: "1:1", lora: "fake-detail" });
    await terminal(a);
    await model?.close();
    await start({ loras: [{ ...detail, scale: 0.5, guidance: undefined }] });
    expect((await status(a))["request"]).toMatchObject({ loraScale: 0.8, loraGuidance: 3 });
  });

  it("offers none and sends no init without add-ons", async () => {
    await start();
    expect(await json(await fetch(`${base}/capabilities`))).toMatchObject({ loras: [] });
    await terminal(await create({ prompt: "x", ratio: "1:1" }));
    expect(sentToWorker().some((m) => m["type"] === "init")).toBe(false);
  });

  it("fails a waiting job whose add-on did not load again after the worker restarted", async () => {
    await start({ loras: [detail] });
    await until(async () => JSON.stringify((await json(await fetch(`${base}/capabilities`)))["loras"]) === JSON.stringify([{ id: "fake-detail", label: "Fake detail" }]));
    process.env["FAKE_LORA_FAIL"] = "fake-detail"; // the restarted worker inherits it
    const crash = await create({ prompt: "crash now", ratio: "1:1" });
    const waiting = await create({ prompt: "a portrait", ratio: "1:1", lora: "fake-detail" });
    expect(await terminal(crash)).toMatchObject({ status: "failed" });
    expect(await terminal(waiting)).toMatchObject({ status: "failed", error: { message: "The add-on fake-detail is not loaded on the model server." } });
    expect(jobs().some((m) => m["id"] === waiting)).toBe(false);
  });
});
