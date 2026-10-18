/**
 * The prompt box's size (BUG_015), pure: what the reference's own code sets inline on every change
 * (`style="height: 32px; overflow-y: hidden;"`, the 2026-09-26 capture). The box is as tall as its text, between the
 * stylesheet's min-height and max-height, and scrolls only once the text is taller than the maximum.
 */
export interface TextareaFit {
  readonly height: number;
  readonly overflowY: "hidden" | "auto";
}

export function fitTextarea(scrollHeight: number, minHeight: number, maxHeight: number): TextareaFit {
  if (scrollHeight > maxHeight) return { height: maxHeight, overflowY: "auto" };
  return { height: Math.max(minHeight, scrollHeight), overflowY: "hidden" };
}

/** A computed length in px ("208px"); anything else (such as "none") reads as `fallback`. */
export function pxOf(value: string, fallback: number): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}
