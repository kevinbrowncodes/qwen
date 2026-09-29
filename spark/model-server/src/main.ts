/**
 * Entry point: `node src/main.ts` (STORY_015). Env: PORT (4120), HOST (0.0.0.0), OUTPUT_DIR (/outputs),
 * MODEL_API_KEY (optional), WORKER (the worker command; default "python3 /srv/model/worker.py"), LORA_MANIFEST and
 * LORA_DIR (the add-ons, STORY_019; default /srv/loras.json and /loras).
 */
import { installedLoras } from "./loras.ts";
import { createModelServer } from "./server.ts";

const port = Number(process.env["PORT"] ?? "4120");
const host = process.env["HOST"] ?? "0.0.0.0";
const outputDir = process.env["OUTPUT_DIR"] ?? "/outputs";
const apiKey = process.env["MODEL_API_KEY"] || undefined;
const workerCommand = (process.env["WORKER"] ?? "python3 /srv/model/worker.py").split(" ").filter((s) => s !== "");

const loras = installedLoras(process.env["LORA_MANIFEST"] ?? "/srv/loras.json", process.env["LORA_DIR"] ?? "/loras", (line) => {
  console.log(line);
});
const model = createModelServer({ outputDir, workerCommand, apiKey, loras });
const bound = await model.listen(port, host);
console.log(`[model] listening on http://${host}:${String(bound)} (outputs ${outputDir}${apiKey ? ", bearer auth on" : ""})`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void model.close().then(() => process.exit(0));
  });
}
