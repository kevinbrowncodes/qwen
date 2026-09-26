# STORY_013 — Past generations are listed in the sidebar and in My Library, and can be reopened, downloaded or removed

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md)
**Status:** Not started (after STORY_012)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want every generation listed in the sidebar by its prompt, and a My Library page with a grid of every finished image, so that I can get back to, download or delete anything I made.

## Current state

After STORY_012 generations run and can be reopened at `/g/<id>`. `GET /api/history` lists them newest first, and `DELETE /api/history/:id` removes a finished one (STORY_007).

## UI Mockup

**Reference capture:**
- `states/my-library@1437.json` and `states/my-library@393.json`;
- the snapshot's sidebar (`.my-library-head`, `.my-library-content`, `.session-list`, `.chat-item-drag`);
- `interactions.md` → "History: My Library".

**Measured values committed to:**

| Element | Values |
| --- | --- |
| Sidebar My Library | icon, label and chevron (`.my-library-head`); thumbnails 68×68 below (76×76 in the narrow drawer) |
| Sidebar list | rows `.chat-item-drag`, 36 tall, radius 8, highlighted when active, "…" menu on hover (always visible on touch) |
| `/library` | header "My Library"; a masonry grid of 276px cards (2 columns of 180px with an 8px gap at narrow); a hover gradient bar with `Download` (always visible on touch) |

**Desktop sidebar:**

```
│ ✎ New image           │
│ ▦ My Library        › │
│ [▣][▣]                │  latest two finished images, 68×68
│ All images            │
│  Today                │
│  a red bicycle…   ⋯   │  active row highlighted
│  make the subj…   ⋯   │
```

**`/library`, desktop:**

```
│ My Library                                                    │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                            │
│ │      │ │      │ │      │ │      │   276 wide, masonry         │
│ │ ⤓    │ └──────┘ │      │ └──────┘                            │
│ └──────┘          └──────┘                                     │
```

**Empty states:** the sidebar shows no My Library thumbnails (on the reference, the entry itself appears only once an image exists; ours always shows the entry). `/library` with nothing reads:

```
│                 No images yet.                                 │
│      Generated images appear here.   [ New image ]             │
```

## Departures from the reference

- **Type tabs** (All, Image, Video, Document, Web Dev, Podcast) and **My Published** are not rendered. Only images exist locally.
- **The row menu** offers only `Delete`. The reference's Pin, Rename, Clone, Archive, Share, Select, Download, Move to Project and Report are chat and account features.
- **Grouping:** "Today", "Yesterday", then dates. The reference showed only "Today" on the day.
- **The My Library entry is always shown**, so the empty state is reachable.

## Acceptance Criteria

- [ ] The sidebar lists history newest first, grouped by day, titled by the prompt truncated with an ellipsis, for every status. A running item shows a small spinner. Clicking one opens `/g/<id>`, and the current one is highlighted.
- [ ] The sidebar's My Library shows up to two thumbnails of the latest finished images. Clicking the head opens `/library`.
- [ ] `/library` shows every finished image (status done) in a masonry grid: 276px cards on desktop, and 2 columns at narrow. Each card opens its generation, and its Download links to `result?download=1`.
- [ ] Delete in a row's menu asks for confirmation, calls `DELETE /api/history/:id`, removes the row and card, and moves to `/` if the deleted one was open. A running generation's menu offers "Stop" instead (STORY_012).
- [ ] The list refreshes after a submit, and when a generation reaches a terminal state, without a page reload. The write starts before the list changes locally ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over)).
- [ ] The empty states render as sketched.

## Testing Plan

- **Unit:**
  - `app/lib/history-view.test.ts`: grouping by Today, Yesterday and date using an injected clock (dates derived from it, never fixed); truncation; done-only filtering for the library; "latest two finished" for the thumbnails.
  - `app/components/HistoryList.test.tsx`: renders the groups, highlights the active id, and shows the spinner for running entries; delete asks for confirmation before calling back.
- **Integration:** `app/test/integration/jobs.test.ts` already covers `GET /api/history` and `DELETE /api/history/:id`. It is extended with one case: an entry's list order after a second create (newest first).
- **E2E:** `app/e2e/history.spec.ts`, at both widths.
  1. Generate two images (`done-after-1-poll`, waiting on the terminal status each time).
  2. Expect two sidebar rows (opening the drawer on narrow), newest first, titled by their prompts, and two My Library thumbnails that have loaded.
  3. Open `/library`: expect 2 cards whose images have loaded, and a Download `href` ending in `?download=1`.
  4. Click the older card, expect `/g/<older id>` with its image.
  5. Delete it through the row menu with confirmation. Expect one row and one card, and the URL `/`.
  6. **Empty:** with the stub reset and history emptied through `DELETE`s, `/library` shows "No images yet."

  The other specs stay green.

## Estimated Complexity

M
