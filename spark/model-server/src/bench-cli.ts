/**
 * Entry point for spark/bench-loras.sh (STORY_022): `node bench-cli.ts <base-url> <out-dir> [manifest]`.
 * Env: MODEL_API_KEY (optional), BENCH_POLL_MS (default 3000). Exits 1 when any cell is left not done.
 */
import { readFileSync } from "node:fs";
import { runBench } from "./bench.ts";
import { parseManifest } from "./loras.ts";

const [base, outDir, manifestFile] = process.argv.slice(2);
if (base === undefined || outDir === undefined) {
  console.error("usage: bench-cli.ts <base-url> <out-dir> [manifest]");
  process.exit(2);
}
const manifest = manifestFile === undefined ? [] : parseManifest(readFileSync(manifestFile, "utf8"), "/").map((l) => ({ id: l.id, label: l.label, scale: l.scale, ...(l.guidance === undefined ? {} : { guidance: l.guidance }) }));
const apiKey = process.env["MODEL_API_KEY"] || undefined;
const outcome = await runBench({
  base,
  outDir,
  pollMs: Number(process.env["BENCH_POLL_MS"] ?? "3000"),
  ...(apiKey === undefined ? {} : { apiKey }),
  manifest,
  report: (line) => {
    console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
  },
});
process.exit(outcome.complete ? 0 : 1);
