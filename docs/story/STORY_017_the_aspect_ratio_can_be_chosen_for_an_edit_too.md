# STORY_017 — The aspect ratio can be chosen for an edit too

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-09-27)
**Status:** Done (2026-09-27)
**Created:** 2026-09-27

As the owner, I want the aspect-ratio picker to stay in the composer whenever Create Image is on, including when I have attached a reference image, so that I can choose the shape of an edited image instead of always getting the reference's shape.

## Current state

- **The app** (STORY_011) hides the ratio dropdown while any reference is attached, as the reference does. The app then sends an edit with no ratio (`lib/submit.ts`).
- **The contract** (v1) says `ratio` is "ignored, and echoed as `null`" with references. The stub (`validateRequest`) and the model server (`spark/model-server/src/validation.ts`) both set ratio to `null` for an edit. The server then sends the worker no width or height.
- **The model** (checked in `pipeline_qwenimage21.py` on 2026-09-27): `height = height or calculated_height`. An explicit width and height are honoured with reference images, and only when they are absent does the size come from the last reference at about 1 MP.

## UI Mockup

Image mode with a reference attached. The ratio dropdown is back, with a first entry "Match reference", which is the default:

```
┌───────────────────────────────────────────────────────────────────────┐
│ [▣×]                                                                  │
│ make the bicycle bright blue                                          │
│ (+) (✦ Create Image ×) (Qwen-Image 2.1 ▾) (Match reference ▾)     (↑) │
└───────────────────────────────────────────────────────────────────────┘
                                             ┌───────────────────────┐
                                             │ ⧉ Match reference   ✓ │
                                             │ □ 1:1                 │
                                             │ ▯ 2:3                 │
                                             │ … (the seven, as now) │
                                             └───────────────────────┘
```

- Without a reference, nothing changes: the seven ratios, 16:9 by default.
- The trigger reads "Match reference" or the chosen ratio.
- Narrow: the same, with the popup opening above.

## Departures from the reference

- **The ratio stays visible in an edit.** The reference hides it (`composer-reference-attached@1437.json`). The owner asked for this on 2026-09-27.

## Acceptance Criteria

- [x] **Contract v1.1** (`docs/contracts/job-api.md`): with references, `ratio` is optional.
  - Absent, empty or `"match"` means "take the shape of the last reference", as today, and it is echoed as `null`.
  - One of `ratios[].id` means "produce that ratio's size", and it is echoed as sent.
  - Any other value answers `400 unsupported_option`.
  - Without references, nothing changes. The shared validation vectors gain these cases.
- [x] **The stub and the model server both implement v1.1.** For an edit with a ratio, the model server sends the worker that ratio's width and height. The worker already passes them to the pipeline.
- [x] **The app keeps the ratio dropdown in image mode while references are attached,** with "Match reference" first and selected by default. Removing the last reference goes back to the plain ratio list with the ratio chosen before. The choice made for edits is kept separately from the text-to-image one (the reducer's `editRatio`, "match" by default).
- [x] **What is sent:** an edit with "Match reference" sends no `ratio` (as today); an edit with a ratio sends `ratio` in the multipart form. History records the edit's ratio (`null` for match).

## Technical Notes

- The reducer gains `editRatio: "match" | <ratio id>`. `showsRatio` goes away, because the dropdown always shows. `requestFrom` picks the ratio from `editRatio` when references are attached.
- The app's routes forward multipart fields unchanged, so no route change is needed. History's `ratio` for an edit comes from the form (`lib/history` already stores `ratio: string | null`).

## Testing Plan

- **Unit:**
  - `app/lib/composer-state.test.ts`: the default `editRatio` is "match", changing it leaves the text-to-image ratio alone, and it is stored in the session.
  - `app/lib/submit.test.ts`: an edit with "match" has no ratio field, and an edit with 1:1 has `ratio=1:1` in the form.
  - `spark/model-server/src/validation.test.ts` and the stub's `server.test.ts`: the new shared vectors (edit with no ratio, with `"match"`, with 1:1, with 21:9).
  - `spark/model-server/src/server.test.ts`: an edit with 1:1 reaches the fake worker with width 1024 and height 1024; an edit without a ratio reaches it with no size.
- **Integration:** `app/test/integration/jobs.test.ts`: a multipart edit with `ratio=1:1` reaches the stub, and its `received` hook echoes ratio `1:1`.
- **E2E:** `app/e2e/references.spec.ts`, updated. Scenario:
  1. Attach the fixture. The ratio dropdown reads "Match reference".
  2. Open it and see 8 options, "Match reference" first.
  3. Pick 1:1, submit (stub `done-after-1-poll`), and the stub's `received` shows ratio `1:1` and one upload.
  4. Remove the reference and the dropdown reads the text-to-image ratio again.

  The step that asserted the dropdown disappears is replaced, deliberately: it asserted the behaviour this story changes, at the owner's request. `generate.spec.ts`'s edit scenario stays green (Match reference, no ratio).
- **Manual:** on the Spark, edit a 16:9 image with 1:1 chosen, and the result is 1024×1024 and follows the prompt. Recorded with the model, the checkpoint and the date.

## Estimated Complexity

S–M

## Done (2026-09-27)

- **Contract v1.1:** the shared vectors gain 5 edit cases, and the stub and the model server both pass them.
- **The app** keeps the ratio dropdown in image mode, with "Match reference" first and the default while an image is attached.
- **Tests:** app unit 101, stub 58, model server 48, the app's integration lane (an edit that names a ratio, and one that matches), and e2e (8 options; a 1:1 edit the stub received as `1:1`). The gate is green.
- **Replaced deliberately:** the STORY_011 e2e step that asserted the dropdown disappears, and the stub test that expected an edit's ratio to be ignored. Both asserted the behaviour this story changes at the owner's request.
- **Manual verification:** `Qwen/Qwen-Image-2.1` at `790c926`, 2026-09-27. A 1376×768 lighthouse edited with `ratio=1:1` came back as **1024×1024** in 61 s: the same scene, recomposed to a square.
