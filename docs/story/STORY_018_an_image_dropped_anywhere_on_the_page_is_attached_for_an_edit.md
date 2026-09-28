# STORY_018 — An image dropped anywhere on the page is attached for an edit

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-09-28)
**Status:** Done (2026-09-28)
**Created:** 2026-09-28
**Relates to:** [STORY_011](STORY_011_reference_images_can_be_attached_for_an_edit.md) (its drop and paste AC)

As the owner, I want to drop an image anywhere on the page, not just onto the composer box, and have it attached as a reference, so that dragging a picture in from Finder just works.

## Current state

Read on 2026-09-28 in `app/components/composer/Composer.tsx` and probed on the running app, with synthetic `dragover` and `drop` events in Chromium:

- **The composer box** (`[data-testid=composer]`) handles `dragover` and `drop`. A drop onto it or its textarea attaches the image and enters image mode (`{"dropHandled":true,"mode":"image","thumbs":1}`).
- **Anywhere else** (the page body, the heading, the result view, the sidebar), nothing handles the drop (`{"dragoverAccepted":false,"dropHandled":false,"mode":"chat"}`). The browser's default then opens the image in the tab, and the app is gone.
- **Paste** is handled only while the prompt textarea has focus.
- **No test covers drop or paste.** STORY_011 ticked its AC ("Dropping or pasting image files onto the composer attaches them") without one.

## UI Mockup

**The reference capture:** the harvested stylesheet has the reference's full-window drop overlay (`app/public/reference/reference.css`, from `docs/recon/2026-09-26/assets/css/main.css`):

| Rule | Value |
| --- | --- |
| `.dropzone-overlay` | `position: fixed; inset: 0`, flex centred, `z-index: 999`, `pointer-events: none` |
| `.dropzone-overlay-content` | fills the overlay, `padding: 20px`, background `#ffffffb3`, `backdrop-filter: blur(10px)` |
| `.dropzone-overlay-content-wrapper` | `border: 1px dashed var(--line-primary-border)`, `border-radius: 24px`, content centred |
| `.dropzone-overlay-inner` | a centred column (its contents were not captured) |

The overlay's contents and its dark-theme wash were not captured, because no drag happened during recon. The sketch fills those in (see Departures).

Dragging a file over the page, at any width:

```
┌──────────────────────────────────────────────────────────────────────┐
│ (the page, blurred under a translucent wash)                        │
│  ╭╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╮  │
│  ┆                                                               ┆  │
│  ┆                           [▣ icon]                            ┆  │
│  ┆                   Drop images here to edit                    ┆  │
│  ┆          PNG, JPEG or WebP · up to 10 images, 20 MB each      ┆  │
│  ┆                                                               ┆  │
│  ╰╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╯  │
└──────────────────────────────────────────────────────────────────────┘
```

- **After the drop:** the overlay is gone and the composer shows the thumbnail in image mode, exactly as when attaching with `+` (STORY_011).
- **A refused drop** (the wrong type, too large, too many): no thumbnail, and the composer shows the same refusal as `+` gives.
- **Dragging text or a link** (not files): no overlay, and the browser behaves as it does now.
- **Narrow:** the same overlay, full-window, with the 20 px padding.

## Departures from the reference

- **The overlay's text and icon are ours.** The reference's inner markup was not captured. Ours uses the harvested `aiPicture` sprite icon, the line "Drop images here to edit", and one line naming the accepted types.
- **The wash is dark in our dark theme.** The captured rule is the light theme's `#ffffffb3`. In dark we use `#171717b3`, the app's background at the same alpha. `--line-primary-border` already has its dark value (`#35353d`) in the harvested variables.
- **Paste works from anywhere on the page,** not only from the focused textarea, unless focus is in another text field.

## Acceptance Criteria

- [x] **A drag carrying files shows the reference's overlay** (`.dropzone-overlay`, full-window, from the lifted CSS) over any part of the page where the composer is mounted: the home screen, a running or finished generation, and while the sidebar is open. It goes away on drop, when the drag leaves the window, or on Escape. A drag carrying no files (text, a link) shows no overlay and is left to the browser.
- [x] **A drop anywhere on those pages attaches the files** through the same path as `+`: the same validation, the same refusal messages, entering image mode, and "Match reference" as the ratio (STORY_017). The browser never opens the dropped file in place of the app.
- [x] **Paste of image files anywhere on the page attaches them,** unless focus is in a text field other than the prompt. Pasting plain text into the prompt is unchanged.
- [x] **Attaching by drop works while a generation runs,** as `+` does, and does not disturb the running job.
- [x] **The existing composer drop keeps working.** Its handler is replaced by the window-level one, not duplicated, so one drop attaches once.

## Technical Notes

