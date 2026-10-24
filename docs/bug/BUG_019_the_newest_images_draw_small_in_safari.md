# BUG_019 — The newest images draw small in Safari

**Status:** Open
**Found:** 2026-10-24, by the owner in Safari on the Mac Studio 2022. Measured the same day by the assistant in a read-only Hands session on that Mac's hand (http://hands.local/sessions/736fbb9c108840abb291bc7459672a34: the recording, a look per act and each read's answer as `act-NN.js.txt`).

## Summary

In a chat with eight 16:9 results, the two newest draw at 122 × 68 instead of filling the 1219 px column, and four others are held at 1219 × 680. Every file is whole (1376 × 768). Safari reports smaller natural sizes, and the result `<img>` has no size of its own, so it lays out at what Safari reports.

## Steps to Reproduce

1. Safari 27.0.1 on the Mac Studio 2022, window 1920 × 998, dpr 1, wide layout on, no zoom.
2. Open a chat whose newest results also show as the sidebar's thumbnails: `http://qwen.local/g/be3d939a-b4e3-434a-941e-2e7cfda15430`, 8 results.
3. Read each `[data-testid="result-image"]`'s `naturalWidth`, `naturalHeight` and box.

## Expected vs Actual Behaviour

**Expected:** each result draws at the column's width (1219 × 680 here, from 1376 × 768 under `max-width: 100%`), like the oldest two.

**Actual:**

| Result | File from `/api/jobs/{id}/result` | Safari's natural size | Drawn at |
|---|---|---|---|
| #0, #1 | 1376 × 768 | 1376 × 768 | 1219 × 680 |
| #2–#5 | 1376 × 768 | 1219 × 680 | 1219 × 680 |
| #6, #7 (the newest) | 1376 × 768 | 122 × 68 | **122 × 68** |

Scrolling the chat top to bottom changes nothing, and neither does a reload. The CSS is the same on all eight: `max-width: 100%`, `max-height: 778px`, no width.

## Root Cause

Inferred from the measurements, not from WebKit's source.

- The result `<img>` (`app/components/generation/GenerationView.tsx`) carries no `width` or `height`, so its layout follows the decoded image's natural size.
- The sidebar's thumbnails (`app/components/shell/Sidebar.tsx`, `data-testid="library-thumb"`) load the same URL (`resultUrl(id)`, `/api/jobs/{id}/result`) into a 68 × 68 box. For #6 and #7, the two newest, both copies report 122 × 68: the thumbnail's box covered at 16:9.
- Safari appears to decode an image at the size it first draws it, share that decode between the elements that show the URL, and report it as `naturalWidth`. #2–#5 report exactly the size they were first drawn in the column.
- The bytes are not the cause. A synchronous XHR in the page read the PNG header from Safari's cache and from a cache-busted URL: 1376 × 768 and the server's byte count for all eight. The route's `cache-control: private, max-age=31536000, immutable` keeps whole files.

## Acceptance Criteria

- [ ] The result `<img>` takes its size from the job, not from the decode: `width` and `height` from the turn's `result.width` and `result.height` (`app/lib/history.ts` already keeps them), drawn at the column's width with `height: auto` under the same max-width and max-height.
- [ ] A turn with no `result` size yet (a result still arriving) draws as today.
- [ ] A component test proves the result image carries the job's width and height. An e2e test proves a result also shown as a sidebar thumbnail fills the column.
- [ ] Re-measured on the Mac Studio 2022 in a Hands session, on the same chat with the same reads: all eight results draw at 1219 × 680.
