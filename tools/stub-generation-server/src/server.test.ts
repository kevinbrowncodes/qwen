import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createStubServer, type StubServer } from "./server.ts";

const result = readFileSync(new URL("../fixtures/result.png", import.meta.url));
const reference = readFileSync(new URL("../fixtures/reference.png", import.meta.url));
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

let stub: StubServer;
let base = "";
beforeAll(async () => {
  stub = createStubServer();
  base = `http://127.0.0.1:${String(await stub.listen(0))}`;
});
afterAll(async () => {
  await stub.close();
});
beforeEach(() => {
  stub.reset();
});

type Json = Record<string, unknown>;
const json = async (res: Response): Promise<Json> => {
  const body: unknown = await res.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
  return { ...body };
};
const create = (body: unknown, script?: string, headers: Record<string, string> = {}): Promise<Response> =>
  fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": "application/json", ...(script ? { "x-stub-script": script } : {}), ...headers }, body: JSON.stringify(body) });
const poll = async (id: string, times: number): Promise<Json> => {
  let last: Json = {};
  for (let i = 0; i < times; i++) last = await json(await fetch(`${base}/jobs/${id}`));
  return last;
};
const edit = (files: Array<{ name: string; type: string; bytes: Uint8Array }>, script?: string, extra: Record<string, string> = {}): Promise<Response> => {
  const form = new FormData();
  form.set("prompt", "make it blue");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  for (const f of files) form.append("referenceImage", new Blob([f.bytes], { type: f.type }), f.name);
  return fetch(`${base}/jobs${script ? `?script=${script}` : ""}`, { method: "POST", body: form });
};

describe("health and capabilities", () => {
  it("answers health", async () => {
    expect(await json(await fetch(`${base}/health`))).toMatchObject({ ok: true, server: "stub" });
  });

  it("lists the model, the seven ratios in the reference's order, and the reference limits", async () => {
    const caps = await json(await fetch(`${base}/capabilities`));
    expect(caps).toMatchObject({ defaultRatio: "16:9", prompt: { maxChars: 4000 }, referenceImages: { max: 10 } });
    expect(JSON.stringify(caps["ratios"])).toContain('"id":"16:9"');
    expect(Array.isArray(caps["ratios"]) ? caps["ratios"].length : 0).toBe(7);
  });
});

describe("text-to-image", () => {
  it("goes queued, running, done, then serves the fixture", async () => {
    const res = await create({ prompt: "  a red bicycle  ", ratio: "16:9", seed: 7 });
    expect(res.status).toBe(202);
    const { id } = await json(res);
    expect(typeof id).toBe("string");
    const ids = String(id);
    expect(await poll(ids, 1)).toMatchObject({ status: "running", progress: 33 });
    const done = await poll(ids, 2);
    expect(done).toMatchObject({
      status: "done",
      progress: 100,
      request: { prompt: "a red bicycle", ratio: "16:9", model: "qwen-image-2.1", seed: 7, referenceImages: 0 },
      result: { url: `/jobs/${ids}/result`, mimeType: "image/png", width: 64, height: 36, sizeBytes: result.length },
    });
    expect(done).not.toHaveProperty("error");
    const img = await fetch(`${base}/jobs/${ids}/result`);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("content-length")).toBe(String(result.length));
    expect(sha(new Uint8Array(await img.arrayBuffer()))).toBe(sha(result));
  });

  it("draws a seed when none is sent", async () => {
    const { id } = await json(await create({ prompt: "x", ratio: "1:1" }));
    const s = await poll(String(id), 1);
    const request = s["request"];
    expect(typeof request === "object" && request !== null && "seed" in request && Number.isInteger(request.seed)).toBe(true);
  });

  it.each([
    ["fails-after-2-polls", 2, "failed", "generation_failed"],
    ["moderated", 1, "failed", "moderated"],
  ])("%s ends %s with %s", async (script, polls, status, code) => {
    const { id } = await json(await create({ prompt: "x", ratio: "1:1" }, script));
    const s = await poll(String(id), polls + 3);
    expect(s).toMatchObject({ status, error: { code } });
    expect(s).not.toHaveProperty("result");
    expect((await fetch(`${base}/jobs/${String(id)}/result`)).status).toBe(409);
  });

  it("slow-done-after-10-polls is done on the tenth poll", async () => {
    const { id } = await json(await create({ prompt: "x", ratio: "1:1" }, "slow-done-after-10-polls"));
    expect((await poll(String(id), 9))["status"]).toBe("running");
    expect((await poll(String(id), 1))["status"]).toBe("done");
  });
});

