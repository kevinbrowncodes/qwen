# EPIC_007 — The app runs on the Mac Studio 2022 and draws on the Mac Studio 2026, deployed from the Mac Studio 2025

**Status:** Approved by the owner on 2026-10-20 (through the picker: "Approved, write STORY_034"). BUG_016 first, then stories 034–037 in order. The stories are named below and written one at a time.
**Created:** 2026-10-20
**Owner's goal (2026-10-20):** "keep the repo here on the mac studio 2025 and just deploy to the mac studio 2022 and mac studio 2026", with the 2022 running the front end and the 2026 the back end, and image generation retired from the DGX Spark. **The end goal is to refactor this app into a PATHS-derived app** ([BACKLOG_004](../backlog/BACKLOG_004_qwen_local_becomes_an_app_generated_from_paths.md)), so this epic builds only what survives that refactor or is cheap enough to throw away.

## Goal

The repo, the gate and every deploy start on the Mac Studio 2025. The app serves from the Mac Studio 2022 at `http://qwen.local`. Qwen-Image-2.1 draws on the Mac Studio 2026 through mflux, behind the job API the app already speaks. The owner's 325 past images and their chats come across whole. When the new setup serves, the Spark stops serving qwen.

## Why now

[SPIKE_001](../spike/SPIKE_001_can_the_mac_studio_2026_draw_what_the_spark_draws.md) measured the 2026 on 2026-10-20. It draws the Spark's three jobs at the Spark's settings in 56 s, 70 s and 51 s, against the Spark's 53.1 s, 120.2 s and 59.7 s. Those Mac times include loading the model in a fresh process each run; drawing alone took 36 s, 63 s and 41 s. All six add-ons load, and memory peaked at 36.5 GB of 96. That settles the image half. The video half of the spike, the owner's Draw Things clips, is still open and does not block this epic.

## The machines (measured 2026-10-20 over ssh from the Mac Studio 2025)

