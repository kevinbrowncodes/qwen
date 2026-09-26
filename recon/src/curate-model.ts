/**
 * The pure half of `recon/run.sh curate` (STORY_002): checking the per-state
 * readings the owner's browser produced, stripping what must not be
 * committed from them, and describing what the capture covers.
 */

/** Partial boxes occur: a size read without a position, or a position without a size. */
export type Box = { x?: number; y?: number; width?: number; height?: number };

export type Component = {
  /** Required on top-level components; a nested one may carry only its text. */
  name?: string;
  /** Absent, null or a note ("not measured") when the element was hidden or is a group. */
  box?: Box | string | null;
  selector?: string;
  style?: Record<string, unknown>;
  children?: Component[];
  [key: string]: unknown;
};

export type Reading = {
  state: string;
  url_path: string;
  viewport: { width: number; height: number };
  components: Component[];
  [key: string]: unknown;
};

export class ReadingError extends Error {
  constructor(file: string, field: string, problem: string) {
    super(`${file}: ${field} ${problem}`);
    this.name = "ReadingError";
  }
}

const STATE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const READING_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)\.json$/;

/** Splits `<state>@<width>.json`; returns null for any other name. */
export function parseReadingFileName(fileName: string): { state: string; width: number } | null {
  const m = READING_FILE.exec(fileName);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { state: m[1], width: Number(m[2]) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkBox(file: string, where: string, v: unknown): void {
  // Hover overlays, groups and tabs read only by their text have no box (25 of them on 2026-09-26).
  if (v === undefined || v === null || typeof v === "string") return;
  if (!isRecord(v)) throw new ReadingError(file, `${where}.box`, "is not a box, a note or null");
  // Partial boxes occur: a size read without a position, or a position without a size (3 on 2026-09-26).
  const keys = ["x", "y", "width", "height"].filter((k) => v[k] !== undefined);
  if (keys.length === 0) throw new ReadingError(file, `${where}.box`, "has none of x, y, width, height");
  for (const k of keys) {
    if (typeof v[k] !== "number") throw new ReadingError(file, `${where}.box.${k}`, "is not a number");
  }
}

function checkComponent(file: string, where: string, v: unknown, topLevel: boolean): void {
  if (!isRecord(v)) throw new ReadingError(file, where, "is not an object");
  const named = typeof v.name === "string" && v.name !== "";
  if (topLevel && !named) throw new ReadingError(file, `${where}.name`, "is missing");
  if (!named && typeof v.text !== "string" && typeof v.aria_label !== "string") {
    throw new ReadingError(file, where, "has no name, text or aria_label to say what it is");
  }
  checkBox(file, where, v.box);
  if (v.selector !== undefined && v.selector !== null && typeof v.selector !== "string") {
    throw new ReadingError(file, `${where}.selector`, "is not a string");
  }
  if (v.style !== undefined && v.style !== null && !isRecord(v.style)) throw new ReadingError(file, `${where}.style`, "is not an object");
  if (v.children !== undefined && v.children !== null) {
    if (!Array.isArray(v.children)) throw new ReadingError(file, `${where}.children`, "is not a list");
    v.children.forEach((c, i) => checkComponent(file, `${where}.children[${i}]`, c, false));
  }
}

/** Checks a parsed reading against the schema STORY_002 names; throws ReadingError naming the field. */
export function validateReading(file: string, v: unknown): Reading {
  const named = parseReadingFileName(file);
  if (!named) throw new ReadingError(file, "file name", "is not <state>@<width>.json with the state in [a-z0-9-]");
  if (!isRecord(v)) throw new ReadingError(file, "reading", "is not an object");
  if (typeof v.state !== "string" || !STATE_NAME.test(v.state)) throw new ReadingError(file, "state", "is missing or not in [a-z0-9-]");
  if (v.state !== named.state) throw new ReadingError(file, "state", `does not match the file name (${named.state})`);
  if (typeof v.url_path !== "string") throw new ReadingError(file, "url_path", "is missing");
  if (!isRecord(v.viewport) || typeof v.viewport.width !== "number" || typeof v.viewport.height !== "number") {
    throw new ReadingError(file, "viewport", "is missing its width or height");
  }
  if (v.viewport.width !== named.width) throw new ReadingError(file, "viewport.width", `does not match the file name (${named.width})`);
  if (!Array.isArray(v.components)) throw new ReadingError(file, "components", "is missing");
  v.components.forEach((c, i) => checkComponent(file, `components[${i}]`, c, true));
  // Checked field by field above; the index signature carries the rest through untouched.
  return v as Reading;
}

const URL_IN_TEXT = /(?:https?:)?\/\/[^\s"'<>)\]]+/g;

/** Removes the query string and hash from one URL, leaving everything else as written. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut >= 0 ? url.slice(0, cut) : url;
}

/** Strips query strings and hashes from every URL inside any string of a JSON value. */
export function stripQueriesDeep<T>(value: T): T {
  return mapStrings(value, (s) => s.replace(URL_IN_TEXT, stripQuery));
}

function mapStrings<T>(value: T, f: (s: string) => string): T {
  if (typeof value === "string") return f(value) as T;
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f)) as T;
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, f);
    return out as T;
  }
  return value;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Replaces ids in a URL path with `:id` and drops any query; `/c/<uuid>` → `/c/:id`. */
