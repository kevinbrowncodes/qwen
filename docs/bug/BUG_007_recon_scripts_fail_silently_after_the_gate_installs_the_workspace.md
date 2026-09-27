# BUG_007 — Recon scripts fail silently after the gate has installed the workspace

**Status:** Resolved (2026-09-27)
**Found in:** running `recon/run.sh harvest 2026-09-26` to add the logo (STORY_003's last AC)

## Summary

`recon/run.sh harvest` printed nothing and exited 1. Its container installs the workspace with pnpm from `recon/.cache/pnpm-store`, while the gate (STORY_005 onward) installs the same `node_modules` from its own `/pnpm-store` volume. When the two stores disagree, pnpm asks before removing `node_modules`. It has no terminal to ask on, so it aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, and `--reporter=silent` hid even that.

## Steps to Reproduce

1. Run `tools/gate/run.sh`, which installs the workspace from the gate's store.
2. Run `recon/run.sh harvest 2026-09-26`.
3. The script exits 1 with no output.

## Expected vs Actual Behaviour

- **Expected:** the recon step runs, or says why it cannot.
- **Actual:** exit 1 and silence.

## Root Cause

Two installers share one `node_modules`, and one of them runs non-interactively with its errors silenced. It is the same class of fault as BUG_004.

## Acceptance Criteria

- [x] The recon container sets `CI=true`, so pnpm replaces `node_modules` without asking.
- [x] A failed install prints its log and exits non-zero.
- [x] `recon/run.sh harvest 2026-09-26` runs after a gate run.

## Resolution

Fixed in `recon/compose.yaml` and `recon/run.sh`. The two installers still replace each other's `node_modules` (a slower first run after switching), which is correct but not fast. Running recon in the gate image would remove that, and it is left as it is.
