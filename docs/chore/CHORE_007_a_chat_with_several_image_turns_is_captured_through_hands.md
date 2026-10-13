# CHORE_007 — A chat with several image turns is captured from the reference, through Hands

**Status:** Superseded on 2026-10-13 by [EPIC_006](../epic/EPIC_006_the_reference_is_captured_again_through_hands_starting_with_a_chat_that_holds_several_images.md), before approval and with nothing implemented: the scope grew from one capture to a second recon pass (client, run and curation, each with tests), which is an epic, not a chore (CLAUDE.md §3d). Its content lives on as that epic's STORY_027 to 029
**Created:** 2026-10-09

## Summary

Capture a chat on chat.qwen.ai that holds more than one image turn, at desktop and phone widths, so the coming chat story (STORY_025, "A page is a chat, and each new prompt adds a turn to it") has a dated capture to cite. The owner shared two screenshots of such a chat, "Image of a Man", on 2026-10-09. The 2026-09-26 recon has single-turn states only (`docs/recon/2026-09-26/states/`).

The capture is driven through **Hands**, the owner's tool for this kind of work (`kevinbrowncodes/hands`, 1.10.0, commit `60495ad`, read on 2026-10-09). Hands runs on the Mac Studio and drives the owner's own signed-in Safari through the macOS Accessibility API and the keyboard. Its app answers at `http://hands.local/` and is reachable from the Spark: `/health` answered on 2026-10-09. A small client in `recon/` calls Hands' API from the Spark and files what comes back.

## Why

- **A clone story needs a capture** (CLAUDE.md §3 item 6). A chat with several turns, the sidebar's chat row and its menu, and a reload of that chat have never been captured.
- **Hands uses the owner's real browser, already signed in.** That avoids the saved Playwright profile's login step and is the least likely to be challenged by the reference's anti-bot stack (§3e: browse as a user would).
- **Hands sees accessibility elements and pixels, not the DOM.** That covers this capture: the stylesheets and the single-turn markup were harvested on 2026-09-26, and what is new is layout (frames). Anything that needs a computed style is marked "measured from the picture" in the notes, never invented. If a later story needs the DOM, the existing Playwright path (`recon/run.sh login`) still provides it.

## Changes

- [ ] **The owner puts Hands' API token on the Spark** as `HANDS_API_TOKEN` in `~/.zshenv` (the assistant's shell reads only that file; CLAUDE.md §4). The value is the `API_TOKEN` from Hands' `.env` on the Mac. It is never pasted into the chat, and the client checks only that it is present.
- [ ] **`recon/src/hands.ts`** (new): a thin client for Hands' `POST /api/hand/look` and `POST /api/hand/act`. It reads `HANDS_URL` (default `http://hands.local`) and `HANDS_API_TOKEN`, and saves each look's element JSON and both pictures (`screenshot_url`, `marked_url`) to `recon/out/2026-10-09/hands/<step>-<state>.*` (gitignored).
- [ ] **`recon/src/hands-curate.ts`** (new): files the curated set into `docs/recon/2026-10-09/`.
  - Each state's elements become a reading (role, title, frame), with the account's name and email masked by the existing `identity-guard.ts`.
  - Its screenshot is filed with the account row and **every generated image blacked out**, because generated images from the reference never enter git (§3e). The masks are drawn from the elements' own frames, not by hand.
- [ ] **`recon/run.sh hands DATE`** and **`recon/run.sh hands-curate DATE`**, run in the existing recon container (nothing is installed on the Spark).
- [ ] **The capture**, run at a user's pace with the Mac left alone while it runs, because Hands fills the screen with Safari:
  1. Open "Image of a Man" from the sidebar: the full chat at the window's width, scrolled to the top, then to the bottom.
  2. The sidebar's chat row, selected and not, and its `…` menu open.
  3. Reload: every turn comes back, and the URL stays `/c/<id>`.
  4. The same at phone width, in Safari's Responsive Design Mode with the iPhone 13 preset (393 wide), as in the 2026-09-26 capture.
  5. **Only if the owner sets the count to 1:** one follow-up prompt in that chat, captured as it is sent, while it generates, and when it is done (it stays in the same chat; the sidebar gains no row).
- [ ] **`docs/recon/2026-10-09/notes.md`**, which says:
  - the date, Hands' version and commit, and the number of generations spent;
  - what each reading shows;
  - the measured values the chat story will use: the gap between turns, the second turn's bubble and reply boxes, the chat row's box, the menu's items, and the scroll-to-bottom button's box.
- [ ] **The owner's two screenshots** are filed as `docs/recon/2026-10-09/owner/` with the same masking, noted as the owner's own captures.
- [ ] **The Hands task's routine** is saved in Hands as "qwen recon: multi-turn chat" (`POST /api/tasks/{id}/routine`), so the capture can be replayed when the reference changes. The notes name it.
- [ ] **CLAUDE.md §4b gains one line**, *only with the owner's separate approval*: recon may be driven through Hands, in the owner's signed-in Safari on the Mac; it files element readings and masked pictures; DOM and style harvesting still go through the Playwright profile.

## Testing

- **Unit** (`recon/src/hands.test.ts`, `recon/src/hands-curate.test.ts`, run by `recon/run.sh test`):
  - The client sends the bearer token and never writes it into a saved file. It reports "Hands token: not set" and stops when the variable is absent. It saves a look's files under the step's name.
  - Curation masks the account name and email in a fixture look (`recon/src/fixtures/hands-look.json`, hand-written, with no real identity in it).
  - It derives a black box for each element whose frame holds a generated image (an `AXImage` inside the chat or the My Library strip), and leaves the icons alone.
  - It refuses to file a reading that `identity-guard` still flags.
- **Integration:** N/A. The only external service is Hands on the Mac, and a test that needs another machine is not a test (CLAUDE.md §4a). The client is unit-tested against a fake `fetch`.
- **E2E:** N/A. The app does not change.
- **Manual:** the capture itself. Before committing, `git status --short` shows nothing under `recon/out/`, and every filed picture has been opened to check that its masks cover the account and the generated images.
