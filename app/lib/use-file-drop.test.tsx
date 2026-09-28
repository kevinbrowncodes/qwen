import { act, render, screen } from "@testing-library/react";
import { StrictMode, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useFileDrop } from "./use-file-drop";

// STORY_018. jsdom has no DataTransfer or DragEvent constructor, so the events are plain Events carrying a
// dataTransfer (or clipboardData) with the fields the hook reads.
function dragEvent(type: string, transfer: { types: string[]; files?: File[] } | null): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: transfer === null ? null : { types: transfer.types, files: transfer.files ?? [], dropEffect: "none" },
  });
  return event;
}

function pasteEvent(files: File[] | null): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: files === null ? null : { files } });
  return event;
}

const png = (): File => new File([new Uint8Array([137, 80, 78, 71])], "ref.png", { type: "image/png" });
const FILES = { types: ["Files"] };
const TEXT = { types: ["text/plain"] };

function Probe({ onFiles }: { readonly onFiles: (files: File[]) => void }) {
  const prompt = useRef<HTMLTextAreaElement>(null);
  const dragging = useFileDrop(onFiles, prompt);
  return (
    <div>
      <p>{dragging ? "dragging" : "idle"}</p>
      <textarea ref={prompt} aria-label="Prompt" />
      <input aria-label="Other" />
      <div aria-label="Editable" contentEditable suppressContentEditableWarning />
    </div>
  );
}

function setup() {
  const onFiles = vi.fn<(files: File[]) => void>();
  const view = render(
    <StrictMode>
      <Probe onFiles={onFiles} />
    </StrictMode>,
  );
  const fire = (event: Event, target: EventTarget = window): Event => {
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };
  return { onFiles, view, fire };
}

describe("useFileDrop", () => {
  it("a drag with files shows the overlay; a drag of text does not", () => {
    const { fire } = setup();
    fire(dragEvent("dragenter", TEXT));
    expect(screen.getByText("idle")).toBeTruthy();
    expect(fire(dragEvent("dragover", TEXT)).defaultPrevented).toBe(false);
    fire(dragEvent("dragenter", FILES));
    expect(screen.getByText("dragging")).toBeTruthy();
  });

  it("crossing a child element keeps the overlay; leaving the window clears it", () => {
    const { fire } = setup();
    fire(dragEvent("dragenter", FILES));
    fire(dragEvent("dragenter", FILES));
    fire(dragEvent("dragleave", FILES));
    expect(screen.getByText("dragging")).toBeTruthy();
    fire(dragEvent("dragleave", FILES));
    expect(screen.getByText("idle")).toBeTruthy();
    fire(dragEvent("dragleave", FILES)); // an extra leave does not go negative
    fire(dragEvent("dragenter", FILES));
    expect(screen.getByText("dragging")).toBeTruthy();
  });

  it("a drop with files hands them over once, clears the overlay and stops the browser opening the file", () => {
    const { onFiles, fire } = setup();
    const file = png();
    fire(dragEvent("dragenter", FILES));
    expect(fire(dragEvent("dragover", FILES)).defaultPrevented).toBe(true);
    const drop = fire(dragEvent("drop", { types: ["Files"], files: [file] }));
    expect(drop.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(screen.getByText("idle")).toBeTruthy();
  });

  it("a drop of text, or one with no transfer at all, is left to the browser", () => {
    const { onFiles, fire } = setup();
    expect(fire(dragEvent("drop", TEXT)).defaultPrevented).toBe(false);
    expect(fire(dragEvent("drop", null)).defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("a files drop that turns out empty calls nothing but still keeps the browser off", () => {
    const { onFiles, fire } = setup();
    expect(fire(dragEvent("drop", FILES)).defaultPrevented).toBe(true);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("Escape clears the overlay; another key does not", () => {
    const { fire } = setup();
    fire(dragEvent("dragenter", FILES));
    fire(new KeyboardEvent("keydown", { key: "a" }));
    expect(screen.getByText("dragging")).toBeTruthy();
    fire(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(screen.getByText("idle")).toBeTruthy();
  });

  it("after unmount nothing is listening", () => {
    const { onFiles, view, fire } = setup();
    view.unmount();
    expect(fire(dragEvent("drop", { types: ["Files"], files: [png()] })).defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("a pasted image is attached from the page and from the prompt, but not from another field", () => {
    const { onFiles, fire } = setup();
    expect(fire(pasteEvent([png()]), document.body).defaultPrevented).toBe(true);
    fire(pasteEvent([png()]), screen.getByLabelText("Prompt"));
    expect(onFiles).toHaveBeenCalledTimes(2);
    expect(fire(pasteEvent([png()]), screen.getByLabelText("Other")).defaultPrevented).toBe(false);
    expect(onFiles).toHaveBeenCalledTimes(2);
  });

  it("a paste of text only, or with no clipboard data, is left alone", () => {
    const { onFiles, fire } = setup();
    expect(fire(pasteEvent([]), document.body).defaultPrevented).toBe(false);
    expect(fire(pasteEvent(null), document.body).defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("a paste into an editable region other than the prompt is that region's", () => {
    const { onFiles, fire } = setup();
    const editable = screen.getByLabelText("Editable");
    Object.defineProperty(editable, "isContentEditable", { value: true }); // jsdom does not compute it
    expect(fire(pasteEvent([png()]), editable).defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("drag events with no transfer at all are ignored", () => {
    const { fire } = setup();
    fire(dragEvent("dragenter", null));
    expect(fire(dragEvent("dragover", null)).defaultPrevented).toBe(false);
    fire(dragEvent("dragleave", null));
    expect(screen.getByText("idle")).toBeTruthy();
  });

  it("a files drop whose transfer lists no files reads as empty", () => {
    const { onFiles, fire } = setup();
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: undefined } });
    expect(fire(event).defaultPrevented).toBe(true);
    expect(onFiles).not.toHaveBeenCalled();
  });
});
