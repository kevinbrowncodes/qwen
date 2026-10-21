#!/usr/bin/env bash
# tools/deploy/model.sh (STORY_036): deploy the model server and its mflux worker to the Mac Studio 2026 from the repo
# on the Mac Studio 2025.
#
#   tools/deploy/model.sh                  deploy HEAD (clean, and on origin/develop: so it passed the gate)
#   tools/deploy/model.sh --commit <sha>   deploy that commit (also on origin/develop)
#   tools/deploy/model.sh --now            restart even when a job is running or queued
#
# MODEL_HOST (the environment, or MODEL_HOST= in the gitignored .env) is the ssh destination. One ssh session copies
# exactly the files the service runs (git archive of the commit) into ~/qwen-model/app there, and:
#   - refuses to restart a server that is busy (/health: a running or queued job), unless --now;
#   - links the weights from WEIGHTS_FROM (default ~/qwen-spike/models/Qwen-Image-2.1, SPIKE_001's copy at 790c926) the
#     first time, never moving or copying them (CLAUDE.md §4a), and copies missing LoRAs from LORAS_FROM, then checks
#     every LoRA in spark/loras.json against its sha256 (fetch-loras-cli.ts verify, natively);
#   - generates MODEL_API_KEY once into ~/qwen-model/.env (mode 600), never printed;
#   - installs the worker's locked Python (uv sync --frozen) and the launch agent com.qwen.model, restarts it, and
#     waits for /health to say ready.
# MODEL_DEPLOY_DRY_RUN=1 prints the commit, the files and the rendered launch agent instead (model.test.sh);
# MODEL_DEPLOY_NO_FETCH=1 skips `git fetch` (tests).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
log() { printf '[deploy-model] %s\n' "$*"; }
PATHS=(spark/model-server/src spark/model/jobloop.py spark/model/mlxjob.py spark/model/worker_mlx.py spark/model/mlx spark/loras.json spark/mac)

commit="HEAD"; now=0
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) commit="${2:-}"; shift 2 ;;
    --now) now=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) log "unknown argument: $1"; exit 2 ;;
  esac
done

host="${MODEL_HOST:-}"
if [ -z "$host" ] && [ -f "$ROOT/.env" ]; then host="$(sed -n 's/^MODEL_HOST=//p' "$ROOT/.env" | tail -n 1 | tr -d "\"'\r")"; fi
[ -n "$host" ] || { log "ERROR: no MODEL_HOST. Fix: set MODEL_HOST to the model Mac's ssh destination, in the environment or as MODEL_HOST= in .env (see .env.example)."; exit 64; }

# Only a gated commit is deployed: a clean tree, and a commit that is on origin/develop (every push there is gated).
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  log "ERROR: the working tree has uncommitted changes. Only a commit that passed the gate is deployed (STORY_036). Fix: commit and push to develop (the hook gates it), then deploy."
  exit 65
fi
sha="$(git -C "$ROOT" rev-parse --verify --quiet "$commit^{commit}")" || { log "ERROR: $commit is not a commit"; exit 2; }
[ -n "${MODEL_DEPLOY_NO_FETCH:-}" ] || git -C "$ROOT" fetch -q origin develop
if ! git -C "$ROOT" merge-base --is-ancestor "$sha" origin/develop 2>/dev/null; then
  log "ERROR: ${sha:0:12} is not on origin/develop, so it has not passed the gate. Fix: push it to develop (the pre-push hook gates it), then deploy."
  exit 65
fi

if [ -n "${MODEL_DEPLOY_DRY_RUN:-}" ]; then
  echo "host: $host"
  echo "commit: $sha"
  echo "files:"; git -C "$ROOT" ls-tree -r --name-only "$sha" -- "${PATHS[@]}" | sed 's/^/  /'
  echo "launch agent:"; git -C "$ROOT" show "$sha:spark/mac/com.qwen.model.plist.in" | sed "s#@HOME_DIR@#/Users/example#g"
  exit 0
fi

