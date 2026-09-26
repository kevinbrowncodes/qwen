/**
 * Lifts the reference's icon sprites into one standalone .svg per icon
 * (STORY_003). Clone code references icons by their sprite id, so names are
 * kept as the reference spells them; only the set prefix is stripped.
 */
import { parse, serialize } from "parse5";
import { type Element, elements, getAttr, isElement, type Node } from "./html-tree.ts";
import { sha256 } from "./harvest-model.ts";

export const ICON_SETS = {
  "qwpcicon-": "desktop",
  "appicon-": "app",
  "qwcoloricon-": "color",
  "qwenFileicon-": "file",
} as const;

export type IconSet = (typeof ICON_SETS)[keyof typeof ICON_SETS];

export type Icon = {
  id: string;
  set: IconSet;
  /** The id without its set prefix. */
  name: string;
  /** The file name inside the set's folder (a case-only collision gets a `__2` suffix). */
  file: string;
  viewBox: string;
  svg: string;
  hash: string;
};

export function setOf(id: string): { set: IconSet; name: string } | null {
  for (const [prefix, set] of Object.entries(ICON_SETS)) {
    if (id.startsWith(prefix) && id.length > prefix.length) return { set, name: id.slice(prefix.length) };
  }
  return null;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A symbol's markup as a standalone SVG document: its viewBox, the namespaces, its children unchanged. */
export function symbolToSvg(symbol: Element): string {
  const inner = serialize(symbol);
  const viewBox = getAttr(symbol, "viewbox") ?? getAttr(symbol, "viewBox") ?? "";
  const xlink = inner.includes("xlink:") ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : "";
  return `<svg xmlns="${SVG_NS}"${xlink} viewBox="${viewBox}">${inner}</svg>\n`;
}

/**
 * Markup reduced to what draws: no whitespace between tags, attributes sorted,
 * class / id / data-* dropped. Two icons that differ only in those hash the same.
 */
export function normalise(node: Node): string {
  if (node.nodeName === "#text" && "value" in node) return node.value.trim();
  if (!isElement(node)) return "";
  const attrs = node.attrs
    .filter((a) => a.name !== "class" && a.name !== "id" && !a.name.startsWith("data-"))
    .map((a) => `${a.name}="${a.value}"`)
    .sort()
    .join(" ");
  const kids = node.childNodes.map(normalise).join("");
  return `<${node.tagName}${attrs ? ` ${attrs}` : ""}>${kids}</${node.tagName}>`;
}

export function hashMarkup(node: Node): string {
  return sha256(normalise(node));
}

/** Parses an SVG fragment and hashes its first element, for tests and one-off markup. */
export function hashSvgText(markup: string): string {
  const doc = parse(`<body>${markup}</body>`);
  const first = elements(doc).find((el) => el.tagName === "svg");
  if (!first) throw new Error("no svg element in markup");
  return hashMarkup(first);
}

export class IconCountError extends Error {
  constructor(set: string, expected: number, actual: number) {
    super(`icons: the ${set} set has ${expected} symbols on the page but ${actual} were extracted`);
    this.name = "IconCountError";
  }
}

/** Every sprite symbol on the page, as standalone icons, in document order. */
export function extractIcons(html: string): Icon[] {
  const doc = parse(html);
  const symbols = elements(doc).filter((el) => el.tagName === "symbol");
  const icons: Icon[] = [];
  const takenLower = new Map<string, number>();
  const expected = new Map<IconSet, number>();
  for (const symbol of symbols) {
    const id = getAttr(symbol, "id") ?? "";
    const where = setOf(id);
    if (!where) continue;
    expected.set(where.set, (expected.get(where.set) ?? 0) + 1);
    const key = `${where.set}/${where.name.toLowerCase()}`;
    const n = (takenLower.get(key) ?? 0) + 1;
    takenLower.set(key, n);
    const file = `${where.name}${n > 1 ? `__${n}` : ""}.svg`;
    icons.push({
      id,
      set: where.set,
      name: where.name,
      file,
      viewBox: getAttr(symbol, "viewbox") ?? getAttr(symbol, "viewBox") ?? "",
      svg: symbolToSvg(symbol),
      hash: hashMarkup(symbol).slice(0, 16),
    });
  }
  for (const [set, count] of expected) {
    const actual = icons.filter((i) => i.set === set).length;
    if (actual !== count) throw new IconCountError(set, count, actual);
  }
  return icons;
}

export function countSymbols(html: string): Map<IconSet, number> {
  const counts = new Map<IconSet, number>();
  for (const el of elements(parse(html))) {
    if (el.tagName !== "symbol") continue;
    const where = setOf(getAttr(el, "id") ?? "");
    if (where) counts.set(where.set, (counts.get(where.set) ?? 0) + 1);
  }
  return counts;
}

export type InlineSvg = { file: string; svg: string; hash: string; uses: string[] };

/**
 * Inline SVGs outside the sprites. One that only draws sprite symbols through
 * use elements is recorded as usage of those symbols; any other is saved by hash.
 */
export function extractInlineSvgs(html: string): { saved: InlineSvg[]; spriteUses: string[] } {
  const doc = parse(html);
  const saved = new Map<string, InlineSvg>();
  const spriteUses: string[] = [];
  const svgs = elements(doc).filter((el) => el.tagName === "svg");
  const nested = new Set(svgs.flatMap((s) => elements(s).filter((e) => e.tagName === "svg")));
  for (const svg of svgs) {
    const kids = elements(svg);
    if (kids.some((k) => k.tagName === "symbol") || nested.has(svg)) continue;
    const uses = kids
      .filter((k) => k.tagName === "use")
      .map((k) => (getAttr(k, "xlink:href") ?? getAttr(k, "href") ?? "").replace(/^#/, ""))
      .filter((u) => u !== "");
    const drawing = kids.filter((k) => k.tagName !== "use");
    if (uses.length > 0 && drawing.length === 0) {
      spriteUses.push(...uses);
      continue;
    }
    const hash = hashMarkup(svg).slice(0, 16);
    if (!saved.has(hash)) {
      saved.set(hash, { file: `icon-${hash.slice(0, 8)}.svg`, svg: `${serializeOuterSvg(svg)}\n`, hash, uses });
    }
  }
  return { saved: [...saved.values()].sort((a, b) => a.file.localeCompare(b.file)), spriteUses };
}

function serializeOuterSvg(svg: Element): string {
  const attrs = svg.attrs.filter((a) => a.name !== "class" && !a.name.startsWith("data-")).map((a) => `${a.name}="${a.value.replaceAll('"', "&quot;")}"`);
  if (!attrs.some((a) => a.startsWith("xmlns="))) attrs.unshift(`xmlns="${SVG_NS}"`);
  return `<svg ${attrs.join(" ")}>${serialize(svg)}</svg>`;
}

const SPRITE_ID = /\b(?:qwpcicon|appicon|qwcoloricon|qwenFileicon)-[A-Za-z0-9_-]+/g;

/** Which states name each sprite id, from every string in the readings. Unknown ids are ignored. */
export function iconUsage(readings: Array<{ label: string; data: unknown }>, known: ReadonlySet<string>): Map<string, Set<string>> {
  const usage = new Map<string, Set<string>>();
  const visit = (v: unknown, label: string): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(SPRITE_ID)) {
        // Prose sometimes follows an id with punctuation or a word; trim back to the longest known id.
        let id = m[0];
        while (id.length > 0 && !known.has(id)) id = id.slice(0, -1);
        if (id === "") continue;
        const set = usage.get(id) ?? new Set<string>();
        set.add(label);
        usage.set(id, set);
      }
    } else if (Array.isArray(v)) v.forEach((x) => visit(x, label));
    else if (typeof v === "object" && v !== null) Object.values(v).forEach((x) => visit(x, label));
  };
  for (const r of readings) visit(r.data, r.label);
  return usage;
}

