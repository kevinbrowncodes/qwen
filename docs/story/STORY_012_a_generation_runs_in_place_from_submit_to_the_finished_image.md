# STORY_012 — A generation runs in place, from submit to the finished image, and can be cancelled

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want sending a prompt to show my message and a generating card, then the finished image in the same place, with download, edit and regenerate on it. I want a clear message when it fails or is moderated, and a Stop that actually stops it. The page stays responsive throughout.

## Current state

After STORY_011 the composer collects the mode, model, ratio, text and references, and calls `submit`, which does nothing. The app's routes create, poll, cancel and serve the result (STORY_007).

## UI Mockup

**Reference capture:**
- `states/job-submitted@1437.json`, `states/job-generating@1437.json`, `states/job-done@1437.json`, `states/edit-done@1437.json`, `states/job-done@393.json`;
- `interactions.md` → "Submit, then generating", "Cancel", "Done", "Download".

**Measured values committed to:**

| Element | Values |
| --- | --- |
| User bubble | `#293652`, radius 18, padding `9px 16px`, 16px/26px, right-aligned; reference thumbnails above it at 112×112, radius 12 |
| Generating card | `.qwen-media-skeleton` 400×225 (tracking the chosen ratio), `#3e474e`, radius 20, with drift 3.08 s, pulse 1.89 s and glow 1.705 s animations, and a centred 32px icon |
| Result image | 400 wide at the image's ratio, radius 20, fading in |
| Hover actions (desktop) | 32px circles `rgba(0,0,0,0.32)` → 0.5 on hover, 12px apart, 20px white icons, top-right: `Download`; bottom pill `Edit` |
| Row under the image | `Regenerate` |
| Stop | `button.stop-button` with `qwpcicon-stop-fill`, in place of Send while running |

**Desktop, running then done:**

```
                                   ┌───────────────────────────┐
                                   │ a red bicycle…            │  user bubble
                                   └───────────────────────────┘
┌──────────────────────────────┐
│    ░░░░ generating ░░░░      │  skeleton 400×225, animated
│              ✦               │
└──────────────────────────────┘
 (composer below: Stop ■ replaces Send)

┌──────────────────────────────┐
│                         (⤓)  │  hover: Download
│        result image          │
│          ( Edit )            │  hover: bottom pill
└──────────────────────────────┘
 ↻ Regenerate
```

**Failed and moderated** (a line where the image would be, in `rgba(250,251,255,0.5)`):

```
 ⚠ The prompt was refused on content grounds.        ↻ Try again
 ⚠ The generation failed: <server message>           ↻ Try again
```

**Cancelled:**

```
 ⊘ Stopped.                                          ↻ Regenerate
```

**Narrow:** there is no hover. One action row under the image reads `Edit` `Download` `Regenerate`, each at least 44px.

## Departures from the reference

- **Stop cancels.** On the reference Stop stays disabled for a whole image job. Ours sends `DELETE /api/jobs/:id`, and the job shows as cancelled ([CLAUDE.md → §6 rule 4](../../CLAUDE.md#6-key-rules)).
- **A generation is not a chat turn.** There is no chat model and no assistant text around the image. The route is `/g/<id>` (the reference uses `/c/<id>`), and a reload of it reopens the generation from history (STORY_013).
- **Status text:** the skeleton carries "Queued" or "Generating" under it, in small secondary text, because our API reports that and the reference shows nothing. This is kept subtle so the look stays the reference's.
- **Actions kept:** Download, Edit (starts an edit with this image attached) and Regenerate (a new job with the same prompt and options). Good/Bad response, Publish, Share, Create Video and More are not rendered.
- **Download on touch** is in the action row. The reference hides it.

## Acceptance Criteria

- [x] Submitting sends the job **before** changing what the page shows: the POST is in flight, and then the user bubble and skeleton render ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over)). The URL becomes `/g/<id>` with no reload. The composer clears and stays usable.
- [x] JSON is sent without references, and multipart with the files in order with them. The server receives exactly the attached files (sha256 checked in e2e).
- [x] Status is polled until terminal, with backoff: 1 s, then 1.5×, capped at 4 s. It stops on terminal, on leaving the page, and on unmount. The polling effect is correct under React StrictMode's double mount ([CLAUDE.md → §6b](../../CLAUDE.md#6b-e2e-test-conventions)).
- [x] Done replaces the skeleton with the image from `result.url`. Download links to `result.url?download=1`. Edit puts the result into the composer as a reference, fetched as a File. Regenerate submits the same request again.
- [x] Failed and moderated show the messages above, with Try again. A 503 on submit shows the server's message under the composer, and no generation is created.
- [x] Stop is shown while queued or running. It sends DELETE, and on 202 the view shows Stopped. A job that was already terminal (409) shows its real final state.
- [x] Opening `/g/<id>` directly shows that generation from history and resumes polling if it is still running.

