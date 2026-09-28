# Qwen Local

> A self-hosted image generation workstation: a web UI that copies the image generation surface of [chat.qwen.ai](https://chat.qwen.ai), backed by **Qwen-Image-2.1** served on the owner's NVIDIA DGX Spark.

> This README is the source of truth for **what the project is**. How we work (tickets, testing bar, gates, guardrails) lives in [CLAUDE.md](CLAUDE.md).

**Status (2026-09-26):** greenfield. Nothing below the MVP Scope and Architecture sections is decided yet; each `TBD` is filled in by the story that settles it.

---

## Purpose

Generate images locally on a DGX Spark, through an interface that matches the Qwen chat web app's image generation flow, instead of generating in their cloud or using a generic frontend. Sibling project: [minimax](https://github.com/kevinbrowncodes/minimax) does the same for video against agent.minimax.io; this repo reuses its methodology, not its code.

## MVP Scope

**In scope — the image generation flow, end to end (owner's decision 2026-09-26: editing is in the MVP):**

- Prompt entry in image generation mode, with reference image attachment (text-to-image and image editing)
- The generation options the reference exposes (size / aspect ratio and whatever else recon enumerates)
- Submit, with the job's progress shown while it runs, and cancel
- Result display in place, and download
- History / gallery of past generations, with reopen

**Out of scope until the MVP epic is Done** — chat, video generation, voice mode, artifacts, deep research, anything else chat.qwen.ai does. These live in `docs/backlog/` as they come up ([CLAUDE.md → §3c](CLAUDE.md#3c-how-backlog-is-tracked)) and are never built early.

## Architecture

Two machines:

| Machine | Role | Reached via |
| --- | --- | --- |
| **Mac** | Development, the UI, the whole test gate | local |
| **DGX Spark** | Runs the image model behind an async job API | LAN; the owner opens this repo on the Spark for the model epic's work |

The UI talks to the generation server through configuration only (base URL, optional key). The protocol is an async job: create a generation, poll its status, fetch the result file. Locally the same variables point at a **stub generation server** that returns scripted outcomes and a tiny fixture image, so nothing in the test gate depends on the Spark being reachable.

Work is planned as two phases:

1. **UI recon and rebuild**: capture the reference's image generation surface, harvest its stylesheets, icons and markup, then build it with our own code driving those lifted assets. The Playwright session was withdrawn because the reference's access check rejects the automated browser. The 2026-09-26 capture was made in the owner's own Chrome and is processed offline (see [Running Recon](#running-recon) and [CLAUDE.md → §3e](CLAUDE.md#3e-how-recon-is-recorded)).
2. **Image model on the Spark** — serve Qwen-Image-2.1 on the Spark behind the job API, with the license question settled first. See [Running the Model](#running-the-model) for the open question this phase starts with.

## Tech Stack

**Reference (observed 2026-09-26, logged out, 1440×900):** a versioned `qwen-chat-fe` bundle (0.3.11 that day) served from Alibaba's CDN; no Next.js or Nuxt markers visible from outside, so the reference's framework is unidentified. Body text uses a system-ui stack that names Inter and NotoSansHans; only the KaTeX web fonts actually load. The app's own API is under `/api/v2/` on the same origin.

**Ours:** TypeScript everywhere, `strict: true`. Node 26, pnpm 10 workspaces. Recon: Playwright 1.63 + Vitest. App stack is chosen in EPIC_002 with Next.js App Router as the working assumption — our choice for familiarity with the sibling project, not a match of the reference, since theirs is unidentified.

## Project Structure

Present today: `app/`, `tools/gate/`, `tools/stub-generation-server/`, `tools/lan-name/`, `recon/`, `spark/` (model image, model server, worker, service), `docs/` (including `docs/contracts/`), `compose.yaml`, the workspace files. The rest is created by the epics that need it. The gitignored `models/` holds weights on the Spark.

```
app/          the UI
tools/        the stub generation server, its fixture image, the qwen.local name and proxy, other dev tooling
spark/        scripts and unit files that set up and run the model on the Spark
recon/        recon scripts (the offline curate/harvest/interactions pipeline; profile and raw output are gitignored)
docs/
  epic/       EPIC_NNN_*.md
  story/      STORY_NNN_*.md
  bug/        BUG_NNN_*.md
  backlog/    BACKLOG_NNN_*.md
  chore/      CHORE_NNN_*.md
  recon/      dated captures, DOM snapshots, harvested assets (css, icons, fonts, brand),
              measured tokens, component inventory, interaction notes
```

## Features

The reference surface is recorded in [docs/recon/2026-09-26/](docs/recon/2026-09-26/):
- [coverage.md](docs/recon/2026-09-26/coverage.md): which states were captured;
- [inventory.md](docs/recon/2026-09-26/inventory.md): every component;
- [interactions.md](docs/recon/2026-09-26/interactions.md): how the flow behaves, and how each option maps onto the local model;
- [tokens.md](docs/recon/2026-09-26/tokens.md): the design tokens.

Our feature list follows the MVP Scope above.

## Testing

The bar (the 70/20/10 pyramid, and no test may depend on the real model) is in [CLAUDE.md → §3](CLAUDE.md#3-how-features-are-built-important). The lanes, all run inside the gate container by `tools/gate/run.sh`:

| Lane | Command | What it runs |
| --- | --- | --- |
| Unit | `pnpm test` | `app/lib/**/*.test.ts(x)` (jsdom), the stub's own tests, `recon/`'s tests, and the gate script's tests |
| Integration | `pnpm test:integration` | The app's route handlers called directly against the stub started in-process, with history in a real temp file (`app/test/integration/`) |
| E2E | `pnpm test:e2e` | Playwright against the **production standalone build** and the stub, both started by `app/playwright.config.ts`. Two projects: `desktop` at the recon's 1437×1031, and `narrow` as iPhone 13 |

- **The stub generation server** (`tools/stub-generation-server/`, [README](tools/stub-generation-server/README.md)) implements [the job API contract](docs/contracts/job-api.md) with outcomes chosen by name (`X-Stub-Script`), advancing one step per status poll, never by wall clock.
- **E2E fixtures** (`app/e2e/fixtures.ts`) reset the stub before every test, fail any test that ends with a stub job still running, and provide `submitAndWait` (the terminal-status wait registered before the submit) and `expectImageLoaded`. ESLint forbids `waitForTimeout` and `setViewportSize` in specs.
- **Coverage floors** (the app's unit and integration lanes, and the stub) were set at the measured baseline minus 2 on 2026-09-26, and only ever go up. When a lane fails, the gate lists the files with the most uncovered branches.
- **The pre-push hook** (`.husky/pre-push`) runs the whole gate on every push to `develop` and refuses the push if it fails. `pnpm install` inside the gate installs it (it sets `core.hooksPath`); `tools/gate/install-hooks.sh` does the same for a fresh clone.

## Running Recon

The reference is captured in the owner's own signed-in browser. The automated Playwright session was withdrawn (STORY_001) because chat.qwen.ai's access check rejects it. The owner's capture goes in `recon/out/<date>/` (gitignored):
- `extension/<state>@<width>.json`: per-state DOM readings;
- `extension/notes*.md` and `extension/network-endpoints.json`;
- `Qwen.html`: Chrome's "Save Page As, complete" of the signed-in home, with its `Qwen_files/` folder;
- `assets/css/`: the stylesheets.

Three offline steps, run on the Spark inside the official Playwright image (the host needs only Docker), turn that into `docs/recon/<date>/`:

```bash
recon/run.sh curate 2026-09-26        # readings, cleaned snapshot, manifest, coverage (STORY_002)
recon/run.sh harvest 2026-09-26       # stylesheets, every sprite icon, logo, tokens (STORY_003)
recon/run.sh interactions 2026-09-26  # endpoints and component inventory (STORY_004)
recon/run.sh test                     # recon unit tests; recon/run.sh typecheck for the typecheck
```

Each step makes no network request. Each runs an identity guard first: it reads the owner's name and avatar from the saved page, and it writes nothing if either, or a link to an image generated on the reference, would land in `docs/recon/`. `interactions.md` in the same folder is written by hand.

`recon/run.sh login` and `recon/run.sh check` still exist from the withdrawn STORY_001, but nothing depends on them. The container's pnpm cache lives in `recon/.cache/`. See [CLAUDE.md → §3e](CLAUDE.md#3e-how-recon-is-recorded).

## Running the UI

Everything runs on the Spark in containers from `compose.yaml` (project `qwen`); the host needs only Docker. Port **3100** is ours, and port 3000 belongs to the sibling minimax app. VS Code forwards 3100 to the Mac.

**On the LAN, the app is at http://qwen.local** (CHORE_004). Two small services give it that name:

- **`lan-name`** (`qwen-lan-name`, `tools/lan-name/`) answers mDNS queries for `qwen.local` with the Spark's current LAN address. It runs with host networking beside the host's avahi-daemon. It doesn't publish through avahi, because AppArmor refuses containers the host's D-Bus.
- **`proxy`** (`qwen-proxy`, Caddy) owns port **80** on the Spark. It sends `qwen.local` to `qwen-app:3100`, and any other name gets a 404. Another project's name can be added as a site in `tools/lan-name/Caddyfile`.

`http://192.168.1.28:3100` and `http://spark-1.local:3100` keep working.

```bash
tools/gate/build.sh                              # once: the toolchain image qwen/gate:1.63.0-node26
tools/gate/run.sh                                # the whole gate: install, typecheck, lint, test, integration, build, e2e
tools/gate/run.sh --from 4                       # resume from a step after a fix; or name steps: run.sh lint build
docker compose --profile dev up app-dev          # next dev with hot reload on http://localhost:3100
docker compose up -d --build app                 # the production image on http://localhost:3100 (stop app-dev first)
```

The UI reads `MODEL_BASE_URL` (the generation server, no trailing slash), `MODEL_API_KEY` (optional) and `HISTORY_FILE` (where history is kept; `/data/history.json` in the `app-data` volume). Set them in a gitignored `.env` beside `compose.yaml`.

## Running the Model

**Status (measured on the Spark on 2026-09-26; verify before relying on it):** Qwen-Image-2.1 serves from the `qwen-model` container. The app at http://localhost:3100 generates with it end to end.

| Item | Value |
| --- | --- |
| Serving stack | The model server (`spark/model-server`, TypeScript, speaks [the job API contract](docs/contracts/job-api.md)) in front of a Python worker (`spark/model/worker.py`) running diffusers' `QwenImage21Pipeline`, both in the `qwen/model:dev` image (`spark/model/Dockerfile`) |
| Model / checkpoint | `Qwen/Qwen-Image-2.1` @ `790c926`, bf16, 40 steps, no guidance (the card's default), in `models/Qwen-Image-2.1` (33.1 GB) |
| Licence | Qwen Research License: **non-commercial only**. Decided 2026-09-26, see below |
| Sizes served | About 1 megapixel per ratio: 1:1 1024², 16:9 1376×768, 9:16 768×1376, 4:3 1184×896, 3:4 896×1184, 3:2 1248×832, 2:3 832×1248. An edit takes its reference's shape at about 1 MP, or the ratio chosen for it (STORY_017). |
| Time per image | About **51–53 s** (text to image) and 60 s (edit) at 1 MP. The card's 2K sizes take 248–266 s, so they are not offered |
| Memory | Peak **36.9 GiB** on the GPU at 1 MP (56.7 GiB at 2K); the host's used memory rose from 14 to about 54 GiB. A cold start loads for about 3.3 minutes |
| Port / env vars | `qwen-model:4120` on the docker network `qwen` (host: `127.0.0.1:4120` only). The app reads `MODEL_BASE_URL` (default `http://qwen-model:4120`) and optionally `MODEL_API_KEY` |
| Moderation | None: the model ships no safety checker, so a job never ends `moderated` |

```bash
spark/up.sh                            # start the model server (reads what runs first; refuses below 60 GiB free)
curl -s 127.0.0.1:4120/health          # {"ok":true,...,"ready":true} once loaded
docker logs -f qwen-model              # the server's and the worker's log
docker compose -f spark/compose.yaml down   # stop it (frees about 37-54 GiB)
```

Results, uploads and the job index are in `spark/data/outputs/` (gitignored). The Spark facts and the measurements are in [spark/README.md](spark/README.md).

**The target model is Qwen-Image-2.1** (owner's request, 2026-09-26). Facts read from its Hugging Face model card and LICENSE file on 2026-09-26:

- Released 2026-09-20. **7B parameters in the visual generation component** (32 single-stream DiT layers). A single checkpoint does text-to-image, image editing with up to 10 reference images, and native transparent (RGBA) output. Aspect ratios 1:1, 4:3, 3:4, 3:2, 2:3, 16:9, 9:16; maximum tested resolution 2048×2048.
- Inference: Diffusers supports it from day 0 (`QwenImage21Pipeline`), with a CPU-offload option. **VRAM requirements and the full pipeline's memory footprint are not stated** on the card; EPIC_004 measures the real footprint on the Spark. ComfyUI support is not mentioned on the card as of the read date.
- **License: Qwen Research License Agreement (release date 2026-09-20).** It grants rights **"FOR NON-COMMERCIAL PURPOSES ONLY"** (research or evaluation); commercial use requires a separate license from Alibaba (`model-business@notice.qwencloud.com`). No territorial exclusions. Distributed copies carry an attribution notice, and models built with its outputs must display "Built with Qwen".

**The license question, decided.** Qwen-Image-2.1's weights are open but non-commercial. A personal workstation generating images for the owner's own use fits; **if any generated image ever feeds commercial work, 2.1 is not licensed for it.** The Apache-2.0 alternative in the same family is the original **Qwen-Image** (20B, 2025-08, text-to-image; editing via Qwen-Image-Edit) — bigger, older, unrestricted. **Decided 2026-09-26: the owner builds toward Qwen-Image-2.1 for personal, non-commercial use only** ([EPIC_004](docs/epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md) records the decision).

Sources: [Qwen/Qwen-Image-2.1 model card](https://huggingface.co/Qwen/Qwen-Image-2.1), [Qwen Research LICENSE](https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE), [Qwen/Qwen-Image model card](https://huggingface.co/Qwen/Qwen-Image).

## Deployment

Local only, on the Spark, in this order:

1. `spark/up.sh`: the model server (`qwen-model`), which creates the docker network `qwen`.
2. `docker compose up -d --build app`: the UI (`qwen-app` on port 3100), joined to that network.
3. `docker compose up -d --build proxy lan-name`: the name `qwen.local` and port 80 (CHORE_004). Both restart with Docker.

There is no CI; the gate runs locally (`tools/gate/run.sh`) and on every push to `develop` (the pre-push hook).
