import { describe, expect, it, vi } from "vitest";
import { initialState } from "./composer-state";
import { batchMessage, buildBody, requestFrom, submitBatch, submitGeneration, SUBMIT_FAILED, type GenerationRequest, type SubmitOutcome } from "./submit";

const a = new File(["a"], "a.png", { type: "image/png" });
const b = new File(["b"], "b.png", { type: "image/png" });

describe("requestFrom", () => {
  it("trims the prompt, keeps the ratio without references and drops it with them", () => {
    const base = { ...initialState(), text: "  a cat ", ratio: "1:1" };
    expect(requestFrom(base)).toEqual({ prompt: "a cat", ratio: "1:1", model: "qwen-image-2.1", lora: null, references: [] });
    const edit = { ...base, references: [{ key: "1", file: a }, { key: "2", file: b }] };
    expect(requestFrom(edit)).toMatchObject({ ratio: null, references: [a, b] });
    expect(requestFrom({ ...edit, editRatio: "9:16" })).toMatchObject({ ratio: "9:16" });
  });
});

describe("buildBody", () => {
  it("sends JSON without references", () => {
    const { body, headers } = buildBody({ prompt: "p", ratio: "16:9", model: "m", lora: null, references: [] });
    expect(headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(typeof body === "string" ? body : "{}")).toEqual({ prompt: "p", ratio: "16:9", model: "m" });
  });

  it("sends multipart with the files in order and no ratio", () => {
    const { body, headers } = buildBody({ prompt: "p", ratio: null, model: "m", lora: null, references: [a, b] });
    expect(headers).toEqual({});
    expect(body).toBeInstanceOf(FormData);
    const form = body instanceof FormData ? body : new FormData();
    expect(form.getAll("referenceImage").map((f) => (f instanceof File ? f.name : ""))).toEqual(["a.png", "b.png"]);
    expect(form.has("ratio")).toBe(false);
    expect(form.get("prompt")).toBe("p");
  });

  it("sends an edit's chosen ratio in the form (STORY_017)", () => {
    const { body } = buildBody({ prompt: "p", ratio: "1:1", model: "m", lora: null, references: [a] });
    expect(body instanceof FormData ? body.get("ratio") : null).toBe("1:1");
  });
});

describe("add-ons (STORY_019)", () => {
  it("None sends no lora, in JSON and in a form", () => {
    expect(requestFrom({ ...initialState(), text: "x" }).lora).toBeNull();
    const json = buildBody({ prompt: "p", ratio: "1:1", model: "m", lora: null, references: [] }).body;
    expect(JSON.parse(typeof json === "string" ? json : "{}")).not.toHaveProperty("lora");
    const form = buildBody({ prompt: "p", ratio: null, model: "m", lora: null, references: [a] }).body;
    expect(form instanceof FormData ? form.has("lora") : true).toBe(false);
  });

  it("an add-on sends its id, in JSON and in a form", () => {
    expect(requestFrom({ ...initialState(), text: "x", lora: "uncensored" }).lora).toBe("uncensored");
    const json = buildBody({ prompt: "p", ratio: "1:1", model: "m", lora: "uncensored", references: [] }).body;
    expect(JSON.parse(typeof json === "string" ? json : "{}")).toMatchObject({ lora: "uncensored" });
    const form = buildBody({ prompt: "p", ratio: null, model: "m", lora: "uncensored", references: [a] }).body;
    expect(form instanceof FormData ? form.get("lora") : null).toBe("uncensored");
  });
});

describe("a seed (STORY_024)", () => {
  it("is sent in JSON and in a form when given, and not when absent", () => {
    const json = buildBody({ prompt: "p", ratio: "1:1", model: "m", lora: null, references: [], seed: 42 }).body;
    expect(JSON.parse(typeof json === "string" ? json : "{}")).toMatchObject({ seed: 42 });
    const zero = buildBody({ prompt: "p", ratio: "1:1", model: "m", lora: null, references: [], seed: 0 }).body;
    expect(JSON.parse(typeof zero === "string" ? zero : "{}")).toMatchObject({ seed: 0 });
    const form = buildBody({ prompt: "p", ratio: null, model: "m", lora: null, references: [a], seed: 42 }).body;
    expect(form instanceof FormData ? form.get("seed") : null).toBe("42");
    const none = buildBody({ prompt: "p", ratio: "1:1", model: "m", lora: null, references: [] }).body;
    expect(JSON.parse(typeof none === "string" ? none : "{}")).not.toHaveProperty("seed");
    const noneForm = buildBody({ prompt: "p", ratio: null, model: "m", lora: null, references: [a] }).body;
    expect(noneForm instanceof FormData ? noneForm.has("seed") : true).toBe(false);
  });
});

describe("submitGeneration", () => {
  const req = { prompt: "p", ratio: "1:1", model: "m", lora: null, references: [] };
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

describe("submitBatch (STORY_025)", () => {
  const req: GenerationRequest = { prompt: "a kite", ratio: "16:9", model: "qwen-image-2.1", lora: null, references: [] };

  /** A fake create that answers in order, and records when each call started and finished. */
  function fake(answers: readonly SubmitOutcome[]) {
    const log: string[] = [];
    const sent: GenerationRequest[] = [];
    let n = 0;
    const submitOne = async (r: GenerationRequest): Promise<SubmitOutcome> => {
      const i = n++;
      log.push(`start ${String(i)}`);
      sent.push(r);
      await Promise.resolve();
      log.push(`end ${String(i)}`);
      return answers[i] ?? { ok: false, message: "unexpected" };
    };
    return { submitOne, log, sent };
  }

  it("sends a count of 3 one after another, with no seed, and returns the ids in order", async () => {
    const f = fake([
      { ok: true, id: "a" },
      { ok: true, id: "b" },
      { ok: true, id: "c" },
    ]);
    expect(await submitBatch(req, 3, f.submitOne)).toEqual({ ids: ["a", "b", "c"], message: null });
    expect(f.log).toEqual(["start 0", "end 0", "start 1", "end 1", "start 2", "end 2"]);
    expect(f.sent.every((r) => r === req && !("seed" in r))).toBe(true);
  });

  it("stops at the first refusal and sends no more", async () => {
    const f = fake([{ ok: true, id: "a" }, { ok: true, id: "b" }, { ok: false, message: "full" }, { ok: true, id: "never" }]);
    expect(await submitBatch(req, 4, f.submitOne)).toEqual({ ids: ["a", "b"], message: "full" });
    expect(f.sent).toHaveLength(3);
  });

  it("returns no ids when the first is refused", async () => {
    const f = fake([{ ok: false, message: "full" }]);
    expect(await submitBatch(req, 2, f.submitOne)).toEqual({ ids: [], message: "full" });
  });

  it("a count of 1 is exactly one create of the request given", async () => {
    const f = fake([{ ok: true, id: "a" }]);
    expect(await submitBatch(req, 1, f.submitOne)).toEqual({ ids: ["a"], message: null });
    expect(f.sent).toEqual([req]);
  });

  it("says how many went when a count was stopped part-way", () => {
    expect(batchMessage({ ids: ["a", "b"], message: "Full." }, 4)).toBe("Queued 2 of 4. Full.");
    expect(batchMessage({ ids: [], message: "Full." }, 4)).toBe("Full.");
    expect(batchMessage({ ids: ["a"], message: null }, 1)).toBeNull();
  });
});
