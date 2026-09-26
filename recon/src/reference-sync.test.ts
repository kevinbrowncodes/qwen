import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RECON_ROOT } from "./config.ts";
import { build, buildCss, buildSprite, cssFiles, iconEntries, OUT_DIR, sheetOrder, toSymbol } from "./reference-sync.ts";

const page = `<html><head>
<style rc-util-key="a">.a{}</style>
<style id="empty"></style>
<link rel="stylesheet" href="../assets/css/main.css">
<link rel="icon" href="x.png">
<link rel="stylesheet" href="../assets/css/index46.css">
<style id="erd">.erd{}</style>
<link rel="stylesheet" href="../assets/css/index4.css">
</head><body><style>:root{--x:1}</style></body></html>`;

describe("sheetOrder", () => {
  it("keeps the page's order, numbers non-empty inline styles as the harvest does, and skips links with no file", () => {
    expect(sheetOrder(page, new Set(["main.css", "index4.css"]))).toEqual([
      { kind: "inline", file: "inline-01.css" },
      { kind: "link", file: "main.css" },
      { kind: "inline", file: "inline-02.css" },
      { kind: "link", file: "index4.css" },
      { kind: "inline", file: "inline-03.css" },
    ]);
  });
});

describe("buildCss", () => {
  it("concatenates verbatim, in order, each under a header naming its file", () => {
    const css = buildCss([{ kind: "inline", file: "inline-01.css" }, { kind: "link", file: "main.css" }], (f) => (f === "main.css" ? "b{}\n\n" : "a{}"));
    expect(css.indexOf("a{}")).toBeLessThan(css.indexOf("b{}"));
    expect(css).toContain("/* ==== stylesheet main.css");
    expect(css).toContain("/* ==== inline style inline-01.css");
  });
});

describe("sprite", () => {
  it("turns a harvested icon into a symbol with its id and viewBox, children unchanged", () => {
    expect(toSymbol("qwpcicon-x", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1"></path></svg>\n')).toBe('<symbol id="qwpcicon-x" viewBox="0 0 24 24"><path d="M1 1"></path></symbol>');
    expect(toSymbol("x", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"><use xlink:href="#a"></use></svg>')).toContain('<use xlink:href="#a">');
  });

  it("refuses markup that is not the harvest's form", () => {
    expect(() => toSymbol("x", "<svg><path/></svg>")).toThrow(/standalone form/);
  });

  it("sorts symbols by id and declares both namespaces", () => {
    const sprite = buildSprite([
      { id: "b", svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>' },
      { id: "a", svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"></svg>' },
    ]);
    expect(sprite.indexOf('id="a"')).toBeLessThan(sprite.indexOf('id="b"'));
    expect(sprite).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" xmlns:xlink=/);
  });

  it("reads icon ids and css files from the harvest index", () => {
    const index = { files: [{ path: "icons/desktop/x.svg", origin: "symbol #qwpcicon-x" }, { path: "css/main.css" }, { path: "icons/inline/icon-1.svg" }] };
    expect(iconEntries(index)).toEqual([{ id: "qwpcicon-x", path: "icons/desktop/x.svg" }]);
    expect([...cssFiles(index)]).toEqual(["main.css"]);
    expect(iconEntries(null)).toEqual([]);
    expect(cssFiles({})).toEqual(new Set());
  });
});

describe("the committed copies in app/public/reference/", () => {
  const outputs = build(path.resolve(RECON_ROOT, ".."));

  it("hold every harvested icon, and the stylesheets in the page's order", () => {
    const sprite = outputs.get("sprite.svg") ?? "";
    expect((sprite.match(/<symbol /g) ?? []).length).toBe(1113);
    const css = outputs.get("reference.css") ?? "";
    expect(css.indexOf("stylesheet main.css")).toBeLessThan(css.indexOf("stylesheet index4.css"));
    expect(css).not.toContain("index46.css");
  });

  it("are up to date with docs/recon (run pnpm reference:sync)", () => {
    for (const [file, content] of outputs) {
      const committed = path.join(OUT_DIR, file);
      expect(existsSync(committed), file).toBe(true);
      expect(readFileSync(committed, "utf8") === content, `${file} is stale`).toBe(true);
    }
  });
});
