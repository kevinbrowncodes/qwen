/**
 * recon/run.sh harvest <date>  (STORY_003)
 *
 * Lifts the reference's stylesheets, icons and logo into
 * docs/recon/<date>/assets/ and writes the design tokens beside them.
 * Offline: it reads the owner's saved files (recon/out/<date>/) and the
 * cleaned snapshot STORY_002 committed, and makes no request. Everything is
 * built in memory and passes the allow-list, the identity guard and the size
 * limit before a single file is written.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "parse5";
import { OUT_DIR, RECON_ROOT } from "./config.ts";
import { parseReadingFileName, validateReading, type Reading } from "./curate-model.ts";
import { elements, getAttr, hasClass, textContent } from "./html-tree.ts";
import { canonicalUrl, cdnFileName, cssUrlReferences, type HarvestIndex, indexEntry, SIZE_LIMIT_BYTES, sniffKind, sortIndex } from "./harvest-model.ts";
import { assertNoIdentity } from "./identity-guard.ts";
import { countSymbols, extractIcons, extractInlineSvgs, iconUsage, renderIconIndex } from "./icons.ts";
import { readIdentity } from "./snapshot.ts";
import {
  breakpoints,
  customProperties,
  fontFaces,
  fontStacks,
  LAYOUT_DIFFERENCES,
  mergeCustomProperties,
  motion,
  palette,
  radii,
  renderTokensMd,
  shadows,
  spacingScale,
  styleSamples,
  type Tokens,
  typeScale,
} from "./tokens-model.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SNAPSHOT = "snapshots/home-signed-in@1437.html";

function main(argv: string[]): number {
  const date = argv[0];
  if (date === undefined || !DATE.test(date)) {
    console.error("usage: recon/run.sh harvest YYYY-MM-DD");
    return 2;
  }
  const inDir = path.join(OUT_DIR, date);
  const outDir = path.resolve(RECON_ROOT, "..", "docs", "recon", date);
  const snapshotPath = path.join(outDir, SNAPSHOT);
  if (!existsSync(snapshotPath)) {
    console.error(`harvest: ${SNAPSHOT} is missing; run recon/run.sh curate ${date} first (STORY_002).`);
    return 2;
  }

  const outputs = new Map<string, string | Uint8Array>();
  const index: HarvestIndex = { files: [], references: [] };
  const put = (rel: string, content: string | Uint8Array, source: string, origin?: string): void => {
    const kind = sniffKind(rel, typeof content === "string" ? new TextEncoder().encode(content) : content);
    if (kind === null) throw new Error(`harvest: ${rel} is not an allowed type (CSS, SVG or an image); refusing to write it`);
    outputs.set(`assets/${rel}`, content);
    index.files.push(indexEntry(rel, source, content, origin));
  };

  // ---- readings (STORY_002) ----
  const readings: Reading[] = [];
  const statesDir = path.join(outDir, "states");
  for (const name of readdirSync(statesDir).sort()) {
    if (parseReadingFileName(name)) readings.push(validateReading(name, JSON.parse(readFileSync(path.join(statesDir, name), "utf8"))));
  }

  // ---- stylesheets ----
  const home = readings.find((r) => r.state === "home-signed-in" && r.viewport.width === 1437);
  const loaded = Array.isArray(home?.loaded_stylesheets) ? home.loaded_stylesheets.filter((u): u is string => typeof u === "string") : [];
  const urlByFile = new Map(loaded.map((u) => [cdnFileName(u), canonicalUrl(u)]));
  const cssDir = path.join(inDir, "assets", "css");
  const sheets: Array<{ css: string; file: string }> = [];
  for (const name of readdirSync(cssDir).sort()) {
    const url = urlByFile.get(name);
    if (url === undefined) throw new Error(`harvest: assets/css/${name} has no URL in home-signed-in@1437's loaded_stylesheets; stopping`);
    const bytes = readFileSync(path.join(cssDir, name));
    put(`css/${name}`, new Uint8Array(bytes), url);
    const css = bytes.toString("utf8");
    sheets.push({ css, file: `css/${name}` });
    index.references.push(...cssUrlReferences(css, `css/${name}`));
  }
  const snapshotHtml = readFileSync(snapshotPath, "utf8");
  const doc = parse(snapshotHtml);
  let n = 0;
  for (const style of elements(doc).filter((el) => el.tagName === "style")) {
    const css = textContent(style);
    if (css.trim() === "") continue;
    n += 1;
    const file = `css/inline-${String(n).padStart(2, "0")}.css`;
    const origin = getAttr(style, "rc-util-key") ?? getAttr(style, "data-css-hash") ?? getAttr(style, "id") ?? undefined;
    put(file, `${css.trimEnd()}\n`, "inline", origin === undefined ? undefined : `style ${origin}`);
    sheets.push({ css, file });
    index.references.push(...cssUrlReferences(css, file));
  }

  // ---- icons ----
  const icons = extractIcons(snapshotHtml);
  const counts = countSymbols(snapshotHtml);
  for (const [set, count] of counts) {
    const got = icons.filter((i) => i.set === set).length;
    if (got !== count) throw new Error(`harvest: ${set} has ${count} symbols but ${got} icons were extracted`);
  }
  for (const icon of icons) put(`icons/${icon.set}/${icon.file}`, icon.svg, "inline", `symbol #${icon.id}`);
  const inline = extractInlineSvgs(snapshotHtml);
  for (const s of inline.saved) put(`icons/inline/${s.file}`, s.svg, "inline");
  const usage = iconUsage(
    readings.map((r) => ({ label: `${r.state}@${r.viewport.width}`, data: r })),
    new Set(icons.map((i) => i.id)),
  );
  for (const id of inline.spriteUses) {
    const set = usage.get(id) ?? new Set<string>();
    set.add("snapshot home-signed-in@1437");
    usage.set(id, set);
  }
  outputs.set("assets/icons/index.md", renderIconIndex(icons, inline.saved, usage, date));

  // ---- brand ----
  const logoNames = elements(doc)
    .filter((el) => el.tagName === "img" && hasClass(el, "logo-img"))
    .map((el) => getAttr(el, "src") ?? "")
    .filter((src) => src.startsWith("../assets/brand/"))
    .map((src) => src.slice("../assets/brand/".length));
  const brandWaiting: string[] = [];
  for (const name of [...new Set(logoNames)].sort()) {
    const from = path.join(inDir, "Qwen_files", name);
    if (existsSync(from)) put(`brand/${name}`, new Uint8Array(readFileSync(from)), `Qwen_files/${name} (owner's saved page)`);
    else brandWaiting.push(name);
  }

  // ---- tokens ----
  const samples = readings.flatMap(styleSamples);
  const tokens: Tokens = {
    date,
    fontStacks: fontStacks(samples),
    fontFaces: sheets.flatMap((s) => fontFaces(s.css, s.file)),
    palette: palette(samples),
    typeScale: typeScale(samples),
    spacing: spacingScale(samples),
    radii: radii(samples),
    shadows: shadows(samples),
    motion: motion(samples),
    breakpoints: breakpoints(sheets),
    customProperties: mergeCustomProperties(sheets.map((s) => customProperties(s.css, s.file))),
    layoutDifferences: LAYOUT_DIFFERENCES,
  };
  outputs.set("tokens.json", `${JSON.stringify(tokens, null, 2)}\n`);
  outputs.set("tokens.md", renderTokensMd(tokens));
  outputs.set("assets/index.json", `${JSON.stringify(sortIndex(index), null, 2)}\n`);

  // ---- checks, then write ----
  assertNoIdentity(outputs, readIdentityFromSaved(inDir));
  console.log("identity guard: clean");
  let total = 0;
  for (const [rel, c] of outputs) if (rel.startsWith("assets/")) total += typeof c === "string" ? Buffer.byteLength(c) : c.byteLength;
  if (total > SIZE_LIMIT_BYTES) {
    console.error(`harvest: assets come to ${(total / 1048576).toFixed(1)} MB, over the 20 MB limit. Nothing was written; ask the owner.`);
    return 3;
  }
  rmSync(path.join(outDir, "assets"), { recursive: true, force: true });
  for (const [rel, content] of outputs) {
    const file = path.join(outDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  const perSet = [...counts.entries()].map(([s, c]) => `${s} ${c}`).join(", ");
  console.log(`harvest: ${index.files.length} files, ${(total / 1048576).toFixed(2)} MB, to docs/recon/${date}/assets/`);
  console.log(`harvest: ${sheets.length} stylesheets (${n} inline); icons ${perSet}; ${inline.saved.length} other inline svgs; ${index.references.length} url() references not fetched`);
  console.log(`harvest: tokens: ${tokens.palette.length} colours, ${tokens.typeScale.length} type sizes, ${tokens.breakpoints.length} breakpoints, ${tokens.customProperties.length} custom properties`);
  if (brandWaiting.length > 0) console.log(`harvest: brand is waiting for the owner to copy Qwen_files/ into recon/out/${date}/ (needs ${brandWaiting.join(", ")})`);
  return 0;
}

/** The identity comes from the owner's raw save (the snapshot is already masked). */
function readIdentityFromSaved(inDir: string): ReturnType<typeof readIdentity> {
  return readIdentity(parse(readFileSync(path.join(inDir, "Qwen.html"), "utf8")));
}

process.exitCode = main(process.argv.slice(2));
