# STORY_019 — Community add-ons can be chosen to steer the model

**Epic:** [EPIC_004](../epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md) (a follow-up the owner asked for on 2026-09-29)
**Status:** Done (2026-09-29)
**Created:** 2026-09-29

As the owner, I want to pick a community add-on (a LoRA) from the composer for a generation, so that I can fix what the base model gets wrong, starting with anatomy in adult images, without restarting anything.

## Current state

Read on 2026-09-29:

- **The pipeline can take add-ons.** In `qwen/model:dev` (diffusers `e0abab83`), `QwenImage21Pipeline(DiffusionPipeline, QwenImageLoraLoaderMixin)` offers `load_lora_weights`, `set_adapters`, `enable_lora` and `disable_lora`. The worker (`spark/model/worker.py`) uses none of them.
- **No option exists for them.** The contract (v1.1) has no add-on field. The worker's `ready` message carries nothing. The composer has two dropdowns, model and ratio.
- **History:** the app's jobs route builds each history entry from named fields (`app/app/api/jobs/route.ts`: `prompt`, `ratio`, `model`, `referenceImages`). A new field needs adding there. It is not forwarded automatically.
- **LoRAs only fit their own architecture.** Hugging Face lists 50+ adapters for `Qwen/Qwen-Image-2.1`. The many for the original 20B Qwen-Image won't load.

## Candidates

Model cards and file headers read on 2026-09-29. For the headers, only the JSON index at the front of each file was read, not the weights. No sample images were opened.

| Id | Repo @ revision | File | Size | Format | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `nsfw-f23gg` | `f23gg/NSFW-LORA-Qwen-Image-2.1` @ `ed1acb1557` | `NSFW Qwen Lora.safetensors` | 159.4 MB | kohya/Comfy keys (`diffusion_model.transformer_blocks.N.attn.*.lora_{A,B}`), rank 32, 384 tensors | **none stated** | The most downloaded NSFW-specific 2.1 LoRA (2,510). The card is empty: no trigger and no strength. `chfm/NSFW-LORA-Qwen-Image-2.1` is a re-upload of it and is not listed. |
| `uncensored` | `JoyFusionAI/Qwen-Image-2.1-Uncensored-LoRA` @ `112f15b699` | `qwen-image-2.1-uncensored-lora.safetensors` | 33.6 MB | PEFT keys (`…lora_{A,B}.default.weight`), rank 16, 256 tensors | Qwen Research License (non-commercial) | A documented mirror of `abenzerps/Qwen-Image-2.1-Uncensored-GGUF`. Its card gives sha256 `00ee2cb7…4ca1` and strength 1.0. |

**Considered and left out:**

- **`e-n-v-y/Qwen-Image-2.1-Fix`:** its card doesn't say what it fixes, and it is a DoRA (`dora_scale` tensors) that may not load here. It can be a later story if the owner wants it.
- **Face-swap and likeness LoRAs** (for example `Alissonerdx/BFS-Best-Face-Swap`): with edits, they would put a real person's face into explicit output. They are not installed.

**`nsfw-f23gg` has no licence.** Its terms are unknown. Installing it is the owner's decision, for personal and private use only, and the manifest records that decision.

## UI Mockup

**The reference capture:** none, because chat.qwen.ai has no add-on control. The dropdown is our existing `Dropdown` (`app/components/Dropdown.tsx`) with the reference's classes, the same as the model and ratio dropdowns (`docs/recon/2026-09-26/states/composer-image-mode@1437.json`).

In image mode, with add-ons installed (desktop):

```
┌───────────────────────────────────────────────────────────────────────┐
│ a portrait in a garden                                                │
│ (+) (✦ Create Image ×) (Qwen-Image 2.1 ▾) (16:9 ▾) (None ▾)       (↑) │
└───────────────────────────────────────────────────────────────────────┘
                                         ┌──────────────────────────┐
                                         │ None                   ✓ │
                                         │ NSFW (f23gg)             │
                                         │ Uncensored               │
                                         └──────────────────────────┘
```

- **With an add-on chosen,** the trigger reads its label, for example `(Uncensored ▾)`.
- **In an edit,** the dropdown is the same, after the ratio.
- **With no add-ons installed** (the capabilities list is empty), the dropdown isn't shown, so the composer is exactly as today.
- **Narrow:** the trigger shows an icon only (the harvested `appicon-toolbox`), like the model dropdown's short label. The popup opens above.

## Departures from the reference

- **The add-on dropdown is ours.** The reference runs a cloud model with no add-ons. The owner asked for it on 2026-09-29.

