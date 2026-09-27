# STORY_014 — The Spark's state is recorded, and one image is rendered by hand with its time and memory written down

**Epic:** [EPIC_004](../epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md)
**Status:** Not started
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want a container that runs Qwen-Image-2.1 on the Spark, and one text-to-image and one edit rendered by hand with their time and memory measured, so that the model server is built on numbers from this box and not on guesses.

## Current state

- The weights are in `models/Qwen-Image-2.1` (CHORE_002): 28 files, 33.13 GB, every size matching the repo tree.
- Nothing can run them yet. The model needs `QwenImage21Pipeline`, which is only on diffusers' git main (commit `6256aa7666` and later; no release), and transformers 5.17 or later. None of the images on the Spark has either.
- What works on this GB10 (sm_121), per the sibling projects:
  - torch 2.11.0+cu130 from `https://download.pytorch.org/whl/cu130`, on `nvidia/cuda:13.0.2-runtime-ubuntu24.04` (minimax's base, pinned by digest);
  - the NGC `pytorch:25.12` image gives wrong numerics on sm_121 (spark-ltx2's lesson).
- The Spark on 2026-09-26 19:30: 121 GB total and 109 GB available. minimax's ComfyUI was idle, holding 351 MiB of GPU memory. Nothing was on port 4120.

## UI Mockup

N/A (no UI change; a container image, a one-off script and written measurements).

## Acceptance Criteria

- [ ] `spark/model/Dockerfile` builds `qwen/model:<tag>` with these parts, installs nothing on the host, and does not bake in the weights (they are bind-mounted read-only):
  - minimax's CUDA 13 runtime base, pinned by digest;
  - Python 3.12 in a venv;
  - torch and torchvision cu130;
  - diffusers pinned to a commit on or after `6256aa7666`;
  - transformers 5.17 or later;
  - accelerate and pillow.
- [ ] `spark/model/try.py`, run by `spark/model/try.sh`, loads the pipeline in bf16 and renders two images:
  - a text-to-image at 1:1 and at 16:9, at the model card's sizes;
  - an edit of the stub's committed reference fixture.

  For each it records the load time, the time per image, the steps, and the peak memory: torch's `max_memory_allocated`, plus the host's used memory sampled from `free`. It writes the images to the gitignored `outputs/` and a JSON record to `spark/model/measurements/<date>.json`, which is committed.
- [ ] **Read before write** ([CLAUDE.md → §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)): the script prints `nvidia-smi`, `free -g` and `docker ps` before it starts, and refuses to run if less than 60 GB is available. It never stops another container.
- [ ] `spark/README.md` records the Spark's facts as read that session:
  - OS, kernel, driver, CUDA;
  - memory, disk, and what else is running;
  - the image's versions (torch, diffusers commit, transformers);
  - the measurements.

  README → Running the Model's table is filled in with the measured numbers and the memory split.
- [ ] **The sizes the model server will offer per ratio** are chosen from these measurements, with the reason written down: the card's 2K sizes if they fit in time and memory, smaller otherwise.

## Technical Notes

- sm_121 runs on the cu130 wheels' sm_120 family target (minimax README). If the output looks wrong (grey, washed out: spark-ltx2's symptom), stop and record it rather than working around it.
- `true_cfg_scale` 1.0 and 40 steps are the card's defaults. The measurement records both.
- Unified memory: `nvidia-smi` cannot report memory on this box, so `free` is the host-side truth. torch's counter covers the process's CUDA allocations.

## Testing Plan

- **Unit / Integration / E2E**: N/A. This story makes a container and a one-off measurement script that needs the real GPU and the weights. [CLAUDE.md → §3 item 5](../../CLAUDE.md#3-how-features-are-built-important) says a real-model check is not a test layer and never gates a push. The code that the gate tests arrives in STORY_015. The repo's gate still runs, and passes, on the commit.
- **Manual verification** (recorded in the Done note with model, checkpoint and date):
  1. The images open and look like their prompts: not grey, not noise, and the edit visibly edits the fixture.
  2. The times and peak memory are recorded.
  3. `docker ps` afterwards shows the same containers as before.

## Estimated Complexity

M
