"use client";
/**
 * The image viewer (STORY_038): a clicked image opens large over the page, with its name, Download and Close, the way
 * Google AI Studio's image popup does (the owner's screenshot, 2026-10-21; values inferred, see the story's notes). It
 * steps through the chat's images, results and references together, in the order they appear: Left and Right, the
 * buttons at the sheet's edges, or a swipe on a phone. A native modal `<dialog>` keeps Tab inside it and hides the page
 * from a screen reader; Esc, Close or a click on the dimmed page closes it, and focus goes back to the image that
 * opened it.
 *
 * `useImageViewer` wires a container: a click on (or Return at) any `img[data-viewer]` inside it opens the viewer at
 * that image, over the container's other marked images. Nothing is requested: the list is what the page has drawn.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { collectImages, counterLabel, stepIndex, swipeStep, VIEWER_ATTR, type ViewerImage } from "@/lib/image-viewer";
import { Icon } from "./Icon";

export interface ImageViewerProps {
  readonly images: readonly ViewerImage[];
  readonly index: number;
  readonly onClose: () => void;
  /** Focused again when the viewer closes. */
  readonly opener?: HTMLElement | null;
}

const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function ImageViewer({ images, index: start, onClose, opener = null }: ImageViewerProps) {
  const [index, setIndex] = useState(start);
  const dialog = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const image = images[index];
  const count = images.length;

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) {
      // jsdom has no showModal; a browser always does.
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    }
    const root = document.documentElement;
    root.classList.add("clone-viewer-open");
    return () => {
      root.classList.remove("clone-viewer-open");
      if (el?.open && typeof el.close === "function") el.close();
      opener?.focus();
    };
  }, [opener]);

  const step = (delta: number): void => {
    setIndex((i) => stepIndex(i, delta, count));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>): void => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      step(e.key === "ArrowLeft" ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // The modal already keeps focus out of the page; this keeps it from leaving for the browser's own controls.
      const all = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = all[0];
      const last = all[all.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onTouchStart = (e: TouchEvent<HTMLDivElement>): void => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent<HTMLDivElement>): void => {
    const from = touchX.current;
    touchX.current = null;
    const to = e.changedTouches[0]?.clientX;
    if (from === null || to === undefined) return;
    const delta = swipeStep(to - from);
    if (delta !== 0) step(delta);
  };

  if (!image) return null;
  return createPortal(
    <dialog
      ref={dialog}
      className="clone-viewer"
      aria-label={image.name}
      data-testid="image-viewer"
      onKeyDown={onKeyDown}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="clone-viewer-sheet" data-testid="viewer-sheet">
        <div className="clone-viewer-header">
          <span className="clone-viewer-name">{image.name}</span>
          <a className="clone-viewer-action" href={image.download} download={image.name} aria-label="Download">
            <Icon id="qwpcicon-download" />
          </a>
          <button type="button" className="clone-icon-button clone-viewer-action clone-viewer-close" aria-label="Close" onClick={onClose}>
            <Icon id="qwpcicon-close" />
          </button>
        </div>
        <div className="clone-viewer-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the chat's own image, shown at its own size or smaller */}
          <img className="clone-viewer-image" src={image.src} alt={image.name} data-testid="viewer-image" />
        </div>
        <div className="clone-viewer-counter">{counterLabel(index, count)}</div>
        {index > 0 ? (
          <button
            type="button"
            className="clone-icon-button clone-viewer-step clone-viewer-prev"
            aria-label="Previous image"
            onClick={() => {
              step(-1);
            }}
          >
            <Icon id="qwpcicon-arrowLeft" />
          </button>
        ) : null}
        {index < count - 1 ? (
          <button
            type="button"
            className="clone-icon-button clone-viewer-step clone-viewer-next"
            aria-label="Next image"
            onClick={() => {
              step(1);
            }}
          >
            <Icon id="qwpcicon-arrowRight" />
          </button>
        ) : null}
      </div>
    </dialog>,
    document.body,
  );
}

interface Open {
  readonly images: readonly ViewerImage[];
  readonly index: number;
  readonly opener: HTMLElement;
}

/** The marked image an event landed on inside `container`, if any. */
function markedTarget(container: HTMLElement, target: EventTarget): HTMLElement | null {
  if (!(target instanceof HTMLElement) || !target.matches(`img[${VIEWER_ATTR}]`) || !container.contains(target)) return null;
  return target;
}

/**
 * Wires a container to the viewer: spread `onClick` and `onKeyDown` on it and render `viewer` beside it (not inside,
 * so the viewer's own clicks never reach the container).
 */
export function useImageViewer(): { readonly onClick: (e: MouseEvent<HTMLElement>) => void; readonly onKeyDown: (e: KeyboardEvent<HTMLElement>) => void; readonly viewer: ReactNode } {
  const [open, setOpen] = useState<Open | null>(null);
  const show = useCallback((container: HTMLElement, target: EventTarget): boolean => {
    const img = markedTarget(container, target);
    const found = img ? collectImages(container, img) : null;
    if (!img || !found) return false;
    setOpen({ images: found.images, index: found.index, opener: img });
    return true;
  }, []);
  const onClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      show(e.currentTarget, e.target);
    },
    [show],
  );
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" && show(e.currentTarget, e.target)) e.preventDefault();
    },
    [show],
  );
  const close = useCallback(() => {
    setOpen(null);
  }, []);
  const viewer = open ? <ImageViewer images={open.images} index={open.index} opener={open.opener} onClose={close} /> : null;
  return { onClick, onKeyDown, viewer };
}
