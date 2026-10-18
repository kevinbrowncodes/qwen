# BUG_014 — A chat's row menu is cut off by the sidebar's list

**Status:** Resolved (2026-10-17). The fix was approved by the owner that day ("please complete")
**Found by:** the owner, 2026-10-17, with a screenshot of the phone drawer ("the dropdown menu also cuts off and I can't see delete unless i scroll down")

## Summary

A chat row's "…" (Chat Menu) opens a popup that is clipped by the sidebar's chat list. Only the popup's top edge shows under the row, and Delete (and, since STORY_033, Rename above it) can be reached only by scrolling the list. It happens at both widths whenever the row is near the bottom of the list's box, which with STORY_032's "today only" sidebar is usually true: today often has one or two chats.

## Steps to Reproduce

1. Have one chat today, so the sidebar lists a single row.
2. On a phone, open the drawer, or on desktop hover the row, and tap or click its "…".
3. Look below the row.

## Expected vs Actual Behaviour

- **Expected:** the whole menu shows at once, over whatever is below it (or above the row when the row is in the lower half of the window), with nothing to scroll. The composer's menus already behave this way (BUG_010).
- **Actual:** a sliver of the popup's top border shows under the row (owner's screenshot, 2026-10-17). The rest is inside the list's scroll area, below its visible edge.

## Root Cause

`RowMenu` (`app/components/shell/HistoryList.tsx`) renders its popup in place, as `.clone-row-menu { position: absolute; top: 100%; right: 0 }` inside the row. Every ancestor up to the sidebar is laid out by the reference's stylesheet, and both `.session-list-wrapper` and `.session-list` are `overflow-y: auto` ([main.css](../recon/2026-09-26/assets/css/main.css)). An absolutely positioned child of a scroll container is clipped to it, so the part of the popup past the list's bottom edge is only reachable by scrolling.

The e2e suite never saw it. Playwright's `click()` scrolls the menu item into view before clicking, so `history.spec.ts`'s Delete case passes while a person cannot see the item.

The composer had the same class of problem and already has the remedy: `Popup` (`app/components/Popup.tsx`, STORY_010 and BUG_010) renders a popup in a layer on `<body>`, positioned `fixed` from the trigger's box. It opens upward when the trigger is in the lower half of the window, and follows scroll and resize. The row menu never used it.

## Acceptance Criteria

- [x] 1. **The row menu renders through `Popup`,** on `<body>`, so no list can clip it. It is aligned to the trigger's right edge, as now, and kept inside the window (`clampLeft`).
- [x] 2. **It opens below the "…", or above it when the "…" is in the lower half of the window** (`placementFor`, as the composer's menus do).
- [x] 3. **Every item is visible and on top without scrolling:** at desktop width and on `devices["iPhone 13"]`, with a single chat in the sidebar, the point at the centre of each menu item hits that item (`document.elementFromPoint`), and the list's `scrollTop` is unchanged by opening it. The same holds for a row on the History page.
- [x] 4. **Behaviour is unchanged:** Rename, Stop and Delete do what they did. A click outside closes the menu, and a click inside the popup, now outside the row in the DOM, does not count as outside.

## Testing Plan

- **Unit** (`app/components/shell/HistoryList.test.tsx`, extended): the open menu is a child of `document.body`, not of the row (AC 1). Choosing an item still works, and a mousedown inside the popup leaves it open while one elsewhere closes it (AC 4). Placement and clamping are already covered by `Popup`'s own tests (`placementFor`, `anchorFor`, `clampLeft`).
- **Integration:** not applicable. No route or server code changes.
- **E2E** (`app/e2e/history.spec.ts`, new test "a chat's row menu shows every item without scrolling", both projects): make one chat with the stub's `done-after-1-poll` script, waiting for its `done`. Open the sidebar (the drawer on the phone), open the row's "…", read the list's `scrollTop`, and for each menu item assert `elementFromPoint` at its centre is inside it. Then assert `scrollTop` did not change (AC 3). It does not click before measuring, because a click would scroll and hide the bug. `history-days.spec.ts` gains the same check on a History row. Regression cover for AC 4: `history.spec.ts`'s Delete and STORY_033 rename tests, and `history-days.spec.ts`'s Delete case stay green unchanged. The menu's Stop has no e2e (none existed before this ticket); it stays covered by the Stop cases in `HistoryList.test.tsx` and `HistoryDays.test.tsx`.

## Resolution

Fixed on 2026-10-17. `RowMenu` (`app/components/shell/HistoryList.tsx`) now draws its popup through `Popup`, on `<body>`, `position: fixed`. A callback ref measures it on open and pulls it left so its right edge meets the "…"'s, clamped inside the window. It opens upward in the lower half of the window, as the composer's menus do. The mousedown-outside check now also counts the popup itself as inside. The `.clone-row-menu` absolute rule in `clone.css` is gone. The popup's z-index (1050, the reference's) is above the phone drawer (1000).

**A/B on the new e2e:** with the fix set aside, "a chat's row menu shows every item without scrolling the list" failed at both desktop and narrow width. With the fix, the full gate is green (94 e2e). The History-page version passed on the old code too, since that page has room below its rows, so it guards against a regression rather than reproducing this bug.
