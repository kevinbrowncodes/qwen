import { describe, expect, it } from "vitest";
import { forget, recall, remember } from "./pending";

describe("pending", () => {
  it("remembers a started generation's request until forgotten", () => {
    const req = { prompt: "p", ratio: "1:1", model: "m", lora: null, references: [] };
    expect(recall("x")).toBeUndefined();
    remember("x", req);
    expect(recall("x")).toBe(req);
    forget("x");
    expect(recall("x")).toBeUndefined();
  });
});
