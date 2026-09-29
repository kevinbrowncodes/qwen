"use client";
/**
 * Where the reference's dropdowns render (STORY_010): in a layer on <body>, as its own popups do, so the composer's
 * `overflow: hidden` cannot clip them. Positioned from the trigger's box, below it ("bottom") or above it ("top", the
 * pinned phone composer), and kept there on scroll and resize.
 */
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface Anchor {
  readonly left: number;
  readonly top: number;
}

/** Pure: where a popup sits for a trigger box. "top" is shifted up by the reference's own translateY(-100%). */
export function anchorFor(box: { left: number; top: number; bottom: number }, placement: "bottom" | "top", gap = 4): Anchor {
  return placement === "bottom" ? { left: box.left, top: box.bottom + gap } : { left: box.left, top: box.top - gap };
}

/**
 * Pure: the left edge that keeps a popup of `width` inside the viewport, `margin` from its right edge (and never past
 * the left one). A popup opened from a trigger near the right edge shifts left instead of running off (STORY_019).
 */
export function clampLeft(left: number, width: number, viewport: number, margin = 8): number {
  return Math.max(margin, Math.min(left, viewport - width - margin));
}

export function Popup({ anchorRef, placement, children }: { readonly anchorRef: RefObject<HTMLElement | null>; readonly placement: "bottom" | "top"; readonly children: (anchor: Anchor) => ReactNode }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  useLayoutEffect(() => {
    const place = (): void => {
      const el = anchorRef.current;
      if (el) setAnchor(anchorFor(el.getBoundingClientRect(), placement));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, placement]);
  if (anchor === null) return null;
  return createPortal(children(anchor), document.body);
}
