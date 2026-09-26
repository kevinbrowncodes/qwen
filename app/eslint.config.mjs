import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

// CLAUDE.md §6 rule 6: strict TypeScript, no `any`, type assertions only when unavoidable.
export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "coverage/**", "coverage-integration/**"]),
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as", objectLiteralTypeAssertions: "never" }],
    },
  },
  {
    // CLAUDE.md §6b encoded for specs: no sleeps after a submit, no bare viewport sizes (use a device descriptor).
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off", // Playwright fixtures call `use`, and are not React
      "no-restricted-properties": [
        "error",
        { object: "page", property: "waitForTimeout", message: "Wait for the terminal status response or a locator state, never a sleep (CLAUDE.md §6b)." },
        { property: "setViewportSize", message: "Use a device descriptor project (devices[...]), never a bare viewport (CLAUDE.md §6 rule 9)." },
      ],
    },
  },
  {
    // The config files themselves are not part of the TypeScript project: no type-aware rules for them.
    files: ["**/*.mjs", "**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
]);
