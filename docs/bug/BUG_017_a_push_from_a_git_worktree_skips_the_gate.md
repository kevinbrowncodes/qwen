# BUG_017 — A push from a git worktree skips the gate

**Status:** Resolved (2026-10-21)
**Found:** 2026-10-20, by the assistant, while running STORY_034's manual check 3. A deliberately broken commit pushed from a `git worktree` to a scratch bare repository went through with no `[pre-push]` line. Only the scratch repository received it; `origin` was never involved.

## Summary

The pre-push hook runs only in a checkout where `pnpm install` has generated `.husky/_`. `core.hooksPath` is the relative path `.husky/_`, and git resolves it against the top of whichever checkout is pushing. A `git worktree` (or a fresh clone before `pnpm install`) has no `.husky/_`, so git finds no hook, and a push to `develop` is not gated at all, without a word. The gap predates STORY_034: the Spark's clone had it too.

## Steps to Reproduce

On the Mac Studio 2025, in the main clone (hook installed):

```bash
git worktree add --detach /tmp/wt HEAD
cd /tmp/wt && echo 'export const broken: number = "x";' >> app/lib/clipboard.ts && git commit -qam broken
git init -q --bare /tmp/bare.git && git push /tmp/bare.git HEAD:refs/heads/develop   # goes through: no [pre-push]
```

## Expected vs Actual Behaviour

**Expected:** the push is gated, as it is from the main clone, where the same commit is refused at step 1 (checked 2026-10-20 with `git commit-tree`, so no worktree was involved).

**Actual:** the push succeeds ungated.

## Root Cause

husky 9 sets `core.hooksPath=.husky/_` (relative) on every `pnpm install`, and `.husky/_` is gitignored and generated per checkout. The repository's config is shared by all its worktrees, but the relative path resolves inside each worktree, where nothing was generated.

## Acceptance Criteria

- [x] A push to `develop` from a worktree of a clone with the hook installed is gated, or refused with a message saying how to gate it. It is never let through silently.
- [x] The fix survives `pnpm install`, which rewrites `core.hooksPath`.
- [x] A gate test proves it, like `tools/gate/pre-push.test.sh` for the main clone.
- [x] CLAUDE.md §4 says how worktrees are gated.

Not fixed in STORY_034, whose criteria cover a clone with the hook installed.

## Resolution (2026-10-21)

- **Fix:**
  - `tools/gate/install-hooks.sh` now sets `core.hooksPath` to the **absolute** path of the main checkout's `.husky/_`, found with `git rev-parse --path-format=absolute --git-common-dir`. The repository's config is shared by its worktrees, so every worktree runs that one shim. husky's shim finds `.husky/pre-push` relative to itself and runs it, and the hook gates the pushing worktree's own commit, because it finds its root with `git rev-parse --show-toplevel`.
  - The root `prepare` script now runs `tools/gate/install-hooks.sh` after `husky`, when the script is present, so every `pnpm install` keeps the absolute path after husky writes the relative one. The production image's install copies only `package.json` files, so there the script is absent and skipped. A first version without that check failed the gate's step 5. Outside a git checkout (the gate host's copy of the tree) the script does nothing, and husky itself exits 0 there.
  - `tools/gate/remote.sh` reads `GATE_HOST` from the main checkout's `.env` when the worktree has none.
- **The gate:** `tools/gate/hooks.test.sh` (4 cases, in step 3) covers:
  - outside git: nothing done, exit 0;
  - the absolute path is set;
  - **a push from a worktree runs the hook, and a refusing hook stops it**;
  - `remote.sh` in a worktree finds `GATE_HOST`.
- **Checked for real** on the Mac Studio 2025: a worktree of this repo committed a deliberate type error and pushed it to a scratch bare repository. The hook gated that commit on the Mac Studio 2022 and refused it at step 1 (`TS2322`), and the bare repository never got a `develop`. `origin` was not involved.
- CLAUDE.md §4 says worktrees are gated.
