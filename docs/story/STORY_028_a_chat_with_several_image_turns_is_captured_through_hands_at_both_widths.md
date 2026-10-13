# STORY_028 — A chat with several image turns is captured through Hands, at desktop and phone widths

**Epic:** [EPIC_006](../epic/EPIC_006_the_reference_is_captured_again_through_hands_starting_with_a_chat_that_holds_several_images.md)
**Status:** Draft (2026-10-13), awaiting the owner's approval. Not started until STORY_027 is Done
**Created:** 2026-10-13

As the owner, I want the reference's chat that already holds several images read through Hands at both widths, the phone-width states the first pass missed read too, and the generations I approve spent on the two questions nothing else can answer (how a second image is asked for inside a chat, and what a plain follow-up does), with the part that spends nothing kept as a Hands routine, so that STORY_029 has a dated raw capture to file and the chat story has something exact to match.

## Current state

Read on 2026-10-13:

- **What the 2026-09-26 capture holds** ([coverage.md](../recon/2026-09-26/coverage.md)): single-turn chats only. At 393 it has `home-signed-in`, `job-done` and `my-library`; every image-mode state at that width is marked not captured, and so is where Download lives on touch ("probably under More actions or a full-screen preview (unconfirmed)").
- **What it says about chats** ([interactions.md](../recon/2026-09-26/interactions.md)): a generation is a chat turn at `/c/<id>`; the chat is auto-titled in the sidebar; the row's `Chat Menu` ("…", hover-only on desktop, always visible on touch) offers Pin, Rename, Clone, Archive, Share, Select, Download, Move to Project, Delete and Report Content; **after a result the composer returns to chat mode** (a `Fast` selector, no `Create Image` pill); the result's `More actions` opens Read aloud, Branch in new chat and Delete.
- **STORY_027** (assumed Done before this starts) gives `recon/run.sh hands <date> preflight | look | act`, saving every look under `recon/out/<date>/hands/`.
- **Hands** (deployed 1.16.2) works the **Mac Studio 2022** in Safari: 1920 × 1080 at 2×, keyboard first, no mouse. An act on an element is `press`, `set`, `focus` or `scroll` (scroll-to-visible) by its number in the current look; `key` sends a chord; `open` opens an app at a URL; `wait` waits up to 30 s for a role and title; `fill` fills the screen with the front window. Only elements in the accessibility tree can be acted on: **a control that appears only on hover may not be in the tree**, and this story records that as "not captured: not in the accessibility tree" rather than working around it.
- **Routines** (Hands STORY_004): a step is `{"do": "open", "app", "url"}`, `{"do": "wait", "role", "title", "seconds"}`, `{"do": "press" | "set" | "focus" | "scroll", "role", "title", "nth", "text"}`, `{"do": "type", "text"}`, `{"do": "key", "key"}` or `{"do": "look"}`; `role` is equal when given, `title` a case-insensitive substring, `nth` which match (1 by default). `POST /api/routines {name, steps}` creates one; `PUT /api/routines/{slug}` replaces its steps; `POST /api/routines/{slug}/run` runs it as a job with a picture after every step. **Hands tasks are unavailable** (no Skills gateway token on the deployed app, read 2026-10-13), so a failing routine step is noted, not repaired.
- **Safari's Responsive Design Mode** needs the Develop menu on (owner step 3 in EPIC_006). Whether the hand can pick the iPhone preset inside it by `press` is unknown until tried.
- **The reference image for an attach must be on the Mac.** The stub's fixture is `tools/stub-generation-server/fixtures/reference.png` in this repo, on the Spark; Safari's file panel on the Mac Studio 2022 can only pick a file that is on that Mac.
- **The owner's two "Image of a Man" screenshots** (2026-10-09) are not on the Spark.
- **The generation count is not set.** EPIC_006 recommends 2.

## UI Mockup

N/A (no UI change; the deliverable is the raw capture under `recon/out/<date>/hands/`, the capture log and a routine). The state list below is what the capture consists of; STORY_029 turns it into the dated spec.

## Acceptance Criteria

**Before the first act, that session, never from memory:**

- [ ] `curl http://hands.local/health` and `recon/run.sh hands <date> preflight` are green: both grants true, Safari in front, "not signed out". The preflight look is opened and read: the signed-in home, with no challenge, banner or notice.
- [ ] **The owner has set N**, the generation count, and named the chat (default: "Image of a Man"). Both are the first lines of `recon/out/<date>/hands/capture-log.md`, written before any act. The owner has said whether `reference.png` is on the Mac (for Part B's attach) and that the Mac Studio 2022 will be left alone for the run.

**Conduct, for the whole run** ([CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded)):

- [ ] Every look is opened and read before the next act is chosen. Acts are the ones a person at the keyboard would make, at a person's pace; the hand already types at a person's cadence. No step calls anything but Hands.
- [ ] **Stop rules.** A captcha or verification page, a notice about unusual activity, a quota or limit message, a signed-out page, or any wording the assistant does not recognise as the product ends the run at once. The state is saved as its own step (`challenge@<w>`, `quota-wall@<w>`, `signed-out@<w>`), its exact wording is copied into the log, and the owner is told. There is no retry and no workaround that session ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over): the wording is what a later detector matches).

