# STORY_031 — Every image sent from a chat stays in that chat, and the chat reopens whole

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-10-17, ahead of EPIC_006's recon: "really want to get this done now and we get to more changes once the qwen recon comes in")
**Status:** Done 2026-10-17. Approved by the owner that day ("Please proceed."), started while STORY_028 waits on the owner's Mac-side steps, as STORY_030 was. The open questions took the draft's answers: Delete on each card, chats ordered by their newest turn, and Regenerate adds a turn
**Created:** 2026-10-17

As the owner, I want every image I ask for from an open chat (a new prompt, Regenerate, Same seed again, an edit) to stay in that chat as its next turn, with the sidebar listing the chat once and the whole chat coming back when I reload it or reopen it, so that a run of related images reads as one conversation instead of scattering into separate entries.

## Current state

Read on 2026-10-17:

- **On a generation page, a send already stacks there, but only for the visit.** `GenerationPage.tsx` keeps a list of job ids, the URL's job and then every job sent from the page (STORY_025), and appends to it through `ComposerHost`'s `onCreated`. Its own comment says it: "A reload starts again from the URL's job." Regenerate and Same seed again (`GenerationCard`'s `resend`) append the same way.
- **Nothing records that the images belong together.** A `HistoryEntry` (`app/lib/history.ts`) has no chat or thread field. `POST /api/jobs` (`app/app/api/jobs/route.ts`) records each job on its own with `historyStore().add(...)`.
- **The sidebar has a row per image.** `HistoryList.tsx` renders one row per entry, titled by its prompt (`titleOf`) and linking to `/g/<job id>`. A chat of five images is five rows, and opening any one of them shows that image alone.
- **A count of several from the home page is held only in memory.** `rememberBatch` and `recallBatch` (`app/lib/pending.ts`) keep the later ids under the first's id for the page the send moves to, and are lost on reload.
- **Delete is per image, and only in the sidebar row's Chat Menu** (`HistoryList`'s `RowMenu`, calling `DELETE /api/history/:id`, which refuses a running job with `409 not_finished`). A generation's own page has no Delete.
- **My Library** (`app/components/library/Library.tsx`) links each tile to `/g/<job id>`.
- **Edit** on a result (`onEdit`) puts the image into the composer as a reference, so the next send is an edit, sent from the same page.
- **What the reference does, from the 2026-09-26 capture** ([interactions.md](../recon/2026-09-26/interactions.md), lines 9–11, 42 and 56): a generation is a turn in a chat at `/c/<id>`; the URL goes `/` → `/c/new-chat` → `/c/<id>`; the chat is auto-titled in the sidebar; after a result the composer returns to chat mode. That capture holds single-turn chats only. **How the reference titles and orders a chat with several turns, and what a second image request looks like inside one, is exactly what EPIC_006's recon (STORY_028) will capture.** This story is built before it at the owner's request, so its rules for those points are provisional and listed under Departures.

## UI Mockup

**Reference capture:** [states/job-done@1437.json](../recon/2026-09-26/states/job-done@1437.json) and [states/job-done@393.json](../recon/2026-09-26/states/job-done@393.json): one user bubble, then the reply holding the image, the composer pinned below. This story repeats that pair once per turn, using the markup the page already renders (`.qwen-chat-message` cards in `.clone-chat-scroll`). It changes no measured value: no colours, sizes, radii or spacing.

**Desktop (1437).** One sidebar row for the chat, titled by its first prompt. The page shows every turn, oldest at the top:

