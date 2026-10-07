# STORY_024 — A generated image shows the settings that made it

**Epic:** [EPIC_005](../epic/EPIC_005_more_add_ons_are_installed_and_tested_for_correct_anatomy.md) (a follow-up the owner asked for on 2026-10-07, while comparing add-ons)
**Status:** Implemented 2026-10-07 (approved by the owner that day: "proceed with completing STORY_024"). The app is deployed; the model server's restart and the manual check on the Spark are pending (see the Done note)
**Created:** 2026-10-07

As the owner, I want every generated image to show the settings that made it (prompt, model, ratio and size, seed, add-on with its strength and guidance, reference count, time taken), both on its page and inside the downloaded file, so that I can tell what produced a good or bad result and reproduce it.

## Current state

Read on 2026-10-07:

- **The page shows only the prompt,** as the user's chat bubble (`app/components/generation/GenerationView.tsx`). Model, ratio, seed and add-on are not visible anywhere once the image exists.
- **The seed reaches the browser but is dropped.** The status echo carries `request.seed` (`app/lib/job-api.ts` line 15), but nothing renders it, and the history entry has no `seed` field (`app/lib/history.ts`: `prompt`, `ratio`, `model`, `referenceImages`, `lora`).
- **Regenerate draws a new seed** (`GenerationPage.tsx` resends prompt, ratio, model, add-on and references, not the seed). That is correct for "another one like this" and stays so; reproducing exactly is a separate action.
- **The add-on's strength and guidance are not echoed.** The contract's status `request` has `lora` (the id) only. The strength and guidance live in `spark/loras.json` on the server and can change between generations (STORY_023 will change them), so an old image cannot be explained from today's manifest.
- **The trigger word is invisible.** The server appends it to the prompt the worker gets (`withTrigger`, `loras.ts`); the echo shows the owner's prompt only.
- **A downloaded PNG carries nothing.** The worker saves with `image.save(path)` (`spark/model/worker.py`), with no text chunks.
- **The reference has no such control.** chat.qwen.ai shows no generation details (`docs/recon/2026-09-26/inventory.md`), so this is a departure.
- **Icons:** the harvested sets have `qwpcicon-info` (desktop) and `appicon-info` (phone).

## UI Mockup

**Reference capture:** none, because the reference has no details control. The button follows the existing action row (`.response-message-footer-actions clone-actions`, as Regenerate), with the reference's icon classes.

Desktop, after the result loads, the action row under the image gains an Info button; clicking it opens a panel under the row:

```
┌──────────────────────────────────────────────┐
│                [ result image ]              │
└──────────────────────────────────────────────┘
 (ⓘ) (↻)
┌─ Settings ───────────────────────────────────┐
│ Prompt     remove the navy swim briefs, …    │
│ Sent       … , d3np3n1s        (trigger)     │
│ Model      Qwen-Image 2.1                    │
│ Size       16:9 · 1376 × 768                 │
│ Seed       42                         [Copy] │
│ Add-on     Flaccid uncut (LonelyCoyote)      │
│            strength 1 · guidance default     │
│ Edit of    1 reference image                 │
│ Time       2 min 6 s                         │
│ [ Copy all ]  [ Same seed again ]            │
└──────────────────────────────────────────────┘
```

- **No add-on:** the Add-on row reads "None" and the Sent row is absent.
- **A text-to-image:** the "Edit of" row is absent.
- **Failed or cancelled:** the Info button shows under the notice too, so a failed job's settings can be read; Time reads "failed after 40 s" or "stopped after 12 s".
- **Narrow (iPhone 13):** the Info button joins Edit, Download and Regenerate in the phone row (44 × 44 touch area); the panel is full width under the row; long prompts wrap.
- **Closed by default;** the button toggles it and its state is not remembered.

## Departures from the reference

- **The Info button and panel are ours.** The reference shows no generation details. The owner asked for them on 2026-10-07.
- **Settings are written into the PNG.** The reference's downloads carry none.

## Acceptance Criteria

- [x] **Contract v1.3** (`docs/contracts/job-api.md`): the status `request` gains `loraScale` and `loraGuidance` (numbers, or `null` without an add-on or without guidance) and `promptSent` (the prompt the model received, with any trigger word). Each is the value applied to that job, recorded when it was created, so later manifest changes do not rewrite old jobs. The stub implements them.
- [x] **History keeps the seed** and the three new fields; entries saved before this story read them as `null`.
- [x] **The Info button** sits in the result's action row (and under a failed or cancelled notice) on the generation page, desktop and narrow, and toggles the panel sketched above.
- [x] **The panel** shows every row in the mockup from the job's own echo, not from the current manifest or the composer, so a reopened old generation shows what made it. The add-on row shows its label from capabilities when the server still offers it, and its id otherwise.
- [x] **Copy** copies the seed; **Copy all** copies every row as plain text, one per line.
- [x] **Same seed again** submits a new generation with every setting of this one, including the seed. For an edit, it is offered only while the references are still in the session (as Regenerate already is).
- [ ] **The downloaded PNG carries the settings** in a `tEXt` chunk named `parameters`, written by the worker: the same rows as Copy all, except Time (corrected 2026-10-07, see below). The image pixels are unchanged.
- [x] **Regenerate is unchanged:** a new seed, as today.

## Technical Notes