/** Groups of icons whose normalised markup is identical, across or within sets. */
export function duplicateGroups(icons: Icon[]): Icon[][] {
  const byHash = new Map<string, Icon[]>();
  for (const i of icons) byHash.set(i.hash, [...(byHash.get(i.hash) ?? []), i]);
  return [...byHash.values()].filter((g) => g.length > 1).sort((a, b) => (a[0]?.id ?? "").localeCompare(b[0]?.id ?? ""));
}

export function renderIconIndex(icons: Icon[], inline: InlineSvg[], usage: Map<string, Set<string>>, date: string): string {
  const dupes = duplicateGroups(icons);
  const dupeOf = new Map<string, string>();
  for (const g of dupes) for (const i of g) dupeOf.set(i.id, g.filter((x) => x !== i).map((x) => x.id).join(", "));
  const lines = [
    `# Icons harvested ${date}`,
    "",
    "Generated by `recon/run.sh harvest`; do not edit by hand. Each file is one symbol of the reference's inline sprites, named by its id without the set prefix.",
    "",
    "| Set | Folder | Icons |",
    "| --- | --- | --- |",
  ];
  for (const [prefix, set] of Object.entries(ICON_SETS)) lines.push(`| \`${prefix}\` | \`${set}/\` | ${icons.filter((i) => i.set === set).length} |`);
  lines.push("", `Seen in a captured state: ${icons.filter((i) => usage.has(i.id)).length} icons. Identical markup: ${dupes.length} groups.`, "");
  for (const [, set] of Object.entries(ICON_SETS)) {
    lines.push(`## ${set}`, "", "| Id | File | viewBox | Hash | Seen in | Same markup as |", "| --- | --- | --- | --- | --- | --- |");
    for (const i of icons.filter((x) => x.set === set)) {
      const seen = [...(usage.get(i.id) ?? [])].sort().join(", ");
      lines.push(`| ${i.id} | ${set}/${i.file} | ${i.viewBox} | ${i.hash.slice(0, 8)} | ${seen} | ${dupeOf.get(i.id) ?? ""} |`);
    }
    lines.push("");
  }
  lines.push("## Inline SVGs outside the sprites", "");
  if (inline.length === 0) lines.push("None beyond references to sprite symbols.", "");
  else {
    lines.push("| File | Hash |", "| --- | --- |");
    for (const s of inline) lines.push(`| inline/${s.file} | ${s.hash.slice(0, 8)} |`);
    lines.push("");
  }
  return lines.join("\n");
}
