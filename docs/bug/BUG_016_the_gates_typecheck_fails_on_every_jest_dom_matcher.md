# BUG_016 — The gate's typecheck fails on every jest-dom matcher

**Status:** Open
**Found:** 2026-10-20, by the assistant, running the gate by hand on the Spark for SPIKE_001 after the push was refused by the session's permission layer. **Not caused by SPIKE_001's commit** (`7338dbf`): that commit touches nothing under `app/` (`git diff --stat 6773460 HEAD -- app/` is empty), and the failing test files are byte-identical to the last pushed commit `6773460` (checked in a detached worktree).

## Summary

`tools/gate/run.sh typecheck` (step 1 of 6, `tsc --noEmit` in the gate container) fails with 13 errors in the three component tests that use jest-dom matchers. Every error has the same shape: a jest-dom matcher "does not exist on type `Assertion<void, HTMLElement>`". Until it is fixed the pre-push hook refuses every push to `develop`, including SPIKE_001's.

## Steps to Reproduce

On the Spark, in the repo root, with the gate image built:

```bash
tools/gate/run.sh typecheck
# or the same command the gate runs:
docker compose --project-directory . -f compose.yaml run --rm --no-deps -T gate pnpm --filter app exec tsc --noEmit
```

## Expected vs Actual Behaviour

**Expected:** step 1 green, as it must have been for the pushes of 2026-10-17 to pass the hook.

**Actual (2026-10-20):**

```
components/Dropdown.test.tsx(103,59): error TS2339: Property 'toHaveAccessibleDescription' does not exist on type 'Assertion<void, HTMLElement>'.
components/Dropdown.test.tsx(137,20): error TS2339: Property 'toBeDisabled' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(33,63): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(34,79): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(38,73): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(48,18): error TS2339: Property 'toHaveAttribute' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(49,18): error TS2339: Property 'toHaveAttribute' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(50,18): error TS2339: Property 'toHaveAttribute' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(51,18): error TS2339: Property 'toHaveAttribute' does not exist on type 'Assertion<void, HTMLElement>'.
components/composer/LoraCard.test.tsx(63,67): error TS2339: Property 'toBeInTheDocument' does not exist on type 'Assertion<void, HTMLElement>'.
components/history/HistoryDays.test.tsx(97,65): error TS2339: Property 'toBeDisabled' does not exist on type 'Assertion<void, HTMLElement>'.
components/history/HistoryDays.test.tsx(103,63): error TS2339: Property 'toBeDisabled' does not exist on type 'Assertion<void, HTMLElement>'.
components/history/HistoryDays.test.tsx(113,69): error TS2339: Property 'toBeDisabled' does not exist on type 'Assertion<void, HTMLElement>'.
```

The runtime tests themselves are not the problem: the matchers exist at run time through `app/vitest.setup.ts` (`import "@testing-library/jest-dom/vitest"`). Only their types are missing.

## Root Cause

A type-parameter mismatch between the two libraries the lockfile pins, read from the installed files on 2026-10-20 (`node_modules/.pnpm/lock.yaml` is identical to the committed `pnpm-lock.yaml`, so the tree is exactly what the lockfile says):

- **vitest 5.0.0** (`app/node_modules/vitest/dist/chunks/config.d.CU_b-wJj.d.ts:1700`) declares the assertion type with **two** parameters:
  `interface Assertion<R extends void | Promise<void> = void, T = unknown> extends VitestAssertion<Chai.Assertion, R, T>, JestAssertion<R, T>, …`
- **@testing-library/jest-dom 6.10.0** (`app/node_modules/@testing-library/jest-dom/types/vitest.d.ts`) augments it with **one**:
  `declare module 'vitest' { interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {} … }`

TypeScript merges interface declarations only when their type parameter lists are identical; here they are not, so the augmentation never lands on vitest's `Assertion<R, T>`, and the matchers are missing from every `expect(...)`. The merge error itself (TS2428) is raised inside `node_modules`, where `"skipLibCheck": true` (`app/tsconfig.json:6`) hides it, which is why the only visible symptom is TS2339 in our tests.

Two facts frame the fix:

- The newest jest-dom on the registry, **7.0.1** (published 2026-08-09), carries the **same one-parameter augmentation** (read from unpkg on 2026-10-20), so upgrading jest-dom does not fix it. vitest 5.0.0 was published 2026-09-03; the lockfile has pinned it since 2026-09-28 (`d366d63`).
- npm marks the pinned **jest-dom 6.10.0 as deprecated**: "Incorrect minor release with breaking changes (Node >=22 and required @testing-library/dom peer). Use 6.9.1 for the 6.x line, or upgrade to 7.0.0." (`pnpm-lock.yaml`, the package's `deprecated` field.) Unrelated to the type error, but the pin should not stay on a release its authors withdrew.

**Open question for the owner.** The same lockfile and the same test file (`Dropdown.test.tsx`, 2026-09-26) passed the hook's gate on every push up to 2026-10-17 if the hook ran. The tree has not changed, so either those pushes bypassed the hook (`--no-verify`), or `tsc`'s incremental cache (`"incremental": true`, `app/tsconfig.tsbuildinfo`) carried stale "no error" results for these files until today's run invalidated it. The fix below holds either way; the answer decides whether a second ticket about the hook is needed.

## Acceptance Criteria

- [ ] `tools/gate/run.sh typecheck` is green on the Spark, and the three test files compile with their matchers typed (no `as` casts, no `// @ts-expect-error`, per CLAUDE.md §6 rule 6).
- [ ] The fix is one of: (a) a local declaration in `app/` that augments vitest 5's `Assertion<R, T>` with `TestingLibraryMatchers<any, R>` and `AsymmetricMatchersContaining`, with a comment naming this ticket and the two versions it bridges, so it can be deleted when jest-dom ships a two-parameter augmentation; or (b) a jest-dom release that ships that augmentation, if one exists by then (check its `types/vitest.d.ts` before pinning).
- [ ] The jest-dom pin leaves the deprecated 6.10.0 for 6.9.1 or a 7.x whose peer range `@testing-library/dom` (`>=10 <11`) the lockfile already satisfies (10.4.2), with the lockfile regenerated and committed.
- [ ] The whole gate (`tools/gate/run.sh`) passes once, by hand, and the push of this fix goes through the hook with no `--no-verify`.
- [ ] The Resolution note below says which of (a) or (b) was done, and answers the open question about the 2026-10-17 pushes.
