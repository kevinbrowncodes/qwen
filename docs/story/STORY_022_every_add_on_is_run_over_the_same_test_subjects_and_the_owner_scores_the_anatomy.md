# STORY_022 — Every add-on is run over the same test subjects, and the owner scores the anatomy

**Epic:** [EPIC_005](../epic/EPIC_005_more_add_ons_are_installed_and_tested_for_correct_anatomy.md)
**Status:** In progress
**Created:** 2026-10-02 (self-approved under the owner's overnight authorisation, 2026-10-02)

As the owner, I want every add-on, and no add-on, run over the same generated test subjects with the same edit prompt, laid out side by side with a scorecard to fill in, so that I can judge which add-ons give correct anatomy from one page rather than from scattered generations.

## Current state

Read on 2026-10-02:

- **The model server offers whatever loaded.** `/capabilities` lists the add-ons by id and label (five tonight; seven once the two Civitai-only files are fetched, STORY_021). Their strength and guidance are the manifest's.
- **The job API has no "use job X's result as a reference".** An edit takes `referenceImage` file parts (multipart). A result stays on the server's disk and is served at `GET /jobs/:id/result`, so a client can turn a job id into a reference by downloading it and uploading it again.
- **Nothing in the repo runs jobs in a batch.** The app submits one at a time from the composer. `spark/model/try.sh` renders by hand through the pipeline, not through the API.
- **The host has node 18 and python 3.12.** Node 26 runs TypeScript directly, so repo scripts run in the pinned `node:26-bookworm-slim` image (as `spark/fetch-loras.sh` does since STORY_021).
- **Timing per job tonight** is contended: `minimax-comfyui-nsfw` holds 46 GiB and is generating. STORY_019 measured 120–135 s per 16:9 image in that state against 52–66 s idle. A job with guidance above 1 takes about twice as long again.

## The test subjects are generated, never photographed

The bench's only inputs are the prompts below and the job ids of generations this server made from them. It takes no file paths. That is how the epic's rule is enforced: no photograph of a real person can be an input.

**Subject A, the neutral baseline** (3:4, seeds 1001 and 1002):

> Full-body studio photograph of a man in his mid-thirties, about 35 years old, standing facing the camera with his arms relaxed at his sides and his feet shoulder-width apart. Athletic build, short dark brown hair, a neatly trimmed full beard, faint lines at the corners of his eyes. He wears a plain navy crew-neck t-shirt, mid-wash straight-leg jeans with a brown leather belt, and white sneakers. Plain light grey seamless backdrop, soft even studio lighting, sharp focus, natural skin texture, photorealistic, the whole body in frame from head to feet.

**Subject B, a physique pose** (3:4, seeds 2001 and 2002):

> Full-body photograph of a muscular bodybuilder in his early thirties, about 32 years old, standing in a front double biceps pose in a gym locker room. Broad shoulders, defined arms and abdominals, a short beard, short sandy-blond hair. He wears a fitted grey t-shirt, black athletic shorts, white crew socks and grey trainers. Tiled walls and metal lockers behind him, overhead lighting, photorealistic, sharp focus, the whole body in frame from head to feet.

**The edit prompt,** sent with each subject image as the reference, at seed 42, in the subject's shape:

> remove all clothing from the subject

**The text-to-image comparison,** one per setting, at 3:4 and seed 42, so the add-ons are also compared without an edit in the way:

> Full-body studio photograph of a nude man in his mid-thirties, about 35 years old, standing facing the camera with his arms relaxed at his sides and his feet shoulder-width apart, wearing nothing at all. Athletic build, short dark brown hair, a neatly trimmed full beard. Plain light grey seamless backdrop, soft even studio lighting, sharp focus, natural skin texture, photorealistic, the whole body in frame from head to feet.

## UI Mockup

N/A (no change to the app). The bench writes a local contact sheet the owner opens from disk; it is not part of the app:

```
┌─ Add-on bench, 2026-10-02 ──────────────────────────────────────────────────────────────┐
│ Subjects: A-1001, A-1002, B-2001, B-2002 (clothed, no add-on)   Edit: "remove all …"    │
│                                                                                          │
│             │ none      │ nsfw-f23gg │ uncensored │ penis-coachbate │ … (one per add-on) │
│ ────────────┼───────────┼────────────┼────────────┼─────────────────┼──────────────────  │
│ A-1001      │ [image]   │ [image]    │ [image]    │ [image]         │                    │
│ [clothed]   │ 118 s     │ 121 s      │ 124 s      │ 240 s           │                    │
│ A-1002      │ …         │            │            │                 │                    │
│ B-2001      │ …         │            │            │                 │                    │
│ B-2002      │ …         │            │            │                 │                    │
│ text-to-img │ [image]   │ [image]    │ [image]    │ [image]         │                    │
│                                                                                          │
│ A failed cell shows its error in place of the image.                                     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## Acceptance Criteria

- [ ] **`spark/bench-loras.sh`** runs the bench against the model server on the Spark, writing into the gitignored `outputs/bench/<date>/`: every result as a PNG, `index.json` with each cell's job id, status, seconds and error, `contact-sheet.html` as sketched, and `scorecard.md` prefilled with the cells and timings.
- [ ] **The plan is the epic's.** Four subject generations (no add-on); for each subject image and each setting (none, then every add-on `/capabilities` lists) one edit with the edit prompt at seed 42; and for each setting one text-to-image with the comparison prompt at seed 42. The settings come from `/capabilities`, so an add-on installed later is picked up by the next run.
- [ ] **Edits take job ids, never files.** A subject is the result of a job on this server, downloaded from `GET /jobs/:id/result` and uploaded as the edit's reference. The bench has no option to read an image from disk.
- [ ] **It resumes.** A run skips every cell `index.json` records as done, reuses the subjects by their job ids, and runs only what is missing or failed, so a run interrupted or extended with a new add-on continues rather than starts over. A subject whose job the server no longer has is generated again.
- [ ] **A failed cell does not stop the run.** It is recorded with the server's error, shown on the sheet, and the exit status is non-zero at the end.
- [ ] **One job at a time**, each polled until terminal; the bench never leaves a job running when it exits normally.
- [ ] **The scorecard is committed as text,** under `docs/bench/`, with no images: one row per cell for the owner's four marks (anatomy, body, edit fidelity, artefacts) and notes, and one row per add-on for the decision STORY_023 implements (keep, strength, guidance).
- [ ] **The assistant does not open the nude results.** Judging them is the owner's. The four clothed subject images may be checked for being usable (one adult man, whole body in frame).

## Technical Notes

- **`spark/model-server/src/bench.ts`** is the engine: the plan (`buildPlan`), the client (`createJob`, `waitForTerminal`, `fetchResult`), the index, the sheet and the scorecard. **`bench-cli.ts`** is the entry point (`node bench-cli.ts <base-url> <out-dir> <manifest>`), excluded from coverage like `main.ts`. The wrapper runs it in the pinned node image with `--network host` so `127.0.0.1:4120` is reachable.
- **Cells** are keyed `edit/<subject>/<setting>` and `t2i/<setting>`, with file names `edit_A-1001_none.png`, `t2i_penis-coachbate.png`. Settings use the add-on ids; `none` is no add-on.
- **Polling** every 3 s on the Spark (100 ms in tests). A cell's seconds are from `createdAt` to `updatedAt` of the terminal status, so queueing does not count. The bench sends nothing to the worker directly.
- **The scorecard template** takes each add-on's `scale` and `guidance` from the manifest so the owner's decision is written against the settings that ran.
- **Expected run tonight:** 4 + 4×6 + 6 = 34 jobs with five add-ons loaded (44 with seven). At the contended 120–135 s, and about twice that for the three with guidance, roughly 80–100 minutes.

## Testing Plan

- **Unit** (`spark/model-server/src/bench.test.ts`, new):
  - `buildPlan` with two settings yields the four subjects, eight edits and two text-to-image cells, in that order, with the right prompts, seeds, ratios and add-on ids;
  - `remaining` skips cells the index records as done and keeps failed and absent ones;
  - `contactSheet` renders one image per done cell with its seconds, an error in place of a failed cell, and the clothed subject in the first column;
  - `scorecardTemplate` lists one row per cell with its job id and seconds, and one row per add-on with its strength and guidance from the manifest.
- **Integration** (`bench.test.ts`, against the model server with the fake worker in-process, as `server.test.ts` does):
  - a run with two fake add-ons completes every cell: each PNG is the fixture, the index records a job id and `done` for each, and the worker's log shows the edits carried a reference and the planned `lora` ids and seeds;
  - a second run submits no job and reports every cell as already done;
  - with the subjects' PNGs kept but the server restarted into an empty output directory, the subjects are generated again and the rest reused;
  - with an edit prompt the fake worker fails on, every edit cell is recorded `failed` with the message, the text-to-image cells still run, and the outcome says the run is incomplete.
- **E2E:** none. The app does not change; `generate.spec.ts`, `image-mode.spec.ts`, `references.spec.ts` and `history.spec.ts` must stay green.
- **Manual, on the Spark** (recorded in the Done note):
  1. Read the box first: `docker ps`, `free -g`, the model log shows no running job.
  2. `spark/bench-loras.sh` runs to the end. The Done note records the job count, the total time, the seconds per setting, and any failed cell.
  3. The four clothed subjects are checked for being usable. Nothing else is opened.
  4. The scorecard, with job ids and timings, is committed under `docs/bench/`.

## Estimated Complexity

M
