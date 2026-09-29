/**
 * STORY_007 integration lane: the app's route handlers against the stub generation server, in-process, with history
 * in a real temp file. Each test points MODEL_BASE_URL at the stub; the handlers read it through lib/config per call.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStubServer, DEFAULT_FIXTURES_DIR, type StubServer } from "stub-generation-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as getCapabilities } from "@/app/api/capabilities/route";
import { DELETE as deleteHistory } from "@/app/api/history/[id]/route";
import { GET as getHistory } from "@/app/api/history/route";
import { DELETE as cancelJob, GET as getJob } from "@/app/api/jobs/[id]/route";
import { GET as getResult } from "@/app/api/jobs/[id]/result/route";
import { POST as createJob } from "@/app/api/jobs/route";
import { parseEntries } from "@/lib/history";
import { NOT_CONFIGURED, NOT_REACHABLE } from "@/lib/model-client";

const result = readFileSync(path.join(DEFAULT_FIXTURES_DIR, "result.png"));
const reference = readFileSync(path.join(DEFAULT_FIXTURES_DIR, "reference.png"));
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

type Json = Record<string, unknown>;
async function json(res: Response): Promise<Json> {
  const body: unknown = await res.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
  return { ...body };
}
function field(o: Json, key: string): unknown {
  return o[key];
}

let stub: StubServer;
let stubUrl = "";
let dir = "";
let historyPath = "";
const stored = () => parseEntries(readFileSync(historyPath, "utf8"));

beforeAll(async () => {
  stub = createStubServer();
  stubUrl = `http://127.0.0.1:${String(await stub.listen(0))}`;
});
afterAll(async () => {
  await stub.close();
});
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "qwen-int-"));
  historyPath = path.join(dir, "history.json");
  process.env["MODEL_BASE_URL"] = stubUrl;
  process.env["HISTORY_FILE"] = historyPath;
  delete process.env["MODEL_API_KEY"];
  stub.reset();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["MODEL_BASE_URL"];
  delete process.env["HISTORY_FILE"];
});

const post = (body: unknown, script?: string): Promise<Response> =>
  createJob(new Request(`http://app/api/jobs${script ? `?script=${script}` : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
async function create(script?: string): Promise<string> {
  const res = await post({ prompt: " a red bicycle ", ratio: "16:9" }, script);
  expect(res.status).toBe(202);
  return String(field(await json(res), "id"));
}
const status = async (id: string): Promise<Json> => json(await getJob(new Request(`http://app/api/jobs/${id}`), ctx(id)));
const stubJobs = async (): Promise<unknown[]> => {
  const body = await json(await fetch(`${stubUrl}/__stub/jobs`));
  const jobs = field(body, "jobs");
  const list: unknown[] = Array.isArray(jobs) ? jobs : [];
  return list;
};
const edit = (files: Array<{ name: string; type: string; bytes: Uint8Array }>, script?: string): Promise<Response> => {
  const form = new FormData();
  form.set("prompt", "make it blue");
  form.set("ratio", "1:1");
  for (const f of files) form.append("referenceImage", new Blob([new Uint8Array(f.bytes)], { type: f.type }), f.name);
  return createJob(new Request(`http://app/api/jobs${script ? `?script=${script}` : ""}`, { method: "POST", body: form }));
};

describe("capabilities", () => {
  it("passes the server's capabilities through", async () => {
    const res = await getCapabilities();
    expect(await json(res)).toMatchObject({ defaultRatio: "16:9", referenceImages: { max: 10 } });
  });
});

describe("create, status, result", () => {
  it("polls to done, rewrites the result URL, and serves the fixture inline and as a download", async () => {
    const id = await create();
    expect(stored()[0]).toMatchObject({ id, prompt: "a red bicycle", ratio: "16:9", status: "queued" });
    expect(await status(id)).toMatchObject({ status: "running", progress: 33 });
    await status(id);
    const done = await status(id);
    expect(done).toMatchObject({ status: "done", result: { url: `/api/jobs/${id}/result`, mimeType: "image/png", width: 64, height: 36 } });
    expect(stored()[0]).toMatchObject({ status: "done", result: { width: 64, height: 36 } });

    const inline = await getResult(new Request(`http://app/api/jobs/${id}/result`), ctx(id));
    expect(inline.headers.get("content-type")).toBe("image/png");
    expect(inline.headers.get("content-disposition")).toBe(`inline; filename="qwen-${id.replace(/-/g, "").slice(0, 8)}.png"`);
    expect(sha(new Uint8Array(await inline.arrayBuffer()))).toBe(sha(result));
    const download = await getResult(new Request(`http://app/api/jobs/${id}/result?download=1`), ctx(id));
    expect(download.headers.get("content-disposition")).toMatch(/^attachment; filename="qwen-/);
  });

  it("relays the result's 409 before done", async () => {
    const id = await create("cancel-midway");
    const res = await getResult(new Request(`http://app/api/jobs/${id}/result`), ctx(id));
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ error: { code: "not_done" } });
    await cancelJob(new Request(`http://app/api/jobs/${id}`), ctx(id));
  });

  it.each([
    ["fails-after-2-polls", "generation_failed"],
    ["moderated", "moderated"],
  ])("%s passes %s through to the browser and to history", async (script, code) => {
    const id = await create(script);
    let last: Json = {};
    for (let i = 0; i < 3; i++) last = await status(id);
    expect(last).toMatchObject({ status: "failed", error: { code } });
    expect(stored()[0]).toMatchObject({ status: "failed", error: { code } });
  });

  it("relays the server's validation errors unchanged", async () => {
    const res = await post({ prompt: "x", ratio: "21:9" });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: { code: "unsupported_option", field: "ratio" } });
    expect(existsHistory()).toBe(false);
  });

  it("refuses a body that is neither JSON nor multipart", async () => {
    const res = await createJob(new Request("http://app/api/jobs", { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" }));
    expect(res.status).toBe(415);
  });
});

function existsHistory(): boolean {
  try {
    readFileSync(historyPath);
    return true;
  } catch {
    return false;
  }
}

describe("cancel", () => {
  it("cancels mid-way, keeps the job in history as cancelled, and relays the second cancel's 409", async () => {
    const id = await create("cancel-midway");
    await status(id);
    await status(id);
    const res = await cancelJob(new Request(`http://app/api/jobs/${id}`), ctx(id));
    expect(res.status).toBe(202);
    expect(await json(res)).toEqual({ id, status: "cancelled", progress: 25 });
    expect(stored()[0]).toMatchObject({ id, status: "cancelled", progress: 25 });
    expect(await status(id)).toMatchObject({ status: "cancelled" });
    const again = await cancelJob(new Request(`http://app/api/jobs/${id}`), ctx(id));
    expect(again.status).toBe(409);
    expect(await json(again)).toMatchObject({ error: { code: "already_terminal" } });
  });
});

describe("edits", () => {
  it("forwards two references unchanged, and the ratio the edit named (contract v1.1, STORY_017)", async () => {
    const second = new Uint8Array([...reference]);
    second[second.length - 1] = 0;
    const res = await edit([{ name: "a.png", type: "image/png", bytes: reference }, { name: "b.png", type: "image/png", bytes: second }]);
    expect(res.status).toBe(202);
    const id = String(field(await json(res), "id"));
    const received = await json(await fetch(`${stubUrl}/__stub/jobs/${id}/received`));
    expect(field(received, "uploads")).toEqual([
      { filename: "a.png", contentType: "image/png", size: reference.length, sha256: sha(reference) },
      { filename: "b.png", contentType: "image/png", size: second.length, sha256: sha(second) },
    ]);
    expect(stored()[0]).toMatchObject({ id, ratio: "1:1", referenceImages: 2 });
    expect(field(received, "request")).toMatchObject({ ratio: "1:1" });
  });

  it("records an edit that matches its reference with no ratio", async () => {
    const form = new FormData();
    form.set("prompt", "keep the shape");
    form.set("ratio", "match");
    form.append("referenceImage", new Blob([new Uint8Array(reference)], { type: "image/png" }), "a.png");
    const res = await createJob(new Request("http://app/api/jobs", { method: "POST", body: form }));
    expect(res.status).toBe(202);
    const id = String(field(await json(res), "id"));
    expect(stored()[0]).toMatchObject({ id, ratio: null });
    const received = await json(await fetch(`${stubUrl}/__stub/jobs/${id}/received`));
    expect(field(received, "request")).toMatchObject({ ratio: null });
  });

  it("passes the stub's add-ons through in the capabilities (contract v1.2, STORY_019)", async () => {
    expect(await json(await getCapabilities())).toMatchObject({ loras: [{ id: "fake-detail", label: "Fake detail" }, { id: "fake-style", label: "Fake style" }] });
  });

  it("forwards an add-on in JSON and in an edit's form, and records it; none records null (STORY_019)", async () => {
    const withAddOn = await post({ prompt: "a portrait", ratio: "1:1", model: "qwen-image-2.1", lora: "fake-detail" });
    expect(withAddOn.status).toBe(202);
    const a = String(field(await json(withAddOn), "id"));
    expect(field(await json(await fetch(`${stubUrl}/__stub/jobs/${a}/received`)), "request")).toMatchObject({ lora: "fake-detail" });
    expect(stored().find((e) => e.id === a)).toMatchObject({ lora: "fake-detail" });

    const form = new FormData();
    form.set("prompt", "make it blue");
    form.set("lora", "fake-style");
    form.append("referenceImage", new Blob([new Uint8Array(reference)], { type: "image/png" }), "a.png");
    const edited = await createJob(new Request("http://app/api/jobs", { method: "POST", body: form }));
    expect(edited.status).toBe(202);
    const b = String(field(await json(edited), "id"));
    expect(field(await json(await fetch(`${stubUrl}/__stub/jobs/${b}/received`)), "request")).toMatchObject({ lora: "fake-style" });
    expect(stored().find((e) => e.id === b)).toMatchObject({ lora: "fake-style" });

    const plain = await post({ prompt: "a portrait", ratio: "1:1", model: "qwen-image-2.1", lora: "none" });
    const c = String(field(await json(plain), "id"));
    expect(stored().find((e) => e.id === c)).toMatchObject({ lora: null });
  });

  it("relays the server's refusal of an add-on it does not offer, and records nothing", async () => {
    const res = await post({ prompt: "a portrait", ratio: "1:1", model: "qwen-image-2.1", lora: "not-installed" });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: { code: "unsupported_option", field: "lora" } });
  });

  it("refuses eleven references, or a GIF, without reaching the server", async () => {
    const png = { name: "a.png", type: "image/png", bytes: reference };
    const eleven = await edit(Array.from({ length: 11 }, () => png));
    expect(eleven.status).toBe(400);
    expect(await json(eleven)).toMatchObject({ error: { code: "validation", field: "referenceImage" } });
    const gif = await edit([{ name: "a.gif", type: "image/gif", bytes: new TextEncoder().encode("GIF89a....") }]);
    expect(gif.status).toBe(415);
    expect(await stubJobs()).toEqual([]);
    expect(existsHistory()).toBe(false);
  });

  it("relays the server's refusal of an upload", async () => {
    const res = await edit([{ name: "a.png", type: "image/png", bytes: reference }], "rejects-upload");
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: { field: "referenceImage" } });
  });
});

describe("when the server is missing, unreachable or off-contract", () => {
  it("answers 503 busy when MODEL_BASE_URL is not set", async () => {
    delete process.env["MODEL_BASE_URL"];
    const res = await getCapabilities();
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ error: { code: "busy", message: NOT_CONFIGURED } });
  });

  it("answers 503 busy when the server does not answer, without naming it", async () => {
    process.env["MODEL_BASE_URL"] = "http://127.0.0.1:9";
    const res = await post({ prompt: "x", ratio: "1:1" });
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body).toEqual({ error: { code: "busy", message: NOT_REACHABLE } });
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
  });

  it("answers 502 bad_gateway when the server answers outside the contract", async () => {
    // Every path lands on the stub's /health, whose 200 is not a job.
    process.env["MODEL_BASE_URL"] = `${stubUrl}/health?`;
    const res = await status("nope");
    expect(res).toMatchObject({ error: { code: "bad_gateway" } });
  });
});

describe("bearer auth", () => {
  it("passes MODEL_API_KEY to a server that requires it", async () => {
    const locked = createStubServer({ apiKey: "sekret" });
    const url = `http://127.0.0.1:${String(await locked.listen(0))}`;
    try {
      process.env["MODEL_BASE_URL"] = url;
      expect((await getCapabilities()).status).toBe(401);
      process.env["MODEL_API_KEY"] = "sekret";
      expect((await getCapabilities()).status).toBe(200);
    } finally {
      await locked.close();
    }
  });
});

describe("history", () => {
  it("brings an unwatched generation to its real state when history is read (BUG_006)", async () => {
    const id = await create("done-after-1-poll");
    // Nobody polls the job; reading history asks the server.
    const listed = await json(await getHistory());
    const entries = field(listed, "entries");
    const list: unknown[] = Array.isArray(entries) ? entries : [];
    const mine = list.find((e) => typeof e === "object" && e !== null && "id" in e && e.id === id);
    expect(mine).toMatchObject({ status: "done" });
    expect(stored()[0]).toMatchObject({ id, status: "done" });
  });

  it("lists newest first, and removes a finished entry but not a running one", async () => {
    const first = await create("done-after-1-poll");
    const second = await create("cancel-midway");
    await status(first);
    const listed = await json(await getHistory());
    const entries = field(listed, "entries");
    expect(Array.isArray(entries) ? entries.map((e: unknown) => (typeof e === "object" && e !== null && "id" in e ? e.id : null)) : []).toEqual([second, first]);

    const running = await deleteHistory(new Request(`http://app/api/history/${second}`), ctx(second));
    expect(running.status).toBe(409);
    const removed = await deleteHistory(new Request(`http://app/api/history/${first}`), ctx(first));
    expect(await json(removed)).toEqual({ id: first, removed: true });
    expect(stored().map((e) => e.id)).toEqual([second]);
    expect((await deleteHistory(new Request("http://app/api/history/nope"), ctx("nope"))).status).toBe(404);
    await cancelJob(new Request(`http://app/api/jobs/${second}`), ctx(second));
  });
});
