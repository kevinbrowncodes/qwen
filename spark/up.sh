#!/usr/bin/env bash
# spark/up.sh (STORY_016): start the model server on the Spark. Reads before it writes (CLAUDE.md §4a): prints what is
# running and the memory available, and refuses below 60 GiB rather than stopping anything. Idempotent.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NEED_GIB=60
SPARK_UID="$(id -u)"; SPARK_GID="$(id -g)"
export SPARK_UID SPARK_GID

echo "[up] running on the Spark:"
docker ps --format '  {{.Names}}\t{{.Status}}'
free -g | sed -n 1,2p
if docker ps --format '{{.Names}}' | grep -qx qwen-model; then
  echo "[up] qwen-model is already running."
else
  avail=$(awk '/MemAvailable/ {print int($2/1024/1024)}' /proc/meminfo)
  if [ "$avail" -lt "$NEED_GIB" ]; then
    echo "[up] only ${avail} GiB available; the model needs about ${NEED_GIB}. Not starting (ask the owner before freeing memory)." >&2
    exit 1
  fi
fi
[ -f "$ROOT/models/Qwen-Image-2.1/model_index.json" ] || { echo "[up] no weights; run spark/fetch-weights.sh" >&2; exit 1; }
docker network inspect qwen > /dev/null 2>&1 || docker network create qwen > /dev/null
mkdir -p "$HERE/data/outputs"
docker compose -f "$HERE/compose.yaml" up -d --build model
echo "[up] waiting for the model to load (up to about 4 minutes cold) ..."
for _ in $(seq 1 180); do  # a cold load measured 3.3 minutes (STORY_014)
  if curl -fsS 127.0.0.1:4120/health 2>/dev/null | grep -q '"ready":true'; then
    echo "[up] ready: $(curl -fsS 127.0.0.1:4120/health)"
    exit 0
  fi
  sleep 2
done
echo "[up] the server answers but the model is not ready yet; see: docker logs qwen-model" >&2
exit 1
