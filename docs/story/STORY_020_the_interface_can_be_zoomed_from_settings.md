# STORY_020 — The interface can be zoomed from Settings

**Epic:** none. It is a follow-up the owner asked for on 2026-09-29, after the MVP epics (EPIC_001–004) were Done.
**Status:** Done (2026-09-29)
**Created:** 2026-09-29

As the owner, I want to make the whole interface bigger from a setting, so that it reads comfortably on my Apple Studio Display, where everything looks a little small.

## Current state

Read and measured on 2026-09-29:

- **The app has no settings of any kind.** The recon capture of chat.qwen.ai never recorded a settings screen, so there is nothing of theirs to copy.
- **The owner's Safari window is about 2670 CSS px wide** (their screenshot is 5344 device px on a 2× display).
- **CSS `zoom` on the root, in both Chromium and WebKit** (probe at 1600×1000, zoom 2):
  - elements render and measure (`getBoundingClientRect`) at 2× their CSS values;
  - `innerWidth` and media queries are unchanged;
  - `documentElement.clientWidth` gives the effective width, 800.
- **So three parts break under zoom as the code stands:**
  - **The page overflows.** `div.app` and `div.desktop-layout` are `100vh` tall (`height` and `min-height`), and everything below inherits it. At 1.5×, the page is 1500 px tall in a 1000 px window.
  - **Popups are misplaced.** `Popup` and `Dropdown` place them from measured boxes, so the offsets come out multiplied by the zoom.
  - **The phone layout switches at the real width.** `html.mobile` follows `matchMedia("(max-width: 768px)")` in `lib/narrow.ts` and `lib/use-narrow.ts`, which ignores zoom.

## UI Mockup

**The reference capture:** none; this surface is ours (see Departures). It is built from the reference's own sidebar entry and dialog classes where they exist in the lifted CSS.

**The sidebar**, with a new entry at the bottom:

```
┌──────────────────────┐
│ Qwen             [◧] │
│ ✎ New image          │
│ ▦ My Library       › │
│ …history…            │
│                      │
│ ⚙ Settings           │   ← pinned to the sidebar's bottom
└──────────────────────┘
```

**The collapsed rail** shows ⚙ at its bottom.

**The dialog**, centred over a dimmed page:

```
┌──────────────────────────────────────────────┐
│ Settings                                  ✕  │
│                                              │
│ Zoom                                         │
│ Makes the whole interface bigger on this     │
│ browser.                                     │
│ ┌────┬──────┬─────┬────┬────┬────┐           │
│ │ 1× │1.25× │1.5× │ 2× │ 3× │ 4× │           │
│ └────┴──────┴─────┴────┴────┴────┘           │
└──────────────────────────────────────────────┘
```

- **The segmented control** is a radiogroup. The chosen step is filled with the Create Image blue (`rgb(66, 110, 255)`). Choosing a step applies at once; there is no Save.
- **Closing:** Esc, ✕, or a click outside closes it, and focus returns to ⚙.
- **Narrow:** the dialog is full-width, with a 16 px gutter. The steps wrap onto two rows if they don't fit, and each is at least 44 px tall.

## Departures from the reference

- **The Settings entry and the dialog are ours.** The owner asked for them on 2026-09-29, and the reference exposes no zoom.
- **The step list** is 1×, 1.25×, 1.5×, 2×, 3×, 4×. The owner asked for 1–4×; the fine steps were added for "a tad small".

## Acceptance Criteria

- [x] **The Settings entry opens the dialog.** It's a ⚙ Settings item pinned to the bottom of the sidebar, also on the collapsed rail and in the phone drawer.
- [x] **Choosing a step zooms the whole interface at once:** the page, the sidebar, the composer, popups and dialogs.
  - It is remembered in this browser (`localStorage`, `qwen.zoom.v1`) and applied before first paint on every load, with no flash at 1×.
  - A stored value that isn't a step reads as 1×.
- [x] **At any step the page fits the window.** There is no overflow caused by the zoom: the document is no taller than the window, and the composer stays inside it.
- [x] **Popups still open at their trigger,** and inside the window, at any step. That covers the dropdowns, the `+` menu and the add-on popup.
- [x] **The phone layout follows the effective width,** the window width divided by the zoom. At 4× in a 2670 px window, the app uses the phone layout. Returning to 1× restores the desktop layout without a reload.
- [x] **Storage failures are harmless.** Where storage throws (private mode), the setting still applies for the session, and the app never breaks.

## Technical Notes

- **`lib/ui-zoom.ts`** holds `ZOOM_STEPS`, `ZOOM_KEY`, `parseZoom(raw)`, `zoomLabel` and `applyZoom(root, z)`.
  - `applyZoom` sets `style.zoom`, the `--ui-zoom` custom property and `data-zoom`, and clears all three at 1×.
  - `readZoom()` and `writeZoom()` wrap storage in try/catch. `writeZoom()` dispatches a `qwen:zoom` event.
