#!/usr/bin/env bash
# Fetches the Qwen-Image-2.1 weights into models/ (gitignored) on the Spark (CHORE_002).
#
#   spark/fetch-weights.sh          start the download in a detached container
#   spark/fetch-weights.sh status   show whether it is still running, and the size so far
#
# The revision is pinned so the checkpoint the README names is the one on disk.
# The Qwen Research License was read from the repo's LICENSE file on 2026-09-26
# (non-commercial only; see README.md -> Running the Model) before this was run.
# Nothing is installed on the host: huggingface_hub runs in python:3.12-slim.
# The HF token file, if present, is mounted read-only and never printed.
set -euo pipefail

REPO_ID="Qwen/Qwen-Image-2.1"
REVISION="790c92633540aa0cb11d9abf19eb46d861714758"
NAME="qwen-weights-fetch"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
dest="$repo/models/Qwen-Image-2.1"

if [[ "${1:-}" == "status" ]]; then
  if docker ps --format '{{.Names}}' | grep -qx "$NAME"; then echo "fetch: running"; else echo "fetch: not running"; fi
  du -sh "$dest" 2>/dev/null || echo "nothing downloaded yet"
  exit 0
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "spark/fetch-weights.sh: a container named $NAME already exists; check it with 'docker logs $NAME'." >&2
  exit 2
fi

mkdir -p "$dest"
token_mount=()
if [[ -r "$HOME/.cache/huggingface/token" ]]; then
  token_mount=(-v "$HOME/.cache/huggingface/token:/hf/token:ro" -e HF_TOKEN_PATH=/hf/token)
fi

# hf download resumes on re-run, so an interrupted fetch is restarted by removing
# the stopped container and running this script again.
docker run -d --name "$NAME" --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e PATH=/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin -e HF_HUB_DISABLE_TELEMETRY=1 \
  "${token_mount[@]}" \
  -v "$dest:/out" \
  python:3.12-slim \
  sh -c "pip install --quiet --no-cache-dir --user --disable-pip-version-check 'huggingface_hub[hf_xet]>=1.0' && \
         hf download '$REPO_ID' --revision '$REVISION' --local-dir /out && \
         echo 'fetch: done'"
echo "fetch: started ($REPO_ID @ ${REVISION:0:7} -> models/Qwen-Image-2.1). Follow with: docker logs -f $NAME"