- **Server:** `JobRecord.request` gains `loraScale`, `loraGuidance` and `promptSent`, set in `pump()` where the add-on is resolved and `withTrigger` is called, and persisted with the job index. A job saved before this story reads them as `null` and `promptSent` as the prompt.
- **Worker:** `PngInfo().add_text("parameters", …)` from Pillow, passed to `image.save`. The job message gains a `parameters` string built by the server, so the worker stays a dumb renderer.
- **App:** `isRequestEcho` accepts the new optional fields; `HistoryEntry` gains `seed: number | null`, `loraScale`, `loraGuidance`, `promptSent`; the jobs route records `seed` from the create answer's first status. New `app/lib/generation-settings.ts` turns an echo into the panel's rows and the Copy-all text (pure, unit-tested). New `app/components/generation/SettingsPanel.tsx`.
- **Submit with a seed:** `submit()` gains an optional `seed`, sent as the contract already allows.
- **Time:** from `createdAt` to `updatedAt` of the terminal status, so queueing is not counted.

## Testing Plan

- **Unit:**
  - `app/lib/generation-settings.test.ts` (new): rows for a text-to-image without an add-on (no Sent, no Edit-of row); with an add-on and trigger (Sent row, strength and guidance); with guidance null ("default"); an edit (Edit-of row); a failed job (Time "failed after …"); an old entry with nulls (rows that say "not recorded" rather than inventing values); and the Copy-all text, line by line.
  - `app/lib/history.test.ts`: an entry keeps the seed and the new fields; an old entry reads them as null.
  - `app/lib/submit.test.ts`: a seed is sent in JSON and multipart when given, and not when absent.
  - `app/lib/job-api.test.ts`: the echo guard accepts the new fields present, null and absent.
  - `spark/model-server/src/server.test.ts`: with the fake worker, a job with an add-on echoes its scale, guidance and the prompt with the trigger; one without echoes nulls and the prompt unchanged; the job message carries `parameters`; a manifest change after the job leaves its echo as it was.
  - `tools/stub-generation-server/src/server.test.ts`: the stub echoes the three fields.
  - A component test, `SettingsPanel.test.tsx`, rendered in StrictMode: closed by default, toggles, Copy writes the seed to a mocked clipboard.
- **Integration** (`app/test/integration/jobs.test.ts`): a job through the app's route records the seed and the new fields in `/api/history`; reopening reads them back.
- **E2E** (`app/e2e/generate.spec.ts`, desktop and narrow):
  1. Stub script `done-after-1-poll`, with the stub's first add-on chosen and seed fixed by the stub.
  2. Register `waitForResponse` for status `done`, submit, wait for the result image to load (`expectImageLoaded`).
  3. Click Info: the panel shows the prompt, the model label, the ratio and the fixture's size, the seed, the add-on label with its strength.
  4. Click Same seed again: the stub's `received` for the new job has the same seed, prompt, ratio and add-on; wait for its terminal status before the test ends.
  5. Reload the page: Info shows the same values (they come from the echo, not memory).

  Specs that cover the unchanged halves and must stay green: the rest of `generate.spec.ts` (Regenerate still sends no seed), `history.spec.ts`, `references.spec.ts`, `image-mode.spec.ts`.
- **Manual, on the Spark:** one generation with Flaccid uncut (LonelyCoyote): the panel's Sent row ends with `d3np3n1s`; the downloaded PNG's `parameters` chunk (read with Pillow in the model image) matches Copy all.

## Estimated Complexity

M

## Corrections made during implementation (2026-10-07)

- **The PNG cannot carry the Time row.** The worker writes the file before the job's final timestamp exists, so the `parameters` chunk is Copy all minus its last line. The AC above is amended to say so. Every other row matches Copy all word for word, in the same order, because the server builds the lines (`spark/model-server/src/parameters.ts`) in the format `app/lib/generation-settings.ts` uses. The worker only appends the pixel size to the Size line.
- **Time includes queueing.** The Technical Notes say measuring from `createdAt` to `updatedAt` leaves queueing out. It does not, because `createdAt` is when the job was accepted. The contract has no start time, so the panel's Time is from creation to the terminal answer, and the code says so.
- **The seed is recorded from the status echo, not by the create route.** The create answer carries no seed. History picks up the seed and the three v1.3 fields from the first status answer that passes through the app (the generation page's polls, or a history read), so an unwatched job gets them as well.
- **Labels:** the panel's rows say "Add-on", as the mockup does. CHORE_006, still a draft, would rename it to "LoRA" everywhere at once.

## Done note (2026-10-07)

- **Gate:** all six steps green, run by hand through `tools/gate/run.sh` (typecheck, lint, unit, integration, build with the production image, e2e: 67 passed, 11 skipped by design).
- **Tests added:** `app/lib/generation-settings.test.ts`, `app/lib/clipboard.test.ts`, `app/lib/use-capabilities.test.tsx`, `app/components/generation/SettingsPanel.test.tsx` (StrictMode), plus cases in `history.test.ts`, `submit.test.ts`, `job-api.test.ts`, `spark/model-server/src/{parameters,jobs,server}.test.ts`, `tools/stub-generation-server/src/server.test.ts`, `app/test/integration/jobs.test.ts`, and the new scenario in `app/e2e/generate.spec.ts`. That scenario runs at both widths, checks the Info button's 44px touch target on the phone, and asserts that Regenerate's request carries no seed.
- **Departures:** as listed above. The panel and the PNG chunk are ours. There is no reference capture to compare side by side.
- **Pending, on the Spark:** the model server and worker changes (contract v1.3 and the PNG chunk) are not deployed yet. At deploy time, the sibling minimax app's ComfyUI was partway through a video render (GPU 96%, 29 GiB available), and `spark/up.sh` refuses below 60 GiB free. Until the restart, the app runs against the v1.2 server: the panel shows the seed, model, size and time, and says "not recorded" for an add-on's strength, guidance and prompt as sent. Same seed again already works, because the seed has been in the contract since v1. The manual check in the Testing Plan (Flaccid uncut: the Sent row ends with `d3np3n1s`; the downloaded PNG's `parameters` chunk matches Copy all, less Time) is still to do, and the PNG AC stays unchecked until it passes.
