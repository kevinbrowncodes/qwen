# SPIKE_002 — Can Qwen-Image-2.1 run faster on the Mac Studio 2026

**Status:** Shelved on 2026-10-21, not run. The owner: "I think we are good for now". bf16 already beats the Spark on every job, and memory is not tight. The weights question is answered below. Pick this up if waits start to feel long, or if video on the 2026 makes memory tight; the matrix and budget stand as proposed.
**Created:** 2026-10-21

As the owner, I want to know whether a smaller precision or mflux's step caching makes images on the Mac Studio 2026 faster, at what cost in quality and memory, and whether newer weights exist. Then I can decide what the 2026 serves, before anyone changes the worker.

## Current state (read 2026-10-21)

- **What serves today** (STORY_035, STORY_036): `Qwen/Qwen-Image-2.1` at `790c926`, in **bf16, not quantized**, through mflux 0.21.0 on MLX. One `QwenImage21Edit` model serves every job. Measured:
  - text-to-image at 896×1184 and 40 steps: **35.1 s** (0.849 s/step);
  - with `penis-coachbate` at guidance 3: 75.0 s;
  - an edit: 50.4 s;
  - peak resident memory about 33 GB of 96.
- **The newer weights are the same weights.** Hugging Face's `main` is now `d26bb61` (2026-09-30), one commit after our `790c926`, titled "docs: add feedback form section". Comparing the two revisions file by file through the Hub's API, the 28 files have identical object ids except `README.md`. **No weight file changed, so there is nothing to download or compare**, and the pin stays.
- **Two speed levers in mflux 0.21.0, not yet measured on the 2026:**
  - **Quantization.** `QwenImage21Edit(quantize=8)` or `quantize=4`, done at load. mflux's docs put 8-bit at about 30.7 GB peak against about 46 GB in bf16. LoRA layers wrap quantized layers too (`LoRALinear.from_linear` handles `QuantizedLinear`).
  - **Step caching.** `generate_image(use_step_cache=True, step_cache_threshold=0.12)` skips steps whose change is small. It is faster, and the image may differ.

## UI Mockup

N/A (a spike: measurements and a decision; no surface changes).

## The experiment's matrix

The three jobs are SPIKE_001's, at its prompts, seeds and sizes (`tools/spike/prompts.sh`): text-to-image (T), text-to-image with `penis-coachbate` at guidance 3 (L), and the edit of the Spark's S1 image (E). Each cell is one run on the 2026, in one process per precision.

| Precision | Step cache | Jobs | Records |
|---|---|---|---|
| bf16 | off | T, L, E | Seconds, s/step, peak memory, image. The baseline, against STORY_035's numbers |
| bf16 | on | T, L, E | The same |
| 8-bit | off | T, L, E | The same, plus the load time (quantizing at load) |
| 8-bit | on | T, L, E | The same |
| 4-bit | off | T, L, E | The same |
| 4-bit | on | T, L, E | The same |

18 runs. The images go into a contact sheet (precision and cache across, jobs down) for the owner to judge. As in the LoRA bench, quality is the owner's eye, never a pixel metric.

## Acceptance Criteria

- [x] **The newer weights are settled:** `d26bb61` differs from `790c926` only in `README.md`, read 2026-10-21. Recorded above.
- [ ] **The 18 runs are measured on the 2026** by a script under `tools/spike/`, run in the worker's locked environment (`spark/model/mlx`) and the deployed weights. They run while the model server is idle and keeps serving. Per run: seconds, seconds per step, peak MLX memory and the image, all under the gitignored `outputs/spike-002/`.
- [ ] **The contact sheet** (`outputs/spike-002/<date>/contact-sheet.html`, gitignored) shows the 18 images with their seconds, and is opened for the owner.
- [ ] **The answer, in one paragraph:** the fastest setting the owner judges good enough, how much faster it is than bf16, its memory, whether LoRAs and edits still work in it, and the follow-up named (a chore that sets the worker's precision or step cache, or nothing).
- [ ] **A budget the owner set.** Proposed: about 45 minutes on the 2026, no downloads. The runs pause if the owner starts a generation, so neither skews the other.

## Technical Notes

- **Nothing in the product changes.** The script calls mflux's Python API directly, like `worker_mlx.py`, but in its own process, never through the model server. It never writes into `~/qwen-model/data`.
- **Memory.** One spike process at a time: about 33 GB in bf16, plus the served model's resident 33 GB. Both fit in 96 GB. The script refuses to start below 48 GiB available, as `spark/mac/start.sh` does.
- **Timing fairness.** Each precision is loaded once, warmed with one 4-step job, and then measured. The script reads the model server's `/health` between runs and waits while a job is running there.

## Findings

_Not yet run._

## Decisions

- **2026-10-21 (owner):** keep serving `790c926` in bf16 with no step cache, and do not run the matrix for now. The pin stays at `790c926`, which is byte-identical to `main` in every weight file.
