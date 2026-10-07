#!/usr/bin/env bash
# Fetches the community add-ons listed in spark/loras.json into models/loras/<id>/ (gitignored) on the Spark
# (STORY_019; STORY_021 added the Civitai source, the required sha256 and `verify`).
#
#   spark/fetch-loras.sh          fetch every entry that is not on disk yet (each is tens to hundreds of MB)
#   spark/fetch-loras.sh status   list each entry and whether its file is there
#   spark/fetch-loras.sh verify   hash every file on disk against the manifest's sha256
#
# The engine is spark/model-server/src/fetch-loras-cli.ts, which the gate tests. This wrapper runs it in the pinned
# node image the model image is built from, so nothing is installed on the host. Each entry's source is pinned (a
# Hugging Face revision or a Civitai model version) and its creator's sha256 is checked as the bytes arrive: a file
# that differs is removed. The token files, if present, are mounted read-only and never printed:
#   ~/.cache/huggingface/token   Hugging Face (not needed for public repos)
#   ~/.config/civitai/token      Civitai (needed: its downloads answer 401 without one)
#   CIVITAI_TOKEN in .env        Civitai, beside compose.yaml (CHORE_005); wins over the token file
# Exits 1 when any entry is left unfetched, saying which. Afterwards, spark/up.sh rebuilds and recreates the model so
# the worker loads them (about 3.3 minutes; check that no job is running first).
set -euo pipefail

# The same pinned image as NODE_IMAGE in spark/model/Dockerfile.
NODE_IMAGE="node:26-bookworm-slim@sha256:cd9f682fa2885cd1056e830424764158570061c59736a1da836bc3d73df095ae"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
dest="$repo/models/loras"
mkdir -p "$dest"

case "${1:-}" in
  ""|status|verify) ;;
  *) sed -n '2,8p' "$0"; exit 2 ;;
esac

token_mounts=()
if [[ -r "$HOME/.cache/huggingface/token" ]]; then
  token_mounts+=(-v "$HOME/.cache/huggingface/token:/tokens/huggingface:ro" -e HF_TOKEN_PATH=/tokens/huggingface)
fi
if [[ -r "$HOME/.config/civitai/token" ]]; then
  token_mounts+=(-v "$HOME/.config/civitai/token:/tokens/civitai:ro" -e CIVITAI_TOKEN_PATH=/tokens/civitai)
fi
# CHORE_005: CIVITAI_TOKEN in the repo's .env. Mounted read-only and parsed by the engine; this shell never reads it.
if [[ -r "$repo/.env" ]]; then
  token_mounts+=(-v "$repo/.env:/tokens/env:ro" -e ENV_FILE=/tokens/env)
fi

docker run --rm --user "$(id -u):$(id -g)" \
  "${token_mounts[@]}" \
  -v "$here/model-server/src:/src:ro" -v "$here/loras.json:/manifest.json:ro" -v "$dest:/out" \
  "$NODE_IMAGE" \
  node /src/fetch-loras-cli.ts /manifest.json /out "${1:-}"
