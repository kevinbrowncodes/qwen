# BUG_016 — The gate's typecheck fails on every jest-dom matcher

**Status:** Resolved (2026-10-20). Pushed through the hook with STORY_034 (`6773460..93f8e1c`).
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

- [x] `tools/gate/run.sh typecheck` is green ~~on the Spark~~ on the Mac Studio 2022 (corrected, see Corrections), and the three test files compile with their matchers typed (no `as` casts, no `// @ts-expect-error`, per CLAUDE.md §6 rule 6).
- [x] ~~The fix is one of: (a) a local declaration in `app/` that augments vitest 5's `Assertion<R, T>` with `TestingLibraryMatchers<any, R>` and `AsymmetricMatchersContaining`, with a comment naming this ticket and the two versions it bridges, so it can be deleted when jest-dom ships a two-parameter augmentation; or (b) a jest-dom release that ships that augmentation, if one exists by then (check its `types/vitest.d.ts` before pinning).~~ Corrected: neither. The cause was a second vitest in the lockfile, not the augmentation's parameter list (see Corrections).
- [x] The jest-dom pin leaves the deprecated 6.10.0 for 6.9.1 or a 7.x whose peer range `@testing-library/dom` (`>=10 <11`) the lockfile already satisfies (10.4.2), with the lockfile regenerated and committed.
- [x] The whole gate (`tools/gate/run.sh`) passes once, by hand, and the push of this fix goes through the hook with no `--no-verify`.
- [x] The Resolution note below says which of (a) or (b) was done, and answers the open question about the 2026-10-17 pushes.

## Corrections (2026-10-20, evening, by the assistant on the Mac Studio 2025)

- **The root cause above is wrong.** The same lockfile typechecks with **zero errors** on a fresh install, both natively on the Mac Studio 2025 (no `tsconfig.tsbuildinfo`) and in the gate container on the Mac Studio 2022. It also passes at `274a33d` (2026-10-16), the commit that added `LoraCard.test.tsx`. So the one-parameter augmentation does merge, and something else was different on the Spark.
- **The real cause: the lockfile held two vitests.**
  - `recon/package.json` asked for `"vitest": "^5.0.0"`, which resolved to **5.0.2**. The app, the stub and the model server pin exactly `5.0.0`.
  - jest-dom does not depend on vitest, so its `declare module 'vitest'` resolves through pnpm's hoisted `node_modules/.pnpm/node_modules/vitest`, and that link points at whichever of the two pnpm hoisted.
  - The Spark's clone hoists **5.0.2** (`readlink`, read 2026-10-20), so the matchers attached to a vitest the app does not use. Both fresh installs hoist 5.0.0.
- **The first criterion said "on the Spark".** The owner moved the repo and the gate off the Spark on 2026-10-20 (EPIC_007), so the gate was run on the Mac Studio 2022's Docker, where it runs from now on.

## Resolution (2026-10-20)

- **Fix:** vitest is pinned exactly in every package (`recon/package.json`: `"5.0.0"`), and the lockfile now resolves one vitest, 5.0.0. jest-dom leaves the withdrawn 6.10.0 for an exact `6.9.1`; its peer `@testing-library/dom` 10.4.2 was already in the lockfile.
- **The gate that keeps it fixed:** `tools/gate/src/one-vitest.test.ts`, run in step 3. It fails when `pnpm-lock.yaml` resolves more than one vitest, and its message states the rule, why it matters and the fix. On the old lockfile it fails with `resolves 2 versions of vitest (5.0.0, 5.0.2)`.
- **The whole gate passed by hand on the Mac Studio 2022** with the fix, all six steps green in 188 s (step 6 took 104 s). A baseline run of step 1 on the unfixed tree also passed there, which is how the root cause was found.
- **The 2026-10-17 pushes:**
  - No commit message mentions `--no-verify`.
  - The incremental cache cannot explain it, because `LoraCard.test.tsx` was new on 2026-10-16 and typechecks cleanly on a fresh install.
  - The likely answer: the Spark's hoisted vitest was 5.0.0 when those pushes ran, and a later `pnpm install` on the long-lived tree switched it to 5.0.2.

  No second ticket is needed. A fresh install cannot pick the wrong vitest any more, because only one remains.
- **Pushed** on 2026-10-20 through the hook, with no `--no-verify`: the hook gated `93f8e1c` on the Mac Studio 2022 (`remote.sh --commit`), and the push went through (`6773460..93f8e1c`).
