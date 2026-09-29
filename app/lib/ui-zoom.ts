/**
 * The interface zoom (STORY_020): CSS `zoom` on <html>, chosen in Settings and remembered in this browser. Under
 * zoom, measured boxes come back multiplied by it while `left`/`top` are applied in unzoomed CSS pixels (the same in
 * Chromium and WebKit, measured 2026-09-29), so code that places things from a measurement divides by currentZoom().
 */
export const ZOOM_STEPS = [1, 1.25, 1.5, 2, 3, 4] as const;
export type Zoom = (typeof ZOOM_STEPS)[number];
export const ZOOM_KEY = "qwen.zoom.v1";
export const ZOOM_EVENT = "qwen:zoom";

/** A stored value as a step; anything else is 1×. */
export function parseZoom(raw: string | null): Zoom {
  const n = Number(raw);
  return ZOOM_STEPS.find((z) => z === n) ?? 1;
}

export function zoomLabel(z: Zoom): string {
  return `${String(z)}×`;
}

type Root = { style: { zoom: string; setProperty(name: string, value: string): void; removeProperty(name: string): unknown }; dataset: Record<string, string | undefined> };

/** Applies a step to <html>: `zoom`, the --ui-zoom the stylesheet divides viewport units by, and data-zoom. */
export function applyZoom(root: Root, z: Zoom): void {
  if (z === 1) {
    root.style.zoom = "";
    root.style.removeProperty("--ui-zoom");
    delete root.dataset["zoom"];
    return;
  }
  root.style.zoom = String(z);
  root.style.setProperty("--ui-zoom", String(z));
  root.dataset["zoom"] = String(z);
}

/** The zoom in force now, as the page applied it. */
export function currentZoom(): number {
  if (typeof document === "undefined") return 1;
  const z = Number(document.documentElement.style.zoom);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

export function readZoom(): Zoom {
  try {
    return parseZoom(window.localStorage.getItem(ZOOM_KEY));
  } catch {
    return 1; // storage blocked: the default
  }
}

/** Applies and remembers a step, then tells the layout (useNarrow) to look again. */
export function writeZoom(z: Zoom): void {
  applyZoom(document.documentElement, z);
  try {
    if (z === 1) window.localStorage.removeItem(ZOOM_KEY);
    else window.localStorage.setItem(ZOOM_KEY, String(z));
  } catch {
    // private mode: the step still holds for this page
  }
  window.dispatchEvent(new Event(ZOOM_EVENT));
}
