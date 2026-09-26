# STORY_010 — The composer enters image mode and offers the model and the aspect ratio

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want the composer's **+** to offer "Create Image", and image mode to show the reference's blue pill with the model and aspect-ratio dropdowns, so that I choose options exactly where I would on chat.qwen.ai.

## Current state

After STORY_009 the composer renders in its resting state, and **+** does nothing. `/api/capabilities` answers the model list and the seven ratios with their sizes (STORY_007).

## UI Mockup

**Reference capture:**
- `states/mode-menu-open@1437.json`;
- `states/composer-image-mode@1437.json`;
- `states/image-model-open@1437.json`;
- `states/aspect-ratio-open@1437.json`;
- `states/composer-typed@1437.json`;
- `interactions.md` → "Entering image mode", "The options", "Typing a prompt".

**Measured values committed to:**

| Element | Values |
| --- | --- |
| Composer in image mode | 106 tall, two rows: textarea (734×32, 16px/26px, padding 3px 8px), then `.message-input-column-footer` (32 tall) |
| `+` | `.mode-select-open`, 32×32, `qwpcicon-addBold` |
| Image pill | `.mode-select-current-mode`, 142×32, accent `#426eff`, icon `qwpcicon-aiPicture`, close ×, label "Create Image" |
| Dropdown triggers | `.qwen-chat-v2-dropdown-menu-select`: the model (144×32) and the ratio (65×32) |
| Popups | `#2c2c2c`, border 0.8px `rgba(250,251,255,0.12)`, radius 12, padding 4, shadow `0 12px 24px -2px rgba(0,0,0,.05)`; items 36 tall, radius 8, padding `6px 12px`, 14px `#fafbff`; selected item `rgba(250,251,255,0.05)` with a 16px check |
| Ratio items | a rectangle glyph in each shape (`qwpcicon-a-<w>by<h>AspectRatio`), default 16:9 |
| Send | `button.send-button` 32×32, `#ffffff`, radius 50%, `qwpcicon-sendChat` in `#222222`; disabled at `rgba(250,251,255,0.24)` while empty |

**The + menu (ours):**

```
┌──────────────────────────────┐
│ ⤒ Upload attachment          │  (STORY_011; subtitle "image")
│   image                      │
│ ✦ Create Image               │
└──────────────────────────────┘
```

**Image mode, typed:**

```
┌───────────────────────────────────────────────────────────┐
│ a red bicycle leaning on a brick wall                     │
│ (+) (✦ Create Image ×) (Qwen-Image 2.1 ▾) (16:9 ▾)    (↑) │
└───────────────────────────────────────────────────────────┘
```

**Narrow:** one row. The pill is icon-only, and the model label is short ("Model 2.1"). Popups open above the composer.

## Departures from the reference

- **The + menu** offers only `Upload attachment` and `Create Image`. Create Video, Web search, Deep Research, Web Dev, Slides, More and Tools are outside the MVP.
- **The model dropdown** has one entry, `Qwen-Image 2.1` (the reference has 3.0 and 2.0, defaulting to 2.0). Only 2.1 runs on the Spark. The dropdown is kept, so the layout and interaction match.
- **Example prompt cards** (`Use Prompt`, `Explore more`) are not rendered. Their art is output generated on the reference, which never enters git, and Explore is a community feature. A backlog item records local sample prompts as a later option.
- **Voice and mic** are not rendered.
- **Leaving image mode** (× on the pill) returns to the resting composer. On ours, sending in the resting state also generates an image: the app has no chat, so the prompt always makes an image.

## Acceptance Criteria

