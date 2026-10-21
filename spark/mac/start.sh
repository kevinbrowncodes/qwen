#!/bin/bash
# spark/mac/start.sh (STORY_036): starts the model server and its mflux worker natively on the Mac Studio 2026. Run by
# the launch agent com.qwen.model (spark/mac/com.qwen.model.plist.in), which restarts it when it exits.
#
# Reads before it starts (CLAUDE.md §4a, BUG_013 restated for macOS): when less than NEED_GIB (48) GiB is available
# (free + inactive + speculative + purgeable pages in vm_stat) it logs the figure and exits, and launchd tries again
# in 30 s. It never stops anything to make room: that is the owner's call.
# Layout under ~/qwen-model (outside ~/Documents, which launch agents cannot read): app/ (what tools/deploy/model.sh
# deploys), models/Qwen-Image-2.1, models/loras, data/outputs, .env (MODEL_API_KEY, mode 600; never printed).
# Test seams (start.test.sh): QWEN_MODEL_HOME, VM_STAT (the vm_stat command), NODE (the node command).
# Written for the bash macOS ships (3.2).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
BASE="${QWEN_MODEL_HOME:-$HOME/qwen-model}"
APP="$BASE/app"
NEED_GIB="${NEED_GIB:-48}"
log() { printf '[start] %s %s\n' "$(date '+%F %T')" "$*"; }

avail="$(${VM_STAT:-vm_stat} | awk '
  /page size of/ { for (i = 1; i <= NF; i++) if ($i == "of") size = $(i + 1) }
  /^Pages (free|inactive|speculative|purgeable):/ { gsub(/\./, "", $NF); pages += $NF }
  END { if (size == 0) size = 16384; printf "%d", pages * size / 1073741824 }')"
if [ "$avail" -lt "$NEED_GIB" ]; then
  log "only ${avail} GiB available; the model needs about ${NEED_GIB}. Not starting; launchd tries again in 30 s. Do not stop the owner's other services to make room: ask the owner."
  exit 1
fi

[ -f "$BASE/.env" ] || { log "no $BASE/.env (it holds MODEL_API_KEY); run tools/deploy/model.sh from the Mac Studio 2025"; exit 1; }
set -a; . "$BASE/.env"; set +a
export HOST="${HOST:-0.0.0.0}" PORT="${PORT:-4120}"
export OUTPUT_DIR="$BASE/data/outputs" LORA_MANIFEST="$APP/spark/loras.json" LORA_DIR="$BASE/models/loras"
export WEIGHTS="$BASE/models/Qwen-Image-2.1"
[ -f "$WEIGHTS/model_index.json" ] || { log "no weights at $WEIGHTS (model_index.json missing)"; exit 1; }
mkdir -p "$OUTPUT_DIR"
uv="$(command -v uv)" || { log "uv is not installed"; exit 1; }
# The model server splits WORKER on spaces, so no path here may contain one.
export WORKER="$uv run --project $APP/spark/model/mlx --frozen python $APP/spark/model/worker_mlx.py"
log "starting: ${avail} GiB available, listening on $HOST:$PORT"
cd "$APP/spark/model-server"
exec ${NODE:-node} src/main.ts
