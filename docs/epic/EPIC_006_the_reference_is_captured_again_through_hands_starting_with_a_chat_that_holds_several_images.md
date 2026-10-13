# EPIC_006 — The reference is captured again, through Hands, starting with a chat that holds several images

**Status:** Approved by the owner on 2026-10-13 ("This looks good please proceed with creating the stories"). The three stories are drafted (2026-10-13) and await the owner's review; no code is written until each is approved, one at a time.
**Created:** 2026-10-13, from the owner's request that day: "every time I create a new image request within the same thread it creates a new chat"; "do another pass on the Qwen website so we can do a better job of copying how they do things"; "use the Hands project to drive and capture what you need".

## Goal

A second, dated capture of chat.qwen.ai's image generation surface in `docs/recon/<date>/`, driven through **Hands** in the owner's own signed-in Safari, that answers the one question the first capture could not: **what a chat looks like and does once it holds more than one image**, at desktop and phone widths. With it, the clone story that makes our page a chat can say "match capture X" instead of guessing, and the states the 2026-09-26 pass left blank that cost no generation are filled in on the way.

It supersedes [CHORE_007](../chore/CHORE_007_a_chat_with_several_image_turns_is_captured_through_hands.md) (drafted 2026-10-09, never approved): the same capture, grown from one chore into an epic because it needs a client, a run and a curation step, each with its own tests, and because the owner widened it to "copy how they do things" beyond the one chat.

## Why now: what ours does, what theirs does, and what nobody knows

