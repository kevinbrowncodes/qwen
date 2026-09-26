import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/make-fixtures.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      // Floors = the measured baseline minus 2 (STORY_008 Done note, 2026-09-26). They only ever go up (CLAUDE.md §4).
      thresholds: { statements: 94, branches: 89, functions: 95, lines: 95 },
    },
  },
});
