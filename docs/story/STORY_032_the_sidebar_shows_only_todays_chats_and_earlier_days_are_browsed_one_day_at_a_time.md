# STORY_032 — The sidebar shows only today's chats, and earlier days are browsed one day at a time

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-10-17, after STORY_031: "just want to see todays chats in the sidebar")
**Status:** Done 2026-10-17. Approved by the owner that day ("this looks good please proceed"), started while STORY_028 waits on the owner's Mac-side steps, as STORY_030 and STORY_031 were. Open question 3 (the row's details) was accepted as drafted
**Created:** 2026-10-17

As the owner, I want the sidebar to list only today's chats, with every earlier chat one click away on a page I can step through day by day, so that the sidebar stays short and I can still find and reopen anything from before.

## Current state

Read on 2026-10-17, after STORY_031:

- **The sidebar lists every chat ever made.** `HistoryList.tsx` renders `groupChatsByDay(chats, now)` (`app/lib/history-view.ts`): an "All images" folder, then a day label ("Today", "Yesterday", then dates such as "Oct 15") above each day's rows. On the owner's Spark that is 274 rows on 2026-10-17, one per image made before chats existed.
- **"Today" is the viewer's calendar day,** in the browser's local time (`dayLabel`). A chat is filed under the day of its **newest** turn (`ChatSummary.newestAt`, STORY_031), so sending in an old chat moves it to today.
- **The sidebar's clock is read once.** `Sidebar.tsx` holds `const [now] = useState(() => new Date())`, so a tab left open past midnight keeps calling yesterday "Today" until the page is reloaded.
- **The sidebar's other parts:** New image, My Library (with the two newest finished images as 68 × 68 thumbnails, STORY_013), the history folder, and Settings pinned at the bottom (STORY_020). At phone width the sidebar is a drawer (`Shell.tsx`).
- **An open chat is highlighted** in the sidebar by its row (`activeId`, the chat of the URL's job).
- **Routes:** `/` (home), `/g/<id>` (a chat), `/library`. There is no page for past days.
- **E2E history** is a temporary file per run (`HISTORY_FILE` in `playwright.config.ts`'s `webServer.env`), read on every request.
- **The reference** (2026-09-26 capture) lists its chats in the sidebar under day labels, with no archive. This story departs from it at the owner's request.

## UI Mockup

**Reference capture:** [states/home-signed-in@1437.json](../recon/2026-09-26/states/home-signed-in@1437.json) and [states/home-signed-in@393.json](../recon/2026-09-26/states/home-signed-in@393.json): the sidebar's markup and measurements, which this story keeps. The new row reuses My Library's row (`.my-library-head`: icon, label, chevron), and the new page reuses My Library's page frame. No new colours or sizes.

### 1. The sidebar, desktop: before and after

Before (today):

```
┌──────────────────────────┐
│ Qwen               [◧]   │
│ ⊕ New image              │
│ ▣ My Library          ›  │
│   [img] [img]            │
│ All images               │
│ Today                    │
│   A red bicycle…     …   │
│   Portrait in a g…   …   │
│ Yesterday                │
│   Harbour at dusk    …   │
│   Two lighthouses    …   │
│ Oct 15                   │
│   …                      │
│   … (274 rows)           │
│ ⚙ Settings               │
└──────────────────────────┘
```

After:

```
┌──────────────────────────┐
│ Qwen               [◧]   │
│ ⊕ New image              │
│ ▣ My Library          ›  │
│   [img] [img]            │
│ ◷ History             ›  │  ← new: opens /history
│ Today                    │
│   A red bicycle…     …   │
│   Portrait in a g…   …   │
│                          │
│                          │
│ ⚙ Settings               │
└──────────────────────────┘
```

- **Only today's chats are listed,** under "Today", newest first, exactly as rows look now (title, spinner while running, the "…" Chat Menu).
- **"All images" and every other day label are gone** from the sidebar.
- **"History"** is a new row under My Library, built like it: the harvested `qwpcicon-history` icon (`appicon-history` on the phone), the label and a chevron. It is shown whenever any chat is older than today, and is highlighted while the History page is open, or while a chat from an earlier day is open.
- **My Library and its two thumbnails are unchanged.**

### 2. The sidebar with no chats yet today

```
┌──────────────────────────┐
│ ⊕ New image              │
│ ▣ My Library          ›  │
│   [img] [img]            │
│ ◷ History             ›  │
│ Today                    │
│   No chats yet today     │
│                          │
│ ⚙ Settings               │
└──────────────────────────┘
```

(With no history at all, the sidebar reads "No images yet" as it does now, and has no History row.)

### 3. The History page, desktop (`/history?day=2026-10-16`)

```
┌──────────────────────────┬──────────────────────────────────────────────────┐
│ ⊕ New image              │                                                  │
│ ▣ My Library          ›  │  History                                         │
│ ▌◷ History            ›  │  Chats from before today                         │
│ Today                    │   [ ‹ ]   Thursday, October 16   [ › ]  [📅]      │
│   A red bicycle…     …   │                                                  │
│                          │   ┌────────────────────────────────────────────┐ │
│                          │   │ [img]  Harbour at dusk            3 images │ │
│                          │   │        last 21:40                      …  │ │
│                          │   ├────────────────────────────────────────────┤ │
│                          │   │ [img]  Two lighthouses             1 image │ │
│                          │   │        last 18:05                      …  │ │
│                          │   ├────────────────────────────────────────────┤ │
│                          │   │ [img]  Portrait in a garden       2 images │ │
│                          │   │        last 09:12                      …  │ │
│                          │   └────────────────────────────────────────────┘ │
│ ⚙ Settings               │                                                  │
└──────────────────────────┴──────────────────────────────────────────────────┘
```

- **The heading** reads "History", with "Chats from before today" under it: today's chats are in the sidebar.
- **The day shown** opens at the most recent day before today that has chats. The URL carries it (`?day=YYYY-MM-DD`), so a reload or a shared link keeps it.
- **‹ and ›** step to the previous or next **day that has chats**, skipping empty days. ‹ is disabled on the oldest such day. › is disabled on the newest day before today: today's chats are in the sidebar.
- **📅** opens the browser's date picker, limited to the first day with chats and yesterday. A picked day with no chats reads "No chats on this day", and ‹ and › still work from it.
- **Each chat is one row:** the newest finished image as a 48 × 48 thumbnail (a blank tile if none finished), the title (the chat's first prompt), its image count, and the time of its newest turn. Clicking the row opens the chat. Its "…" Chat Menu is the sidebar's: Stop, or Delete the chat.
- **Rows are newest first** within the day.

### 4. A day with nothing on it (picked with 📅)

```
│   [ ‹ ]   Tuesday, October 14    [ › ]  [📅]      │
│                                                  │
│            No chats on this day.                 │
```

### 5. Narrow (iPhone 13): the drawer and the page

```
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ ☰  Qwen                              │   │ ☰  History                           │
│┌────────────────────────┐            │   │                                      │
││ ⊕ New image            │░░░░░░░░░░░░│   │  [‹]  Thu, Oct 16   [›]  [📅]        │
││ ▣ My Library        ›  │░░░░░░░░░░░░│   │                                      │
││   [img] [img]          │░░░░░░░░░░░░│   │ [img] Harbour at dusk    3 images    │
││ ◷ History           ›  │░░░░░░░░░░░░│   │       last 21:40               …     │
││ Today                  │░░░░░░░░░░░░│   │ [img] Two lighthouses    1 image     │
││   A red bicycle…   …   │░░░░░░░░░░░░│   │       last 18:05               …     │
││                        │░░░░░░░░░░░░│   │ [img] Portrait in a…     2 images    │
││ ⚙ Settings             │░░░░░░░░░░░░│   │       last 09:12               …     │
│└────────────────────────┘            │   │                                      │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
       the drawer, open                           /history at 393
```

- The drawer has the same rows as the desktop sidebar. Choosing "History" closes it, as choosing My Library does.
- On the page, ‹, › and 📅 each have a 44 × 44 touch area, and the date is shortened ("Thu, Oct 16").

### 6. Moving across midnight

A tab left open past midnight moves yesterday's chats out of the sidebar within a minute, without a reload, and they appear on the History page.

## Departures from the reference

- **The sidebar lists only today; earlier days are on their own page.** The reference lists every chat in the sidebar under day labels. The owner asked for this on 2026-10-17 to cut clutter.
- **"History" and its page are ours.** They are built from the reference's own sidebar row and page frame.

## Acceptance Criteria

**The sidebar**

- [x] 1. **It lists only chats whose newest turn is today,** in the viewer's local calendar day, newest first, under one "Today" label, with rows exactly as they are now. "All images" and the other day labels no longer appear.
- [x] 2. **"History"** appears under My Library whenever any chat's newest turn is before today, and links to `/history`. It is highlighted (`aria-current="page"`) on `/history`, and while a chat whose newest turn is before today is open. No chat row is highlighted then, since that chat is not in the sidebar.
- [x] 3. **No chats today, but some before:** the Today label reads "No chats yet today". No history at all: "No images yet", and no History row.
- [x] 4. **Today moves at midnight.** The sidebar re-reads the clock whenever history is re-read and at least once a minute, so a chat from yesterday leaves it within a minute of midnight without a reload.
- [x] 5. **Sending in an earlier chat brings it back:** its newest turn is now today, so it appears in the sidebar and leaves the History page (the rule from STORY_031).

**The History page**

- [x] 6. **`/history` shows one day:** the day in `?day=YYYY-MM-DD` when it is before today, otherwise the most recent day before today that has chats. With no chats before today at all, it says "No earlier chats." The page is headed "History", with "Chats from before today" under it, and the day between ‹ and › is the long date ("Thursday, October 16"; "Thu, Oct 16" on the phone).
- [x] 7. **Its rows** are that day's chats (by newest turn), newest first, each with the newest finished image as a 48 × 48 thumbnail (a blank tile when none finished), the title (first prompt), the image count ("1 image" or "N images"), and the time of the newest turn (24-hour, local). The row links to `/g/<chat id>`. Its "…" Chat Menu offers Stop while a turn runs, or Delete the chat after asking, as the sidebar's does. Deleting the day's last chat leaves the day reading "No chats on this day".
- [x] 8. **‹ and ›** move to the previous and next days that have chats, skipping empty ones, and update `?day=` (browser history `push`, so Back returns to the day before). ‹ is disabled on the oldest such day, and › on the newest day before today.
- [x] 9. **📅** is the browser's date input, from the oldest day with chats to yesterday. Choosing a day shows it, even when it has no chats ("No chats on this day").
- [x] 10. **Phone (iPhone 13):** ‹, › and 📅 each have a 44 × 44 touch area; nothing on the page scrolls sideways.

**Unchanged**

- [x] 11. **Nothing else changes:** chats themselves and the page at `/g/<id>`, My Library and the sidebar's thumbnails, the composer, Settings, and the history file and its routes. Nothing is moved or deleted by this story: History is a view of the same history.

## Technical Notes

- **Pure helpers** in `app/lib/history-view.ts`, all taking `now` so tests set the clock:
  - `dayKey(date)` is exported (the local `YYYY-MM-DD` it already computes).
  - `todaysChats(chats, now)`: the chats whose `newestAt` falls on today.
  - `pastDays(chats, now)`: the day keys before today that have chats, newest first.
  - `chatsOn(chats, day)`: that day's chats, newest first.
  - `stepDay(days, day, direction)`: the neighbouring day that has chats, or null at either end, also from a day with none.
  - `longDate(day)` and `shortDate(day)`, for the heading.
- **The sidebar:** `HistoryList` receives `todaysChats(...)` and renders one "Today" group; `Sidebar` gains the History row and a `now` refreshed by a one-minute interval and on every history change. Its decide-once state stays in refs (§6b), and the interval is cleared on every effect cleanup.
- **The page:** `app/app/history/page.tsx` renders a new `app/components/history/HistoryDays.tsx`, which reads `useHistory()`, the `day` search parameter (`useSearchParams`) and writes it with `router.push`. The row's Chat Menu is the sidebar's `RowMenu`, exported from `HistoryList.tsx` so both share one control.
- **Icons** (all in the served sprite, checked 2026-10-17): `qwpcicon-history` / `appicon-history` for History; `qwpcicon-left` / `qwpcicon-right` (`appicon-` on the phone) for ‹ and ›; `appicon-date` at both widths for 📅, since the desktop set has no calendar icon. The 📅 button opens a visually hidden `<input type="date">` with `showPicker()`.
- **E2E arrangement:** `playwright.config.ts` sets `process.env["QWEN_E2E_HISTORY_FILE"]` once (workers inherit it) and passes the same path as `HISTORY_FILE`. The spec makes real chats through the app, then rewrites their `createdAt` in that file to earlier days. The app reads the file on every request, so no product code has a test hook.
- **README:** Features says the sidebar shows today's chats only, and describes History.

## Testing Plan

**Unit** (Vitest; jsdom for components; the clock is set with fake timers, never a fixed calendar date baked into an assertion, per §6b):

- `app/lib/history-view.test.ts` (extended):
  - `todaysChats` keeps only chats whose newest turn is today, including a chat begun yesterday with a turn today.
  - `pastDays` lists the earlier days that have chats, newest first, with no duplicates and without today.
  - `chatsOn` gives a day's chats, newest first.
  - `stepDay` steps over an empty day each way, returns null at each end, and steps correctly from a picked day that has no chats.
  - `longDate` and `shortDate` give "Thursday, October 16" and "Thu, Oct 16" for a day derived from the clock.
- `app/components/shell/HistoryList.test.tsx` (extended): only the chats given are listed, under "Today"; "No chats yet today" when that list is empty but earlier chats exist.
- `app/components/shell/Sidebar.test.tsx` (extended, inside `StrictMode`, fake timers):
  - The History row appears only when an earlier chat exists, and is highlighted on `/history` and on an earlier chat's page.
  - Advancing the clock past midnight moves a chat out of the list within a minute.
  - The interval is cleared on unmount, so no timer is left running.
- `app/components/history/HistoryDays.test.tsx` (new, inside `StrictMode`):
  - It opens at the most recent earlier day, and honours `?day=`.
  - ‹ and › skip empty days and push the new `?day=`; each is disabled at its end.
  - A picked empty day says "No chats on this day".
  - With nothing before today it says "No earlier chats.".
  - The row shows the thumbnail, title, count and time, and links to the chat.
  - Delete from the row's menu asks first, and calls `DELETE /api/chats/<id>`.

**Integration:** none new. The page and the sidebar read the existing `GET /api/history`, and delete through the existing `DELETE /api/chats/:id`, both already covered against the stub (STORY_031). No route changes.

**E2E** (new `app/e2e/history-days.spec.ts`, both projects, against the stub with `done-after-1-poll`):

1. Empty history (as `history.spec.ts` does). Make three chats through the app, waiting for each to reach `done` before the next: "harbour at dusk", "two lighthouses", "a red bicycle".
2. Rewrite the history file so that "harbour at dusk" is 2 days ago and "two lighthouses" 4 days ago, with dates derived from the clock.
3. Reload home: the sidebar (the drawer on the phone) lists only "a red bicycle" under Today, and shows History.
4. Click History: the URL is `/history`, and the heading names 2 days ago. One row, "harbour at dusk", with "1 image" and its thumbnail loaded.
5. Click ‹: the heading names 4 days ago (the empty day in between is skipped), and the row is "two lighthouses". ‹ is disabled; › is enabled. Browser Back returns to 2 days ago.
6. Pick 3 days ago with the date input: "No chats on this day".
7. Open "harbour at dusk" from its row: its chat shows, and the sidebar highlights History with no row highlighted.
8. Send "make it blue" in that chat, waiting for `done`: the sidebar now lists it under Today, above "a red bicycle", and History no longer shows it on its old day.
9. **Narrow only:** ‹, › and 📅 each measure at least 44 × 44, and the page's `scrollWidth` equals its `clientWidth`.

Every job the spec starts reaches a terminal status before it ends.

**Specs that must stay green, covering AC 11:** `chat.spec.ts` (all chats in it are today's), `history.spec.ts`, `queue.spec.ts`, `generate.spec.ts`, `image-mode.spec.ts`, `references.spec.ts`, `settings.spec.ts`, `home.spec.ts`, `smoke.spec.ts`. `history.spec.ts` asserts a "Today" group; it stays true.

**Manual verification on the Spark** (not a gate): after the deploy, the owner's sidebar shows only today's chats, and History steps back through the 274 older images, each its own chat.

## Estimated Complexity

M. Pure day helpers, a one-group sidebar, and one new page reusing existing rows and menus. No server or contract change.

## Open questions for the owner

0. *(Answered 2026-10-17: the row and the page are called "History", not "Previous days".)*

1. **"Today" is the calendar day** in your local time (midnight to midnight), matching the existing labels. Or did you mean the last 24 hours? *(Answered 2026-10-17: the calendar day.)*
2. **My Library's two thumbnails** stay in the sidebar as they are now (mockup 1). Should they go too, to cut more clutter? *(Answered 2026-10-17: leave them for the time being.)*
3. **Row details on History:** thumbnail, title, image count and time of the newest turn. Anything to add or drop?

## Done note (2026-10-17)

- **Gate:** all six steps green, run by hand through `tools/gate/run.sh` (typecheck, lint, unit, integration, build with the production image, e2e: 86 passed, 14 skipped by design), then again on the pre-push hook.
- **Built as specified, with these choices:**
  - A small `useNow()` hook (`app/lib/use-now.ts`) re-reads the clock every minute and on every history change. The sidebar and the History page share it, so both agree on "today" (AC 4).
  - `ChatSummary` gained `thumbId`, the chat's newest finished image, for the row's thumbnail.
  - The page's title, "History", sits in the top bar as My Library's does (`Shell.tsx` names both).
  - The 📅 button calls `showPicker()` where the browser has it. The date input is laid transparently over the button, so a click on it opens the picker in a browser without `showPicker`, and the e2e can fill it.
  - The e2e moves chats to earlier days by rewriting the run's history file. `playwright.config.ts` now puts that file's path in `QWEN_E2E_HISTORY_FILE`, which the test workers inherit. No product code has a test hook.
- **Tests that changed, and why** (CLAUDE.md §4c): `HistoryList.test.tsx`'s first case no longer expects a "Yesterday" group, the behaviour AC 1 removes; it now passes today's chats and checks "All images" is gone. `Sidebar.test.tsx`'s "open" case expected "All images"; it now expects the empty state. Its `use-history` mock gained the event name the new clock hook listens for. `home.spec.ts`'s rail test used "All images" as its marker for the expanded sidebar and now uses the "My Library" label. What it checks, that the rail hides the full sidebar's labels, is unchanged. `history.test.ts`'s summary shape gained `thumbId`.
- **Departures:** as listed above.
- **Manual check on the Spark** (after the deploy): see below.
