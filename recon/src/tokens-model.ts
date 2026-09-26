/**
 * Design tokens from the harvest (STORY_003): custom properties, font faces
 * and breakpoints parsed from the reference's stylesheets, and the palette,
 * type scale, spacing, radii, shadows and motion collected from the
 * computed styles in the per-state readings (STORY_002).
 */
import postcss from "postcss";

export type Theme = "base" | "dark" | "light";
export type CustomProperty = { name: string; value: string; theme: Theme; selector: string; file: string };

const THEME_SELECTOR = /^(?::root|html)(?:\.(dark|light))?$|^\.(dark|light)$/;

function themeOf(selector: string): Theme | null {
  const m = THEME_SELECTOR.exec(selector.trim());
  if (!m) return null;
  const t = m[1] ?? m[2];
  return t === "dark" || t === "light" ? t : "base";
}

/** Custom properties on :root / html, with html.dark and html.light kept apart. Other selectors are ignored. */
export function customProperties(css: string, file: string): CustomProperty[] {
  const out: CustomProperty[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type === "atrule") return;
    for (const selector of rule.selectors) {
      const theme = themeOf(selector);
      if (theme === null) continue;
      rule.each((node) => {
        if (node.type === "decl" && node.prop.startsWith("--")) out.push({ name: node.prop, value: node.value.trim(), theme, selector: selector.trim(), file });
      });
    }
  });
  return out;
}

/** First definition wins per name and theme, as the cascade reads files in load order. */
export function mergeCustomProperties(lists: CustomProperty[][]): CustomProperty[] {
  const seen = new Map<string, CustomProperty>();
  for (const list of lists) for (const p of list) if (!seen.has(`${p.theme} ${p.name}`)) seen.set(`${p.theme} ${p.name}`, p);
  return [...seen.values()].sort((a, b) => a.theme.localeCompare(b.theme) || a.name.localeCompare(b.name));
}

export type FontFace = { family: string; weight: string; style: string; sources: string[]; file: string; inScope: boolean };