describe("cancel", () => {
  it("cancels mid-way, stays cancelled, and refuses a second cancel", async () => {
    const { id } = await json(await create({ prompt: "x", ratio: "1:1" }, "cancel-midway"));
    const ids = String(id);
    await poll(ids, 2);
    const del = await fetch(`${base}/jobs/${ids}`, { method: "DELETE" });
    expect(del.status).toBe(202);
    expect(await json(del)).toEqual({ id: ids, status: "cancelled", progress: 25 });
    expect(await poll(ids, 3)).toMatchObject({ status: "cancelled", progress: 25 });
    const again = await fetch(`${base}/jobs/${ids}`, { method: "DELETE" });
    expect(again.status).toBe(409);
    expect(await json(again)).toMatchObject({ error: { code: "already_terminal" } });
  });

  it("refuses to cancel a finished job", async () => {
    const { id } = await json(await create({ prompt: "x", ratio: "1:1" }, "done-after-1-poll"));
    await poll(String(id), 1);
    expect((await fetch(`${base}/jobs/${String(id)}`, { method: "DELETE" })).status).toBe(409);
  });
});

describe("edits", () => {
  it("records two references by sha256, and the ratio the edit named (v1.1)", async () => {
    const other = new Uint8Array([...reference.subarray(0, reference.length - 1), 0]);
    const res = await edit([{ name: "a.png", type: "image/png", bytes: reference }, { name: "b.png", type: "image/png", bytes: other }], undefined, { ratio: "9:16" });
    expect(res.status).toBe(202);
    const { id } = await json(res);
    const received = await json(await fetch(`${base}/__stub/jobs/${String(id)}/received`));
    expect(received).toMatchObject({ request: { ratio: "9:16", referenceImages: 2 } });
    expect(received["uploads"]).toEqual([
      { filename: "a.png", contentType: "image/png", size: reference.length, sha256: sha(reference) },
      { filename: "b.png", contentType: "image/png", size: other.length, sha256: sha(other) },
    ]);
  });

  it("rejects-upload refuses a reference image", async () => {
    const res = await edit([{ name: "a.png", type: "image/png", bytes: reference }], "rejects-upload");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: { code: "validation", field: "referenceImage" } });
  });
});