**Part A, the chat that already has several image turns (0 generations).** `W` is the desktop width as the web area's frame reports it (expected 1920), stated once in the log. Each state is one saved look, named as listed:

- [ ] `chat-multi-top@W`: the chat opened from its sidebar row (press the row), scrolled to the top (`key home`, or `scroll` to the first turn).
- [ ] `chat-multi-bottom@W`: scrolled to the bottom (`key end`, or `scroll` to the last turn); whether a scroll-to-bottom control is present.
- [ ] `chat-multi-composer@W`: the composer as the chat leaves it (chat mode or image mode, which pills are present).
- [ ] `chat-multi-url@W`: the address field focused with `cmd+l` so its value is the full URL, then `escape`.
- [ ] `chat-row-selected@W`: the sidebar row while its chat is open.
- [ ] `chat-row-menu-open@W`: the row's `Chat Menu` opened by `press` when it is in the tree; otherwise marked not captured with that reason.
- [ ] `chat-rename-open@W` (Rename, then `escape`, nothing changed) and `chat-pinned@W` (Pin, read, then unpin), only if the menu opened.
- [ ] `chat-multi-reloaded@W`: after `cmd+r`, a wait for the first turn, and a look: every turn back, and where the page scrolled to.
- [ ] `chat-multi-library@W`: My Library after the above (the cards this chat's images make), then back to the chat.
- [ ] `image-fullscreen@W`: one of the chat's images opened (press the image), its controls read, `escape`.
- [ ] `new-chat-from-chat@W`: New Chat pressed from inside the chat: the URL (`cmd+l`, `escape`) and the composer's mode; `chat-row-unselected@W` is the row of the studied chat in this state.
- [ ] **At 393, in Responsive Design Mode** (entered from the Develop menu by keyboard; the iPhone preset pressed if it is in the tree, else set once by the owner): the chat's URL opened again, then `chat-multi-top@393`, `chat-multi-bottom@393`, `chat-drawer-open@393`, `chat-row-menu-open@393`, `image-actions@393` (the action row under an image, and whether Download is in it), `image-more-actions-open@393` (More actions opened), `image-fullscreen@393`.

**Part B, the phone-width states the first pass missed (0 generations),** still in Responsive Design Mode, on the home page:

- [ ] `mode-menu-open@393`, `composer-image-mode@393`, `image-model-open@393`, `aspect-ratio-open@393` (a dropdown or a bottom sheet), `composer-typed@393` (a short text typed, read, then cleared with `cmd+a` and `delete`; **no `return`**).
- [ ] `composer-reference-attached@393` and `upload-progress@393` only when `reference.png` is on the Mac: Upload from the "+" menu, the open panel's `cmd+shift+g`, the path typed, `return` twice, looks every 2 s until the thumbnail settles, then Remove file. Otherwise both are marked not captured: the fixture was not on the Mac.
- [ ] Responsive Design Mode is left, and the desktop home is read once more as `home-signed-in@W`, so the run ends where it started.

**Part C, the generations the owner approved (N; nothing here runs when N is 0),** in the studied chat at desktop width, each generation followed with a look every 10 s for up to 3 minutes, after which the state is marked not captured with the reason:

- [ ] **C1, a second image asked for in image mode:** "+", `Create Image`, the prompt `a red bicycle against a brick wall` typed (the 2026-09-26 text-to-image prompt, so quota goes on a known prompt), then the composer read as `turn-next-composer-image-mode@W`; `return`; `turn-next-sent@W`; `turn-next-generating@W`; `turn-next-done@W`; the sidebar row as `turn-next-row-after@W` (is the title unchanged); the URL as `turn-next-url@W` (unchanged or not).
- [ ] **C2, a plain follow-up in chat mode,** only when N ≥ 2: with the composer as the chat left it after C1, the text `make the bicycle blue` typed, read as `follow-up-composer@W`, `return`, then `follow-up-sent@W`, `follow-up-generating@W`, `follow-up-done@W`: whether the reply is an edit of the previous image, a new image, or prose.
- [ ] **C3, Regenerate on the C1 turn,** only when N ≥ 3: `regenerate-done@W`, whether the image was replaced in place or a turn was added.
- [ ] The log records, for each generation, the step names, the time from send to done (from the looks' `taken_at`) and the count spent so far. **The count spent never exceeds N.**

**After the run:**

- [ ] **The log** `recon/out/<date>/hands/capture-log.md` holds: the date; Hands' version and commit; the Mac, display and widths; N approved and N spent; the chat studied; one line per step saying what it showed; every state not captured and why; the exact wording of any failure state; and anything Hands lacked (as a ticket to open in the Hands repo). STORY_029 copies it, masked.
- [ ] **The routine.** Parts A and B, minus the attach, are written as `recon/hands/routines/qwen-recon-multi-turn-chat.json` (committed): Hands' step shape, selectors by role and title and `nth` (never a look id or a number from a look), `look` steps where a state is read, and no `fill` (every run fills by itself). It is saved in Hands under the name **"qwen recon: multi-turn chat"** with `recon/run.sh hands <date> routine <file>` (a new subcommand: `POST /api/routines`, or `PUT /api/routines/{slug}` when the slug exists; it fills the routine's placeholder URL from `HANDS_CHAT_URL` in `.env`, which `.env.example` gains as an empty line), and the log names it. **The routine spends no generation:** it presses no element titled `Send`, sends no `return`, and `type`s nothing but Part B's cleared text, and a test says so.
- [ ] **The routine runs once through Hands** (`POST /api/routines/{slug}/run`, that day or when the owner next leaves the Mac alone) and its outcome is in the log: Done, or the step that missed and why. A missed step is noted and fixed in the file by hand; no model repairs it.
- [ ] `git status --short` shows nothing under `recon/out/`, and the only new tracked files are the routine, its test, the `routine` subcommand and this story's checkboxes.

## Technical Notes

- **Driving.** Each state is one or more `recon/run.sh hands <date> act … --as <state>@<width>` calls, with the element numbers taken from the previous look's table or marked picture. The step names above are the `--as` values; STORY_029 keys everything on them, so they are spelt exactly as listed and the log says when one was skipped.
- **Finding the chat.** The sidebar's rows are links (`AXLink`) titled by the chat's title; the studied chat is pressed by its title. Its title is masked by STORY_029 in everything committed; here it is only in the gitignored output.
- **Reading the URL.** Safari's address field shows the domain alone until focused; `cmd+l` focuses it and its value is the full URL. The `*-url@W` steps exist for that reason, and `escape` leaves the page untouched.
- **Scrolling.** `key home` and `key end` on the page, or `scroll` (Hands' AXScrollToVisible) on the first or last turn's element when the keys move focus instead.
- **Responsive Design Mode.** Entered from Safari's Develop menu, which is a menu bar item the hand can press (`AXMenuBarItem`, then `AXMenuItem`). The viewport inside it is the web area whose frame STORY_029 reads; the width asserted for those steps is 393.
- **Timing a generation.** Looks every 10 s, each one saved, give the duration to within 10 s from `taken_at`, and the generating state at several moments. The 2026-09-26 run took 33 to 40 s per image.
- **The `routine` subcommand** belongs here, not in STORY_027, because its only use is this story's routine: it reads the file, validates the steps with the same checks the test applies, and creates or replaces the routine, printing Hands' answer (the slug) and nothing else.
- **What the routine replays.** Parts A and B are deterministic as long as the studied chat exists and Safari is signed in; the routine's first step is `open` Safari at the chat's URL with its id, which is why the routine file lives in the repo only with the id replaced by a placeholder the `routine` subcommand fills from `HANDS_CHAT_URL` in `.env` at upload time. Nothing in git names the owner's chat id.
- **Quota.** Only Part C spends; its steps are listed in the order they run so a count of 1 gives C1 alone, 2 adds C2, 3 adds C3. The assistant counts in the log before each send.

## Testing Plan

- **Unit** (`recon/run.sh test`, and the root `pnpm test`):
  - `recon/src/routine-file.test.ts` over the committed `recon/hands/routines/qwen-recon-multi-turn-chat.json`: every step's `do` is one Hands accepts; every element step has a role or a title and a positive `nth` when present; no step names a look id or an element number; there is no `fill`; **no step presses an element titled `Send` or `Stop`, no `key` step is `return`, and every `type` step is followed by a clearing `cmd+a` and `delete` before any other element act**; the first step is `open` Safari with the placeholder URL; the name is "qwen recon: multi-turn chat".
  - `recon/src/hands-client.test.ts` (extended): the `routine` subcommand POSTs to `/api/routines` with the bearer header, falls back to `PUT /api/routines/{slug}` on a 409 for an existing slug, fills the placeholder from `HANDS_CHAT_URL`, refuses a file with the placeholder unfilled, and never prints the URL it filled.
  - These prove the only code this story adds: that the routine can never spend a generation or leak the chat's id.
- **Integration:** N/A. Hands is on another machine ([CLAUDE.md → §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)).
- **E2E:** N/A. The app does not change.
- **Manual (the deliverable, not a gate):** the run itself, in the order above, with every look read; the log complete; the routine saved and run once; `git status --short` clean of `recon/out/`. The owner is shown the log's generation count and the list of states not captured before STORY_029 starts.

## Estimated Complexity

M: the code is one JSON file, one subcommand and two tests; the work is 60 to 90 acts over 45 to 60 minutes of the Mac's time, read one look at a time.
