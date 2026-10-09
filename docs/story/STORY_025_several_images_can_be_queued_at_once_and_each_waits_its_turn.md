# STORY_025 — Several images can be queued at once, and each waits its turn on the same page

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md) (a follow-up the owner asked for on 2026-10-09)
**Status:** Done (2026-10-09). Approved by the owner on 2026-10-09 ("can we complete what we can without the recon?"). It ships before the chat story, which waits for the Hands recon (CHORE_007) and will be STORY_026
**Created:** 2026-10-09 (the count control was added the same day, at the owner's request, before approval)

As the owner, I want to choose in the composer how many images one send queues (1 to 8 of the same prompt, each with its own seed), and to send another prompt while earlier ones are still generating, so that I can line up a batch and walk away instead of waiting about a minute between each one. Each image should stack under the earlier ones on the page I am on, wait its turn, and fill in when the model gets to it.

## Current state

Read on 2026-10-09:

- **The model server already queues.** `Jobs` (`spark/model-server/src/jobs.ts`) hands the worker the oldest queued job, and only when none is running (`next()`, line 96). It holds up to **8 waiting** jobs (`maxQueued = 8`, line 66). A ninth is refused with `503 busy` and the message "The model server already has 8 images waiting; try again when one has finished." (line 51). So nothing on the Spark needs to change.
- **The UI is what stops a second send.** On `/g/<id>`, while the job is queued or running, the composer shows **Stop in place of Send** (`app/components/composer/Composer.tsx` line 152, fed by `running` from `GenerationPage.tsx`).
- **Enter still sends while a job runs.** `send()` checks `canSend(state) && !busy`, not `running` (`Composer.tsx`, the `sendable` line), so pressing Enter during a generation creates a second job. `useSubmit` (`ComposerHost.tsx`) then `router.push`es to the new job's page. This is unintended. This story makes it the designed behaviour, without the page change.
- **One page shows one generation.** `GenerationPage` takes a single `id`, runs one `useGeneration(id)`, and renders one `GenerationView`. Regenerate and Same seed again go through `useSubmit` too, so they also move to a new page.
- **The sidebar already shows each queued or running entry** with a spinner (`HistoryList.tsx` line 102), and its menu offers Stop for such an entry (line 66).
- **After a send, the composer clears** the text and the references and keeps the mode, model, ratio and add-on (`composer-state.ts`, the `sent` case).
- **The stub does not model a queue.** Each stub job advances on its own status polls (`tools/stub-generation-server/src/scripts.ts`), so stub jobs never wait for one another. That is fine for the UI's tests. The real one-at-a-time order is a manual check on the Spark.
- **One send is one job.** `submitGeneration` (`app/lib/submit.ts`) sends one create. The contract has no count field: one `POST /jobs` makes one image, and the server draws a seed when none is sent.
- **The image-mode footer** holds the Model and Aspect ratio dropdowns, plus the Add-on dropdown when the server offers add-ons (icon only on narrow) (`Composer.tsx`, `message-input-column-footer-submode`). These options are kept in session storage through `serialize`/`restore` (`composer-state.ts`).
- **`lib/pending.ts`** holds what this page session sent, per id (`remember`/`recall`), in memory, so it survives a client-side navigation but not a reload.
- **The reference has nothing to copy here.** It keeps Stop in Send's place, disabled, for the whole of an image job (`docs/recon/2026-09-26/interactions.md`, "Generating"), so it cannot queue a second image. Its image-mode footer has only the model and ratio pills ("Composer", same file), with **no image-count control**.

## UI Mockup

**Reference capture:** `states/job-generating@1437.json` and `states/job-done@1437.json` for each card in the stack (bubble, skeleton, result and row under it, unchanged from STORY_012). `states/composer-image-mode@1437.json` for the footer pills the count dropdown copies. The reference has no stacked state, no per-card Stop and no count control; all three are ours (see Departures).

**Measured values committed to** (all from STORY_012, reused per card): user bubble `#293652`, radius 18, padding `9px 16px`, 16px/26px; skeleton 400 × 225 (tracking the ratio), `#3e474e`, radius 20; result 400 wide, radius 20; row under the image 32px below it. **New:** cards are separated by the same gap the reference leaves between chat turns (the first bubble's top margin in `states/job-done@1437.json`, read when building and listed in the Done note).

**The count dropdown** is the last pill in the image-mode footer, built from the same `Dropdown` and pill styles as Model and Aspect ratio. It reads `×1` by default; its menu lists `1 image` to `8 images`; the chosen count survives a reload within the session, like the other options.

```
┌──────────────────────────────────────────────────────────────┐
│ a red bicycle against a brick wall                           │
│ (+) [Create Image ×] [Qwen-Image 2.1 ▾] [16:9 ▾] [×4 ▾]  (➤)  │
└──────────────────────────────────────────────────────────────┘
                                          ┌──────────────┐
                                          │   1 image    │
                                          │   2 images   │
                                          │   3 images   │
                                          │ ✓ 4 images   │
                                          │   …          │
                                          │   8 images   │
                                          └──────────────┘
```

**One send with ×3:** one user bubble per image (each card stays whole on its own, so Info, Regenerate and Stop belong to one job), the first generating and the rest waiting:

```
                                   ┌───────────────────────────┐
                                   │ a red bicycle…            │
                                   └───────────────────────────┘
┌──────────────────────────────┐
│    ░░░░ generating ░░░░      │
└──────────────────────────────┘
 Generating                    (■ Stop)
                                   ┌───────────────────────────┐
                                   │ a red bicycle…            │
                                   └───────────────────────────┘
┌──────────────────────────────┐
│    ░░░░░░░░░░░░░░░░░░░░      │
└──────────────────────────────┘
 Queued                        (■ Stop)
   … and the third, Queued
```

**Desktop, three different prompts sent in a row** (the first is done, the second is generating, the third is waiting):

```
                                   ┌───────────────────────────┐
                                   │ a red bicycle…            │
                                   └───────────────────────────┘
┌──────────────────────────────┐
│        result image          │
└──────────────────────────────┘
 (ⓘ) (↻)
                                   ┌───────────────────────────┐
                                   │ a blue boat…              │
                                   └───────────────────────────┘
┌──────────────────────────────┐
│    ░░░░ generating ░░░░      │
│              ✦               │
└──────────────────────────────┘
 Generating                    (■ Stop)
                                   ┌───────────────────────────┐
                                   │ a green kite…             │
                                   └───────────────────────────┘
┌──────────────────────────────┐
│    ░░░░░░░░░░░░░░░░░░░░      │
│              ✦               │
└──────────────────────────────┘
 Queued                        (■ Stop)

┌──────────────────────────────────────────────────────────────┐
│ Ask Qwen…                                                    │
│ (+) [Create Image] [Model ▾] [16:9 ▾]                   (➤)  │   Send stays Send
└──────────────────────────────────────────────────────────────┘
```

**Each card on its own** keeps every state STORY_012 and STORY_024 drew (done with Info, Regenerate and the hover actions; failed; moderated; stopped), unchanged.

**The server is full** (8 already waiting): nothing is added to the stack; the composer keeps the text and shows the server's message under it, as any `503 busy` does today:

```
┌──────────────────────────────────────────────────────────────┐
│ a yellow tram…                                          (➤)  │
└──────────────────────────────────────────────────────────────┘
 The model server already has 8 images waiting; try again when one has finished.
```

**The server fills part-way through a count** (×4 asked, room for 2): the two accepted cards are added; the composer keeps the text and says how many went:

```
┌──────────────────────────────────────────────────────────────┐
│ a yellow tram…                                          (➤)  │
└──────────────────────────────────────────────────────────────┘
 Queued 2 of 4. The model server already has 8 images waiting; try again when one has finished.
```

**Narrow (iPhone 13):** the count pill reads `×4` (it is already short) and sits in the footer row after the others; the footer must not scroll sideways at 390 wide. The stack uses the phone's card width (300 wide, as STORY_012's Done note measured). Each running card's Stop is in its row under the card with a 44 × 44 touch area, next to the status text.

```
        ┌──────────────────┐
        │ a blue boat…     │
        └──────────────────┘
┌──────────────────────────┐
│  ░░░ generating ░░░      │
└──────────────────────────┘
 Generating          (■)      44 × 44
        ┌──────────────────┐
        │ a green kite…    │
        └──────────────────┘
┌──────────────────────────┐
│  ░░░░░░░░░░░░░░░░░       │
└──────────────────────────┘
 Queued              (■)
┌──────────────────────────┐
│ Ask Qwen…           (➤)  │
└──────────────────────────┘
```

## Departures from the reference

- **Send stays available while images generate.** The reference puts a disabled Stop in Send's place for the whole job. Ours always shows Send, so the next prompt can go at once. The owner asked for this on 2026-10-09.
- **Stop moves from the composer to each card.** With several jobs on the page, one Stop in the composer could not say which job it stops. Each queued or running card has its own Stop, in the row under it, with the reference's `qwpcicon-stop-fill` icon. It works as STORY_012's Stop does: `DELETE`, then the card shows "Stopped."
- **An image count in the composer.** The reference makes one image per send. Ours offers 1 to 8 per send, as separate jobs with their own seeds. 8 is the model server's waiting limit, so a larger number could never all be accepted. The owner asked for this on 2026-10-09.
- **A page can hold several generations.** The reference's page is one chat. Ours was one generation (STORY_012). Now it is the generations sent from it during this visit.

## Acceptance Criteria

- [x] **Send is never replaced by Stop.** On the home page and on `/g/<id>`, the composer shows Send whenever it has text, whether or not any job is queued or running. Send waits only while its own create request is in flight (`busy`), as today.
- [x] **Sending from a generation page adds to that page.** The create request is sent **first**; once it is accepted, a new user bubble and skeleton are added **below** the existing cards, the composer clears (text and references; the mode, model, ratio and add-on stay), and the new card scrolls into view. The URL stays the same, and nothing reloads.
- [x] **Sending from the home page** works as today: the creates first, then `/g/<first id>`. Further sends from there add to that page.
- [x] **The count dropdown** is in the image-mode footer, on the home page and on `/g/<id>`, at both widths. It offers 1 to 8, defaults to 1, and survives a reload within the session like the model and ratio. It is not shown outside image mode.
- [x] **A count of N creates N jobs** with the same prompt, model, ratio, add-on and references, and **no seed**, so the server draws a different one for each. The creates go one after another, each answered before the next is sent, and before anything is painted. Then one bubble and card per accepted job are added in order. With a count of 1, the request is exactly what is sent today.
- [x] **A count stopped part-way is reported, not hidden.** If the server answers `503 busy` after k of N were accepted (0 < k < N), the k cards are added, no further create is sent, the composer keeps its text and references, and the message under it reads "Queued k of N." followed by the server's message. The count is left as it was. If the first create is refused, it behaves as a full queue (below).
- [x] **Each card follows its own job.** Every card polls its own job with STORY_012's backoff, shows Queued, then Generating, then its result (or failed, moderated or stopped), independently of the cards around it. A card that finishes above the one being watched does not move the scroll position.
- [x] **Each queued or running card has its own Stop.** It cancels that job only (`DELETE /api/jobs/<its id>`); the others carry on. The card then shows "Stopped.", or its real final state when the server says it had already finished (409).
- [x] **Regenerate, Same seed again and Try again on any card add one new card** to the bottom of this page, instead of moving to a new page. They ignore the composer's count (Same seed again ×N would make N copies of one image). Edit still puts that card's image into the composer.
- [x] **A full queue is refused cleanly.** When the server answers `503 busy`, no card is added, the composer keeps its text and references, and the server's message shows under it (STORY_012's behaviour, now reachable mid-batch).
- [x] **Leaving the page does not stop anything.** Jobs sent from it keep running on the server; each shows its spinner in the sidebar until it finishes and then appears in the sidebar and My Library as usual. A send is never lost to a navigation: the create request has been answered before the page can change ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over)).
- [x] **A reload shows the generation in the URL,** as it does today. The other cards of that visit are not regrouped on the page; each is reachable from the sidebar. (Keeping a batch together across a reload would need history to record batches. That is out of scope here; see Technical Notes.)
- [x] **Narrow:** the stack, the count pill and each card's Stop render at iPhone 13 width, the composer footer does not scroll sideways, and each Stop's touch area is at least 44 × 44.

