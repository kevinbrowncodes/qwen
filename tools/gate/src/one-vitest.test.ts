import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { oneVitestProblem, vitestVersions } from "./one-vitest.ts";

const ONE = `packages:

  vitest@5.0.0:
    resolution: {integrity: sha512-a}

snapshots:

  vitest@5.0.0(@types/node@22.20.4)(jsdom@30.1.1):
    dependencies: {}
`;

const TWO = `${ONE}
  vitest@5.0.2(@types/node@22.20.4)(jsdom@30.1.1):
    dependencies: {}
`;

test("reads the distinct vitest versions from the package and snapshot keys", () => {
  assert.deepEqual(vitestVersions(ONE), ["5.0.0"]);
  assert.deepEqual(vitestVersions(TWO), ["5.0.0", "5.0.2"]);
});

test("ignores vitest named inside another package's key or dependency list", () => {
  const lock = `${ONE}
  '@vitest/coverage-v8@5.0.0(vitest@5.0.2)':
    dependencies:
      vitest: 5.0.2
`;
  assert.deepEqual(vitestVersions(lock), ["5.0.0"]);
});

test("passes one version, and fails two with the rule and the fix", () => {
  assert.equal(oneVitestProblem(ONE), null);
  const problem = oneVitestProblem(TWO) ?? "";
  assert.match(problem, /2 versions of vitest \(5\.0\.0, 5\.0\.2\)/);
  assert.match(problem, /BUG_016/);
  assert.match(problem, /pin vitest to the same exact version/);
});

test("the repo's own lockfile resolves exactly one vitest", () => {
  const lockfile = readFileSync(path.join(import.meta.dirname, "..", "..", "..", "pnpm-lock.yaml"), "utf8");
  assert.equal(oneVitestProblem(lockfile), null);
});
