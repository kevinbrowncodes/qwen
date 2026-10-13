# STORY_029 — The capture is filed as a dated spec, and the gaps between the reference and our app are written down

**Epic:** [EPIC_006](../epic/EPIC_006_the_reference_is_captured_again_through_hands_starting_with_a_chat_that_holds_several_images.md)
**Status:** Draft (2026-10-13), awaiting the owner's approval. Not started until STORY_028's run is done
**Created:** 2026-10-13

As the assistant building the clone, I want STORY_028's raw capture filed under `docs/recon/<date>/` as masked pictures and readings with a coverage list, notes and interaction notes, and a written list of where the reference and our app differ, each difference naming the ticket it becomes, so that the chat story can cite exact, dated evidence and no difference lives only in memory.

## Current state

Read on 2026-10-13:

- **The curate pipeline** (`recon/src/curate.ts`, `curate-model.ts`, STORY_002) files the 2026-09-26 DOM readings: it validates each `<state>@<width>.json` against a schema (`state`, `url_path`, `viewport`, `components`), strips query strings, replaces ids in paths with `:id` (`placeholderPath`), writes `manifest.json` (entries with `source: "extension-reading" | "owner-save-page"`), and renders `coverage.md` from `EXPECTED_STATES` over `WIDTHS = [1437, 393]`, a constant fixed to that capture's widths. Everything is built in memory and `assertNoIdentity()` runs over every output, strings and bytes, before a single file is written.
- **The identity** (`snapshot.ts → readIdentity`) is the owner's display name and avatar read from the saved page `recon/out/2026-09-26/Qwen.html` at run time; the guard also fails any `cdn.qwenlm.ai/output/` link. Nothing in `recon/` reads or writes PNG pixels; the devDependencies are `parse5`, `postcss`, `playwright` and `vitest`.
- **A Hands look** (STORY_027's files) is the whole screen at the display's scale (the menu bar and the Dock included), with every element's `frame` in points and the look's `scale`, `width` and `height`. The front window is an `AXWindow` element and the page an `AXWebArea`. Generated images, the sidebar's My Library thumbnails and avatars are `AXImage` elements; icons are too, but small.
- **The sidebar lists the owner's other chats** by title under an `All chats` heading, and the user button shows the owner's name. The address field shows the chat's id.
- **STORY_025's Done note** measured the gap between stacked cards as 38 px "from the owner's screenshot" and said CHORE_007's capture would confirm or correct it. CHORE_007 is superseded by EPIC_006; this story is where that happens.
- **The chat story is unwritten.** STORY_026's note reserved 027 for it; EPIC_006 gives it the next free number when it is drafted here.

## UI Mockup

N/A (no UI change; the deliverable is files under `docs/recon/<date>/`). What lands:

```
docs/recon/<date>/
  pictures/
    <state>@<width>.png        the screen cropped to Safari's window; every generated image, the user row, every
                               chat row and the address field blacked out by code
  states/
    <state>@<width>.json       the reading: the elements (role, title, value, frame in points), the window and web
                               area frames, scale, the URL path with ids as :id, the act that produced it, masked
  owner/                        the owner's 2026-10-09 screenshots, masked from a hand-listed rectangle file (if given)
  capture-log.md                STORY_028's log, copied by the script and masked
  manifest.json                 one entry per picture and reading: state, width, viewport, source "hands-look" or
                                "owner-screenshot", file, url_path, date, note
  coverage.md                   this pass's state list, each captured or not captured with the reason
  notes.md                      hand-written: Hands' version, the widths and scale, generations spent, what each
                                reading shows, and the measured values the chat story commits to
  interactions.md               hand-written: what a chat with several images does, observed or not observed
  gaps.md                       hand-written: reference against ours, one row per difference, each naming its ticket
```

## Acceptance Criteria

- [ ] **The command.** `recon/run.sh hands-curate <date>` runs `recon/src/hands-curate.ts` in the recon container, **makes no network request** (it is added to `offline.test.ts`'s entries), reads only `recon/out/<date>/hands/`, `recon/out/<date>/owner/` and the 2026-09-26 saved page for the identity, and writes the layout above. Everything is built in memory and written only when every check below passes, so a failure writes nothing.
- [ ] **A reading per look.** Each `NN-<state>@<width>.json` becomes `states/<state>@<width>.json` holding: `state`; `width` (as asserted) and `viewport` from the `AXWebArea` frame; the `AXWindow` frame; `scale`; `url_path`, taken from Safari's address field when the look has it with a path, else `"unknown"`, with ids replaced by `:id`; the `act` as recorded; `hands.version` and `commit`; and the elements with `n`, `role`, `title`, `value`, `frame`, `actions` and `focusable`. **The asserted width must match the web area's width within 2 points**, or the run stops naming the file: a state labelled 393 that was read at desktop width is a mislabel, not a reading. When two looks share a state name (a repeated step), the later one wins and the log line says so.
- [ ] **Masking in readings.** The owner's display name (read as `curate` reads it), any string matching an email address, and any chat id in a title or value are replaced (`Owner`, `owner@example.com`, `:id`). **Every chat row's title is replaced** by `<chat title, N chars>`: a chat row is an element below the `All chats` text and above the user button, overlapping it horizontally; when there is no `All chats` text in the look, there are no rows to mask. Typed text in the composer (our own prompts) and the reply's prose are kept.
- [ ] **Pictures, masked by code.** Each look's `.png` is cropped to the `AXWindow` frame (frames are points; pixels are points times `scale`) and written as `pictures/<state>@<width>.png` with black rectangles over: every `AXImage` inside the web area whose frame is at least 48 × 48 points (generated images, thumbnails, the full-screen image); the user button's whole row; every chat row's frame; and the address field. A picture whose masks cannot be derived (no window frame, no web area, a user button expected but not found while the sidebar is visible) stops the run naming the file and the missing mask. **No rectangle is ever typed into code by hand for a Hands look.**
- [ ] **The owner's screenshots.** Each `recon/out/<date>/owner/<name>.png` is filed under `owner/` only when `owner/<name>.masks.json` beside it lists the rectangles to black out, written by the assistant from the picture and confirmed by the owner; a screenshot without a masks file is refused by name. The 2026-10-09 screenshots are filed if the owner copies them to the Spark; if not, the log says so.
- [ ] **The identity guard** runs over every output, pictures included, as `curate` does, and nothing is written when it fails. Its message names files, never the name.
- [ ] **Manifest and coverage.** `manifest.json` has one entry per picture and per reading with `source: "hands-look"` (or `"owner-screenshot"`), the width, the viewport, the URL path with ids replaced, the date, and a note that frames are in screen points from the accessibility tree at Safari's width on a 1920 × 1080 display at 2×, not CSS px. `coverage.md` lists every state STORY_028 names, at both of this pass's widths, each **captured** (with its files) or **not captured** (with the reason from the log), plus the facts this pass cannot establish: the DOM, computed styles, the network, and CSS values (which the 2026-09-26 capture holds).
- [ ] **The log** is copied to `capture-log.md` with the same masking, headed "Copied from STORY_028's capture log by `recon/run.sh hands-curate`; do not edit by hand."
- [ ] **Re-running the command produces byte-identical output**, and `git status --short` after it shows `docs/recon/<date>/` and the recon source changes only, never anything under `recon/out/`.
- [ ] **`notes.md`**, hand-written, states: the date and Hands' version and commit; the Mac, display, scale and the two widths; N approved and spent; the chat studied, by placeholder; one line per reading saying what it shows; and the **measured values**, each with the reading it comes from and in points: the gap between consecutive turns (the next user bubble's top minus the previous reply's bottom), the user bubble's and the reply's frames in a later turn, the composer's frame and mode between turns, the chat row's frame and the menu's items, the scroll position on reopen and after reload, the scroll-to-bottom control's frame if one exists, the full-screen view's controls, and where Download is on touch. It states in one line whether STORY_025's 38 px gap is confirmed or what the measured gap is, so the chat story can set the gap from a reading rather than a screenshot.
- [ ] **`interactions.md`**, hand-written, answers EPIC_006's four questions, each marked **observed** (with the readings) or **not observed** (with why): how a second image is asked for inside a chat and whether image mode is remembered; what a plain follow-up does (an edit of the last image, a new image, or prose); what a chat with several turns looks like and what reload, New Chat, Rename and Pin do; what Regenerate does on an earlier turn. It extends the 2026-09-26 "Mapping onto the clone" table with one row per new behaviour, each **Same**, **Departure** (with the reason) or **N/A**.
- [ ] **`gaps.md`**, hand-written: one table, a row per difference between the reference as captured and our app as read from its code that day (file and line), with the kind of ticket each becomes: **the chat story** for the new behaviour (a page is a chat; a turn is one image; the sidebar lists chats; a reload restores the turns), **a bug** for each visual mismatch of a surface that has shipped ([CLAUDE.md → §3b](../../CLAUDE.md#3b-how-bugs-are-tracked)), **a backlog item** for anything out of the MVP ([CLAUDE.md → §3c](../../CLAUDE.md#3c-how-backlog-is-tracked)), or **no ticket** with the reason (a departure already recorded, or something the local model makes moot).
- [ ] **The tickets exist as drafts.** The chat story is drafted at the next free number, as "A page is a chat, and each new image adds a turn to it", citing the readings and pictures by file and marked Draft, awaiting approval; each bug and backlog item named in `gaps.md` is created the same way. **Nothing is implemented.**
- [ ] **README** "Running Recon" gains the `hands-curate` step and the layout above, and names `docs/recon/<date>/` beside the 2026-09-26 folder as a capture a story may cite.
- [ ] **Gate.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass at the root; `recon/run.sh typecheck` and `recon/run.sh test` pass in the container.

## Technical Notes

- **Files.** `recon/src/hands-curate.ts` is the entry, shaped like `curate.ts`: read everything, build a `Map` of outputs, guard, then write. `recon/src/hands-curate-model.ts` is the pure part: look to reading, the width check, the chat-row and user-row detection, the mask derivation (a list of rectangles per picture), the manifest entries and the coverage list for this pass. `recon/src/png-mask.ts` crops and blacks out rectangles. `recon/src/fixtures/hands-look.json` is a hand-written look with invented names, an email-shaped value, an `All chats` text with two rows, a user button, three `AXImage`s (one 24 × 24, one 68 × 68, one 400 × 225), a window and a web area, used by every test.
- **PNG handling** uses `pngjs` (a pure JavaScript decoder and encoder), added as a recon devDependency and installed in the container, never on the host. Tests build small PNGs in memory rather than committing binaries.
- **Coverage is generalised, not duplicated.** `coverage()` and `renderCoverage()` in `curate-model.ts` take the width list as an argument, with the 2026-09-26 call site passing `WIDTHS` so its output and tests do not change. This pass's `EXPECTED_HANDS_STATES` list is the state list from STORY_028, with its reasons filled from the log by hand in the model file, as `EXPECTED_STATES` quotes the 2026-09-26 notes.
- **Points, not CSS px.** Safari at 100% on a 2× display gives 1 CSS px per point, so desktop frames are numerically CSS px at that width; in Responsive Design Mode the phone viewport is also drawn 1 point per CSS px at the default zoom. The notes state this and `manifest.json` carries the note, but no file claims a CSS value: where a measurement is wanted in CSS px the reading's frame is quoted as points with that caveat.
- **Why titles of chat rows are masked and prompts are not.** The sidebar shows the owner's whole chat history, which is not this capture's subject; the prompts in the studied chat and in Part C are the capture's subject and were typed by the owner or by STORY_028 from a fixed list. The owner reviews the readings before or after the push, as they chose on 2026-09-26.
- **The owner's screenshots** have no element frames, so their masks are listed by hand in a sidecar file. Refusing a screenshot without one keeps the rule that a generated image never enters git without a mask that was checked.
- **The hand-written files** (`notes.md`, `interactions.md`, `gaps.md`) are the same kind as the 2026-09-26 `interactions.md`: written by the assistant from the readings and the log, not generated, and frozen once the story is Done, like a ticket; a later pass writes its own dated files.

## Testing Plan

- **Unit** (`recon/run.sh test`, and the root `pnpm test`):
  - `recon/src/hands-curate-model.test.ts`, over the fixture look:
    - a look becomes a reading with the state, the asserted width, the viewport from the web area, the window frame, the scale, the elements, and the act; a look whose asserted width is 393 against a web area of 1920 is refused naming the file;
    - the owner's name in a title, an email-shaped value and a `/c/<uuid>` in the address field's value are replaced, and the replacement text never contains the originals;
    - the two rows under `All chats` have their titles replaced by `<chat title, N chars>` with the right N, and an element at the same height outside the sidebar's column is left alone; a look with no `All chats` masks no rows;
    - masks: the 68 × 68 and 400 × 225 images get rectangles and the 24 × 24 icon does not; the user button's row, each chat row and the address field get one; a look without an `AXWindow` is refused naming the picture and the mask;
    - rectangles are scaled by `scale` and offset by the window's origin, so a mask lands where the element is in the cropped picture;
    - the manifest entry carries `source: "hands-look"`, the `:id` path and the points note; `coverage()` with this pass's widths marks a state captured only when its reading exists at that width, and every not-captured row has a reason;
    - the log copy replaces the name and the chat id.
  - `recon/src/png-mask.test.ts`: a generated 40 × 30 PNG cropped to a 20 × 10 window is 20 × 10; a rectangle blacked out reads as black inside and unchanged outside; a rectangle partly outside the picture is clipped, not an error.
  - `recon/src/identity-guard.test.ts` (extended): the guard finds the name inside PNG bytes when it is there as text, and passes a masked picture.
  - `recon/src/offline.test.ts`: `hands-curate.ts` is an offline entry, and its closure contains no network call.
  - `recon/src/curate-model.test.ts` (unchanged cases): the generalised `coverage()` still produces the 2026-09-26 output.

  These prove every rule that decides what reaches `docs/recon/`: what is masked, what is refused, and what is measured where.
- **Integration:** N/A. The script reads local files and writes local files; the fixtures stand in for the capture.
- **E2E:** N/A. The app does not change.
- **Manual (not a gate):**
  1. `recon/run.sh hands-curate <date>` runs clean; a second run is byte-identical.
  2. **The assistant opens every picture under `docs/recon/<date>/pictures/` and `owner/`** and confirms each black rectangle covers what it should, before anything is committed.
  3. `coverage.md` is read against STORY_028's log; every state the log names is in it.
  4. **The owner skims the pictures and readings** and confirms nothing identifies them or shows their other chats, before or after the push as they choose.
  5. The chat story's draft cites files that exist.

## Estimated Complexity

M–L: the mask derivation and PNG handling are new ground for `recon/`, and the three hand-written files plus the drafted tickets are the larger half of the work.
