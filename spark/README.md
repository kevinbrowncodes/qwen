# The Spark side of Qwen Local

The scripts here are the record of how the DGX Spark serves the model ([CLAUDE.md → §4a](../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)). A change made by hand on the box that is not written here does not exist the next time it is rebuilt.

## The Spark, as read on 2026-09-26 (STORY_014)

| Item | Value |
| --- | --- |
| Machine | NVIDIA DGX Spark, GB10 (sm_121, Blackwell), aarch64, 20 cores |
| OS | Ubuntu 24.04.4 LTS, kernel 6.17.0-1014-nvidia |
| Driver / CUDA | 580.142 / CUDA 13.0 |
| Memory | 121 GiB unified. `nvidia-smi` cannot report memory on this box (it prints "Not Supported"), so `free` / `/proc/meminfo` is the truth |
| Disk | 3.7 TB, 855 GB free after the weights |
| Docker | 29.2.1 |
| Also running | minimax-app (port 3000), minimax-adapter (127.0.0.1:4020), minimax-comfyui-nsfw (127.0.0.1:8189; idle, holding 351 MiB of GPU memory), spike001-review (192.168.1.33:8790), and qwen-app (port 3100) |

**Never stop another project's container to free memory.** List what is running and ask the owner. The scripts here refuse to start below 60 GiB available instead.

## Weights

`models/Qwen-Image-2.1/` (gitignored) holds `Qwen/Qwen-Image-2.1` at revision `790c926`: 28 files, 33.13 GB, fetched by `spark/fetch-weights.sh` (CHORE_002). The license is the Qwen Research License: **non-commercial use only**. It was read from the repo's LICENSE file on 2026-09-26, before the fetch.

## The model image (`spark/model/`)

`spark/model/Dockerfile` builds `qwen/model:dev`. Nothing is installed on the host.

