import { describe, expect, it } from "vitest";
import { bindProblem } from "./bind.ts";

describe("bindProblem (STORY_036)", () => {
  it("lets loopback listen without a key", () => {
    for (const host of ["127.0.0.1", "::1", "localhost", " LOCALHOST "]) expect(bindProblem(host, undefined)).toBeNull();
  });

  it("refuses every other host without a key, naming MODEL_API_KEY and the fix", () => {
    for (const host of ["0.0.0.0", "::", "10.0.0.5"]) {
      const problem = bindProblem(host, undefined) ?? "";
      expect(problem).toContain(`refusing to listen on ${host} without MODEL_API_KEY`);
      expect(problem).toContain("Fix: set MODEL_API_KEY");
    }
    expect(bindProblem("0.0.0.0", "")).not.toBeNull();
  });

  it("lets any host listen with a key", () => {
    expect(bindProblem("0.0.0.0", "k")).toBeNull();
  });
});
