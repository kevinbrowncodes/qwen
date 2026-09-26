import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NARROW_QUERY } from "./narrow";
import { useNarrow } from "./use-narrow";

type Listener = () => void;

function fakeMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  const mql = {
    get matches() {
      return matches;
    },
    media: NARROW_QUERY,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  vi.stubGlobal("matchMedia", (q: string) => {
    expect(q).toBe(NARROW_QUERY);
    return mql;
  });
  return {
    set(next: boolean) {
      matches = next;
      for (const l of listeners) l();
    },
    listeners,
  };
}

function Probe() {
  return <p>{useNarrow() ? "narrow" : "wide"}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = "";
  document.documentElement.style.fontSize = "";
});

describe("useNarrow", () => {
  it("follows the media query and keeps html.mobile and the root size in step", () => {
    const media = fakeMedia(false);
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(screen.getByText("wide")).toBeTruthy();
    act(() => {
      media.set(true);
    });
    expect(screen.getByText("narrow")).toBeTruthy();
    expect(document.documentElement.classList.contains("mobile")).toBe(true);
    expect(document.documentElement.style.fontSize).not.toBe("");
    act(() => {
      media.set(false);
    });
    expect(screen.getByText("wide")).toBeTruthy();
    expect(document.documentElement.classList.contains("mobile")).toBe(false);
  });

  it("renders the desktop layout on the server, where there is no viewport", () => {
    expect(renderToString(<Probe />)).toContain("wide");
  });

  it("stops listening on unmount, even after StrictMode's double mount", () => {
    const media = fakeMedia(true);
    const { unmount } = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
