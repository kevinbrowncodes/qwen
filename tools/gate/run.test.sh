#!/usr/bin/env bash
# tools/gate/run.test.sh — exercises run.sh's sequencing without docker (STORY_005): a step that fails stops the run
# with that step named in the last line and its number as the exit code; --from skips earlier steps; named steps run in
# gate order. Runs in the gate as part of `pnpm test` (package "gate").
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fake="$(mktemp)"
trap 'rm -f "$fake"' EXIT
cat > "$fake" <<'FAKE'
#!/usr/bin/env bash
echo "fake-step $1"
[ "$1" != "${FAIL_STEP:-}" ]
FAKE
chmod +x "$fake"
pass=0; fail=0
check() {  # check <description> <expected-exit> <expected-last-line-regex> [run.sh args...]
  local desc="$1" want_exit="$2" want_last="$3"; shift 3
  local out rc=0
  out="$(GATE_DRY_RUN="$fake" "$HERE/run.sh" "$@" 2>&1)" || rc=$?
  local last; last="$(printf '%s\n' "$out" | tail -n 1)"
  if [ "$rc" = "$want_exit" ] && printf '%s' "$last" | grep -qE "$want_last"; then
    pass=$((pass + 1)); echo "ok   $desc"
  else
    fail=$((fail + 1)); echo "FAIL $desc (exit $rc, last line: $last)"; printf '%s\n' "$out" | sed 's/^/     /'
  fi
}
check "all steps pass" 0 'all requested steps green'
FAIL_STEP=lint check "a failing lint stops the run at 2/6 with lint named" 2 'FAILED at step 2/6: lint'
FAIL_STEP=test:e2e check "a failing e2e exits 6" 6 'FAILED at step 6/6: test:e2e'
FAIL_STEP=typecheck check "--from 3 skips typecheck and lint" 0 'all requested steps green' --from 3
FAIL_STEP=lint check "named steps run in gate order (build then lint fails second)" 2 'FAILED at step 2/6: lint' build lint
out="$(GATE_DRY_RUN="$fake" "$HERE/run.sh" build lint 2>&1 || true)"
if printf '%s\n' "$out" | grep 'fake-step' | sed -n '1p' | grep -q 'fake-step lint'; then pass=$((pass + 1)); echo "ok   gate order puts lint before build"; else fail=$((fail + 1)); echo "FAIL gate order"; fi
# The pre-push hook (STORY_008): the gate runs only for a push to develop, and a failing gate refuses the push.
hook="$HERE/../../.husky/pre-push"
ran="$(mktemp)"; trap 'rm -f "$fake" "$ran"' EXIT
cat > "$fake" <<'FAKE'
#!/usr/bin/env bash
echo ran >> "$RAN_LOG"
[ -z "${GATE_FAILS:-}" ]
FAKE
hook_check() {  # hook_check <description> <expected-exit> <expected-runs> <remote-ref>
  local desc="$1" want_exit="$2" want_runs="$3" ref="$4" rc=0
  : > "$ran"
  printf 'refs/heads/x 1111 %s 2222\n' "$ref" | RAN_LOG="$ran" GATE_RUN="$fake" sh "$hook" > /dev/null 2>&1 || rc=$?
  local runs; runs="$(wc -l < "$ran" | tr -d ' ')"
  if [ "$rc" = "$want_exit" ] && [ "$runs" = "$want_runs" ]; then pass=$((pass + 1)); echo "ok   $desc"; else fail=$((fail + 1)); echo "FAIL $desc (exit $rc, gate runs $runs)"; fi
}
hook_check "a push to develop runs the gate" 0 1 refs/heads/develop
hook_check "a push to another branch does not" 0 0 refs/heads/feature
GATE_FAILS=1 hook_check "a failing gate refuses the push" 1 1 refs/heads/develop
echo "run.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