export function fontFaces(css: string, file: string): FontFace[] {
  const out: FontFace[] = [];
  postcss.parse(css).walkAtRules("font-face", (rule) => {
    const get = (prop: string): string => {
      let v = "";
      rule.walkDecls(prop, (d) => {
        v = d.value;
      });
      return v;
    };
    const family = get("font-family").replace(/^['"]|['"]$/g, "");
    const sources = [...get("src").matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1] ?? "").filter((s) => s !== "");
    out.push({ family, weight: get("font-weight") || "normal", style: get("font-style") || "normal", sources, file, inScope: !family.startsWith("KaTeX") });
  });
  return out;
}

export type Breakpoint = { px: number; queries: string[]; files: string[] };

function toPx(value: string, unit: string): number {
  const n = Number(value);
  return unit === "rem" || unit === "em" ? n * 16 : n;
}

/** Widths named by min/max-width and range-syntax media queries, de-duplicated and ascending. */
export function breakpoints(sheets: Array<{ css: string; file: string }>): Breakpoint[] {
  const byPx = new Map<number, { queries: Set<string>; files: Set<string> }>();
  const add = (px: number, query: string, file: string): void => {
    const entry = byPx.get(px) ?? { queries: new Set(), files: new Set() };
    entry.queries.add(query);
    entry.files.add(file);
    byPx.set(px, entry);
  };
  for (const { css, file } of sheets) {
    postcss.parse(css).walkAtRules("media", (rule) => {
      const q = rule.params.replace(/\s+/g, " ").trim();
      for (const m of q.matchAll(/(?:min|max)-width\s*:\s*([\d.]+)(px|rem|em)/g)) add(toPx(m[1] ?? "0", m[2] ?? "px"), q, file);
      for (const m of q.matchAll(/width\s*(?:<=|>=|<|>)\s*([\d.]+)(px|rem|em)/g)) add(toPx(m[1] ?? "0", m[2] ?? "px"), q, file);
      for (const m of q.matchAll(/([\d.]+)(px|rem|em)\s*(?:<=|>=|<|>)\s*width/g)) add(toPx(m[1] ?? "0", m[2] ?? "px"), q, file);
    });
  }
  return [...byPx.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([px, e]) => ({ px, queries: [...e.queries].sort(), files: [...e.files].sort() }));
}

// ---- values collected from the readings ----

export type Seen = { value: string; seenIn: string[] };

/** Canonical colour: #rrggbb when opaque, rgba(r, g, b, a) otherwise; null for transparent or unparsable. */
export function canonicalColour(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent" || s === "none" || s === "") return null;
  let r: number, g: number, b: number, a = 1;
  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (hex?.[1]) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100;
  } else if (rgb) {
    r = Number(rgb[1]);
    g = Number(rgb[2]);
    b = Number(rgb[3]);
    const al = rgb[4];
    if (al !== undefined) a = al.endsWith("%") ? Number(al.slice(0, -1)) / 100 : Number(al);
  } else return null;
  if (a === 0) return null;
  const to2 = (n: number): string => Math.round(n).toString(16).padStart(2, "0");
  return a >= 1 ? `#${to2(r)}${to2(g)}${to2(b)}` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

const COLOUR_IN_TEXT = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;

export type StyleSample = { where: string; style: Record<string, unknown> };

type Component = { name?: unknown; style?: unknown; children?: unknown };

/** Every component style in a reading, labelled `<state>@<width> <component>`. */
export function styleSamples(reading: { state: string; viewport: { width: number }; components: unknown[] }): StyleSample[] {
  const out: StyleSample[] = [];
  const visit = (c: unknown): void => {
    if (typeof c !== "object" || c === null) return;
    const comp = c as Component;
    if (typeof comp.style === "object" && comp.style !== null && !Array.isArray(comp.style)) {
      const name = typeof comp.name === "string" ? comp.name : "(unnamed)";
      out.push({ where: `${reading.state}@${reading.viewport.width} ${name}`, style: comp.style as Record<string, unknown> });
    }
    if (Array.isArray(comp.children)) comp.children.forEach(visit);
  };
  reading.components.forEach(visit);
  return out;
}

function collect(samples: StyleSample[], pick: (style: Record<string, unknown>) => string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of samples) {
    for (const v of pick(s.style)) {
      const set = out.get(v) ?? new Set<string>();
      set.add(s.where);
      out.set(v, set);
    }
  }
  return out;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function seenList(m: Map<string, Set<string>>, order: (a: string, b: string) => number): Seen[] {
  return [...m.entries()].sort((a, b) => order(a[0], b[0])).map(([value, s]) => ({ value, seenIn: [...s].sort() }));
}

const num = (s: string): number => {
  const n = parseFloat(s);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
};

export function palette(samples: StyleSample[]): Seen[] {
  const m = collect(samples, (st) =>
    ["color", "background", "background_color", "border", "border_color"].flatMap((k) =>
      (str(st[k]).match(COLOUR_IN_TEXT) ?? []).map(canonicalColour).filter((c): c is string => c !== null),
    ),
  );
  return seenList(m, (a, b) => a.localeCompare(b));
}

export type TypeStep = { size: string; px: number; weights: string[]; lineHeights: string[]; families: string[]; seenIn: string[] };

export function typeScale(samples: StyleSample[]): TypeStep[] {
  const steps = new Map<string, { w: Set<string>; lh: Set<string>; f: Set<string>; seen: Set<string> }>();
  for (const s of samples) {
    const size = str(s.style.font_size);
    if (!/^[\d.]+px$/.test(size)) continue;
    const step = steps.get(size) ?? { w: new Set(), lh: new Set(), f: new Set(), seen: new Set() };
    const w = str(s.style.font_weight);
    const lh = str(s.style.line_height);
    const f = str(s.style.font_family);
    if (w) step.w.add(w);
    if (lh) step.lh.add(lh);
    if (f && f !== "inherit") step.f.add(f);
    step.seen.add(s.where);
    steps.set(size, step);
  }
  return [...steps.entries()]
    .map(([size, st]) => ({ size, px: num(size), weights: [...st.w].sort(), lineHeights: [...st.lh].sort(), families: [...st.f].sort(), seenIn: [...st.seen].sort() }))
    .sort((a, b) => a.px - b.px);
}

/** Distinct non-zero px lengths used as padding or gap, ascending. */
export function spacingScale(samples: StyleSample[]): Seen[] {
  const m = collect(samples, (st) =>
    ["padding", "gap", "margin"].flatMap((k) => (str(st[k]).match(/[\d.]+px/g) ?? []).filter((v) => parseFloat(v) !== 0)),
  );
  return seenList(m, (a, b) => num(a) - num(b));
}

export function radii(samples: StyleSample[]): Seen[] {
  const m = collect(samples, (st) => {
    const v = str(st.border_radius);
    return v && v !== "0px" && v !== "0" ? [v] : [];
  });
  return seenList(m, (a, b) => num(a) - num(b) || a.localeCompare(b));
}

export function shadows(samples: StyleSample[]): Seen[] {
  const m = collect(samples, (st) => {
    const v = str(st.box_shadow);
    return v && v !== "none" ? [v] : [];
  });
  return seenList(m, (a, b) => a.localeCompare(b));
}

export function motion(samples: StyleSample[]): Seen[] {
  const m = collect(samples, (st) => {
    const v = str(st.transition);
    return v && v !== "none" && !/^all 0s ease 0s$/.test(v) ? [v] : [];
  });
  return seenList(m, (a, b) => a.localeCompare(b));
}

export function fontStacks(samples: StyleSample[]): Seen[] {
  const m = collect(samples, (st) => {
    const v = str(st.font_family);
    return v && v !== "inherit" ? [v] : [];
  });
  return seenList(m, (a, b) => a.localeCompare(b));
}

export type Tokens = {
  date: string;
  fontStacks: Seen[];
  fontFaces: FontFace[];
  palette: Seen[];
  typeScale: TypeStep[];
  spacing: Seen[];
  radii: Seen[];
  shadows: Seen[];
  motion: Seen[];
  breakpoints: Breakpoint[];
  customProperties: CustomProperty[];
  layoutDifferences: string[];
};

/** What the 1437 and 393 readings show changing between the widths (capture notes, Phase 7). */
export const LAYOUT_DIFFERENCES = [
  "The sidebar becomes a slide-in drawer: fixed, 0 wide closed and 335 px open, opened by a menu icon at the header's top left.",
  "The \"How can I help you?\" heading and the example-prompt cards disappear; the home is blank.",
  "The composer is pinned to the bottom (359 px wide, radius 24 px) and loses the Auto selector.",
  "The header is 58 px: menu, model name, and the temporary-chat icon.",
  "The icon sprite switches from qwpcicon- to appicon-, and many sizes scale by 1.048 (16 px becomes 16.768 px), which suggests a rem-based scale on mobile.",
  "Touch has no image hover overlays: one action row sits under the image, and My Library's Download bar is always visible.",
];

const list = (seen: string[], max = 4): string => (seen.length <= max ? seen.join("; ") : `${seen.slice(0, max).join("; ")}; +${seen.length - max} more`);

export function renderTokensMd(t: Tokens): string {
  const L: string[] = [
    `# Design tokens, ${t.date}`,
    "",
    "Generated by `recon/run.sh harvest`; do not edit by hand. Values come from the computed styles in `states/` (settled readings) and from the harvested stylesheets. The capture is in dark mode (`<html class=\"dark\">`).",
    "",
    "## Fonts",
    "",
  ];
  for (const f of t.fontStacks) L.push(`- \`${f.value}\`, seen in ${f.seenIn.length} components`);
  const inScope = t.fontFaces.filter((f) => f.inScope);
  L.push(
    "",
    "**No font file is harvested.** The flow's text resolves through the system stack above (system-ui first, then Inter and NotoSansHans by name). None of these is loaded as a web font, so there is no file to lift; the clone uses the same stack.",
    `The stylesheets declare ${t.fontFaces.length} \`@font-face\` rules${t.fontFaces.length > 0 ? `, for ${[...new Set(t.fontFaces.map((f) => f.family))].join(", ")}` : ""}. ${inScope.length === 0 ? "All are KaTeX math fonts, which the image generation flow never shows, so they are out of scope." : `${inScope.length} are not KaTeX and need review.`}`,
    "",
    "## Palette",
    "",
    "| Colour | Seen in |",
    "| --- | --- |",
  );
  for (const c of t.palette) L.push(`| \`${c.value}\` | ${list(c.seenIn)} |`);
  L.push("", "## Type scale", "", "| Size | Weights | Line heights | Seen in |", "| --- | --- | --- | --- |");
  for (const s of t.typeScale) L.push(`| ${s.size} | ${s.weights.join(", ")} | ${s.lineHeights.join(", ")} | ${list(s.seenIn)} |`);
  for (const [title, items] of [
    ["Spacing (padding, gap)", t.spacing],
    ["Radii", t.radii],
    ["Shadows", t.shadows],
    ["Motion (transitions)", t.motion],
  ] as const) {
    L.push("", `## ${title}`, "", "| Value | Seen in |", "| --- | --- |");
    for (const v of items) L.push(`| \`${v.value}\` | ${list(v.seenIn)} |`);
  }
  L.push("", "## Breakpoints", "", "From the media queries in the harvested stylesheets. Which query produces each layout change below is inferred, not measured: there is no live session to resize.", "", "| Width | Queries | Files |", "| --- | --- | --- |");
  for (const b of t.breakpoints) L.push(`| ${b.px}px | ${list(b.queries.map((q) => `\`${q}\``), 3)} | ${b.files.join(", ")} |`);
  L.push("", "### What changes between 1437 and 393", "", ...t.layoutDifferences.map((d) => `- ${d}`));
  const byTheme = (th: Theme): CustomProperty[] => t.customProperties.filter((p) => p.theme === th);
  L.push("", "## Custom properties", "", `${t.customProperties.length} in all: ${byTheme("base").length} on :root or html, ${byTheme("dark").length} under html.dark, ${byTheme("light").length} under html.light. The full list with values is in \`tokens.json\`. The dark ones the capture renders with:`, "", "| Property | Value |", "| --- | --- |");
  for (const p of byTheme("dark").slice(0, 400)) L.push(`| \`${p.name}\` | \`${p.value}\` |`);
  L.push("");
  return L.join("\n");
}
