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

1. **UI recon and rebuild** — capture the reference's image generation surface with Playwright through the owner's own logged-in session (see [CLAUDE.md → §3e](CLAUDE.md#3e-how-recon-is-recorded) and [§4b](CLAUDE.md#4b-recon-with-playwright)), harvest its stylesheets, icons, fonts and markup, then build it with our own code driving those lifted assets.
2. **Image model on the Spark** — serve Qwen-Image-2.1 on the Spark behind the job API, with the license question settled first. See [Running the Model](#running-the-model) for the open question this phase starts with.

## Tech Stack

**Reference (observed 2026-09-26, logged out, 1440×900):** a versioned `qwen-chat-fe` bundle (0.3.11 that day) served from Alibaba's CDN; no Next.js or Nuxt markers visible from outside, so the reference's framework is unidentified. Body text uses a system-ui stack that names Inter and NotoSansHans; only the KaTeX web fonts actually load. The app's own API is under `/api/v2/` on the same origin.

**Ours:** TypeScript everywhere, `strict: true`. Node 26, pnpm 10 workspaces. Recon: Playwright 1.63 + Vitest. App stack is chosen in EPIC_002 with Next.js App Router as the working assumption — our choice for familiarity with the sibling project, not a match of the reference, since theirs is unidentified.

## Project Structure

Present today: `recon/`, `docs/`, the workspace files. The rest is created by the epics that need it.

```
app/          the UI
tools/        the stub generation server, its fixture image, other dev tooling
spark/        scripts and unit files that set up and run the model on the Spark
recon/        Playwright recon scripts (profile and raw output are gitignored)
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

TBD — enumerated by the recon component inventory of the image generation surface. The MVP Scope section above is the outline.

## Testing

TBD — defined by the testing-foundation epic. The bar itself (70/20/10 pyramid, stub generation server, no test may depend on the real model) is in [CLAUDE.md → §3](CLAUDE.md#3-how-features-are-built-important).

## Running Recon

On the Spark, where the repo lives, the scripts run inside the official Playwright image. The host needs only Docker.

```bash
recon/run.sh login   # opens Chromium on the Spark's desktop (display :1); sign in to chat.qwen.ai yourself
recon/run.sh check   # prints session: signed-in | signed-out | unknown (exit 0 / 1 / 2)
recon/run.sh test    # recon unit tests;  recon/run.sh typecheck for the typecheck
```

The login window appears on the Spark's own screen, so sign in there or over remote desktop from the Mac. Where pnpm exists, `pnpm recon:login` / `pnpm recon:check` run the same scripts directly.

The session lives in `recon/.profile/`, raw captures in `recon/out/`, and the container's pnpm cache in `recon/.cache/`; all three are gitignored. Curated captures land in `docs/recon/<date>/`. See [CLAUDE.md → §4b](CLAUDE.md#4b-recon-with-playwright).

## Running the UI

TBD (EPIC_002). Dev server on port 3100 on the Spark; port 3000 there belongs to the sibling minimax app.

## Running the Model

**Status (2026-09-26): nothing is on the Spark yet.** The EPIC_004 stories put a serving stack and weights there and fill in this section with measured numbers. Until then this section records the plan, not the state — verify on the Spark before relying on it.

| Item | Value |
| --- | --- |
| Serving stack | TBD (EPIC_004) — Diffusers has day-0 support; ComfyUI support was not stated on the model card when read |
| Model / checkpoint | Qwen-Image-2.1, precision to be measured |
| Licence | Qwen Research License — **non-commercial only**; decided 2026-09-26, see below |
| Memory split | to be measured (EPIC_004) |
| Port / env vars | to be set (EPIC_004) |

The Spark facts (OS, CUDA, memory, disk, what was already installed) are recorded in `spark/README.md` by the first EPIC_004 story before anything is changed.

**The target model is Qwen-Image-2.1** (owner's request, 2026-09-26). Facts read from its Hugging Face model card and LICENSE file on 2026-09-26:

- Released 2026-09-20. **7B parameters in the visual generation component** (32 single-stream DiT layers). A single checkpoint does text-to-image, image editing with up to 10 reference images, and native transparent (RGBA) output. Aspect ratios 1:1, 4:3, 3:4, 3:2, 2:3, 16:9, 9:16; maximum tested resolution 2048×2048.
- Inference: Diffusers supports it from day 0 (`QwenImage21Pipeline`), with a CPU-offload option. **VRAM requirements and the full pipeline's memory footprint are not stated** on the card; EPIC_004 measures the real footprint on the Spark. ComfyUI support is not mentioned on the card as of the read date.
- **License: Qwen Research License Agreement (release date 2026-09-20).** It grants rights **"FOR NON-COMMERCIAL PURPOSES ONLY"** (research or evaluation); commercial use requires a separate license from Alibaba (`model-business@notice.qwencloud.com`). No territorial exclusions. Distributed copies carry an attribution notice, and models built with its outputs must display "Built with Qwen".

**The license question, decided.** Qwen-Image-2.1's weights are open but non-commercial. A personal workstation generating images for the owner's own use fits; **if any generated image ever feeds commercial work, 2.1 is not licensed for it.** The Apache-2.0 alternative in the same family is the original **Qwen-Image** (20B, 2025-08, text-to-image; editing via Qwen-Image-Edit) — bigger, older, unrestricted. **Decided 2026-09-26: the owner builds toward Qwen-Image-2.1 for personal, non-commercial use only** ([EPIC_004](docs/epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md) records the decision).

Sources: [Qwen/Qwen-Image-2.1 model card](https://huggingface.co/Qwen/Qwen-Image-2.1), [Qwen Research LICENSE](https://huggingface.co/Qwen/Qwen-Image-2.1/raw/main/LICENSE), [Qwen/Qwen-Image model card](https://huggingface.co/Qwen/Qwen-Image).

## Deployment

Local only. The UI is started on the Mac and the model on the Spark by the scripts under `spark/` and `app/`. There is no CI as of 2026-09-26.
