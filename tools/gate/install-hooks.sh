#!/usr/bin/env bash
# tools/gate/install-hooks.sh (STORY_008): point git at .husky/_ (what `husky` does during pnpm install inside the gate
# container), for a clone where that has not happened. Idempotent. The host needs only git.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -d "$ROOT/.husky/_" ] || { echo "[hooks] .husky/_ missing: run tools/gate/run.sh once (pnpm install generates it)"; exit 1; }
git -C "$ROOT" config core.hooksPath .husky/_
echo "[hooks] core.hooksPath=$(git -C "$ROOT" config core.hooksPath)"
