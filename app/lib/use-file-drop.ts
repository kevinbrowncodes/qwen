"use client";
/**
 * Files dragged or pasted anywhere on the page (STORY_018). While mounted, window listeners take any drag that carries
 * files, so the browser never opens a dropped image in place of the app, and hand the files to `onFiles`. A drag of
 * text or a link is left to the browser. `dragging` drives the reference's full-window overlay.
 *
 * `dragleave` fires on every element the pointer crosses, so an enter-minus-leave count decides when the drag has
 * really left the window. Listeners and the count are set up on every effect setup and cleared on every cleanup, so
 * StrictMode's remount leaves exactly one set (CLAUDE.md §6b).
 */
import { useEffect, useRef, useState } from "react";

function carriesFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes("Files") ?? false;
}

/** A paste into another text field is that field's; a paste into the prompt or outside any field is ours. */
function isOtherTextField(target: EventTarget | null, prompt: HTMLElement | null): boolean {
  if (!(target instanceof HTMLElement) || target === prompt) return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

export function useFileDrop(onFiles: (files: File[]) => void, prompt: { readonly current: HTMLElement | null }): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    depth.current = 0;
    const stop = (): void => {
      depth.current = 0;
      setDragging(false);
    };
    const onEnter = (e: DragEvent): void => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent): void => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent): void => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent): void => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      stop();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length > 0) handler.current(files);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") stop();
    };
    const onPaste = (e: ClipboardEvent): void => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0 || isOtherTextField(e.target, prompt.current)) return;
      e.preventDefault();
      handler.current(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
      stop();
    };
  }, [prompt]);

  return dragging;
}
