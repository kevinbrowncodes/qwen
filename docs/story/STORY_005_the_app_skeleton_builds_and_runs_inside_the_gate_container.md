# STORY_005 — The app skeleton builds and runs inside the gate container

**Epic:** [EPIC_002](../epic/EPIC_002_the_app_has_a_skeleton_a_stub_generation_server_and_a_test_gate.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want a Next.js app that typechecks, lints, unit-tests, builds and serves a placeholder page from a container on the Spark, so that every later story lands on a working toolchain instead of inventing one.

## Current state

The repo holds `recon/` (a pnpm workspace package run in the Playwright image), `spark/fetch-weights.sh` and `docs/`. There is no `app/`, no `tools/`, no gate image and no root `lint`, `build` or `test:*` scripts. `pnpm-workspace.yaml` already lists `app`, `recon` and `tools/*`. There is no pnpm on the Spark host. The sibling project's toolchain (Next.js 16.3.5, React 19.3, TypeScript 5.9.3, ESLint 9, Vitest 5, Playwright 1.63 in a `node:26-bookworm` image) is known to work on this box.

## UI Mockup

The placeholder page is not a clone surface. EPIC_003 replaces it. It uses the reference's page colour from `docs/recon/2026-09-26/tokens.md` (`#171717`) so a dev-server check is not a white flash:

```
┌──────────────────────────────────────────────┐
│                                              │  background #171717
│              Qwen Local                      │  #fafbff, system-ui stack
│      The image generation screen is          │
│      built in EPIC_003.                      │
│                                              │
└──────────────────────────────────────────────┘
```

At narrow width it is the same text, centred.

## Acceptance Criteria

- [x] `tools/gate/Dockerfile` builds the image `qwen/gate:1.63.0-node26`: `node:26-bookworm` pinned by digest, pnpm 10.32.1, Playwright 1.63's Chromium and WebKit, and the host user's uid and gid. `tools/gate/build.sh` builds it idempotently.
- [x] `compose.yaml` (project `qwen`) defines three services:
  - `gate`: the image with the repo at `/work` and a named pnpm-store volume;
  - `app-dev`: `next dev` on host port **3100**;
  - `app`: the production image from `app/Dockerfile`, on host port 3100 (only one of the two runs at a time).

  Nothing binds port 3000, which is minimax's.
- [x] `tools/gate/run.sh` runs the gate steps of [CLAUDE.md → §4](../../CLAUDE.md#4-dev-workflow) in order inside the gate container: install, typecheck, lint, test, test:integration, build, test:e2e. It stops at the first failure with that step's number as the exit code, and a step whose root script does not exist yet prints "no lane yet" and passes. `--from N` and named steps run a subset.
- [x] `app/` is a Next.js App Router app with `strict: true` and `noUncheckedIndexedAccess`, `output: "standalone"`, and `reactStrictMode`. ESLint uses `typescript-eslint`'s strict type-checked rules, with `no-explicit-any` as an error and object-literal type assertions banned ([CLAUDE.md → §6 rule 6](../../CLAUDE.md#6-key-rules)).
- [x] Root scripts `typecheck`, `lint`, `test` and `build` cover `app` and `recon`. `pnpm test` runs the recon tests and the app's unit lane.
- [x] The placeholder page renders the mockup above. `GET /api/health` answers `200 {"status":"ok"}`.
- [x] `recon/` keeps passing: its typecheck and tests run in the gate too.
- [x] README → Running the UI says how to start the dev server and the production container, and names port 3100.

## Technical Notes

- The version choices are the sibling's, for known-good behaviour on this box. The app's TypeScript is 5.9.3, because Next's plugin expects 5.x. `recon/` keeps its own TypeScript 7.
- The gate image runs as the host user so files in the bind mount stay the owner's (CLAUDE.md: containers first).
- `app/Dockerfile` is a multi-stage build from the gate's base Node image. It serves `.next/standalone` as a non-root user.

## Testing Plan

- **Unit**: `app/lib/health.test.ts` checks that the health payload builder returns `{ status: "ok" }` and nothing else. This proves the unit lane runs in the gate and fails on a real assertion. `recon`'s 98 existing tests prove the workspace wiring kept that package working.
- **Integration**: N/A until STORY_007 adds API routes that talk to a generation server. The health route has no dependency to integrate with, and `run.sh` reports "no lane yet".
- **E2E**: N/A until STORY_008 adds the lane. This story's user-visible surface is a placeholder with no flow. `run.sh` reports "no lane yet".
- **Gate script**: `tools/gate/run.test.sh` drives `run.sh` with `GATE_DRY_RUN` and checks three things: steps run in order, the first failure stops the run with its step number, and `--from 4` starts at step 4. It runs in the gate as part of `pnpm test`.
- **Manual**: `docker compose --profile dev up app-dev` serves the page at http://localhost:3100, and `docker compose up -d app` serves the built page on the same port.

## Estimated Complexity

M

## Done (2026-09-26)

- `tools/gate/build.sh` built `qwen/gate:1.63.0-node26` from the cached sibling layers (node v26.8.2, pnpm 10.32.1, Chromium 1243 and WebKit 2359).
- `tools/gate/run.sh`: typecheck (app and recon), lint (app), test (recon 98, gate 6, app 1) and build were green in 11 s. Integration and e2e report "no lane yet".
- `docker compose up -d --build app` serves the placeholder at http://localhost:3100, and `/api/health` answers `{"status":"ok"}`. Checked with curl on the Spark. Port 3100 was free beforehand (`ss -ltnp`).
- `.dockerignore` keeps `models/` (the 33 GB of weights), `recon/out/` and `docs/` out of every build context.
- The gate's "is this lane defined" check reads `package.json` with the host's python3, so it doesn't start a container per step. The image needs no jq.
