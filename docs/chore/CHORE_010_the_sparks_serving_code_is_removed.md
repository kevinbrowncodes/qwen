# CHORE_010 — The Spark's serving code is removed

**Status:** Approved by the owner on 2026-10-21 (through the picker: "Delete them in a chore").

## Summary

Since EPIC_007 (2026-10-20) the model is served from the Mac Studio 2026 by `spark/model/worker_mlx.py`, and nothing of qwen's runs on the DGX Spark. The CUDA serving path stays in the repo but runs nowhere: the diffusers worker, its image, its compose file, its start script, its weights fetch and the hand renders. This chore deletes it. Git history keeps it.

## Why

The owner's porting rule is to cut rather than carry. Code that no machine runs and no gate exercises misleads the next session, and it already does: `main.ts` still defaults `WORKER` to the deleted worker's container path. Removing it makes the 2026 path the only one.

## Changes

- [ ] Delete `spark/model/worker.py`, `spark/model/Dockerfile`, `spark/model/try.py`, `spark/model/try.sh`, `spark/compose.yaml`, `spark/up.sh` and `spark/fetch-weights.sh`. Keep `spark/model/measurements/` (STORY_014's record, cited by `capabilities.ts`), `jobloop.py` and its test, `fetch-loras.sh` and `bench-loras.sh`.
- [ ] **`WORKER` is required.** `spark/model-server/src/main.ts` exits with a message naming `WORKER` when it is unset, instead of defaulting to the deleted container path. `spark/mac/start.sh` always sets it.
- [ ] Comments and messages that name a deleted file now name what replaced it: `server.ts`, `fake-worker.ts`, `jobloop.py`, `worker_mlx.py`, `fetch-loras-cli.ts` ("run `tools/deploy/model.sh`"), `fetch-loras.sh`, `bench-loras.sh` and `tools/spike/prompts.sh`.
- [ ] `tools/deploy/model.sh`: `WEIGHTS_FROM` and `LORAS_FROM` have no default any more, because `~/qwen-spike` was deleted on 2026-10-21 after the weights moved into `~/qwen-model/models/` (owner, same picker).
- [ ] README › Running the Model and Deployment, and `spark/README.md`, describe the Mac Studio 2026 only. The Spark's history is a pointer to EPIC_004 and STORIES 014–016.
- [ ] README records the owner's decision that the Spark's qwen data (the `qwen_app-data` volume, `spark/data/outputs` at 521 MB, the weights at 33.1 GB) stays until **2026-10-28**. It is then removed with the owner's say-so at that time (CLAUDE.md §4a).

## Testing

- **Unit / integration:** `spark/model-server/src/main.test.ts` gains a case: without `WORKER`, `main.ts` exits 1, naming `WORKER`. Its existing cases already set `WORKER`. Everything else is deletions and text, covered by the whole gate staying green. The Python lane (`test_jobloop.py`, `test_mlxjob.py`, `test_mlx_lock.py`) does not import the deleted worker.
- **E2E: not applicable.** The app does not change, and the suite runs against the stub.
- **Manual:** `tools/deploy/model.sh` redeploys to the 2026, which answers `ready`, and the app on the 2022 still lists the six LoRAs.
