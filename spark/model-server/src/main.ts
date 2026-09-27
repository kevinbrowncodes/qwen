/**
 * Entry point: `node src/main.ts` (STORY_015). Env: PORT (4120), HOST (0.0.0.0), OUTPUT_DIR (/outputs),
 * MODEL_API_KEY (optional), WORKER (the worker command; default "python3 /srv/model/worker.py").
 */
import { createModelServer } from "./server.ts";

const port = Number(process.env["PORT"] ?? "4120");
const host = process.env["HOST"] ?? "0.0.0.0";
const outputDir = process.env["OUTPUT_DIR"] ?? "/outputs";
const apiKey = process.env["MODEL_API_KEY"] || undefined;
const workerCommand = (process.env["WORKER"] ?? "python3 /srv/model/worker.py").split(" ").filter((s) => s !== "");

const model = createModelServer({ outputDir, workerCommand, apiKey });
const bound = await model.listen(port, host);
console.log(`[model] listening on http://${host}:${String(bound)} (outputs ${outputDir}${apiKey ? ", bearer auth on" : ""})`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void model.close().then(() => process.exit(0));
  });
}
