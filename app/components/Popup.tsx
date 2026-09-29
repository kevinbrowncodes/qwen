"use client";
/**
 * Where the reference's dropdowns render (STORY_010): in a layer on <body>, as its own popups do, so the composer's
 * `overflow: hidden` cannot clip them. Positioned from the trigger's box, below it ("bottom") or above it ("top", the
 * pinned phone composer), and kept there on scroll and resize.
 */
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { currentZoom } from "@/lib/ui-zoom";

export interface Anchor {
  readonly left: number;
  readonly top: number;
  /** The side the popup really opens on (BUG_010), for the reference's -top-left / -bottom-left class. */
  readonly placement: "bottom" | "top";
}

/**
 * Pure: the side a popup opens on. A trigger in the lower half of the window opens upward, whatever was asked for,
 * so the composer pinned to the bottom of a generation's page never opens a menu off screen (BUG_010).
 */
export function placementFor(box: { top: number; bottom: number }, requested: "bottom" | "top", viewportHeight: number): "bottom" | "top" {
  return (box.top + box.bottom) / 2 > viewportHeight / 2 ? "top" : requested;
}

/**
 * Pure: where a popup sits for a trigger box. "top" is shifted up by the reference's own translateY(-100%). The box is
 * measured, so under the interface zoom it is `zoom` times the CSS pixels the popup is placed in (STORY_020).
 */
export function anchorFor(box: { left: number; top: number; bottom: number }, placement: "bottom" | "top", gap = 4, zoom = 1): Anchor {
  const left = box.left / zoom;
  return placement === "bottom" ? { left, top: box.bottom / zoom + gap, placement } : { left, top: box.top / zoom - gap, placement };
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
      if (!el) return;
      const box = el.getBoundingClientRect();
      setAnchor(anchorFor(box, placementFor(box, placement, window.innerHeight), 4, currentZoom()));
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
