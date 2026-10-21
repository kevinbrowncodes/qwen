# STORY_038 — A clicked image opens in a viewer over the page

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-10-21)
**Status:** Drafted 2026-10-21 for the owner's approval; not to be built until he approves
**Created:** 2026-10-21
**Relates to:** [STORY_011](STORY_011_reference_images_can_be_attached_for_an_edit.md) (reference images), [STORY_018](STORY_018_an_image_dropped_anywhere_on_the_page_is_attached_for_an_edit.md)

As the owner, I want a click on an image in a chat to open it large in a viewer over the page,
with its name, Download and Close, and to step through the chat's other images from there, so
that I can look at a result properly without downloading it, the way Google AI Studio does.

## Current state

Read on 2026-10-21 in `app/components/generation/GenerationView.tsx`:

- A result is an `<img data-testid="result-image">` inside `image-tool-container`. Hovering it
  on desktop shows Download (top right) and Edit (bottom centre); a click on the image itself
  does nothing. On narrow screens the same actions sit in the footer row.
- A turn's reference images are `ReferenceTile`s (`user-image-item clone-user-image`), plain
  `<img>`s from object URLs; a click does nothing. The composer's thumbnails
  (`app/components/composer/ReferenceThumbs.tsx`) carry a remove button and nothing else.
- In My Library (`app/components/library/Library.tsx`) a card is a link that opens the image's
  turn; that stays (the owner, 2026-10-21).

The recon of chat.qwen.ai (2026-09-26) did not capture a viewer: `coverage.md` lists the
result's download on touch as "probably under More actions or a full-screen preview
(unconfirmed)".

## UI Mockup

**The reference capture:** none from chat.qwen.ai. The design reference is the owner's
screenshot of Google AI Studio's image popup, 2026-10-21 (in this conversation; a dated copy
goes to `docs/recon/2026-10-21/ai-studio-image-viewer.png` when the story is built). Read from
the screenshot, so **inferred, not measured**: a dark sheet about 1340 px wide on a 1680 px
window, centred, radius about 12 px; a header row with the file name at the left (about 15 px,
regular) and Download and Close icon buttons at the right; the image below at its own aspect,
as large as the sheet allows; the page behind blurred and dimmed. Before building, read the
popup's DOM and computed styles in a real browser (Hands in Safari, or Claude in Chrome) and
record them beside the screenshot, so the values this story commits to are facts.

Desktop, a result opened, a chat with three images:

```
┌──────────────────────── page, blurred and dimmed ─────────────────────────┐
│                                                                           │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │ result-2026-10-21-1342.png                         ⤓     ✕      │   │
│   │                                                                   │   │
│ ‹ │                    [ the image, fitted, own aspect ]              │ › │
│   │                                                                   │   │
│   │                               2 of 3                              │   │
│   └───────────────────────────────────────────────────────────────────┘   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
  ‹ › at the sheet's edges step to the previous and next image of the chat;
  hidden when there is none that way.
```

A reference image opened: the same sheet, its name is the attached file's, and Download saves
that file.

Narrow (iPhone 13), full screen:

```
┌───────────────────────────┐
│ ✕   reference.jpg      ⤓ │  44 px touch targets
│                           │
│   [ the image, fitted ]   │  swipe left and right steps
│                           │
│          1 of 3           │
└───────────────────────────┘
```

## Departures from the reference

- chat.qwen.ai's own viewer, if it has one, was never captured; this story follows the owner's
  pick, AI Studio's popup, and adds stepping through the chat's images (the owner, 2026-10-21).
  If a later recon finds chat.qwen.ai's viewer, a story decides whether to lift it.
- Stepping is ours: AI Studio's popup shows one image.

## Acceptance Criteria

- [ ] A click (or Return on a focused image) on a result image in a turn, or on a reference
      image shown in a turn, opens the viewer over the page with that image. The composer's
      thumbnails open it too, without removing the attachment. My Library's cards keep opening
      the image's turn.
- [ ] The viewer shows the image's name, a Download that saves the original (a result through
      `?download=1`, as the hover Download does; a reference, the attached file), and a Close;
      the page behind is blurred and dimmed and does not scroll.
- [ ] The image fits the sheet at its own aspect, never cropped and never upscaled past its own
      size.
- [ ] Left and Right, or the buttons at the sheet's edges, step through the chat's images in
      the order they appear, results and references together; a button with nothing that way
      is not drawn. The sheet says "2 of 3". On narrow screens a swipe steps.
- [ ] Esc, Close, or a click on the dimmed page closes it, and focus returns to the image that
      opened it. While it is open, Tab stays inside it. A screen reader hears a dialog named
      after the image.
- [ ] Narrow (iPhone 13 descriptor, touch): the viewer is full screen, Close and Download have
      44 px touch areas, and opening the viewer does not trigger the hover actions.
- [ ] A running job's skeleton and a failed or moderated turn open nothing: only a finished
      image does.

## Technical Notes

- One `ImageViewer` component in `app/components/`, opened from `GenerationView` (results and
  turn references) and `ReferenceThumbs`, taking the chat's list of images and the index; a
  native `<dialog>` with `showModal()` gives the focus trap, Esc and the backdrop.
- The list of a chat's images comes from the turns already rendered: no new route and no new
  request; a result's URL is the one the `<img>` uses.
- The hover Download and Edit on a result stay; a click on the image itself opens the viewer,
  a click on those controls does what it does today.

## Testing Plan

Static: `pnpm lint` and `pnpm typecheck`, as the gate runs them.

Unit (`app/components/ImageViewer.test.tsx`, new): given three images and index 1, it renders
the second with "2 of 3"; Right moves to the third and hides the next button there; Left from
the first hides the previous button; Esc calls close; the Download link of a result ends in
`?download=1`.

Integration: none in the vitest integration suite. The viewer makes no request and has no
route; the component test above and the e2e below prove it.

E2E (`app/e2e/viewer.spec.ts`, new; the stub's `done-after-1-poll` script):
1. Generate one image with a reference attached. Click the result image: the dialog opens named
   after it, the page behind has the blur, and "2 of 2" shows, since the reference is image 1.
2. Press Left: the reference shows, "1 of 2", and no previous button. Press Esc: the dialog
   closes and focus is on the result image.
3. Click the composer's thumbnail after attaching an image: the viewer opens and the attachment
   is still there after Close.
4. Click a finished image's hover Download: it downloads and no viewer opens.
5. Narrow (`devices["iPhone 13"]`): tap the result; the dialog fills the viewport and Close's
   box is at least 44 px.
6. Open My Library and click a card: the turn opens, not the viewer.

Regression cover that must stay green: `generate.spec.ts` (result rendered, download),
`references.spec.ts` (attach, remove, drop), `chat.spec.ts` (turns and My Library).

## Estimated Complexity

Small to medium: one component, two call sites, no server change.
