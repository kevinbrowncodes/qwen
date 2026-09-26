# STORY_002 — Every state of the image generation flow is captured as dated screenshots

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** Not started (after STORY_001)
**Created:** 2026-09-26

As the assistant building the clone, I want a dated screenshot of every state of the reference's image generation flow, at the wide and the narrow width, so that each clone story can cite the exact picture it must match.

## Current state

Only the logged-out home has been observed (2026-09-26; see [EPIC_001 → What was observed](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md#what-was-observed-before-any-story-2026-09-26-logged-out-1440900-headless-desktop-chromium)). **No image-generation control is visible logged out**, so where image mode lives — the composer's Auto selector, the + menu, a route, or somewhere else — is this story's first question. **This section and the capture list below are amended after the first authenticated look, before implementation** ([CLAUDE.md → §3 item 8](../../CLAUDE.md#3-how-features-are-built-important): an AC written against an unobserved surface is a guess).

## UI Mockup

N/A (no UI change; the deliverable is `docs/recon/<date>/`). The capture list is the mockup — the part-1 names are provisional until the authenticated amendment:

```
Automatable without a generation (part 1 — this story's first run):
  home-signed-in            the home as the owner sees it
  composer-image-mode       image generation mode entered, however it is entered
  <option>-open             one capture per option control the mode exposes (enumerated on the day)
  composer-typed            our own prompt typed (never sent)
  history-empty             wherever past generations live, in its empty state
  narrow-*                  the same states at 390px

Needs a real generation (part 2 — after the owner approves N):
  job-submitted             immediately after submit
  job-generating            frames every few seconds while it runs
  job-done                  the result image rendered in place
  result-download           the download affordance
  history-one-image         the history/gallery with the generated image
  job-cancelled             submit then cancel (only if N allows)
  job-failed / job-moderated  whatever failure states the run actually produces
```

## Acceptance Criteria

- [ ] `pnpm recon:capture` reuses the STORY_001 session, **refuses to run unless the session reads signed-in**, and captures every part-1 state above to `docs/recon/<YYYY-MM-DD>/<state>@<width>.png`, at 1440 and 390 wide as listed.
- [ ] Each run writes `manifest.json` beside the screenshots: state, width, URL path (never a query string), capture time, and whether the state was reached automatically or by the owner.
- [ ] The run performs **no generation** unless started with `--generate N`; without the flag the submit control is never clicked and Enter is never pressed in the composer. Part-2 states are a separate run once the owner has approved N (recorded in the Done note).
- [ ] Before every screenshot, any account identifier the page shows (display name, e-mail, avatar alt) is masked in the page (the site is not changed — only the page in our browser), so committed captures carry no account identity.
- [ ] Throughout the run, first-party network traffic (method, host, path with ids replaced by placeholders, status, content type; JSON response bodies) is appended to `recon/out/<date>/network.jsonl` as raw material for STORY_004. Analytics, anti-bot and pixel hosts are excluded. Nothing under `recon/out/` is committed.
- [ ] The composer is left as it was found: typed text removed before the run ends.
- [ ] Failure and quota walls are matched by their **observed wording**, captured as their own states, and stop the run cleanly ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over), last lesson).
- [ ] Unit tests cover the pure helpers (file naming, manifest entries, query-string stripping, id placeholders, noise-host filtering) and pass with `pnpm test`.

## Technical Notes

- One persistent context → one viewport at a time; narrow states are taken by resizing the same page to 390×844 and reloading. This gives layout, not touch semantics; STORY_003's breakpoint pass and EPIC_003's e2e use device descriptors.
- The part-2 flow is written after the owner approves N, against what the first submitted job actually shows; guessing the job page's structure now would violate [CLAUDE.md → §3 item 8](../../CLAUDE.md#3-how-features-are-built-important).
- The reference sits behind Alibaba's anti-bot stack; the run browses at a human pace and stops on any challenge.

## Testing Plan

- **Unit** — `recon/src/capture-plan.test.ts`: screenshot file naming builds `<state>@<width>.png` and rejects names outside `[a-z0-9-]`; manifest entries keep the path and drop the query string and hash; the date stamp formats a local date as `YYYY-MM-DD`. `recon/src/network-log.test.ts`: the noise filter drops the analytics/anti-bot hosts observed on 2026-09-26 and keeps the reference origin; path sanitising replaces UUIDs and long ids with placeholders and drops the query.
- **Integration / E2E** — N/A (third-party site behind a login; generations spend quota). Manual: the assistant runs part 1 and reviews every screenshot against the list; the owner reviews the committed set and approves N for part 2.

## Estimated Complexity

M
