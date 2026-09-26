import { describe, expect, it } from "vitest";
import { applyNarrowClass, BOOT_SCRIPT, NARROW_QUERY, narrowRootFontSize } from "./narrow";

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

  it("boots from the same media query, and never throws", () => {
    expect(BOOT_SCRIPT).toContain(JSON.stringify(NARROW_QUERY));
    expect(BOOT_SCRIPT).toContain("try{");
  });
});
