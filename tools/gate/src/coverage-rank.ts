/**
 * `node tools/gate/src/coverage-rank.ts <coverage-summary.json> [n]` (STORY_008): when a lane with a coverage floor
 * fails, rank files by uncovered branches first (CLAUDE.md §4: measure before padding tests). Prints one line per file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface Ranked {
  readonly file: string;
  readonly uncovered: number;
  readonly total: number;
  readonly pct: number;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Ranks the files of a v8/istanbul json-summary by uncovered branches, most first, ignoring the total. */
export function rank(summary: unknown, root = ""): Ranked[] {
  if (typeof summary !== "object" || summary === null) return [];
  const out: Ranked[] = [];
  for (const [file, entry] of Object.entries(summary)) {
    if (file === "total" || typeof entry !== "object" || entry === null || !("branches" in entry)) continue;
    const b: unknown = entry.branches;
    if (typeof b !== "object" || b === null) continue;
    const total = "total" in b ? num(b.total) : 0;
    const covered = "covered" in b ? num(b.covered) : 0;
    const pct = "pct" in b ? num(b.pct) : 100;
    if (total - covered <= 0) continue;
    out.push({ file: root !== "" && file.startsWith(root) ? path.relative(root, file) : file, uncovered: total - covered, total, pct });
  }
  return out.sort((a, b) => b.uncovered - a.uncovered || a.file.localeCompare(b.file));
}

export function format(r: Ranked): string {
  return `${String(r.uncovered).padStart(4)} uncovered of ${String(r.total).padStart(4)} branches (${r.pct.toFixed(1)}%)  ${r.file}`;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [file, n] = process.argv.slice(2);
  if (file === undefined) {
    console.error("usage: node tools/gate/src/coverage-rank.ts <coverage-summary.json> [n]");
    process.exit(2);
  }
  const summary: unknown = JSON.parse(readFileSync(file, "utf8"));
  for (const r of rank(summary, process.cwd()).slice(0, Number(n ?? "8"))) console.log(format(r));
}
