import { describe, expect, it } from "vitest";
import { canonicalUrl, cdnFileName, cssUrlReferences, indexEntry, sha256, sniffKind, sortIndex } from "./harvest-model.ts";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("sniffKind (the allow-list)", () => {
  it("keeps stylesheets, SVG and the image types", () => {
    expect(sniffKind("main.css", enc(".a{color:red}"))).toBe("css");
    expect(sniffKind("main.css", enc("@charset \"utf-8\";:root{--x:1}"))).toBe("css");
    expect(sniffKind("logo.svg", enc('<?xml version="1.0"?>\n<!-- logo --><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("svg");
    expect(sniffKind("a.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("png");
    expect(sniffKind("a.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffKind("a.webp", enc("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("webp");
  });

  it("refuses JavaScript, JSON and HTML, including JavaScript saved under a .css or .svg name", () => {
    expect(sniffKind("app.js", enc("console.log(1)"))).toBeNull();
    expect(sniffKind("chunk.css", enc('"use strict";var a=1;'))).toBeNull();
    expect(sniffKind("chunk.css", enc("!function(){window.x=1}()"))).toBeNull();
    expect(sniffKind("chunk.css", enc("import{a}from'./b.js'"))).toBeNull();
    expect(sniffKind("icon.svg", enc("export default 1"))).toBeNull();
    expect(sniffKind("data.css", enc('{"a":1}'))).toBeNull();
    expect(sniffKind("page.css", enc("<!doctype html><html></html>"))).toBeNull();
    expect(sniffKind("page.html", enc("<html></html>"))).toBeNull();
  });
});

describe("CDN names", () => {
  it("map a URL to a stable file name without the query", () => {
    expect(cdnFileName("https://assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.3.11/css/main.css?t=1")).toBe("main.css");
    expect(canonicalUrl("//assets.alicdn.com/g/x/0.3.11/css/index4.css#a")).toBe("https://assets.alicdn.com/g/x/0.3.11/css/index4.css");
  });

  it("refuses a URL with no file name", () => {
    expect(() => cdnFileName("https://assets.alicdn.com/")).toThrow();
  });
});

describe("index entries", () => {
  it("record path, source, byte count and sha256", () => {
    const e = indexEntry("css/a.css", "https://cdn/a.css", "é{}");
    expect(e).toEqual({ path: "css/a.css", source: "https://cdn/a.css", bytes: 4, sha256: sha256("é{}") });
  });

  it("come out in a stable order", () => {
    const a = indexEntry("icons/b.svg", "inline", "b");
    const b = indexEntry("css/a.css", "x", "a");
    const refs = [
      { url: "https://z", in: "css/a.css", harvested: false as const, reason: "r" },
      { url: "https://a", in: "css/a.css", harvested: false as const, reason: "r" },
    ];
    const one = sortIndex({ files: [a, b], references: refs });
    const two = sortIndex({ files: [b, a], references: [...refs].reverse() });
    expect(one).toEqual(two);
    expect(one.files.map((f) => f.path)).toEqual(["css/a.css", "icons/b.svg"]);
  });
});

describe("cssUrlReferences", () => {
  it("lists each non-data url once, marks KaTeX fonts out of scope, and skips data URIs", () => {
    const css = "i{filter:url(%23n)}j{mask:url(#m)}a{background:url(data:image/png;base64,AAA)}@font-face{src:url(//cdn/fonts/KaTeX_AMS-Regular.woff2?x=1) format('woff2'),url('//cdn/fonts/KaTeX_AMS-Regular.woff2')}b{background:url(\"https://cdn/img/x.png\")}";
    const refs = cssUrlReferences(css, "css/main.css");
    expect(refs.map((r) => r.url)).toEqual(["https://cdn/fonts/KaTeX_AMS-Regular.woff2", "https://cdn/img/x.png"]);
    expect(refs[0]?.reason).toMatch(/KaTeX/);
    expect(refs.every((r) => r.harvested === false)).toBe(true);
  });
});
