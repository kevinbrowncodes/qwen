# BUG_018 — The model server's health test fails when the gate is busy

**Status:** Resolved (2026-10-22)
**Found:** 2026-10-22, by the assistant, pushing STORY_038: the pre-push gate failed at step 3 twice on `spark/model-server/src/server.test.ts`, in code the story does not touch.

## Summary

"says on /health what the worker is busy with and when it last spoke" asserts that `/health`, read right after a `DELETE`, shows the stop on the running job. The job it stops is the fake worker's "slow" prompt, which answers a stop within one 5 ms step. When the gate machine is loaded (the app's unit lane runs beside it), the next `/health` arrives after the server has ended that job and started the waiting one, whose `stopRequestedAt` is `null`.

## Steps to Reproduce

On the Mac Studio 2025: `tools/gate/remote.sh --commit 8b47ea8 test` (STORY_038's commit, with two more app test files beside it). It failed 2 runs of 3, and both pushes of that commit; `1375be2` passed 3 of 3 on the same host. The diff between them touches only `app/`.

## Expected vs Actual Behaviour

**Expected:** the test passes whatever else the gate is running.

**Actual:** `AssertionError: expected null to deeply equal Any<String>` at the `stopRequestedAt` reading.

## Root Cause

A race in the test: the reading after `DELETE` assumes the stopped job is still the current one, but the fake worker's "slow" job ends within about 5 ms of the stop.

## Acceptance Criteria

- [x] The test stops a job that keeps running after the stop (the fake worker's "deaf", about a second), so the reading after `DELETE` sees the stop whatever the load, and the test still waits for the job to end.
- [x] The gate's test step passes three runs in a row on the commit that carries the fix.

## Resolution

2026-10-22: the test's job is "deaf" instead of "slow" (`spark/model-server/src/server.test.ts`). The server's code is unchanged.
