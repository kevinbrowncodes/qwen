/**
 * `pnpm reference:icons` (BUG_009): the app's icons from the harvested Qwen logo (docs/recon/<date>/assets/brand/,
 * STORY_003). The logo is the mark followed by the lettering; the mark is every path whose box lies left of the
 * lettering, measured in the browser. It is set in white on the page colour (#171717) with a margin, and written as
 * the favicon (SVG), the Apple touch icon (180 px) and the manifest icons (192, 512 px). No network request.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RECON_ROOT } from "./config.ts";
import { CAPTURE_DATE } from "./reference-sync.ts";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const PAGE_COLOUR = "#171717";

/**
 * The mark's paths: the ones whose box starts before the widest gap between boxes along x, which separates the
 * square mark from the lettering. Returns their indices, in order.
 */
export function markPaths(boxes: readonly Box[]): number[] {
  const order = boxes.map((b, i) => ({ b, i })).sort((a, z) => a.b.x - z.b.x);
  let cut = order.length;
  let widest = 0;
  let reach = -Infinity;
  for (let k = 0; k < order.length; k++) {
    const cur = order[k];
    if (cur === undefined) continue;
    if (k > 0 && cur.b.x - reach > widest) {
      widest = cur.b.x - reach;
      cut = k;
    }
    reach = Math.max(reach, cur.b.x + cur.b.width);
  }
  return order
    .slice(0, cut)
    .map((o) => o.i)
    .sort((a, z) => a - z);
}

/** The union of some boxes. */
export function union(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.width));
  const t = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: r - x, height: t - y };
}

/** A square SVG: the page colour behind, the mark's paths centred with `margin` (a fraction of the side) around. */
export function iconSvg(paths: readonly string[], mark: Box, margin = 0.2): string {
  const side = Math.max(mark.width, mark.height) / (1 - 2 * margin);
  const x = mark.x + mark.width / 2 - side / 2;
  const y = mark.y + mark.height / 2 - side / 2;
  const f = (n: number): string => String(Math.round(n * 1000) / 1000);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(side)} ${f(side)}"><rect x="${f(x)}" y="${f(y)}" width="${f(side)}" height="${f(side)}" fill="${PAGE_COLOUR}"/>${paths.map((d) => `<path d="${d}" fill="#ffffff"/>`).join("")}</svg>\n`;
}

/** Width and height from a PNG's header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(bytes);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export const APP = path.resolve(RECON_ROOT, "..", "app");
export const OUTPUTS = {
  svg: path.join(APP, "app", "icon.svg"),
  apple: path.join(APP, "app", "apple-icon.png"),
  i192: path.join(APP, "public", "icons", "icon-192.png"),
  i512: path.join(APP, "public", "icons", "icon-512.png"),
} as const;

async function main(): Promise<void> {
  const { chromium } = await import("playwright");
  const logo = readFileSync(path.resolve(RECON_ROOT, "..", "docs", "recon", CAPTURE_DATE, "assets", "brand", "qwen-logo-dark.svg"), "utf8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route(/^https?:/, (route) => route.abort());
    await page.setContent(`<body style="margin:0">${logo}</body>`);
    const measured = await page.evaluate(() =>
      [...document.querySelectorAll("svg path")].map((p) => {
        const b = (p as SVGGraphicsElement).getBBox();
        return { d: p.getAttribute("d") ?? "", box: { x: b.x, y: b.y, width: b.width, height: b.height } };
      }),
    );
    const keep = markPaths(measured.map((m) => m.box));
    const svg = iconSvg(
      keep.map((i) => measured[i]?.d ?? ""),
      union(keep.map((i) => measured[i]?.box ?? { x: 0, y: 0, width: 0, height: 0 })),
    );
    mkdirSync(path.dirname(OUTPUTS.i192), { recursive: true });
    writeFileSync(OUTPUTS.svg, svg);
    for (const [file, size] of [[OUTPUTS.apple, 180], [OUTPUTS.i192, 192], [OUTPUTS.i512, 512]] as const) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<body style="margin:0;background:${PAGE_COLOUR}">${svg.replace("<svg ", `<svg width="${String(size)}" height="${String(size)}" `)}</body>`);
      writeFileSync(file, await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
    }
    console.log(`app-icons: kept ${String(keep.length)} of ${String(measured.length)} logo paths as the mark; wrote icon.svg, apple-icon.png, icons/icon-192.png, icons/icon-512.png`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith("app-icons.ts")) await main();
