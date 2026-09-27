#!/usr/bin/env bash
# spark/model/try.sh (STORY_014): render Qwen-Image-2.1 by hand and record time and memory.
# Reads before it writes (CLAUDE.md §4a): prints what is running and refuses below 60 GB available. Never stops
# anything. Outputs go to the gitignored outputs/; the measurement JSON to spark/model/measurements/<date>.json.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
IMAGE="qwen/model:dev"
WEIGHTS="$ROOT/models/Qwen-Image-2.1"
NEED_GIB=60

echo "[try] what is running on the Spark:"
nvidia-smi --query-gpu=name,driver_version,utilization.gpu --format=csv,noheader || true
free -g
docker ps --format '  {{.Names}}\t{{.Status}}'
avail=$(awk '/MemAvailable/ {print int($2/1024/1024)}' /proc/meminfo)
if [ "$avail" -lt "$NEED_GIB" ]; then
  echo "[try] only ${avail} GiB available; need ${NEED_GIB}. Not starting (ask the owner before freeing memory)." >&2
  exit 1
fi
[ -f "$WEIGHTS/model_index.json" ] || { echo "[try] no weights at $WEIGHTS (run spark/fetch-weights.sh)" >&2; exit 1; }
docker image inspect "$IMAGE" > /dev/null 2>&1 || { echo "[try] image $IMAGE missing: docker build -t $IMAGE -f spark/model/Dockerfile spark" >&2; exit 1; }

mkdir -p "$ROOT/outputs" "$HERE/measurements"
day=$(date +%F)
docker run --rm --gpus all --ipc=host --user "$(id -u):$(id -g)" \
  -e STEPS="${STEPS:-40}" -e RECORD="/record/$day${SUFFIX:-}.json" -e JOBS="${JOBS:-}" \
  -v "$HERE/try.py:/srv/model/try.py:ro" \
  -v "$WEIGHTS:/weights:ro" \
  -v "$ROOT/outputs:/outputs" \
  -v "$HERE/measurements:/record" \
  -v "$ROOT/tools/stub-generation-server/fixtures:/fixtures:ro" \
  "$IMAGE" python3 /srv/model/try.py
echo "[try] record: spark/model/measurements/$day.json"
docker ps --format '  {{.Names}}\t{{.Status}}'
