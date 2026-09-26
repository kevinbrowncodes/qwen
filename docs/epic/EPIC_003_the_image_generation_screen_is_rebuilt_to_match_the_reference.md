# EPIC_003 — The image generation screen is rebuilt to match the reference

**Status:** In progress (started 2026-09-26)

## Goal

Our own implementation of the MVP flow from [README.md → MVP Scope](../../README.md#mvp-scope), each surface a clone story citing its EPIC_001 capture, built against the stub generation server, with the model endpoint as configuration.

## Stories

Drafted from EPIC_001's component inventory, one per surface/state group, numbered in implementation order. Every story carries a **Departures from the reference** section ([CLAUDE.md → §6 rule 8](../../CLAUDE.md#6-key-rules)) — expected departures already known: options the reference exposes that only make sense against Alibaba's cloud, and any limit Qwen-Image-2.1 on the Spark imposes (resolutions, generation time) that their cloud does not.

### The stories (drafted 2026-09-26, self-approved under the owner's overnight authorisation)

Every story cites the 2026-09-26 capture (`docs/recon/2026-09-26/`), and the departure entries come from `interactions.md`'s mapping table.

| # | Story | Status |
| --- | --- | --- |
| 009 | [The home screen is laid out like the reference, from the reference's own stylesheets and icons](../story/STORY_009_the_home_screen_is_laid_out_like_the_reference_from_its_own_stylesheets.md) | Done 2026-09-26 |
| 010 | [The composer enters image mode and offers the model and the aspect ratio](../story/STORY_010_the_composer_enters_image_mode_and_offers_the_model_and_aspect_ratio.md) | Done 2026-09-26 |
| 011 | [Reference images can be attached to the composer for an edit](../story/STORY_011_reference_images_can_be_attached_for_an_edit.md) | Done 2026-09-26 |
| 012 | [A generation runs in place, from submit to the finished image, and can be cancelled](../story/STORY_012_a_generation_runs_in_place_from_submit_to_the_finished_image.md) | Done 2026-09-26 |
| 013 | [Past generations are listed in the sidebar and in My Library, and can be reopened, downloaded or removed](../story/STORY_013_past_generations_are_listed_and_reopened_from_the_sidebar_and_my_library.md) | Not started |
