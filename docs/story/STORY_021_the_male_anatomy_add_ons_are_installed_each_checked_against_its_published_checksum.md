# STORY_021 — The male anatomy add-ons and the newer NSFW add-on are installed, each checked against its published checksum

**Epic:** [EPIC_005](../epic/EPIC_005_more_add_ons_are_installed_and_tested_for_correct_anatomy.md)
**Status:** Done (2026-10-02)
**Created:** 2026-10-02 (self-approved under the owner's overnight authorisation, 2026-10-02)

As the owner, I want the four male anatomy add-ons and the newer NSFW add-on installed on the Spark, each fetched from a pinned source and checked against the checksum its creator published, so that STORY_022 can compare them all on the same subjects.

## Current state

Read on 2026-10-02:

- **The manifest and the fetch script fetch from Hugging Face only.** `spark/fetch-loras.sh` runs `huggingface_hub` in `python:3.12-slim` and checks a sha256 only where the manifest gives one. `nsfw-f23gg` has none. Its file on disk hashes to `c29f503f…311aea`, which is TheseAlpacas' v1.0 on Civitai, byte for byte.
- **Civitai needs a token.** Every download URL for the five candidates answers `401` without one. Two of the five exist nowhere else (see the epic's table).
- **Guidance is off.** The worker passes no `true_cfg_scale`, and the pipeline's default is `1.0`, which is no guidance at all. Three of the five creators recommend CFG 3 to 6 for their add-ons. The pipeline has no `guidance_scale`; `true_cfg_scale` is the one knob, and it takes an optional `negative_prompt`.
- **The worker's job message** carries `lora: { id, scale }` and nothing else about the add-on (`spark/model-server/src/protocol.ts`).
- **The composer's dropdown is data-driven.** It lists whatever `/capabilities` offers. With seven add-ons the popup is eight rows. Nothing in `Dropdown.tsx` or `Popup.tsx` limits its height.
- **The Spark tonight:** 121 GiB total, 24 GiB available, with `minimax-comfyui-nsfw` holding 46 GiB and generating (GPU at 96%), and our worker holding 31.5 GiB idle. The same contention STORY_019 was verified under.

## UI Mockup

N/A (no UI code changes). The Add-on dropdown grows from three rows to eight by data alone. Its narrow layout is checked by hand against the live server (Testing Plan).

## Acceptance Criteria

- [x] **The manifest gains the five add-ons** from the epic's table, with these fields: `id`, `label`, `file`, `sha256`, `scale`, optional `trigger`, optional `guidance`, `source`, `origin`, `license`, `readOn`, and a `note` where the terms need one. `flaccid-lonelycoyote` carries `trigger: "d3np3n1s"`.
- [x] **A sha256 is required.** Every entry has one, including the two installed, and the fetch refuses an entry without one. A fetched file that does not match is removed and reported.
- [x] **Two sources.** `source` is either `{ "kind": "huggingface", "repo", "revision" }` or `{ "kind": "civitai", "modelId", "versionId" }`. A Hugging Face source is used where a byte-identical mirror exists; the two Civitai-only add-ons use Civitai.
- [x] **Tokens stay out of sight.** The Hugging Face token comes from `~/.cache/huggingface/token` and the Civitai token from `~/.config/civitai/token`, each mounted read-only when present and never printed. A Civitai entry with no token is reported as waiting for one, by name, and the others are still fetched. The script exits non-zero when any entry is left unfetched.
- [x] **`spark/fetch-loras.sh` has three subcommands:** none (fetch what is missing), `status` (each entry and whether it is on disk), and `verify` (hash every file on disk against the manifest).
- [x] **Guidance per add-on.** A manifest `guidance` between 1 and 10 reaches the worker as `lora.guidance`, and the worker passes it as `true_cfg_scale` for that job. Absent, the pipeline's default applies. A job with no add-on is unchanged.
- [x] **The server and the worker are otherwise unchanged:** the contract (v1.2) does not change, and `/capabilities` lists the add-ons that loaded.
- [x] **The README and `spark/README.md`** describe the manifest's fields, the two sources, the tokens, the subcommands and guidance.

## Technical Notes

- **The fetch engine moves to TypeScript** (`spark/model-server/src/fetch-loras.ts`), so the gate tests it. `spark/fetch-loras.sh` stays the host-side wrapper: it runs the engine in the pinned `node:26-bookworm-slim` image the model image is built from, with the manifest, the output directory and the token files mounted. Nothing is installed on the host.
- **Downloads** are plain HTTPS: Hugging Face at `https://huggingface.co/<repo>/resolve/<revision>/<file>` with the bearer token if present, Civitai at `https://civitai.com/api/download/models/<versionId>?type=Model&format=SafeTensor` with its bearer token. Both redirect to a CDN; `fetch` follows and drops the header on the way, which is right. The file streams to `<id>/<file>.part`, is hashed as it arrives, and is renamed only when the hash matches.
- **Guidance values** (from each creator's page): `penis-coachbate` 3, `uncut-coachbate` 3, `nsfw-thesealpacas-v2` 4 (the middle of 3 to 6). The others state none and get none. Guidance above 1 runs two forward passes per step, so those jobs take about twice as long; STORY_022 measures it.
- **`Lora` gains `guidance?: number`;** the job message gains it inside `lora`; `server.ts` passes it; `worker.py` sets `true_cfg_scale` from it.
- **Corrected during implementation (2026-10-02):** `true_cfg_scale` alone does nothing. The pipeline's `do_true_cfg = true_cfg_scale > 1 and has_neg_prompt` (`pipeline_qwenimage21.py` line 669), and without a negative prompt it logs "classifier-free guidance is not enabled since no negative_prompt is provided" and samples unguided. The first verification run showed exactly that: 136 s against 126 s, not the doubling guidance costs. The worker now also passes `negative_prompt=" "` (the model card's empty negative prompt) whenever guidance is above 1.
- **Memory:** the two installed add-ons added 3 GiB to the worker's peak (40.0 GiB). Five more files total 877 MB. The expected peak is 45 GiB or less, measured after the restart.

## Testing Plan

- **Unit** (`spark/model-server/src/fetch-loras.test.ts`, new):
  - the manifest reader keeps a well-formed entry of each source kind and lists, by id and reason, one with no sha256, one with no source, and one with an unknown kind;
  - the Hugging Face URL encodes a file name with spaces, and the Civitai URL carries the version id;
  - `plan` sorts entries into fetched and missing by what is on disk.
- **Unit** (`loras.test.ts`, `protocol.test.ts`, `server.test.ts`, extended):
  - `guidance` is kept between 1 and 10 and dropped otherwise;
  - the job message encodes `lora.guidance` when the add-on has one, and leaves it out when it has none;
  - with the fake worker, a job naming an add-on with guidance reaches it with `guidance`, and one naming an add-on without reaches it without.
- **Integration** (`fetch-loras.test.ts`, against a local `http.createServer` fake):
  - a file is fetched and lands under `<id>/<file>` when its hash matches;
  - a file whose hash differs is removed, and the run reports it;
  - a Civitai entry sends the bearer token it was given, and a Hugging Face entry sends none when there is no token file;
  - a Civitai entry with no token is skipped and named, the others are fetched, and the result says the run is incomplete.
- **E2E:** none. The UI does not change, and the stub offers two add-ons as before. `image-mode.spec.ts` (the add-on dropdown at both widths), `generate.spec.ts`, `references.spec.ts` and `home.spec.ts` must stay green.
- **Manual, on the Spark** (recorded in the Done note):
  1. Read the box first: `docker ps`, `free -g`, the model log shows no running job.
  2. `spark/fetch-loras.sh`: the three Hugging Face entries fetch and verify; the two Civitai entries are named as waiting for a token.
  3. `spark/up.sh` rebuilds and restarts `qwen-model`. The log lists which add-ons loaded. `/capabilities` offers them.
  4. One text-to-image with `penis-coachbate` finishes, and the worker's log shows no error. Its time against a no-add-on run of the same prompt and seed, and the worker's peak memory, are recorded.
  5. The Add-on dropdown at the iPhone 13 width, opened on http://localhost:3100, shows every row inside the viewport.

## Estimated Complexity

M

## Done (2026-10-02)

- **Built:**
  - the manifest with seven entries, each with `source`, `origin` and the creator's `sha256`, three with `guidance` (`penis-coachbate` 3, `uncut-coachbate` 3, `nsfw-thesealpacas-v2` 4);
  - the fetch engine `spark/model-server/src/fetch-loras.ts` with `fetch-loras-cli.ts`, run by `spark/fetch-loras.sh` in the pinned node image, with the `status` and `verify` subcommands;
  - `guidance` from the manifest through `loras.ts`, the worker protocol and `server.ts` to the worker, which passes `true_cfg_scale` and the empty negative prompt the pipeline needs;
  - tests: `fetch-loras.test.ts` (12, with the two-origin fake so the bearer is seen to drop at the redirect), and the guidance cases in `loras.test.ts`, `protocol.test.ts` and `server.test.ts`.
- **Not foreseen in the draft, and done:** `true_cfg_scale` alone is ignored by the pipeline (Technical Notes, corrected). The first verification run caught it: 136 s against 126 s instead of a doubling, and the worker's log carried the pipeline's warning. The worker now sends `negative_prompt=" "` with any guidance above 1.
- **Gate:** run by hand twice, before and after that fix, all six steps green: typecheck, lint, unit (recon 111, stub 65, model server 90, app 142), integration 21, build with the production image, e2e 65.
- **Manual, on the Spark, 2026-10-02** (`Qwen/Qwen-Image-2.1` @ `790c926`; the GPU shared throughout with `minimax-comfyui-nsfw` holding 46 GiB and generating, 96% utilisation before the runs; it was left running, CLAUDE.md §4a):
  1. **Read first:** `docker ps` unchanged before and after; 24 GiB available; no job in the model's log.
  2. **Fetch:** three fetched with matching sha256 in 2 m 29 s (`penis-coachbate` 159.4 MB, `uncut-coachbate` 159.4 MB, `nsfw-thesealpacas-v2` 79.7 MB); two named as waiting for a Civitai token; exit 1 as designed. `verify`: five ok, two missing. The on-disk `nsfw-f23gg` hashes to TheseAlpacas' v1.0 exactly.
  3. **Headers** (the JSON index only, not the weights): all three new files are Kohya/Comfy keys (`diffusion_model.transformer_blocks.N.attn.*.lora_{A,B}`), 384 tensors, bf16, ranks 32, 32 and 16.
  4. **Restart:** the image rebuilt and the container recreated by `spark/up.sh`; `[model] worker ready with add-ons nsfw-f23gg, uncensored, penis-coachbate, uncut-coachbate, nsfw-thesealpacas-v2`; the two unfetched entries logged as not fetched; `/capabilities` lists the five. The idle worker holds 31.7 GiB (31.5 with two add-ons).
  5. **Timing and memory,** the same prompt at seed 42 and 16:9 (1376×768). Before the fix: none 126.0 s, `penis-coachbate` 136.3 s with the guidance warning in the log. After: none 114.8 s, `penis-coachbate` at guidance 3 **265.5 s, 2.3×**, no warning, no error. Worker peak **39.2 GiB** without and **39.3 GiB** with the add-on (STORY_019 measured 40.0 with two add-ons loaded). The images were the ordinary verification prompt (a bicycle) and were not opened.
  6. **The Add-on dropdown at the iPhone 13 width** (390×664), on the live app: six rows, the list at x 173–382 and y 357–603, inside the viewport. **Observation:** each row is 36 px tall, the lifted dropdown's own height since STORY_010, under the 44 px touch-target rule; noted for the owner, not changed here.
- **Left for the owner:** save a Civitai token at `~/.config/civitai/token` (the assistant never handles it), then `spark/fetch-loras.sh` and `spark/up.sh` bring in `erect-friendofmale` and `flaccid-lonelycoyote`.
