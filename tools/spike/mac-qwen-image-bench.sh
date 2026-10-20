#!/usr/bin/env bash
# tools/spike/mac-qwen-image-bench.sh (SPIKE_001): the Mac half. Runs on the Mac Studio 2026, by the owner. Draws the Spark
# twin's jobs with Qwen-Image-2.1 through mflux (MLX, Metal), each one timed, from a clone of this repo on the Mac.
#
#   tools/spike/mac-qwen-image-bench.sh env          # M0: the Mac's facts into env.txt; downloads nothing
#   tools/spike/mac-qwen-image-bench.sh fetch        # the add-ons and the twin's images from the Spark, by rsync over the LAN
#   tools/spike/mac-qwen-image-bench.sh run          # M1 t2i, M2 t2i-lora, M3 edit, M4 lora-load, in that order
#   tools/spike/mac-qwen-image-bench.sh run edit     # one of them
#
# Knobs (environment): MFLUX_VERSION (pinned below), WEIGHTS (a local copy of the Spark's models/Qwen-Image-2.1; unset,
# mflux fetches Qwen/Qwen-Image-2.1, ~33 GB, from Hugging Face), LORA_DIR, OUT, TIMEOUT_S (per run), SPARK (host for fetch).
#
# The host install, declared (SPIKE_001 › Technical Notes): Metal is not reachable from a Linux container on macOS, so this
# runs mflux with `uvx` from uv's cache; nothing is put on PATH. If uv is missing the script stops and says so.
# Written for the bash macOS ships (3.2): no arrays expanded empty, no mapfile, no associative arrays.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=tools/spike/prompts.sh
. "$HERE/prompts.sh"

MFLUX_VERSION="${MFLUX_VERSION:-0.21.0}"     # the release that added Qwen-Image-2.1 editing and LoRA (read 2026-10-20)
WEIGHTS="${WEIGHTS:-}"
LORA_DIR="${LORA_DIR:-$ROOT/models/loras}"
OUT="${OUT:-$ROOT/outputs/spike-001/$(date +%F)/mac}"
TIMEOUT_S="${TIMEOUT_S:-1800}"
SPARK="${SPARK:-spark-1.local}"
SPARK_REPO="${SPARK_REPO:-Documents/GitHub/kevinbrowncodes/qwen}"
log() { printf '[mac-bench] %s\n' "$*"; }

[ "$(uname -s)" = "Darwin" ] || { log "ERROR: this half runs on the Mac Studio 2026, not here ($(uname -s))"; exit 1; }
mkdir -p "$OUT"

env_facts() {
  {
    echo "date: $(date -u +%FT%TZ)"
    echo "macos: $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
    echo "chip: $(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo unknown)"
    echo "memory_gb: $(( $(sysctl -n hw.memsize) / 1073741824 ))"
    echo "gpu_wired_limit_mb: $(sysctl -n iogpu.wired_limit_mb 2>/dev/null || echo unknown)"
    echo "disk_free: $(df -h / | tail -1 | awk '{print $4}')"
    echo "uv: $(command -v uv >/dev/null && uv --version || echo missing)"
    echo "mflux_pin: $MFLUX_VERSION"
    echo "weights: ${WEIGHTS:-Qwen/Qwen-Image-2.1 (Hugging Face, fetched by mflux on first run)}"
    echo "lora_dir: $LORA_DIR"
  } | tee "$OUT/env.txt"
}

need_uv() {
  command -v uv >/dev/null || { log "ERROR: uv is not on this Mac. Installing it is a host install and the owner's call (SPIKE_001 › Technical Notes); the spike stops here."; exit 1; }
}

fetch() {
  command -v rsync >/dev/null || { log "ERROR: rsync missing"; exit 1; }
  mkdir -p "$LORA_DIR" "$ROOT/outputs/spike-001"
  log "add-ons from $SPARK (only *.safetensors, into $LORA_DIR)"
  rsync -a --include='*/' --include='*.safetensors' --exclude='*' "$SPARK:$SPARK_REPO/models/loras/" "$LORA_DIR/"
  log "twin results from $SPARK (into outputs/spike-001/)"
  rsync -a "$SPARK:$SPARK_REPO/outputs/spike-001/" "$ROOT/outputs/spike-001/"
  log "fetched; twin images: $(find "$ROOT/outputs/spike-001" -path '*/spark/t2i.png' | sort | tail -1)"
}

twin_image() { find "$ROOT/outputs/spike-001" -path '*/spark/t2i.png' 2>/dev/null | sort | tail -1; }

mflux_cmd() {  # mflux_cmd <entry-point> ... -> runs it through uvx with the pin; --model only for a local copy of the weights
  local entry="$1"; shift
  if [ -n "$WEIGHTS" ] && [ -d "$WEIGHTS" ]; then
    uvx --from "mflux==$MFLUX_VERSION" "$entry" --model "$WEIGHTS" "$@"
  else
    uvx --from "mflux==$MFLUX_VERSION" "$entry" "$@"
  fi
}

