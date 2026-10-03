# STORY_023 — The add-ons that passed stay at the settings that worked, and the rest are removed

**Epic:** [EPIC_005](../epic/EPIC_005_more_add_ons_are_installed_and_tested_for_correct_anatomy.md)
**Status:** Not started. Its input is the owner's filled-in scorecard from STORY_022; nothing here is done before that.
**Created:** 2026-10-02 (drafted overnight; to be approved by the owner with the scorecard)

As the owner, I want the manifest to keep only the add-ons my scorecard passed, at the strength and guidance that worked, with the others gone from the manifest and from disk, so that the composer's Add-on dropdown offers only choices worth making and the worker loads nothing it does not need.

## Current state

To be read when the story starts, not assumed: the decision table in the scorecard under `docs/bench/`, `spark/loras.json`, `spark/fetch-loras.sh status`, and the worker's `ready` line in `docker logs qwen-model`.

As of 2026-10-02: seven add-ons are listed, five are on disk and loaded (`nsfw-f23gg`, `uncensored`, `penis-coachbate`, `uncut-coachbate`, `nsfw-thesealpacas-v2`), and two (`erect-friendofmale`, `flaccid-lonelycoyote`) wait for a Civitai token. If the token arrives first, STORY_022's bench is re-run for the two new columns before this story decides anything about them.

## UI Mockup

N/A (no UI code changes). The Add-on dropdown shrinks by data to the kept add-ons.

## Acceptance Criteria

- [ ] **The input is the scorecard's decision table,** filled in by the owner, with a keep/drop, a strength and a guidance per add-on, and a reason. The story quotes it in the Done note.
- [ ] **A kept add-on stays in the manifest** with the strength and guidance the table names. If a kept add-on's guidance changes, the Done note records one generation with it at the new value.
- [ ] **A dropped add-on is removed from the manifest** and its directory under `models/loras/<id>/` is deleted, each named with its size in the Done note, **with the owner's say-so in that session** ([CLAUDE.md §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark): nothing under the models directory is deleted without it).
- [ ] **TheseAlpacas v1 against v2:** if v2 is kept and v1 (`nsfw-f23gg`) is not, v1 goes; the manifest never lists both as kept unless the table says so.
- [ ] **The model is restarted** when no job is running, and `/capabilities` lists exactly the kept add-ons.
- [ ] **The README's add-on row and `spark/README.md`** name the kept add-ons and their settings, and the epic records the decision and its date.

## Technical Notes

- No code changes are expected: the manifest format, the fetch script, the worker and the app all stay as STORY_021 left them. If the table asks for something the manifest cannot say (a negative prompt, a strength per use), that is a new story.
- `spark/fetch-loras.sh verify` after the edit confirms every kept file still matches its checksum.

## Testing Plan

- **Unit / Integration:** none new. The manifest's shape does not change, so `loras.test.ts` and `fetch-loras.test.ts` cover the parser and the fetch as before; both must stay green.
- **E2E:** none new. `image-mode.spec.ts` (the add-on dropdown against the stub's two fake add-ons) must stay green.
- **Manual, on the Spark** (recorded in the Done note): `spark/fetch-loras.sh status` and `verify` after the edit; the restart's `ready` line; `/capabilities`; one text-to-image with each kept add-on finishing without an error in the worker's log.

## Estimated Complexity

S
