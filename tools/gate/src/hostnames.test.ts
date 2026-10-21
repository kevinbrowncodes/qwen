import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { report, scanRepo, scanText, scannedFiles } from "./hostnames.ts";

test("catches each machine name and LAN address with its line", () => {
  const text = [
    'const a = "http://mac-studio-2026.local:4120";',
    "const b = 'spark-1';",
    "// the DGX-Spark serves it",
    'const c = "http://hands.local";',
    'const d = "192.168.1.47";',
  ].join("\n");
  const found = scanText("app/lib/x.ts", text).map((v) => `${String(v.line)} ${v.found}`);
  assert.deepEqual(found, ["1 mac-studio-2026", "1 mac-studio-2026.local", "2 spark-1", "3 DGX-Spark", "4 hands.local", "5 192.168.1.47"]);
});

test("lets loopback, environment-driven URLs and the word local through", () => {
  const text = [
    'const url = process.env["MODEL_BASE_URL"] ?? "http://localhost:4120";',
    'const loop = "127.0.0.1";',
    "// a local copy of the weights; stored locally",
  ].join("\n");
  assert.deepEqual(scanText("app/lib/config.ts", text), []);
});

test("scans only the four folders' text files, skipping generated ones", () => {
  const root = mkdtempSync(path.join(tmpdir(), "hostnames-"));
  try {
    const put = (rel: string, body: string): void => {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), body);
    };
    put("app/lib/a.ts", "const host = 'spark-1';\n");
    put("app/node_modules/pkg/index.js", "x = 'spark-1'\n");
    put("app/.next/server/page.js", "x = 'spark-1'\n");
    put("app/public/icon.png", "spark-1");
    put("tools/spike/run.sh", "SPARK=spark-1.local\n");
    put("docs/epic/E.md", "mac-studio-2026\n");
    assert.deepEqual(scannedFiles(root), [path.join("app", "lib", "a.ts")]);
    const violations = scanRepo(root);
    assert.equal(violations.length, 1);
    const message = report(violations);
    assert.match(message, /app\/lib\/a\.ts:1 {2}spark-1/);
    assert.match(message, /Fix: put the value in \.env/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the repo's application code, tests and fixtures name no machine", (t) => {
  const violations = scanRepo(path.join(import.meta.dirname, "..", "..", ".."));
  if (violations.length > 0) t.diagnostic(report(violations));
  assert.equal(violations.length, 0, report(violations));
});
