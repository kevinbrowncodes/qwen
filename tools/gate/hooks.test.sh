#!/usr/bin/env bash
# tools/gate/hooks.test.sh (BUG_017): a push to develop from a git WORKTREE runs the pre-push hook, as one from the main
# checkout does, and remote.sh in a worktree reads the main checkout's .env. A throwaway repo whose hook is a fake that
# records it ran and refuses; install-hooks.sh is the real one. Runs in the gate (`pnpm test`).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok   $1"; }
bad() { fail=$((fail + 1)); echo "FAIL $1"; [ -z "${2:-}" ] || printf '%s\n' "$2" | sed 's/^/     /'; }

# Outside a git checkout (the gate host's copy) install-hooks.sh does nothing and succeeds.
mkdir -p "$work/plain/tools/gate" && cp "$HERE/install-hooks.sh" "$work/plain/tools/gate/"
out="$(bash "$work/plain/tools/gate/install-hooks.sh" 2>&1)" && [ -z "$out" ] && ok "outside a git checkout: nothing to do, exit 0" || bad "outside git" "$out"

repo="$work/repo"; git init -q --bare "$work/bare.git"
mkdir -p "$repo/tools/gate" "$repo/.husky/_"
cp "$HERE/install-hooks.sh" "$HERE/remote.sh" "$HERE/run.sh" "$repo/tools/gate/"
printf '#!/bin/sh\necho "$PWD" >> "%s/ran"\nexit 1\n' "$work" > "$repo/.husky/_/pre-push"; chmod +x "$repo/.husky/_/pre-push"
printf '.husky/_/\n.env\n' > "$repo/.gitignore"; echo x > "$repo/file"
g() { git -C "$1" -c user.email=t@t -c user.name=t "${@:2}"; }
g "$repo" init -q -b develop; g "$repo" add -A; g "$repo" commit -qm one
out="$(bash "$repo/tools/gate/install-hooks.sh" 2>&1)"
want="$(cd "$repo" && pwd -P)/.husky/_"
[ "$(git -C "$repo" config core.hooksPath)" = "$want" ] && ok "core.hooksPath is the main checkout's absolute .husky/_" || bad "hooksPath" "$out"

g "$repo" worktree add -q --detach "$work/wt" HEAD
echo y > "$work/wt/file"; g "$work/wt" commit -qam two
rm -f "$work/ran"; rc=0
(cd "$work/wt" && git push -q "$work/bare.git" HEAD:refs/heads/develop) > /dev/null 2>&1 || rc=$?
if [ -f "$work/ran" ] && [ "$rc" != 0 ] && ! git -C "$work/bare.git" rev-parse --verify -q develop > /dev/null; then
  ok "a push from a worktree runs the hook, and a refusing hook stops it"
else bad "worktree push (exit $rc, hook ran: $([ -f "$work/ran" ] && echo yes || echo no))"; fi

printf 'GATE_HOST=main-box\n' > "$repo/.env"
dry="$(cd "$work/wt" && GATE_REMOTE_DRY_RUN=1 env -u GATE_HOST bash tools/gate/remote.sh 2>&1 | sed -n 's/^host: //p')"
[ "$dry" = "main-box" ] && ok "remote.sh in a worktree reads GATE_HOST from the main checkout's .env" || bad "worktree .env: '$dry'"
echo "hooks.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
