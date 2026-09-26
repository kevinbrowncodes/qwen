/**
 * recon/run.sh curate <date>  (STORY_002)
 *
 * Files the capture the owner made in their own browser, from
 * recon/out/<date>/ into docs/recon/<date>/. Offline: it makes no network
 * request. Everything is built in memory and checked by the identity guard
 * before a single file is written, so a leak writes nothing at all.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { coverage, EXPECTED_STATES, manifestEntry, type ManifestEntry, parseReadingFileName, renderCoverage, sortManifest, stripQueriesDeep, validateReading } from "./curate-model.ts";
import { assertNoIdentity } from "./identity-guard.ts";
import { cleanSnapshot, DEFAULT_SNAPSHOT_OPTIONS } from "./snapshot.ts";
import { OUT_DIR, RECON_ROOT } from "./config.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function recordsDir(date: string): string {
  return path.resolve(RECON_ROOT, "..", "docs", "recon", date);
}

function main(argv: string[]): number {
  const date = argv[0];
  if (date === undefined || !DATE.test(date)) {
    console.error("usage: recon/run.sh curate YYYY-MM-DD");
    return 2;
  }
  const inDir = path.join(OUT_DIR, date);
  const extDir = path.join(inDir, "extension");
  const outDir = recordsDir(date);

  const outputs = new Map<string, string>();
  const manifest: ManifestEntry[] = [];
  const captured = new Set<string>();

  for (const name of readdirSync(extDir).sort()) {
    if (!parseReadingFileName(name)) continue;
    const raw: unknown = JSON.parse(readFileSync(path.join(extDir, name), "utf8"));
    const reading = stripQueriesDeep(validateReading(name, raw));
    outputs.set(`states/${name}`, `${JSON.stringify(reading, null, 2)}\n`);
    manifest.push(manifestEntry(reading, `states/${name}`, "extension-reading", date));
    captured.add(name);
  }

  const savedCss = new Set(readdirSync(path.join(inDir, "assets", "css")).filter((f) => f.endsWith(".css")));
  const snapshot = cleanSnapshot(readFileSync(path.join(inDir, "Qwen.html"), "utf8"), { ...DEFAULT_SNAPSHOT_OPTIONS, availableCss: savedCss });
  const snapshotFile = "snapshots/home-signed-in@1437.html";
  outputs.set(snapshotFile, snapshot.html);
  const home = manifest.find((m) => m.state === "home-signed-in" && m.width === 1437);
  manifest.push({
    state: "home-signed-in",
    width: 1437,
    viewport: home?.viewport ?? { width: 1437, height: 1031 },
    source: "owner-save-page",
    file: snapshotFile,
    url_path: "/",
    captured: date,
    note: "Chrome 'Save Page As, complete' of the signed-in home; scripts removed, identity masked, stylesheets relinked to ../assets/css/.",
  });

  const notes = ["notes.md", "notes-extension-summary.md"].map((f) => readFileSync(path.join(extDir, f), "utf8").trimEnd());
  outputs.set(
    "capture-notes.md",
    [
      `# Capture notes, ${date}`,
      "",
      "Copied verbatim from the owner's capture by `recon/run.sh curate`; do not edit by hand.",
      "",
      "## notes.md",
      "",
      notes[0],
      "",
      "## notes-extension-summary.md",
      "",
      notes[1],
      "",
    ].join("\n"),
  );
  outputs.set("manifest.json", `${JSON.stringify(sortManifest(manifest), null, 2)}\n`);
  outputs.set("coverage.md", renderCoverage(coverage(EXPECTED_STATES, captured), date));

  assertNoIdentity(outputs, snapshot.identity);
  console.log("identity guard: clean");

  for (const sub of ["states", "snapshots"]) rmSync(path.join(outDir, sub), { recursive: true, force: true });
  for (const [rel, content] of outputs) {
    const file = path.join(outDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  console.log(`curate: wrote ${outputs.size} files to docs/recon/${date}/ (${captured.size} readings, 1 snapshot; ${snapshot.removedScripts} scripts removed)`);
  if (snapshot.deadLinks.length > 0) {
    console.log(`curate: ${snapshot.deadLinks.length} local references in the snapshot point at files that were not harvested:`);
    for (const link of [...new Set(snapshot.deadLinks)]) console.log(`  ${link}`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