export function placeholderPath(path: string): string {
  return stripQuery(path)
    .replace(UUID, ":id")
    .split("/")
    .map((seg) => (/^\d{6,}$/.test(seg) || /^[0-9a-f]{16,}$/i.test(seg) ? ":id" : seg))
    .join("/");
}

export type ManifestEntry = {
  state: string;
  width: number;
  viewport: { width: number; height: number };
  source: "extension-reading" | "owner-save-page";
  file: string;
  url_path: string;
  captured: string;
  note?: string;
};

export const DESKTOP_ZOOM_NOTE = "The owner's browser was at 125% zoom; values are CSS px, so the layout is the one a 1437-px-wide CSS viewport gets.";

export function manifestEntry(reading: Reading, file: string, source: ManifestEntry["source"], captured: string): ManifestEntry {
  const entry: ManifestEntry = {
    state: reading.state,
    width: reading.viewport.width,
    viewport: { width: reading.viewport.width, height: reading.viewport.height },
    source,
    file,
    url_path: placeholderPath(reading.url_path),
    captured,
  };
  if (reading.viewport.width >= 1000) entry.note = DESKTOP_ZOOM_NOTE;
  return entry;
}

/** Stable order: by width descending (desktop first), then by state, then by file. */
export function sortManifest(entries: ManifestEntry[]): ManifestEntry[] {
  return [...entries].sort((a, b) => b.width - a.width || a.state.localeCompare(b.state) || a.file.localeCompare(b.file));
}

export const WIDTHS = [1437, 393] as const;

export type ExpectedState = {
  state: string;
  /** Why it was not captured, per width, taken from the capture notes. Absent when it was. */
  notCaptured?: Partial<Record<(typeof WIDTHS)[number], string>>;
  /** Another state's file that shows this one (for example, download on the done image's hover). */
  shownIn?: Partial<Record<(typeof WIDTHS)[number], string>>;
};

const NARROW_PARTIAL = "narrow pass was partial: the extension's clicks break the phone emulation, so only states reachable by loading an address were read (notes, Phase 7)";

