import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "./history";
import { dayLabel, finished, groupByDay, isRunning, latestFinished, resultUrl, titleOf } from "./history-view";

// Dates are derived from the clock, never fixed (CLAUDE.md §6b): "now" is whatever day the test runs.
const now = new Date();
const at = (daysAgo: number, hour = 12): string => {
  const d = new Date(now);
  d.setDate(now.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const entry = (id: string, createdAt: string, status: HistoryEntry["status"] = "done"): HistoryEntry => ({
  id,
  lora: null,
  seed: null,
  loraScale: null,
  loraGuidance: null,
  promptSent: null,
  prompt: `prompt ${id}`,
  ratio: "1:1",
  model: "m",
  referenceImages: 0,
  createdAt,
  updatedAt: createdAt,
  status,
  progress: status === "done" ? 100 : 0,
  ...(status === "done" ? { result: { width: 64, height: 36, mimeType: "image/png" } } : {}),
});

describe("dayLabel", () => {
  it("says Today and Yesterday, then a short date, with the year only when it differs", () => {
    expect(dayLabel(at(0), now)).toBe("Today");
    expect(dayLabel(at(1), now)).toBe("Yesterday");
    expect(dayLabel(at(3), now)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(dayLabel(at(400), now)).toMatch(/, \d{4}$/);
    expect(dayLabel("not a date", now)).toBe("Earlier");
  });
});

describe("groupByDay", () => {
  it("groups consecutive entries by day and keeps their order", () => {
    const groups = groupByDay([entry("a", at(0, 14)), entry("b", at(0, 9)), entry("c", at(1)), entry("d", at(5))], now);
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      [dayLabel(at(5), now), ["d"]],
    ]);
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe("titles and filters", () => {
  it("takes the prompt's first non-empty line", () => {
    expect(titleOf("  a red bicycle \nmore detail")).toBe("a red bicycle");
    expect(titleOf("\n\n  second  ")).toBe("second");
    expect(titleOf("   ")).toBe("Untitled image");
  });

  it("keeps only finished images for the library, and the newest two for the sidebar", () => {
    const list = [entry("a", at(0), "running"), entry("b", at(0)), entry("c", at(1), "failed"), entry("d", at(2)), entry("e", at(3))];
    expect(finished(list).map((e) => e.id)).toEqual(["b", "d", "e"]);
    expect(latestFinished(list).map((e) => e.id)).toEqual(["b", "d"]);
    expect([entry("q", at(0), "queued"), entry("r", at(0), "running"), entry("x", at(0))].map(isRunning)).toEqual([true, true, false]);
  });

  it("points at the app's own result route", () => {
    expect(resultUrl("a b")).toBe("/api/jobs/a%20b/result");
  });
});
