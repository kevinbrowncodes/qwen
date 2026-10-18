/**
 * History of generations (STORY_007), as pure functions over a list of entries. The file that holds them is
 * history-store.ts. Rules: one entry per job id; newest first; a terminal status is final (a late non-terminal answer
 * never overwrites it); a cancelled job stays in history, shown as cancelled (CLAUDE.md §6 rule 4, decided here).
 *
 * STORY_031: every entry belongs to a chat, named by the id of the chat's first job. A send from the home page starts
 * one; a send from a chat's page joins it. Entries saved before then are each a chat of one, under their own id.
 */
import { isTerminal, type JobRequestEcho, type JobStatus, type JobStatusResponse } from "./job-api";

export interface HistoryEntry {
  readonly id: string;
  /** The chat this image is a turn of (STORY_031): the id of the chat's first job. */
  readonly chatId: string;
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly referenceImages: number;
  /** The add-on used (STORY_019); null for none, and for entries saved before add-ons existed. */
  readonly lora: string | null;
  /** What made it (STORY_024), from the first status echo that carries them; null for entries saved before, and
   * for a server before contract v1.3 (the three add-on fields). */
  readonly seed: number | null;
  readonly loraScale: number | null;
  readonly loraGuidance: number | null;
  readonly promptSent: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: JobStatus;
  readonly progress: number;
  readonly error?: { readonly code: string; readonly message: string };
  readonly result?: { readonly width: number; readonly height: number; readonly mimeType: string };
  /** The chat's name, when the owner renamed it (STORY_033): written to every turn of the chat, so they agree. */
  readonly title?: string;
}

export type NewEntry = Pick<HistoryEntry, "id" | "chatId" | "prompt" | "ratio" | "model" | "referenceImages" | "lora" | "createdAt">;

/**
 * Newest first by creation time. Entries created in the same millisecond keep the order they were added in, newest
 * added first (the sort is stable and the newest is put in front), never an order decided by their random ids
 * (BUG_005).
 */
function byNewest(a: HistoryEntry, b: HistoryEntry): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export function addEntry(entries: readonly HistoryEntry[], entry: NewEntry): HistoryEntry[] {
  // The create answer carries no seed: it and the add-on's settings arrive with the first status echo.
  const fresh: HistoryEntry = { ...entry, seed: null, loraScale: null, loraGuidance: null, promptSent: null, updatedAt: entry.createdAt, status: "queued", progress: 0 };
  return [fresh, ...entries.filter((e) => e.id !== entry.id)].sort(byNewest);
}

/** What a status echo says made the job (STORY_024); fields the server did not send are left as they were. */
function echoed(e: HistoryEntry, request: JobRequestEcho | undefined): Partial<HistoryEntry> {
  if (!request) return {};
  return {
    seed: request.seed,
    ...(request.loraScale === undefined ? {} : { loraScale: request.loraScale }),
    ...(request.loraGuidance === undefined ? {} : { loraGuidance: request.loraGuidance }),
    promptSent: request.promptSent ?? e.promptSent,
  };
}

/** Folds a status answer into its entry. Unknown ids and answers after a terminal status change nothing. */
export function applyStatus(entries: readonly HistoryEntry[], status: Pick<JobStatusResponse, "id" | "status" | "progress" | "error" | "result"> & { readonly request?: JobRequestEcho }, at: string): HistoryEntry[] {
  return entries.map((e) => {
    if (e.id !== status.id || isTerminal(e.status)) return e;
    const next: HistoryEntry = {
      ...e,
      ...echoed(e, status.request),
      status: status.status,
      progress: Math.max(e.progress, status.progress),
      updatedAt: at,
      ...(status.error ? { error: { code: status.error.code, message: status.error.message } } : {}),
      ...(status.result ? { result: { width: status.result.width, height: status.result.height, mimeType: status.result.mimeType } } : {}),
    };
    return next;
  });
}

export function markCancelled(entries: readonly HistoryEntry[], id: string, progress: number, at: string): HistoryEntry[] {
  return applyStatus(entries, { id, status: "cancelled", progress }, at);
}

export type RemoveOutcome = { readonly entries: HistoryEntry[]; readonly removed: boolean; readonly refused?: "running" };

/** Removes a finished entry. A job still queued or running is refused (cancel it first); an unknown id is a no-op. */
export function removeEntry(entries: readonly HistoryEntry[], id: string): RemoveOutcome {
  const found = entries.find((e) => e.id === id);
  if (!found) return { entries: [...entries], removed: false };
  if (!isTerminal(found.status)) return { entries: [...entries], removed: false, refused: "running" };
  return { entries: entries.filter((e) => e.id !== id), removed: true };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const numberOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Reads a stored file's contents; anything that is not a list of entries reads as empty. */
export function parseEntries(text: string): HistoryEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is HistoryEntry => isRecord(e) && typeof e["id"] === "string" && typeof e["prompt"] === "string" && typeof e["createdAt"] === "string" && typeof e["status"] === "string")
    .map(({ title, ...e }) => ({
      ...e,
      // A name is kept only when it is text (STORY_033); entries saved before have none.
      ...(typeof title === "string" && title.trim() !== "" ? { title } : {}),
      // Entries saved before STORY_031 are each a chat of one.
      chatId: typeof e.chatId === "string" && e.chatId !== "" ? e.chatId : e.id,
      lora: typeof e.lora === "string" ? e.lora : null,
      // Entries saved before STORY_024 have none of these.
      seed: numberOrNull(e.seed),
      loraScale: numberOrNull(e.loraScale),
      loraGuidance: numberOrNull(e.loraGuidance),
      promptSent: typeof e.promptSent === "string" ? e.promptSent : null,
    }))
    .sort(byNewest);
}

const isOpen = (e: Pick<HistoryEntry, "status">): boolean => e.status === "queued" || e.status === "running";

export type RemoveChatOutcome = { readonly entries: HistoryEntry[]; readonly removed: number; readonly refused?: "running" };

/** Removes every turn of a chat. Refused while any turn is queued or running (stop it first); an unknown chat removes nothing. */
export function removeChat(entries: readonly HistoryEntry[], chatId: string): RemoveChatOutcome {
  const turns = entries.filter((e) => e.chatId === chatId);
  if (turns.some(isOpen)) return { entries: [...entries], removed: 0, refused: "running" };
  return { entries: entries.filter((e) => e.chatId !== chatId), removed: turns.length };
}

/** The longest name a chat can be given (STORY_033). */
export const TITLE_MAX = 100;

/** A turn with its chat's name taken off (STORY_033). */
export function withoutTitle(e: HistoryEntry): HistoryEntry {
  const { title, ...rest } = e;
  return title === undefined ? e : rest;
}

export type RenameChatOutcome = { readonly entries: HistoryEntry[]; readonly renamed: number };

/** Names a chat (STORY_033) by writing the title to every turn; null clears it. A running turn does not block it. */
export function renameChat(entries: readonly HistoryEntry[], chatId: string, title: string | null): RenameChatOutcome {
  let renamed = 0;
  const next = entries.map((e) => {
    if (e.chatId !== chatId) return e;
    renamed += 1;
    return title === null ? withoutTitle(e) : { ...e, title };
  });
  return { entries: next, renamed };
}
