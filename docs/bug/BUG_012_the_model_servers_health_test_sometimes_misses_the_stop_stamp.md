# BUG_012 — The model server's health test sometimes misses the stop stamp, so the gate fails on a change that never touched it

**Status:** Open (2026-10-13)
**Found:** 2026-10-13, in the first gate run for STORY_028's client pieces; the same commit passed the pre-push hook's run minutes later

## Summary

`spark/model-server/src/server.test.ts` › "the watchdog and restarts (STORY_026, BUG_011)" › "says on /health what the worker is busy with and when it last spoke" fails now and then with `expected null to deeply equal Any<String>` at line 337. The commit under test changed only `recon/`, the README, `.env.example` and docs. Two runs of the same tree: one failed, one passed.

## Steps to Reproduce

1. `tools/gate/run.sh test` on commit `66f139b` (or any commit since STORY_026 landed), several times.
2. Watch the model server's lane: most runs pass 109 of 109; a run fails this one case at `server.test.ts:337`.

The failing run's output (2026-10-13, 17:59:57, 9.23 s):

```
FAIL src/server.test.ts > the watchdog and restarts (STORY_026, BUG_011) > says on /health what the worker is busy with and when it last spoke
AssertionError: expected null to deeply equal Any<String>
  335|     await until(async () => heard(await health()) > heard(first));
  336|     await fetch(`${base}/jobs/${a}`, { method: "DELETE" });
  337|     expect(((await health())["job"] as Json)["stopRequestedAt"]).toEqual(expect.any(String));
```

## Expected vs Actual

- **Expected:** the test proves that `/health` reports a stop request while the worker is still on the stopped job, and it does so every run.
- **Actual:** the one `/health` read after the DELETE sometimes finds `stopRequestedAt` null, and the lane fails, taking the gate with it, on a change that never touched the model server.

## Root Cause

Likely, read in `spark/model-server/src/server.ts` on 2026-10-13 and not yet proven by a run that prints the timing: the DELETE handler stamps `stopRequestedAt` (line 364) only while the job is the current one, and the stamp is cleared (line 201) when the worker moves on. The test's `start()` uses the fast cancel settings, and a second job ("waiting") is queued, so when the stop completes before the test's single `/health` read, `job` is already the next job with a null stamp, which is exactly what the failing run received. The test asserts an intermediate state through one read with no wait, which [CLAUDE.md → §6b](../../CLAUDE.md#6b-e2e-test-conventions) warns against for e2e and which bites here in a unit lane too.

## Acceptance Criteria

- [ ] The case waits for the stamp the way the lines around it wait (`until(...)`), or reads it from a response the DELETE itself returns, so it proves the behaviour without depending on the stop taking longer than one read.
- [ ] Six consecutive `tools/gate/run.sh test` runs pass the model server's lane (the repo's own bar for a flake, [CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over)).
- [ ] The fix is attributed with an A/B against the stashed baseline before it lands, and the case keeps proving that `/health` reports the stop request while the stopped job is current.

## Notes

- Not fixed in the session that found it: the change on the table was STORY_028's, and this test belongs to STORY_026. The push that found it was gated green by the hook's own run of the same six steps, so nothing shipped on red; the first run's failure was in the background log, and the chain that committed did not stop on it. That is the second thing this ticket is for: a gate run whose exit code is piped away is not a gate.