**Ours, read from the code on 2026-10-13** ([CLAUDE.md §3 item 8](../../CLAUDE.md#3-how-features-are-built-important)):

- A send from the home page creates the job(s) and moves to `/g/<first id>` (`app/components/composer/ComposerHost.tsx`, `useSubmit`). A send from a generation page appends cards to that page without changing the URL (STORY_025).
- **Every image is its own history entry and its own sidebar row.** `HistoryEntry` (`app/lib/history.ts`) has no field that groups images, the job contract (`docs/contracts/job-api.md`) has no notion of a chat, and `HistoryList.tsx` renders "a row per generation titled by its prompt". So the second image sent from a page gets a second row in the sidebar, and opening either row shows one image.
- **A reload keeps one image.** `GenerationPage.tsx`: "A reload starts again from the URL's job." STORY_025 deferred the rest on purpose: "Keeping a batch together across a reload would need history to record batches."

That is the behaviour the owner noticed. It is not a bug against STORY_025, which was built without a capture of a multi-turn chat and said so (its Done note measured the gap between cards from the owner's screenshot "because the 2026-09-26 capture has no two-turn chat"). The fix is new behaviour, so it is a story, and that story cannot be written until this epic has captured what it must match.

**Theirs, from the 2026-09-26 capture** ([interactions.md](../recon/2026-09-26/interactions.md), [capture-notes.md](../recon/2026-09-26/capture-notes.md)):

- A generation is a **chat turn**. The URL goes `/` → `/c/new-chat` → `/c/<id>`, the chat is auto-titled in the sidebar, and the sidebar row **is the chat**, with a menu of Pin, Rename, Clone, Archive, Share, Select, Download, Move to Project, Delete and Report Content.
- **After a result the composer returns to chat mode**: a `Fast` selector and no `Create Image` pill.

**What nobody knows,** because the first pass captured single-turn chats only ([coverage.md](../recon/2026-09-26/coverage.md)):

1. How a **second image is asked for inside the same chat**. Does the user re-enter `Create Image` from the "+" menu, or just type, leaving the chat model to call the image tool? Does the composer remember image mode between turns?
2. Whether a plain follow-up ("now make him wear a hat") **edits the previous image** or starts fresh. The reference has a chat model with the conversation as context; ours has none ([CLAUDE.md §1](../../CLAUDE.md#1-project-overview)). The clone has to decide what a follow-up means, and it should decide knowing what the reference does.
3. What a chat with several turns **looks like**: the gap between turns, where the page scrolls on reopen, whether a scroll-to-bottom control exists, whether the sidebar row's title changes with later turns, what My Library shows for one chat with three images, and what a reload restores.
4. What **New Chat** does from inside a chat, and whether **Regenerate** on an earlier turn replaces that image or adds a turn.

Plus the states the first pass left blank that cost no generation: every image-mode state at phone width (the "+" menu, image mode, the ratio control, which may be a bottom sheet, a typed prompt, an attached reference), **where Download lives on touch** (our Download-in-the-action-row is a departure made on a guess), the full-screen image view, upload progress, and the chat row's Rename and Pin.

## What Hands is, and what it can and cannot capture

Verified on 2026-10-13 from the Spark unless stated. Hands is the owner's own tool, `kevinbrowncodes/hands`: a web app that drives a Mac the way a person does, through the macOS Accessibility API and the keyboard, with no browser automation flag, no Playwright and no CDP. That is the least likely of our options to be challenged by the reference's anti-bot stack, and it uses a browser the owner is already signed in to.

| Fact | Verified how |
| --- | --- |
| Deployed at `http://hands.local/` (192.168.1.30), version **1.16.2**, template v1.50.0, commit `f85c70a`, `/health` ok, no job running, not held | `curl http://hands.local/health` from the Spark, 2026-10-13 |
| `/api/*` needs `Authorization: Bearer <API_TOKEN>`; `/health` does not | Hands' README and routes |
| **The token is not on the Spark** (no `HANDS_API_TOKEN` in `~/.zshenv`, no `.env` entry) | checked for presence only; nothing printed |
| The Mac it works is the **Mac Studio 2022** (macOS 26.5.2, 1920 × 1080 at 2×), granted Accessibility and Screen Recording 2026-10-06, **Safari** (no Chrome installed there) | Hands' `docs/ARCHITECTURE.md`, measured section |
| `POST /api/hand/look` → the screen as a PNG, plus every visible element numbered with role, title, value, frame and actions; the app keeps the picture and a marked copy and serves both by URL | Hands' `app/routes/hand.py`, `app/services/hand.py` |
| `POST /api/hand/act` → one of `press`, `set`, `increment`, `decrement`, `scroll`, `focus`, `type`, `key`, `open` (an app, with a URL), `wait` (for a role/title, **at most 30 s**), `fill` (the front window to the screen); each answers with the look after it. **No mouse exists** | `native/hand/server.py` contract |
| **Hands keeps only the newest 50 looks**; older pictures are deleted | `KEEP = 50` in `app/services/hand.py` |
| Routines: a named list of steps by role, title and nth, replayed as a job with no model (`POST /api/routines`, `/api/routines/{slug}/run`), a picture after every step | Hands STORY_004 |
| **Added 2026-10-13, Hands STORY_007:** a `js` act, `{"do": "js", "text": "<expression>"}`, runs a JavaScript expression in Safari's current tab through Safari's own Apple Events scripting and answers with the result as text beside the look; its code is pushed, its rollout on the Mac (the hand reinstalled, Safari › Develop › "Allow JavaScript from Apple Events", the Automation grant) waits for the owner | Hands' `docs/story/STORY_007_…`, `native/hand/server.py` after the push |
| Tasks (`POST /api/tasks`: Claude Code on the Mac drives the hand with the `hands-task` skill) **cannot run today**: `/health` reports `skills.source: none`, which Hands' code says means no Skills gateway token is configured, and a task fails at once when the skill is unreadable | `/health` today; `app/skills.py` and `app/services/tasks.py` in the Spark's checkout (`60495ad`, older than the deployed commit, so the field's meaning is read from older code) |

**So the epic drives Hands directly, look by look, from the Spark.** The assistant reads each picture and element list before the next act, which is what recon needs: a judgment at every step and a clean stop on a challenge. A Hands *task* is not needed and is not available. The sequence that spends no generation is saved as a Hands routine at the end, so a later date can replay it with no model.

**What Hands cannot give, and what stands in:**

- **Not the DOM, not computed styles, not the network, from a look alone.** A look is pixels and accessibility frames. **Revised 2026-10-13:** Hands' STORY_007 adds a `js` act (above), so each state can also be read as rendered markup, computed styles in CSS px, the URL and the resource paths, as the 2026-09-26 extension read them. STORY_028 names the expressions and STORY_029 files what they return through the existing snapshot cleaner and identity guard. Until the act is proven on the Mac, the plan below stands on pictures and frames alone, and the sentences that follow describe that fallback. Every measurement this epic files is a frame in screen points (the look carries `scale`), marked as such. The 2026-09-26 capture stays the source for CSS tokens, markup and class names; a multi-turn chat is the same message markup repeated, and this epic says where that assumption fails rather than inventing a style. If a style question remains that the 2026-09-26 snapshot cannot answer, there is a candidate story for the rendered markup (Open question 4); it is not in the plan until the owner wants it.
- **A different width.** Safari filled to the Mac Studio 2022's display is up to 1920 CSS px wide, against 1437 on 2026-09-26. The notes state the width of every reading. The phone width is Safari's Responsive Design Mode with the iPhone preset (393 wide, as before), which needs Safari's Develop menu on (owner step 3).
- **A generation outlasts one wait.** The reference took 33–40 s per image; `wait` is capped at 30 s, so the client waits twice, or looks again, and never sleeps blind.
- **Hands fills the screen with Safari and owns the keyboard while it works.** The Mac is left alone for the run.

## Scope

**In:** the image generation surface of chat.qwen.ai, as [README.md → MVP Scope](../../README.md#mvp-scope) defines it, with the chat that holds several image turns at its centre: the chat page with two or more image turns, scrolled to the top and the bottom; the composer between turns; a second image asked for inside the chat; the sidebar row, its menu, Rename and Pin; New Chat from inside a chat; a reload of the chat; My Library for that chat; the full-screen image view and where Download sits on touch; the phone-width image-mode states the first pass missed. Both widths.

**Out:** everything else the reference does (chat as a product, video, voice, artifacts, deep research, projects, community, publishing, sharing, billing). The reference's chat model answering in prose is captured only where it is part of an image turn (the line "I'll use the image_edit tool"), never studied. Nothing is built in this epic: no change to `app/`, the contract, the stub or the model server. The clone story comes after ([What comes after](#what-comes-after)).

## Stories (in implementation order)

Each is drafted in full, one at a time, after the owner approves this epic, and approved before its code ([CLAUDE.md §3](../../CLAUDE.md#3-how-features-are-built-important)). Numbers follow the order they ship. STORY_026's frozen note reserved 027 for the chat story; since these three ship first, they take 027 to 029 and the chat story takes the next free number when it is drafted from the capture ([CLAUDE.md §6 rule 3](../../CLAUDE.md#6-key-rules)).

| # | Story | Status |
| --- | --- | --- |
| 027 | [Hands is reachable from the Spark, and every look it takes is filed on the Spark](../story/STORY_027_hands_is_reachable_from_the_spark_and_every_look_it_takes_is_filed.md) | Drafted 2026-10-13, awaiting approval |
| 028 | [A chat with several image turns is captured through Hands, at desktop and phone widths](../story/STORY_028_a_chat_with_several_image_turns_is_captured_through_hands_at_both_widths.md) | Drafted 2026-10-13, awaiting approval |
| 029 | [The capture is filed as a dated spec, and the gaps between the reference and our app are written down](../story/STORY_029_the_capture_is_filed_as_a_dated_spec_and_the_gaps_are_written_down.md) | Drafted 2026-10-13, awaiting approval |

### STORY_027, in outline: the client

- **`recon/src/hands.ts`** (new): a thin client for `POST /api/hand/look` and `POST /api/hand/act`. It reads `HANDS_URL` (default `http://hands.local`) and `HANDS_API_TOKEN` from the repo's gitignored `.env`, the way CHORE_005 keeps the Civitai key: mounted read-only into the recon container, parsed by one tested function, never passed through the shell, never printed. It reports only "Hands token: found in .env" or "none", and stops on none.
- **A preflight**: `GET /api/hand` for the hand's grants, display and front app, and one look at Safari. It stops with the sentence to act on when a grant is missing, Safari is not running, or the look shows chat.qwen.ai signed out or challenged.
- **Every look is saved at once** to `recon/out/<date>/hands/<step>-<state>.{json,png,marked.png}` (gitignored), because Hands forgets looks beyond the newest 50. The JSON is the elements with their frames, `scale`, `frontmost` and `focused`; the act that produced the look is logged beside it in `acts.jsonl` with its text reduced to a length, as Hands itself stores it.
- **`recon/run.sh hands DATE`** runs it in the existing recon container (CHORE_001); nothing is installed on the Spark. `recon/compose.yaml` mounts `.env` read-only. The `offline.test.ts` guard keeps covering the curate, harvest and interactions scripts; `hands.ts` is online by design, to Hands only, never to the reference.
- **Tests, unit** (`recon/src/hands.test.ts`, run by `recon/run.sh test`, with a fake `fetch`): the bearer header is sent and never written to disk; a missing token stops with the verdict and nothing else; a look's three files land under the step's name; a `wait` longer than 30 s is split into waits that are each within the cap; a 401, 503 and 409 from Hands each surface as the sentence Hands gave. **Integration: N/A**, the only external service is Hands on the Mac, and a test that needs another machine is not a test ([CLAUDE.md §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)). **E2E: N/A**, the app does not change. **Manual:** the preflight and one smoke look against the real Hands, with the picture opened to confirm Safari and the signed-in home.

### STORY_028, in outline: the capture

- **Before the run,** the owner sets the generation count (Open question 1) and confirms steps 1 to 4 below are done. The assistant checks `/health` and the preflight that session, never from memory.
- **The run,** at a person's pace, the Mac left alone, each look read before the next act, in three parts. States are named by surface and state, as in 2026-09-26 (`chat-two-turns-top@1920`, `chat-two-turns-bottom@393`, and so on).
  - **Part A, the chat that already has several image turns (0 generations).** Open the owner's "Image of a Man" chat from the sidebar. Read: the page at the top, the page at the bottom, the composer as the chat leaves it (chat mode or image mode), the address bar's URL (`cmd+l`, then `escape`), the sidebar row selected and not, its "…" menu open, Rename (then cancelled), Pin and unpin, the scroll position after a reload and that every turn comes back, My Library for that chat, the full-screen view of one image and the controls in it, New Chat from inside the chat (what the URL and the composer become), then the same chat reopened at phone width in Responsive Design Mode: the page top and bottom, the drawer, the row menu, the image's action row and where Download is.
  - **Part B, the phone-width states the first pass missed (0 generations).** On the home page in Responsive Design Mode: the "+" menu, image mode entered, the ratio control open (a dropdown or a bottom sheet), a prompt typed and cleared, a reference attached through the macOS open panel (`cmd+shift+g` with the fixture image's path) and removed, with any upload progress read while it is on screen. Each at 393 wide.
  - **Part C, the generations the owner approves (N, recommended 2).** In the same chat, at desktop width: **(1)** re-enter `Create Image` from the "+" menu and send a short prompt; read the composer before send, the page as it is sent, generating (looked at every 10 s), done, the sidebar row after (title unchanged or not), and the URL (unchanged or not). **(2)** send a plain follow-up in chat mode that asks for a change to the last image, and read the same states, to see whether the reply is an edit of the previous image, a new image, or prose. A third, only if the owner approves it: Regenerate on the earlier turn, to see whether it replaces in place or adds a turn.
- **Stop rules** ([CLAUDE.md §3e](../../CLAUDE.md#3e-how-recon-is-recorded), [§4c](../../CLAUDE.md#4c-lessons-carried-over)): a captcha, a verification page, "unusual activity", a quota or limit message, or a signed-out page ends the run; the state is filed as its own artefact with its exact wording, and the owner is told. No workaround, no retry.
- **The routine.** When the run is done, Parts A and B are written as a Hands routine, "qwen recon: multi-turn chat", through `POST /api/routines`, steps by role and title, so the reference can be re-read on a later date with no model. Part C is never in it: a routine must not spend a generation.
- **Tests: unit** for the step list's shape (every state named once, every Part C step guarded by the count); **integration and E2E: N/A** (no app change). **Manual:** the run itself is the deliverable, with its log. `git status --short` shows nothing under `recon/out/` before any commit.

### STORY_029, in outline: the spec and the gaps

- **`recon/src/hands-curate.ts`** (new) and **`recon/run.sh hands-curate DATE`**, offline, reading `recon/out/<date>/hands/` and writing `docs/recon/<date>/`:
  - **Readings**, one JSON per state: role, title, frame and `scale`, with the account's name and avatar masked by the existing `identity-guard.ts` (it reads the owner's name from the 2026-09-26 saved page; the email the user button shows is added as a second needle, read from the look, never typed into code).
  - **Pictures**, one per state, with **every generated image blacked out** (the `AXImage` frames inside the chat column, the sidebar's My Library strip and the library grid), the user button's row blacked out, and every sidebar row other than the studied chat's blacked out, because the sidebar lists the owner's other chats. The masks are drawn from the elements' own frames by code, and the curate step **refuses to write a picture whose masks it could not derive**. Generated images from the reference never enter git ([CLAUDE.md §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)); the assistant opens every filed picture before the commit to check it.
  - **`coverage.md`** for the date, in the 2026-09-26 format, including the states still not captured and why.
  - **`notes.md`**: the date, Hands' version and commit, the widths, the generations spent, what each reading shows, and the measured values the chat story will commit to: the gap between turns, the second turn's bubble and reply boxes, the composer's state between turns, the chat row's box and its menu items, the scroll position on reopen and the scroll-to-bottom control if one exists, the full-screen view's controls, and where Download is on touch.
  - **`interactions.md`** for the date, hand-written: how a second image is asked for inside a chat, what a plain follow-up does, what New Chat, Rename, Pin, reload and Regenerate do, each marked observed or not observed, with the "Mapping onto the clone" table extended.
  - **The owner's two screenshots** of 2026-10-09, if the owner copies them to the Spark, filed under `docs/recon/<date>/owner/` with the same masks and a line saying they are the owner's own captures. They are not on the Spark today (checked 2026-10-13).
- **The gap list**, in `notes.md` or beside it: one table, reference behaviour against ours as read from the code, each row naming the ticket it becomes: the chat story for the new behaviour, a bug ticket for each visual mismatch of a shipped surface ([CLAUDE.md §3b](../../CLAUDE.md#3b-how-bugs-are-tracked)), a backlog item for anything out of the MVP. **The chat story is drafted from this list for the owner's approval; nothing is implemented in this epic.**
- **Tests, unit** (`recon/src/hands-curate.test.ts`, over a hand-written fixture look with no real identity in it): the name and the email are masked in the reading; a black box is derived for each generated image and for the user row and the other chat rows, and none for icons; a picture with an underivable mask is refused; a reading the identity guard still flags is refused. **Integration and E2E: N/A** (no app change). **Manual:** every filed picture opened and checked; `git status --short` clean of `recon/out/`.

## The owner's steps

1. **Put Hands' API token on the Spark** as `HANDS_API_TOKEN=` in the repo's `.env` (gitignored, mode 600, beside `CIVITAI_TOKEN`). The value is `API_TOKEN` from Hands' `.env` on the Mac. It is never pasted into the chat, and the client checks only that it is present.
2. **Sign in to chat.qwen.ai in Safari on the Mac Studio 2022**, the Mac Hands works, and leave the session signed in. The 2026-09-26 capture was in Chrome; Safari there has never been checked. The assistant never types a credential and never sees one ([CLAUDE.md §4b](../../CLAUDE.md#4b-recon-with-playwright)).
3. **Turn on Safari's Develop menu** there (Safari › Settings › Advanced › "Show features for web developers"), so Responsive Design Mode can be entered from the keyboard for the phone-width readings. If the hand cannot pick the iPhone preset by itself, the owner picks it once; Safari remembers it.
4. **Set the generation count** (Open question 1) and, for the run, **leave the Mac Studio 2022 alone** for about 30 to 45 minutes: Hands fills the screen with Safari and types into it.
5. Optionally, **copy the two "Image of a Man" screenshots** of 2026-10-09 to `recon/out/<date>/owner/` on the Spark, so STORY_029 can file them masked.

## Constraints

- **Quota.** Every generation on the reference spends the owner's account. The count is the owner's, set before the run, and `notes.md` says how many were spent. Nothing in Parts A and B spends one.
- **Read-only and polite.** Browse at a person's pace in the owner's own account only; never call an endpoint a normal session does not. A challenge ends the run.
- **No credentials through the assistant.** The owner signs in; the token is checked for presence and never printed; no cookie, HAR or password exists anywhere in this epic.
- **Raw output is not committed.** `recon/out/<date>/` is gitignored already (`.gitignore`: `recon/out/`). Only the masked, curated set under `docs/recon/<date>/` is committed, after the assistant has opened every picture. The reference's generated images and the owner's other chats never enter git.
- **Lift what renders; write what runs** still holds ([CLAUDE.md §3e](../../CLAUDE.md#3e-how-recon-is-recorded)): this epic adds readings and masked pictures; it harvests no stylesheet, because Hands cannot see one, and runs none of the reference's JavaScript.
- **Nothing is installed on the Spark or the Mac.** The client runs in the recon container. Hands is already deployed and is not changed by this epic; a Hands change it turns out to need is a ticket in the Hands repo, named here.
- **The model is untouched.** No test, story or note here depends on a generated image.

## What was verified before any story (2026-10-13)

- Hands answers from the Spark: version 1.16.2, commit `f85c70a`, template v1.50.0, no job running, not held, no Skills source (so no tasks). `hands.local` resolves to 192.168.1.30.
- `HANDS_API_TOKEN` is present nowhere on the Spark; `.env` has `CIVITAI_TOKEN` only.
- Our app's send path, history shape, sidebar rows and reload behaviour are as described under [Why now](#why-now-what-ours-does-what-theirs-does-and-what-nobody-knows), read from `ComposerHost.tsx`, `GenerationPage.tsx`, `HistoryList.tsx`, `history.ts` and `job-api.md`.
- The 2026-09-26 capture holds no chat with more than one turn, no phone-width image-mode state beyond `job-done@393` and `my-library@393`, and no answer to where Download is on touch (its `coverage.md`).
- The owner's 2026-10-09 screenshots are not on the Spark (Downloads, Desktop, Pictures and `recon/out/` searched).
- Whether Safari on the Mac Studio 2022 is signed in to chat.qwen.ai is **not** verified: it cannot be from the Spark without the token, and the preflight in STORY_027 is where it is checked.

## Definition of done

The three stories are Done; `docs/recon/<date>/` holds, dated, the masked pictures, the readings, `coverage.md`, `notes.md` with the measured values and the generation count, `interactions.md` for the chat behaviour, and the gap list; the routine "qwen recon: multi-turn chat" exists in Hands and its name is in the notes; README's "Running Recon" names the Hands commands and the `.env` variable; a reader with no access to the reference can describe, from the captures alone, what a chat with several image turns looks like at both widths, how a second image is asked for in it, and what a follow-up, a reload, New Chat, Rename and Pin do; and the chat story is drafted from the gap list and waiting for the owner's approval.

## What comes after

**The chat story**, "A page is a chat, and each new image adds a turn to it", drafted in STORY_029 from the capture, approved, then built one story at a time under EPIC_003 or a new epic. What it will most likely need, read from the code on 2026-10-13 and to be confirmed by the capture, so the owner can see the size of it:

- a chat entity in the app's own history (`HistoryEntry` gains a chat id, or a chat record holds job ids), persisted in the same local store, so a reload restores every turn;
- the page at `/c/<id>` (ours is `/g/<id>`), with the sidebar listing chats rather than images, each titled as the reference titles a chat, and My Library cards opening the chat at that image;
- the composer's behaviour between turns and the meaning of a plain follow-up, decided from Part C's readings and written under **Departures from the reference**, since ours has no chat model;
- **no change to the job contract, the stub or the model server**: a chat is a grouping the app keeps, and a turn is still one job.

**Bug tickets** for each visual mismatch the gap list finds on a shipped surface, with the reference picture and ours side by side ([CLAUDE.md §3b](../../CLAUDE.md#3b-how-bugs-are-tracked)). **Backlog items** for anything out of the MVP the capture shows ([CLAUDE.md §3c](../../CLAUDE.md#3c-how-backlog-is-tracked)).

## Open questions

1. **How many generations?** Recommended **2**: one image asked for by re-entering `Create Image` inside the existing chat, and one plain follow-up in chat mode, which is the only way to learn whether a follow-up edits the last image. A third, Regenerate on an earlier turn, if the owner wants that answered too. Nothing else in the plan spends one. The owner sets the number before STORY_028 runs.
2. **Which chat?** "Image of a Man", the chat the owner showed on 2026-10-09, unless the owner names another that already holds several image turns. Its title and its images are masked in everything committed; the readings keep the layout, not the content.
3. **Is the Mac Studio 2022 the Mac the owner sits at?** Hands is granted there only (Hands' `docs/ARCHITECTURE.md`, 2026-10-06). If it is the owner's working Mac, the run is scheduled for a time it can be left alone; if not, Safari there still has to be signed in (owner step 2).
4. ~~**The rendered markup, a candidate story, not planned.** Hands cannot read the DOM.~~ **Answered 2026-10-13:** Hands gained the `js` act (its STORY_007) instead of a Web Inspector dance; the markup, styles and URL are read through it in STORY_028 and filed in STORY_029. The rest of this question is kept for the record: Hands cannot read the DOM If STORY_029's notes leave a style question the 2026-09-26 snapshot cannot answer, one route that stays within [§3e](../../CLAUDE.md#3e-how-recon-is-recorded) is Safari's Web Inspector console, driven by keyboard: `copy(document.documentElement.outerHTML)`, pasted into TextEdit and saved, then filed through the existing `curate` step with its identity guard. It reads the owner's own page, calls no endpoint, and runs none of their code, as the 2026-09-26 extension did. It needs the Develop menu (owner step 3) and the owner's approval, and it is numbered only if approved.
5. **One line in CLAUDE.md §4b**, only with the owner's separate approval, when STORY_027 lands: recon may be driven through Hands in the owner's signed-in Safari on the Mac; it files element readings and masked pictures; DOM, stylesheet and markup harvesting still go through a saved page or the Playwright profile.
6. **Hover-only controls on desktop** (the chat row's menu, the image overlay) may be absent from the accessibility tree. Hands' STORY_009, a pointer move with no click, is drafted and waits for the owner's decision on Hands' no-mouse rule; without it those states are marked not captured if the first look shows them missing, and the 2026-09-26 DOM readings of the desktop overlays stand.
7. **CHORE_007 is marked superseded by this epic**, not deleted, with nothing of it implemented. CHORE_006 (the LoRA menu) is unrelated and still waits for the owner.