# timed <name> <steps> <command...>: wall clock, a ceiling, peak RSS from /usr/bin/time -l, one row in results.tsv.
timed() {
  local name="$1" steps="$2"; shift 2
  local t0 rc pid wall peak status
  [ -f "$OUT/results.tsv" ] || printf 'name\tstatus\twall_s\ts_per_step_est\tpeak_rss_gb\tmflux\tlog\n' > "$OUT/results.tsv"
  log "$name: starting ($*)"
  t0=$(date +%s)
  /usr/bin/time -l "$@" > "$OUT/$name.log" 2>&1 &
  pid=$!
  rc=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ $(( $(date +%s) - t0 )) -gt "$TIMEOUT_S" ]; then
      log "$name: past the ${TIMEOUT_S}s ceiling, killing"
      kill "$pid" 2>/dev/null || true; pkill -P "$pid" 2>/dev/null || true
      rc=124
    fi
    sleep 5
  done
  wait "$pid" || rc=$?
  wall=$(( $(date +%s) - t0 ))
  peak="$(awk '/maximum resident set size/ {printf "%.1f", $1/1073741824}' "$OUT/$name.log")"
  case "$rc" in 0) status="done" ;; 124) status=timeout ;; *) status="failed($rc)" ;; esac
  # The estimate takes mflux's documented fixed part (~8 s: load, prompt encode, VAE decode) off the wall clock.
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$status" "$wall" \
    "$(awk -v w="$wall" -v s="$steps" 'BEGIN{ if (s>0) printf "%.2f", (w-8)/s; else print "" }')" "${peak:-}" "$MFLUX_VERSION" "$name.log" >> "$OUT/results.tsv"
  log "$name: $status in ${wall}s (peak RSS ${peak:-?} GB); log $OUT/$name.log"
}

run_t2i() {
  timed t2i "$SPIKE_STEPS" mflux_cmd mflux-generate-qwen-2.1 --prompt "$SPIKE_SUBJECT_A" --seed "$SPIKE_SEED_T2I" \
    --width "$SPIKE_WIDTH" --height "$SPIKE_HEIGHT" --steps "$SPIKE_STEPS" --output "$OUT/t2i.png" --make-conf
}
run_t2i_lora() {
  local lora="$LORA_DIR/$SPIKE_LORA_FILE"
  [ -f "$lora" ] || { log "ERROR: $lora missing; run fetch first"; return 1; }
  timed t2i-lora "$SPIKE_STEPS" mflux_cmd mflux-generate-qwen-2.1 --prompt "$SPIKE_SUBJECT_A" --seed "$SPIKE_SEED_T2I" \
    --width "$SPIKE_WIDTH" --height "$SPIKE_HEIGHT" --steps "$SPIKE_STEPS" \
    --lora "$lora" "$SPIKE_LORA_SCALE" --guidance "$SPIKE_LORA_GUIDANCE" --negative-prompt " " --output "$OUT/t2i-lora.png" --make-conf
}
run_edit() {
  local ref; ref="$(twin_image)"
  [ -n "$ref" ] && [ -f "$ref" ] || { log "ERROR: no Spark twin image under outputs/spike-001/*/spark/t2i.png; run fetch first"; return 1; }
  log "edit reference: $ref"
  timed edit "$SPIKE_STEPS" mflux_cmd mflux-generate-qwen-2.1-edit --image-paths "$ref" --prompt "$SPIKE_EDIT_PROMPT" \
    --seed "$SPIKE_SEED_EDIT" --steps "$SPIKE_STEPS" --width "$SPIKE_WIDTH" --height "$SPIKE_HEIGHT" --output "$OUT/edit.png" --make-conf
}
run_lora_load() {
  local lora="$LORA_DIR/$SPIKE_LOADCHECK_LORA_FILE"
  [ -f "$lora" ] || { log "ERROR: $lora missing; run fetch first"; return 1; }
  timed lora-load 4 mflux_cmd mflux-generate-qwen-2.1 --prompt "a plain grey wall" --seed 1 --width 512 --height 512 --steps 4 \
    --lora "$lora" 1.0 --output "$OUT/lora-load.png"
}

case "${1:-}" in
  env) env_facts ;;
  fetch) env_facts >/dev/null; fetch ;;
  run)
    env_facts >/dev/null; need_uv
    shift
    if [ $# -eq 0 ]; then set -- t2i t2i-lora edit lora-load; fi
    for r in "$@"; do
      case "$r" in
        t2i) run_t2i ;; t2i-lora) run_t2i_lora ;; edit) run_edit ;; lora-load) run_lora_load ;;
        *) log "unknown run: $r (t2i | t2i-lora | edit | lora-load)"; exit 2 ;;
      esac
    done
    log "rows in $OUT/results.tsv"; column -t -s $'\t' "$OUT/results.tsv" 2>/dev/null || cat "$OUT/results.tsv"
    ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
