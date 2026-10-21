/**
 * The workspace resolves exactly one vitest (BUG_016). `@testing-library/jest-dom/vitest` augments whichever `vitest`
 * pnpm hoists into `node_modules/.pnpm/node_modules`, because jest-dom does not depend on vitest itself. With two
 * versions in the lockfile, the hoisted one can be the version the app does not use, and every jest-dom matcher then
 * loses its type in the app's tests. That broke step 1 on the Spark on 2026-10-20, while the same tree passed elsewhere.
 */

/** The distinct vitest versions a pnpm lockfile resolves (the `vitest@x.y.z` package keys), sorted. */
export function vitestVersions(lockfile: string): string[] {
  const found = new Set<string>();
  for (const match of lockfile.matchAll(/^ {2}'?vitest@(\d+\.\d+\.\d+[^(':\s]*)/gm)) {
    const version = match[1];
    if (version !== undefined) found.add(version);
  }
  return [...found].sort();
}

/** The gate's message for a lockfile with more than one vitest, or null when there is one (or none). */
export function oneVitestProblem(lockfile: string): string | null {
  const versions = vitestVersions(lockfile);
  if (versions.length <= 1) return null;
  return [
    `pnpm-lock.yaml resolves ${String(versions.length)} versions of vitest (${versions.join(", ")}); the workspace must resolve exactly one.`,
    "Why: jest-dom's matcher types attach to whichever vitest pnpm hoists, so a second version can strip them from the app's tests (BUG_016).",
    "Fix: pin vitest to the same exact version (no ^ or ~) in every package.json that lists it, then run pnpm install.",
  ].join("\n");
}
