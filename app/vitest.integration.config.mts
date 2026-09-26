import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration lane (STORY_007): the app's route handlers called directly as Request → Response functions against the
// stub generation server started in-process, and history in a real file. No browser, no production build.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 15_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["app/api/**/*.ts", "lib/model-client.ts", "lib/config.ts", "lib/history-store.ts", "lib/history.ts", "lib/upload-validation.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage-integration",
      // Floors = the measured baseline minus 2 (STORY_008 Done note, 2026-09-26). They only ever go up (CLAUDE.md §4).
      thresholds: { statements: 89, branches: 80, functions: 94, lines: 92 },
    },
  },
});
