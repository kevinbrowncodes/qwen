#!/usr/bin/env bash
# tools/gate/run.sh — run the gate steps of CLAUDE.md §4 inside the gate container, in order, stopping at the first failure.
#
#   tools/gate/run.sh                 all six steps
#   tools/gate/run.sh lint build      only the named steps, in gate order
#   tools/gate/run.sh --from 4        steps 4..6 (after a fix)
#
# Step 0 (always): pnpm install --frozen-lockfile, so node_modules in the bind mount match the lockfile.
# Step 5 also builds the production image (BUG_003). Steps whose root script does not exist yet print "no lane yet"
# and pass (STORY_005).
# GATE_DRY_RUN=<command>: run "<command> <step>" instead of the container (for run.test.sh only).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SPARK_UID="$(id -u)"; SPARK_GID="$(id -g)"
export SPARK_UID SPARK_GID
IMAGE="qwen/gate:1.63.0-node26"

STEPS=(typecheck lint test test:integration build test:e2e)
from=1
want=()
while [ $# -gt 0 ]; do
  case "$1" in
    --from) from="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) want+=("$1"); shift ;;
  esac
done

compose() { docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" "$@"; }
gate() { compose run --rm --no-deps -T gate "$@"; }
log() { printf '[gate] %s\n' "$*"; }
has_script() { python3 -c 'import json,sys; sys.exit(0 if sys.argv[1] in json.load(open(sys.argv[2])).get("scripts", {}) else 1)' "$1" "$ROOT/package.json"; }
run_step() {  # run_step <step>; returns the step's status explicitly (an if-statement's status is not a step's status)
  local rc=0
  if [ -n "${GATE_DRY_RUN:-}" ]; then
    "$GATE_DRY_RUN" "$1" || rc=$?
  else
    # Not --silent: it swallows a failing step's own output (BUG_004).
    gate pnpm run "$1" || rc=$?
  fi
  if [ "$rc" -eq 0 ] && [ "$1" = "build" ] && [ -z "${GATE_DRY_RUN:-}" ]; then
    # BUG_003: a change can pass `pnpm build` in the bind mount and still break the production image.
    log "5/6 build: production image (docker compose build app)"
    compose build --quiet app || rc=$?
  fi
  return "$rc"
}
rank_coverage() {  # rank_coverage <step> (STORY_008): the files with the most uncovered branches, when a lane with floors fails
  [ -z "${GATE_DRY_RUN:-}" ] || return 0
  local summary
  case "$1" in
    test) summary="app/coverage/coverage-summary.json" ;;
    test:integration) summary="app/coverage-integration/coverage-summary.json" ;;
    *) return 0 ;;
  esac
  [ -f "$ROOT/$summary" ] || return 0
  log "coverage: files with the most uncovered branches:"
  gate node tools/gate/src/coverage-rank.ts "$summary" 8 2>/dev/null | sed 's/^/[gate]   /' || true
}

t0=$(date +%s)
if [ -z "${GATE_DRY_RUN:-}" ]; then
  docker image inspect "$IMAGE" > /dev/null 2>&1 || { log "ERROR: gate image missing; run tools/gate/build.sh"; exit 1; }
  log "0/6 install (pnpm install --frozen-lockfile)"
  gate pnpm install --frozen-lockfile --prefer-offline > /dev/null
fi

n=0
for step in "${STEPS[@]}"; do
  n=$((n + 1))
  [ "$n" -ge "$from" ] || continue
  if [ ${#want[@]} -gt 0 ]; then
    printf '%s\n' "${want[@]}" | grep -qx "$step" || continue
  fi
  ts=$(date +%s)
  if [ -z "${GATE_DRY_RUN:-}" ] && ! has_script "$step"; then
    log "$n/6 $step: no lane yet (script not defined in package.json), passing"
    continue
  fi
  log "$n/6 $step"
  if ! run_step "$step"; then
    rank_coverage "$step"
    log "FAILED at step $n/6: $step (after $(( $(date +%s) - ts ))s)"
    exit "$n"
  fi
  log "$n/6 $step ok in $(( $(date +%s) - ts ))s"
done
log "all requested steps green in $(( $(date +%s) - t0 ))s"
