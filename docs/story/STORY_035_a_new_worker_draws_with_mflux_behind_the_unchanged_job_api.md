# STORY_035 — A new worker draws with mflux on the Mac Studio 2026, behind the unchanged job API

**Epic:** [EPIC_007](../epic/EPIC_007_the_app_runs_on_the_mac_studio_2022_and_draws_on_the_mac_studio_2026.md)
**Status:** Done (2026-10-20). Self-approved that night under the owner's overnight authorisation (EPIC_007 › decision 6: "Yes, self-approve, one at a time"); the owner reviews it in the morning.
**Created:** 2026-10-20. Numbered 035, after STORY_034 (Done).

As the owner, I want the model server's worker to draw Qwen-Image-2.1 with mflux on the Mac Studio 2026: text-to-image, edits, my LoRAs and their guidance, progress, and Stop, all as the Spark's worker did. Then the 2026 can take over from the Spark with nothing in the app or the job API changing.

## Current state

Read on 2026-10-20:

- **The worker today** (`spark/model/worker.py`) is diffusers' `QwenImage21Pipeline` on CUDA.
  - It speaks JSON lines to the TypeScript model server (`spark/model-server/src/protocol.ts`):
    - `init` with the LoRAs, `job`, `cancel` in;
    - `ready` with the LoRAs that loaded, `progress`, `done`, `failed`, `cancelled` out.
  - Reading stdin, the stops and the loop that takes jobs are `jobloop.py`. It is standard library only and tested in the gate (`spark/model/test_jobloop.py`, run by `model-server`'s `test` script with `python3 -m unittest`).
  - `worker.py` loads every LoRA once, unfused, and enables only the job's LoRA at its scale (`use_lora`).
  - A LoRA's `guidance` above 1 becomes `true_cfg_scale` with the negative prompt `" "`.
  - `png_info` writes the STORY_024 settings lines, with the size appended to the Size line.
  - A CUDA out-of-memory error answers `failed` with "The Spark ran out of memory for this image; try a smaller one."
- **The server takes the worker as configuration.** `WORKER` is the command, split on spaces; the defaults are `LORA_MANIFEST`, `LORA_DIR` and `OUTPUT_DIR` (`main.ts`). It sends `width` and `height` for a text-to-image job and for an edit with a chosen ratio. With neither, the edit takes its reference's shape at about 1 MP.
- **mflux 0.21.0** (read from the installed package on the Mac Studio 2026):
  - **One class can do both jobs.** `QwenImage21Edit.generate_image` takes zero to ten `image_paths`. With none and an explicit `width` and `height` it is text-to-image. With references and no size, it sizes the output from the reference at `output_resolution=1024`, about 1 MP, as the Spark's pipeline does. A guidance above 1 needs a `negative_prompt`, so `" "` is passed.
    - **Loading `QwenImage21` as well would hold the 33 GB model twice.**
  - **Progress and Stop.** After every step the loop calls each registered in-loop callback (`ctx.in_loop(t, latents)`, `qwen_image_21_edit.py:189`). Only `KeyboardInterrupt` is caught there, so an exception raised from a callback ends the job at that step, as `worker.py`'s `Cancelled` does in diffusers.
  - **LoRAs.** With `bake_lora=False` they stay as layers: a `LoRALinear` with a `scale`, or a `FusedLoRALinear` holding a list of them when several LoRAs target one layer. Per-job switching is therefore possible without a reload, by setting each LoRA's scale. The default bakes them into the weights, which is what SPIKE_001 measured (M2: 63 s of steps).
- **SPIKE_001 on the 2026:**
  - M1, text-to-image: 35.6 s of steps;
  - M2, with a LoRA at guidance 3: 63.0 s;
  - M3, an edit: 41.0 s;
  - peak MLX memory 36.5 GB;
  - all six LoRAs load.

  mflux 0.21.0 needs `pillow<13`: Pillow 13.0.0's `PIL/_typing.py` fails to import on CPython 3.14.7 and 3.13.16. uvx ran Python 3.14.7 and MLX 0.32.4.

## UI Mockup

UI Mockup: N/A (no UI change). The worker sits behind the model server, and the app and the job API do not change.

## Acceptance Criteria

**The same protocol**

- [x] `spark/model/worker_mlx.py` speaks `protocol.ts` unchanged, and reuses `jobloop.py` unchanged:
  - it reads `init`, then answers `ready` with the ids of the LoRAs that loaded;
  - it runs jobs one at a time, sending `progress` after every step and then `done`, `failed` or `cancelled`.

  The model server needs no code change, only its `WORKER` command.
- [x] **One model.** It loads `QwenImage21Edit` once, in bf16, from `WEIGHTS`. It serves text-to-image (no references, the job's width and height) and edits (the job's references; the job's size if given, else the reference's shape at about 1 MP).
- [x] **Stop.** A `cancel` for the running job ends it at the next step and answers `cancelled`, and the next job then runs. A `cancel` for a waiting job is handled by `jobloop.py` as today.
- [x] **A LoRA per job, with no reload.** Every LoRA in `init` is loaded once, unbaked. A job gets only its own LoRA at its scale, or none, and switching between jobs reloads nothing. A LoRA that fails to load is logged to stderr and left out of `ready`, so the server never offers it.
- [x] **Guidance.** A job whose LoRA has `guidance` above 1 runs with that guidance and the negative prompt `" "`. Every other job runs at guidance 1.
- [x] **The PNG's settings.** A job with `parameters` writes them as the PNG's `parameters` text chunk, with ` · W × H` appended to the Size line, exactly as `worker.py` does.
- [x] **Failure messages name no machine.** Running out of memory answers `failed` with "The model server ran out of memory for this image; try a smaller one." Any other error answers `failed` with its type and message, cut to 300 characters, and the worker stays up.

**Pinned, with a gate**

- [x] The worker's Python stack is a uv project, `spark/model/mlx/pyproject.toml` plus `uv.lock`, with `mflux==0.21.0` and `pillow<13`, and a pinned Python version.
- [x] A gate test fails when `uv.lock` resolves Pillow 13 or later while mflux is 0.21.0. Its message quotes SPIKE_001's import error, and says the fix is to keep the pin until an mflux release works with Pillow 13.

**Measured on the Mac Studio 2026 (manual; never a gate)**

- [x] Run the worker by hand with SPIKE_001's three jobs, fed as protocol lines with S1's seed, size and steps. Record seconds per job against the spike's 35.6, 63.0 and 41.0 s and the Spark's 53.1, 120.2 and 59.7 s:
  - text-to-image;
  - the same with `penis-coachbate` at guidance 3;
  - the edit of the Spark's S1 image.

  Also record the peak memory, and the step time of a job without a LoRA while LoRAs are loaded unbaked, against the spike's baked 0.89 s per step.
- [x] Switching from one LoRA to another, and then to none, across three consecutive jobs costs no reload: the log shows no load between jobs.
- [x] A cancel during a job answers `cancelled` within about one step, and the next job completes.

## Departures from the reference

None for the reference UI. Against the Spark's worker:
- **Images differ for the same seed.** MLX's random numbers are not CUDA's, which CLAUDE.md §6 rule 10 already allows.
- **An edit with several references** takes its default shape from the **last** reference in mflux, and from the first in diffusers. Every edit in the owner's history has had one reference.

## Technical Notes

- **The split that keeps it testable.** `spark/model/mlxjob.py` is standard library only, so it is tested in the gate like `jobloop.py`. It holds:
  - the arguments for `generate_image` from a job (size, references, guidance, negative prompt);
  - the LoRA plan: which loaded LoRA gets which scale, and the rest 0;
  - the PNG settings text;
  - the failure message.

  `worker_mlx.py` holds only the mflux and MLX calls, and is exercised on the 2026.
- **Switching LoRAs.** Load each LoRA with `bake_lora=False` and record the layers each one created, by object identity, under its id. Per job, set each recorded layer's `scale` to the job's scale for the chosen LoRA, and to 0 for the others.
  - A LoRA at scale 0 still costs its small matmul in each layer. The measurement says what that costs per step. If it is more than 15% against the baked spike, the layers' lists are swapped per job instead (`FusedLoRALinear.loras`), and the Done note records it.
- **Progress and Stop.** A callback object registered in `model.callbacks`, with mflux's in-loop protocol, sends `progress`. It raises `Cancelled` when `jobloop` says the job was stopped. The generate call is wrapped as in `worker.py`.
- **Out of memory.** MLX raises a `RuntimeError` whose message mentions memory, not a typed error. `mlxjob.failure_message` maps that to the memory message.
- **Seeds.** mflux takes `seed` directly.

## Testing Plan

- **Unit, Python** (`spark/model/test_mlxjob.py`, new; standard library; run by `model-server`'s `test` script beside `test_jobloop.py`):
  - **Text-to-image arguments:** prompt, seed, steps, width and height; no `image_paths`; guidance 1 and no negative prompt.
  - **An edit with a chosen size:** `image_paths` in order, plus the size. **An edit without a size:** `image_paths` and no width or height, so mflux sizes it from the reference.
  - **Guidance:** a LoRA with guidance 3 gives guidance 3 and negative `" "`. Guidance 1, or no guidance, gives neither.
  - **The LoRA plan:** a job with LoRA `b` at 0.8 over loaded `a`, `b`, `c` gives `{a: 0, b: 0.8, c: 0}`. No LoRA gives all 0. A LoRA that did not load raises "the add-on b is not loaded", as `worker.py`'s `use_lora` does.
  - **PNG settings:** the lines with ` · 896 × 1184` appended to `sizeLine`. An out-of-range `sizeLine` leaves the lines unchanged, and no `parameters` gives no text.
  - **Failure messages:** a `RuntimeError` mentioning memory maps to the memory message, which names no machine. Anything else gives `Type: message` cut to 300 characters.
- **Unit, Python** (`spark/model/test_jobloop.py`): unchanged, and its staying green proves the loop the new worker reuses.
- **Unit, the pin gate** (`spark/model/test_mlx_lock.py`, new; standard library): reads `spark/model/mlx/uv.lock` and asserts mflux is 0.21.0 and Pillow is below 13. A second case, on a lock text with Pillow 13.0.0, proves the failure message.
- **Integration: not applicable as new tests.** The server's integration cases (`spark/model-server/src/server.test.ts`) run against `fake-worker.ts`, which speaks the same protocol. The protocol is unchanged, so they still cover the server's half: Stop, queue, restart, LoRAs. The real worker cannot run in the gate (no Metal in a Linux container), which is the manual part.
- **E2E: not applicable.** The app and the stub do not change.
- **Manual, on the Mac Studio 2026:** the three measured criteria above. They are run by feeding protocol lines to `worker_mlx.py` under `uv run`, with `WEIGHTS` set to the spike's copy at `790c926` and the LoRAs from the spike. The Done note records the model, the checkpoint and the date.

## Estimated Complexity

Medium:
- a 150-line worker;
- a 120-line pure module with its tests;
- a uv project with a lock;
- a pin gate.

The risk is the per-job LoRA switch inside mflux's layers, which the manual run measures.

## Corrections made during implementation (2026-10-20)

- **Switching LoRAs swaps layers, not scales (Technical Notes).** The planned way was to load every LoRA unbaked and set each one's `scale`, with the unused ones at 0. On the Mac Studio 2026, with three LoRAs loaded, that cost **17–37% per step**:
  - text-to-image 1.079 s/step, against the spike's baked 0.89;
  - with a LoRA 2.153, against 1.58;
  - edit 1.204, against 1.03.

  That is over the 15% the notes allowed, so the fallback they named was built. `worker_mlx.Loras` records, for every layer that carries a LoRA, the base layer and each LoRA's layer object, by identity. Per job it puts the job's LoRA layer in place where that LoRA has one and the base layer everywhere else, using mflux's own `_replace_target_module`. An unused LoRA then costs nothing per step.
- **One class.** `QwenImage21Edit` serves both kinds of job, as planned. No text-to-image class is loaded.

## Done note (2026-10-20)

Run on the Mac Studio 2026: M5 Ultra, 96 GB, macOS 27.0.1. Qwen-Image-2.1 at `790c926`, bf16, mflux 0.21.0, MLX 0.32.4, Python 3.14.7, Pillow 12.3.0. The worker ran from `~/qwen-worker-test`, driven over its protocol by a script, with `penis-coachbate`, `uncensored` and `nsfw-thesealpacas-v2` loaded (224, 128 and 224 layers).

| Job (SPIKE_001's settings) | Job s | s/step | Spike (one-shot CLI, baked) | Spark twin |
|---|---|---|---|---|
| Text-to-image, 896×1184, 40 steps, seed 1001 | **35.1** | 0.849 | 35.6 s of steps | 53.1 s |
| The same with `penis-coachbate` 1.0, guidance 3 (guided) | **75.0** | 1.843 | 63.0 s of steps | 120.2 s |
| Edit of the Spark's S1 image, seed 42, the reference's shape (896×1184) | **50.4** | 0.973 | 41.0 s of steps | 59.7 s |
| Text-to-image again, after the LoRA job | 38.2 | 0.849 | — | — |

- **Ready** in 4.7 s with three LoRAs (14.1 s on the first run, with a cold file cache). The Spark took 3.3 minutes. Peak resident memory was 32.8 GB of 96.
- **A LoRA job costs about 17% more per step than the baked spike** (1.843 against 1.58 s/step). That is the price of keeping LoRAs switchable rather than baking one in; it is still 38% faster than the Spark's job.
- **Switching costs nothing.** Nine 512² jobs alternating no LoRA, X, Y, X, none, Y, Z, Z, X each took 1.1–1.2 s, and the log shows no load between jobs. Changing the size costs nothing either: 1376×768, 896×1184 and 512² in alternation took 4.4–5.0 s per 4-step job at about 1 MP.
  - One 512² LoRA job in the main run took 13.6 s. It did not reproduce in either of those runs and is recorded as a one-off.
- **Stop.** A cancel sent at step 5 was answered `cancelled` 0.85 s after the last progress line, about one step, and the next job completed.
- **The protocol is unchanged.** The driver saw only protocol lines on stdout; mflux's progress bars and notes went to stderr.
- **Gate:** `test_mlxjob.py` (13 cases) and `test_mlx_lock.py` (2 cases) run in step 3 beside `test_jobloop.py`. The whole gate is green through `tools/gate/remote.sh` on the Mac Studio 2022 in 163 s. The first run failed once in step 3 on `server.test.ts`'s "/health … last spoke" case. That is the known flake [BUG_012](../bug/BUG_012_the_model_servers_health_test_sometimes_misses_the_stop_stamp.md), not this story: the A/B passed on this tree twice and on the pushed baseline once.
- **Images:** under `~/qwen-worker-test/out/` on the 2026, not in git. As CLAUDE.md §6 rule 10 says, no test depends on them.
