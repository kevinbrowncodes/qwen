# STORY_002 — Every captured state of the image generation flow is filed in the repo as a dated spec

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26, as "Every state of the image generation flow is captured as dated screenshots and page snapshots". **Rewritten before implementation on 2026-09-26.** The automated capture it described could not run. chat.qwen.ai's access check rejected the Playwright-launched browser even after the owner solved it (see [STORY_001 → Withdrawal](STORY_001_the_owner_signs_in_to_the_reference_once_and_every_recon_run_reuses_that_session.md#withdrawal-2026-09-26)), and [CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded) says to stop rather than work around a challenge. The capture was instead done in the owner's own signed-in Chrome. This story now files that capture; it no longer drives a browser.

As the assistant building the clone, I want the capture the owner made in their own browser filed under `docs/recon/2026-09-26/`, cleaned of the owner's identity, with a list of which states it covers and which it does not, so that each clone story can cite an exact, dated reading of the state it must match and build from the markup that produced it.

## Current state

Everything below sits in the gitignored `recon/out/2026-09-26/` and nothing is committed yet (checked 2026-09-26):

- **`extension/<state>@<width>.json`** holds 15 per-state readings taken by Claude in Chrome from the rendered DOM. Each has the component tree, the selectors, the boxes, the computed styles (font, colours, border, radius, padding, gap, shadow, transition), the text, and the sprite ids of the icons. Every file is in CSS px. The owner's name and avatar already read `[masked]`.
  - Desktop, 1437×1031: `home-signed-in`, `mode-menu-open`, `composer-image-mode`, `image-model-open`, `aspect-ratio-open`, `composer-typed`, `composer-reference-attached`, `job-submitted`, `job-generating`, `job-done`, `edit-done`, `my-library`.
  - Narrow, 393×852, an emulated iPhone 16 with touch and no hover: `home-signed-in`, `job-done`, `my-library`.
- **`extension/network-endpoints.json`** lists first-party API paths with ids replaced and no query strings. It is input to STORY_004, not to this story.
- **`extension/notes.md`** and **`extension/notes-extension-summary.md`** are prose notes for every phase, including what was not captured and why.
- **`Qwen.html`** is the owner's "Save Page As" of the signed-in desktop home in image-capable dark mode, at 125% browser zoom. It contains the complete DOM, the four inline icon sprites (1,113 symbols) and seven inline `<style>` elements. **It also contains the owner's avatar as a base64 image and their display name in the sidebar**, so it cannot be committed as saved. Its `Qwen_files/` folder, with the logo and other images, was not copied to the Spark.
- **There are no screenshots, by the owner's choice** (notes.md, first line). The readings and the one page snapshot are the capture.
- **Generations used: 2 of the approved budget**, the edit and one text-to-image run. The planned cancel run was not spent: the reference's Stop button stayed disabled for the whole text-to-image job, so **the reference offers no way to cancel an image job from the UI**.

## UI Mockup

N/A (no UI change; the deliverable is files under `docs/recon/2026-09-26/`). What lands:

```
docs/recon/2026-09-26/
  states/
    <state>@<width>.json     the 15 readings, verbatim apart from masking and query stripping
  snapshots/
    home-signed-in@1437.html the saved page, cleaned: no scripts, no handlers, identity masked,
                             stylesheet links pointing at ../assets/css/ (filled by STORY_003)
  capture-notes.md           notes.md and the summary, copied verbatim
  manifest.json              one entry per state: state, width, viewport, source, file, date
  coverage.md                the full state list from EPIC_001's scope, each marked captured or
                             not captured, with the reason
```

## Acceptance Criteria

