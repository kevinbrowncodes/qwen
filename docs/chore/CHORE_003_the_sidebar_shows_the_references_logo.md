# CHORE_003 — The sidebar shows the reference's logo

**Status:** Done (2026-09-27)
**Relates to:** [STORY_003](../story/STORY_003_the_references_stylesheets_icons_fonts_and_brand_assets_are_harvested_into_the_repo.md) (Brand AC), [STORY_009](../story/STORY_009_the_home_screen_is_laid_out_like_the_reference_from_its_own_stylesheets.md) (its logo departure)

## Summary

The owner copied the saved page's `Qwen_files/` onto the Spark. The harvest now lifts `qwen-logo-dark.svg` into `docs/recon/2026-09-26/assets/brand/`, `pnpm reference:sync` serves it from `app/public/reference/`, and the sidebar shows it in place of the "Qwen Local" text that stood in for it.

## Why

It closes STORY_003's last unticked AC, and STORY_009's departure: "the logo waits for the owner's `Qwen_files/`".

## Changes

- [x] `recon/run.sh harvest 2026-09-26` (after the BUG_007 fix) writes `assets/brand/qwen-logo-dark.svg`. The identity guard reported clean.
- [x] `pnpm reference:sync` copies it to `app/public/reference/`. The sync's test checks the copy is current.
- [x] The sidebar renders `img.logo-img` (alt "Qwen"), sized by the reference's own `.sidebar-header-wrapper .logo-img` rule at 75×20. The `clone-logo-text` stand-in is removed.

## Testing

- **Unit:** `recon/src/reference-sync.test.ts` already requires every file the sync builds (now including the logo) to be committed and current.
- **Integration:** N/A. There is no route or handler change.
- **E2E:** `home.spec.ts` (desktop) now asserts that the logo loads (non-zero `naturalWidth`) and settles at 75×20. The other specs are unchanged and stay green.