```
┌────────────────────┬──────────────────────────────────────────────────┐
│ + New image        │                                                  │
│ ▣ My Library       │                     ┌──────────────────────────┐ │
│                    │                     │ a red bicycle against…   │ │  turn 1
│ Today              │                     └──────────────────────────┘ │
│ ▌A red bicycle… …  │   [ image 1 ]                                    │
│  Portrait in a g…  │   ✎ ⤓ ↻ ⓘ 🗑                                     │
│                    │                     ┌──────────────────────────┐ │
│                    │                     │ make the bicycle blue    │ │  turn 2 (an edit of 1)
│                    │                     └──────────────────────────┘ │
│                    │   [ image 2 ]                                    │
│                    │   ✎ ⤓ ↻ ⓘ 🗑                                     │
│                    │                     ┌──────────────────────────┐ │
│                    │                     │ make the bicycle blue    │ │  turn 3 (Regenerate on 2)
│                    │                     └──────────────────────────┘ │
│                    │   [ generating… 40% ]                  [ Stop ]  │
│                    │ ┌──────────────────────────────────────────────┐ │
│                    │ │ Ask Qwen                                     │ │
│                    │ │ [+] [▣ Create Image ×] [Model ▾] [16:9 ▾] …  │ │
│                    │ └──────────────────────────────────────────────┘ │
└────────────────────┴──────────────────────────────────────────────────┘
```

