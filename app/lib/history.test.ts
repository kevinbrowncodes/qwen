import { describe, expect, it } from "vitest";
import { addEntry, applyStatus, markCancelled, parseEntries, removeEntry, type HistoryEntry } from "./history";

const add = (list: readonly HistoryEntry[], id: string, createdAt: string): HistoryEntry[] =>
  addEntry(list, { id, prompt: `p ${id}`, ratio: "16:9", model: "qwen-image-2.1", referenceImages: 0, lora: null, createdAt });

describe("history", () => {
  it("keeps one entry per id, newest first", () => {
    let list = add([], "a", "2026-09-26T10:00:00Z");
    list = add(list, "b", "2026-09-26T11:00:00Z");
    list = add(list, "a", "2026-09-26T09:00:00Z");
    expect(list.map((e) => e.id)).toEqual(["b", "a"]);
    expect(list[1]).toMatchObject({ status: "queued", progress: 0, updatedAt: "2026-09-26T09:00:00Z" });
  });

  it("keeps entries created in the same millisecond newest-added first, whatever their ids (BUG_005)", () => {
    const list = add(add([], "zzz", "2026-09-26T10:00:00.000Z"), "aaa", "2026-09-26T10:00:00.000Z");
    expect(list.map((e) => e.id)).toEqual(["aaa", "zzz"]);
    const other = add(add([], "aaa", "2026-09-26T10:00:00.000Z"), "zzz", "2026-09-26T10:00:00.000Z");
    expect(other.map((e) => e.id)).toEqual(["zzz", "aaa"]);
  });

  it("keeps that order through a save and a load", () => {
    const list = add(add([], "zzz", "2026-09-26T10:00:00.000Z"), "aaa", "2026-09-26T10:00:00.000Z");
    expect(parseEntries(JSON.stringify(list)).map((e) => e.id)).toEqual(["aaa", "zzz"]);
  });

  it("folds status answers in, with the result and the error", () => {
    let list = add([], "a", "t0");
    list = applyStatus(list, { id: "a", status: "running", progress: 33 }, "t1");
    expect(list[0]).toMatchObject({ status: "running", progress: 33, updatedAt: "t1" });
    list = applyStatus(list, { id: "a", status: "done", progress: 100, result: { url: "/r", mimeType: "image/png", width: 64, height: 36, sizeBytes: 9 } }, "t2");
    expect(list[0]).toMatchObject({ status: "done", result: { width: 64, height: 36, mimeType: "image/png" } });
    let failed = add([], "f", "t0");
    failed = applyStatus(failed, { id: "f", status: "failed", progress: 0, error: { code: "moderated", message: "no" } }, "t1");
    expect(failed[0]?.error).toEqual({ code: "moderated", message: "no" });
  });

  it("never lets a later non-terminal answer overwrite a terminal status", () => {
    let list = add([], "a", "t0");
    list = applyStatus(list, { id: "a", status: "done", progress: 100 }, "t1");
    list = applyStatus(list, { id: "a", status: "running", progress: 50 }, "t2");
    expect(list[0]).toMatchObject({ status: "done", progress: 100, updatedAt: "t1" });
  });

  it("keeps progress from going backwards", () => {
    let list = add([], "a", "t0");
    list = applyStatus(list, { id: "a", status: "running", progress: 66 }, "t1");
    list = applyStatus(list, { id: "a", status: "running", progress: 33 }, "t2");
    expect(list[0]?.progress).toBe(66);
  });

  it("keeps a cancelled job, marked cancelled, for good", () => {
    let list = add([], "a", "t0");
    list = markCancelled(list, "a", 25, "t1");
    list = applyStatus(list, { id: "a", status: "running", progress: 50 }, "t2");
    expect(list[0]).toMatchObject({ status: "cancelled", progress: 25 });
  });

  it("ignores status for an id it does not know", () => {
    const list = add([], "a", "t0");
    expect(applyStatus(list, { id: "zzz", status: "done", progress: 100 }, "t1")).toEqual(list);
  });

  it("removes a finished entry, refuses a running one, and treats an unknown id as a no-op", () => {
    let list = add(add([], "a", "t0"), "b", "t1");
    list = applyStatus(list, { id: "a", status: "done", progress: 100 }, "t2");
    expect(removeEntry(list, "b")).toMatchObject({ removed: false, refused: "running" });
    expect(removeEntry(list, "nope")).toEqual({ entries: list, removed: false });
    const out = removeEntry(list, "a");
    expect(out.removed).toBe(true);
    expect(out.entries.map((e) => e.id)).toEqual(["b"]);
  });

  it("reads a stored file, and treats anything else as empty", () => {
    const list = add([], "a", "t0");
    expect(parseEntries(JSON.stringify(list))).toEqual(list);
    expect(parseEntries("{")).toEqual([]);
    expect(parseEntries('{"a":1}')).toEqual([]);
    expect(parseEntries('[{"id":1},null]')).toEqual([]);
  });
});

describe("add-ons in history (STORY_019)", () => {
  it("keeps the add-on an entry was made with, and reads an entry saved before add-ons as none", () => {
    const made = addEntry([], { id: "a", prompt: "p", ratio: "1:1", model: "m", referenceImages: 0, lora: "uncensored", createdAt: "2026-09-29T10:00:00.000Z" });
    expect(parseEntries(JSON.stringify(made))[0]?.lora).toBe("uncensored");
    const old = [{ id: "o", prompt: "p", ratio: "1:1", model: "m", referenceImages: 0, createdAt: "2026-09-26T10:00:00.000Z", updatedAt: "2026-09-26T10:00:00.000Z", status: "done", progress: 100 }];
    expect(parseEntries(JSON.stringify(old))[0]?.lora).toBeNull();
  });
});