- [x] `recon/run.sh curate 2026-09-26` runs in the recon container (CHORE_001), **makes no network request**, reads only `recon/out/2026-09-26/`, and writes the layout above.
- [x] **Readings:** each `extension/<state>@<width>.json` except `network-endpoints.json` is parsed, checked against a schema (state name, url path, viewport, and components that each have a name and a box; `selector` and `style` are checked for type when present, because 43 of the 206 components carry no selector and 83 carry no style), and written to `states/` with the same name. A reading that fails the schema stops the run and names the file and the field. Any URL inside a reading loses its query string and hash. File names must match `<state>@<width>.json` with the state in `[a-z0-9-]`.
- [x] **Snapshot:** `Qwen.html` is written to `snapshots/home-signed-in@1437.html` with these changes:
  - every `<script>` element, inline event handler and `on*` attribute removed;
  - the avatar image's `src` replaced by a neutral placeholder, and the display name replaced by `Owner`;
  - `./Qwen_files/<name>.css` links rewritten to `../assets/css/<name>.css`;
  - the logo's `./Qwen_files/qwen-logo*.svg` rewritten to `../assets/brand/` (filled by STORY_003); every other `./Qwen_files/` reference left as a dead relative link and listed in the run's output. The saved page does not state the other files' CDN URLs.

  The inline `<style>` elements and the four icon sprites stay, so the snapshot renders its icons by itself.
- [x] **Identity guard:** the script reads the owner's display name from the saved page's user button at run time and **refuses to write anything** if that string, or the avatar's data URI, appears in any output file. It prints only the verdict, never the name. The same check runs over `states/` and `capture-notes.md`.
- [x] **Notes:** `notes.md` and `notes-extension-summary.md` are copied verbatim into `capture-notes.md` under two headings, and pass the identity guard. The recon folder is never edited by hand ([CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded)); a correction means re-running the script.
- [x] **Manifest:** `manifest.json` has one entry per state file and per snapshot, in a stable order. Each entry records:
  - the state, the width and the viewport;
  - the source (`extension-reading` or `owner-save-page`);
  - the URL path, with ids replaced by `:id`;
  - the capture date;
  - for desktop, the note that the owner's browser was at 125% zoom and that values are CSS px.
