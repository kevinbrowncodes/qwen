# BUG_008 — The collapsed sidebar shows its contents cut off instead of an icon rail

**Status:** Resolved (2026-09-28)
**Found by:** the owner, 2026-09-28

## Summary

On desktop, "Toggle sidebar" narrows the sidebar to the reference's 60px (`.sidebar-collapse { width: 60px }`, from its own CSS). But the full sidebar keeps rendering inside that strip, clipped: half the logo, "All i…", "Yeste…", and half a thumbnail. A second toggle button also appears in the top bar. The reference collapses to a clean **icon rail**, as the owner's screenshot of chat.qwen.ai on 2026-09-27 shows: the toggle at the top, then New Chat, Search, Library, and the account at the bottom, icons only.

## Steps to Reproduce

1. Open http://localhost:3100 at desktop width.
2. Click Toggle sidebar.

## Expected vs Actual Behaviour

- **Expected:** a 60px rail with the toggle at the top and icon-only New image and My Library, with nothing clipped and no second toggle in the top bar.
- **Actual:** the whole sidebar is squeezed into 60px and cut off, and an extra toggle sits in the top bar.

## Root Cause

`Shell.tsx` only swaps the frame's classes (`sidebar-collapse`, `sidebar-hide-side`). The reference swaps the frame's content to its rail markup from its JavaScript, and ours rendered the same content in both states. STORY_009 checked the collapse only through `aria-hidden`, not what was on screen.

## Acceptance Criteria

- [x] Collapsed on desktop, the sidebar is 60px wide and holds only:
  - the Toggle sidebar button at the top;
  - icon-only links to New image and My Library, each with an accessible name.

  No logo, labels, thumbnails or history rows are rendered.
- [x] The top bar shows no toggle of its own; the rail's toggle expands the sidebar again.
- [x] The phone drawer is unchanged.
- [x] Choice recorded: the owner chose the icon rail, like the reference, over hiding the sidebar completely (2026-09-28).

## Testing

- **Unit:** `app/components/shell/Sidebar.test.tsx`, new:
  - the rail variant renders the toggle and the two named links, and no text labels, logo or history;
  - the full variant renders them all.
- **E2E:** `app/e2e/home.spec.ts` (desktop), extended:
  - collapse, and the settled sidebar is 60 wide;
  - "New image" and "My Library" are links by name and "All images" is not visible;
  - the top bar has no toggle;
  - the rail's toggle restores the 240px sidebar.

  The narrow drawer test stays green.

## Resolution

- **The rail:** `Sidebar` renders a rail variant when collapsed on desktop: the toggle, then icon-only New image and My Library (`.clone-rail` in `clone.css`), inside the reference's 60px frame. `Shell` no longer puts a second toggle in the top bar.
- **Found on the way:** the frame was `aria-hidden` whenever it was collapsed, which hid the rail from assistive technology. It is now `aria-hidden` only while the phone drawer is closed.
- **Tests:** unit `Sidebar.test.tsx` (the rail and the full sidebar); e2e `home.spec.ts` (collapse to 60 with the named links and no "All images", then back to 240). Gate green. Checked in a screenshot at 1437×1031.
