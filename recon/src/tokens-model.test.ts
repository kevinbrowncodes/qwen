import { describe, expect, it } from "vitest";
import {
  breakpoints,
  canonicalColour,
  customProperties,
  fontFaces,
  LAYOUT_DIFFERENCES,
  mergeCustomProperties,
  motion,
  palette,
  radii,
  renderTokensMd,
  shadows,
  spacingScale,
  type StyleSample,
  styleSamples,
  typeScale,
} from "./tokens-model.ts";

describe("customProperties", () => {
  const css = ":root{--a:1px;--b: #fff }html.dark{--c:#171717}html.light{--c:#fff}.button{--d:2}html.mobile .x{--e:3}@media (max-width:600px){:root{--f:1}}";
  const props = customProperties(css, "main.css");

  it("reads :root, html.dark and html.light, keeping the themes apart", () => {
    expect(props.map((p) => `${p.theme} ${p.name}=${p.value}`)).toEqual(["base --a=1px", "base --b=#fff", "dark --c=#171717", "light --c=#fff"]);
  });

  it("ignores other selectors and rules inside media queries", () => {
    expect(props.some((p) => ["--d", "--e", "--f"].includes(p.name))).toBe(false);
  });

  it("keeps the first definition per theme across files", () => {
    const merged = mergeCustomProperties([props, customProperties("html.dark{--c:#000}", "later.css")]);
    expect(merged.find((p) => p.theme === "dark" && p.name === "--c")?.value).toBe("#171717");
  });
});

describe("fontFaces", () => {
  it("extracts family, weight, style and sources, and marks KaTeX out of scope", () => {
    const faces = fontFaces(
      "@font-face{font-family:KaTeX_AMS;font-style:normal;font-weight:400;src:url(//cdn/KaTeX_AMS.woff2) format('woff2'),url(//cdn/KaTeX_AMS.woff)}@font-face{font-family:'Inter';src:url(inter.woff2)}",
      "main.css",
    );
    expect(faces[0]).toMatchObject({ family: "KaTeX_AMS", weight: "400", style: "normal", sources: ["//cdn/KaTeX_AMS.woff2", "//cdn/KaTeX_AMS.woff"], inScope: false });
    expect(faces[1]).toMatchObject({ family: "Inter", weight: "normal", inScope: true });
  });
});

describe("breakpoints", () => {
  it("reads min/max-width and range syntax, converts rem, de-duplicates and sorts", () => {
    const bps = breakpoints([
      { css: "@media (max-width:768px){a{b:c}}@media screen and (width<=768px){a{b:c}}@media (width>=1440px) and (width<1760px){a{b:c}}", file: "a.css" },
      { css: "@media (min-width: 37.5rem){a{b:c}}@media (prefers-reduced-motion:reduce){a{b:c}}", file: "b.css" },
    ]);
    expect(bps.map((b) => b.px)).toEqual([600, 768, 1440, 1760]);
    expect(bps.find((b) => b.px === 768)?.queries).toHaveLength(2);
    expect(bps.find((b) => b.px === 600)?.files).toEqual(["b.css"]);
  });

  it("is empty when no query names a width", () => {
    expect(breakpoints([{ css: "@media print{a{b:c}}", file: "x.css" }])).toEqual([]);
  });
});

describe("canonicalColour", () => {
  it("collapses hex and rgb forms of one colour, keeps alpha distinct and drops transparent", () => {
    expect(canonicalColour("#FFF")).toBe("#ffffff");
    expect(canonicalColour("rgb(255, 255, 255)")).toBe("#ffffff");
    expect(canonicalColour("rgba(250,251,255,0.05)")).toBe("rgba(250, 251, 255, 0.05)");
    expect(canonicalColour("#00000080")).toBe("rgba(0, 0, 0, 0.5)");
    expect(canonicalColour("rgba(0,0,0,0)")).toBeNull();
    expect(canonicalColour("transparent")).toBeNull();
    expect(canonicalColour("inherit")).toBeNull();
  });
});

