import { describe, expect, it } from "vitest";
import { delayFor, isTerminalStatus } from "./polling";

describe("polling", () => {
  it("backs off from 1 s by 1.5× and caps at 4 s", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(delayFor)).toEqual([1000, 1500, 2250, 3375, 4000, 4000, 4000]);
    expect(delayFor(-1)).toBe(1000);
  });

  it("stops on done, failed and cancelled only", () => {
    expect(["queued", "running", "done", "failed", "cancelled", "weird", 3].map(isTerminalStatus)).toEqual([false, false, true, true, true, false, false]);
  });
});
