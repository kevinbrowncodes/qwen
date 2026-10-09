import { describe, expect, it } from "vitest";
import { forget, recall, recallBatch, remember, rememberBatch } from "./pending";

describe("pending", () => {
  it("remembers a started generation's request until forgotten", () => {
    const req = { prompt: "p", ratio: "1:1", model: "m", lora: null, references: [] };
    expect(recall("x")).toBeUndefined();
    remember("x", req);
    expect(recall("x")).toBe(req);
    forget("x");
    expect(recall("x")).toBeUndefined();
  });

  it("keeps the jobs sent after the first, in order, under the first's id (STORY_025)", () => {
    expect(recallBatch("first")).toEqual([]);
    rememberBatch("first", ["second", "third"]);
    expect(recallBatch("first")).toEqual(["second", "third"]);
    rememberBatch("lonely", []);
    expect(recallBatch("lonely")).toEqual([]);
  });
});
