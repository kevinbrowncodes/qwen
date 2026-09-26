# STORY_009 — The home screen is laid out like the reference, from the reference's own stylesheets and icons

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want the app's home to look like chat.qwen.ai's: a dark sidebar, a top bar, "How can I help you?" and the composer in the middle. At phone width I want the sidebar as a drawer. So the clone starts from the reference's own lifted CSS and icons, and every later story fills in behaviour on a screen that already matches.

## Current state

The app shows a STORY_005 placeholder, and nothing from the reference is loaded. The harvested stylesheets (9 CDN files plus 23 inline) and 1,113 sprite icons are in `docs/recon/2026-09-26/assets/` (STORY_003). The snapshot `snapshots/home-signed-in@1437.html` renders the reference home from them, which was checked in STORY_003's Done note.

## UI Mockup

**Reference capture:**
- `docs/recon/2026-09-26/snapshots/home-signed-in@1437.html` (desktop markup);
- `states/home-signed-in@1437.json` and `states/home-signed-in@393.json` (readings);
- `tokens.md`.

**Measured values committed to:**

| Element | Values |
| --- | --- |
| Page | `#171717` background (`--dark-bg`), text `#fafbff`, system-ui stack with Inter and NotoSansHans |
| Sidebar | 240 wide (`.sidebar-side`), toggle 36×36 (`#sidebar-toggle-button`), entry rows 215×36 |
| Top bar | `header.header-desktop` 48 tall |
| Heading | "How can I help you?" (`.placeholder-logo-text`), 24px/40px weight 400, 206×40 |
| Composer | `.message-input-container` 760×58, radius 28, padding 12, `#2c2c2c`, border 0.8px `rgba(250,251,255,0.2)`, shadow `0 8px 16px -4px rgba(0,0,0,.05)` |
| At 393 | sidebar is a fixed drawer 335 wide over a `rgba(0,0,0,0.1)` backdrop, opened by ☰ (`appicon-menu`) in a 58 tall header; no heading; the composer is pinned to the bottom, 359 wide with radius 24 |

**What we render (desktop):**

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ [logo] [⇤] │ Qwen-Image 2.1                                           │
│ ✎ New image│                                                          │
│ ▦ My Library│                                                         │
│            │                   How can I help you?                    │
│ All images │        ┌────────────────────────────────────────┐        │
│  (STORY_013)│       │ +  Ask Qwen                            │        │
│            │        └────────────────────────────────────────┘        │
│            │                                                          │
└────────────┴──────────────────────────────────────────────────────────┘
```

**Narrow (iPhone 13):**

```
┌───────────────────────────┐
│ ☰   Qwen-Image 2.1        │  58 tall
│                           │
│        (blank)            │
│                           │
│ ┌───────────────────────┐ │
│ │ +  Ask Qwen           │ │  pinned, 17px margins
│ └───────────────────────┘ │
└───────────────────────────┘
```

## Departures from the reference

- **The sidebar keeps only MVP entries:** New image (the reference's New Chat), My Library, and the list of generations (STORY_013). Search, Community, Coder, Projects, the user button and Upgrade are not rendered. They are chat, community or account features outside the MVP.
- **The top bar's model picker** lists chat models on the reference. Ours shows the image model name, not interactive, because the MVP has no chat models. The temporary-chat button is not rendered.
- **The logo** waits for the owner's `Qwen_files/` (STORY_003). Until then the header shows the text "Qwen Local" in its place. Brand marks are the reference's, and the repo stays private ([CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded)).
- **Voice input and voice mode buttons** are not rendered (voice is out of the MVP).

## Acceptance Criteria

- [x] `recon/src/reference-sync.ts` (see Corrections) copies the harvested stylesheets into `app/public/reference/css/` and builds `app/public/reference/sprite.svg` from the harvested icons. It is run by `pnpm reference:sync` and checked into git. A unit test fails if the copies are out of date with `docs/recon/`.
- [x] The root layout links the reference stylesheets in the order the reference page loads them, and sets `<html class="dark">`. An `Icon` component renders `<svg><use href="/reference/sprite.svg#<id>"></use></svg>` inside `span.anticon`.
- [x] The home renders the snapshot's structure, using the reference's class names for these elements:
  - `desktop-layout`, `sidebar-wrapper`, `sidebar-side`;
  - `header-desktop`, `placeholder-logo-text`;
  - `message-input-wrapper`, `message-input-container`, `message-input-container-area`, `mode-select`, `message-input-textarea`.

  Measured: at 1437×1031 the composer is 760 wide, radius 28, background `#2c2c2c`, and the heading reads "How can I help you?" at 24px.