## Technical Notes

- **`GenerationPage` holds a list of ids:** the URL's id first, then each one this visit created, in order (component state, not storage). It renders one `GenerationCard` per id. `GenerationCard` is today's body of `GenerationPage` (its `useGeneration(id)`, `fromPending`/echo logic, `GenerationView`, Edit, Regenerate and Same seed again) moved into its own component, so each card polls, stops and resends on its own. The page owns the composer and the inject state for Edit.
- **The count lives in the composer state.** `ComposerState` gains `count` (1–8, default 1), a `setCount` action, and a place in `serialize`/`restore`, where an out-of-range or missing stored value reads as 1. The `sent` action leaves it alone. `requestFrom(state)` is unchanged; the count travels beside the request, not in it, because the contract has no such field.
- **`submitBatch(req, count)`** (new, pure apart from the injected `submitGeneration`, in `app/lib/submit.ts`) awaits each create in turn and stops at the first refusal. It returns the accepted ids and, when it stopped early, the server's message. Sequential rather than parallel so the server sees them in order and a full queue stops the rest instead of racing them.
- **`useSubmit` gains a count and an `onCreated(ids)` option.** The generation page passes one that appends the ids to its list. The home page passes none, records the follow-on ids with the first (`rememberBatch(firstId, ids)` in `lib/pending.ts`), and then `router.push`es to the first; `GenerationPage` seeds its list from that, so all N cards are on the page it lands on. The navigation happens only after every create has been answered, so none is cancelled by it ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over)). `remember(id, req)` and `announceHistoryChanged()` run for each id, so each card still knows its prompt and files at once.
- **Regenerate and Same seed again** call the same path with a count of 1.
- **The composer loses `running` and `onStop`.** `ComposerHost` and `Composer` drop both props. Stop becomes a `GenerationView` action, shown while the job is queued or running, built from the same class names as today's (`stop-button clone-stop-button`, `qwpcicon-stop-fill`), with `aria-label="Stop"`.
- **Scrolling:** on append, the new card's bubble gets `scrollIntoView({ block: "end" })`, in an effect keyed on the list length, so a result loading higher up never scrolls the page.
- **Polling cost:** at most 9 cards poll at once (8 waiting and 1 running), each no faster than every 4 s once backed off. No shared poller is needed.
- **No contract change and no model-server change.** A count is N ordinary creates.
- **The stub gains one test control**, because "accepted 2, then full" cannot be set up with `/__stub/busy` alone without racing the page: `POST /__stub/busy {"afterAccepting": k}` answers 503 to every create after the next k, until reset. It is test-only, like the rest of `/__stub/*`, and `reset` clears it.
- **Not in this story** (a backlog item if the owner wants them): a queue position on waiting cards ("2 ahead"), which the contract does not report; keeping a batch together across reloads, which needs history to record which jobs were sent together; and raising the 8-job cap.