## Acceptance Criteria

- [x] **Contract v1.2** (`docs/contracts/job-api.md`):
  - `GET /capabilities` gains `loras: [{ "id", "label" }]`, which is `[]` when none are installed.
  - `POST /jobs` gains an optional `lora`. When absent, empty or `"none"`, no add-on is used. An id from `loras` applies that add-on at its manifest strength. Anything else gets `400 unsupported_option` with `field: "lora"`.
  - The status `request` echoes `lora`, or `null`.
  - The shared validation vectors gain those four cases.
- [x] **A committed manifest, `spark/loras.json`,** lists each approved add-on: `id`, `label`, `repo`, `revision`, `file`, `scale`, optional `trigger`, `license`, `readOn`, and a `note` recording the owner's decision where the licence is missing.
- [x] **`spark/fetch-loras.sh`** fetches the manifest's files into the gitignored `models/loras/<id>/` in a container, as `fetch-weights.sh` does, and has a `status` subcommand.
- [x] **The worker loads every installed add-on once at start.** An add-on that fails to load is logged and skipped. The worker reports the ones that loaded in `ready` (`{"type":"ready","loras":[ids]}`), and the model server lists only those in capabilities.
- [x] **Each job uses exactly the add-on it names, or none.** A job with no add-on after one with an add-on runs with none.
- [x] **The stub implements v1.2** with two fake add-ons, and records `lora` in `received`.
- [x] **The composer shows the add-on dropdown in image mode** when capabilities list add-ons, with "None" first and the default. The choice survives a reload within the session, and an id the server no longer offers falls back to None.
- [x] **What is sent:** None sends no `lora`, and an add-on sends its id, in JSON and in multipart. The history entry records `lora`, or `null`.

## Technical Notes

- **Manifest to server:** the model server reads the manifest (`LORA_MANIFEST`, mounted read-only). It sends the worker `loras: [{id, path}]` at start, as a first `init` line, so the worker never parses the manifest itself. The job message gains `lora?: { id, scale }`. When the manifest has a `trigger`, the server appends it to the prompt.
- **Worker:**
  - At start: `load_lora_weights(dir, weight_name=file, adapter_name=id)` for each add-on, then `disable_lora()`.
  - Per job: `enable_lora()` and `set_adapters([id], [scale])`, or `disable_lora()`.
  - Adapters are not fused, so switching between jobs is free. The per-step cost is measured on the Spark.
  - The kohya/Comfy key format (`diffusion_model.` prefix) is converted by diffusers' Qwen LoRA loader. If the installed version can't convert it, that add-on fails to load, is logged, and is skipped, and the story records it.
- **`spark/compose.yaml`:** mounts `../models/loras:/loras:ro` and `./loras.json`.
- **App:**
  - `composer-state` gains `lora` ("none" by default), `setLora`, serialize and restore, and a reset in the `capabilities` action, following `editRatio`.
  - `submit.ts` sends the field.
  - The jobs route adds `lora` to the recorded entry.
  - `lib/history` gains `lora: string | null`. Older entries read as `null`.
- **Memory:** the two add-ons together are 193 MB in bf16 on top of about 37 GiB. That is negligible, and it is confirmed by the measurement below.

## Testing Plan

- **Unit:**
  - `app/lib/composer-state.test.ts`: the default is none; `setLora` sets it; it round-trips through the session; capabilities without it reset it to none.
  - `app/lib/submit.test.ts`: None sends no `lora` field (JSON and multipart); `uncensored` sends `lora=uncensored` in both.
  - `app/lib/history.test.ts`: an entry keeps `lora`, and an old entry without it reads as `null`.
  - `spark/model-server/src/validation.test.ts` and `tools/stub-generation-server/src/server.test.ts`: the four new shared vectors.
  - `spark/model-server/src/protocol.test.ts`: `ready` with and without `loras` parses; the job message carries `lora`.
  - `spark/model-server/src/server.test.ts`, with the fake worker:
    - capabilities list only the ids `ready` reported;
    - a job naming one reaches the worker with `{id, scale}` and the trigger appended;
    - a job with none reaches it with no `lora`;
    - an unknown id gets a 400 and never reaches the worker.
- **Integration:** `app/test/integration/jobs.test.ts`:
  - a JSON job and a multipart edit, each with `lora`, reach the stub, and `received` echoes it;
  - `/api/history` records it;
  - a job without it records `null`.
