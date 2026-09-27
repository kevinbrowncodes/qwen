import { describe, expect, it, vi } from "vitest";
import { initialState } from "./composer-state";
import { buildBody, requestFrom, submitGeneration, SUBMIT_FAILED } from "./submit";

const a = new File(["a"], "a.png", { type: "image/png" });
const b = new File(["b"], "b.png", { type: "image/png" });

describe("requestFrom", () => {
  it("trims the prompt, keeps the ratio without references and drops it with them", () => {
    const base = { ...initialState(), text: "  a cat ", ratio: "1:1" };
    expect(requestFrom(base)).toEqual({ prompt: "a cat", ratio: "1:1", model: "qwen-image-2.1", references: [] });
    const edit = { ...base, references: [{ key: "1", file: a }, { key: "2", file: b }] };
    expect(requestFrom(edit)).toMatchObject({ ratio: null, references: [a, b] });
    expect(requestFrom({ ...edit, editRatio: "9:16" })).toMatchObject({ ratio: "9:16" });
  });
});

describe("buildBody", () => {
  it("sends JSON without references", () => {
    const { body, headers } = buildBody({ prompt: "p", ratio: "16:9", model: "m", references: [] });
    expect(headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(typeof body === "string" ? body : "{}")).toEqual({ prompt: "p", ratio: "16:9", model: "m" });
  });

  it("sends multipart with the files in order and no ratio", () => {
    const { body, headers } = buildBody({ prompt: "p", ratio: null, model: "m", references: [a, b] });
    expect(headers).toEqual({});
    expect(body).toBeInstanceOf(FormData);
    const form = body instanceof FormData ? body : new FormData();
    expect(form.getAll("referenceImage").map((f) => (f instanceof File ? f.name : ""))).toEqual(["a.png", "b.png"]);
    expect(form.has("ratio")).toBe(false);
    expect(form.get("prompt")).toBe("p");
  });

  it("sends an edit's chosen ratio in the form (STORY_017)", () => {
    const { body } = buildBody({ prompt: "p", ratio: "1:1", model: "m", references: [a] });
    expect(body instanceof FormData ? body.get("ratio") : null).toBe("1:1");
  });
});

describe("submitGeneration", () => {
  const req = { prompt: "p", ratio: "1:1", model: "m", references: [] };
  const respond = (status: number, body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("answers the job's id on 202", async () => {
    expect(await submitGeneration(req, respond(202, { id: "j1", status: "queued", progress: 0 }))).toEqual({ ok: true, id: "j1" });
  });

  it("answers the server's message on an error", async () => {
    expect(await submitGeneration(req, respond(503, { error: { code: "busy", message: "The generation server is not reachable" } }))).toEqual({ ok: false, message: "The generation server is not reachable" });
  });

  it("answers a generic message when the network fails or the body is not the contract's", async () => {
    expect(await submitGeneration(req, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))).toEqual({ ok: false, message: SUBMIT_FAILED });
    expect(await submitGeneration(req, vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>", { status: 500 })))).toEqual({ ok: false, message: SUBMIT_FAILED });
    expect(await submitGeneration(req, respond(202, { nope: true }))).toEqual({ ok: false, message: SUBMIT_FAILED });
  });
});
