# BACKLOG_003 — The owner rates each LoRA in categories of their own

**Priority:** Low (deferred by the owner on 2026-10-16: "this is good for right now, axe the rating")

- **Summary:** the owner's first ask for STORY_030 was their own 1–5 star rating per LoRA, in categories they define (free text, never a hardcoded list), plus a short note, stored with each entry in `spark/loras.json` and shown on the LoRA's info card. A LoRA without ratings would read "Not rated yet". While drafting, the owner kept the card but replaced the ratings with a "Made for" line from each creator's page. This item keeps the ratings from being forgotten.
- **User impact:** the card says what each LoRA is for in its creator's words, but not how well it did in the owner's hands. The bench scorecard (`docs/bench/2026-10-02_add_on_anatomy_scorecard.md`) holds that judgement today, outside the app.
- **Rough scope** (as drafted on 2026-10-16, before the cut):
  - A `review: { ratings: [{ category, stars }], note }` field per manifest entry. It is separate from the existing `note`, which is install provenance.
  - Limits: whole stars 1–5, up to 12 categories of 40 characters, repeats dropped case-insensitively, a note of up to 500 characters.
  - The ratings added to the contract's `info` object (STORY_030's v1.4), and a ratings block on the card using the harvested `qwpcicon-star` / `-star-fill` (`appicon-` on the phone), each star group named "N out of 5".
  - Optionally, the server re-reads the review on each capabilities request, so a rating edit shows without a model restart.
- **Dependencies:** STORY_030 (the card and the `info` object) must land first.
- **Open questions:**
  - The owner's intended categories, discussed on 2026-10-16: "Front view" and "Back view" (nude anatomy seen from the front and from behind). Possibly Body, Fidelity, Artefacts and Undresses, after the scorecard's columns.
  - Is a restart per rating edit acceptable, or is the live re-read worth its complexity?
