import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));
const FAKE = fileURLToPath(new URL("./fake-worker.ts", import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Starts `node src/main.ts` with `env`; resolves on exit, or on the listening line (then stops it). */
function start(env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
  const outputs = mkdtempSync(path.join(tmpdir(), "main-test-"));
  dirs.push(outputs);
  const child = spawn(process.execPath, [MAIN], {
    env: { PATH: process.env["PATH"] ?? "", PORT: "0", OUTPUT_DIR: outputs, LORA_MANIFEST: path.join(outputs, "none.json"), WORKER: `${process.execPath} ${FAKE}`, ...env },
  });
  let out = "";
  let err = "";
  return new Promise((resolve) => {
    child.stdout.on("data", (b: Buffer) => {
      out += b.toString();
      if (out.includes("[model] listening on")) child.kill("SIGTERM");
    });
    child.stderr.on("data", (b: Buffer) => {
      err += b.toString();
    });
    child.on("exit", (code) => { resolve({ code, out, err }); });
  });
}

describe("main.ts listens beyond loopback only with a key (STORY_036)", () => {
  it("exits 1 on HOST=0.0.0.0 without MODEL_API_KEY, naming it and the fix", async () => {
    const { code, out, err } = await start({ HOST: "0.0.0.0" });
    expect(code).toBe(1);
    expect(err).toContain("refusing to listen on 0.0.0.0 without MODEL_API_KEY");
    expect(err).toContain("Fix: set MODEL_API_KEY");
    expect(out).not.toContain("listening");
  });

  it("listens on loopback without a key", async () => {
    const { out } = await start({ HOST: "127.0.0.1" });
    expect(out).toMatch(/\[model\] listening on http:\/\/127\.0\.0\.1:\d+/);
  });

  it("listens beyond loopback with a key, and says bearer auth is on", async () => {
    const { out } = await start({ HOST: "0.0.0.0", MODEL_API_KEY: "test-key" });
    expect(out).toMatch(/listening on http:\/\/0\.0\.0\.0:\d+ .*bearer auth on/);
  });
});
