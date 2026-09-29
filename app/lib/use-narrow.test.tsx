import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNarrow } from "./use-narrow";
import { ZOOM_EVENT } from "./ui-zoom";

// STORY_020: the hook follows the effective width (the window's divided by the interface zoom), from resize and zoom
// events; it replaced a matchMedia source that cannot see CSS zoom.
function setWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}
function setZoom(zoom: string): void {
  document.documentElement.style.setProperty("zoom", zoom);
}

function Probe() {
  return <p>{useNarrow() ? "narrow" : "wide"}</p>;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.className = "";
  document.documentElement.style.cssText = "";
});

describe("useNarrow", () => {
  it("follows the window width and keeps html.mobile and the root size in step", () => {
    setWidth(1440);
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByText("wide")).toBeTruthy();
    act(() => {
      setWidth(390);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByText("narrow")).toBeTruthy();
    expect(document.documentElement.classList.contains("mobile")).toBe(true);
    expect(document.documentElement.style.fontSize).toBe("16.64px");
    act(() => {
      setWidth(1440);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByText("wide")).toBeTruthy();
    expect(document.documentElement.classList.contains("mobile")).toBe(false);
  });

  it("turns narrow when a zoom step makes the effective width 768 or less, and back", () => {
    setWidth(2670);
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    act(() => {
      setZoom("4");
      window.dispatchEvent(new Event(ZOOM_EVENT));
    });
    expect(screen.getByText("narrow")).toBeTruthy();
    act(() => {
      setZoom("");
      window.dispatchEvent(new Event(ZOOM_EVENT));
    });
    expect(screen.getByText("wide")).toBeTruthy();
  });

  it("renders the desktop layout on the server, where there is no viewport", () => {
    expect(renderToString(<Probe />)).toContain("wide");
  });

  it("stops listening on unmount, even after StrictMode's double mount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    unmount();
    const ours = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === "resize" || type === ZOOM_EVENT).length;
    expect(ours(add)).toBeGreaterThan(0);
    expect(ours(remove)).toBe(ours(add));
  });
});
