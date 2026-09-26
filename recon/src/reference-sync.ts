/**
 * `pnpm reference:sync` (STORY_009): turns the harvested reference assets (docs/recon/<date>/, STORY_003) into what
 * the app serves, under app/public/reference/:
 *   reference.css  every stylesheet the reference page applies, verbatim, concatenated in the page's own order
 *   sprite.svg     every harvested icon as a <symbol> with its original id, for <use href="/reference/sprite.svg#id">
 * `--check` builds in memory and exits 1 if the committed files differ, so a stale copy fails the gate.
 * Lift what renders; write what runs (CLAUDE.md §3e).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "parse5";
import { RECON_ROOT } from "./config.ts";
import { elements, getAttr, textContent } from "./html-tree.ts";

export const CAPTURE_DATE = "2026-09-26";

export type Sheet = { kind: "inline"; file: string } | { kind: "link"; file: string };

/**
 * The stylesheets in the snapshot in document order. Inline styles are numbered as the harvest numbers them (non-empty
 * ones, document order); links name their harvested file, and a link with no file (index46.css) is skipped.
 */
export function sheetOrder(snapshotHtml: string, available: ReadonlySet<string>): Sheet[] {
  const out: Sheet[] = [];
  let n = 0;
  for (const el of elements(parse(snapshotHtml))) {
    if (el.tagName === "style") {
      if (textContent(el).trim() === "") continue;
      n += 1;
      out.push({ kind: "inline", file: `inline-${String(n).padStart(2, "0")}.css` });
    } else if (el.tagName === "link" && (getAttr(el, "rel") ?? "") === "stylesheet") {
      const file = (getAttr(el, "href") ?? "").split("/").pop() ?? "";
      if (available.has(file)) out.push({ kind: "link", file });
    }
  }
  return out;
}

export function buildCss(order: readonly Sheet[], read: (file: string) => string): string {
  return order.map((s) => `/* ==== ${s.kind === "inline" ? "inline style" : "stylesheet"} ${s.file} (docs/recon/${CAPTURE_DATE}/assets/css/) ==== */\n${read(s.file).trimEnd()}\n`).join("\n");
}

const WRAPPER = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"(?: xmlns:xlink="[^"]*")? viewBox="([^"]*)">([\s\S]*)<\/svg>\s*$/;

/** One icon file (as the harvest writes it) becomes a symbol with the reference's id. */
export function toSymbol(id: string, svg: string): string {
  const m = WRAPPER.exec(svg);
  if (!m) throw new Error(`icon ${id} is not in the harvest's standalone form`);
  return `<symbol id="${id}" viewBox="${m[1] ?? ""}">${m[2] ?? ""}</symbol>`;
}

export function buildSprite(icons: ReadonlyArray<{ id: string; svg: string }>): string {
  const symbols = [...icons].sort((a, b) => a.id.localeCompare(b.id)).map((i) => toSymbol(i.id, i.svg));
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n${symbols.join("\n")}\n</svg>\n`;
}

/** Icon ids and files from the harvest's index.json (`origin: "symbol #<id>"`). */
export function iconEntries(index: unknown): Array<{ id: string; path: string }> {
  if (typeof index !== "object" || index === null || !("files" in index) || !Array.isArray(index.files)) return [];
  const out: Array<{ id: string; path: string }> = [];
  for (const f of index.files) {
    if (typeof f !== "object" || f === null) continue;
    const origin = "origin" in f && typeof f.origin === "string" ? f.origin : "";
    const p = "path" in f && typeof f.path === "string" ? f.path : "";
    const m = /^symbol #(.+)$/.exec(origin);
    if (m?.[1] && p) out.push({ id: m[1], path: p });
  }
  return out;
}

/** The stylesheet file names the harvest wrote (`css/<name>` in index.json). */
export function cssFiles(index: unknown): Set<string> {
  const out = new Set<string>();
  if (typeof index !== "object" || index === null || !("files" in index) || !Array.isArray(index.files)) return out;
  for (const f of index.files) {
    const p = typeof f === "object" && f !== null && "path" in f && typeof f.path === "string" ? f.path : "";
    if (p.startsWith("css/")) out.add(p.slice(4));
  }
  return out;
}

export function build(repo: string): Map<string, string> {
  const recon = path.join(repo, "docs", "recon", CAPTURE_DATE);
  const assets = path.join(recon, "assets");
  const index: unknown = JSON.parse(readFileSync(path.join(assets, "index.json"), "utf8"));
  const order = sheetOrder(readFileSync(path.join(recon, "snapshots", "home-signed-in@1437.html"), "utf8"), cssFiles(index));
  const css = buildCss(order, (file) => readFileSync(path.join(assets, "css", file), "utf8"));
  const sprite = buildSprite(iconEntries(index).map((e) => ({ id: e.id, svg: readFileSync(path.join(assets, e.path), "utf8") })));
  const out = new Map([
    ["reference.css", css],
    ["sprite.svg", sprite],
  ]);
  const logo = path.join(assets, "brand", "qwen-logo-dark.svg");
  if (existsSync(logo)) out.set("qwen-logo-dark.svg", readFileSync(logo, "utf8"));
  return out;
}

export const OUT_DIR = path.resolve(RECON_ROOT, "..", "app", "public", "reference");

function main(argv: string[]): number {
  const outputs = build(path.resolve(RECON_ROOT, ".."));
  if (argv.includes("--check")) {
    const stale = [...outputs].filter(([file, content]) => !existsSync(path.join(OUT_DIR, file)) || readFileSync(path.join(OUT_DIR, file), "utf8") !== content).map(([f]) => f);
    if (stale.length > 0) {
      console.error(`reference-sync: app/public/reference/ is out of date (${stale.join(", ")}); run pnpm reference:sync`);
      return 1;
    }
    console.log("reference-sync: up to date");
    return 0;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [file, content] of outputs) writeFileSync(path.join(OUT_DIR, file), content);
  console.log(`reference-sync: wrote ${[...outputs.keys()].join(", ")} to app/public/reference/`);
  return 0;
}

if (process.argv[1]?.endsWith("reference-sync.ts")) process.exitCode = main(process.argv.slice(2));
