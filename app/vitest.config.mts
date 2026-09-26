import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit lane (CLAUDE.md §3 item 5): pure helpers and jsdom component tests. The integration lane (STORY_007) has its
// own config so `pnpm test` never needs the stub.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "app/**/*.test.tsx", "components/**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "test/integration/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      // Covered by the integration lane instead: the file store and the upstream client.
      exclude: ["lib/**/*.test.ts", "lib/history-store.ts", "lib/model-client.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      // Floors = the measured baseline minus 2 (STORY_008 Done note, 2026-09-26). They only ever go up (CLAUDE.md §4).
      thresholds: { statements: 98, branches: 97, functions: 98, lines: 98 },
    },
  },
});
