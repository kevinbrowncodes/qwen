/**
 * `node src/merge-index-cli.ts <jobs.json here> <jobs.json incoming>` (STORY_037): writes the merged index over the first
 * file (through a temp file and a rename) and prints the counts. Run on the Mac Studio 2026 by
 * tools/deploy/migrate-from-spark.sh, with the model server stopped.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mergeIndexes } from "./merge-index.ts";

const [herePath, incomingPath] = process.argv.slice(2);
if (herePath === undefined || incomingPath === undefined) {
  console.error("usage: merge-index-cli.ts <jobs.json here> <jobs.json incoming>");
  process.exit(2);
}
const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "[]");
const { text, kept, added } = mergeIndexes(read(herePath), read(incomingPath));
writeFileSync(`${herePath}.tmp`, text);
renameSync(`${herePath}.tmp`, herePath);
console.log(`merge-index: kept ${String(kept)}, added ${String(added)}, now ${String(kept + added)}`);
