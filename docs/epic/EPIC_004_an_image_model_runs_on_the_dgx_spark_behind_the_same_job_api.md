# EPIC_004 — An image model runs on the DGX Spark behind the same job API

**Status:** In progress (started 2026-09-26)

## Goal

A generation server on the DGX Spark that speaks the async job protocol the UI and the stub already speak — create a generation → poll its status → fetch the result image — serving the chosen Qwen image model at a usable resolution, started by scripts committed under `spark/`. The owner opens this repo on the Spark for this epic's work; the UI reaches the server over the LAN through configuration only.

## The first decision: which model, and its license

**The owner's requested target is Qwen-Image-2.1.** Facts read from the model card and LICENSE on 2026-09-26 (re-read before deciding — [CLAUDE.md → §3 item 8](../../CLAUDE.md#3-how-features-are-built-important)):

| Candidate | Size | License (read 2026-09-26) | Notes |
| --- | --- | --- | --- |
| **Qwen-Image-2.1** | 7B visual generation component (32 single-stream DiT layers) | **Qwen Research License — non-commercial only**; commercial use needs a separate license from Alibaba | Released 2026-09-20. Unified text-to-image + editing (up to 10 reference images), native RGBA. Diffusers day-0 (`QwenImage21Pipeline`); ComfyUI support not stated on the card. VRAM not stated. |
| **Qwen-Image** (2025-08) | 20B | **Apache 2.0** — unrestricted | Text-to-image; editing via the separate Qwen-Image-Edit. Larger and older, but nothing to ask permission for. |

**The license is the decision.** A personal workstation generating images for the owner's own non-commercial use fits the Research License; **any image that feeds commercial work does not.**

**Decided 2026-09-26 (owner, in writing): EPIC_004 builds toward Qwen-Image-2.1, used for personal, non-commercial purposes only under the Qwen Research License.** Any commercial use of its outputs is out of scope for this workstation unless a separate commercial license is obtained from Alibaba first. Re-read the license file before any change that leans on it ([CLAUDE.md → §3 item 8](../../CLAUDE.md#3-how-features-are-built-important)).

## Open questions

1. ~~Owner's written decision on the license question above.~~ **Answered 2026-09-26: Qwen-Image-2.1, personal non-commercial use** — see the decision above.
2. **Serving stack.** Diffusers has day-0 support for 2.1; ComfyUI support was unstated on the card when read. The sibling project fronted ComfyUI with a small job-API adapter; whatever serves here sits behind the same adapter pattern so the UI keeps speaking create → status → result.
3. **The Spark's real state.** OS, CUDA, memory, disk, what is already installed and running — recorded in `spark/README.md` by this epic's first story before anything is changed. The sibling project's rule applies: never stop containers or services on the Spark to free memory; list and ask.
4. **Measured footprint.** Weights on disk, memory at the served resolution, seconds per image — measured on the Spark, written into [README.md → Running the Model](../../README.md#running-the-model).

## Stories

Drafted 2026-09-26, self-approved under the owner's overnight authorisation. Serving stack (open question 2): **diffusers**, because ComfyUI has no Qwen-Image-2.1 support, behind a TypeScript server that speaks the contract, the same adapter pattern as the sibling project. The license was re-read on 2026-09-26 before the weights were fetched (CHORE_002): unchanged.

| # | Story | Status |
| --- | --- | --- |
| 014 | [The Spark's state is recorded, and one image is rendered by hand with its time and memory written down](../story/STORY_014_the_sparks_state_is_recorded_and_one_image_is_rendered_by_hand.md) | Not started |
| 015 | [A model server speaks the job API in front of Qwen-Image-2.1](../story/STORY_015_a_model_server_speaks_the_job_api_in_front_of_qwen_image_2_1.md) | Not started |
| 016 | [The model server runs as a service on the Spark, and the app uses it](../story/STORY_016_the_model_server_runs_as_a_service_and_the_app_uses_it.md) | Not started |
