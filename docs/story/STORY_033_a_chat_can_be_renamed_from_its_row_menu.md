# STORY_033 — A chat can be renamed from its row menu

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-10-17, after STORY_032: "there are no ways to rename the chat")
**Status:** Done 2026-10-17. Approved by the owner that day ("please complete story 33"); both open questions were taken as drafted
**Created:** 2026-10-17

As the owner, I want to give a chat my own name from its "…" menu, so that I can tell my chats apart when several start with the same prompt.

## Current state

Read on 2026-10-17, after STORY_032:

- **A chat's title is always its first prompt.** `chatsOf` (`app/lib/history-view.ts`) sets `ChatSummary.prompt` to the first remaining turn's prompt, and both the sidebar (`HistoryList.tsx`) and the History page (`HistoryDays.tsx`) render `titleOf(c.prompt)`: the prompt's first non-blank line. There is nowhere to keep any other name.
- **The row's "…" (Chat Menu)** is `RowMenu` in `HistoryList.tsx`, shared by the sidebar and the History page. It holds one item: **Stop** while any turn is queued or running, otherwise **Delete** (red, after a confirm). STORY_013 left out the reference's other items, Rename among them, as "chat and account features". Chats exist now (STORY_031), so Rename has something to act on.
- **A chat is stored as its turns.** `history.json` (`HISTORY_FILE`) is a list of `HistoryEntry`, one per image, each carrying `chatId`. There is no chat record. The file is read on every request and written atomically (`history-store.ts`).
- **The chat route** `app/app/api/chats/[id]/route.ts` answers `DELETE` only (STORY_031).
- **The chat page's header** reads "Qwen-Image 2.1" (the model selector), not the chat's title, and the browser tab reads "Qwen Local". Neither shows a chat title today.

## UI Mockup

**Reference capture.** The 2026-09-26 capture lists `Rename` in the Chat Menu, second after `Pin` ([capture-notes.md](../recon/2026-09-26/capture-notes.md), line 70), but **no rename state was captured**: STORY_028 plans `chat-rename-open@W` and is still waiting on the owner's Mac-side steps. The harvested stylesheet [main.css](../recon/2026-09-26/assets/css/main.css) shows how the reference does it on desktop: an input that takes the title's place inside the row, `.chat-item-drag-input { margin-right: 40px; width: 100%; height: 22px; background-color: transparent; outline: none; color: var(--text-primary) }`. It also has a `.qwen-chat-comp-item-rename-modal` class, probably the phone's version, whose look is not captured. This story builds the inline input at both widths from that rule, and lists the modal as an open question. Committed values: the input rule above, the row's existing font (14px, `--text-primary`), and the existing menu item markup (`qwen-chat-v2-dropdown-menu-item`). No new colours or sizes.

### 1. The menu, desktop (sidebar and History page)

```
│ Today                    │
│   the subject is co… ⋯   │
│        ┌────────────┐    │
│        │ Rename     │    │   ← new, first
│        │ Delete     │    │   ← red, as now
│        └────────────┘    │
```

While a turn runs:

```
│        ┌────────────┐    │
│        │ Rename     │    │
│        │ Stop       │    │
│        └────────────┘    │
```

### 2. Renaming, in place

```
│ Today                    │
│ ┌──────────────────────┐ │
│ │▌the subject is compl▐│ │   ← the title becomes an input, its text selected, focused
│ └──────────────────────┘ │
```

