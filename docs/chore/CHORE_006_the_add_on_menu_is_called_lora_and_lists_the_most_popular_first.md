# CHORE_006 — The add-on menu is called LoRA and lists the most popular first

**Status:** Done 2026-10-16. The order landed first, at the owner's request ("for the dropdown can you order them in greatest downloads to least as well"), with that day's counts; the rename followed the same day on the owner's "please proceed with completing the story and remaining items". Both show on the model server's next restart for the order; the rename is in the app at once, and in the PNG's text and the bench's template from that restart

## Summary

The owner asked on 2026-10-07 for the composer's "Add-on" dropdown to say **LoRA**, which is what every entry is, and for the LoRAs to be listed by popularity, most popular first.

## Why

"Add-on" hid what the entries are. They are all LoRAs on the one checkpoint, and the owner and every source page call them that. With seven to choose from, the most-used ones should come first.

## Changes

- [x] **The label.** The composer's dropdown is named and labelled "LoRA" (its accessible name, its trigger's fallback text and the phone icon's label), and "None" stays first. User-facing text elsewhere that says "add-on" for these says "LoRA": the README, `spark/README.md`, and the scorecard template the bench writes. Code identifiers (`lora`, `loras.json`) already say LoRA; the contract field stays `lora`.
- [x] **The order.** `spark/loras.json` is reordered by downloads as read on 2026-10-07 from each creator's page (Civitai per version; Hugging Face for `uncensored`, the only one not on Civitai), and each entry gains `downloads` and `downloadsReadOn` so the order is explained in the file. The server already lists LoRAs in manifest order, so the dropdown follows. *(Landed 2026-10-16 with that day's counts, re-read live: 26,015, 8,301, 4,129, 1,971, 1,825, 872 and 831, in the same order as below. `uncensored`'s is its Hugging Face mirror's, which reports the last 30 days.)*
  1. `nsfw-thesealpacas-v2`, 18,951
  2. `nsfw-f23gg` (TheseAlpacas v1.0), 7,620
  3. `erect-friendofmale`, 3,115
  4. `penis-coachbate`, 1,479
  5. `uncensored`, 1,070
  6. `uncut-coachbate`, 694
  7. `flaccid-lonelycoyote`, 605
- [x] **The order is a snapshot,** not live: counts change, and refreshing them is a manual re-read and reorder. The README says so.

## Testing

- **Unit:** `loras.test.ts` gains a case that the parser keeps manifest order and ignores the two new fields (as landed: *reads* them, since STORY_030 shows them on the info card); a test over the committed `spark/loras.json` asserts its entries are sorted by `downloads`, descending, so a later edit cannot break the order silently.
- **Integration:** none new; capabilities pass-through already covers the order the server sends.
- **E2E:** `image-mode.spec.ts` and `generate.spec.ts` find the dropdown by its new name, "LoRA", at both widths. Nothing else changes in them, and staying green covers the rest of the composer.
- **Manual:** on http://localhost:3100, the dropdown reads "LoRA" and lists None, then the seven in the order above, at desktop and iPhone 13 widths.

## Done note (2026-10-16)

- **Also renamed, beyond the list above, so nothing on screen still says "add-on":** the Info panel's row (STORY_024), the `LoRA:` line the model server writes into each PNG (it must match the panel's Copy all word for word), the two error messages a refused or unloaded LoRA shows, and STORY_030's card button ("Use this LoRA"). Log lines, code comments, identifiers and the contract's prose keep "add-on"; the contract field stays `lora`.
- **Tests:** the cases that asserted the old wording now assert the new: `generate.spec.ts` and `image-mode.spec.ts` find the dropdown as "LoRA"; `generation-settings`, `SettingsPanel`, `parameters`, `server` and `bench` tests read "LoRA". The order test is in `loras.test.ts` (the committed manifest stays sorted by `downloads`).
- **Gate:** green on the pre-push hook for both commits.
