import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// STORY_028: every read under recon/hands/reads/ is a read of the owner's own page and nothing else.
const READS = new URL("../hands/reads/", import.meta.url);
const NOT_A_READ = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /\bWebSocket\b/,
  /sendBeacon/,
  /\.click\s*\(/,
  /\.submit\s*\(/,
  /dispatchEvent/,
  /localStorage|sessionStorage|indexedDB/,
  /document\.cookie/,
  /\blocation\s*(?:\.\w+)?\s*=[^=]/,
  /\.innerHTML\s*=[^=]/,
  /\.value\s*=[^=]/,
  /\bwindow\.\w+\s*=[^=]/,
  /\beval\s*\(/,
  /new\s+Function/,
  /\bimport\s*\(/,
];
/** The selectors STORY_028's Testing Plan names: the chat story measures these. */
const SELECTORS_WANTED = [".qwen-chat-message", ".qwen-chat-message-user", ".qwen-chat-message-assistant", ".message-input-column", ".chat-item-drag", ".chat-item-drag-link", ".user-menu-btn", ".my-library-head", ".qwen-media-skeleton"];

function reads(): string[] {
  return readdirSync(READS).filter((f) => f.endsWith(".js"));
}

describe("the committed reads", () => {
  it("exist, four of them", () => {
    expect(reads().sort()).toEqual(["dom.js", "page.js", "styles.js", "title.js"]);
  });

  for (const file of reads()) {
    it(`${file} reads the page and does nothing to it`, () => {
      const src = readFileSync(new URL(file, READS), "utf8");
      expect(src.trim()).not.toBe("");
      for (const pattern of NOT_A_READ) expect(src, `${file} matches ${String(pattern)}`).not.toMatch(pattern);
    });
  }

  it("styles.js names every selector the chat story measures", () => {
    const src = readFileSync(new URL("styles.js", READS), "utf8");
    for (const selector of SELECTORS_WANTED) expect(src, selector).toContain(`"${selector}"`);
  });

  it("the rule catches a planted write", () => {
    for (const bad of ["fetch('/x')", "document.querySelector('a').click()", "location.href = 'x'", "el.value = 'y'", "localStorage.getItem('t')"]) {
      expect(NOT_A_READ.some((p) => p.test(bad)), bad).toBe(true);
    }
    expect(NOT_A_READ.some((p) => p.test("style[p] = s[p]; a === b; x => x"))).toBe(false);
  });
});
