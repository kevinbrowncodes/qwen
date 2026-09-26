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
  },
});
