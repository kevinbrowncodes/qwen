#!/usr/bin/env bash
# Fetches the community add-ons listed in spark/loras.json into models/loras/<id>/ (gitignored) on the Spark
# (STORY_019).
#
#   spark/fetch-loras.sh          fetch every entry that is not on disk yet (each is tens to hundreds of MB)
#   spark/fetch-loras.sh status   list each entry and whether its file is there
#
# Each entry's revision is pinned, and its licence was read before it was listed (see the manifest's readOn and note).
# Where the manifest gives a sha256, the file is checked against it and removed if it differs.
# Nothing is installed on the host: huggingface_hub runs in python:3.12-slim. The HF token file, if present, is
# mounted read-only and never printed. Afterwards, spark/up.sh rebuilds and recreates the model so the worker loads
# them (about 3.3 minutes; check that no job is running first).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
dest="$repo/models/loras"
mkdir -p "$dest"

if [[ "${1:-}" == "status" ]]; then
  python3 - "$here/loras.json" "$dest" <<'PY'
import json, os, sys
for l in json.load(open(sys.argv[1]))["loras"]:
    f = os.path.join(sys.argv[2], l["id"], os.path.basename(l["file"]))
    print(f"{l['id']:<16} {'fetched' if os.path.exists(f) else 'missing':<8} {round(os.path.getsize(f) / 1e6, 1) if os.path.exists(f) else '':>7} {l['repo']}")
PY
  exit 0
fi

token_mount=()
if [[ -r "$HOME/.cache/huggingface/token" ]]; then
  token_mount=(-v "$HOME/.cache/huggingface/token:/hf/token:ro" -e HF_TOKEN_PATH=/hf/token)
fi

docker run --rm --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e PATH=/tmp/.local/bin:/usr/local/bin:/usr/bin:/bin -e HF_HUB_DISABLE_TELEMETRY=1 \
  "${token_mount[@]}" \
  -v "$here/loras.json:/manifest.json:ro" -v "$dest:/out" \
  python:3.12-slim \
  sh -c "pip install --quiet --no-cache-dir --user --disable-pip-version-check 'huggingface_hub[hf_xet]>=1.0' && python3 -c '
import hashlib, json, os
from huggingface_hub import hf_hub_download
for l in json.load(open(\"/manifest.json\"))[\"loras\"]:
    out = os.path.join(\"/out\", l[\"id\"])
    target = os.path.join(out, os.path.basename(l[\"file\"]))
    if os.path.exists(target):
        print(\"fetch:\", l[\"id\"], \"already there\")
        continue
    path = hf_hub_download(l[\"repo\"], l[\"file\"], revision=l[\"revision\"], local_dir=out)
    if l.get(\"sha256\"):
        h = hashlib.sha256()
        with open(path, \"rb\") as f:
            for chunk in iter(lambda: f.read(1 << 20), b\"\"):
                h.update(chunk)
        if h.hexdigest() != l[\"sha256\"]:
            os.remove(path)
            raise SystemExit(\"fetch: \" + l[\"id\"] + \" does not match its sha256; removed\")
    print(\"fetch:\", l[\"id\"], \"done\", round(os.path.getsize(path) / 1e6, 1), \"MB\")
'"
echo "fetch: finished. Run spark/up.sh (once no job is running) so the worker loads them."