/** EPIC_001's scope as a state list. Reasons are quoted from recon/out/2026-09-26/extension/notes*.md. */
export const EXPECTED_STATES: ExpectedState[] = [
  { state: "home-signed-in" },
  { state: "mode-menu-open", notCaptured: { 393: NARROW_PARTIAL } },
  { state: "composer-image-mode", notCaptured: { 393: NARROW_PARTIAL } },
  { state: "image-model-open", notCaptured: { 393: NARROW_PARTIAL } },
  { state: "aspect-ratio-open", notCaptured: { 393: `${NARROW_PARTIAL}; whether it is a dropdown or a bottom sheet is unknown` } },
  { state: "composer-typed", notCaptured: { 393: NARROW_PARTIAL } },
  { state: "composer-reference-attached", notCaptured: { 393: NARROW_PARTIAL } },
  { state: "upload-progress", notCaptured: { 1437: "not visible at read time: the reference image was already uploaded", 393: NARROW_PARTIAL } },
  { state: "job-submitted", notCaptured: { 393: NARROW_PARTIAL } },
  { state: "job-generating", notCaptured: { 393: NARROW_PARTIAL } },
  { state: "job-done" },
  { state: "edit-generating", notCaptured: { 1437: "not read: the edit was sent before the extension was watching", 393: NARROW_PARTIAL } },
  { state: "edit-done", notCaptured: { 393: NARROW_PARTIAL } },
  {
    state: "result-download",
    shownIn: { 1437: "job-done@1437.json" },
    notCaptured: { 393: "no Download control is visible on touch; probably under More actions or a full-screen preview (unconfirmed)" },
  },
  {
    state: "job-cancelled",
    notCaptured: {
      1437: "the reference has no UI cancel for image jobs: Stop stayed disabled for the whole text-to-image run",
      393: "the reference has no UI cancel for image jobs",
    },
  },
  { state: "job-failed", notCaptured: { 1437: "no run failed", 393: "no run failed" } },
  { state: "job-moderated", notCaptured: { 1437: "no prompt was moderated", 393: "no prompt was moderated" } },
  { state: "quota-wall", notCaptured: { 1437: "no limit or quota message appeared", 393: "no limit or quota message appeared" } },
  {
    state: "history-empty",
    notCaptured: {
      1437: "My Library appears only once an image exists, so the empty state is the sidebar without it (home-signed-in@1437.json before the first generation)",
      393: NARROW_PARTIAL,
    },
  },
  { state: "my-library" },
];

/** Facts the capture could not establish, independent of any one state. */
export const FACTS_NOT_CAPTURED = [
  "the full-resolution size of a result: the page only shows a CDN-resized copy",
  "the generation, upload and status endpoints: they ran before the extension read the timing records",
  "Qwen-Image 3.0's behaviour, the Expand more models list, and My Published",
];

export type CoverageRow = { state: string; width: number; status: "captured" | "shown-in" | "not-captured"; detail: string };

export function coverage(expected: ExpectedState[], captured: ReadonlySet<string>): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const width of WIDTHS) {
    for (const e of expected) {
      const file = `${e.state}@${width}.json`;
      if (captured.has(file)) rows.push({ state: e.state, width, status: "captured", detail: `states/${file}` });
      else if (e.shownIn?.[width] !== undefined) rows.push({ state: e.state, width, status: "shown-in", detail: `states/${e.shownIn[width]}` });
      else rows.push({ state: e.state, width, status: "not-captured", detail: e.notCaptured?.[width] ?? "no reason recorded" });
    }
  }
  return rows;
}

export function renderCoverage(rows: CoverageRow[], date: string): string {
  const lines = [
    `# What the ${date} capture covers`,
    "",
    "Generated by `recon/run.sh curate`; do not edit by hand. Every state not captured is designed in EPIC_003 from an ASCII sketch.",
    "",
  ];
  for (const width of WIDTHS) {
    lines.push(`## At ${width} px`, "", "| State | Status | File or reason |", "| --- | --- | --- |");
    for (const r of rows.filter((x) => x.width === width)) {
      const status = r.status === "captured" ? "captured" : r.status === "shown-in" ? "shown in another state" : "**not captured**";
      lines.push(`| ${r.state} | ${status} | ${r.detail} |`);
    }
    lines.push("");
  }
  lines.push("## Facts the capture could not establish", "", ...FACTS_NOT_CAPTURED.map((f) => `- ${f}`), "");
  return lines.join("\n");
}
