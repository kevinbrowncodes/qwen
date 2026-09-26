# BUG_002 — The snapshot renders unstyled when opened from disk

**Status:** Resolved (2026-09-26)
**Found in:** [STORY_002](../story/STORY_002_every_captured_state_of_the_image_generation_flow_is_filed_as_a_dated_spec.md), during [STORY_003](../story/STORY_003_the_references_stylesheets_icons_fonts_and_brand_assets_are_harvested_into_the_repo.md)'s manual render check

## Summary

With the harvested stylesheets in `assets/css/`, opening `snapshots/home-signed-in@1437.html` shows the reference's text on a dark background with no layout at all. The stylesheet links carry the reference's `crossorigin` attribute, and Chromium refuses a cross-origin stylesheet load from a `file://` page, so none of the nine stylesheets applies. Separately, the page links `index46.css`, which the owner's save did not include, and the cleaner did not report it as missing.

## Steps to Reproduce

1. Run `recon/run.sh curate 2026-09-26`, then `recon/run.sh harvest 2026-09-26`.
2. Open the snapshot in headless Chromium at 1437×1031 and take a screenshot.

## Expected vs Actual Behaviour

- **Expected:** the dark signed-in home, laid out: a sidebar, and the centred heading and composer.
- **Actual:** unstyled document flow. The only reference styling left is the page background, which comes from an inline style on the html element.

## Root Cause

The cleaner rewrote the link targets but kept `crossorigin=""`, which was harmless on the CDN and fatal from disk. It also relinked every `.css` without checking that a harvested file exists.

## Acceptance Criteria

- [x] Relinked local `link` and `img` elements lose `crossorigin`.
- [x] A stylesheet link with no saved file is listed as a dead link in curate's output.
- [x] Unit tests cover both.
- [x] The re-rendered snapshot shows the laid-out home (checked by screenshot; recorded in STORY_003's Done note).

## Resolution

Fixed in `recon/src/snapshot.ts` (the `availableCss` option, and dropping `crossorigin` on local targets), with tests in `snapshot.test.ts`. `index46.css` is now reported dead. It was never saved, and fetching it would need a request to the reference's CDN.
