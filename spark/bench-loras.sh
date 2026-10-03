#!/usr/bin/env bash
# Runs the add-on bench against the model server on the Spark (STORY_022): every add-on, and none, over the same
# generated subjects, into outputs/bench/<date>/ (gitignored) with a contact sheet and a scorecard template.
#
#   spark/bench-loras.sh              run (or resume) today's bench
#   spark/bench-loras.sh 2026-10-02   run (or resume) that day's
#
# The engine is spark/model-server/src/bench.ts, which the gate tests; this wrapper runs bench-cli.ts in the pinned
# node image, on the host's network so 127.0.0.1:4120 is reachable. Its only inputs are the prompts in bench.ts and
# the ids of jobs this server made from them; it never reads an image from disk. A run resumes: cells already done
# are skipped, so it can be re-run after an interruption or after a new add-on is installed. Check that no job is
# running first (docker logs qwen-model); the bench runs one at a time and takes one to two hours for seven add-ons.
set -euo pipefail

# The same pinned image as NODE_IMAGE in spark/model/Dockerfile.
NODE_IMAGE="node:26-bookworm-slim@sha256:cd9f682fa2885cd1056e830424764158570061c59736a1da836bc3d73df095ae"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
date="${1:-$(date +%F)}"
out="$repo/outputs/bench/$date"
mkdir -p "$out"

docker run --rm --user "$(id -u):$(id -g)" --network host \
  -e MODEL_API_KEY="${MODEL_API_KEY:-}" \
  -v "$here/model-server/src:/src:ro" -v "$here/loras.json:/manifest.json:ro" -v "$out:/bench" \
  "$NODE_IMAGE" \
  node /src/bench-cli.ts "http://127.0.0.1:4120" /bench /manifest.json
