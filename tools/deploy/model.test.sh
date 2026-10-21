#!/usr/bin/env bash
# tools/deploy/model.test.sh (STORY_036): model.sh deploys only a gated commit (clean, on origin/develop), sends exactly
# the service's files, and its launch agent passes no key. A throwaway repo with a bare "origin"; dry runs only.
# Runs in the gate (the gate package's `test`).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
repo="$work/repo"; git init -q --bare "$work/origin.git"
mkdir -p "$repo/tools/deploy" "$repo/spark/model-server/src" "$repo/spark/model/mlx" "$repo/spark/mac" "$repo/app"
cp "$HERE/model.sh" "$repo/tools/deploy/model.sh"
cp "$HERE/../../spark/mac/com.qwen.model.plist.in" "$repo/spark/mac/"
for f in spark/model-server/src/main.ts spark/model/jobloop.py spark/model/mlxjob.py spark/model/worker_mlx.py spark/model/worker.py \
  spark/model/mlx/pyproject.toml spark/loras.json spark/mac/start.sh app/page.tsx; do echo x > "$repo/$f"; done
g() { git -C "$repo" -c user.email=t@t -c user.name=t "$@"; }
g init -q -b develop; g add -A; g commit -qm one; g remote add origin "$work/origin.git"; g push -q origin develop
pass=0; fail=0
run() { rc=0; out="$(cd "$repo" && MODEL_DEPLOY_NO_FETCH=1 MODEL_DEPLOY_DRY_RUN=1 "$@" 2>&1)" || rc=$?; }
check() { if [ "$1" = ok ]; then pass=$((pass + 1)); echo "ok   $2"; else fail=$((fail + 1)); echo "FAIL $2 (exit $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; fi; }

run env -u MODEL_HOST tools/deploy/model.sh
[ "$rc" = 64 ] && printf '%s' "$out" | grep -q "no MODEL_HOST" && check ok "no MODEL_HOST: refused, naming it" || check no "no MODEL_HOST"

export MODEL_HOST=model-box
run tools/deploy/model.sh
files="$(printf '%s\n' "$out" | sed -n 's/^  //p' | grep -v '^<\|^ ' || true)"
want="spark/loras.json
spark/mac/com.qwen.model.plist.in
spark/mac/start.sh
spark/model-server/src/main.ts
spark/model/jobloop.py
spark/model/mlx/pyproject.toml
spark/model/mlxjob.py
spark/model/worker_mlx.py"
[ "$rc" = 0 ] && [ "$(printf '%s\n' "$files" | grep -E '^(spark|app)/' | sort)" = "$want" ] && check ok "a pushed commit: exactly the service's files (no app/, no worker.py)" || check no "file list"
printf '%s' "$out" | grep -q "/Users/example/qwen-model/app/spark/mac/start.sh" && ! printf '%s' "$out" | grep -qE "EnvironmentVariables|MODEL_API_KEY=" \
  && check ok "the launch agent runs start.sh and passes no key" || check no "launch agent"

echo y >> "$repo/app/page.tsx"
run tools/deploy/model.sh
[ "$rc" = 65 ] && printf '%s' "$out" | grep -q "uncommitted changes" && check ok "uncommitted changes: refused" || check no "dirty tree"
g commit -qam two
run tools/deploy/model.sh
[ "$rc" = 65 ] && printf '%s' "$out" | grep -q "not on origin/develop" && check ok "a commit not on origin/develop: refused" || check no "unpushed commit"
run tools/deploy/model.sh --commit HEAD~1
[ "$rc" = 0 ] && check ok "--commit of a pushed commit deploys it" || check no "--commit pushed"
echo "model.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
