import { describe, expect, it } from "vitest";
import { encode, LineSplitter, parseWorkerLine, progressFor } from "./protocol.ts";

describe("worker protocol", () => {
  it("encodes one JSON object per line", () => {
    expect(encode({ type: "cancel", id: "a" })).toBe('{"type":"cancel","id":"a"}\n');
    expect(JSON.parse(encode({ type: "init", loras: [{ id: "x", path: "/loras/x/x.safetensors" }] }))).toEqual({ type: "init", loras: [{ id: "x", path: "/loras/x/x.safetensors" }] });
  });

  it("carries a job's add-on with its guidance only when the add-on has one (STORY_021)", () => {
    const job = { type: "job" as const, id: "j", prompt: "p", seed: 1, steps: 40, references: [], output: "/o/j.png" };
    expect(JSON.parse(encode({ ...job, lora: { id: "x", scale: 1, guidance: 3 } }))).toMatchObject({ lora: { id: "x", scale: 1, guidance: 3 } });
    expect(JSON.parse(encode({ ...job, lora: { id: "x", scale: 1 } }))).toEqual({ ...job, lora: { id: "x", scale: 1 } });
    expect(JSON.parse(encode(job))).toEqual(job);
  });

  it("parses every message the worker sends", () => {
    // A worker from before STORY_019 reports no add-ons; one after lists those that loaded, ignoring non-strings.
    expect(parseWorkerLine('{"type":"ready"}')).toEqual({ type: "ready", loras: [] });
    expect(parseWorkerLine('{"type":"ready","loras":["uncensored",3,""]}')).toEqual({ type: "ready", loras: ["uncensored"] });
    expect(parseWorkerLine('{"type":"progress","id":"a","step":3,"steps":40}')).toEqual({ type: "progress", id: "a", step: 3, steps: 40 });
    expect(parseWorkerLine('{"type":"done","id":"a","path":"/o/a.png","width":64,"height":36}')).toMatchObject({ type: "done", width: 64 });
    expect(parseWorkerLine('{"type":"failed","id":"a","message":"OOM"}')).toEqual({ type: "failed", id: "a", message: "OOM" });
    expect(parseWorkerLine('{"type":"failed","id":"a"}')).toEqual({ type: "failed", id: "a", message: "The model failed." });
    expect(parseWorkerLine('{"type":"cancelled","id":"a"}')).toEqual({ type: "cancelled", id: "a" });
  });

  it("ignores log noise and malformed messages", () => {
    for (const line of ["Loading pipeline components...", "[1,2]", '{"type":"progress","id":"a","step":-1,"steps":40}', '{"type":"progress","id":"a","step":1,"steps":0}', '{"type":"done","id":"a"}', '{"type":"failed"}', '{"type":"cancelled","id":""}', '{"type":"nope"}', "null"]) {
      expect(parseWorkerLine(line), line).toBeNull();
    }
  });

  it("splits a stream into whole lines, holding a partial one", () => {
    const s = new LineSplitter();
    expect(s.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(s.push(':2}\r\n\n')).toEqual(['{"b":2}']);
    expect(s.push("tail")).toEqual([]);
  });

  it("reports progress below 100 until done, never decreasing", () => {
    expect(progressFor(0, 40, 0)).toBe(0);
    expect(progressFor(20, 40, 0)).toBe(50);
    expect(progressFor(40, 40, 0)).toBe(99);
    expect(progressFor(1, 40, 60)).toBe(60);
  });
});