- [x] At narrow width, `☰` opens the drawer and the backdrop closes it. The composer is at the bottom of the viewport. Touch targets on the narrow branch are at least 44px ([CLAUDE.md → §6 rule 9](../../CLAUDE.md#6-key-rules)).
- [x] The placeholder page and its e2e assertion are replaced. STORY_008's API smoke stays green.

## Corrections during implementation (2026-09-26)

- **The sync lives in `recon/src/reference-sync.ts`, not in a new `tools/reference-assets/` package.** recon already carries the HTML parser the sync needs, and its tests run in the gate. It writes one concatenated `reference.css` (every stylesheet verbatim, in the page's own order, each under a header naming its file) rather than one copy per file. The AC's intent, a byte-identical copy checked by a test, is unchanged.
- **The reference's phone layout sizes itself in rem, from a root font size set by JavaScript: `width / 375 × 16px`** (16.768px at 393, exactly the capture's value). Ours sets the same in the boot script, and that is what makes the drawer come out 20rem = 335px at 393.
- **`public/` must be copied into the standalone server** (the Playwright config and `app/Dockerfile`), or the lifted stylesheet 404s and the page renders unstyled.

## Technical Notes

- The reference's rem scale: its `html` gets an inline `font-size` from JavaScript (13.3973px at 1437). Its CSS sizes the layout mostly in px, and the readings are in px. Our root sets `font-size` from the same breakpoints only if a measured element proves it matters. The e2e measures the composer and the heading in px.
- The sidebar collapse on desktop (the toggle) is kept as client state and not persisted.

## Testing Plan

- **Unit:** `tools/reference-assets/sync.test.ts`:
  - the sprite holds exactly the harvested ids, with each symbol's `viewBox`;
  - the copied CSS is byte-identical to `docs/recon/2026-09-26/assets/css/`;
  - the load order matches `manifest`/`loaded_stylesheets`.

  `app/components/Icon.test.tsx`: it renders a `use` pointing at the sprite id, inside `span.anticon`, and adds nothing interactive.
- **Integration:** N/A. There is no route or handler change.
- **E2E:** `app/e2e/home.spec.ts`.
  - **desktop:** open `/`; expect the heading "How can I help you?" and the textarea with placeholder "Ask Qwen". Measure the composer: 760 wide, `border-radius` 28px, `background-color` `rgb(44, 44, 44)`. Measure the sidebar at 240 wide. Take the measurements after `document.fonts.ready` and a stable-box check.
  - **narrow:** the sidebar is not in the viewport; tap ☰ and the drawer is in the viewport at 335 wide; tap the backdrop and it leaves; the composer's bottom is within 40px of the viewport's bottom.
  - `smoke.spec.ts`'s API tests stay green, and its placeholder test is replaced by the heading check.
- **Manual:** side by side with the STORY_003 render of the snapshot at 1437. The deltas go in the Done note.

## Estimated Complexity

M

## Done (2026-09-26)

**Side by side with the capture.** Ours was measured in headless Chromium in the gate image, after settling; the reference values are from the readings.

| Element | Reference | Ours | Delta |
| --- | --- | --- | --- |
| Composer (1437) | 455,461 760×58, r28, `#2c2c2c` | 456,461 760×58, r28, `#2c2c2c` | x +1 |
| Heading (1437) | 732,381 206×40, 24px | 715,381 242×40, 24px | width: the font. The gate image has no Inter or SF, so the system stack falls back (DejaVu); on the owner's Mac the stack resolves as it did on the reference |
| Top bar (1437) | 240,6 1191×48 | 240,6 1191×48 | none |
| Sidebar (1437) | 240 wide | 240 wide | none |
| Header (393 vs our 390) | 58 tall | 57 tall | −1 |
| Drawer open | 335 at 393 | 333 at 390 (= 20rem at this width) | scale-exact |
| Composer (phone) | x 17, 359 wide, 16 from the bottom | x 17, 357 wide, 17 from the bottom | the width follows the viewport; bottom +1 |

**`clone.css` (ours):** the logo-text stand-in; a button reset; link colour for the two sidebar links; and at phone width:
- a full-bleed page with no rounded panel;
- the heading hidden;
- the composer pinned (overriding the reference's identity `transform` on `#dropzone-container`, which would otherwise contain it);
- the drawer frame, the backdrop and a 44px menu target;
- the header colours.

The reference's `.sidebar-wrapper .mask { display: none }` hid a backdrop that carried its class, so ours uses only `clone-drawer-mask`.

**Tests:**
- unit: `Icon` and `narrow`, plus `useNarrow` under StrictMode with a fake `matchMedia` and on the server;
- recon: the `reference-sync` suite, which checks the order, the sprite's 1,113 symbols and that the committed copies are current;
- e2e: `home.spec.ts`, 3 cases across the two projects, including a check that nothing is fetched from the reference's hosts.

The coverage floor dropped when `use-narrow.ts` first landed untested; the test above closed it, and no floor was lowered. Gate green, including the image build.
