import { describe, expect, it } from "vitest";
import { DEFAULT_SCRIPT, SCRIPTS, isScriptName, isTerminal, rejectsUpload, stepFor, type ScriptName } from "./scripts.ts";

const names = Object.keys(SCRIPTS).filter(isScriptName);

describe("scripts", () => {
  it("every script starts queued at 0", () => {
    for (const name of names) expect(stepFor(name, 0), name).toEqual({ status: "queued", progress: 0 });
  });

  it("progress never decreases in any script", () => {
    for (const name of names) {
      const steps = SCRIPTS[name].steps;
      for (let i = 1; i < steps.length; i++) expect(steps[i]?.progress ?? 0, `${name} step ${String(i)}`).toBeGreaterThanOrEqual(steps[i - 1]?.progress ?? 0);
    }
  });

  it("returns each step in order and holds the last one", () => {
    const s: ScriptName = "done-after-3-polls";
    expect([1, 2, 3].map((n) => stepFor(s, n))).toEqual([
      { status: "running", progress: 33 },
      { status: "running", progress: 66 },
      { status: "done", progress: 100 },
    ]);
    expect(stepFor(s, 99)).toEqual({ status: "done", progress: 100 });
    expect(stepFor(s, -5)).toEqual({ status: "queued", progress: 0 });
  });

  it("ends each script where its name says", () => {
    expect(stepFor("done-after-1-poll", 1).status).toBe("done");
    expect(stepFor("slow-done-after-10-polls", 9).status).toBe("running");
    expect(stepFor("slow-done-after-10-polls", 10).status).toBe("done");
    expect(stepFor("fails-after-2-polls", 2)).toMatchObject({ status: "failed", error: { code: "generation_failed" } });
    expect(stepFor("moderated", 1)).toMatchObject({ status: "failed", error: { code: "moderated" } });
    expect(stepFor("cancel-midway", 50)).toEqual({ status: "running", progress: 50 });
  });

  it("knows its names, its default and which script refuses uploads", () => {
    expect(isScriptName(DEFAULT_SCRIPT)).toBe(true);
    expect(isScriptName("nope")).toBe(false);
    expect(isScriptName("toString")).toBe(false);
    expect(rejectsUpload("rejects-upload")).toBe(true);
    expect(rejectsUpload("done-after-1-poll")).toBe(false);
  });

  it("calls exactly done, failed and cancelled terminal", () => {
    expect(["queued", "running", "done", "failed", "cancelled"].filter((s) => isTerminal(s as Parameters<typeof isTerminal>[0]))).toEqual(["done", "failed", "cancelled"]);
  });
});
