/**
 * History on disk (STORY_007): a JSON file at HISTORY_FILE, read on every call and written atomically (a temp file in
 * the same directory, then rename), so a crash mid-write never leaves half a file. The rules live in history.ts.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { historyFile } from "./config";
import { addEntry, applyStatus, markCancelled, parseEntries, removeEntry, type HistoryEntry, type NewEntry, type RemoveOutcome } from "./history";
import type { JobStatusResponse } from "./job-api";

export interface HistoryStore {
  list(): HistoryEntry[];
  add(entry: NewEntry): void;
  recordStatus(status: Pick<JobStatusResponse, "id" | "status" | "progress" | "error" | "result">): void;
  cancelled(id: string, progress: number): void;
  remove(id: string): RemoveOutcome;
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
  };
}

export function historyStore(): HistoryStore {
  return createHistoryStore(historyFile());
}
