# BACKLOG_002 — The dropdown rows are under the touch-target size on phones

**Priority:** Low (an observation, not a report of a mis-tap)

- **Summary:** measured on 2026-10-02 at the iPhone 13 width during STORY_021's manual check: every row of the Add-on dropdown is 36 px tall (the list of six sat at y 357–603, inside the viewport). The model and aspect-ratio dropdowns share the same lifted markup and CSS, so their rows are the same. [CLAUDE.md §6 rule 9](../../CLAUDE.md#6-key-rules) asks for touch targets of 44 px or more on touch branches.
- **User impact:** a row is 8 px short of the rule. Nobody has reported a mis-tap; the dropdowns have been this size since STORY_010.
- **Rough scope:** either a phone-only rule raising the row height (a departure from the reference, written up as such), or a written decision that the lifted size stands because fidelity wins here. Either way it is one CSS rule or one sentence, plus the narrow e2e asserting the chosen height.
- **Dependencies:** none. The reference capture to compare against is `docs/recon/2026-09-26/states/composer-image-mode@1437.json`.
- **Open questions:** Does the reference itself render 36 px rows on a phone? Re-measure the capture at the narrow width before deciding, so a departure is a choice and not a miss.
