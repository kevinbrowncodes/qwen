"use client";
import { useSyncExternalStore } from "react";
import { applyNarrowClass, NARROW_QUERY } from "./narrow";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(NARROW_QUERY);
  const handler = (): void => {
    applyNarrowClass(document.documentElement, mq.matches, window.innerWidth);
    onChange();
  };
  mq.addEventListener("change", handler);
  return () => {
    mq.removeEventListener("change", handler);
  };
}

/** True at phone width. The server renders the desktop layout; the boot script has already set html.mobile. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}
