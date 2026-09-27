/**
 * A stand-in for spark/model/worker.py in the gate (STORY_015): the same line protocol, no GPU. It copies the stub's
 * fixture PNG as its "result", steps every FAKE_STEP_MS, and behaves by keyword in the prompt: "crash" exits,
 * "fail" reports a failure, "slow" takes 200 steps. Every job message it receives is appended to FAKE_LOG.
 */
import { appendFileSync, copyFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("../../../tools/stub-generation-server/fixtures/result.png", import.meta.url));
const stepMs = Number(process.env["FAKE_STEP_MS"] ?? "5");
const say = (m: object): void => {
  process.stdout.write(`${JSON.stringify(m)}\n`);
};
const cancelled = new Set<string>();
let busy = false;

console.log("fake worker: loading (log noise the server must ignore)");
setTimeout(() => {
  say({ type: "ready" });
}, 20);

async function run(job: { id: string; prompt: string; steps: number; output: string; width?: number; height?: number }): Promise<void> {
  busy = true;
  if (job.prompt.includes("crash")) process.exit(3);
  const steps = job.prompt.includes("slow") ? 200 : 4;
  for (let step = 1; step <= steps; step++) {
    await new Promise((r) => setTimeout(r, stepMs));
    if (cancelled.has(job.id)) {
      say({ type: "cancelled", id: job.id });
      busy = false;
      return;
    }
    say({ type: "progress", id: job.id, step, steps });
  }
  if (job.prompt.includes("fail")) say({ type: "failed", id: job.id, message: "CUDA out of memory (scripted)" });
  else {
    copyFileSync(FIXTURE, job.output);
    say({ type: "done", id: job.id, path: job.output, width: 64, height: 36 });
  }
  busy = false;
}

createInterface({ input: process.stdin }).on("line", (line) => {
  const m: unknown = JSON.parse(line);
  if (typeof m !== "object" || m === null || !("type" in m)) return;
  if (process.env["FAKE_LOG"]) appendFileSync(process.env["FAKE_LOG"], `${line}\n`);
  if (m.type === "cancel" && "id" in m && typeof m.id === "string") cancelled.add(m.id);
  if (m.type === "job" && !busy) void run(m as unknown as Parameters<typeof run>[0]);
});
