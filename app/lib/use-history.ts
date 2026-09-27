"use client";
/**
 * History as the sidebar and My Library see it (STORY_013): read on mount and again whenever the app says it changed
 * (`qwen:history-changed`, sent after a submit and when a generation ends). Removing and stopping send their request
 * FIRST and only then change the list (CLAUDE.md §4c).
 */
import { useCallback, useEffect, useState } from "react";
import { parseEntries, type HistoryEntry } from "./history";

export const HISTORY_CHANGED = "qwen:history-changed";

/** While any generation is queued or running, history is read again this often (BUG_006). */
export const RUNNING_REFRESH_MS = 5000;

export function announceHistoryChanged(): void {
  window.dispatchEvent(new CustomEvent(HISTORY_CHANGED));
}

export interface History {
  readonly entries: readonly HistoryEntry[];
  readonly loaded: boolean;
  readonly remove: (id: string) => Promise<boolean>;
  readonly stop: (id: string) => Promise<void>;
}

async function read(): Promise<HistoryEntry[]> {
  try {
    const res = await fetch("/api/history", { cache: "no-store" });
    const body: unknown = await res.json();
    const list = typeof body === "object" && body !== null && "entries" in body ? body.entries : [];
    return parseEntries(JSON.stringify(list));
  } catch {
    return [];
  }
}

export function useHistory(): History {
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void read().then((list) => {
        if (!alive) return;
        setEntries(list);
        setLoaded(true);
      });
    };
    refresh();
    window.addEventListener(HISTORY_CHANGED, refresh);
    return () => {
      alive = false;
      window.removeEventListener(HISTORY_CHANGED, refresh);
    };
  }, []);

  // A generation left running (the owner navigated away) still reaches its real state in the sidebar (BUG_006).
  const running = entries.some((e) => e.status === "queued" || e.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      announceHistoryChanged();
    }, RUNNING_REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [running]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return false;
    setEntries((list) => list.filter((e) => e.id !== id));
    announceHistoryChanged();
    return true;
  }, []);

  const stop = useCallback(async (id: string): Promise<void> => {
    await fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
    announceHistoryChanged();
  }, []);

  return { entries, loaded, remove, stop };
}