| Machine | Role after this epic | Measured | Already there |
|---|---|---|---|
| **Mac Studio 2025** (`mac-studio-2025`, 192.168.1.6) | The repo, Claude Code, every deploy | M4 Max, 36 GB, 32 GiB free | Node 26.7.0, pnpm 10.32.1 (the gate's versions); **no Docker** |
| **Mac Studio 2022** (`mac-studio-2022`, 192.168.1.30) | The app in Docker, and the gate | M1 Max, 32 GB, 274 GiB free, macOS 26.5.2 | Docker Desktop 29.8.0 running about ten services; **PATHS' Caddy on ports 80 and 443**, with its Bonjour agent announcing `<slug>.local` from container labels |
| **Mac Studio 2026** (`mac-studio-2026`, 192.168.1.47) | The model server and the mflux worker, native under launchd | M5 Ultra, 64 GPU cores, 96 GB, GPU wired limit 94208 MB, 808 GiB free, macOS 27.0.1 | Node v26.12.0, uv 0.13.1, the Spark's weights at `790c926` from the spike; no Docker; three other launchd agents |
| **DGX Spark** (`spark-1.local`, 192.168.1.28) | None for qwen after cutover | — | Serves app and model today (README › Deployment) |

## The owner's decisions (2026-10-20, through the picker)

1. **Order:** finish SPIKE_001's image half first. Done 2026-10-20.
2. **The gate runs on the 2022's Docker**, not on the 2025, which has no Docker.
3. **The app's deploy is whatever suits the PATHS refactor best** (the owner: "the end goal is to refactor this app to be a paths derived app"). Chosen here, see Technical approach: Docker over ssh from the gate's own copy, with the name `qwen.local` coming from PATHS' proxy. PATHS' deploy agent only deploys apps generated from the PATHS template (`deployer/deployer.py:123-132` matches `.copier-answers.yml` against `kevinbrowncodes/paths`), so qwen cannot use it until the refactor.
4. **`qwen.local` stays,** announced over Bonjour.
5. **The history moves:** `history.json` to the 2022, and the images and the job index to the 2026.
6. **The Spark's model server stops at cutover,** with no soak week. The Spark's app, proxy and name services stop in the same step, since the 2022 replaces them. **Brought forward on 2026-10-20:** the owner asked to take the app off the Spark at once ("the spark really needs memory right now").
   - The model server was idle (`job: null, queued: 0`).
   - `history.json` was copied first to the 2025's gitignored `outputs/spark-retire/2026-10-20/`: 325 entries.
   - Then `docker compose down` removed `qwen-app`, `qwen-proxy`, `qwen-lan-name` and `qwen-model`, without `-v`. The `qwen_app-data` volume, `spark/data/outputs` (521 MB), the images and the weights stay on the Spark for STORY_037's move.
   - The Spark's available memory went from 19 to 53 GiB.
   - Image generation and `qwen.local` are down until STORY_037.

   **The overnight authorisation (2026-10-20):** the owner approved working through BUG_016 and STORIES 034–037 without them. Each story is self-approved, landed and verified before the next starts, and pushed to `develop` after its gate. Installing the epic's pieces on the 2022 and the 2026 is approved.

## What crosses over, and what does not (every feature on trial)

Usage is from the Spark's `history.json`, read 2026-10-20: 325 jobs in 278 chats, from 2026-09-27 to 2026-10-19.

| Feature | Used? | Cost on the new setup | Recommendation |
|---|---|---|---|
| Text-to-image at the seven ratios | 233 at 16:9, 3 at 9:16; the other five never | None; the sizes are server configuration (`capabilities.ts`) | **Keep**, at no cost. The unused ratios are a question for the PATHS refactor |
| Edits with a reference image | 290 of 325, always one reference | mflux's edit takes up to ten | **Keep** |
| A LoRA per job, switched between jobs | 221 of 325. `uncut-coachbate` 0, `flaccid-lonelycoyote` 4, `uncensored` 7 | The real unknown: mflux bakes a LoRA into the weights before sampling, so switching per job may mean a reload. STORY_035 measures it first | **Keep**. Which LoRAs cross is the open question below |
| LoRA guidance (true CFG with a one-space negative prompt) | Every guided LoRA | Proven in SPIKE_001: mflux runs CFG for `" "` | **Keep** |
| Progress per step, and stopping at the next step | Stopped 54 times | Needs mflux's step callbacks; STORY_035 proves both | **Keep**. CLAUDE.md §6 rule 4 requires stopping |
| Queue, watchdog and restart (STORIES 025–026) | Every job | None; they live in the TypeScript server, which moves unchanged | **Keep** |
| Settings written into the PNG (STORY_024) | Every image | Small; the worker's `png_info` carries over | **Keep** |
| `spark/up.sh` memory check (BUG_013) | Every start on the Spark | Linux-only (`free`); the 2026 runs under launchd | **Reshape**: a start-time check of the 2026's free memory, in the launchd start script |
| LoRA fetch with sha256 checks (`spark/fetch-loras.sh`) | Each install | Runs in a container today; on the 2026 it runs natively with Node 26 | **Keep**, run natively |
| Weights fetch (`spark/fetch-weights.sh`) | Once | Docker plus `hf download`; on the 2026 `uvx hf download --revision`, as in the spike | **Keep**, reshaped |
| The LoRA bench (`spark/bench-loras.sh`, STORY_022) | Once, 2026-10-02 | It is a job-API client that only needs a server URL | **Keep**, run from the 2025 against the 2026's URL (owner, 2026-10-20). Its wrapper changes in STORY_036 |
| Hand renders (`spark/model/try.py`, `try.sh`, STORY_014) | Once, 2026-09-26 | Written for diffusers and CUDA | **Drop**. SPIKE_001's bench replaced it |
| qwen's own `proxy` (Caddy) and `lan-name` (mDNS) | Every visit to `qwen.local` | Port 80 on the 2022 is PATHS'. `lan-name` relies on Linux host networking | **Drop**. PATHS' proxy and Bonjour agent take over through two labels and the `paths` network |
| `app-dev` (`next dev` in the gate container on the Spark) | Development | The 2025 has no Docker | **Drop**. `pnpm dev` runs natively on the 2025 on port 3100 |

## Technical approach

- **One copy of the tree on the 2022 does both jobs.**
  - The gate copies the working tree to the 2022 (rsync over ssh, without `node_modules`, `outputs/`, `models/` or `.git`) and runs the unchanged `tools/gate/run.sh` there. Its step 5 builds the production image on the 2022.
  - The frontend deploy then starts *that* image. So what serves is exactly what passed the gate, and nothing is cloned onto the 2022.
  - The pre-push hook already takes `GATE_RUN` (`.husky/pre-push`), so it calls the remote runner.
- **The name comes from PATHS.** `qwen-app` joins the external `paths` network with PATHS' `caddy` labels. PATHS' proxy routes `qwen.local` to port 3100, and its Bonjour agent announces the name. There is nothing to change in the PATHS repo.
- **The backend is the same server with a new worker.**
  - `spark/model-server` already takes the worker as configuration (`WORKER`, `PORT`, `HOST`, `OUTPUT_DIR`, `LORA_MANIFEST`, `LORA_DIR` in `main.ts`). A new `worker_mlx.py` speaks the same JSON-lines protocol (`protocol.ts`), reuses `jobloop.py` unchanged, and draws through mflux's Python API.
  - The worker's Python dependencies are pinned in a lockfile, including `pillow<13`, since Pillow 13.0.0 breaks mflux 0.21.0 (SPIKE_001).
  - The Node server and the worker run natively under one launchd agent on the 2026, because Metal is not reachable from a container on macOS.
- **The model server listens on the LAN, behind its key.** Today it listens only on `127.0.0.1:4120`. On the 2026 it listens on the LAN with `MODEL_API_KEY` required (bearer auth already exists), and the app's `.env` on the 2022 holds the URL and the key.
- **Machine names are configuration.** No hostname or LAN address of any machine appears in app code, tests or fixtures (CLAUDE.md §4a, for the Spark, today). Only the deploy scripts' environment and the gitignored `.env` hold them.

## Rules this epic creates, and their gates

| Rule | Gate (written for a session that has never seen this epic) |
|---|---|
| No machine's hostname or LAN address is in app code, tests or fixtures | A source scan in the gate fails on `mac-studio-20xx`, `spark-1`, `.local` hostnames or `192.168.` outside `docs/`, `tools/deploy/` and `.env.example`, and names the file and the fix (put it in `.env`) |
| Only a gated tree is deployed | The gate writes a stamp of the commit it passed, on the 2022. The frontend deploy refuses any other commit, or a tree with uncommitted changes, and says to run the gate |
| The worker's Python stack stays pinned, with `pillow<13` while mflux 0.21.0 needs it | A gate test reads the worker's lockfile and fails on a Pillow 13+ resolution, quoting SPIKE_001's import error |
| The model server on the LAN requires a key | An integration test against the server with `HOST=0.0.0.0` and no key set fails to start, with a message that names `MODEL_API_KEY` |

## Stories (named in implementation order; drafted after approval)

| # | Story | Scope |
|---|---|---|
| — | [BUG_016](../bug/BUG_016_the_gates_typecheck_fails_on_every_jest_dom_matcher.md) | Fixed 2026-10-20: a second vitest in the lockfile, not the augmentation |
| 034 | [The gate runs on the Mac Studio 2022 for the repo on the Mac Studio 2025](../story/STORY_034_the_gate_runs_on_the_mac_studio_2022_for_the_repo_on_the_mac_studio_2025.md) (Done 2026-10-20) | The remote gate runner; the pre-push hook uses it; the hostname scan; CLAUDE.md §1, §4 and §4a and README › Architecture rewritten for the three Macs |
| 035 | A new worker draws with mflux behind the unchanged job API | `worker_mlx.py`, its lockfile and pin gate; progress, stopping, per-job LoRA switching measured and built; edits; guidance; the PNG settings; the worker's tests in the gate; a manual check on the 2026 |
| 036 | The model server runs on the Mac Studio 2026 as a service, deployed from the 2025 | A launchd agent; a deploy script; weights and LoRAs fetched natively there; the memory check; LAN with the key; `/health` from the 2025 |
| 037 | The app moves to the Mac Studio 2022 with its history, and the Spark stops serving qwen | The frontend deploy from the gated tree; the PATHS labels; the cutover. The Spark's app stops taking jobs, `history.json` moves to the 2022 and the 521 MB of images and the job index to the 2026, then the app points at the 2026. After listing what runs on the Spark, its four qwen containers stop. README › Deployment is rewritten |

## Open questions

1. ~~Which LoRAs cross over?~~ **Answered 2026-10-20: whatever EPIC_005 keeps.** STORY_023 decides; the 2026 gets what is in `spark/loras.json` at cutover. The usage counts above go to STORY_023 as evidence.
2. ~~The LoRA bench?~~ **Answered 2026-10-20: keep it,** run from the 2025 against the 2026's URL.

## Out of scope

- **The PATHS refactor** ([BACKLOG_004](../backlog/BACKLOG_004_qwen_local_becomes_an_app_generated_from_paths.md)).
- **Video.** SPIKE_001's Draw Things half stays with the spike.
- **2K sizes on the 2026.** A story of its own if the owner wants them; the Spark's 248–266 s is why they are not offered.
- **Moving recon** (CHORE_001's Playwright container on the Spark's screen, STORY_027's Hands client on the Spark). EPIC_006 owns recon, and the Spark's clone stays where it is.
- **Removing the Spark's weights** (33.1 GB under `models/`). Weights are only deleted with the owner's say-so in that session (CLAUDE.md §4a).