## Technical Notes

- `lib/polling.ts` is pure and takes an injected clock: the backoff schedule and the terminal detection. `useGeneration(id)` runs it in an effect whose timers are rescheduled on every setup and cleared on every cleanup. The decide-once state lives in a ref.
- The result image is shown with `<img>` (not `next/image`). The route streams it with a long cache life, because a result never changes.

## Testing Plan

- **Unit:**
  - `app/lib/polling.test.ts`: the backoff sequence 1000, 1500, 2250, 3375, 4000, 4000; terminal detection; a stop signal ends the loop.
  - `app/lib/submit.test.ts`: building JSON vs FormData, where the files keep their order and the ratio is omitted with references.
  - `app/components/Generation.test.tsx`, rendered inside `<StrictMode>` with fake timers and a mocked fetch: the running, then done sequence renders the image once; unmount stops polling (no fetch after it); failed and moderated show their messages; Stop calls DELETE, then shows Stopped.
- **Integration:** N/A. The routes are covered by STORY_007, and this story adds no handler.
- **E2E:** `app/e2e/generate.spec.ts`, at both widths. Every submit registers `submitAndWait` first, and every test ends terminal.
  1. **Text to image** (`done-after-3-polls`): type a prompt and pick 1:1. Expect the user bubble and the skeleton, and the URL `/g/<id>`. Expect the terminal response, then `expectImageLoaded` on the result image with natural width 64. Download's `href` ends in `?download=1`.
  2. **Edit** (default script): attach the reference fixture and submit. The stub's `received` shows one upload with the fixture's sha256, and a ratio of `null`.
  3. **Moderated** (`moderated`): expect "The prompt was refused on content grounds."
  4. **Failed** (`fails-after-2-polls`): expect "The generation failed" and Try again.
  5. **Cancel** (`cancel-midway`): expect the skeleton, click Stop, and expect the DELETE's 202 and "Stopped". The stub lists the job as cancelled.
  6. **Busy:** `POST /__stub/busy {busy:true}`, submit, and expect the 503 message with no generation view. Then reset.
  7. **Reopen:** after 1, reload `/g/<id>` and expect the image again.

  Scripts are chosen per test through the `x-stub-script` header, which the page sends when the e2e sets `window.__stubScript` before submitting (test-only; ignored by the model server). `home.spec.ts`, `image-mode.spec.ts` and `references.spec.ts` stay green.

## Estimated Complexity

L

## Done (2026-09-26)

**Side by side** (ours measured in the gate image with the stub; reference values from the readings):

| Element | Reference | Ours | Delta |
| --- | --- | --- | --- |
| User bubble | right edge 1200, y 94, `#293652`, r18, 9px 16px | right edge 1203, y 94, same colour, radius and padding | text width (the font) |
| Skeleton | 463,196 400×225, `#3e474e`, r20 | 468,194 400×225, `#3e474e`, r20 | x +5, y −2 |
| Result | 400×229, r20 | 400×225 (the fixture is 16:9 exactly), r20 | the fixture |
| Hover pill | 10px above the image's bottom, centred | same | ours holds Edit only (departure) |
| Row under the image | 32px below the image | 32px | none |
| Stop | 1171,944, 32px | 1171,944, 32px | enabled (departure) |
| Composer on this page | 455,932 760×58 | 456,931 760×58 | ±1 |
| Phone result | 17,157 300×171 | 17,205 300×169 | the bubble wraps to two lines in the fallback font |

**Corrections while building:**
- **The stub script is chosen by Playwright routing** (the spec adds `x-stub-script` to the create request), not by a `window.__stubScript` hook in the page. The product code carries no test hook.
- **Regenerate needs the files for an edit.** It is offered for an edit only while this page session still holds the reference files (`lib/pending.ts`). After a reload, the edit shows its reference count as placeholder tiles and offers no Regenerate. It would have to resend images the app does not keep.
- **On desktop, Download sits on the image's hover controls,** as on the reference, so it exists for assistive technology only while the image is hovered. The spec hovers first. On the phone it is in the row under the image.

**Found and fixed on the way:** [BUG_004](../bug/BUG_004_the_gate_hides_the_output_of_a_failing_step.md). The gate's `pnpm run --silent` hid every failing step's own output. It also explains why STORY_011's intermittent integration failure left nothing to read.

**Tests:**
- unit: `polling`, `submit`, `pending`, `generation-view`, and `use-generation` (StrictMode with fake timers; unmount stops polling; a network error keeps it going; a 404 stops it; stop sends DELETE), plus edge cases in `composer-state` and `history` to keep the branch floor honest;
- e2e: `generate.spec.ts`, 7 scenarios at both widths: text to image, an edit whose sha256 the server received, moderated, failed, cancel on both sides, a busy server, and reopening after a reload.

Gate green.
