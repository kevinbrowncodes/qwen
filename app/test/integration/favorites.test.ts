/**
 * STORY_039 integration lane: starring an image through PATCH /api/history/:id, against history in a real temp file.
 * No generation server is needed: a star only touches the history file.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteChat } from "@/app/api/chats/[id]/route";
import { DELETE as deleteEntry, PATCH as star } from "@/app/api/history/[id]/route";
import { GET as getHistory } from "@/app/api/history/route";
import type { HistoryEntry } from "@/lib/history";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: string): Promise<Response> => star(new Request(`http://local/api/history/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body }), ctx(id));

const entry = (id: string, status: HistoryEntry["status"] = "done"): HistoryEntry => ({
  id,
  chatId: id,
  prompt: `prompt ${id}`,
  ratio: "1:1",
  model: "m",
  referenceImages: 0,
  lora: null,
  seed: null,
  loraScale: null,
  loraGuidance: null,
  promptSent: null,
  createdAt: `2026-01-0${id === "a" ? "1" : "2"}T00:00:00Z`,
  updatedAt: "2026-01-01T00:00:00Z",
  status,
  progress: status === "done" ? 100 : 40,
  ...(status === "done" ? { result: { width: 64, height: 36, mimeType: "image/png" } } : {}),
});

let dir = "";
let historyPath = "";
/** The file as stored, read raw, so the test sees exactly what was written. */
const raw = (): Array<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(readFileSync(historyPath, "utf8"));
  return Array.isArray(parsed) ? parsed.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null) : [];
};
const storedA = (): Record<string, unknown> | undefined => raw().find((e) => e["id"] === "a");

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "qwen-int-favorites-"));
  historyPath = path.join(dir, "history.json");
  process.env["HISTORY_FILE"] = historyPath;
  writeFileSync(historyPath, JSON.stringify([entry("r", "running"), entry("a")]));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env["HISTORY_FILE"];
});

async function errorCode(res: Response): Promise<unknown> {
  const body: unknown = await res.json();
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "code" in body.error ? body.error.code : undefined;
}

describe("PATCH /api/history/:id (STORY_039)", () => {
  it("stars with true and answers the entry; the file holds favoritedAt, and history lists it", async () => {
    const res = await patch("a", JSON.stringify({ favorite: true }));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toMatchObject({ id: "a", status: "done" });
    expect(typeof body === "object" && body !== null && "favoritedAt" in body ? typeof body.favoritedAt : null).toBe("string");
    expect(typeof storedA()?.["favoritedAt"]).toBe("string");
    expect(JSON.stringify(await (await getHistory()).json())).toContain("favoritedAt");
    // Written atomically, as every change is: no temp file is left beside it.
    expect(readdirSync(dir)).toEqual(["history.json"]);
  });

  it("unstars with false: the answer and the file drop favoritedAt", async () => {
    await patch("a", JSON.stringify({ favorite: true }));
    const res = await patch("a", JSON.stringify({ favorite: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("favoritedAt");
    expect(storedA()).not.toHaveProperty("favoritedAt");
  });

  it("answers 404 for an unknown id and 409 for an image still running, and writes nothing", async () => {
    const before = readFileSync(historyPath, "utf8");
    const unknown = await patch("nope", JSON.stringify({ favorite: true }));
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe("not_found");
    const running = await patch("r", JSON.stringify({ favorite: true }));
    expect(running.status).toBe(409);
    expect(await errorCode(running)).toBe("not_finished");
    expect(readFileSync(historyPath, "utf8")).toBe(before);
  });

  it("answers 400 for a body without a boolean favorite", async () => {
    for (const body of ["{}", JSON.stringify({ favorite: "yes" }), "[]", "not json", "null"]) {
      const res = await patch("a", body);
      expect(res.status, body).toBe(400);
      expect(await errorCode(res)).toBe("invalid_request");
    }
    expect(storedA()).not.toHaveProperty("favoritedAt");
  });

  it("deleting a starred image, or its chat, takes the star with it", async () => {
    await patch("a", JSON.stringify({ favorite: true }));
    expect((await deleteEntry(new Request("http://local/api/history/a", { method: "DELETE" }), ctx("a"))).status).toBe(200);
    expect(storedA()).toBeUndefined();
    writeFileSync(historyPath, JSON.stringify([{ ...entry("a"), favoritedAt: "2026-01-03T00:00:00Z" }]));
    expect((await deleteChat(new Request("http://local/api/chats/a", { method: "DELETE" }), ctx("a"))).status).toBe(200);
    expect(raw()).toEqual([]);
  });
});
