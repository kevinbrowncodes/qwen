# SPIKE_001 — Can the Mac Studio 2026 draw what the Spark draws

**Status:** Approved by the owner on 2026-10-20 ("agreed run the spike", after naming the machine: "M5 Ultra Mac Studio 96gb ram"). The budget below is proposed; the owner confirms it before the first run on the Mac.
**Created:** 2026-10-20
**Owner's goal behind it (2026-10-20):** retire generation on the DGX Spark and generate on the Mac Studio 2026 instead, images first, video after. This spike answers whether the Mac can take the image work at all, with the same add-ons and the same edit mode, and at what pace; and it writes down, from the files, what the three video stacks on the Spark actually are, so the video half is measured against the right models.

As the owner, I want to know whether Qwen-Image-2.1 on the Mac Studio 2026 (M5 Ultra, 96 GB) draws the same jobs the Spark draws today, with my add-ons and my edits, and how many seconds each takes against the Spark's, so that I can decide whether the Spark's image generation retires, before anyone writes a line of product code.

## Current state (read from the files and both boxes, 2026-10-20)

- **The Spark serves images today.** `qwen-model` and `qwen-app` up 2 days (`docker ps`); `/health` on `127.0.0.1:4120` answers `ready: true, job: null, queued: 0`; GPU utilisation 0 %; 38 GiB free of 121 (`free -g`). The model is Qwen-Image-2.1 in bf16 through diffusers' `QwenImage21Pipeline` (`spark/model/worker.py:166`), 40 steps by default (`worker.py:120`), true CFG only when an add-on carries a `guidance` above 1, with a single-space negative prompt (`worker.py:137-142`). The 3:4 ratio is produced at 896×1184 (`/capabilities`, read today).
- **Two Spark timings exist and disagree.** README › Running the Model: about **51–53 s** per text-to-image at 1 MP and 60 s per edit (measured 2026-09-26). The 2026-10-02 bench scorecard (`outputs/bench/2026-10-02/scorecard.md`, gitignored) records the four clothed subjects at **121–125 s** each (A-1001 123 s, A-1002 125 s, B-2001 122 s, B-2002 121 s). The bench's seconds run from a job's creation to its completion while other jobs queued, so they include waiting. That is why this spike draws its own twin on an idle Spark the same day the Mac runs, measured the same way.
- **The six add-ons and their file formats** (read from the safetensors headers in `models/loras/` today; the manifest is `spark/loras.json`):

  | Add-on id | File | Size | Tensor key prefix | DoRA keys |
  |---|---|---|---|---|
  | `erect-friendofmale` | `qwen2.1_penisV01_000004956.safetensors` | 319 MB | `diffusion_model.` | 0 |
  | `flaccid-lonelycoyote` | `male_anathomy_fu_qwen21.safetensors` | 159 MB | `diffusion_model.` | 0 |
  | `penis-coachbate` | `qwen-image-2.1_penis_coachbate_preview1.safetensors` | 159 MB | `diffusion_model.` | 0 |
  | `uncut-coachbate` | `Uncut Penis - QwenImage2.1.safetensors` | 159 MB | `diffusion_model.` | 0 |
  | `nsfw-thesealpacas-v2` | `NSFW Qwen by TheseAlpacas V2.safetensors` | 80 MB | `diffusion_model.` | 0 |
  | `uncensored` | `qwen-image-2.1-uncensored-lora.safetensors` | 34 MB | `transformer_blocks.` (no `transformer.` or `diffusion_model.` prefix) | 0 |

  mflux documents `PEFT .default`, `transformer.` and `diffusion_model.` formats and refuses DoRA, so five of the six are in a documented format and the sixth needs a load test.
