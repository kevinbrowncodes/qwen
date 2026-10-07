import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

// STORY_024: Copy and Copy all, in a secure context and over plain http.
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  Object.defineProperty(document, "execCommand", { configurable: true, value: undefined });
});

describe("copyText", () => {
  it("uses the Clipboard API when there is one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    expect(await copyText("42")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("42");
  });

  it("falls back to the copy command without one, and leaves nothing behind", async () => {
    let selected = "";
    const exec = vi.fn(() => {
      selected = document.querySelector("textarea")?.value ?? "";
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    expect(await copyText("Seed: 42")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(selected).toBe("Seed: 42");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("answers false when neither works", async () => {
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => { throw new Error("no"); } });
    expect(await copyText("x")).toBe(false);
  });
});