- **The row** stays "A red bicycle…" (the first turn's prompt) however many turns follow, and is highlighted while any turn of the chat is open.
- **Turn 3** is Regenerate on turn 2: a new turn at the bottom, never a replacement of turn 2 in place.
- **🗑 Delete** is new in each finished card's action row (beside Info), asks first, and removes that one image from the chat.

**Reloaded, or reopened from the sidebar:** exactly the same page, every turn in order, each finished image loaded and a running one still polling. The page opens scrolled to the newest turn.

**Opened from My Library:** the chat holding that image, scrolled to that image's turn, which is briefly outlined (the existing focus ring), so it is clear which one was picked.

**Narrow (iPhone 13).** The same turns stacked full width. The drawer shows one row per chat. The action row keeps its 44 × 44 touch areas, Delete included:

```
┌──────────────────────────────────────┐
│ ☰  Qwen-Image 2.1                    │
│              ┌──────────────────────┐│
│              │ a red bicycle again… ││
│              └──────────────────────┘│
│ [ image 1                          ] │
│ ✎  ⤓  ↻  ⓘ  🗑                        │
│              ┌──────────────────────┐│
│              │ make the bicycle blue││
│              └──────────────────────┘│
│ [ image 2                          ] │
│ ✎  ⤓  ↻  ⓘ  🗑                        │
│ ┌──────────────────────────────────┐ │
│ │ Ask Qwen                    [×1] │ │
│ │ [+] [▣ ×] [Model 2.1▾] [16:9▾] 🧰 (➤)│
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Deleting the last image of a chat** removes the chat's row and goes home, as deleting the open generation does today.

## Departures from the reference

- **The URL stays `/g/<id>`,** where the id is the chat's first job's id. The reference uses `/c/<id>`. Links saved before this story keep working, because each old image becomes a chat of one under its own id.
- **There is no chat model:** a turn is an image job, as the MVP already decided (interactions.md, the departures table). A follow-up sent in the composer is a new image, never prose.
- **Provisional until STORY_028's recon:**
  - the chat's title is its first prompt (the reference auto-titles; how is unknown);
  - the sidebar orders chats by their newest turn, not by when the chat began;
  - Regenerate adds a turn instead of replacing the image in place;
  - a second image in a chat is asked for exactly as the first was, in image mode, with no special control.

  When the recon lands, each of these is either confirmed or filed as a bug against the capture, as CLAUDE.md §3b says for visual mismatches.
- **Delete on the card is ours.** The reference's per-result More actions offers Delete for the reply; ours sits in the action row because there is no More actions menu yet.

## Acceptance Criteria

**A chat is recorded**

- [x] 1. **Every history entry belongs to a chat:** `HistoryEntry` gains `chatId`. An entry saved before this story reads `chatId` as its own `id`, so every old image is a chat of one.
- [x] 2. **A send from the home page starts a chat.** Its first job's id is the chat's id, and every job of the same send (a count above 1) joins it. This replaces `rememberBatch` and `recallBatch`, which are removed.
- [x] 3. **A send from a generation page joins that page's chat:** a new prompt, an edit (after Edit put a result into the composer), Regenerate and Same seed again all add a turn to the chat shown.
- [x] 4. **The chat travels with the create, not to the model server.** `POST /api/jobs` accepts an optional `chat` field (JSON or multipart), records it as the new entry's `chatId`, and removes it before forwarding, so the job API contract and both servers are unchanged. A `chat` that names no chat in history is ignored, and the job starts its own chat. Recording still happens before the browser hears back (CLAUDE.md §4c).

**The page and the sidebar**

- [x] 5. **`/g/<id>` shows the whole chat.** It lists every entry whose `chatId` is the URL's id, oldest first, then the turns this visit adds. A reload, or reopening from the sidebar, shows exactly the same turns in the same order. A finished image loads; a turn still queued or running polls, and keeps Stop.
- [x] 6. **An old link to a later turn still works.** `/g/<id>` for a job that is not the first of its chat opens that job's chat, scrolled to that job's turn, so a link saved before this story, or a later turn's id, never shows a partial chat.
- [x] 7. **The sidebar lists one row per chat,** titled by the chat's first prompt, under the day of its newest turn, newest first. The row links to `/g/<chat id>`, and is highlighted while any turn of that chat is open. "All images" and the day labels are otherwise unchanged.
- [x] 8. **The row's Chat Menu acts on the whole chat:** Stop stops every turn still queued or running; Delete asks "Delete this chat and its N images? This cannot be undone.", removes every image in it, and goes home when the chat was open. Delete is refused, as today, while any turn runs.
- [x] 9. **Each finished card has Delete** in its action row (after Info), asking "Delete this image? This cannot be undone." It removes that one image; the rest of the chat stays. Deleting the chat's first image keeps the chat under its id, so its URL and row stay; the row's title becomes the next turn's prompt. Deleting the last image removes the row and goes home.
- [x] 10. **My Library opens the chat at the image:** each tile links to `/g/<chat id>#<job id>`, and the page scrolls that turn into view and outlines it until the next click or key. Download is unchanged.
- [x] 11. **The page opens at the newest turn,** and a turn added by a send scrolls into view, as today. A result loading higher up never moves the page.

**Unchanged**

- [x] 12. **Nothing else changes:**
  - one image's own behaviour (polling, Stop, the result, Edit, Download, Regenerate, Same seed again, Info);
  - the composer and its options;
  - the job API contract and both servers;
  - a home-page send still lands on the new chat's page.

## Technical Notes

- **History** (`app/lib/history.ts`): `chatId` on `HistoryEntry` and `NewEntry`; `parseEntries` defaults it to `id`. New pure functions: `chatsOf(entries)`, which returns one summary per chat (id, title from the first turn's prompt, newest `createdAt`, turn count, whether any turn runs), newest first; `turnsOf(entries, chatId)`, which returns the chat's entries oldest first; `chatIdOf(entries, jobId)`; and `removeChat(entries, chatId)`, which refuses when any turn runs.
- **Routes:** `POST /api/jobs` strips and records `chat`. `DELETE /api/history/:id` is unchanged (one image). A new `DELETE /api/chats/:id` removes a chat, answering `409 not_finished` while any turn runs. `GET /api/history` entries now carry `chatId`, so the sidebar and the page derive everything from it; no other route is needed.
- **Client:** `useSubmit` gains the chat to join (`GenerationPage` passes its chat id; the home page passes none). `submit.ts` adds `chat` to the JSON body or the form.
- **The page:** `GenerationPage` takes its initial ids from history (`turnsOf`) rather than `[id, ...recallBatch(id)]`. When the URL's id is a later turn, it resolves the chat with `chatIdOf` and scrolls to the turn. It still appends the visit's sends at once, without waiting for history (send first, paint second). The decide-once scroll stays in a ref (§6b).
- **Cards are keyed by job id,** as today, so a card never remounts when history refreshes around it.
- **README:** Features describes chats (one row per chat, every send from a chat joins it, Delete on the card) and the provisional rules.

## Testing Plan

**Unit** (Vitest; jsdom for components):

- `app/lib/history.test.ts` (extended):
  - An old entry reads `chatId` = its `id`.
  - `chatsOf` gives one summary per chat, titled by the first turn, ordered by newest turn, with the right count and running flag.
  - `turnsOf` gives a chat's turns oldest first, entries of the same millisecond in the order they were added (BUG_005's rule).
  - `chatIdOf` resolves a later turn to its chat.
  - `removeChat` removes every turn, and refuses while one runs.
  - Removing a chat's first image keeps its other turns and their `chatId`.
- `app/lib/history-view.test.ts` (extended): rows per chat grouped by the newest turn's day.
- `app/lib/submit.test.ts` (extended): `chat` is sent in JSON and in the form when given, and absent when not.
- `app/components/shell/HistoryList.test.tsx` (extended): one row per chat; the row is active for any of its turns; Delete's confirmation names the image count; Stop on a chat with a running turn.
- `app/components/generation/GenerationPage.test.tsx` (extended, inside `StrictMode`, with fake timers): it renders a chat's turns from history in order; a send appends a turn at once, before history refreshes; a later turn's URL resolves to the chat and scrolls to that turn exactly once (the decide-once ref survives StrictMode's double mount); the per-card Delete asks, then calls the route.

**Integration** (`app/test/integration/jobs.test.ts`, extended, against the stub):

- A create with `chat` naming an existing chat records that `chatId`. The stub's `received` request has **no** `chat` field, in JSON and in multipart: the contract is untouched.
- A create naming an unknown chat starts its own chat.
- A home-style create with no `chat` starts a chat under its own id.
- `DELETE /api/chats/:id` removes every turn, and answers `409 not_finished` while one runs, until it is cancelled.
- `GET /api/history` carries `chatId` on every entry, and an entry written before this story (a fixture history file) reads as a chat of one.

**E2E** (Playwright against the production build and the stub; both projects unless noted):

1. **A chat keeps its turns** (new, `app/e2e/chat.spec.ts`). Stub script `done-after-1-poll` for every create. From home, send "a red bicycle against a brick wall", registering `waitForResponse` for status `done` before the click. On its page, send "make the bicycle blue" the same way. Then click Regenerate on the second card and wait for its `done`. Expect three cards, in that order, each image loaded (`expectImageLoaded`). Expect one sidebar row, titled by the first prompt. Expect the stub's `received` for the second and third jobs to carry no `chat` field.
2. **The same spec, reload.** Reload: the same three cards in the same order, the page at the newest. Go home, reopen the chat from its row: the same three.
3. **A new chat from home.** From home, send a third prompt: a second sidebar row appears above the first, and the first chat still opens whole.
4. **My Library.** Open My Library, click the first chat's second image: its chat opens with that card in view and outlined.
5. **Delete.** Delete the second card from its action row (confirm): two cards remain and the row stays. Delete the chat from its row's Chat Menu (confirm): its row goes and the page goes home. Every job reached a terminal state before the test ends.
6. **Narrow only:** the card's Delete has a 44 × 44 touch area, and the action row still fits the card.

**Existing specs that change, because they assert the per-image sidebar this story replaces** (CLAUDE.md §4c: each is read first to separate an implementation detail from a behaviour the owner can see):
- `history.spec.ts` "two generations are listed newest first…": two sends from home are still two rows (two chats), so it should stay as written. It is checked, not edited, unless it sends the second from the first's page.
- `history.spec.ts` "deleting the open generation…": its single-image chat now deletes as a chat; the wording of the confirmation changes.
- `queue.spec.ts` "three prompts sent in a row stack on the first one's page…": unchanged in what it shows, and now also true after a reload. It gains that one assertion.
- `queue.spec.ts` "leaving the page stops nothing…": the sidebar shows the chat once, not each job.

**Specs that must stay green unchanged, covering AC 12:** `generate.spec.ts` (one image's lifecycle, Info, Same seed again), `image-mode.spec.ts`, `references.spec.ts`, `settings.spec.ts`, `home.spec.ts`, `smoke.spec.ts`, and the rest of `queue.spec.ts`.

**Manual verification on the Spark** (not a gate): on http://localhost:3100 with the real model, one chat of three turns survives a reload, and the owner's existing history shows each old image as its own row, as before.

## Estimated Complexity

M–L. Most of it is the history model (one new field and four pure functions) and the page reading from it. Delete on the card and the chat-wide Chat Menu are the new UI. No server or contract change.

## Open questions for the owner (answered 2026-10-17 by approval, with the draft's answers)

1. **Delete on each card** (AC 9): wanted, or should deleting a single image wait for the recon to show where the reference puts it?
2. **Sidebar order by the newest turn** (a chat you just added to jumps to the top): right, or keep chats in the order they were started?
3. **Regenerate adds a turn** at the bottom: right for now, or should it replace the image in place (which the recon may show the reference does)?

## Done note (2026-10-17)

- **Gate:** all six steps green, run by hand through `tools/gate/run.sh` (typecheck, lint, unit, integration, build with the production image, e2e: 84 passed, 14 skipped by design), then again on the pre-push hook.
- **Built as specified, with these choices:**
  - The chat helpers that only the browser uses (`chatsOf`, `turnsOf`, `chatIdOf`, `ChatSummary`) live in `app/lib/history-view.ts`, beside the other display helpers; `removeChat` stays in `app/lib/history.ts` with the store and the route. The first gate run failed the integration coverage floor (statements 85.51% against 89%), because the browser-only helpers sat in a file the integration lane measures and no route reaches them. Moving them to where they belong closed it; no threshold changed.
  - `POST /api/jobs` resolves the chat a create names from either the chat's id or one of its turns' ids, so a page opened at a later turn joins the right chat even before it has read history (Technical Notes said only the chat's id).
  - The page scrolls once the target turn's card has drawn: a card renders nothing until its job's status arrives, so the page watches for the card (a `MutationObserver`) instead of scrolling when history loads. The jsdom test caught this.
  - The outline for a turn opened from My Library is a 2 px `--text-link` outline: the app has no focus ring of its own to reuse, which the mockup assumed.
  - The stub now records the names of the fields each create carried (`fields` in `/__stub/jobs/<id>/received`), so the integration and e2e tests can prove `chat` never reaches the generation server. Its parsed `request` could not show an unknown field.
- **Tests that changed, and why** (CLAUDE.md §4c): `pending.test.ts` lost the batch case with the mechanism it tested (the in-memory batch handoff, replaced by chats). `history.spec.ts`'s Library case expects the `#<turn>` URL, and its delete case the chat's question and route. `queue.spec.ts`'s "leaving the page" case checks the sidebar's rows for one chat instead of a row per image, and both stacking cases gained a reload. `generate.spec.ts`'s STORY_024 Info case reads the first image's card, because its reload now correctly shows the whole chat. Each asserted the per-image behaviour this story replaced; none lost the behaviour it protects.
- **Departures:** as listed above, four of them provisional until STORY_028's recon.
- **A full-suite-only failure on the first push:** `generate.spec.ts` "an edit sends the attached image…" (desktop) timed out with Send still disabled, its typed text not registered, before any code this story changed runs. The same commit had passed it in the hand-run gate, and it passed 10 of 10 run alone (`--repeat-each 10`) and again in the second push's full gate. It is recorded here; if it recurs it gets a bug ticket with this evidence.
- **Deployed and checked on the Spark, 2026-10-17:** the app was rebuilt with no qwen job running. `/api/history` returns all 274 existing images, each with a `chatId` equal to its own id (274 chats of one, nothing merged or lost). The live sidebar lists 274 rows, and opening one shows its one image with the new Delete. The real-model check in the Testing Plan (a chat of three turns surviving a reload) is the owner's to run, since it spends three generations on the Spark.