- **The Mac Studio 2026**, as the owner states it: M5 Ultra, 96 GB. On the LAN it is `mac-studio-2026.local` (192.168.1.47) and advertises ssh (`avahi-browse _ssh._tcp`, today). Key auth from the Spark is refused, because the Spark holds no private key (`~/.ssh` has only `authorized_keys` and `known_hosts`). So the Mac half of this spike is run by the owner at the Mac, from the script below; the assistant cannot verify the Mac's chip, memory, macOS version, `uv`, or Draw Things from the Spark, and the script records them first.
- **The video stacks on the Spark are three, and none is Wan 2.2.** The minimax project draws **MiniMax-H3** through ComfyUI (`minimax/spark/comfyui/h3_t2v_prompt.json`: int8 DiT `minimax_h3_fl2va_int8_convrot`, nvfp4 Qwen3-VL-32B text encoder, 1344×768, 124 frames at 24 fps, 20 steps, `res_multistep`/`simple`): **17 min 33 s for a 5 s clip, peak 63–64 GiB** (`minimax/README.md:45`, `minimax/spark/README.md:114`); a +10 s extension 67–71 min. `spark-ltx2` draws **LTX-2.3** (704×1280, 121 frames, 15 steps, `res_2s`): **23–26 min** (`spark-ltx2/README.md:405-409`). `spark-cosmos3` draws **Cosmos 3 Nano** through vLLM-Omni: **50–57 min per clip at 50 steps** (`spark-cosmos3/README.md:92`). Wan 2.2 exists only as files in `~/video-gen/ComfyUI`'s 504 GB of models (`minimax/spark/README.md:44`), not as a served path. (An earlier answer in the session named Wan 2.2 as the minimax model; this is the correction.)
- **Qwen-Image-2.1 on Apple Silicon has no vendor path.** Qwen's documentation covers CUDA, AMD and FlagOS; nothing for Metal or MLX. Two community paths exist, read today: **mflux** (MIT, MLX) added Qwen-Image-2.1 on 2026-09-21 (PR 736) and, in release 0.21.0, editing with up to ten reference images (`mflux-generate-qwen-2.1-edit`) and LoRA on both commands; its docs measure **~1.5 s/step, ~78 s for 40 steps at 1024², bf16, on an M5 Max**, peak ~46 GB bf16 or ~30.7 GB at 8-bit, and give ~85 s as the diffusers-on-MPS reference. **Draw Things** added Qwen Image 2.1 with LoRAs on 2026-09-25 (release 26.0924.0), MiniMax H3 with LoRAs on 2026-09-10 (26.0910.1), LTX-2.3 22B on 2026-03-16, Wan 2.2 14B and 5B in 2025, and ships "performance improvements on M5 Ultra" (26.1008.0, 2026-10-08); it runs headless on macOS as `gRPCServerCLI-macOS`, whose notes confirm images and never mention video.
- **The one M5 Ultra diffusion measurement found** is mflux drawing a FLUX.2 klein 4B image at 1024² in 1.77 s against 7.00 s on an M3 Ultra (theNetworkChuck's published runs). One review anecdote puts a Qwen-Image-2.1 wallpaper at 180 s and 78 GB peak on an M5 Ultra, size and tool unstated. No Ultra-class timing for any video model was found.
- **Why the Mac is worth measuring at all.** The Spark's diffusion pace is bound by its 273 GB/s memory bandwidth (NVIDIA forum: a 5 s Wan 2.2 clip over 30 min on a Spark); Apple states 1.2 TB/s for the M5 Ultra and Neural Accelerators in every GPU core. Metal is not reachable from a Linux container on macOS, so whatever wins here runs natively under launchd, which PATHS already allows for model servers ("native on macOS for Metal; containers reach them at `host.docker.internal`").

## UI Mockup

N/A (a spike: a controlled comparison, a written answer and a decision; no surface changes).

## Acceptance Criteria

- [x] **The Spark twin is drawn on an idle Spark the day of the comparison**, through the job API with nothing queued (`tools/spike/spark-qwen-twin.sh` refuses otherwise): subject A at seed 1001, 3:4 (896×1184), 40 steps, no add-on; the same with `penis-coachbate` (scale 1.0, guidance 3); and the edit `remove all clothing from the subject` of the first image at seed 42 in its shape. Per job: the wall clock from submit to `done`, the server's `createdAt → updatedAt`, the echoed `request`, and the image saved under `outputs/spike-001/<date>/spark/`.
- [ ] **The Mac's facts are recorded before anything is downloaded**: macOS version, chip, memory, the GPU wired-memory limit (`sysctl iogpu.wired_limit_mb`), free disk, whether `uv` is present, and the mflux version pinned; a Mac that lacks `uv` stops there, and the owner decides whether to install it (a host install, said so here).
- [ ] **The same three jobs are drawn on the Mac through mflux** (`tools/spike/mac-qwen-image-bench.sh run`): same prompt, seed, size and steps, bf16; the add-on through `--lora … 1.0 --guidance 3`; the edit from the Spark twin's own first image. Per run: wall clock, seconds per step, peak resident memory from `/usr/bin/time -l`, the mflux metadata sidecar, and the image. A run past the per-run ceiling is killed and recorded as such.
- [ ] **The sixth add-on's format is settled by a load test**: `uncensored` (`transformer_blocks.` keys) either loads in mflux or does not; the Done note says which, and what the fallback is (Draw Things, a key rename, or dropping it).
- [ ] **The measured-vs-asserted table is filled** (below): every Mac number asserted by a source today is replaced by the number measured on the owner's Mac, or marked "not run" with the reason.
- [ ] **The video half is measured by the owner in Draw Things against the Spark's own settings, one clip each**, and recorded in the same table: MiniMax-H3 at 1344×768, 124 frames, 20 steps (the Spark's 17 min 33 s); LTX-2.3 at 704×1280, 121 frames, 15 steps (the Spark's 23–26 min); the variant Draw Things offers (8-bit S, 4-bit S) is written down, since it is not the Spark's int8/bf16. Cosmos 3 Nano is recorded as "no Mac path" with the source, not attempted.
- [ ] **The answer, in one paragraph**: seconds per image on the Mac against the Spark's twin, with and without an add-on, and for an edit; which add-ons load; minutes per clip for H3 and LTX-2.3 against the Spark's; what the memory peaks were against 96 GB; and whether the Spark's image generation can retire, whether its video can, and which story comes first.
- [ ] **The follow-up tickets are named**, not written: if images win, a story that ports `spark/model/worker.py` to mflux's Python API behind the unchanged job API contract and runs it natively on the Mac under launchd; if a video model wins, its own spike or story in its own repo; and the backlog item for whatever lost.
- [ ] **A budget the owner set.** Proposed: the Spark twin ≈ 6 minutes of GPU today; on the Mac, one 33 GB weights download (or a copy of the Spark's `models/Qwen-Image-2.1` over the LAN) and **at most 3 hours of wall clock**, with a per-run ceiling of 30 minutes for images; the video clips are the owner's afternoon in Draw Things, stopped at 45 minutes per clip. The spike stops at the budget.

## Measured vs asserted

| Job | Spark, measured (README, 2026-09-26) | Spark twin, measured today | Mac, asserted by sources today | Mac, measured |
|---|---|---|---|---|
| Text-to-image, 896×1184, 40 steps, bf16 | 51–53 s at 1 MP | **53.1 s** server, 55 s wall (job `3777597f`) | ~78 s on an M5 Max at 1024² (mflux docs); the M5 Ultra has 80 GPU cores to the Max's 40 | |
| Same, with `penis-coachbate` at guidance 3 | about twice the unguided time (README: "about twice the time per image") | **120.2 s** server, 122 s wall (job `39e50b7b`), 2.26× the unguided run | not published | |
| Edit, one reference, 40 steps | 60 s | **59.7 s** server, 61 s wall (job `8547d7dd`) | not published for 2.1 edits; ControlNet q8 at 992×608 and 20 steps ≈ 49 s on an M5 Max (mflux docs) | |
| `uncensored` LoRA loads | loads (served today) | n/a | format undocumented in mflux | |
| MiniMax-H3, 1344×768, 124 frames, 20 steps | 17 min 33 s, 63–64 GiB (minimax) | not re-drawn | Draw Things supports H3 with LoRAs; one M4 Pro 64 GB report of 111 s for a short clip with the 8-bit S model and a turbo LoRA (not comparable settings) | |
| LTX-2.3, 704×1280, 121 frames, 15 steps | 23–26 min (spark-ltx2) | not re-drawn | Draw Things supports LTX-2.3 22B since 2026-03-16; no Ultra timing published | |
| Cosmos 3 Nano | 50–57 min per clip (spark-cosmos3) | not re-drawn | CUDA-only official stack; one unofficial MLX 4-bit port | not attempted |

## The experiment's matrix

| # | Where | Run | Settings | Records |
|---|---|---|---|---|
| S1 | Spark | `spark-qwen-twin.sh` t2i | subject A, seed 1001, 3:4, 40 steps | wall s, server s, image |
| S2 | Spark | t2i + add-on | S1 + `lora: penis-coachbate` (scale 1.0, guidance 3) | wall s, server s, image |
| S3 | Spark | edit | S1's image as the reference, `remove all clothing from the subject`, seed 42, ratio match | wall s, server s, image |
| M0 | Mac | `mac-qwen-image-bench.sh` env | facts first, nothing downloaded | `env.txt` |
| M1 | Mac | `run t2i` | S1's settings through `mflux-generate-qwen-2.1`, bf16 | wall s, s/step, peak RSS, image, metadata |
| M2 | Mac | `run t2i-lora` | M1 + `--lora … 1.0 --guidance 3 --negative-prompt " "` | same |
| M3 | Mac | `run edit` | S1's image, `mflux-generate-qwen-2.1-edit`, seed 42, 896×1184, 40 steps | same |
| M4 | Mac | `run lora-load` | `uncensored` at 4 steps, 512² | loads or the error |
| V1 | Mac, Draw Things | MiniMax-H3 | 1344×768, 124 frames, 20 steps, the variant offered | minutes, peak memory, the variant |
| V2 | Mac, Draw Things | LTX-2.3 | 704×1280, 121 frames, 15 steps, the variant offered | minutes, peak memory, the variant |

## Technical Notes

- **Nothing in the product changes.** The scripts live under `tools/spike/` and touch no route, worker, stub or test. `spark-qwen-twin.sh` is a `curl` client of the job API that already serves the app; `mac-qwen-image-bench.sh` runs mflux through `uvx`. Both read the shared `tools/spike/prompts.sh`, which holds the bench's subject A and edit prompt (`spark/model-server/src/bench.ts:24, 36`) so both boxes draw the same words.
- **The host install, declared.** Metal is not reachable from a Linux container on macOS, so mflux cannot run under Docker there; `uvx --from "mflux==<pin>"` runs it from uv's cache without putting anything on `PATH`, and uv fetches a managed Python if the Mac has none. That cache and the 33 GB of weights (Hugging Face `Qwen/Qwen-Image-2.1`, or `WEIGHTS=/path` to a copy of the Spark's `models/Qwen-Image-2.1`) are the only things the spike puts on the Mac. Draw Things is the owner's App Store install. If `uv` itself is missing, the script stops and says so; installing it is the owner's call.
- **The twin's clock.** The job API exposes `createdAt` and `updatedAt`, not a start time, so the Spark figure is submit-to-done on an idle server, and the Mac figure is the same wall clock around one process. The Mac's seconds per step come from wall clock minus a fixed part the mflux docs put at about 8 s (load, prompt encode, VAE decode); the ticket records wall seconds and leaves the split as an estimate.
- **Guidance on the Mac.** The Spark passes `true_cfg_scale` with a single-space negative prompt (`worker.py:137-142`); mflux applies CFG when `--guidance` is above 1 with `--negative-prompt` given, so the Mac run passes `--guidance 3 --negative-prompt " "`. If mflux treats a single space as no prompt and samples unguided, the log says so and the Done note records the departure.
- **Sizes.** 896×1184 is what the Spark's 3:4 produces and both are multiples of 32, which mflux requires for explicit sizes.
- **Nothing leaves the owner's machines.** The LoRAs and the twin image reach the Mac by `rsync` from `spark-1.local` (`fetch`); results stay under the gitignored `outputs/`. No token is needed: the model repository is public, and the Mac reads no `.env`.
- **Licences are unchanged by the hardware.** Qwen-Image-2.1 stays under the Qwen Research License (non-commercial, decided 2026-09-26), each add-on under the terms in `spark/loras.json`; mflux is MIT. Nothing here is a licence decision.
- **Draw Things is measured by hand** because its headless server's notes do not mention video; the owner sets the Spark's numbers in the app, starts the clock, and writes the variant used. Frames are not compared across silicon; the owner's eye decides whether a clip is usable, as the minimax bench did.

## Testing Plan

- **Unit / integration / e2e: none.** The spike adds no product code: nothing under `app/`, `spark/model`, `spark/model-server`, or the stub changes, and the gate's steps do not touch `tools/spike/`. The three shell scripts are linted with `koalaman/shellcheck:stable` from its official image (containers first), and the twin script is exercised by its real run on the Spark.
- **Manual verification (the Done note records):** the date; the Spark's `/health` before the twin; the three twin rows with job ids, seeds, wall and server seconds; the Mac's `env.txt` (macOS, chip, memory, wired limit, uv, mflux pin); the four Mac rows with seconds, seconds per step, peak RSS and status; whether `uncensored` loaded; the two Draw Things rows with the variant used; the answer paragraph; the follow-up tickets named.

## Estimated Complexity

Small in code (three shell scripts, ≈ 250 lines, linted). Small in GPU on the Spark (≈ 6 minutes). Medium on the Mac: one 33 GB download or copy, then four image runs that the sources put between 1 and 5 minutes each, and two video clips the sources cannot size. **Proposed budget:** 3 hours of wall clock on the Mac for images with a 30-minute per-run ceiling, 45 minutes per video clip, the Spark twin today; the owner confirms before the first Mac run.

## Findings

### The Spark twin (2026-10-20, 16:18–16:22 UTC, by the assistant, `tools/spike/spark-qwen-twin.sh`)

`/health` before: `ready: true, job: null, queued: 0` (saved as `health-before.json`); GPU utilisation 0 % before and after. Three jobs, one after another, nothing else queued. All three answered `done` at 896×1184. The images, status bodies and `results.tsv` are under `outputs/spike-001/2026-10-20/spark/` (gitignored); the Mac's `fetch` copies them over.

| Run | Job | Seed | Add-on (scale, guidance) | References | Server s (`createdAt → updatedAt`) | Wall s (submit → `done`) |
|---|---|---|---|---|---|---|
| S1 t2i | `3777597f` | 1001 | none | 0 | **53.1** | 55 |
| S2 t2i + add-on | `39e50b7b` | 1001 | `penis-coachbate` (1.0, 3), echoed as `loraScale: 1, loraGuidance: 3` | 0 | **120.2** | 122 |
| S3 edit | `8547d7dd` | 42 | none | 1 (S1's image; `ratio: null`, shape matched) | **59.7** | 61 |

What the three rows settle: the README's figures hold on an idle server today (51–53 s and 60 s on 2026-09-26 against 53.1 s and 59.7 s now); an add-on with guidance 3 costs 2.26× the unguided job, as the worker's second pass predicts; and the bench scorecard's 123 s for this same subject and seed is not drawing time, since the bench's clock runs from a job's creation while other cells are in flight. The Mac rows below are measured against these three numbers.

### The Mac (M0–M4)

_Not yet run. The owner runs `tools/spike/mac-qwen-image-bench.sh env`, then `fetch`, then `run` on the Mac Studio 2026, from a clone of this repo at the tag or commit that carries this ticket, and the rows land here._

### Draw Things (V1, V2)

_Not yet run._

## Decisions

_None yet._

## Sources (read 2026-10-20)

- mflux: [repository](https://github.com/mflux-community/mflux), [Qwen-Image-2.1 docs](https://github.com/mflux-community/mflux/blob/main/src/mflux/models/qwen21/README.md), [reference editing docs](https://github.com/mflux-community/mflux/blob/main/src/mflux/models/qwen21/reference/README.md), [release 0.21.0](https://github.com/mflux-community/mflux/releases/tag/v.0.21.0), [PR 736](https://github.com/mflux-community/mflux/pull/736), [PR 741](https://github.com/mflux-community/mflux/pull/741).
- Draw Things: [release notes](https://drawthings.ai/downloads/), [community repository](https://github.com/drawthingsai/draw-things-community), [MiniMax H3 announcement](https://x.com/drawthingsapp/status/2098562413239095349).
- M5 Ultra: [Apple's announcement](https://www.apple.com/newsroom/2026/08/apple-introduces-new-mac-studio-with-m5-max-and-m5-ultra/), [M5 Ultra vs M3 Ultra local AI runs](https://github.com/theNetworkChuck/mac-studio-m5-ultra-local-ai), [MacStories review](https://www.macstories.net/stories/m5-ultra-mac-studio-review-the-dream-mac-for-local-ai-agents/).
- The Spark's pace: [Wan 2.2 on the Spark, NVIDIA forum](https://forums.developer.nvidia.com/t/image-to-video-generation-using-the-spark-vs-pc/370077), [DGX Spark image generation benchmark](https://www.haruni.net/en/blog/dgx-spark).
- LTX-2.3 on Macs: [ComfyUI discussion](https://github.com/Comfy-Org/ComfyUI/discussions/14093), [LTX-2 on Apple Silicon issue](https://github.com/Lightricks/ComfyUI-LTXVideo/issues/386), [LTX 2.3 on an M2 Max](https://smeltcore.com/recipes/ltx-video-2-3-m2-max/).
- Cosmos 3 Nano: [vLLM-Omni recipe](https://github.com/vllm-project/vllm-omni/blob/main/recipes/cosmos3/Cosmos3-Nano.md), [model card](https://huggingface.co/nvidia/Cosmos3-Nano), [unofficial MLX port](https://github.com/publu/cosmos-mac).
