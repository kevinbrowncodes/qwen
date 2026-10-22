# STORY_040 — The chat grows with the window, and its text stays readable

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-10-21)
**Status:** Done 2026-10-22 (approved by the owner 2026-10-22 through a picker); deployed to qwen.local the same day
**Created:** 2026-10-21
**Relates to:** PATHS STORY_098 (the same rule for every PATHS app), [STORY_038](STORY_038_a_clicked_image_opens_in_a_viewer_over_the_page.md) (the viewer, for the full size)

As the owner on a Studio Display, I want the chat to use the window it is given, with images
as large as the column allows and the text at a comfortable width, so that a wide window is not
mostly empty.

## Current state

From the owner's screenshot, 2026-10-21, a window about 2670 pt wide. **Inferred from the
picture, not measured**: the content area beside the sidebar is about 2360 pt; the chat column
is about 740 pt, centred; a 16:9 result shows at about 400 pt wide; the prompt bubbles end at
the column's right edge. Roughly two thirds of the content area is empty.

The column's width comes from the reference's own stylesheet (`app/public/reference/reference.css`),
lifted from chat.qwen.ai; `app/app/clone.css` adds no cap on it. The result is an
`image-tool-container` (`display: inline-block`) around the `<img>`
(`app/components/generation/GenerationView.tsx`), sized by the reference's rules.

Before building, measure in the running app, at the owner's window size and at 1440 pt: the
chat column's width and its rule, the result image's rendered and natural size, the bubbles'
width. A Hands look on the Mac Studio 2022 (1920 pt display) cannot give the owner's numbers,
so the measurement is in his browser or at a window sized to them; the values go under Notes.

## UI Mockup

**The reference capture:** chat.qwen.ai's chat column at 1437 px (`docs/recon/2026-09-26/`),
which this story leaves for wider windows. At and below the captured width nothing changes.

The owner's window, after:

```
+--------+---------------------------------------------------------------------------------+
| Qwen   |                                  create an image of a handsome middle … ( bubble) |
|        |   +-------------------------------------------------------------------------+   |
| New    |   |                                                                         |   |
| Library|   |              the 16:9 result, as wide as the column                     |   |
| History|   |                                                                         |   |
|        |   +-------------------------------------------------------------------------+   |
|        |   ⓘ ↻ 🗑                                                                        |
|        |               [ composer, centred, at most the column's width ]                 |
+--------+---------------------------------------------------------------------------------+
  the column grows with the window to a cap (about 1400 pt), centred in the content area;
  bubbles and any text inside stay at a readable width, aligned as today
```

Narrow (iPhone 13): unchanged.

## Departures from the reference

- chat.qwen.ai keeps its chat column narrow at any width. Ours grows past the captured 1437 px,
  because the owner works on a Studio Display (2026-10-21). At or below 1437 px it matches the
  reference.

## Acceptance Criteria

- [x] At or below the captured width (1437 px), the chat column, the images and the composer
      measure as today; the existing fidelity specs stay green.
- [x] Wider, the chat column grows with the content area to a cap of about 1400 pt (settled by
      the measurement above), centred in the content area, with at least 40 pt either side.
- [x] A result image is as wide as the column allows at its own aspect, never cropped and never
      shown larger than its natural size; a tall image is held to the window's height less the
      composer, so a whole image fits on screen.
- [x] Text keeps a readable width: a prompt bubble, a notice, the info panel and any reply text
      are never wider than about 72 characters of their type, however wide the column.
- [x] The composer grows with the column up to its own cap, so it stays under the conversation.
- [x] My Library's grid gains columns on a wider window rather than larger cards.

## Technical Notes

- The cap and the readable width are CSS custom properties in `app/app/clone.css`, applied with
  a media query above 1437 px, so the reference's own rules stay untouched below it.
- No component change is expected beyond a class on the column if the reference's rule cannot
  be overridden by width alone; the measurement decides.

## Testing Plan

Static: `pnpm lint` and `pnpm typecheck`.

Unit: does not apply; CSS only, no logic.

Integration: does not apply; no route or data changes.

E2E (`app/e2e/wide.spec.ts`, new; the stub's `done-after-1-poll` script): generate one 16:9
image, then:
1. At 1437 × 900: the column, the result and the composer measure as the existing fidelity spec
   reads them.
2. At 2560 × 1440: the column is wider than at 1437 and at most the cap, centred with at least
   40 px either side; the result is the column's width (the stub's fixture is small, so the
   spec sets a large natural size through the stub's result dimensions, or asserts the
   natural-size limit instead); every bubble is at most the readable width.
3. At 2560 × 1440 with a portrait image: the image's height is at most the window's height less
   the composer.
4. Narrow (`devices["iPhone 13"]`): unchanged from today.

Regression cover that must stay green: `generate.spec.ts`, `chat.spec.ts`, `home.spec.ts` and
the fidelity checks at 1437 px.

## Estimated Complexity

Small: a media query and two custom properties, once the measurement settles the cap.

## Notes

