#!/usr/bin/env bash
# spark/mac/start.test.sh (STORY_036): start.sh's memory check and environment, with a fake vm_stat and a fake node.
# Runs in the gate (the gate package's `test`).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
base="$work/qwen-model"
mkdir -p "$base/app/spark/model-server/src" "$base/models/Qwen-Image-2.1" "$base/models/loras" "$work/bin"
touch "$base/models/Qwen-Image-2.1/model_index.json"
printf 'MODEL_API_KEY=k-test\n' > "$base/.env"
vm() {  # vm <free pages> <inactive pages>: a fake vm_stat with 16 KiB pages
  printf '#!/usr/bin/env bash\necho "Mach Virtual Memory Statistics: (page size of 16384 bytes)"\necho "Pages free:                               %s."\necho "Pages active:                             900000."\necho "Pages inactive:                           %s."\necho "Pages speculative:                        0."\necho "Pages purgeable:                          0."\n' "$1" "$2" > "$work/bin/vm_stat"
  chmod +x "$work/bin/vm_stat"
}
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$PWD" "$HOST:$PORT" "$WEIGHTS" "$LORA_DIR" "$OUTPUT_DIR" "$WORKER" "key=${MODEL_API_KEY:+set}" > "$RAN"\n' > "$work/bin/node"
chmod +x "$work/bin/node"
printf '#!/usr/bin/env bash\nexit 0\n' > "$work/bin/uv"; chmod +x "$work/bin/uv"
pass=0; fail=0
run() { rc=0; out="$(PATH="$work/bin:$PATH" QWEN_MODEL_HOME="$base" VM_STAT="$work/bin/vm_stat" NODE="$work/bin/node" RAN="$work/ran" bash "$HERE/start.sh" 2>&1)" || rc=$?; }

vm 1000000 1621440   # (1000000 + 1621440) * 16 KiB = 40 GiB
rm -f "$work/ran"; run
if [ "$rc" = 1 ] && [ ! -e "$work/ran" ] && printf '%s' "$out" | grep -q "only 40 GiB available" && printf '%s' "$out" | grep -q "Do not stop the owner's other services"; then
  pass=$((pass + 1)); echo "ok   40 GiB available: refused, with the figure, and nothing stopped"
else fail=$((fail + 1)); echo "FAIL 40 GiB (exit $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; fi

vm 2000000 1932160   # 60 GiB
rm -f "$work/ran"; run
if [ "$rc" = 0 ] && [ -f "$work/ran" ]; then
  got="$(cat "$work/ran")"
  if printf '%s' "$got" | grep -qx "$base/app/spark/model-server" && printf '%s' "$got" | grep -qx "0.0.0.0:4120" \
    && printf '%s' "$got" | grep -qx "$base/models/Qwen-Image-2.1" && printf '%s' "$got" | grep -qx "key=set" \
    && printf '%s' "$got" | grep -q "run --project $base/app/spark/model/mlx --frozen python $base/app/spark/model/worker_mlx.py"; then
    pass=$((pass + 1)); echo "ok   60 GiB available: node starts in the model server with the worker, the weights and the key"
  else fail=$((fail + 1)); echo "FAIL environment"; printf '%s\n' "$got" | sed 's/^/     /'; fi
else fail=$((fail + 1)); echo "FAIL 60 GiB (exit $rc)"; printf '%s\n' "$out" | sed 's/^/     /'; fi
if printf '%s' "$out" | grep -q "k-test"; then fail=$((fail + 1)); echo "FAIL the key was printed"; else pass=$((pass + 1)); echo "ok   the key is never printed"; fi

rm "$base/models/Qwen-Image-2.1/model_index.json"; rm -f "$work/ran"; run
if [ "$rc" = 1 ] && [ ! -e "$work/ran" ] && printf '%s' "$out" | grep -q "no weights"; then pass=$((pass + 1)); echo "ok   no weights: refused"
else fail=$((fail + 1)); echo "FAIL no weights (exit $rc)"; fi
echo "start.test.sh: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
