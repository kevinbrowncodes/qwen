import { describe, expect, it } from "vitest";
import { BusyError, Jobs, RESTARTED } from "./jobs.ts";

const req = { prompt: "p", ratio: "1:1", model: "qwen-image-2.1", seed: 1, referenceImages: 0, lora: null, loraScale: null, loraGuidance: null, promptSent: "p" };
let tick = 0;
const clock = (): string => `2026-09-26T00:00:${String(tick++).padStart(2, "0")}.000Z`;

describe("Jobs", () => {
  it("runs one at a time, oldest first", () => {
    const jobs = new Jobs(8, clock);
    jobs.add("a", req);
    jobs.add("b", req);
    expect(jobs.next()?.id).toBe("a");
    jobs.start("a");
    expect(jobs.next()).toBeUndefined();
    jobs.done("a", { file: "a.png", width: 1, height: 1, sizeBytes: 1 });
    expect(jobs.next()?.id).toBe("b");
  });

  it("answers busy beyond the waiting limit, counting only waiting jobs", () => {
    const jobs = new Jobs(2, clock);
    jobs.add("a", req);
    jobs.start("a");
    jobs.add("b", req);
    jobs.add("c", req);
    expect(() => jobs.add("d", req)).toThrow(BusyError);
  });

  it("keeps progress below 100 and never lets it fall", () => {
    const jobs = new Jobs(8, clock);
    jobs.add("a", req);
    jobs.start("a");
    jobs.progress("a", 50);
    jobs.progress("a", 20);
    jobs.progress("a", 150);
    expect(jobs.get("a")?.progress).toBe(99);
    jobs.done("a", { file: "a.png", width: 1, height: 1, sizeBytes: 1 });
    expect(jobs.get("a")).toMatchObject({ status: "done", progress: 100 });
  });

  it("makes a terminal state final", () => {
    const jobs = new Jobs(8, clock);
    jobs.add("a", req);
    jobs.fail("a", "OOM");
    jobs.start("a");
    jobs.done("a", { file: "a.png", width: 1, height: 1, sizeBytes: 1 });
    expect(jobs.get("a")).toMatchObject({ status: "failed", error: { code: "generation_failed", message: "OOM" } });
  });

  it("cancels a queued job at once, and a running one with a signal to the worker", () => {
    const jobs = new Jobs(8, clock);
    jobs.add("a", req);
    jobs.add("b", req);
    jobs.start("a");
    expect(jobs.cancel("b")).toBe("removed-from-queue");
    expect(jobs.cancel("a")).toBe("signal-worker");
    expect(jobs.cancel("a")).toBe("already-terminal");
    expect(jobs.cancel("zzz")).toBe("unknown");
    expect(jobs.get("a")?.status).toBe("cancelled");
    expect(jobs.next()).toBeUndefined();
  });

  it("survives a restart: finished jobs keep their result, unfinished ones fail", () => {
    const jobs = new Jobs(8, clock);
    jobs.add("done", req, ["/tmp/ref.png"]);
    jobs.start("done");
    jobs.done("done", { file: "done.png", width: 64, height: 36, sizeBytes: 9 });
    jobs.add("running", req);
    jobs.start("running");
    jobs.add("queued", req);
    const index = jobs.toIndex();
    expect(index).not.toContain("/tmp/ref.png");
    const back = Jobs.fromIndex(index, 8, clock);
    expect(back.get("done")).toMatchObject({ status: "done", result: { file: "done.png" } });
    expect(back.get("running")).toMatchObject({ status: "failed", error: { message: RESTARTED } });
    expect(back.get("queued")?.status).toBe("failed");
    expect(back.next()).toBeUndefined();
  });

  it("reads a missing, corrupt or odd index as empty or skips what is odd", () => {
    expect(Jobs.fromIndex("{").all()).toEqual([]);
    expect(Jobs.fromIndex('{"a":1}').all()).toEqual([]);
    expect(Jobs.fromIndex('[1, {"id":"x"}, {"id":"y","request":{},"status":"weird"}]').all()).toEqual([]);
  });

  it("reads a job saved before add-ons existed as having none, and keeps one that named an add-on (STORY_019)", () => {
    const old = '[{"id":"o","request":{"prompt":"p","ratio":"1:1","model":"m","seed":1,"referenceImages":0},"status":"done","progress":100}]';
    expect(Jobs.fromIndex(old).get("o")?.request.lora).toBeNull();
    const withAddOn = '[{"id":"n","request":{"prompt":"p","ratio":"1:1","model":"m","seed":1,"referenceImages":0,"lora":"uncensored"},"status":"done","progress":100}]';
    expect(Jobs.fromIndex(withAddOn).get("n")?.request.lora).toBe("uncensored");
  });

  it("reads a job saved before STORY_024 as having no recorded settings, and keeps those recorded after", () => {
    const old = '[{"id":"o","request":{"prompt":"p","ratio":"1:1","model":"m","seed":1,"referenceImages":0,"lora":"x"},"status":"done","progress":100}]';
    expect(Jobs.fromIndex(old).get("o")?.request).toMatchObject({ lora: "x", loraScale: null, loraGuidance: null, promptSent: "p" });
    const kept = '[{"id":"n","request":{"prompt":"p","ratio":"1:1","model":"m","seed":1,"referenceImages":0,"lora":"x","loraScale":0.9,"loraGuidance":4,"promptSent":"p, t"},"status":"done","progress":100}]';
    expect(Jobs.fromIndex(kept).get("n")?.request).toMatchObject({ loraScale: 0.9, loraGuidance: 4, promptSent: "p, t" });
  });
});
