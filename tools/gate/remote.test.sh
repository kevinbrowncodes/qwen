#!/usr/bin/env bash
# tools/gate/remote.test.sh (STORY_034): exercises remote.sh without a network. A throwaway git repo holds a copy of
# remote.sh and a fake run.sh; a fake `ssh` runs the remote half locally with HOME pointed at a fake gate host, so the
# unpacking, the node_modules carry-over, the lock and the exit codes are the real ones. Runs in the gate (`pnpm test`).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok   $1"; }
bad() { fail=$((fail + 1)); echo "FAIL $1"; [ -z "${2:-}" ] || printf '%s\n' "$2" | sed 's/^/     /'; }

# The fake gate host's side: ssh -o … -o … -o … <host> <command> runs <command> here, with HOME = $work/host.
mkdir -p "$work/bin" "$work/host"
cat > "$work/bin/ssh" <<'FAKE'
#!/usr/bin/env bash
while [ "$1" = "-o" ]; do shift 2; done
echo "$1" > "$FAKE_LOG.host"; shift
printf '%s\n' "$1" > "$FAKE_LOG.cmd"
[ -z "${FAKE_SSH_RC:-}" ] || { cat > /dev/null; exit "$FAKE_SSH_RC"; }
docker() { [ "$1 $2" != "image inspect" ] || [ -z "${FAKE_NO_IMAGE:-}" ]; }
export -f docker
HOME="$FAKE_HOME" bash -c "$1"
FAKE
chmod +x "$work/bin/ssh"

# A throwaway repo: tracked files, an ignored .env, outputs and node_modules, the scripts under test.
repo="$work/repo"
mkdir -p "$repo/tools/gate" "$repo/app" "$repo/outputs" "$repo/node_modules/a"
cp "$HERE/remote.sh" "$repo/tools/gate/remote.sh"
cat > "$repo/tools/gate/run.sh" <<'FAKE'
#!/usr/bin/env bash
IMAGE="qwen/gate:test"
printf '%s\n' "$*" > "$HOME/run-args"; pwd > "$HOME/run-pwd"
exit "${FAKE_RUN_RC:-0}"
FAKE
printf '#!/usr/bin/env bash\ntouch "$HOME/built"\n' > "$repo/tools/gate/build.sh"
chmod +x "$repo/tools/gate/"*.sh
printf '.env\noutputs/\nnode_modules/\n!.env.example\n' > "$repo/.gitignore"
echo "committed" > "$repo/app/page.txt"
echo "GATE_HOST=" > "$repo/.env.example"
git -C "$repo" init -q && git -C "$repo" add -A && git -C "$repo" -c user.email=t@t -c user.name=t commit -qm one
echo "GATE_HOST=gate-box" > "$repo/.env"; echo png > "$repo/outputs/x.png"; echo js > "$repo/node_modules/a/index.js"
echo "untracked" > "$repo/app/new.txt"

run() {  # run [remote.sh args...]: output in $out, exit code in $rc
  rc=0
  out="$(PATH="$work/bin:$PATH" FAKE_LOG="$work/log" FAKE_HOME="$work/host" "$repo/tools/gate/remote.sh" "$@" 2>&1)" || rc=$?
}
tree="$work/host/qwen-gate/tree"

# 1. What is sent from the working tree: tracked + untracked kept files, never ignored ones or .git.
run
if [ "$rc" = 0 ] && [ -f "$tree/app/page.txt" ] && [ -f "$tree/app/new.txt" ] && [ -f "$tree/.env.example" ] \
  && [ ! -e "$tree/.env" ] && [ ! -e "$tree/outputs" ] && [ ! -e "$tree/node_modules" ] && [ ! -e "$tree/.git" ]; then
  ok "the working tree is sent without .env, outputs/, node_modules/ or .git"
else bad "working-tree contents (exit $rc)" "$out$(cd "$tree" 2>/dev/null && find . | sort)"; fi
[ "$(cat "$work/log.host")" = "gate-box" ] && ok "the host comes from GATE_HOST in .env" || bad "host from .env: $(cat "$work/log.host")"
[ "$(cat "$work/host/run-pwd")" = "$tree" ] && ok "run.sh runs in the gate host's tree" || bad "run.sh ran in $(cat "$work/host/run-pwd")"

