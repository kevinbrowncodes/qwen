#!/usr/bin/env bash
# tools/deploy/app.test.sh (STORY_037): app.sh deploys only a gated commit, needs both hosts, tags the image with the
# commit, and never prints a key. A throwaway repo with a bare "origin"; dry runs only. Runs in the gate.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
repo="$work/repo"; git init -q --bare "$work/origin.git"
mkdir -p "$repo/tools/deploy" "$repo/app"; cp "$HERE/app.sh" "$repo/tools/deploy/app.sh"; echo x > "$repo/app/page.tsx"
g() { git -C "$repo" -c user.email=t@t -c user.name=t "$@"; }
g init -q -b develop; g add -A; g commit -qm one; g remote add origin "$work/origin.git"; g push -q origin develop
pass=0; fail=0
run() { rc=0; out="$(cd "$repo" && APP_DEPLOY_NO_FETCH=1 APP_DEPLOY_DRY_RUN=1 "$@" 2>&1)" || rc=$?; }
check() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "ok   $2"; else fail=$((fail + 1)); echo "FAIL $2 (exit $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; fi; }
run env -u APP_HOST -u MODEL_HOST tools/deploy/app.sh
[ "$rc" = 64 ] && printf '%s' "$out" | grep -q "no APP_HOST" && check ok "no APP_HOST: refused, naming it" || check no "no APP_HOST"
run env -u MODEL_HOST APP_HOST=app-box tools/deploy/app.sh
[ "$rc" = 64 ] && printf '%s' "$out" | grep -q "no MODEL_HOST" && check ok "no MODEL_HOST: refused, naming it" || check no "no MODEL_HOST"
export APP_HOST=app-box MODEL_HOST=model-box MODEL_API_KEY=k-secret-test
sha="$(g rev-parse HEAD)"
run tools/deploy/app.sh
[ "$rc" = 0 ] && printf '%s' "$out" | grep -q "APP_TAG=${sha:0:12} docker compose -p qwen --env-file ~/qwen-app/.env up -d --build app" \
  && check ok "a pushed commit: the image is tagged with the commit, project qwen, the app's env file" || check no "dry run"
printf '%s' "$out" | grep -q "k-secret-test" && check no "a key was printed" || check ok "no key is printed"
echo y >> "$repo/app/page.tsx"; run tools/deploy/app.sh
[ "$rc" = 65 ] && printf '%s' "$out" | grep -q "uncommitted changes" && check ok "uncommitted changes: refused" || check no "dirty tree"
g commit -qam two; run tools/deploy/app.sh
[ "$rc" = 65 ] && printf '%s' "$out" | grep -q "not on origin/develop" && check ok "a commit not on origin/develop: refused" || check no "unpushed commit"
echo "app.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
