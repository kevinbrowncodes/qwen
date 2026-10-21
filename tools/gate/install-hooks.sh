#!/usr/bin/env bash
# tools/gate/install-hooks.sh (STORY_008, BUG_017): point git at the main checkout's .husky/_ by ABSOLUTE path, so the
# pre-push hook runs in every worktree too. husky sets the relative `.husky/_`, which git resolves inside each worktree,
# where nothing was generated: a push from a worktree then ran no hook at all (BUG_017). The repository's config is
# shared by its worktrees, so one absolute path covers them all; husky's shim then runs the main checkout's
# .husky/pre-push, which gates the pushing worktree's own commit. Runs after `husky` in the root `prepare` script, so
# every `pnpm install` keeps it. Outside a git checkout (the gate host's copy of the tree) it does nothing. Idempotent.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
git -C "$ROOT" rev-parse --git-dir > /dev/null 2>&1 || exit 0
main="$(cd "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
[ -d "$main/.husky/_" ] || { echo "[hooks] $main/.husky/_ missing: run pnpm install in $main (husky generates it)"; exit 1; }
git -C "$ROOT" config core.hooksPath "$main/.husky/_"
echo "[hooks] core.hooksPath=$(git -C "$ROOT" config core.hooksPath)"