- **Base:** `nvidia/cuda:13.0.2-runtime-ubuntu24.04`, pinned by digest (the sibling minimax project's base, known to work here).
- **PyTorch:** 2.11.0+cu130 from `download.pytorch.org/whl/cu130`, the only index with aarch64 + CUDA 13 wheels. It runs on sm_121 through the sm_120 family target.
- **diffusers:** git main at `e0abab83` (2026-09-26). `QwenImage21Pipeline` is not in any release yet; it was added on main in `6256aa7666`.
- **transformers:** 5.17.0, the model card's minimum.
- **Not used:** the NGC `pytorch` image. The spark-ltx2 project found its kernels give subtly wrong (grey, washed-out) output on sm_121.

```bash
docker build -t qwen/model:dev --build-arg UID=$(id -u) --build-arg GID=$(id -g) -f spark/model/Dockerfile spark
spark/model/try.sh      # STORY_014: renders by hand, records time and memory in spark/model/measurements/<date>.json
```

## Add-ons (STORY_019, STORY_021)

Community LoRAs for Qwen-Image-2.1 (never ones for the older 20B Qwen-Image, which don't fit).

- **`spark/loras.json` is the record.** Each entry has an `id` and `label`, a `source` (`{ kind: "huggingface", repo, revision }` or `{ kind: "civitai", modelId, versionId }`), its `file`, the creator's published `sha256` (required), its strength `scale`, optional `trigger` words, optional `guidance`, the `origin` page where its terms were read on `readOn`, the `license`, and a `note` where the terms need one.
- **`spark/fetch-loras.sh`** fetches them into `models/loras/<id>/` (gitignored). The engine is `spark/model-server/src/fetch-loras.ts` (tested in the gate), run in the pinned `node:26-bookworm-slim` image; the file streams to `<file>.part`, is hashed as it arrives, and is renamed only when the hash matches. `status` lists what's on disk; `verify` hashes every file against the manifest. Tokens come from `~/.cache/huggingface/token`, and for Civitai from `CIVITAI_TOKEN` in the repo's `.env` (CHORE_005; the file is mounted read-only and parsed by the engine, never by the shell) or else `~/.config/civitai/token`, all mounted read-only when present and never printed; Civitai answers 401 without one, so a Civitai entry with no token is reported as waiting and the script exits 1.
- **Mounts:** `spark/compose.yaml` mounts the manifest at `/srv/loras.json` and the files at `/loras`, both read-only.
- **At start,** the model server sends the worker an `init` line naming the add-ons that are on disk. The worker loads each with `load_lora_weights` (this needs `peft`, pinned in the image), unfused, and reports in `ready` the ones that loaded. One that fails to load is logged and never offered.
- **Per job:** `set_adapters([id], [scale])` for the one the job names, or `disable_lora()`. An add-on's `guidance` goes to the pipeline as `true_cfg_scale` for that job, with the empty negative prompt `" "` the pipeline needs before it applies guidance at all (without one it logs a warning and samples unguided). The default is 1.0, no guidance; above 1 the pipeline runs a second pass per step, so the job takes about twice as long.
- **Verified 2026-09-29:** both add-ons installed then load. diffusers converts the Kohya/Comfy keys (`diffusion_model.…`) and the PEFT keys alike. The worker's peak is 40.0 GiB with both loaded, against 36.9 GiB without.
- **Installed 2026-10-02 (STORY_021):** `penis-coachbate`, `uncut-coachbate` and `nsfw-thesealpacas-v2`, from byte-identical Hugging Face mirrors of the creators' Civitai files. `erect-friendofmale` and `flaccid-lonelycoyote` exist only on Civitai; fetched on 2026-10-07 with the key in `.env` (CHORE_005), both sha256 ok. The measurements are in the story's Done note.

## The add-on bench (STORY_022)

`spark/bench-loras.sh [date]` runs `spark/model-server/src/bench-cli.ts` in the pinned node image on the host's network, against `127.0.0.1:4120`, into `outputs/bench/<date>/` (gitignored).

- **The plan:** four clothed subjects (two prompts, two seeds each, 3:4, no add-on); for each subject image and each setting (`none`, then every add-on `/capabilities` lists) one edit with the prompt "remove all clothing from the subject" at seed 42 in the subject's shape; and for each setting one text-to-image at seed 42. The prompts are in `bench.ts` and describe fictional adults.
- **Edits take job ids, never files:** a subject is a job's result, fetched from `GET /jobs/:id/result` and uploaded as the reference. No photograph of a real person can be an input.
- **It resumes:** `index.json` records each cell's job id, status and seconds; a run skips what is done, reuses the subjects by job id, and generates a subject again only if the server no longer has it. A failed cell is recorded with the server's error and the run continues; the exit status is 1 while any cell is not done.
- **Output:** the PNGs, `contact-sheet.html` (subjects down, settings across, the clothed subject first, timings under each image) and `scorecard.md` for the owner to fill in. The scorecard, filled in, is committed under `docs/bench/`; the images never are.

## Measured on 2026-09-26 (STORY_014)

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

## The model server (STORY_015, STORY_016)

- **The image:** `qwen/model:dev` runs `node /srv/model-server/src/main.ts`. The server owns the contract (HTTP, validation, a queue that runs one job at a time and holds up to 8 waiting, cancel, results on disk). It starts `python3 /srv/model/worker.py` and talks to it in JSON lines (`spark/model-server/src/protocol.ts`). If the worker dies, the server fails the job it was running and restarts the worker.
- **Starting it:** `spark/up.sh` builds and starts the `qwen-model` service (`spark/compose.yaml`, project `qwen-spark`):
  - GPU, `restart: unless-stopped`;
  - weights read-only, outputs in `spark/data/outputs/`;
  - on the docker network `qwen`, and on the host only at `127.0.0.1:4120`.
- **Verified against the real model on 2026-09-26:**
  - text to image, 1376×768 in 53 s;
  - a cancel at 25%, after which the worker went straight to the next job;
  - an edit in 61 s, which kept the reference's 16:9 shape and changed only what was asked;
  - through the UI: text to image 52 s, Download, Edit 60 s, a generation left running that finished in the sidebar, and Stop.
