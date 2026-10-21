#!/usr/bin/env bash
# tools/deploy/migrate-from-spark.sh (STORY_037): the one-time move of the owner's history and images off the DGX Spark,
# run from the Mac Studio 2025 after tools/deploy/model.sh and tools/deploy/app.sh have deployed both sides.
#
#   1. history: the Spark's qwen_app-data volume's history.json -> the app on APP_HOST (/data/history.json). Refused when
#      the app's history already holds entries, so nothing made on the new setup is overwritten.
#   2. images: the Spark's spark/data/outputs PNGs -> MODEL_HOST's ~/qwen-model/data/outputs (never overwriting a file),
#      and its jobs.json merged into the model server's (merge-index-cli.ts: that side's entries win on an id clash).
#      The model server is stopped for the merge and started again; refused while it is busy.
#   3. check: every finished history entry's image is fetched through the app; the counts are printed.
# SPARK_HOST, APP_HOST, MODEL_HOST: ssh destinations, from the environment or .env. Nothing on the Spark is changed.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
log() { printf '[migrate] %s\n' "$*"; }
env_get() { if [ -n "${!1:-}" ]; then printf '%s' "${!1}"; elif [ -f "$ROOT/.env" ]; then sed -n "s/^$1=//p" "$ROOT/.env" | tail -n 1 | tr -d "\"'\r"; fi; }
spark="$(env_get SPARK_HOST)"; app="$(env_get APP_HOST)"; model="$(env_get MODEL_HOST)"
for v in SPARK_HOST APP_HOST MODEL_HOST; do [ -n "$(env_get $v)" ] || { log "ERROR: no $v (an ssh destination, in the environment or .env)"; exit 64; }; done
SPARK_REPO="${SPARK_REPO:-Documents/GitHub/kevinbrowncodes/qwen}"
on() { local h="$1"; shift; ssh -T -o BatchMode=yes "$h" "export PATH=/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:\$PATH; $*"; }
count() { python3 -c 'import json,sys; t=sys.stdin.read().strip(); print(len(json.loads(t)) if t else 0)'; }

# 1. History.
have="$(on "$app" 'docker exec qwen-app sh -c "cat /data/history.json 2>/dev/null || true"' | count)"
if [ "$have" != 0 ]; then
  log "ERROR: the app on $app already has $have history entries; refusing to overwrite them. Nothing was changed."
  exit 65
fi
history="$(on "$spark" 'docker run --rm --entrypoint cat -v qwen_app-data:/data:ro qwen/app:dev /data/history.json')"
n="$(printf '%s' "$history" | count)"
[ "$n" -gt 0 ] || { log "ERROR: the Spark's history is empty or unreadable"; exit 66; }
printf '%s\n' "$history" | on "$app" 'docker exec -i qwen-app sh -c "cat > /data/history.json.new && mv /data/history.json.new /data/history.json" && docker restart qwen-app > /dev/null'
log "history: $n entries moved from $spark to $app"

# 2. Images and the job index.
read -r -d '' model_side <<'REMOTE' || true
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
base="$HOME/qwen-model"; out="$base/data/outputs"; inc="$base/data/spark-import"; dom="gui/$(id -u)"; label=com.qwen.model
key="$(sed -n 's/^MODEL_API_KEY=//p' "$base/.env")"
h="$(curl -fsS --max-time 5 -H "Authorization: Bearer $key" http://127.0.0.1:4120/health)"
busy="$(printf '%s' "$h" | python3 -c 'import json,sys; h=json.load(sys.stdin); print("busy" if h.get("job") or h.get("queued") else "")')"
[ -z "$busy" ] || { echo "[migrate] ERROR: the model server is busy; try again when it is idle"; exit 75; }
rm -rf "$inc"; mkdir -p "$inc" "$out"; tar -xf - -C "$inc"
launchctl bootout "$dom/$label" 2>/dev/null || true; sleep 2
copied=0; for f in "$inc"/*.png; do [ -e "$out/$(basename "$f")" ] || { cp "$f" "$out/"; copied=$((copied + 1)); }; done
echo "[migrate] images: $copied copied into $out"
node "$base/app/spark/model-server/src/merge-index-cli.ts" "$out/jobs.json" "$inc/jobs.json" | sed 's/^/[migrate] /'
launchctl bootstrap "$dom" "$HOME/Library/LaunchAgents/$label.plist"
for _ in $(seq 1 90); do curl -fsS -H "Authorization: Bearer $key" http://127.0.0.1:4120/health 2>/dev/null | grep -q '"ready":true' && break; sleep 2; done
rm -rf "$inc"; echo "[migrate] model server ready again"
REMOTE
on "$spark" "cd $SPARK_REPO/spark/data/outputs && tar -cf - jobs.json *.png" \
  | ssh -T -o BatchMode=yes "$model" "bash -c $(printf '%q' "$model_side")"

# 3. Every finished image, through the app.
read -r -d '' check <<'REMOTE' || true
docker exec qwen-app cat /data/history.json | python3 -c '
import json, sys, urllib.request
done = [e["id"] for e in json.load(sys.stdin) if e.get("status") == "done"]
bad = []
for i in done:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:3100/api/jobs/{i}/result", timeout=60) as r:
            ok = r.status == 200 and r.headers.get("content-type", "").startswith("image/") and len(r.read()) > 0
    except Exception:
        ok = False
    if not ok: bad.append(i)
print(f"[migrate] check: {len(done) - len(bad)} of {len(done)} finished images load through the app")
for i in bad[:10]: print(f"[migrate]   missing: {i}")
sys.exit(1 if bad else 0)'
REMOTE
on "$app" "$check"