# 2. Commit mode sends the commit, not the working tree.
echo "edited" > "$repo/app/page.txt"
run --commit HEAD
if [ "$rc" = 0 ] && [ "$(cat "$tree/app/page.txt")" = "committed" ] && [ ! -e "$tree/app/new.txt" ]; then
  ok "--commit HEAD sends the commit: the uncommitted edit and the untracked file are absent"
else bad "commit mode (exit $rc)" "$out"; fi
printf '%s' "$out" | grep -q "gating commit " && ok "the output says a commit is gated" || bad "commit label" "$out"

# 3. Arguments pass through to run.sh.
run --from 4
[ "$(cat "$work/host/run-args")" = "--from 4" ] && ok "--from 4 reaches run.sh" || bad "args: $(cat "$work/host/run-args")"
run lint build
[ "$(cat "$work/host/run-args")" = "lint build" ] && ok "step names reach run.sh" || bad "args: $(cat "$work/host/run-args")"

# 4. The tree's node_modules folders survive a run; stale files do not.
mkdir -p "$tree/app/node_modules/x" && echo keep > "$tree/app/node_modules/x/m" && echo stale > "$tree/stale.txt"
run
if [ -f "$tree/app/node_modules/x/m" ] && [ ! -e "$tree/stale.txt" ]; then ok "node_modules is kept and a stale file is removed"
else bad "carry-over" "$(cd "$tree" && find . | sort)"; fi

# 5. Exit codes come back; a host that does not answer is said so; the lock is released after a failure.
FAKE_RUN_RC=3 run
[ "$rc" = 3 ] && [ ! -e "$work/host/qwen-gate/lock" ] && ok "run.sh's exit 3 comes back and the lock is released" || bad "exit code $rc"
FAKE_SSH_RC=255 run
[ "$rc" = 255 ] && printf '%s' "$out" | grep -q "did not answer" && ok "an unreachable host refuses with 'did not answer'" || bad "unreachable (exit $rc)" "$out"

# 6. One gate at a time: a live lock refuses; a stale one is cleared.
mkdir -p "$work/host/qwen-gate/lock"; echo $$ > "$work/host/qwen-gate/lock/pid"; echo "2026-10-20 21:00:00 EDT" > "$work/host/qwen-gate/lock/started"
run
[ "$rc" = 75 ] && printf '%s' "$out" | grep -q "already running .* since 2026-10-20 21:00:00 EDT" && ok "a running gate's lock refuses a second" || bad "live lock (exit $rc)" "$out"
echo 999999 > "$work/host/qwen-gate/lock/pid"
run
[ "$rc" = 0 ] && ok "a lock whose run has ended is cleared" || bad "stale lock (exit $rc)" "$out"

# 7. A missing gate image is built once, then the gate runs.
rm -f "$work/host/built"
FAKE_NO_IMAGE=1 run
[ "$rc" = 0 ] && [ -f "$work/host/built" ] && printf '%s' "$out" | grep -q "building it once" && ok "a missing gate image is built" || bad "image build (exit $rc)" "$out"

# 8. No host: nothing is sent, and the message names GATE_HOST.
rm -f "$repo/.env" "$work/log.host"
run
[ "$rc" = 64 ] && [ ! -e "$work/log.host" ] && printf '%s' "$out" | grep -q "GATE_HOST" && ok "no GATE_HOST stops before ssh, naming GATE_HOST" || bad "no host (exit $rc)" "$out"

# 9. The dry run lists exactly what would be sent.
dry="$(GATE_HOST=x GATE_REMOTE_DRY_RUN=1 "$repo/tools/gate/remote.sh" 2>&1)"
if printf '%s\n' "$dry" | grep -qx "  app/new.txt" && ! printf '%s\n' "$dry" | grep -qE "^  (\.env|outputs/.*|node_modules/.*|\.git/.*)$"; then
  ok "the dry run lists kept files only"
else bad "dry run" "$dry"; fi

echo "remote.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
