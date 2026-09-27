# STORY_013 — Past generations are listed in the sidebar and in My Library, and can be reopened, downloaded or removed

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md)
**Status:** Done (2026-09-26)
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

- [x] The sidebar lists history newest first, grouped by day, titled by the prompt truncated with an ellipsis, for every status. A running item shows a small spinner. Clicking one opens `/g/<id>`, and the current one is highlighted.
- [x] The sidebar's My Library shows up to two thumbnails of the latest finished images. Clicking the head opens `/library`.
- [x] `/library` shows every finished image (status done) in a masonry grid: 276px cards on desktop, and 2 columns at narrow. Each card opens its generation, and its Download links to `result?download=1`.
- [x] Delete in a row's menu asks for confirmation, calls `DELETE /api/history/:id`, removes the row and card, and moves to `/` if the deleted one was open. A running generation's menu offers "Stop" instead (STORY_012).
- [x] The list refreshes after a submit, and when a generation reaches a terminal state, without a page reload. The write starts before the list changes locally ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over)).
- [x] The empty states render as sketched.

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

## Done (2026-09-26)

**Side by side** (ours measured in the gate image; reference values from `my-library@1437.json` and `@393.json`):

| Element | Reference | Ours | Delta |
| --- | --- | --- | --- |
| Sidebar thumbnails | 24,188, 68×68 | 24,152, 68×68 | y −36: ours has no Search row above (a departure) |
| My Library title | 260,24, 16px/500, in the top bar | 260,21 (text), 16px/500, in the top bar | y −3 |
| Library grid | 405,148, 860 wide, 276px cards | 406,148, 860 wide, 276px cards | x +1 |
| Phone grid | 2 columns of 180, 8px gap, Download bar always shown | 2 columns, 8px gap, bar always shown, 44px target | the column width follows the viewport |

**Corrections while building:**
- **The library page's own stylesheet was not among the files the owner's save loaded,** so its look is ours, built from the readings. The reference's `.item-card` and `.masonry-grid` rules are sized by its JavaScript masonry (CSS variables we do not set), and they halved our phone cards. Our cards use only our own classes.
- **The reference hides a row's "…" (`display: none`) and shows it from its JavaScript.** Ours shows it on hover or focus, while its menu is open, and always on touch. It sits above the row's link.
- **Deleting the generation that is open closes the phone drawer** as well as going home.
- **The integration case "newest first after a second create"** was already covered by STORY_007's history test (`lists newest first…`), so it was not added again.

**Tests:**
- unit: `history-view` (days derived from the clock, titles, filters), `use-history` (read, refresh on the change event, remove only after the server agreed, stop), `HistoryList` (groups, active row, spinner, Stop, confirm or decline Delete, empty);
- e2e: `history.spec.ts`, 4 cases at both widths. It empties history first, so its counts are of what it made.

Gate green.
