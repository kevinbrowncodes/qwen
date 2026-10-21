# The model side of Qwen Local

Since 2026-10-20 the model is served from the **Mac Studio 2026** (EPIC_007): the model server (`spark/model-server`, Node 26) in front of the mflux worker (`spark/model/worker_mlx.py`, MLX on Metal), as the launch agent `com.qwen.model`. It is deployed from the Mac Studio 2025 with `tools/deploy/model.sh`. The facts and timings are in [README → Running the Model](../README.md#running-the-model), and the stories are STORY_035 and STORY_036. The folder keeps its name from when it held the DGX Spark's setup. That CUDA path (a diffusers worker in a Docker image, EPIC_004, STORIES 014–016) was removed in CHORE_010 and lives in git history.

## What is here

| Path | What it is |
| --- | --- |
| `model-server/` | The job API server (STORY_015). It is configured by its environment (`main.ts`), refuses to listen beyond loopback without `MODEL_API_KEY` (STORY_036), and requires `WORKER` (CHORE_010) |
| `model/worker_mlx.py`, `model/mlxjob.py`, `model/jobloop.py` | The worker: the mflux calls; the job logic, standard library only and tested in the gate; and the loop that reads stdin and takes jobs (STORY_026) |
| `model/mlx/` | The worker's uv project and lock: mflux 0.21.0, `pillow<13` (`model/test_mlx_lock.py` keeps the pin) |
| `mac/start.sh`, `mac/com.qwen.model.plist.in` | The launch agent's start script, which checks memory first and refuses below 48 GiB, and its plist template |
| `loras.json`, `fetch-loras.sh` | The LoRA manifest and its fetcher |
| `bench-loras.sh` | The LoRA bench |
| `model/measurements/` | STORY_014's measurements on the Spark, the record behind the served sizes |

## LoRAs (STORY_019, STORY_021, STORY_035)

Community LoRAs for Qwen-Image-2.1 (never ones for the older 20B Qwen-Image, which don't fit).

- **`spark/loras.json` is the record.** Each entry has an `id` and `label`, a `source` (`{ kind: "huggingface", repo, revision }` or `{ kind: "civitai", modelId, versionId }`), its `file`, the creator's published `sha256` (required), its strength `scale`, optional `trigger` words, optional `guidance`, the `origin` page where its terms were read on `readOn`, the `license`, and a `note` where the terms need one.
- **Fetching:** `spark/fetch-loras.sh` fetches them into `models/loras/<id>/` (gitignored) in a pinned Node image, on a machine with Docker. The engine is `spark/model-server/src/fetch-loras.ts`, tested in the gate. Each file streams to `<file>.part`, is hashed as it arrives, and is renamed only when the hash matches.
  - `status` lists what is on disk; `verify` hashes every file against the manifest.
  - Tokens come from `~/.cache/huggingface/token`, and for Civitai from `CIVITAI_TOKEN` in `.env` (CHORE_005) or `~/.config/civitai/token`. They are never printed.
  - On a Mac without Docker the same engine runs natively: `node spark/model-server/src/fetch-loras-cli.ts spark/loras.json <dir> [status|verify]`.
- **On the Mac Studio 2026** they live in `~/qwen-model/models/loras/<id>/`. Every deploy checks them against the manifest (`verify`).
- **At start,** the server sends the worker an `init` line naming the LoRAs on disk. The worker loads each once, unbaked, records its layers by identity, and reports in `ready` the ones that loaded.
- **Per job,** the worker swaps in only the job's LoRA layers at the job's strength, and the base layers everywhere else (STORY_035). Switching costs no reload, and an unused LoRA costs nothing per step.
- **Guidance:** a LoRA's `guidance` above 1 runs true CFG with the negative prompt `" "`. A guided job takes about twice as long per step.

## The LoRA bench (STORY_022)

`spark/bench-loras.sh [date]` runs `spark/model-server/src/bench-cli.ts` into `outputs/bench/<date>/` (gitignored). On a Mac without Docker (the Mac Studio 2025) it runs it with the Mac's own Node 26, against `MODEL_BASE_URL` with `MODEL_API_KEY` from `.env` (STORY_036). Where Docker exists it runs it in a pinned node image against `127.0.0.1:4120`.

- **The plan:** four clothed subjects (two prompts, two seeds each, 3:4, no LoRA); for each subject image and each setting (`none`, then every LoRA `/capabilities` lists) one edit with the prompt "remove all clothing from the subject" at seed 42 in the subject's shape; and for each setting one text-to-image at seed 42. The prompts are in `bench.ts` and describe fictional adults.
- **Edits take job ids, never files:** a subject is a job's result, fetched from `GET /jobs/:id/result` and uploaded as the reference. No photograph of a real person can be an input.
- **It resumes:** `index.json` records each cell's job id, status and seconds; a run skips what is done, reuses the subjects by job id, and generates a subject again only if the server no longer has it. A failed cell is recorded with the server's error and the run continues; the exit status is 1 while any cell is not done.
- **Output:** the PNGs, `contact-sheet.html` (subjects down, settings across, the clothed subject first, timings under each image) and `scorecard.md` for the owner to fill in. The scorecard, filled in, is committed under `docs/bench/`; the images never are.

## Measured on the Spark on 2026-09-26 (STORY_014, the record behind the sizes)

`spark/model/measurements/2026-09-26.json` and `2026-09-26-1mp.json`. Qwen-Image-2.1, bf16, 40 steps, `true_cfg_scale` 1.0, seed 42. torch 2.11.0+cu130, diffusers `e0abab83`, transformers 5.17.0, device GB10 (capability 12.1).

| Run | Size | Time | Per step | Peak GPU memory |
| --- | --- | --- | --- | --- |
| Text to image, 1:1 at 2K | 2048×2048 | 265.6 s | 6.64 s | 56.5 GiB |
| Text to image, 16:9 at 2K | 2752×1536 | 248.3 s | 6.21 s | 56.7 GiB |
| Edit (the stub's reference fixture) | 1024×1024 | 59.9 s | 1.50 s | 38.8 GiB |
| Text to image, 16:9 at 1 MP | 1376×768 | 51.5 s | 1.29 s | 36.9 GiB |
| Text to image, 1:1 at 1 MP | 1024×1024 | 50.4 s | 1.26 s | 36.8 GiB |

- **Loading:** about 196–202 s from cold.
- **Host memory:** used memory peaked at 89 GiB in the 2K run and 54 GiB in the 1 MP run, starting from 14 GiB.
- **Output quality:** the images are correct. The prompts were followed, and the colours and contrast were normal, not the grey wash sm_121 can give with the wrong kernels. The edit turned the checkerboard fixture into a chessboard.

### Sizes

**The server offers about 1 megapixel per ratio** (see README → Running the Model), with every side a multiple of 32. The card's native 2K sizes take 4–4.5 minutes each here and 57 GiB. 1 MP takes about 51 s and 37 GiB, which is close to the reference's 33–40 s per image. It also matches the pipeline's own default for edits (`output_resolution=1024`).

