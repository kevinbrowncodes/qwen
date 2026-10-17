"use client";
/**
 * The clock as the sidebar and the History page read it (STORY_032): re-read every minute and whenever history
 * changes, so "today" moves at midnight without a reload. The interval is (re)set on every effect setup and cleared
 * on every cleanup (CLAUDE.md §6b).
 */
import { useEffect, useState } from "react";
import { HISTORY_CHANGED } from "./use-history";

export const NOW_REFRESH_MS = 60_000;

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = (): void => {
      setNow(new Date());
    };
    const timer = setInterval(tick, NOW_REFRESH_MS);
    window.addEventListener(HISTORY_CHANGED, tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener(HISTORY_CHANGED, tick);
    };
  }, []);
  return now;
}
