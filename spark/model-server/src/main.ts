/**
 * Entry point: `node src/main.ts` (STORY_015). Env: PORT (4120), HOST (0.0.0.0; beyond loopback only with a key,
 * STORY_036), OUTPUT_DIR (/outputs), MODEL_API_KEY (optional on loopback), WORKER (the worker command, required:
 * spark/mac/start.sh sets the mflux worker, CHORE_010), LORA_MANIFEST and LORA_DIR (the add-ons, STORY_019; default
 * /srv/loras.json and /loras), MEMORY_TOKEN, MEMORY_AGENT and MEMORY_LEASE_GB (the Ultra's memory agent, STORY_041).
 */
import { bindProblem } from "./bind.ts";
import { installedLoras } from "./loras.ts";
import { memoryFromEnv } from "./memory.ts";
import { createModelServer } from "./server.ts";

const port = Number(process.env["PORT"] ?? "4120");
const host = process.env["HOST"] ?? "0.0.0.0";
const outputDir = process.env["OUTPUT_DIR"] ?? "/outputs";
const apiKey = process.env["MODEL_API_KEY"] || undefined;
const problem = bindProblem(host, apiKey);
if (problem !== null) {
  console.error(problem);
  process.exit(1);
}
const workerCommand = (process.env["WORKER"] ?? "").split(" ").filter((s) => s !== "");
if (workerCommand.length === 0) {
  console.error("[model] WORKER is not set: it is the worker command, e.g. spark/mac/start.sh's mflux worker (CHORE_010).");
  process.exit(1);
}

const loras = installedLoras(process.env["LORA_MANIFEST"] ?? "/srv/loras.json", process.env["LORA_DIR"] ?? "/loras", (line) => {
  console.log(line);
});
// The Ultra's memory agent (STORY_041): MEMORY_TOKEN, MEMORY_AGENT, MEMORY_LEASE_GB from ~/qwen-model/.env.
const memory = memoryFromEnv(process.env, (line) => {
  console.log(line);
});
const model = createModelServer({ outputDir, workerCommand, apiKey, loras, memory });
const bound = await model.listen(port, host);
console.log(`[model] listening on http://${host}:${String(bound)} (outputs ${outputDir}${apiKey ? ", bearer auth on" : ""})`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void model.close().then(() => process.exit(0));
  });
}
