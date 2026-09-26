import assert from "node:assert/strict";
import { test } from "node:test";
import { format, rank } from "./coverage-rank.ts";

const summary = {
  total: { branches: { total: 30, covered: 20, pct: 66.6 } },
  "/work/app/lib/a.ts": { branches: { total: 10, covered: 9, pct: 90 } },
  "/work/app/lib/b.ts": { branches: { total: 10, covered: 4, pct: 40 } },
  "/work/app/lib/c.ts": { branches: { total: 10, covered: 10, pct: 100 } },
  "/work/app/lib/d.ts": { lines: {} },
};

test("ranks files by uncovered branches, most first, skipping the total and fully covered files", () => {
  assert.deepEqual(rank(summary, "/work").map((r) => [r.file, r.uncovered]), [["app/lib/b.ts", 6], ["app/lib/a.ts", 1]]);
});

test("reads nothing from something that is not a summary", () => {
  assert.deepEqual(rank(null), []);
  assert.deepEqual(rank("x"), []);
});

test("formats a line with counts, percentage and file", () => {
  assert.equal(format({ file: "a.ts", uncovered: 6, total: 10, pct: 40 }), "   6 uncovered of   10 branches (40.0%)  a.ts");
});
