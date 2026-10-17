import { describe, expect, it } from "vitest";
import { addEntry, applyStatus, markCancelled, parseEntries, removeChat, removeEntry, type HistoryEntry } from "./history";
import { chatIdOf, chatsOf, turnsOf } from "./history-view";

const add = (list: readonly HistoryEntry[], id: string, createdAt: string, chatId = id): HistoryEntry[] =>
  addEntry(list, { id, chatId, prompt: `p ${id}`, ratio: "16:9", model: "qwen-image-2.1", referenceImages: 0, lora: null, createdAt });

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
    const made = addEntry([], { id: "a", chatId: "a", prompt: "p", ratio: "1:1", model: "m", referenceImages: 0, lora: "uncensored", createdAt: "2026-09-29T10:00:00.000Z" });
    expect(parseEntries(JSON.stringify(made))[0]?.lora).toBe("uncensored");
    const old = [{ id: "o", prompt: "p", ratio: "1:1", model: "m", referenceImages: 0, createdAt: "2026-09-26T10:00:00.000Z", updatedAt: "2026-09-26T10:00:00.000Z", status: "done", progress: 100 }];
    expect(parseEntries(JSON.stringify(old))[0]?.lora).toBeNull();
  });
});

describe("what made it, in history (STORY_024)", () => {
  const echo = { prompt: "p", ratio: "1:1", model: "m", seed: 42, referenceImages: 0, lora: "x", loraScale: 0.8, loraGuidance: null, promptSent: "p, t" };

  it("starts with nothing recorded, then keeps the seed and the add-on's settings from the first echo, through a save", () => {
    let list = add([], "a", "t0");
    expect(list[0]).toMatchObject({ seed: null, loraScale: null, loraGuidance: null, promptSent: null });
    list = applyStatus(list, { id: "a", status: "running", progress: 10, request: echo }, "t1");
    list = applyStatus(list, { id: "a", status: "done", progress: 100 }, "t2");
    expect(list[0]).toMatchObject({ seed: 42, loraScale: 0.8, loraGuidance: null, promptSent: "p, t", status: "done" });
    expect(parseEntries(JSON.stringify(list))[0]).toMatchObject({ seed: 42, loraScale: 0.8, loraGuidance: null, promptSent: "p, t" });
  });

  it("keeps the seed from a server before contract v1.3, and leaves its add-on fields unrecorded", () => {
    const list = applyStatus(add([], "a", "t0"), { id: "a", status: "running", progress: 10, request: { prompt: "p", ratio: "1:1", model: "m", seed: 7, referenceImages: 0 } }, "t1");
    expect(list[0]).toMatchObject({ seed: 7, loraScale: null, loraGuidance: null, promptSent: null });
  });

  it("reads an entry saved before this story as having none of them", () => {
    const old = [{ id: "o", prompt: "p", ratio: "1:1", model: "m", referenceImages: 0, lora: "x", createdAt: "t0", updatedAt: "t0", status: "done", progress: 100 }];
    expect(parseEntries(JSON.stringify(old))[0]).toMatchObject({ seed: null, loraScale: null, loraGuidance: null, promptSent: null });
  });
});

describe("chats in history (STORY_031)", () => {
  // Chat x: x (t1), x2 (t3), x3 (t5), all done. Chat y: y (t2) done, y2 (t4) still queued. Newest first, as kept.
  const all = (): HistoryEntry[] => {
    let list: HistoryEntry[] = [];
    list = add(list, "x", "t1");
    list = add(list, "y", "t2");
    list = add(list, "x2", "t3", "x");
    list = add(list, "y2", "t4", "y");
    list = add(list, "x3", "t5", "x");
    return list.map((e) => (e.id === "y2" ? e : { ...e, status: "done" }));
  };

  it("reads an entry saved before chats as a chat of one, under its own id", () => {
    const old = [{ id: "o", prompt: "p", ratio: "1:1", model: "m", referenceImages: 0, createdAt: "t0", updatedAt: "t0", status: "done", progress: 100 }];
    expect(parseEntries(JSON.stringify(old))[0]?.chatId).toBe("o");
  });

  it("lists a chat's turns oldest first, and turns of the same millisecond in the order they were added", () => {
    expect(turnsOf(all(), "x").map((e) => e.id)).toEqual(["x", "x2", "x3"]);
    let same: HistoryEntry[] = [];
    same = add(same, "zzz", "t9", "c");
    same = add(same, "aaa", "t9", "c");
    same = add(same, "c", "t0", "c");
    expect(turnsOf(same, "c").map((e) => e.id)).toEqual(["c", "zzz", "aaa"]);
  });

  it("finds a later turn's chat, and none for an unknown job", () => {
    expect(chatIdOf(all(), "y2")).toBe("y");
    expect(chatIdOf(all(), "nope")).toBeNull();
  });

  it("summarises one chat per row: titled by its first turn, ordered by its newest, with its count and running turns", () => {
    expect(chatsOf(all())).toEqual([
      { id: "x", prompt: "p x", newestAt: "t5", count: 3, running: false, runningIds: [] },
      { id: "y", prompt: "p y", newestAt: "t4", count: 2, running: true, runningIds: ["y2"] },
    ]);
  });

  it("removes a whole chat, refuses while a turn is queued, and removes nothing for an unknown chat", () => {
    expect(removeChat(all(), "x")).toMatchObject({ removed: 3 });
    expect(removeChat(all(), "x").entries.map((e) => e.id)).toEqual(["y2", "y"]);
    expect(removeChat(all(), "y")).toMatchObject({ removed: 0, refused: "running" });
    expect(removeChat(all(), "nope")).toMatchObject({ removed: 0 });
  });

  it("keeps a chat under its id when its first image is removed, titled by the next turn", () => {
    const left = removeEntry(all(), "x").entries;
    expect(turnsOf(left, "x").map((e) => e.id)).toEqual(["x2", "x3"]);
    expect(chatsOf(left)[0]).toMatchObject({ id: "x", prompt: "p x2", count: 2 });
  });
});
