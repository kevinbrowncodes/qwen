# BUG_017 — A push from a git worktree skips the gate

**Status:** Open
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

- [ ] A push to `develop` from a worktree of a clone with the hook installed is gated, or refused with a message saying how to gate it. It is never let through silently.
- [ ] The fix survives `pnpm install`, which rewrites `core.hooksPath`.
- [ ] A gate test proves it, like `tools/gate/pre-push.test.sh` for the main clone.
- [ ] CLAUDE.md §4 says how worktrees are gated.

Not fixed in STORY_034, whose criteria cover a clone with the hook installed. Until this is fixed, **push only from the main clone.**
