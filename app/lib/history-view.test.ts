import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "./history";
import { chatsOf, chatsOn, dayKey, dayOf, imageCount, longDate, parseDay, pastDays, shortDate, stepDay, timeOf, todaysChats, yesterdayOf, dayLabel, deleteChatMessage, finished, groupByDay, groupChatsByDay, isRunning, latestFinished, resultUrl, titleOf, turnHref } from "./history-view";

// Dates are derived from the clock, never fixed (CLAUDE.md §6b): "now" is whatever day the test runs.
const now = new Date();
const at = (daysAgo: number, hour = 12): string => {
  const d = new Date(now);
  d.setDate(now.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const entry = (id: string, createdAt: string, status: HistoryEntry["status"] = "done", chatId = id): HistoryEntry => ({
  id,
  chatId,
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

describe("chats in the sidebar (STORY_031)", () => {
  it("groups chats by the day of their newest turn", () => {
    // Chat a began yesterday and had a turn today; chat b is from yesterday only. History is newest first.
    const chats = chatsOf([entry("a2", at(0), "done", "a"), entry("b", at(1, 14)), entry("a", at(1, 10))]);
    expect(groupChatsByDay(chats, now).map((g) => [g.label, g.chats.map((c) => c.id)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
    ]);
  });

  it("opens an image in its chat at its turn", () => {
    expect(turnHref({ id: "j 2", chatId: "c 1" })).toBe("/g/c%201#j%202");
  });

  it("asks about a chat's images by count", () => {
    expect(deleteChatMessage(1)).toBe("Delete this chat and its image? This cannot be undone.");
    expect(deleteChatMessage(3)).toBe("Delete this chat and its 3 images? This cannot be undone.");
  });
});

describe("today and earlier days (STORY_032)", () => {
  // Chats: one begun yesterday with a turn today, one 2 days ago, two 4 days ago. Days come from the clock.
  const chats = () =>
    chatsOf([
      entry("t2", at(0, 9), "done", "t"),
      entry("b", at(2, 18)),
      entry("c2", at(4, 21)),
      entry("c1", at(4, 8)),
      entry("t", at(1, 23)),
    ]);
  const day = (daysAgo: number): string => dayKey(new Date(at(daysAgo)));

  it("keeps today's chats, including one begun yesterday with a turn today", () => {
    expect(todaysChats(chats(), now).map((c) => c.id)).toEqual(["t"]);
  });

  it("lists the earlier days that have chats, newest first, without today", () => {
    expect(pastDays(chats(), now)).toEqual([day(2), day(4)]);
  });

  it("gives a day's chats, newest first", () => {
    expect(chatsOn(chats(), day(4)).map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("steps over empty days each way, stops at each end, and steps from a day with no chats", () => {
    const days = [day(2), day(4), day(7)];
    expect(stepDay(days, day(2), "older")).toBe(day(4));
    expect(stepDay(days, day(4), "newer")).toBe(day(2));
    expect(stepDay(days, day(7), "older")).toBeNull();
    expect(stepDay(days, day(2), "newer")).toBeNull();
    expect(stepDay(days, day(3), "older")).toBe(day(4));
    expect(stepDay(days, day(3), "newer")).toBe(day(2));
  });

  it("reads day keys, refusing what is not a real day", () => {
    expect(parseDay(day(3)) && dayKey(parseDay(day(3)) ?? new Date(0))).toBe(day(3));
    for (const bad of ["2026-02-30", "26-10-16", "yesterday"]) expect(parseDay(bad), bad).toBeNull();
    expect(dayOf("not a date")).toBeNull();
    expect(yesterdayOf(now)).toBe(day(1));
  });

  it("writes a day long on desktop and short on the phone, with the year only when it is not this year", () => {
    const d = new Date(at(3));
    const long = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    expect(longDate(dayKey(d), now)).toBe(long);
    expect(shortDate(dayKey(d), now)).toBe(d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
    const lastYear = new Date(now.getFullYear() - 1, 5, 15);
    expect(longDate(dayKey(lastYear), now)).toContain(String(now.getFullYear() - 1));
  });

  it("writes the time of a turn and the image count", () => {
    const d = new Date(now);
    d.setHours(9, 5, 0, 0);
    expect(timeOf(d.toISOString())).toBe("09:05");
    expect(timeOf("nope")).toBe("");
    expect([imageCount(1), imageCount(3)]).toEqual(["1 image", "3 images"]);
  });
});