- **E2E:** `app/e2e/image-mode.spec.ts`, desktop and narrow.
  1. Enter image mode. The Add-on dropdown reads "None" and lists None and the stub's two add-ons.
  2. Pick the first. Register `waitForResponse` for status `done`, then submit with stub script `done-after-1-poll`.
  3. The stub's `received` shows that `lora`.
  4. The result `<img>` loads (`expectImageLoaded`).

  These specs cover the unchanged halves and must stay green:
  - `generate.spec.ts`, all of it: no add-on is chosen, and nothing is sent;
  - `references.spec.ts`;
  - `home.spec.ts`;
  - the rest of `image-mode.spec.ts`: model and ratio behave as before with a third dropdown beside them.

  **What the e2e cannot see:** the no-add-ons case in the UI, because the stub always offers two. The unit test for capabilities and `composer-state` covers it.
- **Manual, on the Spark:**
  - First, read the box: `free -g`, no running job, and `docker ps`.
  - Fetch the add-ons, rebuild, and restart `qwen-model`. Check that the log shows both loaded, or which one failed and why.
  - Generate one prompt and seed with None, with `nsfw-f23gg`, and with `uncensored`. The owner judges the images; no test asserts on them.
  - Record the seconds per image with and without an add-on, and the peak memory.
  - The Done note records the model, the checkpoint, each add-on's revision and the date.

## Estimated Complexity

M

## Done (2026-09-29)

- **Built:**
  - contract v1.2, with the shared `loraCases`;
  - `spark/loras.json` and `spark/fetch-loras.sh`;
  - the model server: `loras.ts`, the `init` line, `ready` listing what loaded, the prompt with trigger words, and a waiting job failed if its add-on is gone after a worker restart;
  - the worker: loads each add-on unfused, and switches per job;
  - the stub: two fake add-ons;
  - the app: the reducer, submit, the jobs route and history, the Add-on dropdown, and Regenerate keeping the add-on.
- **Not foreseen in the draft, and done:**
  - **The image needed `peft`.** The first restart logged `ValueError: PEFT backend is required for load_lora_weights()` for both add-ons. The model still served, as the skip-on-failure path intends. `peft==0.21.1` is now its own pinned layer in `spark/model/Dockerfile`; torch, diffusers and transformers are unchanged.
  - **The phone footer didn't fit a third dropdown.** At iPhone 13, "Model 2.1" wrapped onto two lines, the footer overflowed by 18 px (Send ended at 384 against the composer's 373), and the add-on popup ran off the right edge. Fixed with three changes:
    - trigger labels don't wrap;
    - the phone's add-on trigger is its icon without a chevron, with a 44×44 `::before` touch area;
    - `Dropdown` clamps an open popup inside the viewport (`clampLeft` in `Popup.tsx`, unit-tested).

    Measured after: no overflow, Send ends at 366, and the popup ends at 382 of 390. The narrow e2e now asserts all of this.
- **Tests:**
  - model server 68, including `loras.test.ts`, the add-on vectors, and the server tests with the fake worker's `init`, `ready` and `FAKE_LORA_FAIL`;
  - stub 65;
  - app unit 122 plus `clampLeft`;
  - integration: capabilities pass-through; an add-on in JSON and in an edit's form, recorded; none recorded as null; an unknown one relayed as 400;
  - e2e 61: the add-on scenario at both widths, with the narrow layout checks.

  The gate is green. One assertion was updated deliberately: the protocol test's bare `ready`, which now carries `loras: []`.
- **Manual, on the Spark, 2026-09-29:** `Qwen/Qwen-Image-2.1` @ `790c926`, `nsfw-f23gg` @ `ed1acb1`, `uncensored` @ `112f15b`.
  - Both loaded: `[model] worker ready with add-ons nsfw-f23gg, uncensored`.
  - `/api/capabilities` offers both through http://qwen.local.
  - The same prompt at seed 42 and 16:9 finished 1376×768 with none, with `nsfw-f23gg` and with `uncensored`. The status echoed each add-on.
  - **Peak GPU memory of the worker: 40.0 GiB** (31.4 GiB loaded and idle).
  - **Timing was taken with the GPU shared.** `minimax-comfyui-nsfw` held 46 GiB and was generating: the GPU was at 96% before the runs, and its log showed two prompts in those ten minutes. It was left running (CLAUDE.md §4a).
  - An A/B in that state: none 120.5 s, `uncensored` 134.5 s, so an add-on costs about **+12%**. The first no-add-on run, 66.5 s, likely came before the contention began. **Clean numbers on an idle GPU are still to be taken.**
  - The images were not opened by the assistant. Judging them is the owner's part.
