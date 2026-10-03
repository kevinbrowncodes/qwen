import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/fetch-loras-cli.ts", "src/bench-cli.ts", "src/fake-worker.ts"],
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