- PATHS STORY_098 puts the same rule into every PATHS app (more content and larger media on a
  wide window, text at a readable width). When Qwen becomes a PATHS app (BACKLOG_004) that story
  covers it.
- **Measured 2026-10-22, before building** (the "Current state" figures above were inferred from the owner's screenshot). This is a Playwright run of the production build against the stub, at the owner's window of 2670 x 1500 and at 1437 x 900, with the sidebar open. The values are CSS px, which are the owner's pt.

  | | 2670 x 1500 | 1437 x 900 |
  |---|---|---|
  | Content area beside the sidebar | 2424 (x 240) | 1191 (x 240) |
  | Chat column | 800 with 32 px padding each side, so 736 of content, centred | the same |
  | Its rule | the reference's `.qwen-chat-message { max-width: 800px; padding: 0 32px }` (`reference.css`) | the same |
  | Result, 16:9 | 400 x 225 (`.clone-result { width: 400px }`; the stub's 64 x 36 image upscaled) | the same |
  | Prompt bubble, long prompt | 515 (its `max-width: 70%` of 736) | the same |
  | Composer | 760 (`.message-input-wrapper { max-width: 760px }`) | the same |

  So at 2670 the column took 800 of 2424 px, and about two thirds of the content area was empty, as the story inferred.
- **The cap, settled from that:** 1400 px of content (1464 with the padding). The column's outer width is `max(800px, min(1464px, 100vw - 637px))`, above 1437 px only, so it is 800 at exactly 1437 and grows a pixel per pixel of window, with no jump. It reaches the cap at a 2101 px window. At the owner's 2670 the column is 1400 of content with 480 px either side. Beside the open sidebar the gutter is never under 195 px. The readable width is `72ch` (726 px for the bubble's 16 px type). The composer grows to `min(1000px, the column less 40)`: 760 at 1437 and 1000 at 2670.
- **After building, at 2670 x 1500:** the column is 1464 at x 720, centred. A 1376 x 768 image shows at 1376 x 768 (its natural size, under the column's 1400). A 768 x 1376 portrait shows at 714 x 1280, held to the window less 220 px. The stub's 64 x 36 shows at 64 x 36. The long bubble is 726 wide and the composer 1000. At 1800 x 1100 the column is 1163 and the image 1099, the column's content. At 1437 x 900 the column is 800, the image 400, the composer 760 and the bubble 515, as before.

## Done note (2026-10-22)

- **Built:** one block at the end of `app/app/clone.css`: `--chat-cap` (1400px), `--read-width` (72ch), `--composer-cap` (1000px) and `--chat-outer` on `:root`, applied under `@media (min-width: 1438px)` and `html:not(.mobile)`. No component changed. The reference's own rules were enough to override by width, so `reference.css` is untouched.
- **What the readable width covers:** the prompt bubble (`min(70%, 72ch)`), the failed or stopped notice, and the Info panel (`min(100%, 72ch)`). The notice and the panel were 400 wide and now grow to 72ch on a wide window. There is no reply text in this app. The e2e measures the bubble; the notice and the panel follow the same rule and are not measured separately.
- **The size limit for the result is literal:** a result is never drawn past its natural size on a wide window. Every image the model makes is at least 768 px on its short side, so none shows smaller than the 400 of a narrow window. Only the stub's 64 x 36 fixture does: 64 x 36 at 2560, where it is upscaled to 400 at 1437 as before.
- **How the e2e gets a large image:** the stub's result is always 64 x 36. `e2e/wide.spec.ts` routes the result request to a PNG drawn in the page with a canvas, 2000 x 1125 or 1125 x 2000. That is our own picture of a known size, not a model output (CLAUDE.md §6 rule 10). The story's plan allowed that, or the natural-size limit; the spec asserts both.
- **Tests:** `e2e/wide.spec.ts` has 6 cases. At 1437 x 900: column 800, result 400, composer 760, bubble within 70% of 736. At 2560 x 1440: the column wider than 800, at most the cap, centred with at least 40 px each side; a 2000 px image as wide as the column's content at its aspect; the bubble within 72ch; the composer wider than 760 and inside the column; the fixture at its natural width; a portrait image no taller than the window less the composer and the visible chat; five My Library cards in more than three columns, none wider than 276. On iPhone 13: the result 300 and the bubble within 70%. Unit and integration do not apply (CSS only), as the plan says. The fidelity specs at 1437 (`home.spec.ts`, `image-mode.spec.ts`) and `generate.spec.ts` and `chat.spec.ts` stayed green.
- **Gate:** green through the pre-push hook on the Mac Studio 2022 for `6edf03a` (235 s): unit 284 in the app, 129 model server, 152 recon, 72 stub; integration 39; e2e 122 passed, 22 skipped. The push also carried STORY_039's Done note.
- **Deployed:** `tools/deploy/app.sh` put `6edf03a` on the Mac Studio 2022. `http://qwen.local/api/health` answered ok, and its stylesheet carries `--chat-cap:1400px`. The owner has not yet looked at it on his own Studio Display; that look is a review, not a criterion.