## Testing Plan

- **Unit:**
  - `app/lib/use-generation.test.tsx` (extended): two hooks for two ids, rendered inside `<StrictMode>` with fake timers and a mocked fetch. Each polls only its own id. Stopping one sends `DELETE` for that id only, and the other keeps polling to its terminal status. Unmounting the page stops both.
  - `app/components/generation/GenerationPage.test.tsx` (new, StrictMode, fake timers, mocked fetch and router): a send from the page appends a second card below the first and does **not** call `router.push`; the composer's Send is enabled while the first card is running; a `503 busy` adds no card and leaves the composer's text; Regenerate on the first card appends a third card.
  - `app/components/composer/Composer.test.tsx` (new or extended): there is no Stop in the composer, and Send is enabled whenever there is text and no create is in flight. The count dropdown is shown only in image mode, defaults to ×1, and choosing 4 shows ×4.
  - `app/lib/composer-state.test.ts` (extended): `setCount` sets it; `sent` keeps it; `serialize`/`restore` round-trip it; a stored 0, 9, a non-number or a missing value restores as 1.
  - `app/lib/submit.test.ts` (extended): `submitBatch` with a fake `submitGeneration`. A count of 3 sends 3 creates in order, each started only after the previous one answered, none with a seed, and returns 3 ids. A refusal on the 3rd of 4 returns 2 ids and the server's message, and sends no 4th. A refusal on the 1st returns no ids. A count of 1 sends exactly the request it was given.
  - `app/lib/pending.test.ts` (extended): `rememberBatch` and its recall give the follow-on ids in order; an unknown id gives none.
  - Proves: the page-level wiring (append, not navigate), the per-card independence and the batch's order and early stop, which typecheck and the build cannot see.
