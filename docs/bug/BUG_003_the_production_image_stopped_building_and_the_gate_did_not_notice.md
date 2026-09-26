# BUG_003 — The production image stopped building, and the gate did not notice

**Status:** Resolved (2026-09-26)
**Found in:** redeploying after [STORY_008](../story/STORY_008_the_gate_runs_e2e_enforces_coverage_and_guards_every_push.md)

## Summary

`docker compose up -d --build app` failed, and `qwen-app` kept serving the STORY_005 image, where `/api/capabilities` is a 404. `next build` inside `app/Dockerfile` type-checks the whole app project, including `test/integration/jobs.test.ts`, which imports `stub-generation-server`. The Dockerfile copies neither that package's manifest nor its source. The gate's build step runs `pnpm build` in the bind mount, where the workspace is complete, so it stayed green.

## Steps to Reproduce

1. At 320dcd3, run `docker compose build app`.
2. The build fails with `Cannot find module 'stub-generation-server'`.

## Expected vs Actual Behaviour

- **Expected:** the production image builds from every commit the gate lets through.
- **Actual:** the gate was green while the image could not be built. A failed build also leaves the old container running, which is easy to miss when only the last line of output is read.

## Root Cause

Two things combined:
- the image's build context omits a workspace package that the app's type-check reaches;
- the gate never builds the image.

The sibling project had the same failure and added the image build to gate step 5 (its STORY_009). That lesson was not carried over in STORY_005.

## Acceptance Criteria

- [x] `app/Dockerfile` copies `tools/stub-generation-server` (its manifest for the install, its source for the type-check), so `docker compose build app` succeeds.
- [x] `tools/gate/run.sh` step 5 also builds the production image (`docker compose build app`), so an image that cannot build fails the gate.
- [x] The redeployed container serves `/api/capabilities` (503 busy until `MODEL_BASE_URL` is set).

## Resolution

Both fixes are in. The gate's step 5 now runs `pnpm build` and then `docker compose build --quiet app`.