# The model Mac's side, run by bash there: $1 = the commit, $2 = 1 to restart even when busy. Reads the tar on stdin.
read -r -d '' remote <<'REMOTE' || true
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
sha="$1"; now="$2"
base="$HOME/qwen-model"; label="com.qwen.model"; agent="$HOME/Library/LaunchAgents/$label.plist"; dom="gui/$(id -u)"
say() { printf '[deploy-model] %s\n' "$*"; }
health() { [ -f "$base/.env" ] || return 1; key="$(sed -n 's/^MODEL_API_KEY=//p' "$base/.env")"; curl -fsS --max-time 5 -H "Authorization: Bearer $key" http://127.0.0.1:4120/health 2>/dev/null; }
mkdir -p "$base/data/outputs" "$base/models/loras" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

if body="$(health)"; then
  busy="$(printf '%s' "$body" | python3 -c 'import json,sys; h=json.load(sys.stdin); j=h.get("job"); q=h.get("queued") or 0; print(("job %s" % (j.get("id") if isinstance(j, dict) else j)) if j else ("%d queued" % q) if q else "")')"
  if [ -n "$busy" ] && [ "$now" != 1 ]; then
    say "ERROR: the model server is busy ($busy). Not restarting it under a running job. Fix: deploy when it is idle, or pass --now."
    exit 75
  fi
fi

rm -rf "$base/app.new"; mkdir "$base/app.new"; tar -xf - -C "$base/app.new"
echo "$sha" > "$base/app.new/DEPLOYED_COMMIT"
rm -rf "$base/app.old"; [ -d "$base/app" ] && mv "$base/app" "$base/app.old"; mv "$base/app.new" "$base/app"
app="$base/app"

weights="$base/models/Qwen-Image-2.1"
from="${WEIGHTS_FROM:-$HOME/qwen-spike/models/Qwen-Image-2.1}"
if [ ! -e "$weights" ] && [ -f "$from/model_index.json" ]; then ln -s "$from" "$weights"; say "weights: linked $weights -> $from (not moved or copied)"; fi
[ -f "$weights/model_index.json" ] || { say "ERROR: no weights at $weights. Fix: put Qwen-Image-2.1 @ 790c926 there (uvx --from huggingface_hub hf download Qwen/Qwen-Image-2.1 --revision 790c926... --local-dir $weights)."; exit 66; }

loras_from="${LORAS_FROM:-$HOME/qwen-spike/models/loras}"
if [ -d "$loras_from" ]; then
  for d in "$loras_from"/*/; do id="$(basename "$d")"; [ -e "$base/models/loras/$id" ] || { cp -R "$d" "$base/models/loras/$id"; say "lora: copied $id"; }; done
fi
node "$app/spark/model-server/src/fetch-loras-cli.ts" "$app/spark/loras.json" "$base/models/loras" verify | sed 's/^/[deploy-model] /' \
  || { say "ERROR: a LoRA in spark/loras.json is missing or does not match its sha256 (above)."; exit 67; }

if [ ! -f "$base/.env" ]; then
  (umask 077; printf 'MODEL_API_KEY=%s\n' "$(openssl rand -hex 32)" > "$base/.env"); say "key: generated into $base/.env (mode 600, not printed)"
fi
chmod 600 "$base/.env"

uv sync --project "$app/spark/model/mlx" --frozen --quiet
sed "s#@HOME_DIR@#$HOME#g" "$app/spark/mac/$label.plist.in" > "$agent"
launchctl bootout "$dom/$label" 2>/dev/null || true
for _ in 1 2 3 4 5; do launchctl print "$dom/$label" >/dev/null 2>&1 || break; sleep 1; done
launchctl bootstrap "$dom" "$agent"
say "started ${sha:0:12}; waiting for the model to load (up to 3 minutes)"
for _ in $(seq 1 90); do
  if body="$(health)" && printf '%s' "$body" | grep -q '"ready":true'; then say "ready: $body"; rm -rf "$base/app.old"; exit 0; fi
  sleep 2
done
say "ERROR: the server did not become ready; see ~/Library/Logs/qwen-model.log"
tail -20 "$HOME/Library/Logs/qwen-model.log" | sed 's/^/[deploy-model]   /'
exit 1
REMOTE

cmd="bash -c $(printf '%q' "$remote") deploy $(printf '%q' "$sha") $now"
log "deploying ${sha:0:12} to $host"
git -C "$ROOT" archive --format=tar "$sha" -- "${PATHS[@]}" | ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" "$cmd" && rc=0 || rc=$?
[ "$rc" -eq 0 ] || exit "$rc"

# From here: the LAN must refuse a request without the key.
lan="$(ssh -G "$host" | awk '/^hostname / {print $2; exit}')"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$lan:4120/health" || true)"
if [ "$code" = "401" ]; then log "the LAN answers http://$lan:4120 and refuses a request without the key (401)"
else log "WARNING: http://$lan:4120/health without the key answered '$code', not 401"; fi
