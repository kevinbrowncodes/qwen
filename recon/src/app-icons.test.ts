import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iconSvg, markPaths, OUTPUTS, PAGE_COLOUR, pngSize, union } from "./app-icons.ts";

// The logo's shape: a square mark (two paths) then a gap, then four letters.
const boxes = [
  { x: 0, y: 0, width: 50, height: 61 },
  { x: 20, y: 10, width: 40, height: 40 },
  { x: 72, y: 12, width: 30, height: 40 },
  { x: 105, y: 20, width: 28, height: 30 },
  { x: 136, y: 20, width: 40, height: 30 },
  { x: 180, y: 20, width: 48, height: 30 },
];

describe("app icons (BUG_009)", () => {
  it("keeps the paths left of the widest gap: the mark, not the lettering", () => {
    expect(markPaths(boxes)).toEqual([0, 1]);
    // Order does not matter: a letter listed first is still left out.
    const shuffled = [{ x: 136, y: 20, width: 40, height: 30 }, { x: 0, y: 0, width: 50, height: 61 }, { x: 20, y: 10, width: 40, height: 40 }];
    expect(markPaths(shuffled)).toEqual([1, 2]);
  });

  it("takes the union of boxes", () => {
    expect(union([{ x: 0, y: 5, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 }])).toEqual({ x: 0, y: 0, width: 15, height: 15 });
  });

  it("builds a square SVG with the page colour behind the white mark", () => {
    const svg = iconSvg(["M0 0L1 1"], { x: 0, y: 0, width: 60, height: 60 }, 0.2);
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    expect(vb?.[3]).toBe(vb?.[4]);
    expect(Number(vb?.[3])).toBe(100);
    expect(svg).toContain(`fill="${PAGE_COLOUR}"`);
    expect(svg.match(/<path /g)).toHaveLength(1);
  });

  it("the committed icons exist at their sizes", () => {
    for (const [file, size] of [[OUTPUTS.apple, 180], [OUTPUTS.i192, 192], [OUTPUTS.i512, 512]] as const) {
      expect(existsSync(file), file).toBe(true);
      expect(pngSize(readFileSync(file))).toEqual({ width: size, height: size });
    }
    expect(readFileSync(OUTPUTS.svg, "utf8")).toContain(PAGE_COLOUR);
  });

  it("refuses a file that is not a PNG", () => {
    expect(() => pngSize(new Uint8Array(30))).toThrow();
  });
});
