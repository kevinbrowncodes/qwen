# Qwen Local

> A self-hosted image generation workstation: a web UI that copies the image generation surface of [chat.qwen.ai](https://chat.qwen.ai), backed by **Qwen-Image-2.1** served on the owner's NVIDIA DGX Spark.

> This README is the source of truth for **what the project is**. How we work (tickets, testing bar, gates, guardrails) lives in [CLAUDE.md](CLAUDE.md).

**Status (2026-10-20):** off the DGX Spark and on three Mac Studios ([EPIC_007](docs/epic/EPIC_007_the_app_runs_on_the_mac_studio_2022_and_draws_on_the_mac_studio_2026.md)). The repo is on the 2025, the app on the 2022 and the model on the 2026.

---

## Purpose

Generate images locally on a DGX Spark, through an interface that matches the Qwen chat web app's image generation flow, instead of generating in their cloud or using a generic frontend. Sibling project: [minimax](https://github.com/kevinbrowncodes/minimax) does the same for video against agent.minimax.io; this repo reuses its methodology, not its code.

## MVP Scope

**In scope — the image generation flow, end to end (owner's decision 2026-09-26: editing is in the MVP):**

- Prompt entry in image generation mode, with reference image attachment (text-to-image and image editing). Reference images are attached with `+`, or dropped or pasted anywhere on the page (STORY_018)
- The generation options the reference exposes (size / aspect ratio and whatever else recon enumerates)
- Submit, with the job's progress shown while it runs, and cancel
- Result display in place, and download
- History / gallery of past generations, with reopen

**Out of scope until the MVP epic is Done** — chat, video generation, voice mode, artifacts, deep research, anything else chat.qwen.ai does. These live in `docs/backlog/` as they come up ([CLAUDE.md → §3c](CLAUDE.md#3c-how-backlog-is-tracked)) and are never built early.

## Architecture

The machines (EPIC_007, from 2026-10-20):

| Machine | Role | Reached via |
| --- | --- | --- |
| **Mac Studio 2025** | The repo, development, the dev server; every deploy starts here | local |
| **Mac Studio 2022** | Runs the gate in its Docker (STORY_034), and the app since 2026-10-20 (STORY_037): `http://mac-studio-2022.local:3100`, and `http://qwen.local` through PATHS' proxy | ssh, `GATE_HOST` and `APP_HOST` |
| **Mac Studio 2026** | Runs the image model natively (mflux, Metal) behind the async job API, since 2026-10-20 (STORY_036) | LAN, port 4120, with `MODEL_API_KEY`; ssh `MODEL_HOST` for deploys |
| **DGX Spark** | Nothing of qwen's since 2026-10-20. Its containers were removed to free its memory, and its history and images were moved to the 2022 and the 2026 (STORY_037). Its clone, volume, outputs and weights stay on its disk until the owner says otherwise | `SPARK_HOST` (the migration only) |

The sections below that describe the Spark describe how it ran until 2026-10-20.

The UI talks to the generation server through configuration only (base URL, optional key). The protocol is an async job: create a generation, poll its status, fetch the result file. Locally the same variables point at a **stub generation server** that returns scripted outcomes and a tiny fixture image, so nothing in the test gate depends on the Spark being reachable.

Work is planned as two phases:

1. **UI recon and rebuild**: capture the reference's image generation surface, harvest its stylesheets, icons and markup, then build it with our own code driving those lifted assets. The Playwright session was withdrawn because the reference's access check rejects the automated browser. The 2026-09-26 capture was made in the owner's own Chrome and is processed offline (see [Running Recon](#running-recon) and [CLAUDE.md → §3e](CLAUDE.md#3e-how-recon-is-recorded)).
2. **Image model on the Spark** — serve Qwen-Image-2.1 on the Spark behind the job API, with the license question settled first. See [Running the Model](#running-the-model) for the open question this phase starts with.

## Tech Stack

**Reference (observed 2026-09-26, logged out, 1440×900):** a versioned `qwen-chat-fe` bundle (0.3.11 that day) served from Alibaba's CDN; no Next.js or Nuxt markers visible from outside, so the reference's framework is unidentified. Body text uses a system-ui stack that names Inter and NotoSansHans; only the KaTeX web fonts actually load. The app's own API is under `/api/v2/` on the same origin.

**Ours:** TypeScript everywhere, `strict: true`. Node 26, pnpm 10 workspaces. Recon: Playwright 1.63 + Vitest. App stack is chosen in EPIC_002 with Next.js App Router as the working assumption — our choice for familiarity with the sibling project, not a match of the reference, since theirs is unidentified.

## Project Structure

Present today: `app/`, `tools/gate/`, `tools/deploy/`, `tools/stub-generation-server/`, `recon/`, `spark/` (the model server, the mflux worker, the Mac Studio 2026's launch agent, the LoRA manifest), `docs/` (including `docs/contracts/`), `compose.yaml`, the workspace files. The rest is created by the epics that need it. The gitignored `models/` holds the weights, and the LoRAs in `models/loras/`, on the Spark.

```
app/          the UI
tools/        the gate (gate/: run.sh, and remote.sh to run it on GATE_HOST's Docker), the deploys (deploy/: model.sh, app.sh, the one-time migrate-from-spark.sh), the stub generation server and its fixture image, the SPIKE_001 bench scripts (spike/)
spark/        the model side: the model server, the mflux worker and its lock, the Mac Studio 2026's start script and launch agent (mac/), the LoRA manifest, fetcher and bench
recon/        recon scripts (the offline curate/harvest/interactions pipeline; profile and raw output are gitignored)
docs/
  epic/       EPIC_NNN_*.md
  story/      STORY_NNN_*.md
  bug/        BUG_NNN_*.md
  backlog/    BACKLOG_NNN_*.md
  chore/      CHORE_NNN_*.md
  spike/      SPIKE_NNN_*.md (a question answered by a controlled experiment; never product code)
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

Beyond the MVP (after its epics were Done):
- **Settings** (⚙ at the bottom of the sidebar): the interface zoom, 1× to 4×, remembered per browser (STORY_020).
- **LoRAs** in the composer: community LoRAs chosen per generation (STORY_019; see Running the Model).
- **An info card per LoRA** (ⓘ at the end of its row in the LoRA dropdown, or ArrowRight on the keyboard): what the creator says it was made for, its **Capabilities** (per subject, what the creator claims and what the bench showed, "not stated" or "not tested" where nothing is known, and whose judgement the bench lines are), and its creator, source page, downloads, trigger word, strength and guidance; "Use this LoRA" picks it (STORY_030, job API contract v1.4).
- **Info** under every generation (ⓘ in the action row, or beside a failed or stopped notice): the prompt, the prompt as sent with any trigger word, the model, size, seed, LoRA with its strength and guidance, the reference count and the time taken, all read from the job's own record. It also has Copy (the seed), Copy all, and **Same seed again**, which reruns every setting including the seed (Regenerate still draws a new one). The model server also writes these lines, less the time, into each PNG as a `parameters` text chunk (STORY_024, job API contract v1.3).
- **Queueing several images** (STORY_025): Send stays available while images generate, and each new prompt adds its card below the earlier ones on the same page, with its own Stop. The **×N** pill in image mode (beside the text on a phone) queues 1 to 8 images of one prompt per send, each with its own seed. The model server runs them one at a time and holds at most 8 waiting; a send it cannot take in full says how many went ("Queued 2 of 4."). The cards of one visit are not kept together across a reload: each is in the sidebar.
- **Chats** (STORY_031): every image asked for from a chat's page (a new prompt, an edit, Regenerate, Same seed again) is that chat's next turn, and so is every image of a ×N send from home. The sidebar lists one row per chat, titled by its first prompt and ordered by its newest turn; reloading or reopening a chat shows every turn in order, at the newest; My Library opens an image in its chat at its turn, outlined. The row's Chat Menu stops or deletes the whole chat, and each finished image has its own Delete. History from before chats reads as one chat per image. The title, the order and Regenerate adding a turn are provisional until EPIC_006's recon shows what the reference does.
- **History** (STORY_032): the sidebar lists only today's chats (by the local calendar day of each chat's newest turn), re-reading the clock every minute so a chat leaves it at midnight. A **History** row under My Library opens `/history`, which shows one earlier day at a time: ‹ and › step between the days that have chats, the calendar button picks any day, and the day is kept in the URL (`?day=YYYY-MM-DD`). Each chat is a row with its newest image, title, image count and the time of its newest turn, and its Chat Menu (Stop or Delete). Nothing is moved or deleted: sending in an earlier chat brings it back to today.
- **The image viewer** (STORY_038): a click (or Return) on a finished image in a chat, a reference shown in a turn, or a composer thumbnail opens it large over the page, with its name, Download and Close. Left and Right, the buttons at its edges or a swipe step through the chat's images in order; Esc, Close or a click on the dimmed page closes it. Full screen on the phone. My Library's cards still open the image's turn.
- **Favorites** (STORY_039): Star, at the end of a finished image's action row, in the viewer's header or beside Download on a My Library card, keeps the image in My Library's **Favorites** segment (`/library?view=favorites`), newest star first. The star is saved in history (`PATCH /api/history/:id` with `{ "favorite": true | false }`), and deleting the image or its chat removes it.
- **A wide window** (STORY_040): above the captured 1437 px the chat column grows with the window to 1400 px of content, centred. A result fills it at its own aspect, never past its natural size and never taller than the window less the composer. Prompt bubbles and notices stay within about 72 characters, the composer grows to 1000 px, and My Library adds columns of 276 px cards. At 1437 px and below the layout is the reference's.
- **Renaming a chat** (STORY_033): the Chat Menu's **Rename** (first, above Stop or Delete, in the sidebar and on History) turns the row's title into an input in place. Enter or clicking away saves, Escape cancels, and a blank name goes back to the first prompt. The name (at most 100 characters) is kept in the history file as a `title` on every image of the chat, set through `PATCH /api/chats/<id>`, so it survives a reload and new images in the chat keep it.

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
- **The pre-push hook** (`.husky/pre-push`) runs the whole gate on every push to `develop` and refuses the push if it fails, or if no gate can run. On a Mac without Docker (the Mac Studio 2025) it gates exactly the pushed commit on `GATE_HOST` through `tools/gate/remote.sh --commit` (STORY_034). `pnpm install` installs it, natively on the 2025: husky, then `tools/gate/install-hooks.sh`, which points `core.hooksPath` at the main checkout's absolute `.husky/_`, so git worktrees run the hook too (BUG_017).
- **Gate checks that guard rules:** `tools/gate/src/one-vitest.test.ts` fails when the lockfile resolves more than one vitest (BUG_016). `tools/gate/src/hostnames.test.ts` fails when a machine name or LAN address appears in application code, tests or fixtures (STORY_034).

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

### Through Hands, in the owner's signed-in Safari on the Mac (EPIC_006)

The second recon pass is driven through [Hands](https://github.com/kevinbrowncodes/hands), the owner's tool that works a Mac through the macOS Accessibility API and the keyboard (no browser automation, no mouse). Hands runs on the Mac at `http://hands.local/`; the recon client runs on the Spark, in the same recon container, and files every look it takes:

```bash
recon/run.sh hands 2026-10-14 preflight                                   # Hands' version, the hand's grants, one look of Safari, signed-out or not
recon/run.sh hands 2026-10-14 look --app Safari --as home-signed-in@1920  # one look, saved
recon/run.sh hands 2026-10-14 act '{"do":"press","look":"<look id>","n":12}' --as mode-menu-open@1920   # one act, with the look after it
recon/run.sh hands 2026-10-14 js dom.js --as chat-multi-top@1920           # a committed read (recon/hands/reads/) sent as Hands' js act; the answer saved as .result.txt
recon/run.sh hands 2026-10-14 routine qwen-recon-multi-turn-chat.json      # a committed routine (recon/hands/routines/) created or replaced in Hands
```

Each look lands at once in the gitignored `recon/out/<date>/hands/` as `NN-<state>@<width>.json` (the elements with their frames in screen points, the asserted width, the act that produced it with typed text reduced to a length, and Hands' version), `.png` (the screen) and `.marked.png` (the screen with every element numbered); `acts.jsonl` logs every command. Saving at once matters because Hands keeps only its newest 50 looks. A wait longer than Hands' 30-second cap is split, with a look saved between chunks. A full capture is on the order of half a gigabyte, on the Spark's disk.

The reads under `recon/hands/reads/` (`title.js`, `dom.js`, `styles.js`, `page.js`) are what the recon asks the page through Hands' `js` act (Hands STORY_007, shipped as v1.17.0 on 2026-10-13; on the Mac it needs Safari › Develop › "Allow JavaScript from Apple Events" and the Automation grant for the hand). Each is one expression that reads the owner's own page and does nothing to it; `recon/src/reads.test.ts` enforces that. A routine file under `recon/hands/routines/` names the owner's chat as `{{HANDS_CHAT_URL}}`, filled from `.env` at upload time, so no chat id is in git.

`HANDS_API_TOKEN` (the `API_TOKEN` from Hands' own `.env` on the Mac), `HANDS_URL` (default `http://hands.local`) and `HANDS_CHAT_URL` live in the repo's `.env`, which `run.sh` mounts read-only into the container; the shell never reads it and the client never prints the token. A container cannot resolve `.local` names, so `run.sh` resolves `hands.local` on the Spark and passes the address in (`HANDS_HOST=<address>` overrides). The client can address only Hands: a test fails it if it ever names the reference. Hands' own refusals (a missing grant, Safari not running, a look no longer held, a wait that ran out) are printed in Hands' words with exit code 1; a missing token or a usage error exits 2.

## Running the UI

**From the Mac Studio 2025 (STORY_034):** the dev server runs natively, `cd app && pnpm dev --port 3100` (Node 26 and pnpm 10.32.1, the gate's versions). The gate runs on the Mac Studio 2022's Docker:

```bash
echo 'GATE_HOST=mac-studio-2022' >> .env   # once: the gate host's ssh destination (.env is gitignored)
tools/gate/remote.sh                        # the whole gate, on the working tree as it stands
tools/gate/remote.sh --from 4               # resume from a step; or name steps: remote.sh lint build
tools/gate/remote.sh --commit HEAD          # exactly a commit (what the pre-push hook does)
```

The gate host builds the gate image itself on first use and keeps its copy of the tree in `~/qwen-gate/`.

**The app runs on the Mac Studio 2022** (STORY_037). It is deployed from the 2025 with `tools/deploy/app.sh`, which takes a commit on `origin/develop`. It builds the image on the 2022, tagged with the commit, as `qwen-app` in compose project `qwen`, and starts it with `restart: always`.
- It publishes port 3100: `http://mac-studio-2022.local:3100`.
- It joins PATHS' `paths` network with the labels `caddy: http://qwen.local` and `caddy.reverse_proxy: "{{upstreams 3100}}"`, so PATHS' proxy and Bonjour agent serve it as `http://qwen.local`. qwen's own `proxy` and `lan-name` services are gone.
- Its environment is in `~/qwen-app/.env` on the 2022, written by every deploy: `MODEL_BASE_URL` points at the 2026, and `MODEL_API_KEY` is piped from the 2026 and never printed.
- History is in the `qwen_app-data` volume.

`tools/deploy/migrate-from-spark.sh` moved the Spark's 325 history entries and 320 images across on 2026-10-20, and every finished image loaded through the app afterwards.

```bash
tools/deploy/app.sh                                    # from the 2025: deploy HEAD (clean, on origin/develop) to APP_HOST
ssh mac-studio-2022 'docker logs -f qwen-app'          # the app's log
```

On a machine with Docker the gate also runs in place: `tools/gate/build.sh` once, then `tools/gate/run.sh` (same arguments as `remote.sh`).

The UI reads `MODEL_BASE_URL` (the generation server, no trailing slash), `MODEL_API_KEY` (optional) and `HISTORY_FILE` (where history is kept; `/data/history.json` in the `app-data` volume: one entry per image, with its chat's id and, once renamed, the chat's `title`). On the Mac Studio 2022, `tools/deploy/app.sh` writes them to `~/qwen-app/.env`. [.env.example](.env.example) shows the repo's own `.env` on the 2025, which names the machines. The same file holds `CIVITAI_TOKEN`, the Civitai API key `spark/fetch-loras.sh` needs for the LoRAs only Civitai hosts (CHORE_005): it is mounted read-only into the fetch container and never printed. It also holds `HANDS_API_TOKEN` and `HANDS_URL` for the recon client that drives Hands (STORY_027; see [Running Recon](#running-recon)).

## Running the Model

**Served from the Mac Studio 2026 since 2026-10-20 (STORY_035, STORY_036).** The same model server (`spark/model-server`) runs natively there with the mflux worker (`spark/model/worker_mlx.py`, MLX on Metal). It runs as the launch agent `com.qwen.model` and listens on the LAN at port 4120, **behind `MODEL_API_KEY`**: the server refuses to listen beyond loopback without it.

| Item | Value (measured on the Mac Studio 2026, 2026-10-20) |
| --- | --- |
| Machine | Mac Studio 2026: M5 Ultra, 64 GPU cores, 96 GB, macOS 27.0.1 |
| Stack | Node 26 running `spark/model-server`; worker `spark/model/worker_mlx.py` on mflux 0.21.0, MLX 0.32.4, Python 3.14, Pillow 12.3.0 (`spark/model/mlx/uv.lock`; `pillow<13` is required, see `test_mlx_lock.py`) |
| Model / checkpoint | `Qwen/Qwen-Image-2.1` @ `790c926`, bf16, one `QwenImage21Edit` model for text-to-image and edits |
| Time per image | Text-to-image at 896×1184, 40 steps: **35 s** in the worker, 36 s through the job API. With a guided LoRA: 75 s. Edit: 50 s. The Spark took 53, 120 and 60 s |
| Start | Ready in about 5 s with six LoRAs once the files are cached (the Spark: 3.3 minutes) |
| Memory | Peak resident about 33 GB at rest; 81 GB footprint mid-generation at the 2026-10-23 panic (PATHS EPIC_023). `spark/mac/start.sh` refuses to start below 48 GiB available and never stops anything to make room. Since STORY_041 the server asks the Ultra's memory agent (PATHS `memory/agent.py`, port 8700) for each image's share before it runs (`MEMORY_TOKEN`, `MEMORY_LEASE_GB`, default 48, in `~/qwen-model/.env`; unset, leases are off), and the worker sets `mx.set_memory_limit` from `MEMORY_LIMIT_GB` (a guideline to MLX, not a hard cap) |
| LoRAs | All six in `spark/loras.json`, loaded unbaked. Each job swaps in only its own LoRA's layers, so switching costs no reload and an unused LoRA costs nothing per step |
| Layout on the 2026 | `~/qwen-model/`: `app/` (what the deploy copies), `models/Qwen-Image-2.1` (a link to the spike's copy), `models/loras/`, `data/outputs/`, `.env` (`MODEL_API_KEY`, mode 600). Log: `~/Library/Logs/qwen-model.log` |

```bash
tools/deploy/model.sh                    # from the Mac Studio 2025: deploy HEAD (clean and on origin/develop) to MODEL_HOST
tools/deploy/model.sh --now              # restart even when a job is running or queued
ssh mac-studio-2026 'launchctl kickstart -k gui/$(id -u)/com.qwen.model'   # restart in place
ssh mac-studio-2026 'tail -f ~/Library/Logs/qwen-model.log'                # the server's and the worker's log
```

The launch agent starts at login, so the 2026 must be logged in after a reboot. The Spark's `qwen-model` was removed on 2026-10-20. Its weights, LoRAs and `spark/data/outputs` (521 MB) are still on the Spark's disk; STORY_037 moves the outputs.

How it ran on the DGX Spark until 2026-10-20 (a diffusers worker in a Docker image, 51–60 s per image) is in EPIC_004 and STORIES 014–016. That code was removed in CHORE_010. **The Spark's qwen data** (the `qwen_app-data` volume, `spark/data/outputs` at 521 MB, the weights at 33.1 GB) stays on its disk until **2026-10-28**, as a backup of what EPIC_007 moved. It is then removed with the owner's say-so at that time (owner, 2026-10-21; CLAUDE.md §4a).

**The LoRA bench** (`spark/bench-loras.sh`, STORY_022) runs every LoRA, and none, over the same four generated subjects through the job API: an edit of each subject with the same prompt and seed, plus one text-to-image per setting. It writes the images, a `contact-sheet.html` and a `scorecard.md` into the gitignored `outputs/bench/<date>/`, and resumes if re-run. From the Mac Studio 2025 it runs natively against `MODEL_BASE_URL` with `MODEL_API_KEY` from `.env` (STORY_036). Its only inputs are the prompts in `spark/model-server/src/bench.ts` and the ids of jobs this server made from them; it never reads an image from disk. The owner's filled-in scorecards are committed, as text only, under [docs/bench/](docs/bench/).

**The target model is Qwen-Image-2.1** (owner's request, 2026-09-26). Facts read from its Hugging Face model card and LICENSE file on 2026-09-26:

- Released 2026-09-20. **7B parameters in the visual generation component** (32 single-stream DiT layers). A single checkpoint does text-to-image, image editing with up to 10 reference images, and native transparent (RGBA) output. Aspect ratios 1:1, 4:3, 3:4, 3:2, 2:3, 16:9, 9:16; maximum tested resolution 2048×2048.
- Inference: Diffusers supports it from day 0 (`QwenImage21Pipeline`), with a CPU-offload option. **VRAM requirements and the full pipeline's memory footprint are not stated** on the card; EPIC_004 measures the real footprint on the Spark. ComfyUI support is not mentioned on the card as of the read date.
- **License: Qwen Research License Agreement (release date 2026-09-20).** It grants rights **"FOR NON-COMMERCIAL PURPOSES ONLY"** (research or evaluation); commercial use requires a separate license from Alibaba (`model-business@notice.qwencloud.com`). No territorial exclusions. Distributed copies carry an attribution notice, and models built with its outputs must display "Built with Qwen".

**The license question, decided.** Qwen-Image-2.1's weights are open but non-commercial. A personal workstation generating images for the owner's own use fits; **if any generated image ever feeds commercial work, 2.1 is not licensed for it.** The Apache-2.0 alternative in the same family is the original **Qwen-Image** (20B, 2025-08, text-to-image; editing via Qwen-Image-Edit) — bigger, older, unrestricted. **Decided 2026-09-26: the owner builds toward Qwen-Image-2.1 for personal, non-commercial use only** ([EPIC_004](docs/epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md) records the decision).

Sources: [Qwen/Qwen-Image-2.1 model card](https://huggingface.co/Qwen/Qwen-Image-2.1), [Qwen Research LICENSE](https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE), [Qwen/Qwen-Image model card](https://huggingface.co/Qwen/Qwen-Image).

## Deployment

**From the Mac Studio 2025 (EPIC_007), in this order:**

1. `tools/deploy/model.sh`: the model server to the Mac Studio 2026 (STORY_036).
2. `tools/deploy/app.sh`: the app to the Mac Studio 2022 (STORY_037). It reads the model's key from the 2026, so the model deploys first.

Each takes a commit that is on `origin/develop`, so one that passed the gate, and refuses a working tree with uncommitted changes. `.env` on the 2025 names the machines: `GATE_HOST`, `MODEL_HOST`, `APP_HOST`, and `SPARK_HOST` for the one-time migration. Until 2026-10-20 everything ran on the DGX Spark (EPIC_004, CHORE_004); that path was removed in CHORE_010.

There is no CI. The gate runs on the Mac Studio 2022 (`tools/gate/remote.sh`) and on every push to `develop` (the pre-push hook).