- **Integration** (`tools/stub-generation-server/src/server.test.ts`, extended): with `afterAccepting: 2`, two creates answer 202 and the third 503 busy; `reset` clears it. The app's routes need no new case: N creates through `app/test/integration/jobs.test.ts`'s route are N of the case it already covers. The model server's one-at-a-time queue and its cap of 8 are covered by `spark/model-server/src/jobs.test.ts` and stay green.
- **E2E** (`app/e2e/queue.spec.ts`, new, desktop and iPhone 13):
  1. **Three in a row.** Route the first create with `x-stub-script: slow-done-after-10-polls`, the second with `slow-done-after-10-polls`, the third with `done-after-3-polls`. Register `waitForResponse` for each job's terminal `done` **before** its submit (`submitAndWait`). Type a prompt and send; on `/g/<id>`, type a second and send while the first card shows Generating; then a third. Assert: the URL is still the first job's; three user bubbles in send order; Send is visible and enabled throughout; the stub's `received` has three jobs with the three prompts in order. Wait for all three terminal responses, then `expectImageLoaded` on each card's result image.
  2. **Stop one, keep the rest.** Two jobs, both `slow-done-after-10-polls`. While both are running, click the **second** card's Stop. Assert the `DELETE` for the second id returns 202 and that card shows "Stopped."; the stub lists the second as cancelled and the first is not; the first reaches `done` and its image loads.
  3. **Full queue.** Send one job (`done-after-3-polls`), then `POST /__stub/busy {busy:true}` and send a second prompt. Assert the busy message under the composer, the composer still holds the second prompt, and only one card is on the page. Reset busy, and wait for the first job's terminal status before the test ends.
  4. **Leaving does not stop.** Send two jobs (`slow-done-after-10-polls`), then go to the home page. Assert both sidebar entries show the Generating spinner, then (after their terminal status responses) that both appear in the sidebar without it.
  5. **Narrow only:** each running card's Stop has a bounding box of at least 44 × 44.
  6. **A count from the home page.** Enter image mode, choose `×3` and type a prompt. Route every create with `x-stub-script: done-after-3-polls` and register the three terminal waiters before Send. Send. Assert: the page lands on `/g/<first id>`; three bubbles with the same prompt; the stub's `received` has three jobs with the same prompt, ratio and model and no seed in any; their echoed seeds are not all equal. Wait for all three terminal responses and `expectImageLoaded` on each. Reload: the count still reads `×3`.
  7. **A count that the server stops part-way.** On a generation page, `POST /__stub/busy {"afterAccepting": 2}`, choose `×4` and send. Assert two new cards, the message "Queued 2 of 4." with the busy message, the prompt still in the composer, and the stub's `received` holding exactly two new jobs. Reset, and wait for both to reach a terminal status.
  8. **Narrow only:** in image mode with add-ons offered, the composer footer's `scrollWidth` does not exceed its `clientWidth`.

  Every test ends with every job it created in a terminal state ([CLAUDE.md → §6b](../../CLAUDE.md#6b-e2e-test-conventions)). Scenario 1 queues three slow jobs, so the test is marked `test.slow()`, with the arithmetic in a comment.

  **Specs that cover the unchanged halves and must stay green:** `generate.spec.ts` (one job from submit to result, the edit upload, moderated, failed, busy, reopen after reload, Info and Same seed again). Its Stop scenario still finds a single button named Stop, now on the card instead of the composer. Its STORY_024 scenario clicks Same seed again and Regenerate, which now add cards to the same page instead of moving to a new one. Its locators for the result image and the Info panel will be scoped to the newest card, because the page then holds more than one; what it asserts does not change. Also `history.spec.ts`, `references.spec.ts`, `image-mode.spec.ts` and `home.spec.ts`.
- **Manual, on the Spark:** send one prompt with `×3` against Qwen-Image-2.1. Look for: the second and third cards say Queued while the first generates, and each turns to Generating only once the one before is done (about a minute apart); all three finish as different images; `nvidia-smi` shows one worker throughout, not three. Record the model, checkpoint and date in the Done note.

## Estimated Complexity

L

## Corrections made during implementation (2026-10-09)

- **On the phone, the count sits beside the text, not in the footer row.** The phone's footer row is already full with the reference's own pills and the add-on icon (it has no gaps, and each pill has 4px of padding). Even without its arrow, `×N` pushed Send 25px off the composer. STORY_019's add-on e2e caught this, because it measures the whole footer row. The owner chose this placement on 2026-10-09 from three options (beside the text, inside the add-on menu, a second row). The Narrow mockup and the Narrow AC above describe the footer row; the count is instead at the top right of the text row. On desktop it is the last pill in the footer, as sketched.
- **The stub's `afterAccepting` test is in the stub's own suite** (`tools/stub-generation-server/src/server.test.ts`, which runs in the unit lane), not under Integration as the Testing Plan says. The app's integration suite is unchanged.
- **No separate `Composer.test.tsx`.** Its cases are in the new `GenerationPage.test.tsx`, which renders the real composer: Send is enabled while a card runs, there is one Stop per running card and none in the composer, and the count shows `×3`.
- **The gap between cards (38px) was measured from the owner's screenshot**, not from a reading. The 2026-09-26 capture has no two-turn chat. CHORE_007's capture will confirm or correct it.
- **Landing from the home page with a count of N does not scroll to the last card.** Only cards added by a send on the page scroll into view, as the AC says. All N are on the page.
- **e2e scenario 4 ("leaving the page") runs on desktop only.** On the phone the sidebar is a drawer; the jobs' lifetime does not depend on the width. Its jobs use `done-after-3-polls`, and history's own re-read while anything runs (BUG_006) carries them to the end.

## Done note (2026-10-09)

- **Gate:** all six steps green, run by hand through `tools/gate/run.sh`: typecheck, lint, unit (app 185, stub 69, model server 101, recon 111), integration 22, the build with the production image, and e2e 79 passed.
- **Tests added:**
  - `app/components/generation/GenerationPage.test.tsx` (new, StrictMode): a send appends a card without navigating; a busy server adds none and keeps the text; ×3 makes three requests with no seed; a count stopped part-way says "Queued 2 of 4."; Regenerate adds one card whatever the count; Stop stops that card's job only; ×3 from the home page lands on a page showing all three.
  - `app/lib/use-generation.test.tsx`: two jobs on one page, each polling only itself; stopping one; unmounting stops both.
  - Unit cases in `submit.test.ts` (`submitBatch`, `batchMessage`), `composer-state.test.ts` (the count), `pending.test.ts` (`rememberBatch`) and `SettingsPanel.test.tsx` (each card's Stop).
  - The stub's `afterAccepting` in `server.test.ts`.
  - `app/e2e/queue.spec.ts` (new): seven scenarios at both widths where they apply, with the `waitForTerminals` fixture.
  - `generate.spec.ts`: the STORY_024 scenario now finds the newest card and asserts the URL stays put; everything it asserts is unchanged.
- **Side by side:** there is no reference capture of a stacked page (the reference cannot queue). Each card keeps STORY_012's measured values. The gap between cards is 38px, from the owner's screenshot. Desktop and phone were checked in screenshots from the e2e build.
- **Departures:** as listed above. Send is always available; Stop is on each card; there is a count control; a page holds several generations.
- **Pending, on the Spark:** the manual check in the Testing Plan. Send ×3 against Qwen-Image-2.1; the second and third cards stay Queued until the one before finishes; `nvidia-smi` shows one worker. The model server did not change, so nothing on it needed a restart.

