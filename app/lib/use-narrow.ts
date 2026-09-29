"use client";
import { useSyncExternalStore } from "react";
import { applyNarrowClass, isNarrow } from "./narrow";
import { currentZoom, ZOOM_EVENT } from "./ui-zoom";

/** Narrow at the effective width: the window's divided by the interface zoom (STORY_020). */
function narrowNow(): boolean {
  return isNarrow(window.innerWidth, currentZoom());
}

function subscribe(onChange: () => void): () => void {
  const handler = (): void => {
    const zoom = currentZoom();
    applyNarrowClass(document.documentElement, isNarrow(window.innerWidth, zoom), window.innerWidth / zoom);
    onChange();
  };
  // Resizing the window and choosing a zoom step are the two things that change the effective width.
  window.addEventListener("resize", handler);
  window.addEventListener(ZOOM_EVENT, handler);
  return () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener(ZOOM_EVENT, handler);
  };
}

/** True at phone width. The server renders the desktop layout; the boot script has already set html.mobile. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, narrowNow, () => false);
}