- [x] **+** opens the menu with the two items. `Create Image` enters image mode, and Escape or an outside click closes the menu.
- [x] Image mode shows the pill, the model dropdown and the ratio dropdown with the measured values above. × leaves image mode.
- [x] The model dropdown lists the models from `/api/capabilities`, with the first selected. The ratio dropdown lists the seven ratios in the reference's order with their glyphs, and the default comes from `defaultRatio` (16:9). Choosing an item closes the popup and updates the trigger.
- [x] Typing shows the enabled Send. Empty or whitespace-only text shows it disabled. Enter sends and Shift+Enter makes a new line. Send is wired to a `submit` callback, and STORY_012 creates the job.
- [x] The dropdowns work by keyboard: Enter or Space opens, the arrow keys move, Enter picks, Escape closes. Focus returns to the trigger.
- [x] The options chosen persist within the session (a reload keeps image mode and the ratio through `sessionStorage`).

## Technical Notes

- A `useComposer` reducer holds the mode, model, ratio, text and references (STORY_011). It is unit-tested as a pure reducer.
- If `/api/capabilities` is unavailable (503), image mode still opens with the contract's seven ratios and model `qwen-image-2.1` from a static default. Submitting then shows the server's 503 message (STORY_012).

## Testing Plan

- **Unit:**
  - `app/lib/composer-state.test.ts`: enter and leave image mode; choosing a model or ratio; text trimming and the send-enabled rule; defaults from capabilities, and the static fallback; the sessionStorage round-trip, where a corrupt value falls back to the defaults.
  - `app/components/Dropdown.test.tsx`: opens on click and on Enter; the arrow keys move the active item; Enter picks; Escape closes and focus returns to the trigger; the selected item has the check.
- **Integration:** N/A. The capabilities route is covered by STORY_007.
- **E2E:** `app/e2e/image-mode.spec.ts`, at both widths.
  1. Open `/`, click **+**, and expect the menu with "Create Image". Click it and expect the pill "Create Image" (desktop) or its icon (narrow), with the ratio trigger reading "16:9".
  2. Open the ratio dropdown, expect 7 items in the reference's order, pick "1:1", and expect the trigger to read "1:1".
  3. Type a prompt and expect Send enabled. Clear it and expect Send disabled.
  4. Measure the desktop composer at 106 tall and 760 wide, and the pill's background, which contains the accent `rgb(66, 110, 255)`.

  `home.spec.ts` stays green.

## Estimated Complexity

M

## Done (2026-09-26)

**Side by side** (ours measured in the gate image after settling; reference values from the readings):

| Element | Reference | Ours | Delta |
| --- | --- | --- | --- |
| Composer in image mode | 760×106 | 760×106 | none |
| Textarea | 734×32 | 734×32 | none |
| Footer | y 521, 734×32 | y 522, 734×32 | +1 |
| Pill | 142×32, `#426eff` on the accent tint | 151×32, `rgb(66,110,255)` | +9 wide: the font (see below) |
| Model / ratio triggers | 144 / 65 wide | 166 / 81 wide | the font |
| Ratio popup | 126×286, items 36, r12, `#2c2c2c` | 126×286, items 36, r12, `#2c2c2c` | none |
| Send | 32, `#ffffff`, r 50%, `#222222` arrow | same | none |

Every width delta is text: the gate image has no Inter or SF, so the system stack renders in DejaVu, about 17% wider than the reference's text (the STORY_009 heading shows the same ratio). The owner's Mac resolves the stack as the reference did.

**Corrections found while building:**
- **Popups render in a layer on `<body>`** (`components/Popup.tsx`), as the reference's do. Rendered inside the composer, they were clipped by its `overflow: hidden`, and at phone width they sat under `main`.
- **At phone width the composer keeps two rows** (the textarea, then the footer). The capture notes say it "collapses to one row", but that state was not captured (`coverage.md`). One row at 357 wide would leave the textarea about 40px next to the four controls. Ours matches the notes' other points: the icon-only pill, "Model 2.1", and popups that open above.
- Testing Library's cleanup now runs after every unit test (`vitest.setup.ts`). Without Vitest globals it never had, and the second render of a component test saw the first one's elements.

**Tests:** unit tests for `composer-state` (reducer, capabilities parsing, the session round-trip), `Dropdown` (mouse, keyboard, closing) and `Popup`. E2E: `image-mode.spec.ts`, 6 cases across the two projects. Gate green.
