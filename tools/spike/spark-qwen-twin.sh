#!/usr/bin/env bash
# tools/spike/spark-qwen-twin.sh (SPIKE_001): the Spark half. Draws the three twin jobs through the job API on an idle model
# server and records each one's clock, so the Mac has something measured the same day to compare against.
#
#   tools/spike/spark-qwen-twin.sh            # S1 t2i, S2 t2i + add-on, S3 edit of S1's image; results in outputs/spike-001/<date>/spark/
#   OUT=<dir> MODEL_BASE_URL=<url> tools/spike/spark-qwen-twin.sh
#
# Refuses to start unless /health says ready with no job running and nothing queued: the twin's seconds are submit-to-done,
# and a queue in front would count as drawing time. Host tools only: bash, curl, python3. Nothing in the product changes.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# shellcheck source=tools/spike/prompts.sh
. "$HERE/prompts.sh"

BASE="${MODEL_BASE_URL:-http://127.0.0.1:4120}"
OUT="${OUT:-$ROOT/outputs/spike-001/$(date +%F)/spark}"
POLL_S="${POLL_S:-2}"
CEILING_S="${CEILING_S:-900}"   # a twin job past 15 minutes is not a twin; it is a stall
mkdir -p "$OUT"
log() { printf '[twin] %s\n' "$*"; }
field() { python3 -c 'import json,sys; v=json.loads(sys.argv[1]); [v:=v[k] for k in sys.argv[2].split(".")]; print("" if v is None else v)' "$1" "$2"; }

health="$(curl -sf -m 5 "$BASE/health")" || { log "ERROR: $BASE/health does not answer; is qwen-model up? (spark/up.sh)"; exit 1; }
log "health: $health"
if [ "$(field "$health" ready)" != "True" ] || [ -n "$(field "$health" job)" ] || [ "$(field "$health" queued)" != "0" ]; then
  log "refused: the model server must be ready with no job running and nothing queued (CLAUDE.md §4a: read before you write)"
  exit 1
fi
printf 'name\tjob_id\tseed\tlora\treferences\tstatus\twall_s\tserver_s\tcreated_at\tupdated_at\twidth\theight\n' > "$OUT/results.tsv"
echo "$health" > "$OUT/health-before.json"

# wait_done <id> -> prints the terminal status body; fails past the ceiling.
wait_done() {
  local id="$1" started body status
  started=$(date +%s)
  while :; do
    body="$(curl -sf -m 10 "$BASE/jobs/$id")"
    status="$(field "$body" status)"
    case "$status" in done|failed|cancelled) echo "$body"; return 0 ;; esac
    if [ $(( $(date +%s) - started )) -gt "$CEILING_S" ]; then log "ERROR: $id still $status after ${CEILING_S}s"; echo "$body"; return 1; fi
    sleep "$POLL_S"
  done
}

# record <name> <create-response> <t0> : polls to the end, saves the image, appends the row.
record() {
  local name="$1" created="$2" t0="$3" id body status wall created_at updated_at server_s
  id="$(field "$created" id)"
  log "$name: job $id submitted, waiting"
  body="$(wait_done "$id")" || true
  wall=$(( $(date +%s) - t0 ))
  status="$(field "$body" status)"
  created_at="$(field "$body" createdAt)"; updated_at="$(field "$body" updatedAt)"
  server_s="$(python3 -c 'import sys,datetime as d; p=lambda s: d.datetime.fromisoformat(s.replace("Z","+00:00")); print(round((p(sys.argv[2])-p(sys.argv[1])).total_seconds(),1))' "$created_at" "$updated_at")"
  echo "$body" > "$OUT/$name.status.json"
  if [ "$status" = "done" ]; then curl -sf -m 60 "$BASE/jobs/$id/result" -o "$OUT/$name.png"; fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$id" "$(field "$body" request.seed)" "$(field "$body" request.lora)" \
    "$(field "$body" request.referenceImages)" "$status" "$wall" "$server_s" "$created_at" "$updated_at" \
    "$(field "$body" result.width)" "$(field "$body" result.height)" >> "$OUT/results.tsv"
  log "$name: $status in ${wall}s wall (server ${server_s}s)"
}

json_body() {  # json_body <lora-or-empty>
  python3 -c 'import json,sys; b={"prompt":sys.argv[1],"ratio":sys.argv[2],"seed":int(sys.argv[3])}; b.update({"lora":sys.argv[4]} if sys.argv[4] else {}); print(json.dumps(b))' \
    "$SPIKE_SUBJECT_A" "$SPIKE_RATIO" "$SPIKE_SEED_T2I" "$1"
}

# S1: text-to-image, no add-on.
t0=$(date +%s); created="$(curl -sf -m 30 -H 'Content-Type: application/json' -d "$(json_body '')" "$BASE/jobs")"; record t2i "$created" "$t0"
# S2: the same with the add-on (its guidance comes from the server's manifest).
t0=$(date +%s); created="$(curl -sf -m 30 -H 'Content-Type: application/json' -d "$(json_body "$SPIKE_LORA_ID")" "$BASE/jobs")"; record t2i-lora "$created" "$t0"
# S3: the edit of S1's image, ratio absent so the result takes the reference's shape.
if [ -f "$OUT/t2i.png" ]; then
  t0=$(date +%s)
  created="$(curl -sf -m 60 -F "prompt=$SPIKE_EDIT_PROMPT" -F "seed=$SPIKE_SEED_EDIT" -F "referenceImage=@$OUT/t2i.png;type=image/png" "$BASE/jobs")"
  record edit "$created" "$t0"
else
  log "edit skipped: t2i.png missing (S1 did not finish)"
fi
log "done; rows in $OUT/results.tsv"
column -t -s $'\t' "$OUT/results.tsv" 2>/dev/null || cat "$OUT/results.tsv"
