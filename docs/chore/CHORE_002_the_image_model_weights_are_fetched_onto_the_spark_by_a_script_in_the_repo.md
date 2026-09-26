# CHORE_002 — The image model's weights are fetched onto the Spark by a script in the repo

**Status:** In progress (download started 2026-09-26 18:20)
**Relates to:** [EPIC_004](../epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md)

## Summary

`spark/fetch-weights.sh` downloads Qwen-Image-2.1 at a pinned revision (`790c926…`) into `models/Qwen-Image-2.1/`, which is gitignored. It runs `hf download` in a detached `python:3.12-slim` container, so nothing is installed on the host and the fetch survives the terminal closing. `spark/fetch-weights.sh status` reports progress.

## Why

The owner expected the weights to be on the Spark already. A search of the whole disk on 2026-09-26 found no Qwen-Image-2.1 checkpoint: other models were present, but not this one. The repo holds 33.1 GB, so the fetch is started ahead of EPIC_004's stories, and those stories need not wait hours for it. [CLAUDE.md → §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark) says a script that fetches weights lives in the repo, and a license is read before weights are fetched. The LICENSE file in `Qwen/Qwen-Image-2.1` was re-read on 2026-09-26 immediately before the fetch: Qwen Research License, non-commercial only, no territorial terms, unchanged from the morning's reading. The repo is public and not gated. Disk before the fetch: 892 GB free.

## Changes

- [x] `spark/fetch-weights.sh`: the pinned repo and revision; a detached container named `qwen-weights-fetch`; the HF token file mounted read-only when present and never printed; a `status` subcommand; a refusal when a container of that name already exists.
- [ ] The download finishes and the transformer, text encoder and VAE shards are all present (checked against the repo's file list).
- [ ] README → Running the Model records the checkpoint, the revision, the path and the size on disk.

## Testing

- **Unit / integration / e2e**: N/A. This is a host-side wrapper around `docker run` and `hf download`, with no logic of its own beyond argument handling. Testing it would mean mocking docker, which proves nothing about the fetch. It is linted with `shellcheck` from the official `koalaman/shellcheck` image.
- **Manual**: `spark/fetch-weights.sh status` reads `fetch: not running`, `docker logs qwen-weights-fetch` ends with `fetch: done`, and every file in the repo's tree is present at the expected size.
