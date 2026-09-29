import { afterEach, describe, expect, it, vi } from "vitest";
import { applyZoom, currentZoom, parseZoom, readZoom, writeZoom, ZOOM_EVENT, ZOOM_KEY, ZOOM_STEPS, zoomLabel } from "./ui-zoom";

// STORY_020: the interface zoom, applied to <html> and remembered in this browser.
afterEach(() => {
  vi.restoreAllMocks();
  const root = document.documentElement;
  root.style.cssText = "";
  delete root.dataset["zoom"];
  window.localStorage.clear();
});

describe("steps", () => {
  it("are 1x to 4x, with the fine steps between", () => {
    expect(ZOOM_STEPS.map(zoomLabel)).toEqual(["1×", "1.25×", "1.5×", "2×", "3×", "4×"]);
  });

  it("parse from storage, and anything that is not a step reads as 1x", () => {
    expect(ZOOM_STEPS.map((z) => parseZoom(String(z)))).toEqual([...ZOOM_STEPS]);
    for (const raw of ["5", "0", "-2", "abc", "", null]) expect(parseZoom(raw), String(raw)).toBe(1);
  });
});

describe("applyZoom", () => {
  it("sets zoom, --ui-zoom and data-zoom, and clears all three at 1x", () => {
    const root = document.documentElement;
    applyZoom(root, 1.5);
    expect(root.style.getPropertyValue("zoom")).toBe("1.5");
    expect(root.style.getPropertyValue("--ui-zoom")).toBe("1.5");
    expect(root.dataset["zoom"]).toBe("1.5");
    expect(currentZoom()).toBe(1.5);
    applyZoom(root, 1);
    expect(root.style.getPropertyValue("zoom")).toBe("");
    expect(root.style.getPropertyValue("--ui-zoom")).toBe("");
    expect(root.dataset["zoom"]).toBeUndefined();
    expect(currentZoom()).toBe(1);
  });
});

describe("readZoom and writeZoom", () => {
  it("remember a step, forget it at 1x, and tell the layout", () => {
    const heard = vi.fn();
    window.addEventListener(ZOOM_EVENT, heard);
    writeZoom(2);
    expect(window.localStorage.getItem(ZOOM_KEY)).toBe("2");
    expect(readZoom()).toBe(2);
    writeZoom(1);
    expect(window.localStorage.getItem(ZOOM_KEY)).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    window.removeEventListener(ZOOM_EVENT, heard);
  });

  it("still apply when storage throws, and read it as 1x", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    writeZoom(3);
    expect(currentZoom()).toBe(3);
    expect(readZoom()).toBe(1);
  });
});
