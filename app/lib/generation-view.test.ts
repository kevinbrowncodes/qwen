import { describe, expect, it } from "vitest";
import { MODERATED, noticeFor, skeletonSize, statusLine, STOPPED } from "./generation-view";

describe("generation view", () => {
  it("words the notices", () => {
    expect(noticeFor({ status: "failed", error: { code: "moderated", message: "x" } })).toBe(MODERATED);
    expect(noticeFor({ status: "failed", error: { code: "generation_failed", message: "out of memory" } })).toBe("The generation failed: out of memory");
    expect(noticeFor({ status: "failed" })).toBe("The generation failed: no reason given");
    expect(noticeFor({ status: "cancelled" })).toBe(STOPPED);
    expect(noticeFor({ status: "done" })).toBeNull();
    expect(noticeFor({ status: "running" })).toBeNull();
  });

  it("says Queued or Generating while it runs, and nothing after", () => {
    expect(["queued", "running", "done", "failed"].map(statusLine)).toEqual(["Queued", "Generating", null, null]);
  });

  it("sizes the skeleton at 400 wide for the ratio, 16:9 for an edit", () => {
    expect(skeletonSize("16:9")).toEqual({ width: 400, height: 225 });
    expect(skeletonSize("1:1")).toEqual({ width: 400, height: 400 });
    expect(skeletonSize("9:16")).toEqual({ width: 400, height: 711 });
    expect(skeletonSize(null)).toEqual({ width: 400, height: 225 });
    expect(skeletonSize("weird")).toEqual({ width: 400, height: 225 });
  });
});