- [x] **Coverage:** `coverage.md` lists every state named in EPIC_001's scope at both widths, and marks each **captured** (with its file) or **not captured** (with the reason, taken from the notes). The not-captured list must include at least:
  - `job-cancelled`: the reference has no UI cancel for image jobs;
  - `job-failed`, `job-moderated` and any quota wall: none occurred;
  - upload progress: not visible at read time;
  - the full-resolution result size: not exposed;
  - `history-empty`: My Library appears only once an image exists, so the empty state is the sidebar without it;
  - `edit-generating`: not read;
  - at 393: image mode, the option dropdowns, typed, reference attached and download.

  EPIC_003 sketches every not-captured state in ASCII ([CLAUDE.md → §3 item 6](../../CLAUDE.md#3-how-features-are-built-important)).
- [x] Re-running the script produces byte-identical output.
- [x] `git status --short` after the run shows only `docs/recon/2026-09-26/` and the recon source changes, and never anything under `recon/out/`.
- [x] Root `pnpm typecheck` and `pnpm test`, run through `recon/run.sh typecheck` and `recon/run.sh test`, pass.

## Corrections before implementation (2026-09-26)

These were made on reading the files, before any code was written ([CLAUDE.md → §3 item 8](../../CLAUDE.md#3-how-features-are-built-important)):

- The readings number 15, not 17. The other files in `extension/` are the endpoint list and two notes files.
- The schema requires a name on every top-level component and a name, text or aria label on nested ones. A box, when present, holds numbers for whichever of x, y, width and height were read, at least one of them (three partial boxes occur), or is `null` or a note such as "not measured". The first run showed 25 components with no box: hover overlays that were hidden when read, groups, and tabs read by their text alone. Requiring a box everywhere would have rejected the capture for describing what it saw.
- The page does not state the CDN URLs of `Qwen_files/`, so only the logo is relinked, to `assets/brand/`.

## Technical Notes

- HTML is parsed with `parse5` (a recon devDependency, installed in the container, not on the host), never with regular expressions. The cleaner walks the tree and serialises it back out.
- The avatar is found by `img.user-img` and the display name by the text of `.user-menu-btn-text` inside the sidebar's `button.user-menu-btn`. If either selector finds nothing, the run stops. A missed mask must fail loudly, not pass silently.
- The 125% zoom does not change CSS px values; it only makes the window narrower in CSS px than it looked (1437 rather than about 1800 device px). The saved page's `html` element carries an inline `font-size: 13.3973px`, which the reference computes from the viewport. The snapshot keeps it as saved.
- No screenshots means clone stories cite a reading and the snapshot instead of a picture. EPIC_003's side-by-side review ([CLAUDE.md → §6 rule 8](../../CLAUDE.md#6-key-rules)) compares our page with the owner's live view of the reference.
- `run.sh` gains `curate` (and STORY_003's `harvest`) as allowed commands. Both take the date as their only argument.

## Testing Plan

- **Unit**
  - `recon/src/curate-model.test.ts`:
    - a valid reading passes the schema; a reading with a missing `components`, a missing box, or a state name with an upper-case letter fails and names the field;
    - query strings and hashes are removed from nested URLs, and other strings are untouched;
    - `/c/<uuid>` becomes `/c/:id`;
    - manifest entries come out in a stable order whatever order the files were read in;
    - coverage marks a state captured only when its file exists at that width, and every not-captured state carries a reason.
  - `recon/src/snapshot.test.ts`, run on a small fixture page that imitates the saved one (a user button, an `img.user-img` with a data URI, a script, an `onclick`, a sprite, two `./Qwen_files/` links):
    - scripts and handlers are removed;
    - the avatar and the name are replaced;
    - CSS links point at `../assets/css/`;
    - the sprite survives unchanged;
    - a page with no user button makes the cleaner throw rather than return.
  - `recon/src/identity-guard.test.ts`: the guard finds the name inside text, inside an attribute and inside JSON, and finds the data URI. It passes clean output. Its error message never contains the name.

  These prove every rule that decides what gets committed.
- **Integration**: N/A. The script reads local files and writes local files, and the unit tests cover it through fixtures. There is no server or store to integrate with.
- **E2E**: N/A. There is no product UI. Manual steps:
  1. The assistant runs `recon/run.sh curate 2026-09-26` and reads `coverage.md` against the notes.
  2. The assistant opens the snapshot after STORY_003 has filled `assets/css/` and confirms it renders as the dark signed-in home.
  3. **The owner skims the snapshot and `states/` and confirms nothing identifies them before anything is committed.**

## Estimated Complexity

S–M: one offline script, three pure modules, three test files.

## Done (2026-09-26)

- `recon/run.sh curate 2026-09-26` wrote 19 files: 15 readings, the snapshot, `capture-notes.md`, `manifest.json` and `coverage.md`. The identity guard reported clean. A second run was byte-identical.
- The snapshot had 28 scripts removed. Three local references stay dead: the mobile-app download guide images, which are out of scope.
- **Found on the first real run and fixed before landing.** The saved page's My Library thumbnails linked to images generated on the reference (`cdn.qwenlm.ai/output/<id>/…`), with item ids beside them. The cleaner now replaces those with a neutral placeholder and `:id`, and the guard fails on any such link. The readings were already masked by the extension.
- Two chat titles remain in the snapshot's sidebar. Both are the recon chats (the edit and the text-to-image run), not the owner's wider history.
- **The owner's review happened after the push, by the owner's choice (2026-09-26):** commit and push, then review. The manual render check of the snapshot runs once STORY_003 has filled `assets/css/`, and is recorded there.
- Gate: `recon/run.sh typecheck` and `recon/run.sh test` (46 tests) were green, run by hand; there is no pre-push hook yet.