- **A `useFileDrop(onFiles)` hook** in `app/lib/use-file-drop.ts`, used by `Composer`. It puts `dragenter`, `dragover`, `dragleave` and `drop` listeners on `window` for as long as the composer is mounted.
  - It acts only when `dataTransfer.types` includes `"Files"`.
  - A counter of enters minus leaves decides when the drag has left the window, because `dragleave` fires on every child element crossed.
  - On `dragover` and `drop` it calls `preventDefault`, which is what stops the browser opening the file.
  - It returns `dragging: boolean` for the overlay.
- **The overlay** is a small `DropOverlay` component in the reference's markup (`.dropzone-overlay > .dropzone-overlay-content > .dropzone-overlay-content-wrapper > .dropzone-overlay-inner`). Our dark wash goes in `clone.css`.
- **Paste:** a `paste` listener on `window` attaches `clipboardData.files` when the target is not an input or textarea other than the prompt. The textarea's own `onPaste` is removed, because the window listener covers it. That keeps one path, and one attach per paste.
- **StrictMode:** listeners are added on every effect setup and removed on every cleanup, and the counter lives in a ref reset on cleanup ([CLAUDE.md §6b](../../CLAUDE.md#6b-e2e-test-conventions)).

## Testing Plan

- **Unit** (`app/lib/use-file-drop.test.tsx`, new, jsdom, rendered inside `<StrictMode>`):
  - A `dragenter` with Files sets `dragging`, and a `dragenter` with only `text/plain` does not.
  - Two `dragenter`s and one `dragleave` (crossing a child element) keep it `true`, and a second `dragleave` clears it.
  - A `drop` with Files calls `onFiles` once with those files, clears `dragging`, and has `defaultPrevented` true. A `dragover` with Files has `defaultPrevented` true.
  - A drop with no files calls nothing and leaves the default alone. Escape clears `dragging`.
  - After unmount, a drop calls nothing (the listeners are gone), and StrictMode's double setup still gives one call per drop.
  - A `paste` with a file calls `onFiles` once. A `paste` whose target is another input does not. A `paste` with only text does not.
- **Integration:** N/A. There is no route or handler change: a dropped file goes through the same `attach` and submit path that `jobs.test.ts` already covers for `+` uploads.
- **E2E** (`app/e2e/references.spec.ts`, extended; desktop and narrow projects). Playwright can't drag from the OS, so the spec dispatches `dragenter`, `dragover` and `drop` with a `DataTransfer` built from the committed fixture `tools/stub-generation-server/fixtures/reference.png`, the way the probe did.
  1. **Drop on the page body** (not the composer), on the home screen: the overlay is visible during `dragover` and gone after `drop`. The composer is in image mode with one thumbnail, the ratio reads "Match reference", and the page URL is unchanged.
  2. **Submit** with stub script `done-after-1-poll`: register `waitForResponse` for the status `done` before clicking Send. The stub's `received` hook records one upload, and the result `<img>` loads.
  3. **Drop a `.txt` file:** the composer shows the same refusal as `+` gives for a wrong type, and no thumbnail appears.
  4. **Drag a text-only `DataTransfer`:** no overlay.
  5. **Paste the fixture** with focus on the page body: one thumbnail.

  The existing specs cover the unchanged halves and must stay green:
  - `references.spec.ts` (attach with `+`, remove, the ratio dropdown);
  - `generate.spec.ts` (the edit scenario and cancel);
  - `image-mode.spec.ts`;
  - `home.spec.ts` (the layout and the drawer).
- **Manual:** in Safari on the Mac at http://qwen.local, drag a photo from Finder onto the page heading and onto the result image. Check that the overlay shows, the thumbnail attaches, and the tab stays on the app.

## Estimated Complexity

S–M

## Done (2026-09-28)

- **Built:**
  - `app/lib/use-file-drop.ts`: window listeners, an enter/leave count, Escape, and paste outside other fields.
  - `app/components/composer/DropOverlay.tsx`: the reference's `.dropzone-overlay` markup, portalled to the body. The portal keeps `#dropzone-container`'s transform from trapping `position: fixed`, and the e2e measures the overlay at the full window.
  - The composer's own drop and paste handlers are removed, so there is one path.
  - The dark wash and the inner text are in `clone.css`.
- **Tests:**
  - Unit: `use-file-drop.test.tsx`, 12 cases inside `<StrictMode>`. The coverage floor first failed on this file (87.9% of branches); the added cases took the app to 97.73%, and no floor moved.
  - E2E: `references.spec.ts` gains 4 scenarios, run at both widths: a drop on the body, then submit and the stub receiving one upload; a `.txt` refused; a text drag with no overlay; a paste from the page. 59 e2e pass, and the gate is green.
- **Side by side:** the overlay was screenshotted on the deployed app at 1437 and at iPhone 13. It fills the window with the reference's 24 px dashed frame at 20 px inset (scaled by the mobile rem on the narrow branch), over the page blurred through `#171717b3`. The reference's own overlay was never captured, so there is nothing of theirs to compare against beyond the lifted rules.
- **Manual (owner):** a real drag from Finder in Safari at http://qwen.local. Playwright can only send synthetic drag events.
