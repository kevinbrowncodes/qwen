# BUG_004 — The gate hides the output of a failing step

**Status:** Resolved (2026-09-26)
**Found in:** STORY_012, while reading a failed gate run's log

## Summary

`tools/gate/run.sh` ran every step as `pnpm run --silent <step>`. A failing lint step printed only `[gate] FAILED at step 2/6: lint`, and the ESLint errors that said why never appeared, even in a log that kept every line. The same thing happened with the intermittent integration failure recorded in STORY_011's Done note: that failure was not only filtered out afterwards; it was never printed.

## Steps to Reproduce

1. Introduce a lint error in the app.
2. Run `tools/gate/run.sh > log 2>&1`.
3. The log has the `[gate]` lines and nothing from ESLint.

## Expected vs Actual Behaviour

- **Expected:** a failing step's own output (the errors, the failing test and its assertion) is in the gate's output.
- **Actual:** it was suppressed. Only the step name and exit code were visible, so every failure had to be rerun by hand to be read.

## Root Cause

`pnpm run --silent` suppresses the script's own output as well as pnpm's banner. It came from the sibling project's `run.sh`, which was copied in STORY_005.

## Acceptance Criteria

- [x] `run.sh` runs each step without `--silent`, so a failing step's output reaches the gate's output and the push hook's.
- [x] `run.test.sh` still passes (its fake steps are unaffected).

## Resolution

Fixed in `tools/gate/run.sh`. The next gate run after the fix printed the failing lint errors in full.