- **`lib/narrow.ts`:**
  - `BOOT_SCRIPT` also reads `qwen.zoom.v1`, applies it, and decides `mobile` from `innerWidth / zoom <= 768`.
  - `isNarrow(width, zoom)` is pure.
  - The phone rem size uses the effective width.
- **`lib/use-narrow.ts`** subscribes to `resize` and `qwen:zoom` instead of `matchMedia`, and computes from the effective width.
- **`clone.css`:** under `html[data-zoom]`, `.app` and `.desktop-layout` get `height` and `min-height` of `calc(100vh / var(--ui-zoom))`. The same goes for the one `20vh` in `clone.css`.
- **`Popup` and `Dropdown`:** measured boxes are divided by the current zoom, read from `--ui-zoom` through `currentZoom()` in `ui-zoom.ts`, before they become `left` and `top`. `placementFor` and `clampLeft` get the window size divided the same way.
- **`components/settings/SettingsDialog.tsx`:** a `role="dialog"` with `aria-modal`, portalled to the body, and a radiogroup of steps with arrow-key movement. `Sidebar` gains the entry, and `Shell` owns the open state.

## Testing Plan

- **Unit:**
  - `lib/ui-zoom.test.ts`:
    - `parseZoom` accepts each step and rejects `"5"`, `"abc"` and `null`, which fall back to 1;
    - `applyZoom` sets and clears `zoom`, `--ui-zoom` and `data-zoom`;
    - `readZoom` and `writeZoom` survive a throwing storage;
    - `writeZoom` dispatches `qwen:zoom`.
  - `lib/narrow.test.ts`:
    - `isNarrow(2670, 4)` is true and `isNarrow(2670, 3)` is false;
    - `BOOT_SCRIPT` run against a fake window applies a stored zoom and the `mobile` class.
  - `lib/use-narrow.test.tsx`: rewritten for the resize and zoom-event source (it faked `matchMedia`, which the hook no longer uses). It renders inside `<StrictMode>`, and a `qwen:zoom` event flips the result.
  - `components/Popup.test.tsx`: `anchorFor` with a zoom divides the box.
  - `components/settings/SettingsDialog.test.tsx`:
    - it renders the six steps with the current one checked;
    - clicking and arrow keys choose a step and call `writeZoom`;
    - Esc closes.
- **Integration:** N/A. There is no route or server change; the setting lives in the browser.
- **E2E:** `app/e2e/settings.spec.ts`, new, at desktop and narrow.
  1. Open Settings from the sidebar (from the drawer on narrow), choose 1.5×, and `html` has `zoom` 1.5.
  2. The document's `scrollHeight` is no greater than the window's height, and the composer's box ends inside the window.
  3. The ratio dropdown's popup lies inside the window and within 8 px of its trigger.
  4. Reload: still 1.5×, applied before first paint (checked by reading `html.style.zoom` at `domcontentloaded`).
  5. Desktop only: choose 4× in a 2670×1500 viewport, and `html.mobile` is set. Choose 1×, and it clears.
  6. Esc closes the dialog.

  Every existing spec must stay green, at 1× and unchanged; they cover the rest.
- **Manual (owner):** on the Studio Display in Safari at http://qwen.local, try 1.25× and 1.5×. The text should be comfortable, nothing should overflow, and the menus should open in place.

## Estimated Complexity

M

## Done (2026-09-29)

- **Built:**
  - `lib/ui-zoom.ts`;
  - the boot script applies the stored zoom and decides the phone layout from the effective width (`isNarrow`);
  - `useNarrow` follows `resize` and `qwen:zoom`;
  - `clone.css` divides the `100vh` frame and the one `20vh` by `--ui-zoom`;
  - `Popup` and `Dropdown` convert measured boxes to CSS pixels;
  - `SettingsDialog`, with the ⚙ Settings entry pinned to the sidebar's bottom (and on the rail and in the phone drawer).
- **Found while testing, and fixed:**
  - the Settings entry needed the `sidebar-entry-fixed-list` wrapper for the reference's row styling (its icon and label were stacked);
  - the dialog's ✕ was dark on dark.
- **Replaced deliberately:** `lib/use-narrow.test.tsx` faked `matchMedia`, which cannot see CSS zoom and which the hook no longer uses. The rewritten tests keep the same three behaviours (it follows the width and keeps `html.mobile` in step; the server renders desktop; it stops listening after StrictMode's double mount), and add the zoom event.
- **Tests:**
  - unit: `ui-zoom.test.ts`, `narrow.test.ts` (the boot script run as the page runs it), `use-narrow.test.tsx`, `Popup.test.tsx` and `SettingsDialog.test.tsx`;
  - e2e 65: `settings.spec.ts` at desktop and narrow, plus a 2670×1500 desktop-window case for 4× switching to the phone layout.

  The gate is green.
- **WebKit check** (the engine of the owner's Safari), at 1600×1000 and 1.5×:
  - the document is 1000 px tall (no overflow);
  - the ratio popup's left edge equals its trigger's (982), and it opens upward, 6 px from it;
  - the zoom is still 1.5 after a reload.
- **Manual (owner):** the Studio Display, in Safari at http://qwen.local.
