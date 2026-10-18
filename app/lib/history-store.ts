/**
 * History on disk (STORY_007): a JSON file at HISTORY_FILE, read on every call and written atomically (a temp file in
 * the same directory, then rename), so a crash mid-write never leaves half a file. The rules live in history.ts.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { historyFile } from "./config";
import { addEntry, applyStatus, markCancelled, parseEntries, removeChat, removeEntry, renameChat, type HistoryEntry, type NewEntry, type RemoveChatOutcome, type RemoveOutcome } from "./history";
import type { JobStatusResponse } from "./job-api";

export interface HistoryStore {
  list(): HistoryEntry[];
  add(entry: NewEntry): void;
  recordStatus(status: Pick<JobStatusResponse, "id" | "status" | "progress" | "error" | "result">): void;
  cancelled(id: string, progress: number): void;
  remove(id: string): RemoveOutcome;
  /** Every turn of a chat (STORY_031). */
  removeChat(chatId: string): RemoveChatOutcome;
  /** Names a chat, or clears its name with null (STORY_033); the number of turns renamed, 0 for an unknown chat. */
  renameChat(chatId: string, title: string | null): number;
}

export function createHistoryStore(file: string, now: () => string = () => new Date().toISOString()): HistoryStore {
  const read = (): HistoryEntry[] => {
    try {
      return parseEntries(readFileSync(file, "utf8"));
    } catch {
      return [];
    }
  };
  const write = (entries: readonly HistoryEntry[]): void => {
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const temp = `${file}.${String(process.pid)}.${String(Date.now())}.tmp`;
    writeFileSync(temp, `${JSON.stringify(entries, null, 2)}\n`);
    renameSync(temp, file);
  };
  return {
    list: read,
    add: (entry) => {
      write(addEntry(read(), entry));
    },
    recordStatus: (status) => {
      const before = read();
      const after = applyStatus(before, status, now());
      if (JSON.stringify(after) !== JSON.stringify(before)) write(after);
    },
    cancelled: (id, progress) => {
      write(markCancelled(read(), id, progress, now()));
    },
    remove: (id) => {
      const outcome = removeEntry(read(), id);
      if (outcome.removed) write(outcome.entries);
      return outcome;
    },
    removeChat: (chatId) => {
      const outcome = removeChat(read(), chatId);
      if (outcome.removed > 0) write(outcome.entries);
      return outcome;
    },
    renameChat: (chatId, title) => {
      const outcome = renameChat(read(), chatId, title);
      if (outcome.renamed > 0) write(outcome.entries);
      return outcome.renamed;
    },
  };
}

export function historyStore(): HistoryStore {
  return createHistoryStore(historyFile());
}