const reading = {
  state: "composer-image-mode",
  viewport: { width: 1437 },
  components: [
    {
      name: "composer",
      style: { font_family: "system-ui, Inter, sans-serif", font_size: "16px", font_weight: "400", line_height: "normal", color: "#000000", background: "#2c2c2c", border: "0.8px solid rgba(250,251,255,0.2)", border_radius: "28px", padding: "12px", gap: "normal", box_shadow: "rgba(0,0,0,0.05) 0px 8px 16px -4px", transition: "height 0.2s ease-in-out" },
      children: [
        { name: "prompt-input", style: { font_family: "inherit", font_size: "16px", line_height: "26px", color: "#fafbff", background: "transparent", padding: "3px 8px", border_radius: "0px" } },
        { name: "pill", style: { font_size: "14px", font_weight: "500", color: "rgb(250, 251, 255)", padding: "0px 12px", gap: "4px", transition: "none" } },
      ],
    },
  ],
};

describe("values from the readings", () => {
  const samples: StyleSample[] = styleSamples(reading);

  it("labels every styled component by state, width and name", () => {
    expect(samples.map((s) => s.where)).toEqual(["composer-image-mode@1437 composer", "composer-image-mode@1437 prompt-input", "composer-image-mode@1437 pill"]);
  });

  it("builds a palette from text, background and border colours", () => {
    expect(palette(samples).map((c) => c.value)).toEqual(["#000000", "#2c2c2c", "#fafbff", "rgba(250, 251, 255, 0.2)"]);
    expect(palette(samples).find((c) => c.value === "#fafbff")?.seenIn).toEqual(["composer-image-mode@1437 pill", "composer-image-mode@1437 prompt-input"]);
  });

  it("orders the type scale by size and records weights and where each size was seen", () => {
    const scale = typeScale(samples);
    expect(scale.map((s) => s.size)).toEqual(["14px", "16px"]);
    expect(scale[1]?.lineHeights).toEqual(["26px", "normal"]);
    expect(scale[1]?.seenIn).toHaveLength(2);
  });

  it("makes an ascending spacing scale without zero", () => {
    expect(spacingScale(samples).map((s) => s.value)).toEqual(["3px", "4px", "8px", "12px"]);
  });

  it("collects radii, shadows and motion, dropping zero and none", () => {
    expect(radii(samples).map((r) => r.value)).toEqual(["28px"]);
    expect(shadows(samples).map((s) => s.value)).toEqual(["rgba(0,0,0,0.05) 0px 8px 16px -4px"]);
    expect(motion(samples).map((m) => m.value)).toEqual(["height 0.2s ease-in-out"]);
  });

  it("renders every section and the font statement", () => {
    const md = renderTokensMd({
      date: "2026-09-26",
      fontStacks: [{ value: "system-ui, Inter, sans-serif", seenIn: ["x"] }],
      fontFaces: [{ family: "KaTeX_AMS", weight: "400", style: "normal", sources: [], file: "css/main.css", inScope: false }],
      palette: palette(samples),
      typeScale: typeScale(samples),
      spacing: spacingScale(samples),
      radii: radii(samples),
      shadows: shadows(samples),
      motion: motion(samples),
      breakpoints: [{ px: 768, queries: ["(max-width:768px)"], files: ["css/main.css"] }],
      customProperties: [{ name: "--dark-bg", value: "#171717", theme: "dark", selector: "html.dark", file: "css/main.css" }],
      layoutDifferences: LAYOUT_DIFFERENCES,
    });
    for (const heading of ["## Fonts", "## Palette", "## Type scale", "## Spacing", "## Radii", "## Shadows", "## Motion", "## Breakpoints", "## Custom properties"]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("**No font file is harvested.**");
    expect(md).toContain("KaTeX math fonts");
    expect(md).toContain("inferred, not measured");
    expect(md).toContain("`--dark-bg` | `#171717`");
  });
});
