import { afterEach, describe, expect, it } from "vitest";
import { applyNarrowClass, BOOT_SCRIPT, isNarrow, narrowRootFontSize } from "./narrow";
import { ZOOM_KEY } from "./ui-zoom";

function boot(width: number, stored: string | null): HTMLElement {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  if (stored === null) window.localStorage.removeItem(ZOOM_KEY);
  else window.localStorage.setItem(ZOOM_KEY, stored);
  // The boot script is a string the page runs inline before hydration; this is the one way to run it as the page does.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function(BOOT_SCRIPT)();
  return document.documentElement;
}

afterEach(() => {
  const root = document.documentElement;
  root.className = "";
  root.style.cssText = "";
  delete root.dataset["zoom"];
  window.localStorage.clear();
});

describe("narrow layout", () => {
  it("toggles html.mobile and the reference's rem scale", () => {
    const root = document.createElement("html");
    applyNarrowClass(root, true, 393);
    expect(root.classList.contains("mobile")).toBe(true);
    expect(root.style.fontSize).toBe("16.768px");
    applyNarrowClass(root, false);
    expect(root.classList.contains("mobile")).toBe(false);
    expect(root.style.fontSize).toBe("");
  });

  it("matches the capture's root size at 393 and scales with width", () => {
    expect(narrowRootFontSize(393)).toBe("16.768px");
    expect(narrowRootFontSize(375)).toBe("16px");
    expect(narrowRootFontSize(390)).toBe("16.64px");
  });

  it("is narrow at an effective width of 768 or less: the window's divided by the zoom (STORY_020)", () => {
    expect(isNarrow(768)).toBe(true);
    expect(isNarrow(769)).toBe(false);
    expect(isNarrow(2670, 4)).toBe(true);
    expect(isNarrow(2670, 3)).toBe(false);
  });

  it("boots the desktop layout at 1x, with no zoom set", () => {
    const root = boot(1440, null);
    expect(root.classList.contains("mobile")).toBe(false);
    expect(root.style.zoom).toBe("");
    expect(root.dataset["zoom"]).toBeUndefined();
  });

  it("boots a stored zoom before first paint, and the phone layout when it makes the effective width narrow", () => {
    const root = boot(2670, "4");
    expect(root.style.zoom).toBe("4");
    expect(root.style.getPropertyValue("--ui-zoom")).toBe("4");
    expect(root.dataset["zoom"]).toBe("4");
    expect(root.classList.contains("mobile")).toBe(true);
    expect(root.style.fontSize).toBe(narrowRootFontSize(2670 / 4));
  });

  it("ignores a stored value that is not a step", () => {
    expect(boot(1440, "5").style.zoom).toBe("");
    expect(boot(1440, "abc").style.zoom).toBe("");
  });

  it("boots the phone layout at phone width with no zoom, as before", () => {
    const root = boot(390, null);
    expect(root.classList.contains("mobile")).toBe(true);
    expect(root.style.fontSize).toBe("16.64px");
  });
});
