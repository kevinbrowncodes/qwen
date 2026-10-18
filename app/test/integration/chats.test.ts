/**
 * STORY_033 integration lane: renaming a chat through PATCH /api/chats/:id, against history in a real temp file. No
 * generation server is needed: a rename only touches the history file.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteChat, PATCH as renameChat } from "@/app/api/chats/[id]/route";
import { GET as getHistory } from "@/app/api/history/route";
import { parseEntries, type HistoryEntry } from "@/lib/history";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: string): Promise<Response> => renameChat(new Request(`http://local/api/chats/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body }), ctx(id));

const turn = (id: string, chatId: string, createdAt: string, status: HistoryEntry["status"] = "done"): HistoryEntry => ({
  id,
  chatId,
  prompt: `prompt ${id}`,
  ratio: "1:1",
  model: "m",
  referenceImages: 0,
  lora: null,
  seed: null,
  loraScale: null,
  loraGuidance: null,
  promptSent: null,
  createdAt,
  updatedAt: createdAt,
  status,
  progress: status === "done" ? 100 : 0,
});

let dir = "";
let historyPath = "";
const stored = (): HistoryEntry[] => parseEntries(readFileSync(historyPath, "utf8"));
const raw = (): string => readFileSync(historyPath, "utf8");

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "qwen-int-chats-"));
  historyPath = path.join(dir, "history.json");
  process.env["HISTORY_FILE"] = historyPath;
  // Chat "a": a then a2. Chat "b": one turn.
  writeFileSync(historyPath, JSON.stringify([turn("b", "b", "2026-01-03T00:00:00Z"), turn("a2", "a", "2026-01-02T00:00:00Z"), turn("a", "a", "2026-01-01T00:00:00Z")]));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["HISTORY_FILE"];
});

async function errorCode(res: Response): Promise<unknown> {
  const body: unknown = await res.json();
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "code" in body.error ? body.error.code : undefined;
}

describe("PATCH /api/chats/:id (STORY_033)", () => {
  it("names every turn of the chat, trimmed, and history then returns it", async () => {
    const res = await patch("a", JSON.stringify({ title: "  Harbour at dusk " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "a", title: "Harbour at dusk" });
    expect(stored().map((e) => [e.id, e.title])).toEqual([
      ["b", undefined],
      ["a2", "Harbour at dusk"],
      ["a", "Harbour at dusk"],
    ]);
    const listed: unknown = await (await getHistory()).json();
    expect(JSON.stringify(listed)).toContain("Harbour at dusk");
  });

  it("clears the name with null, and with blank text", async () => {
    await patch("a", JSON.stringify({ title: "Named" }));
    const cleared = await patch("a", JSON.stringify({ title: null }));
    expect(await cleared.json()).toEqual({ id: "a", title: null });
    expect(stored().some((e) => e.title !== undefined)).toBe(false);
    await patch("a", JSON.stringify({ title: "Named" }));
    expect((await patch("a", JSON.stringify({ title: "   " }))).status).toBe(200);
    expect(stored().some((e) => e.title !== undefined)).toBe(false);
  });

  it("answers 404 for an unknown chat", async () => {
    const res = await patch("nope", JSON.stringify({ title: "x" }));
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("not_found");
  });

  it("answers 400 for a body that is not a name, or a name over 100 characters, and leaves the file alone", async () => {
    const before = raw();
    for (const body of ["{}", JSON.stringify({ title: 42 }), "not json", JSON.stringify(["title"]), JSON.stringify({ title: "x".repeat(101) })]) {
      const res = await patch("a", body);
      expect(res.status, body).toBe(400);
      expect(await errorCode(res)).toBe("invalid_request");
    }
    expect(raw()).toBe(before);
    expect((await patch("a", JSON.stringify({ title: "x".repeat(100) }))).status).toBe(200);
  });

  it("renames a chat while one of its turns is still running", async () => {
    writeFileSync(historyPath, JSON.stringify([turn("r2", "r", "2026-01-02T00:00:00Z", "running"), turn("r", "r", "2026-01-01T00:00:00Z")]));
    expect((await patch("r", JSON.stringify({ title: "Busy" }))).status).toBe(200);
    expect(stored().map((e) => e.title)).toEqual(["Busy", "Busy"]);
  });

  it("still deletes a renamed chat", async () => {
    await patch("a", JSON.stringify({ title: "Named" }));
    const res = await deleteChat(new Request("http://local/api/chats/a", { method: "DELETE" }), ctx("a"));
    expect(res.status).toBe(200);
    expect(stored().map((e) => e.id)).toEqual(["b"]);
  });
});
