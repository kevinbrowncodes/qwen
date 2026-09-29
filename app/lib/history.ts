/**
 * History of generations (STORY_007), as pure functions over a list of entries. The file that holds them is
 * history-store.ts. Rules: one entry per job id; newest first; a terminal status is final (a late non-terminal answer
 * never overwrites it); a cancelled job stays in history, shown as cancelled (CLAUDE.md §6 rule 4, decided here).
 */
import { isTerminal, type JobStatus, type JobStatusResponse } from "./job-api";

export interface HistoryEntry {
  readonly id: string;
  readonly prompt: string;
  readonly ratio: string | null;
  readonly model: string;
  readonly referenceImages: number;
  /** The add-on used (STORY_019); null for none, and for entries saved before add-ons existed. */
  readonly lora: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: JobStatus;
  readonly progress: number;
  readonly error?: { readonly code: string; readonly message: string };
  readonly result?: { readonly width: number; readonly height: number; readonly mimeType: string };
}

export type NewEntry = Pick<HistoryEntry, "id" | "prompt" | "ratio" | "model" | "referenceImages" | "lora" | "createdAt">;

/**
 * Newest first by creation time. Entries created in the same millisecond keep the order they were added in, newest
 * added first (the sort is stable and the newest is put in front), never an order decided by their random ids
 * (BUG_005).
 */
function byNewest(a: HistoryEntry, b: HistoryEntry): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export function addEntry(entries: readonly HistoryEntry[], entry: NewEntry): HistoryEntry[] {
  const fresh: HistoryEntry = { ...entry, updatedAt: entry.createdAt, status: "queued", progress: 0 };
  return [fresh, ...entries.filter((e) => e.id !== entry.id)].sort(byNewest);
}

/** Folds a status answer into its entry. Unknown ids and answers after a terminal status change nothing. */
export function applyStatus(entries: readonly HistoryEntry[], status: Pick<JobStatusResponse, "id" | "status" | "progress" | "error" | "result">, at: string): HistoryEntry[] {
  return entries.map((e) => {
    if (e.id !== status.id || isTerminal(e.status)) return e;
    const next: HistoryEntry = {
      ...e,
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
    .map((e) => ({ ...e, lora: typeof e.lora === "string" ? e.lora : null }))
    .sort(byNewest);
}
