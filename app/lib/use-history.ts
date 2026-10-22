"use client";
/**
 * History as the sidebar and My Library see it (STORY_013): read on mount and again whenever the app says it changed
 * (`qwen:history-changed`, sent after a submit and when a generation ends). Removing, renaming and stopping send their
 * request FIRST and only then change the list (CLAUDE.md §4c).
 */
import { useCallback, useEffect, useState } from "react";
import { parseEntries, withoutTitle, type HistoryEntry } from "./history";

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
  /** Every image of a chat (STORY_031); false when the server refused (a turn still running). */
  readonly removeChat: (chatId: string) => Promise<boolean>;
  /** Names a chat, or clears its name with null (STORY_033); false when the server refused or could not be reached. */
  readonly renameChat: (chatId: string, title: string | null) => Promise<boolean>;
  /** Stops every turn of a chat still queued or running. */
  readonly stopAll: (ids: readonly string[]) => Promise<void>;
  /** Stars or unstars a finished image (STORY_039); false when the server refused or could not be reached. */
  readonly setFavorite: (id: string, on: boolean) => Promise<boolean>;
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

  const removeChat = useCallback(async (chatId: string): Promise<boolean> => {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" });
    if (!res.ok) return false;
    setEntries((list) => list.filter((e) => e.chatId !== chatId));
    announceHistoryChanged();
    return true;
  }, []);

  const renameChat = useCallback(async (chatId: string, title: string | null): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    } catch {
      return false;
    }
    if (!res.ok) return false;
    setEntries((list) => list.map((e) => (e.chatId !== chatId ? e : title === null ? withoutTitle(e) : { ...e, title })));
    announceHistoryChanged();
    return true;
  }, []);

  const stopAll = useCallback(async (ids: readonly string[]): Promise<void> => {
    await Promise.all(ids.map((id) => fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE" })));
    announceHistoryChanged();
  }, []);

  // STORY_039: the request first; the entry the server answers replaces ours, and every other view reads it again.
  const setFavorite = useCallback(async (id: string, on: boolean): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ favorite: on }) });
    } catch {
      return false;
    }
    if (!res.ok) return false;
    const body: unknown = await res.json().catch(() => null);
    const [answered] = parseEntries(JSON.stringify([body]));
    if (answered) setEntries((list) => list.map((e) => (e.id === id ? answered : e)));
    announceHistoryChanged();
    return true;
  }, []);

  return { entries, loaded, remove, stop, removeChat, renameChat, stopAll, setFavorite };
}
