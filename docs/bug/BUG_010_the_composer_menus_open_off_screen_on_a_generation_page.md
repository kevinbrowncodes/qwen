# BUG_010 — The composer's menus open off screen on a generation's page

**Status:** Resolved (2026-09-29)
**Found by:** the owner, 2026-09-29 ("I can't access the dropdowns for any of them", on a running edit's page in Safari)

## Summary

On a generation's page (`/g/<id>`), the composer is pinned to the bottom of the window (STORY_012). Its dropdowns (model, ratio, add-on) and the `+` menu still open downward on desktop, so they render below the window's bottom edge, and nothing in them can be reached. On the home page the composer sits mid-screen, so the same menus work there, and every e2e test that opens a menu does it on the home page.

## Steps to Reproduce

1. At desktop width, open any generation, for example from the sidebar.
2. Click the model, ratio or Add-on dropdown, or `+`, in the composer.

## Expected vs Actual Behaviour

- **Expected:** the menu opens where it can be seen: upward when the composer is at the bottom, as the phone layout already does.
- **Actual:** it opens downward, off screen. Measured at 1920×1080 on `/g/<id>`:
  - the model, ratio and add-on popups start at y=1077 and end at 1123, 1363 and 1203;
  - the home page, the same 1920×1080 window, gives y=582 to 868.

## Root Cause

`Popup` (`app/components/Popup.tsx`) places a popup on whichever side the caller passes. `Composer` passes `"top"` only when the layout is narrow (`const placement = narrow ? "top" : "bottom"`). Nothing looks at where the trigger actually is, so a desktop composer pinned to the bottom still gets `"bottom"`.

## Acceptance Criteria

- [x] A popup whose trigger sits in the lower half of the window opens above it, whatever side was asked for. One in the upper half opens on the side asked for. The popup's class names the side it really opened on, so the reference's `translateY(-100%)` applies.
- [x] This holds for the model, ratio and add-on dropdowns and for the `+` menu, on the home page and on a generation's page, at both widths.
- [x] E2E: on a generation's page at desktop, each dropdown's popup and the `+` menu are fully inside the viewport.

## Resolution

`placementFor(box, requested, viewportHeight)` in `Popup.tsx` is pure and unit-tested. `Popup` uses it on every placement, including scroll and resize, and hands the side it chose to its children. `Dropdown` and `ModeMenu` take their class from that side instead of the prop. `generate.spec.ts` gains a desktop test that opens every composer menu on a finished generation's page and asserts each lies inside the viewport.
