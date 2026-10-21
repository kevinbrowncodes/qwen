#!/usr/bin/env bash
# tools/gate/pre-push.test.sh (STORY_034): the pre-push hook on a Mac without Docker. It gates exactly the pushed commit
# on GATE_HOST (remote.sh --commit <sha>), keeps run.sh where Docker exists, and never lets a push to develop through
# ungated. GATE_DOCKER stands in for the docker probe; GATE_RUN / GATE_REMOTE for the runners. Runs in the gate.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hook="$HERE/../../.husky/pre-push"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cat > "$work/runner" <<'FAKE'
#!/usr/bin/env bash
printf '%s %s\n' "$(basename "$0")" "$*" >> "$RAN_LOG"
exit "${RUNNER_RC:-0}"
FAKE
chmod +x "$work/runner"; cp "$work/runner" "$work/remote"; cp "$work/runner" "$work/local"
pass=0; fail=0
check() {  # check <description> <expected-exit> <expected-log ("" for none)> <docker-probe> <remote-ref> [env...]
  local desc="$1" want_exit="$2" want_log="$3" probe="$4" ref="$5" rc=0 out; shift 5
  : > "$work/ran"
  out="$(printf 'refs/heads/x abc123 %s 2222\n' "$ref" | env "$@" RAN_LOG="$work/ran" GATE_RUN="$work/local" GATE_REMOTE="$work/remote" GATE_DOCKER="$probe" sh "$hook" 2>&1)" || rc=$?
  local got; got="$(cat "$work/ran")"
  if [ "$rc" = "$want_exit" ] && [ "$got" = "$want_log" ]; then pass=$((pass + 1)); echo "ok   $desc"
  else fail=$((fail + 1)); echo "FAIL $desc (exit $rc, ran: '$got')"; printf '%s\n' "$out" | sed 's/^/     /'; fi
  last_out="$out"
}
check "no Docker: a push to develop gates the pushed commit on the gate host" 0 "remote --commit abc123" no-such-docker refs/heads/develop
check "with Docker: run.sh runs here, as before" 0 "local " sh refs/heads/develop
check "a push to another branch runs nothing" 0 "" no-such-docker refs/heads/feature/x
check "no Docker and a failing remote gate refuses the push" 1 "remote --commit abc123" no-such-docker refs/heads/develop RUNNER_RC=2
if printf '%s' "$last_out" | grep -q "push refused. Every push to develop is gated"; then pass=$((pass + 1)); echo "ok   the refusal states the rule and the fix"
else fail=$((fail + 1)); echo "FAIL refusal message: $last_out"; fi
# The real remote.sh without a host (a copy in a folder with no .env): refused before anything is sent.
mkdir -p "$work/repo/tools/gate" && cp "$HERE/remote.sh" "$HERE/run.sh" "$work/repo/tools/gate/"
rc=0; out="$(printf 'refs/heads/x abc123 refs/heads/develop 2222\n' \
  | env -u GATE_HOST GATE_DOCKER=no-such-docker GATE_REMOTE="$work/repo/tools/gate/remote.sh" sh "$hook" 2>&1)" || rc=$?
if [ "$rc" = 1 ] && printf '%s' "$out" | grep -q "GATE_HOST"; then pass=$((pass + 1)); echo "ok   no Docker and no GATE_HOST refuses the push, naming GATE_HOST"
else fail=$((fail + 1)); echo "FAIL no host (exit $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; fi
echo "pre-push.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
