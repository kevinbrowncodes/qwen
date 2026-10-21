#!/usr/bin/env bash
# tools/deploy/app.sh (STORY_037): deploy the app to the Mac Studio 2022 from the repo on the Mac Studio 2025.
#
#   tools/deploy/app.sh                  deploy HEAD (clean, and on origin/develop: so it passed the gate)
#   tools/deploy/app.sh --commit <sha>   deploy that commit (also on origin/develop)
#
# APP_HOST (the environment, or APP_HOST= in the gitignored .env) is the app Mac's ssh destination; MODEL_HOST is the
# model Mac's (STORY_036). The app's environment is written to ~/qwen-app/.env on the app Mac (mode 600) on every
# deploy: MODEL_BASE_URL from MODEL_HOST's ssh hostname, and MODEL_API_KEY piped from the model Mac's
# ~/qwen-model/.env, never printed and never written here. Then one ssh session unpacks the commit into ~/qwen-app/src
# there and runs `docker compose -p qwen up -d --build app` with APP_TAG=<sha12>, so the gate's own builds on that
# machine never become what serves, and waits for /api/health. The app joins PATHS' network and labels (compose.yaml).
# APP_DEPLOY_DRY_RUN=1 prints what would run instead (app.test.sh); APP_DEPLOY_NO_FETCH=1 skips `git fetch` (tests).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
log() { printf '[deploy-app] %s\n' "$*"; }

commit="HEAD"
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) commit="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) log "unknown argument: $1"; exit 2 ;;
  esac
done

env_get() { if [ -n "${!1:-}" ]; then printf '%s' "${!1}"; elif [ -f "$ROOT/.env" ]; then sed -n "s/^$1=//p" "$ROOT/.env" | tail -n 1 | tr -d "\"'\r"; fi; }
host="$(env_get APP_HOST)"; model="$(env_get MODEL_HOST)"
[ -n "$host" ] || { log "ERROR: no APP_HOST. Fix: set APP_HOST to the app Mac's ssh destination, in the environment or as APP_HOST= in .env (see .env.example)."; exit 64; }
[ -n "$model" ] || { log "ERROR: no MODEL_HOST. Fix: set MODEL_HOST (the model Mac's ssh destination) as for tools/deploy/model.sh."; exit 64; }

# Only a gated commit is deployed: a clean tree, and a commit that is on origin/develop (every push there is gated).
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  log "ERROR: the working tree has uncommitted changes. Only a commit that passed the gate is deployed (STORY_037). Fix: commit and push to develop (the hook gates it), then deploy."
  exit 65
fi
sha="$(git -C "$ROOT" rev-parse --verify --quiet "$commit^{commit}")" || { log "ERROR: $commit is not a commit"; exit 2; }
[ -n "${APP_DEPLOY_NO_FETCH:-}" ] || git -C "$ROOT" fetch -q origin develop
if ! git -C "$ROOT" merge-base --is-ancestor "$sha" origin/develop 2>/dev/null; then
  log "ERROR: ${sha:0:12} is not on origin/develop, so it has not passed the gate. Fix: push it to develop (the pre-push hook gates it), then deploy."
  exit 65
fi
tag="${sha:0:12}"

if [ -n "${APP_DEPLOY_DRY_RUN:-}" ]; then
  echo "host: $host"
  echo "model host: $model"
  echo "commit: $sha"
  echo "env file: ~/qwen-app/.env (MODEL_BASE_URL, MODEL_API_KEY piped from $model)"
  echo "run: APP_TAG=$tag docker compose -p qwen --env-file ~/qwen-app/.env up -d --build app"
  exit 0
fi

# The app's environment: the URL from MODEL_HOST's hostname, the key straight from the model Mac to the app Mac.
url="http://$(ssh -G "$model" | awk '/^hostname / {print $2; exit}'):4120"
{ printf 'MODEL_BASE_URL=%s\n' "$url"
  ssh -T -o BatchMode=yes "$model" 'printf "MODEL_API_KEY=%s\n" "$(sed -n "s/^MODEL_API_KEY=//p" "$HOME/qwen-model/.env")"'
} | ssh -T -o BatchMode=yes "$host" 'mkdir -p "$HOME/qwen-app" && umask 077 && cat > "$HOME/qwen-app/.env.new" \
  && grep -q "^MODEL_API_KEY=." "$HOME/qwen-app/.env.new" && mv "$HOME/qwen-app/.env.new" "$HOME/qwen-app/.env"' \
  || { log "ERROR: could not write the app's environment (is the model deployed, with its key in ~/qwen-model/.env on $model?)"; exit 66; }
log "app environment written on $host (MODEL_BASE_URL=$url; the key is not printed)"

# The app Mac's side: $1 = the commit's short tag. Reads the tar on stdin.
read -r -d '' remote <<'REMOTE' || true
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
tag="$1"; base="$HOME/qwen-app"
rm -rf "$base/src.new"; mkdir -p "$base/src.new"; tar -xf - -C "$base/src.new"
rm -rf "$base/src.old"; [ -d "$base/src" ] && mv "$base/src" "$base/src.old"; mv "$base/src.new" "$base/src"
cd "$base/src"
APP_TAG="$tag" docker compose -p qwen --env-file "$base/.env" up -d --build app
for _ in $(seq 1 60); do
  if body="$(curl -fsS --max-time 3 http://127.0.0.1:3100/api/health 2>/dev/null)"; then
    echo "[deploy-app] serving $tag: $body"; rm -rf "$base/src.old"; exit 0
  fi
  sleep 2
done
echo "[deploy-app] ERROR: the app did not answer /api/health; see: docker logs qwen-app"; docker logs --tail 20 qwen-app 2>&1 | sed 's/^/[deploy-app]   /'
exit 1
REMOTE

log "deploying $tag to $host"
git -C "$ROOT" archive --format=tar "$sha" | ssh -T -o BatchMode=yes -o ConnectTimeout=10 "$host" "bash -c $(printf '%q' "$remote") deploy $tag"
lan="$(ssh -G "$host" | awk '/^hostname / {print $2; exit}')"
log "the app: http://$lan:3100 now, and http://qwen.local through PATHS' proxy"
