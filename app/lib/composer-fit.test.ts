import { describe, expect, it } from "vitest";
import { fitTextarea, pxOf } from "./composer-fit";

// BUG_015: the prompt box fits its text between the stylesheet's min-height (32) and max-height (208).
describe("fitTextarea", () => {
  it("is the minimum, with no scroll bar, for an empty or one-line box", () => {
    expect(fitTextarea(0, 32, 208)).toEqual({ height: 32, overflowY: "hidden" });
    expect(fitTextarea(32, 32, 208)).toEqual({ height: 32, overflowY: "hidden" });
  });

  it("is as tall as its text in between, still with no scroll bar", () => {
    expect(fitTextarea(84, 32, 208)).toEqual({ height: 84, overflowY: "hidden" });
    expect(fitTextarea(208, 32, 208)).toEqual({ height: 208, overflowY: "hidden" });
  });

  it("stops at the maximum and scrolls only past it", () => {
    expect(fitTextarea(209, 32, 208)).toEqual({ height: 208, overflowY: "auto" });
    expect(fitTextarea(900, 23, 122)).toEqual({ height: 122, overflowY: "auto" });
  });
});

describe("pxOf", () => {
  it("reads a computed px length, and falls back for none", () => {
    expect(pxOf("208px", 0)).toBe(208);
    expect(pxOf("23.5px", 0)).toBe(23.5);
    expect(pxOf("none", 999)).toBe(999);
  });
});
