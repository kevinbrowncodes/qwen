/**
 * recon/run.sh interactions <date>  (STORY_004)
 *
 * Writes endpoints.json / endpoints.md from the capture's API path list and
 * inventory.md from the committed readings, then runs the identity guard
 * over them and over the hand-written interactions.md. Offline.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "parse5";
import { OUT_DIR, RECON_ROOT } from "./config.ts";
import { parseReadingFileName, type Reading, validateReading } from "./curate-model.ts";
import { endpoints, endpointsJson, parseEndpointSource, renderEndpoints } from "./endpoints-model.ts";
import { assertNoIdentity } from "./identity-guard.ts";
import { iconFilesFromIndex, renderInventory } from "./inventory-model.ts";
import { readIdentity } from "./snapshot.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function main(argv: string[]): number {
  const date = argv[0];
  if (date === undefined || !DATE.test(date)) {
    console.error("usage: recon/run.sh interactions YYYY-MM-DD");
    return 2;
  }
  const inDir = path.join(OUT_DIR, date);
  const outDir = path.resolve(RECON_ROOT, "..", "docs", "recon", date);

  const src = parseEndpointSource(JSON.parse(readFileSync(path.join(inDir, "extension", "network-endpoints.json"), "utf8")));
  const list = endpoints(src);

  const readings: Reading[] = [];
  for (const name of readdirSync(path.join(outDir, "states")).sort()) {
    if (parseReadingFileName(name)) readings.push(validateReading(name, JSON.parse(readFileSync(path.join(outDir, "states", name), "utf8"))));
  }
  const icons = iconFilesFromIndex(JSON.parse(readFileSync(path.join(outDir, "assets", "index.json"), "utf8")));

  const outputs = new Map<string, string>([
    ["endpoints.json", endpointsJson(src, list, date)],
    ["endpoints.md", renderEndpoints(src, list, date)],
    ["inventory.md", renderInventory(readings, icons, date)],
  ]);
  const guarded = new Map(outputs);
  const handWritten = path.join(outDir, "interactions.md");
  if (existsSync(handWritten)) guarded.set("interactions.md", readFileSync(handWritten, "utf8"));
  else console.log("interactions: interactions.md is not written yet (it is hand-written; STORY_004)");

  assertNoIdentity(guarded, readIdentity(parse(readFileSync(path.join(inDir, "Qwen.html"), "utf8"))));
  console.log(`identity guard: clean (${guarded.size} files)`);
  for (const [rel, content] of outputs) writeFileSync(path.join(outDir, rel), content);
  console.log(`interactions: ${list.length} endpoints, ${readings.length} states inventoried, ${icons.size} icon files indexed`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