- **Enter**, or clicking anywhere else, saves. **Escape** puts the old title back and saves nothing.
- While editing, the row does not navigate, and its "…" is hidden (the reference's 40px right margin is where it sits).

### 3. Saved

```
│ Today                    │
│   Beach set, take 2   ⋯  │
```

The same name shows on the History page's row (STORY_032) for that chat:

```
│   │ [img]  Beach set, take 2          3 images │ │
│   │        last 21:40                      …  │ │
```

### 4. Cleared

Saving an empty (or all-space) name returns the chat to its automatic title, the first prompt.

### 5. Narrow (iPhone 13, the drawer)

```
┌────────────────────────┐
│ Today                  │
│ ┌────────────────────┐ │
│ │▌Beach set, take 2 ▐│ │   ← the same inline input, 44px tall touch row
│ └────────────────────┘ │
│ ⚙ Settings             │
└────────────────────────┘
```

The menu's items keep their existing touch size. Tapping outside the input saves, as on desktop; the on-screen keyboard's return key is Enter.

## Departures from the reference

- **Only Rename is added.** Pin, Clone, Archive, Share, Select, Download, Move to Project and Report stay out, as STORY_013 decided.
- **Rename comes first in the menu**, since Pin, which sits above it in the reference, is not built.
- **The phone uses the inline input too.** The reference may use a modal there (`qwen-chat-comp-item-rename-modal`), but that state is not captured. If STORY_028's capture later shows a modal, the mismatch is a bug ticket (§3b).

## Acceptance Criteria

**The menu**

- [x] 1. **The Chat Menu offers Rename** first, above Delete, in the sidebar and on the History page, and also while a turn runs (above Stop).
- [x] 2. **Choosing Rename** closes the menu and replaces the row's title with a text input holding the current title, focused, with all of its text selected. The row does not navigate while the input is shown.

**Saving**

- [x] 3. **Enter or leaving the input saves.** The name is trimmed of surrounding space and capped at 100 characters (the input refuses more). The request is sent **before** the row shows the new name (§4c: send first, paint second). Once the server accepts it, the row shows the new name.
- [x] 4. **Escape cancels:** the old title comes back and nothing is sent. A save with the name unchanged sends nothing either.
- [x] 5. **An empty name clears the rename,** and the chat goes back to its automatic title, the first line of its first prompt.
- [x] 6. **A failed save** (the server refuses, or cannot be reached) leaves the old title in place and shows nothing else broken. The row is usable afterwards.

**Keeping it**

- [x] 7. **The name is stored with the history**, so it survives a reload, a server restart, and is the same in the sidebar, on the History page and in every open tab after its next history read.
- [x] 8. **Sending another image in a renamed chat keeps its name.** A new turn does not reset it.
- [x] 9. **`PATCH /api/chats/:id`** with `{ "title": string | null }` sets the name (`null` or a blank string clears it) and answers `{ id, title }`. An unknown chat answers 404 `not_found`; a body that is not that shape, or a name over 100 characters after trimming, answers 400 `invalid_request`. A running turn does not block a rename.

**Unchanged**

- [x] 10. **Nothing else changes:** Delete and Stop behave as before, the chat page and its header, My Library, the composer, and history entries saved before this story (they read as having no name).

## Technical Notes

- **Storage: an optional `title` on each turn.** `HistoryEntry` gains `readonly title?: string`. `renameChat(entries, chatId, title)` in `history.ts` sets it on every turn of the chat (or removes it when cleared) and reports how many turns it touched, so a chat with no turns is a 404. `parseEntries` keeps a string `title` and drops anything else, so older files read unchanged. `addEntry` does not copy it; instead `chatsOf` takes the title from the newest turn that has one. A rename writes it to every turn, so they always agree, and a new turn without one inherits the chat's. No separate chats file: history stays one file, read on every request.
- **The summary:** `ChatSummary` gains `title: string | null`. A helper `chatTitle(c)` returns `c.title ?? titleOf(c.prompt)`, and both `HistoryList` and `HistoryDays` use it in place of `titleOf(c.prompt)`.
- **The store and route:** `HistoryStore.renameChat(chatId, title)`; `PATCH` in `app/app/api/chats/[id]/route.ts` validates the body (no type assertions, rule 6), trims, and maps the outcome to 200, 400 or 404 through `errorResponse`.
- **The client:** `use-history.ts` gains `renameChat(chatId, title): Promise<boolean>`, which awaits the `PATCH` and only then updates its entries (§4c), like `removeChat`.
- **The row:** `RowMenu` gains an `onRename` prop and a Rename item. The row (in `HistoryList` and `HistoryDays`) owns an `editing` state and renders the input with the reference's `chat-item-drag-input` class in place of the link's title. Escape is handled on `keydown`; blur saves unless Escape set a cancel flag in a ref first (blur fires after Escape removes the input).
- **README:** Features gets a line that chats can be renamed from their "…" menu, and the history file's description mentions the optional `title`.

## Testing Plan

**Unit** (Vitest; jsdom for components):

- `app/lib/history.test.ts` (extended):
  - `renameChat` sets the title on every turn of the chat and leaves other chats untouched.
  - A blank or `null` title removes the field from every turn.
  - An unknown chat touches nothing and reports 0.
  - `parseEntries` keeps a string `title`, and drops a non-string one, so an old file reads as before.
- `app/lib/history-view.test.ts` (extended):
  - `chatsOf` takes the title from the newest turn that has one, so a turn added after a rename (with no title) keeps the chat's name (AC 8).
  - `chatTitle` falls back to the first prompt's first line when there is no title (AC 5).
- `app/lib/use-history.test.tsx` (extended): `renameChat` sends `PATCH /api/chats/<id>` before the entries change. It updates them on a 200, and leaves them unchanged on a 404 or a network error (AC 3, 6).
- `app/components/shell/HistoryList.test.tsx` (extended):
  - The menu lists Rename then Delete, and Rename then Stop while running (AC 1).
  - Choosing Rename shows a focused input with the whole title selected (AC 2).
  - Enter calls `onRename` with the trimmed name (AC 3).
  - Blur saves (AC 3).
  - Escape restores the title and calls nothing, and a following blur does not save either (AC 4).
  - Saving the unchanged name calls nothing (AC 4).
  - The input refuses a 101st character (AC 3).
  - Clicking the input does not navigate (AC 2).
- `app/components/history/HistoryDays.test.tsx` (extended): a renamed chat's row shows its name, and Rename from its menu calls the same handler (AC 1, 7).

**Integration** (`app/test/integration/chats.test.ts`, new, against a real temporary history file):

- `PATCH` sets the name, and `GET /api/history` then returns it on every turn (AC 7, 9).
- `PATCH` with `null` and with `"   "` clears it (AC 5, 9).
- An unknown chat answers 404 `not_found` (AC 9).
- A missing `title`, a number, and a 101-character name each answer 400 `invalid_request`, and the file is unchanged (AC 9).
- A rename while a turn is running answers 200 (AC 9).
- `DELETE` still removes the renamed chat (AC 10).

**E2E** (Playwright, production build, stub server). This is a critical flow: reopening a chat from history.

- `app/e2e/history.spec.ts`, new test "a chat renamed from its menu keeps the name after a reload", at desktop width and `devices["iPhone 13"]`:
  1. Fixture: send one image from the home page with the stub's `done-after-1-poll` script. Register `waitForResponse` for its `done` status before the click, and wait for it.
  2. Open the row's Chat Menu and choose Rename. Assert the input is focused.
  3. Type "Beach set, take 2" and press Enter. Wait for the `PATCH /api/chats/<id>` response (200).
  4. Assert the row reads "Beach set, take 2".
  5. Reload, and assert it still does.
  6. Open the menu again and choose Rename. Press Escape, and assert the name is unchanged and no `PATCH` was sent.
  7. On the phone, open the drawer first. Assert the input row is at least 44px tall.
- `app/e2e/history-days.spec.ts`, new test: rename a chat moved to an earlier day (the existing `createdAt` rewrite arrangement), and assert the History page's row shows the name.
- **Regression cover for AC 10:** `chat.spec.ts` (chats, sending into one, reopening whole), `history.spec.ts`'s existing Delete and Stop tests, `history-days.spec.ts`'s paging tests, and `generate.spec.ts` stay green unchanged.

**Manual verification:** none on the model. Renaming touches only the app's history file. The owner renames a chat on the Spark's live build, then checks it in the sidebar, after a reload, and on the Mac and the phone.

## Estimated Complexity

Small to medium: one stored field, one route method, one menu item, and an inline input shared by two lists.

## Open questions for the owner

1. **The phone:** inline input at both widths (as drafted), or wait for STORY_028's capture to see if the reference uses a modal there?
2. **The chat page:** should the renamed title also show anywhere on `/g/<id>` (the header or the browser tab)? As drafted, it shows only in the sidebar and on History, since neither page shows a chat title today.

## Done note (2026-10-17)

- **Built as drafted.** The inline input is used at both widths, and the name shows only in the sidebar and on History (both open questions as drafted).
- **Side by side with the reference:** no rename state was captured (STORY_028 is still waiting), so the only measured values are the stylesheet's `.chat-item-drag-input` rule, and the input keeps them: transparent, 22px tall, `--text-primary`, no outline, 40px right margin in the sidebar. Ours adds a reset of the browser's border, padding and font, which the reference gets from a reset this app does not load, and a 44px minimum row height on touch. The e2e's first narrow run caught that row at 29px without it.
- **Gate:** all six steps green in one hand-run of `tools/gate/run.sh` (unit 254 app tests, integration 34, e2e 90 at both widths). An earlier unit run hit the model server's known `/health` flake (BUG_012, open), which passed on the next two runs; this story does not touch the model server.
- **Found on the way:** the owner reported the row's Chat Menu being cut off by the sidebar's list (Delete hidden until scrolled). With Rename the menu is taller, so it is filed as its own bug and fixed next. Separately, `tools/gate/run.sh integration e2e` reported "all requested steps green" without running either: it ignores step names it does not know.
