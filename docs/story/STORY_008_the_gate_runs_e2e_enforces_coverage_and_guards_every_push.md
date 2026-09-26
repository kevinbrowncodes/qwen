# STORY_008 — The gate runs end-to-end tests, enforces coverage floors, and guards every push

**Epic:** [EPIC_002](../epic/EPIC_002_the_app_has_a_skeleton_a_stub_generation_server_and_a_test_gate.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want every push to `develop` to run the full seven-step gate automatically, including Playwright against the production build and the stub, with coverage floors that only go up, so that nothing lands untested and the first clone story inherits a working e2e harness.

## Current state

After STORY_007, `tools/gate/run.sh` runs install, typecheck, lint, test, test:integration and build. `test:e2e` reports "no lane yet". There are no coverage thresholds and no git hook.

## UI Mockup

N/A (no UI change; the smoke spec renders the STORY_005 placeholder).

## Acceptance Criteria

- [x] `app/playwright.config.ts` does four things:
  - starts the stub (port 4110, loopback) and the **production standalone build** (port 3110, loopback, `MODEL_BASE_URL` pointing at the stub, a temp `HISTORY_FILE`), with every build-time and run-time variable passed explicitly in `webServer.env` ([CLAUDE.md → §6b](../../CLAUDE.md#6b-e2e-test-conventions));
  - defines two projects: `desktop` at the capture width (1437×1031, the recon's viewport) and `narrow` as `devices["iPhone 13"]`, never a bare viewport;
  - runs one worker, not fully parallel;
  - sets `retries: 0`.
- [x] `app/e2e/fixtures.ts` provides three things:
  - a `stub` fixture that resets the stub before each test and, after it, **fails the test if any stub job is still non-terminal** (a test must not end with a job running);
  - `submitAndWait`, which registers the `waitForResponse` for the terminal status **before** the action that submits;
  - `expectImageLoaded`, which checks an image's `complete`, a non-zero `naturalWidth`, and its `src`.
- [x] `app/e2e/smoke.spec.ts`, at both widths:
  - the placeholder page renders;
  - `/api/health` is ok;
  - a job created through `/api/jobs` with `done-after-1-poll` reaches done through `/api/jobs/:id`;
  - an image element pointed at `/api/jobs/:id/result` loads the fixture (64 px natural width).
- [x] ESLint forbids `page.waitForTimeout` and `setViewportSize` in `e2e/` ([CLAUDE.md → §6b](../../CLAUDE.md#6b-e2e-test-conventions), §6 rule 9).
- [x] **Coverage floors:** the app's unit and integration lanes and the stub's tests run with v8 coverage and thresholds set from the measured baseline minus 2, recorded in the Done note. On a failing unit or integration step, `run.sh` lists the files with the most uncovered branches. The floors are written down as ratchet-only ([CLAUDE.md → §4](../../CLAUDE.md#4-dev-workflow)).
- [x] **Pre-push hook:** husky's `.husky/pre-push` runs `tools/gate/run.sh` when a ref is pushed to `develop`, and refuses the push if it fails. `pnpm install` (step 0 of the gate) installs the hook. `tools/gate/install-hooks.sh` sets `core.hooksPath` for a clone where that has not happened. The hook needs only docker on the host.
- [x] CLAUDE.md §4's "until that hook exists" sentence becomes true. The README's Testing section describes the lanes, the stub scripts and the gate.

## Technical Notes

- Ports 4110 and 3110 are inside the gate container, whose network is its own. They cannot clash with minimax's gate or with the dev server on 3100.
- The gate image carries Chromium and WebKit, but the lane runs Chromium for both projects. `iPhone 13` sets `defaultBrowserType: webkit`, so the narrow project overrides it to Chromium with the same viewport, touch and user agent. WebKit is available for a later story that needs it.

## Testing Plan

- **Unit**: `tools/gate/run.test.sh` gains a case checking that the pre-push hook script calls `run.sh` only for `refs/heads/develop` and exits non-zero when `run.sh` fails. It drives the hook with a fake `run.sh` on `PATH`.
- **Integration**: unchanged. STORY_007's lane now also enforces its floor.
- **E2E**: `app/e2e/smoke.spec.ts` as in the AC, at both widths. Scenario: the stub fixture resets the stub; the spec opens `/` and expects the heading "Qwen Local"; it requests `/api/health` and expects `ok`; it POSTs `/api/jobs` with `X-Stub-Script: done-after-1-poll`, polls `/api/jobs/:id` until status `done`, then sets an image's `src` to the result URL and asserts it loaded with `naturalWidth` 64. The fixture's teardown asserts that the stub has no non-terminal jobs.
- **Manual**: one real `git push origin develop` runs the hook, and its log shows all seven steps green.

## Estimated Complexity

M

## Done (2026-09-26)

- **E2E:** `app/e2e/smoke.spec.ts` passes 6 tests (3 per project) against the production standalone build and the stub. It was also shown to fail when it should: a throwaway spec that left a `cancel-midway` job running failed with "a test must not end with a job still running", and was then deleted.
- **Coverage baselines and floors (baseline minus 2), measured 2026-09-26:**

  | Lane | Statements | Branches | Functions | Lines |
  | --- | --- | --- | --- | --- |
  | App unit | 100 → **98** | 99.14 → **97** | 100 → **98** | 100 → **98** |
  | App integration | 91.46 → **89** | 82.06 → **80** | 96.29 → **94** | 94.64 → **92** |
  | Stub | 96.76 → **94** | 91.79 → **89** | 97.95 → **95** | 97.74 → **95** |

  The app's unit lane leaves out `history-store.ts` and `model-client.ts`, which the integration lane covers.
- **Hook:** `pnpm install` in the gate ran husky, which set `core.hooksPath=.husky/_`. `run.test.sh` gained three hook cases (9 in all), and `coverage-rank` has 3 `node --test` cases.
- One lint error in `fixtures.ts` (an unsafe `any` return from `.json()`) was fixed before landing.
- Gate: `tools/gate/run.sh` green in 15 s, and the push of this commit ran the whole gate through the hook.
