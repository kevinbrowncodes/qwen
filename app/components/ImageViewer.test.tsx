/* eslint-disable @next/next/no-img-element -- the test draws plain images for the viewer to find */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ViewerImage } from "@/lib/image-viewer";
import { ImageViewer, useImageViewer } from "./ImageViewer";

const IMAGES: readonly ViewerImage[] = [
  { src: "blob:ref", name: "reference.png", download: "blob:ref" },
  { src: "/api/jobs/a/result", name: "qwen-a.png", download: "/api/jobs/a/result?download=1" },
  { src: "/api/jobs/b/result", name: "qwen-b.png", download: "/api/jobs/b/result?download=1" },
];

const counter = (): string => document.querySelector(".clone-viewer-counter")?.textContent ?? "";

describe("ImageViewer (STORY_038)", () => {
  it("opens at the image asked for, named after it, with 2 of 3", () => {
    render(<ImageViewer images={IMAGES} index={1} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "qwen-a.png" })).toBeInTheDocument();
    expect(screen.getByTestId("viewer-image")).toHaveAttribute("src", "/api/jobs/a/result");
    expect(counter()).toBe("2 of 3");
  });

  it("Right moves to the third and draws no next button there; Left from the first draws no previous button", () => {
    render(<ImageViewer images={IMAGES} index={1} onClose={vi.fn()} />);
    const dialog = screen.getByTestId("image-viewer");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(counter()).toBe("3 of 3");
    expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(counter()).toBe("1 of 3");
    expect(screen.queryByRole("button", { name: "Previous image" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(counter()).toBe("2 of 3");
  });

  it("Esc, Close, the browser's cancel and a click on the dimmed page close it; a click on the sheet does not", () => {
    const onClose = vi.fn();
    render(<ImageViewer images={IMAGES} index={0} onClose={onClose} />);
    const dialog = screen.getByTestId("image-viewer");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(screen.getByTestId("viewer-sheet"));
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("downloads a result through ?download=1 and a reference as the attached file", () => {
    const { unmount } = render(<ImageViewer images={IMAGES} index={1} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/jobs/a/result?download=1");
    unmount();
    render(<ImageViewer images={IMAGES} index={0} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "blob:ref");
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("download", "reference.png");
  });

  it("a swipe steps; a tap does not", () => {
    render(<ImageViewer images={IMAGES} index={1} onClose={vi.fn()} />);
    const stage = document.querySelector(".clone-viewer-stage") ?? document.body;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 200 }] });
    expect(counter()).toBe("3 of 3");
    fireEvent.touchStart(stage, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 300 }] });
    expect(counter()).toBe("2 of 3");
    fireEvent.touchStart(stage, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 110 }] });
    fireEvent.touchEnd(stage, { changedTouches: [] });
    expect(counter()).toBe("2 of 3");
  });

  it("keeps Tab inside it, both ways", () => {
    render(<ImageViewer images={IMAGES} index={1} onClose={vi.fn()} />);
    const dialog = screen.getByTestId("image-viewer");
    const download = screen.getByRole("link", { name: "Download" });
    const next = screen.getByRole("button", { name: "Next image" });
    next.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(download);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);
    screen.getByRole("button", { name: "Close" }).focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("stops the page scrolling while open, and gives focus back to the opener when it closes, under StrictMode", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    const { unmount } = render(
      <StrictMode>
        <ImageViewer images={IMAGES} index={0} onClose={vi.fn()} opener={opener} />
      </StrictMode>,
    );
    expect(document.documentElement).toHaveClass("clone-viewer-open");
    expect(screen.getByTestId("image-viewer")).toHaveAttribute("open");
    unmount();
    expect(document.documentElement).not.toHaveClass("clone-viewer-open");
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("stars a result from its header, with the state it is given, and draws no star for a reference (STORY_039)", () => {
    const toggle = vi.fn();
    const withJob: readonly ViewerImage[] = [
      { src: "blob:ref", name: "reference.png", download: "blob:ref" },
      { src: "/api/jobs/a/result", name: "qwen-a.png", download: "/api/jobs/a/result?download=1", job: "a" },
    ];
    const { rerender } = render(<ImageViewer images={withJob} index={1} onClose={vi.fn()} star={{ isStarred: () => false, toggle }} />);
    fireEvent.click(screen.getByRole("button", { name: "Star" }));
    expect(toggle).toHaveBeenCalledWith("a");
    rerender(<ImageViewer images={withJob} index={1} onClose={vi.fn()} star={{ isStarred: () => true, toggle }} />);
    expect(screen.getByRole("button", { name: "Unstar" })).toHaveClass("clone-star-on");
    fireEvent.keyDown(screen.getByTestId("image-viewer"), { key: "ArrowLeft" });
    expect(screen.queryByRole("button", { name: /star/i })).toBeNull();
  });

  it("draws nothing for an index with no image", () => {
    render(<ImageViewer images={[]} index={0} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

function Chat() {
  const viewer = useImageViewer();
  return (
    <>
      <div data-testid="chat" onClick={viewer.onClick} onKeyDown={viewer.onKeyDown}>
        <img data-viewer="" data-viewer-name="reference.png" src="blob:ref" alt="reference.png" tabIndex={0} />
        <img data-viewer="" data-viewer-name="qwen-a.png" src="/api/jobs/a/result" alt="a prompt" tabIndex={0} />
        <img src="/plain.png" alt="plain" />
        <button type="button">Download</button>
      </div>
      {viewer.viewer}
    </>
  );
}

describe("useImageViewer", () => {
  it("a click on a marked image opens the viewer over the container's images, and Close gives focus back", () => {
    render(<Chat />);
    const result = screen.getByRole("img", { name: "a prompt" });
    result.focus();
    fireEvent.click(result);
    expect(screen.getByRole("dialog", { name: "qwen-a.png" })).toBeInTheDocument();
    expect(counter()).toBe("2 of 2");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(result);
  });

  it("Return on a focused image opens it; other keys, plain images and other controls open nothing", () => {
    render(<Chat />);
    fireEvent.keyDown(screen.getByRole("img", { name: "reference.png" }), { key: "a" });
    fireEvent.click(screen.getByRole("img", { name: "plain" }));
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(screen.getByRole("img", { name: "reference.png" }), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "reference.png" })).toBeInTheDocument();
    expect(counter()).toBe("1 of 2");
  });
});
