/**
 * Machine names stay out of the code (STORY_034, CLAUDE.md §4a). Application code, tests and fixtures never name a machine
 * or a LAN address: the model server, the gate host and the app's own name are configuration (.env), so the same code
 * runs on the Spark, the Mac Studio 2022 or 2026, or anywhere the owner moves it next. Comments count too.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The folders that hold application code, tests and fixtures, relative to the repo root. */
export const SCANNED = ["app", "spark/model-server", "spark/model", "tools/stub-generation-server"] as const;

/** Generated or installed folders, skipped wherever they appear. */
const SKIPPED_DIRS = new Set([
  "node_modules", ".next", "coverage", "coverage-integration", "test-results", "playwright-report", "dist", "build", "out",
  "__pycache__", "measurements",
]);
const TEXT_EXT = /\.(?:[cm]?[jt]sx?|json|py|sh|ya?ml|css|html|md|txt|toml)$/;

const PATTERNS: readonly { readonly what: string; readonly re: RegExp }[] = [
  { what: "a Mac's name", re: /\bmac-studio-\d{4}\b/gi },
  { what: "the Spark's name", re: /\b(?:spark-1|dgx-spark)\b/gi },
  { what: "a .local host", re: /\b[a-z0-9][a-z0-9-]*\.local\b/gi },
  { what: "a LAN address", re: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g },
];

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly found: string;
  readonly what: string;
}

/** Every machine name or LAN address in one file's text. */
export function scanText(file: string, text: string): Violation[] {
  const out: Violation[] = [];
  text.split("\n").forEach((content, i) => {
    for (const { what, re } of PATTERNS) {
      for (const match of content.matchAll(re)) out.push({ file, line: i + 1, found: match[0], what });
    }
  });
  return out;
}

/** The text files under the scanned folders of `root`, as paths relative to it. */
export function scannedFiles(root: string, folders: readonly string[] = SCANNED): string[] {
  const files: string[] = [];
  const walk = (rel: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(path.join(root, rel));
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      const child = path.join(rel, name);
      const stat = statSync(path.join(root, child), { throwIfNoEntry: false });
      if (stat === undefined) continue;
      if (stat.isDirectory()) {
        if (!SKIPPED_DIRS.has(name)) walk(child);
      } else if (TEXT_EXT.test(name)) {
        files.push(child);
      }
    }
  };
  for (const folder of folders) walk(folder);
  return files;
}

/** Scans the repo at `root`; returns every violation. */
export function scanRepo(root: string): Violation[] {
  return scannedFiles(root).flatMap((file) => scanText(file, readFileSync(path.join(root, file), "utf8")));
}

/** The gate's message: each place, the rule, and the fix. */
export function report(violations: readonly Violation[]): string {
  return [
    `${String(violations.length)} machine name(s) or LAN address(es) in application code, tests or fixtures (${SCANNED.join(", ")}):`,
    ...violations.map((v) => `  ${v.file}:${String(v.line)}  ${v.found}  (${v.what})`),
    "Rule (STORY_034, CLAUDE.md §4a): no machine is named in the code, so the app runs unchanged wherever it is deployed.",
    "Fix: put the value in .env (documented in .env.example) and read it through the app's config; in prose, say it in words.",
  ].join("\n");
}
