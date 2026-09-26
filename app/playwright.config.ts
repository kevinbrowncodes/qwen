import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E lane (STORY_008): the production standalone build (`pnpm build` first, gate step 5) driven against the stub
 * generation server, both started here, inside the gate container. CLAUDE.md §6b: build-time and run-time env passed
 * explicitly; desktop at the capture width, narrow through a device descriptor, never a bare viewport.
 */
const STUB_PORT = 4110;
const APP_PORT = 3110;
const stubUrl = `http://127.0.0.1:${String(STUB_PORT)}`;
const appUrl = `http://127.0.0.1:${String(APP_PORT)}`;
export const STUB_URL = stubUrl;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    // The recon's desktop capture width (docs/recon/2026-09-26/manifest.json: 1437×1031).
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1437, height: 1031 } } },
    // iPhone 13's viewport, touch and user agent; Chromium, because that is the browser the lane runs (STORY_008).
    { name: "narrow", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    {
      command: "pnpm --filter stub-generation-server start",
      url: `${stubUrl}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { STUB_PORT: String(STUB_PORT), STUB_HOST: "127.0.0.1" },
    },
    {
      // The standalone server, exactly what app/Dockerfile ships; `pnpm build` (gate step 5) must have run.
      command: "cp -r .next/static .next/standalone/app/.next/ && cp -r public .next/standalone/app/ && node .next/standalone/app/server.js",
      url: `${appUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(APP_PORT),
        HOSTNAME: "127.0.0.1",
        MODEL_BASE_URL: stubUrl,
        HISTORY_FILE: path.join(tmpdir(), `qwen-e2e-history-${String(process.pid)}.json`),
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
