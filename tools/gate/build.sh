#!/usr/bin/env bash
# tools/gate/build.sh — build the gate image (qwen/gate). Idempotent through docker's layer cache.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SPARK_UID="$(id -u)"; SPARK_GID="$(id -g)"
export SPARK_UID SPARK_GID
command -v docker > /dev/null || { echo "[gate] ERROR: docker is required" >&2; exit 1; }
echo "[gate] building qwen/gate (uid:gid $SPARK_UID:$SPARK_GID)"
docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" build gate
docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" run --rm --no-deps -T gate bash -c 'echo "[gate] node $(node --version)  pnpm $(pnpm --version)  playwright browsers: $(ls /ms-playwright | tr "\n" " ")"'
