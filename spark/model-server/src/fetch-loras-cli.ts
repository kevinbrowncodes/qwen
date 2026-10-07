/**
 * Entry point for spark/fetch-loras.sh (STORY_021): `node fetch-loras-cli.ts <manifest> <dir> [status|verify]`.
 * Env: HF_TOKEN_PATH and CIVITAI_TOKEN_PATH name token files, and ENV_FILE a .env whose CIVITAI_TOKEN wins over
 * the token file (CHORE_005); all optional, never printed. HF_BASE and CIVITAI_BASE
 * override where the sources are reached. Exits 1 when any entry is refused, left waiting, failed, or does not verify.
 */
import { DEFAULT_BASES, fetchAll, readEnvToken, readFetchManifest, readToken, statusLines, verify } from "./fetch-loras.ts";
import { readFileSync } from "node:fs";

const [manifest, dir, command = ""] = process.argv.slice(2);
if (manifest === undefined || dir === undefined || !["", "status", "verify"].includes(command)) {
  console.error("usage: fetch-loras-cli.ts <manifest> <dir> [status|verify]");
  process.exit(2);
}

const { entries, refused } = readFetchManifest(readFileSync(manifest, "utf8"));
for (const r of refused) console.log(`fetch: ${r.id} refused: ${r.reason}`);
let incomplete = refused.length > 0;

if (command === "status") {
  for (const line of statusLines(entries, dir)) console.log(line);
} else if (command === "verify") {
  for (const { id, verdict } of await verify(entries, dir)) {
    console.log(`verify: ${id.padEnd(22)} ${verdict}`);
    if (verdict !== "ok") incomplete = true;
  }
} else {
  const bases = { huggingface: process.env["HF_BASE"] ?? DEFAULT_BASES.huggingface, civitai: process.env["CIVITAI_BASE"] ?? DEFAULT_BASES.civitai };
  // CHORE_005: CIVITAI_TOKEN in the repo's .env (ENV_FILE) wins over the token file.
  const fromEnv = readEnvToken(process.env["ENV_FILE"]);
  const fromFile = readToken(process.env["CIVITAI_TOKEN_PATH"]);
  console.log(`fetch: Civitai key: ${fromEnv !== undefined ? "found in .env" : fromFile !== undefined ? "found in ~/.config/civitai/token" : "none"}`);
  const tokens = { huggingface: readToken(process.env["HF_TOKEN_PATH"]), civitai: fromEnv ?? fromFile };
  const outcome = await fetchAll(entries, dir, tokens, bases, (line) => {
    console.log(line);
  });
  if (outcome.waiting.length > 0 || outcome.failed.length > 0) incomplete = true;
  const parts = [`${String(outcome.fetched.length)} fetched`];
  if (outcome.waiting.length > 0) parts.push(`${String(outcome.waiting.length)} waiting for a Civitai token (${outcome.waiting.join(", ")})`);
  if (outcome.failed.length > 0) parts.push(`${String(outcome.failed.length)} failed (${outcome.failed.map((f) => f.id).join(", ")})`);
  console.log(`fetch: finished: ${parts.join("; ")}. Run spark/up.sh (once no job is running) so the worker loads them.`);
}
process.exit(incomplete ? 1 : 0);