describe("validation", () => {
  it.each([
    [{ ratio: "1:1" }, 400, "validation", "prompt"],
    [{ prompt: "   ", ratio: "1:1" }, 400, "validation", "prompt"],
    [{ prompt: "x".repeat(4001), ratio: "1:1" }, 400, "validation", "prompt"],
    [{ prompt: "x" }, 400, "validation", "ratio"],
    [{ prompt: "x", ratio: "21:9" }, 400, "unsupported_option", "ratio"],
    [{ prompt: "x", ratio: "1:1", model: "qwen-image-3" }, 400, "unsupported_option", "model"],
    [{ prompt: "x", ratio: "1:1", model: 5 }, 400, "validation", "model"],
    [{ prompt: "x", ratio: "1:1", seed: -1 }, 400, "validation", "seed"],
    [{ prompt: "x", ratio: "1:1", seed: 1.5 }, 400, "validation", "seed"],
    [{ prompt: "x", ratio: "1:1", seed: 4294967296 }, 400, "validation", "seed"],
  ])("%j answers %i %s on %s", async (body, status, code, field) => {
    const res = await create(body);
    expect(res.status).toBe(status);
    const answer = await json(res);
    expect(answer).toMatchObject({ error: { code, field } });
    const problem = answer["error"];
    expect(typeof problem === "object" && problem !== null && "message" in problem && typeof problem.message === "string").toBe(true);
  });

  it("accepts 4000 characters and a seed at the top of the range", async () => {
    expect((await create({ prompt: "x".repeat(4000), ratio: "1:1", seed: 4294967295 })).status).toBe(202);
  });

  it("refuses eleven references, a GIF, and a file over 20 MB", async () => {
    const png = { name: "a.png", type: "image/png", bytes: reference };
    const eleven = await edit(Array.from({ length: 11 }, () => png));
    expect(eleven.status).toBe(400);
    expect(await json(eleven)).toMatchObject({ error: { field: "referenceImage" } });
    const ten = await edit(Array.from({ length: 10 }, () => png));
    expect(ten.status).toBe(202);
    const gif = await edit([{ name: "a.gif", type: "image/gif", bytes: reference }]);
    expect(gif.status).toBe(415);
    const big = await edit([{ name: "big.png", type: "image/png", bytes: new Uint8Array(20 * 1024 * 1024 + 1) }]);
    expect(big.status).toBe(413);
  });

  it("refuses bodies that are neither JSON nor multipart, bad JSON, and an unknown script", async () => {
    expect((await fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" })).status).toBe(415);
    expect((await fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status).toBe(400);
    expect((await fetch(`${base}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: "[1]" })).status).toBe(400);
    const unknown = await create({ prompt: "x", ratio: "1:1" }, "nope");
    expect(await json(unknown)).toMatchObject({ error: { field: "script" } });
  });

  it("answers 404 for an unknown job, its result and an unknown route", async () => {
    for (const path of ["/jobs/nope", "/jobs/nope/result", "/nowhere", "/__stub/jobs/nope/received"]) {
      expect((await fetch(`${base}${path}`)).status, path).toBe(404);
    }
    expect((await fetch(`${base}/jobs/nope`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("busy, hooks and reset", () => {
  it("answers 503 busy while busy", async () => {
    await fetch(`${base}/__stub/busy`, { method: "POST", body: JSON.stringify({ busy: true }) });
    const res = await create({ prompt: "x", ratio: "1:1" });
    expect(res.status).toBe(503);
    expect(await json(res)).toMatchObject({ error: { code: "busy" } });
    await fetch(`${base}/__stub/busy`, { method: "POST", body: "" });
    expect((await create({ prompt: "x", ratio: "1:1" })).status).toBe(202);
    expect((await fetch(`${base}/__stub/busy`, { method: "POST", body: "{" })).status).toBe(400);
  });

  it("accepts the next k creates and then answers busy, until reset (STORY_025)", async () => {
    const set = await fetch(`${base}/__stub/busy`, { method: "POST", body: JSON.stringify({ afterAccepting: 2 }) });
    expect(await json(set)).toEqual({ busy: false, afterAccepting: 2 });
    expect((await create({ prompt: "a", ratio: "1:1" })).status).toBe(202);
    expect((await create({ prompt: "b", ratio: "1:1" })).status).toBe(202);
    const third = await create({ prompt: "c", ratio: "1:1" });
    expect(third.status).toBe(503);
    expect(await json(third)).toMatchObject({ error: { code: "busy" } });
    expect((await create({ prompt: "d", ratio: "1:1" })).status).toBe(503);
    await fetch(`${base}/__stub/reset`, { method: "POST" });
    expect((await create({ prompt: "e", ratio: "1:1" })).status).toBe(202);
    // A count that is not a whole number of at least 0 is ignored.
    expect(await json(await fetch(`${base}/__stub/busy`, { method: "POST", body: JSON.stringify({ afterAccepting: -1 }) }))).toEqual({ busy: false, afterAccepting: null });
  });

  it("lists jobs with their state and forgets them on reset", async () => {
    await create({ prompt: "x", ratio: "1:1" }, "cancel-midway");
    const listed = await json(await fetch(`${base}/__stub/jobs`));
    expect(listed["jobs"]).toEqual([expect.objectContaining({ script: "cancel-midway", status: "queued", progress: 0 })]);
    await fetch(`${base}/__stub/reset`, { method: "POST" });
    expect((await json(await fetch(`${base}/__stub/jobs`)))["jobs"]).toEqual([]);
  });
});

describe("bearer auth", () => {
  it("requires the key on the contract and never on hooks", async () => {
    const locked = createStubServer({ apiKey: "sekret" });
    const url = `http://127.0.0.1:${String(await locked.listen(0))}`;
    try {
      expect((await fetch(`${url}/capabilities`)).status).toBe(401);
      expect((await fetch(`${url}/capabilities`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
      expect((await fetch(`${url}/capabilities`, { headers: { authorization: "Bearer sekret" } })).status).toBe(200);
      expect((await fetch(`${url}/__stub/jobs`)).status).toBe(200);
    } finally {
      await locked.close();
    }
  });
});

describe("the contract's shared validation vectors (STORY_015)", () => {
  const vectors: unknown = JSON.parse(readFileSync(new URL("../../../docs/contracts/validation-vectors.json", import.meta.url), "utf8"));
  const cases: Array<{ body: Record<string, unknown>; status: number; code?: string; field?: string }> =
    typeof vectors === "object" && vectors !== null && "cases" in vectors && Array.isArray(vectors.cases) ? (vectors.cases as Array<{ body: Record<string, unknown>; status: number; code?: string; field?: string }>) : [];
  it.each(cases)("$body → $status", async (c) => {
    const p = c.body["prompt"];
    const m = typeof p === "string" ? /^REPEAT_(\d+)$/.exec(p) : null;
    const body = m?.[1] ? { ...c.body, prompt: "x".repeat(Number(m[1])) } : c.body;
    const res = await create(body);
    expect(res.status).toBe(c.status);
    if (c.status !== 202) expect(await json(res)).toMatchObject({ error: { code: c.code, field: c.field } });
  });
});

describe("the contract's shared add-on vectors (v1.2, STORY_019)", () => {
  const vectors: unknown = JSON.parse(readFileSync(new URL("../../../docs/contracts/validation-vectors.json", import.meta.url), "utf8"));
  type LoraCase = { body: Record<string, unknown>; status: number; lora?: string | null; code?: string; field?: string };
  const loraCases: LoraCase[] = typeof vectors === "object" && vectors !== null && "loraCases" in vectors && Array.isArray(vectors.loraCases) ? (vectors.loraCases as LoraCase[]) : [];
  it("offers the two fake add-ons", async () => {
    expect(await json(await fetch(`${base}/capabilities`))).toMatchObject({ loras: [{ id: "fake-detail" }, { id: "fake-style" }] });
  });
  it.each(loraCases)("add-on $body.lora → $status", async (c) => {
    const res = await create(c.body);
    expect(res.status).toBe(c.status);
    if (c.status !== 202) {
      expect(await json(res)).toMatchObject({ error: { code: c.code, field: c.field } });
      return;
    }
    const id = String((await json(res))["id"]);
    expect(await json(await fetch(`${base}/__stub/jobs/${id}/received`))).toMatchObject({ request: { lora: c.lora ?? null } });
  });
});

describe("the add-on's settings in the status echo (v1.3, STORY_024)", () => {
  const echo = async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const res = await create(body);
    expect(res.status).toBe(202);
    const id = String((await json(res))["id"]);
    const status = await json(await fetch(`${base}/jobs/${id}`));
    return status["request"] as Record<string, unknown>;
  };
  it("echoes the strength, guidance and the prompt with the trigger for an add-on that has them", async () => {
    expect(await echo({ prompt: "a portrait", ratio: "1:1", lora: "fake-detail" })).toMatchObject({ lora: "fake-detail", loraScale: 0.8, loraGuidance: 3, promptSent: "a portrait, sharp focus" });
  });
  it("leaves the trigger out when the prompt already has it", async () => {
    expect(await echo({ prompt: "a Sharp Focus portrait", ratio: "1:1", lora: "fake-detail" })).toMatchObject({ promptSent: "a Sharp Focus portrait" });
  });
  it("echoes a null guidance and the prompt unchanged for an add-on without them, and nulls without one", async () => {
    expect(await echo({ prompt: "a portrait", ratio: "1:1", lora: "fake-style" })).toMatchObject({ loraScale: 1, loraGuidance: null, promptSent: "a portrait" });
    expect(await echo({ prompt: "  a portrait  ", ratio: "1:1" })).toMatchObject({ lora: null, loraScale: null, loraGuidance: null, promptSent: "a portrait" });
  });
});

describe("the contract's shared edit vectors (v1.1, STORY_017)", () => {
  const vectors: unknown = JSON.parse(readFileSync(new URL("../../../docs/contracts/validation-vectors.json", import.meta.url), "utf8"));
  type EditCase = { body: Record<string, string>; status: number; ratio?: string | null; code?: string; field?: string };
  const edits: EditCase[] = typeof vectors === "object" && vectors !== null && "editCases" in vectors && Array.isArray(vectors.editCases) ? (vectors.editCases as EditCase[]) : [];
  it.each(edits)("edit $body → $status", async (c) => {
    const res = await edit([{ name: "a.png", type: "image/png", bytes: reference }], undefined, Object.fromEntries(Object.entries(c.body).filter(([k]) => k !== "prompt")));
    expect(res.status).toBe(c.status);
    if (c.status !== 202) {
      expect(await json(res)).toMatchObject({ error: { code: c.code, field: c.field } });
      return;
    }
    const id = String((await json(res))["id"]);
    expect(await json(await fetch(`${base}/__stub/jobs/${id}/received`))).toMatchObject({ request: { ratio: c.ratio ?? null } });
  });
});
