# STORY_030 — Each LoRA has an info card saying what it was made for

**Epic:** [EPIC_005](../epic/EPIC_005_more_add_ons_are_installed_and_tested_for_correct_anatomy.md) (a follow-up the owner asked for on 2026-10-16, to compare LoRAs before choosing one)
**Status:** Implemented 2026-10-16 (approved by the owner that day: "create please proceed with completing story 30", started while STORY_028 waits on the owner's Mac-side steps). The app is deployed; the model server's restart onto contract v1.4, and the manual check on the Spark, are pending (see the Done note)
**Created:** 2026-10-16

As the owner, I want a small info button beside each LoRA in the composer's LoRA dropdown that opens a card saying what the LoRA was made for, in its creator's words, what is known of its capability on the penis and the anus, and the facts the repo already keeps about it, so that I can see at a glance what each LoRA is for before I pick one.

**Scope change while drafting (2026-10-16):** the owner first asked for their own 1–5 star ratings per category, with a note. While drafting, they replaced that with a "Made for" line taken from each creator's page ("this is good for right now, axe the rating"). At approval, the owner added a **Capabilities** section: for the penis and the anus, what the creator claims and what the bench showed, with "not tested" where there is no data. The ratings are recorded in [BACKLOG_003](../backlog/BACKLOG_003_the_owner_rates_each_lora_in_categories_of_their_own.md) so they are not lost.

## Current state

Read on 2026-10-16:

- **The dropdown knows only an id and a label.** `Composer.tsx` builds the add-on dropdown's items as `{ id, label }` (plus a leading "None"). `Dropdown.tsx`'s `DropdownItem` is `{ id, label, icon? }`, and each item is a `role="option"` row whose click picks it. Nothing in the row can be clicked without picking. The same `Dropdown` also serves the model, ratio and count menus.
- **The app reads only `id` and `label` per LoRA.** `parseCapabilities` (`app/lib/composer-state.ts`) keeps `{ id, label }` and drops every other field. `LoraOption` has those two fields only. `useCapabilities` (the Info panel, STORY_024) uses the same parser.
- **The app's route passes capabilities through untouched** (`app/app/api/capabilities/route.ts`), so new fields reach the browser without changes there.
- **The model server sends only `id` and `label`.** `capabilities()` in `spark/model-server/src/server.ts` maps the loaded LoRAs to `{ id, label }`. Its `Capabilities` type (`validation.ts`) says the same.
- **The manifest is read once, at startup** (`spark/model-server/src/main.ts` calls `installedLoras`). A change to `spark/loras.json` reaches the app after a model server restart. This story keeps that: the card's facts change rarely, so they ride the next restart.
- **What `parseManifest` keeps** (`spark/model-server/src/loras.ts`): `id`, `label`, `file` (as `path`), `scale`, `trigger`, `guidance`. It ignores `source`, `sha256`, `origin`, `license`, `readOn` and `note`.
- **What `spark/loras.json` holds today, against what the card wants to show:**
  - *Source page:* `origin` on all seven entries.
  - *Trigger word:* `trigger` on one entry (`flaccid-lonelycoyote`).
  - *Strength:* `scale` on all seven.
  - *Guidance:* `guidance` on three.
  - *Creator:* **no field.** The creator appears only inside the label's parentheses and the `note` prose.
  - *Downloads:* **no field.** CHORE_006, still a draft, is the change that adds `downloads` and `downloadsReadOn`.
  - *Made for:* **no field.** The existing `note` is provenance prose written while installing (mirrors, checksums, the creator's settings), not a description of what the LoRA is for.
- **What the creators say,** read on 2026-10-16 from each creator's page: the five Civitai models through `https://civitai.com/api/v1/models/<id>`, and Uncensored's model card on Hugging Face. Each page describes what its LoRA was trained on or is for, except two. Uncensored's card describes file formats only. TheseAlpacas' page now describes v2 only, because v2 replaced the shared description two days after v1.0 was published (the f23gg mirror's card, v1.0's showcase images and the Wayback Machine have nothing more).
- **Uncensored's creator is abenzerps, not JoyFusionAI.** The JoyFusionAI repo's card says it is a mirror of `abenzerps/Qwen-Image-2.1-Uncensored-GGUF` (which now redirects to `abenzerps/Qwen-Image-2.1-Uncensored-Quantized`).
- **The only test data is the 2026-10-02 bench** (`docs/bench/2026-10-02_add_on_anatomy_scorecard.md`): four clothed subjects each edited with "remove all clothing", and one frontal nude text-to-image, per LoRA. Its marks are the **assistant's review of 2026-10-11, not yet confirmed by the owner** (the file says so, and is uncommitted in the working tree). It judged the penis only: no prompt showed the anus, so nothing about the anus has been tested. Erect penis (FriendOfMale) and Flaccid uncut (LonelyCoyote) were installed after it and have no results.
- **The stub** (`tools/stub-generation-server/src/server.ts`) offers two fake LoRAs, `fake-detail` and `fake-style`, as `{ id, label }`. Their scale, guidance and trigger live in `FAKE_LORA_SETTINGS`: `fake-detail` has a trigger and guidance, `fake-style` has neither.
- **The contract** (`docs/contracts/job-api.md`) is at v1.3. Its `loras` entries are `{ id, label }`, and "the strength each is applied at is the server's own setting".
- **Icons:** the served sprite (`app/public/reference/sprite.svg`) has `qwpcicon-info` and `appicon-info`, listed in `docs/recon/2026-09-26/assets/icons/index.md`.
- **Touch area precedent:** on the phone, the icon-only trigger's 24×32 box reaches 44×44 through a `::before` with `inset: -6px -10px` (`app/app/globals.css`). The e2e in `image-mode.spec.ts` measures it.
- **Dropdown rows are 36 px tall on the phone** ([BACKLOG_002](../backlog/BACKLOG_002_dropdown_rows_are_under_the_touch_target_size_on_phones.md)), so a 44 px touch area for the info button reaches 4 px into the rows above and below.
- **The reference has no such control.** chat.qwen.ai offers no LoRAs at all (`docs/recon/2026-09-26/inventory.md`).

## How this pairs with CHORE_006

CHORE_006 (rename "Add-on" to "LoRA", order by downloads, add `downloads` and `downloadsReadOn`) is a draft awaiting approval. **This story does not assume it has landed.**

- **Recommended order: CHORE_006 first.** It is smaller, it supplies the downloads figures this card shows, and it settles the word. This story is written in that vocabulary ("LoRA").
- **If this story starts first:** the dropdown's accessible name stays "Add-on" (the e2e here finds it by whatever name it has), the card's new strings say "add-on" so the screen does not use two words for one thing, and the Downloads row is simply absent, because every fact row except Trigger, Strength and Guidance is optional (AC 9). CHORE_006 then renames these strings along with the rest.
- **One test conflicts.** CHORE_006's Testing section says the parser "ignores the two new fields". This story makes the parser read them. Whichever lands second changes that case to "reads them".

## UI Mockup

**Reference capture:** none, because the reference has no LoRA menu or info control (`docs/recon/2026-09-26/inventory.md`). The card is built from the dropdown's own lifted classes (`.qwen-chat-v2-dropdown-menu-popup` for the surface, its radius, shadow and item padding) and the harvested info icons. It introduces no new colours: "Made for" and the fact labels use the stylesheet's secondary text colour, and the values use the item text colour.

**Desktop (1437 wide).** The info button sits at the right end of each LoRA row, after the label and before the selected check. "None" has no button.

```
                       ┌──────────────────────────────────┐
                       │  None                         ✓  │
                       │  NSFW v2 (TheseAlpacas)       ⓘ  │
                       │  NSFW (f23gg)                 ⓘ  │
                       │  Erect penis (FriendOfMale)   ⓘ  │
                       │  …                               │
                       └──────────────────────────────────┘
 [+] [▣ Create Image ×] [Qwen-Image 2.1 ▾] [16:9 ▾] [None ▾] [×1 ▾]      (➤)
```

Clicking ⓘ turns the same popup into that LoRA's card, in place of the list. It opens at the same anchor and is kept on screen the same way, 300 px wide on desktop. These are the cards for all seven LoRAs as they will read on the day this ships (in the app each replaces the list). Made for is AC 5's text, Capabilities is AC 17's, Creator is AC 5's, Source is `origin`, Strength, Guidance and Trigger are `spark/loras.json` today, and Downloads is CHORE_006's 2026-10-07 count. The order is CHORE_006's, most downloaded first:

```
┌──────────────────────────────────┐
│ ‹  NSFW v2 (TheseAlpacas)        │
│ ──────────────────────────────── │
│ Made for                         │
│ General NSFW for text-to-image   │
│ and edits. Mostly trained on     │
│ oral, cowgirl, doggystyle,       │
│ missionary, anal, penis, vagina, │
│ cum and dildos. Better anatomy   │
│ and realism than v1, per the     │
│ creator.                         │
│ ──────────────────────────────── │
│ Capabilities                     │
│ Penis                            │
│   Claimed Trained on it, among   │
│           other subjects.        │
│   Bench   Plausible in its one   │
│           undressed edit (1 of   │
│           4). Text-to-image:     │
│           short, partly merged.  │
│ Anus                             │
│   Claimed Trained on anal; page  │
│           tagged anus. Not male- │
│           specific.              │
│   Bench   not tested             │
│                                  │
│ * Bench: Assistant's review      │
│   (2026-10-11) of the 2026-10-02 │
│   bench; not yet confirmed by    │
│   the owner.                     │
│ ──────────────────────────────── │
│ Creator     TheseAlpacas         │
│ Source      civitai.com ↗        │
│ Downloads   18,951 (2026-10-07)  │
│ Trigger     —                    │
│ Strength    0.9                  │
│ Guidance    4                    │
│ ──────────────────────────────── │
│      [ Use this LoRA ]           │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ‹  NSFW (f23gg)                  │
│ ──────────────────────────────── │
│ Made for                         │
│ TheseAlpacas' general NSFW LoRA, │
│ first release ("experimental").  │
│ Page tags: sex acts, genitals,   │
│ toys. Replaced two days later by │
│ v2, which the creator says has   │
│ better anatomy and realism.      │
│ ──────────────────────────────── │
│ Capabilities                     │
│ Penis                            │
│   Claimed not stated             │
│   Bench   No edit undressed (0   │
│           of 4). Text-to-image:  │
│           plausible, scrotum     │
│           elongated.             │
│ Anus                             │
│   Claimed The page's anus tag,   │
│           shared with v2.        │
│   Bench   not tested             │
│                                  │
│ * Bench: Assistant's review      │
│   (2026-10-11) of the 2026-10-02 │
│   bench; not yet confirmed by    │
│   the owner.                     │
│ ──────────────────────────────── │
│ Creator     TheseAlpacas         │
│ Source      civitai.com ↗        │
│ Downloads   7,620 (2026-10-07)   │
│ Trigger     —                    │
│ Strength    1                    │
│ Guidance    default              │
│ ──────────────────────────────── │
│      [ Use this LoRA ]           │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ‹  Erect penis (FriendOfMale)    │
│ ──────────────────────────────── │
│ Made for                         │
│ More detailed, correct male      │
│ anatomy: the erect penis.        │
│ Suggested prompts: ejaculation,  │
│ penis pointing up, forward or    │
│ down, hairy crotch, anus. Paid   │
│ on Civitai for now.              │
│ ──────────────────────────────── │
│ Capabilities                     │
│ Penis                            │
│   Claimed The erect penis is its │
│           subject.               │
│   Bench   not tested             │
│ Anus                             │
│   Claimed A suggested prompt     │
│           only.                  │
│   Bench   not tested             │
│ ──────────────────────────────── │
│ Creator     FriendOfMale         │
│ Source      civitai.com ↗        │
│ Downloads   3,115 (2026-10-07)   │
│ Trigger     —                    │
│ Strength    1                    │
│ Guidance    default              │
│ ──────────────────────────────── │
│      [ Use this LoRA ]           │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ‹  Penis (CoachBate)             │
│ ──────────────────────────────── │
│ Made for                         │
│ Circumcised penises, soft and    │
│ hard, and cumshots, for text-to- │
│ image and edits. Uncut has its   │
│ own LoRA.                        │
│ ──────────────────────────────── │
│ Capabilities                     │
│ Penis                            │
│   Claimed Circumcised, soft and  │
│           hard.                  │
│   Bench   Plausible, slightly    │
│           short, in its one      │
│           undressed edit (1 of   │
│           4). Text-to-image:     │
│           plausible.             │
│ Anus                             │
│   Claimed not stated             │
│   Bench   not tested             │
│                                  │
│ * Bench: Assistant's review      │
│   (2026-10-11) of the 2026-10-02 │
│   bench; not yet confirmed by    │
│   the owner.                     │
│ ──────────────────────────────── │
│ Creator     coachbate            │
│ Source      civitai.com ↗        │
│ Downloads   1,479 (2026-10-07)   │
│ Trigger     —                    │
│ Strength    1                    │
│ Guidance    3                    │
│ ──────────────────────────────── │
│      [ Use this LoRA ]           │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ‹  Uncensored                    │
│ ──────────────────────────────── │
│ Made for                         │
│ No training subject stated: a    │
│ general uncensored LoRA for the  │
│ base model. Its card describes   │
│ file formats only.               │
│ ──────────────────────────────── │
│ Capabilities                     │
│ Penis                            │
│   Claimed not stated             │
│   Bench   No edit undressed (0   │
│           of 4). Text-to-image:  │
│           plausible.             │
│ Anus                             │
│   Claimed not stated             │
│   Bench   not tested             │
│                                  │
│ * Bench: Assistant's review      │
│   (2026-10-11) of the 2026-10-02 │
│   bench; not yet confirmed by    │
│   the owner.                     │
│ ──────────────────────────────── │
│ Creator     abenzerps            │
│ Source      huggingface.co ↗     │
│ Downloads   1,070 (2026-10-07)   │
│ Trigger     —                    │
│ Strength    1                    │
│ Guidance    default              │
│ ──────────────────────────────── │
│      [ Use this LoRA ]           │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ‹  Uncut penis (CoachBate)       │
│ ──────────────────────────────── │
│ Made for                         │
│ Uncut penises (foreskin), create │
│ or edit. A preview: the creator  │
│ stopped after three tries and    │
│ recommends their Krea 2 LoRA     │
│ instead.                         │
│ ──────────────────────────────── │
│ Capabilities                     │
│ Penis                            │
│   Claimed Uncut, a preview.      │
│   Bench   Undressed all 4 edits: │
│           plausible on two       │
│           subjects, small and    │
│           vague on two. Text-to- │
│           image: plausible.      │
│ Anus                             │
│   Claimed not stated             │
│   Bench   not tested             │
│                                  │
│ * Bench: Assistant's review      │
│   (2026-10-11) of the 2026-10-02 │
│   bench; not yet confirmed by    │
│   the owner.                     │
│ ──────────────────────────────── │
│ Creator     coachbate            │
│ Source      civitai.com ↗        │
│ Downloads   694 (2026-10-07)     │
│ Trigger     —                    │
│ Strength    1                    │
│ Guidance    3                    │
│ ──────────────────────────────── │
│      [ Use this LoRA ]           │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ ‹  Flaccid uncut (LonelyCoyote)  │
│ ──────────────────────────────── │
│ Made for                         │
│ Male genitals, flaccid and uncut │
│ (penis, scrotum, foreskin).      │
│ Needs the trigger word d3np3n1s. │
│ ──────────────────────────────── │
│ Capabilities                     │
│ Penis                            │
│   Claimed Flaccid and uncut.     │
│   Bench   not tested             │
│ Anus                             │
│   Claimed not stated             │
│   Bench   not tested             │
│ ──────────────────────────────── │
│ Creator     LonelyCoyote         │
│ Source      civitai.com ↗        │
│ Downloads   605 (2026-10-07)     │
│ Trigger     d3np3n1s             │
│ Strength    1                    │
│ Guidance    default              │
│ ──────────────────────────────── │
│      [ Use this LoRA ]           │
└──────────────────────────────────┘
```

- **Trigger, Strength and Guidance always show,** because the server always knows them. "—" means no trigger word. "default" means no guidance, in the Info panel's own wording (`settingText`, `app/lib/generation-settings.ts`).
- **Capabilities:** one block per subject, in manifest order. "Claimed" is what the creator's page says, or "not stated". "Bench" is what a bench showed, or "not tested". The footnote names whose judgement the bench line is, and is absent when no bench line exists.
- **A tall card scrolls inside itself** on desktop too, capped at the viewport's height less 16 px, with the header and "Use this LoRA" pinned.
- **Made for, Capabilities, Creator, Source and Downloads are left out when the manifest lacks them,** not shown as blanks. Before CHORE_006 lands, every card above simply has no Downloads row.
- **The LoRA already in use:** the button reads "In use" and is disabled.
- **‹ (back)** returns to the list with the same row active. Escape closes the whole dropdown, as it does today.

**Narrow (iPhone 13, 390 × 664 viewport).** The trigger is the toolbox icon, and the popup opens upward from the pinned composer. Rows are unchanged except for the ⓘ, which has a 44 × 44 touch area:

```
┌──────────────────────────────────────┐
│                                      │
│   ┌──────────────────────────────┐   │
│   │ None                      ✓  │   │
│   │ NSFW v2 (TheseAlpacas)    ⓘ  │   │  ⓘ: 24×24 icon, 44×44 touch area
│   │ NSFW (f23gg)              ⓘ  │   │
│   │ …                            │   │
│   └──────────────────────────────┘   │
│ ┌──────────────────────────────────┐ │
│ │ Ask Qwen                    [×1] │ │
│ │ [+] [▣ ×] [Model 2.1▾] [16:9▾] 🧰 (➤)│
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

The card on the phone is the full viewport width less 8 px each side (374 px). Its height is capped at the space above the composer: a card that does not fit scrolls inside itself, with the header and "Use this LoRA" pinned.

```
┌──────────────────────────────────────┐
│ ┌──────────────────────────────────┐ │
│ │ ‹  Flaccid uncut (LonelyCoyote)  │ │  ‹: 44×44
│ │ ──────────────────────────────── │ │
│ │ Made for                         │ │
│ │ Male genitals, flaccid and uncut │ │
│ │ (penis, scrotum, foreskin).      │ │
│ │ Needs the trigger word d3np3n1s. │ │
│ │ ──────────────────────────────── │ │
│ │ Capabilities                     │ │
│ │ Penis                            │ │
│ │   Claimed Flaccid and uncut.     │ │
│ │   Bench   not tested             │ │
│ │ Anus                             │ │
│ │   Claimed not stated             │ │
│ │   Bench   not tested             │ │
│ │ ──────────────────────────────── │ │
│ │ Creator     LonelyCoyote         │ │
│ │ Source      civitai.com ↗        │ │
│ │ Downloads   605 (2026-10-07)     │ │
│ │ Trigger     d3np3n1s             │ │
│ │ Strength    1                    │ │
│ │ Guidance    default              │ │
│ │ ──────────────────────────────── │ │
│ │      [ Use this LoRA ]           │ │  44 tall
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Ask Qwen                    [×1] │ │
│ │ [+] [▣ ×] [Model 2.1▾] [16:9▾] 🧰 (➤)│
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

## Departures from the reference

- **The info button and the card are ours.** The reference has no LoRAs, so it has nothing to match. The owner asked for both on 2026-10-16.
- **"Made for" is written by hand from each creator's page,** shortened to one line, and is dated by the day it was read. It is not fetched live from Civitai or Hugging Face.

## Acceptance Criteria

**Manifest and model server**

- [x] 1. **The manifest gains three optional fields per entry:** `creator` (a non-empty string), `madeFor` (a non-empty string of at most 200 characters, written by hand from the creator's page) and `madeForReadOn` (the `YYYY-MM-DD` day that page was read). `madeFor` is a new field, because the existing `note` is provenance prose.
- [x] 2. **`parseManifest` keeps a LoRA whose new fields are malformed and drops only the bad field, with a `[loras]` warning.** An empty `creator` or `madeFor` is dropped. A `madeFor` longer than 200 characters is cut to 200 and ends with "…". A `madeFor` without a valid `madeForReadOn` is kept, with a warning, because the text is still right even if its date is lost. A typo in these fields never takes a LoRA out of the menu, and every case in `parseManifest`'s existing tests still passes unchanged.
- [x] 3. **`parseManifest` also keeps `origin`** (an `http(s)` URL; anything else is dropped with a warning) and **`downloads` / `downloadsReadOn`** when present: a whole number of 0 or more, and a `YYYY-MM-DD` date. Without `downloadsReadOn`, the downloads figure is dropped too, because a count with no date is not explained.
- [x] 4. **The manifest is still read once, at startup.** A change to any of these fields shows in the app after the model server's next restart, and the README says so.
- [x] 5. **The seven entries in `spark/loras.json` gain `creator`, `madeFor` and `madeForReadOn: "2026-10-16"`**, with exactly this text (read from each creator's page on 2026-10-16):

  | Entry | `creator` | `madeFor` |
  | --- | --- | --- |
  | `nsfw-thesealpacas-v2` | TheseAlpacas | General NSFW for text-to-image and edits. Mostly trained on oral, cowgirl, doggystyle, missionary, anal, penis, vagina, cum and dildos. Better anatomy and realism than v1, per the creator. |
  | `nsfw-f23gg` | TheseAlpacas | TheseAlpacas' general NSFW LoRA, first release ("experimental"). Page tags: sex acts, genitals, toys. Replaced two days later by v2, which the creator says has better anatomy and realism. |
  | `erect-friendofmale` | FriendOfMale | More detailed, correct male anatomy: the erect penis. Suggested prompts: ejaculation, penis pointing up, forward or down, hairy crotch, anus. Paid on Civitai for now. |
  | `penis-coachbate` | coachbate | Circumcised penises, soft and hard, and cumshots, for text-to-image and edits. Uncut has its own LoRA. |
  | `uncensored` | abenzerps | No training subject stated: a general uncensored LoRA for the base model. Its card describes file formats only. |
  | `uncut-coachbate` | coachbate | Uncut penises (foreskin), create or edit. A preview: the creator stopped after three tries and recommends their Krea 2 LoRA instead. |
  | `flaccid-lonelycoyote` | LonelyCoyote | Male genitals, flaccid and uncut (penis, scrotum, foreskin). Needs the trigger word d3np3n1s. |

  `nsfw-f23gg`'s creator is TheseAlpacas because the manifest identifies it by sha256 as TheseAlpacas' v1.0. `uncensored`'s is abenzerps because JoyFusionAI's repo is a mirror of abenzerps' (see Current state).

**Contract and both servers**

- [x] 6. **Contract v1.4** (`docs/contracts/job-api.md`): each `loras[]` entry may carry an `info` object:
  - `scale`: a number. Always present.
  - `guidance`: a number or `null`.
  - `trigger`: a string or `null`.
  - `madeFor`: a string or `null`.
  - `madeForReadOn`: a date or `null`.
  - `creator`: a string or `null`.
  - `origin`: a URL or `null`.
  - `downloads`: a number or `null`.
  - `downloadsReadOn`: a date or `null`.
  - `abilities`: an array, possibly empty, of `{ subject, claimed, bench }`: `subject` a string, `claimed` and `bench` a string or `null`.
  - `benchSource`: a string or `null`.

  The contract text "the strength each is applied at is the server's own setting" stays true: `info` reports the setting and does not let a client change it. A client must read a server before v1.4, or an entry without `info`, as having no card.
- [x] 7. **The model server sends `info` for every loaded LoRA,** from the `Lora` it loaded at startup.
- [x] 8. **The stub sends `info` in the two shapes the UI must handle:**
  - `fake-detail` is fully described: scale 0.8, guidance 3, trigger "sharp focus", a made-for line with its date, a creator, an `https` origin, and downloads with a date.
  - `fake-style` is bare: scale 1, every other field `null`, and no abilities.
  - `fake-detail` also has two abilities: one with both a claim and a bench line, one with neither, and a bench source.

  The stub's `FAKE_LORA_SETTINGS` and the new info agree on scale, guidance and trigger. A test enforces this.

**App**

- [x] 9. **`parseCapabilities` keeps each LoRA's `info` when it is contract-shaped,** and otherwise keeps the LoRA without it. A LoRA is never dropped because of its `info`. An unsafe `origin`, meaning anything but `http:` or `https:`, is dropped in the browser too, so a `javascript:` link can never be rendered.
- [x] 10. **In the composer's LoRA dropdown, each LoRA row with `info` shows an info button** (`qwpcicon-info` on desktop, `appicon-info` on the phone) at its right end. "None" and LoRAs without `info` have none.
  - Clicking the button opens that LoRA's card and **does not pick it**. The selection and the trigger's text are unchanged.
  - Each option's text is still exactly its label, so `image-mode.spec.ts`'s `["None", "Fake detail", "Fake style"]` still matches.
- [x] 11. **The card** shows, top to bottom:
  - the LoRA's label, with a back control;
  - "Made for" and the `madeFor` text, wrapped, when there is one;
  - "Capabilities", when there are abilities: per subject, "Claimed" (or "not stated") and "Bench" (or "not tested"), then the bench source as a footnote when there is one;
  - the fact rows: Creator, Source, Downloads (with its read-on date), Trigger ("—" when none), Strength, Guidance ("default" when none);
  - "Use this LoRA".

  Made for, Capabilities, Creator, Source and Downloads are left out when null or empty. Source is a link showing the URL's host. It opens in a new tab with `rel="noopener noreferrer"`. The `madeForReadOn` date is the link's title ("Read from the creator's page on 2026-10-16") rather than a row of its own.
- [x] 12. **From the card:**
  - "Use this LoRA" picks the LoRA and closes the dropdown, exactly as clicking its row does.
  - Back (‹) returns to the list with that LoRA's row active.
  - Escape or a click outside closes the dropdown without picking.
  - For the LoRA already selected, the button reads "In use" and is disabled.
  - A click inside the card never counts as "outside".
- [x] 13. **By keyboard:**
  - With the list open, ArrowRight on a LoRA that has a card opens it.
  - In the card, ArrowLeft returns to the list, Enter picks, and Escape closes and returns focus to the trigger.
  - Focus stays on the combobox throughout, as it does today. The info button is not a tab stop.
  - Each option with a card is described as "Press right arrow for details" to assistive technology.
- [x] 14. **On the phone (iPhone 13 descriptor):**
  - The info button and the back control each have a touch area of at least 44 × 44.
  - "Use this LoRA" is at least 44 tall.
  - The open card's box lies wholly inside the viewport, at least 8 px from the left and right edges and at or below the top. A card taller than the space above its trigger scrolls inside itself, and the page does not scroll. *(Corrected 2026-10-16 during implementation: this said "above the composer". The card opens from the dropdown's trigger in the footer row, exactly where the list opens, so like the list it covers the prompt line above; the e2e asserts it ends above the trigger.)*
- [x] 15. **Desktop:** the card is 300 px wide and stays at least 8 px inside the right edge of the viewport, using the same clamp that already keeps the list on screen. A card taller than the viewport less 16 px scrolls inside itself, and the page does not scroll.
- [x] 16. **Nothing else changes:**
  - The model, ratio and count dropdowns render and behave as before. Their items have no `info`, so they show no button.
  - Choosing a LoRA by its row, the request the server receives, the Info panel (STORY_024) and a session restore of the chosen LoRA are unchanged.

**Capabilities (added at approval, 2026-10-16)**

- [x] 17. **The manifest gains two more optional fields per entry:** `abilities`, a list of `{ "subject", "claimed", "bench" }`, and `benchSource`. `subject` is free text of at most 24 characters (no subject list exists in code). `claimed` and `bench` are text of at most 120 characters, or absent. `benchSource` is text of at most 120 characters naming whose judgement the bench lines are and when. Malformed parts are dropped with a `[loras]` warning, as in AC 2: an ability without a subject, a repeated subject (case-insensitive), a text over its limit (cut with "…"), and abilities after the sixth. A LoRA is never dropped for them.
- [x] 18. **The seven entries gain the abilities below,** subjects "Penis" then "Anus", from the creators' pages (read 2026-10-16) and the 2026-10-02 bench. Every benched entry gets `benchSource`: "Assistant's review (2026-10-11) of the 2026-10-02 bench; not yet confirmed by the owner." The two installed after the bench get none.

  | Entry | Penis: claimed | Penis: bench | Anus: claimed | Anus: bench |
  | --- | --- | --- | --- | --- |
  | `nsfw-thesealpacas-v2` | Trained on it, among other subjects. | Plausible in its one undressed edit (1 of 4). Text-to-image: short, partly merged. | Trained on anal; page tagged anus. Not male-specific. |  |
  | `nsfw-f23gg` |  | No edit undressed (0 of 4). Text-to-image: plausible, scrotum elongated. | The page's anus tag, shared with v2. |  |
  | `erect-friendofmale` | The erect penis is its subject. |  | A suggested prompt only. |  |
  | `penis-coachbate` | Circumcised, soft and hard. | Plausible, slightly short, in its one undressed edit (1 of 4). Text-to-image: plausible. |  |  |
  | `uncensored` |  | No edit undressed (0 of 4). Text-to-image: plausible. |  |  |
  | `uncut-coachbate` | Uncut, a preview. | Undressed all 4 edits: plausible on two subjects, small and vague on two. Text-to-image: plausible. |  |  |
  | `flaccid-lonelycoyote` | Flaccid and uncut. |  |  |  |

  An empty cell is an absent field, shown as "not stated" or "not tested". When the owner confirms the review, or a new bench runs, the lines and `benchSource` are updated by hand.

## Technical Notes

- **`Dropdown.tsx`** gains an optional per-item `detail?: ReactNode` (the card's body) and an internal `view: "list" | { detail: id }` state. When `view` is a detail, the popup renders a `.clone-dropdown-detail` element in place of the list, inside the same `Popup` and under the same `popup` ref. That keeps the existing outside-click check working and lets the existing `listRef` clamp measure the card when it mounts. The other three dropdowns pass no `detail` and are unchanged.
- **The info button** goes inside the option, after the label: a `<button type="button" tabIndex={-1} aria-hidden="true" className="clone-icon-button clone-dropdown-item-info">`. Its click calls `stopPropagation` and opens the card. Keyboard and screen-reader users reach the card through ArrowRight (AC 13), which is why the button is hidden from them rather than nested as a second interactive control inside an option. The e2e locates it by its class within the option.
- **The phone touch area overlaps the neighbouring rows.** The rows are 36 px tall (BACKLOG_002), so the info button's 44 px `::before` reaches 4 px into the rows above and below, on the right-hand 44 px only. A tap there opens the card rather than picking the neighbour. Opening a card is harmless and Back undoes it, so this is accepted. If BACKLOG_002 later raises the rows to 44 px, the overlap disappears.
- **The card's content** is a new `app/components/composer/LoraCard.tsx`, given `LoraOption` and `selected`. It is pure rendering, and `Composer.tsx` builds `detail` from it for each LoRA. Formatting comes from a new pure `app/lib/lora-card.ts` (the rows, the host of `origin`, the downloads text with thousands separators). It exports and reuses `settingText` from `generation-settings.ts`, so "default" reads the same in both places.
- **Types:** `LoraOption` gains `info?: LoraInfo`, defined once in `composer-state.ts`. The model server's `Lora` gains the optional descriptive fields, and `validation.ts` `Capabilities.loras` gains the same optional `info`.
- **README:** the LoRA section documents `creator`, `madeFor` and `madeForReadOn` (the limits in AC 2, and that "Made for" is written by hand from the creator's page), and that a change shows after a restart. The contract section notes v1.4.

## Testing Plan

**Unit** (Vitest; jsdom for components):

- `spark/model-server/src/loras.test.ts` (extended):
  - `creator`, `madeFor` and `madeForReadOn` are kept, trimmed.
  - Each malformed new field is dropped with a warning, and the entry survives. The cases: an empty `creator`, an empty `madeFor`, a `madeFor` that is a number, and a `madeForReadOn` that is not a date (the text is kept).
  - A 201-character `madeFor` is cut to 200, ending with "…".
  - `abilities` are kept in order; an ability without a subject, a repeated subject in different case, a 121-character `bench`, a 25-character subject and a seventh ability are each handled as AC 17 says, with a warning, and the entry survives. `benchSource` is kept, trimmed.
  - `origin` is kept for `https`, and dropped with a warning for `javascript:` and for a bare word.
  - `downloads` without `downloadsReadOn` is dropped.
  - A new case reads the committed `spark/loras.json`: every entry has a `creator`, a `madeFor` of at most 200 characters and the abilities "Penis" and "Anus"; every entry with a bench line has a `benchSource`; and the file parses with no warnings. This catches a broken hand edit before it reaches the Spark.
- `spark/model-server/src/server.test.ts` (extended, fake worker):
  - `GET /capabilities` gives each loaded LoRA an `info` with its scale, guidance, trigger and descriptive fields, and `null` for the ones its manifest entry lacks.
  - A LoRA that failed to load still has no entry.
- `tools/stub-generation-server/src/server.test.ts` (extended):
  - `GET /capabilities` gives `fake-detail` its full info and `fake-style` its bare info.
  - Both agree with `FAKE_LORA_SETTINGS` on scale, guidance and trigger.
- `app/lib/composer-state.test.ts` (extended, `parseCapabilities`):
  - A v1.3 answer (no `info`) gives LoRAs without `info`.
  - A v1.4 answer keeps `info` intact.
  - An `info` with the wrong shape (for example, `scale` that is a string) gives the LoRA without `info`, never dropping the LoRA.
  - A `javascript:` origin is dropped.
- `app/lib/lora-card.test.ts` (new):
  - The abilities: "not stated" and "not tested" for absent claims and bench lines, and the footnote only when a bench source exists.
  - The rows for the full shape and the bare shape: Made for present and absent, "—" for no trigger, "default" for no guidance, and Creator, Source and Downloads absent when null.
  - "18,951 (2026-10-07)".
  - The host of a Civitai and a Hugging Face URL.
- `app/components/Dropdown.test.tsx` (extended, rendered inside `StrictMode`):
  - An item with `detail` shows the info button, and one without does not.
  - Clicking the button shows the detail and leaves `onSelect` uncalled.
  - Back returns to the list with that item active.
  - A click inside the detail does not close it, and a click outside closes without picking.
  - ArrowRight opens the active item's detail, ArrowLeft returns, Enter in the detail picks, and Escape closes and focuses the trigger.
  - ArrowRight on an item without `detail` does nothing.
  - The four existing cases stay green unchanged. They are the proof that the other three dropdowns did not move.
- `app/components/composer/LoraCard.test.tsx` (new):
  - The full shape renders the label, "Made for" with its text, Capabilities with each subject's Claimed and Bench lines and the footnote, and every fact row in order.
  - The bare shape renders no "Made for", no Capabilities and only Trigger, Strength and Guidance.
  - The Source link has `target="_blank"` and `rel="noopener noreferrer"`, and its title carries the made-for read-on date.
  - The selected LoRA shows a disabled "In use".

**Integration** (`app/test/integration/jobs.test.ts`, extended): `GET /api/capabilities` through the app's route against the stub returns both LoRAs' `info` unchanged. The route is a pass-through, and this proves it still is for the new field.

**E2E** (`app/e2e/image-mode.spec.ts`, new test "a LoRA's card says what it was made for and shows the facts, and choosing from it sends that LoRA (STORY_030)", run in both the `desktop` and `narrow` projects):

1. Fixture: the stub as the Playwright config starts it, with its two fake LoRAs. Route `POST /api/jobs` with header `x-stub-script: done-after-1-poll`, as the STORY_019 test does.
2. Go to `/`, open Select Mode, choose Create Image.
3. Open the LoRA combobox. Expect the options' text to be exactly `["None", "Fake detail", "Fake style"]`. Expect an info button in the "Fake detail" and "Fake style" options and none in "None".
4. Click the info button in "Fake style". Expect "Trigger —", "Strength 1" and "Guidance default", and no "Made for", "Capabilities", "Creator", "Source" or "Downloads" text. Expect the trigger still reads "None" (desktop), meaning nothing was picked.
5. Click back. Then click the info button in "Fake detail". Expect "Made for" with the stub's text, the stub's two abilities (one reading "not stated" and "not tested") and its bench footnote, its creator, a Source link to the stub's host with `target="_blank"`, its downloads with the date, "Trigger sharp focus", "Strength 0.8" and "Guidance 3".
6. **Narrow only:** after the card settles (`settledBox`), its box is within `[8, viewport width − 8]` horizontally and `≥ 0` at the top, and its bottom is above the composer's top. The info button's and back control's boxes, including their `::before` reach measured as the existing toolbox test does, are at least 44 × 44. "Use this LoRA" is at least 44 tall. `document.scrollingElement.scrollTop` is 0. The footer's `scrollWidth − clientWidth` is 0.
7. **Desktop only:** the card is 300 wide and ends at least 8 px inside the right edge.
8. Click "Use this LoRA". Expect the dropdown closed and the trigger reading "Fake detail" (desktop).
9. Fill the prompt "a portrait in a garden", register `waitForResponse` on the status returning `done` **before** clicking Send (`submitAndWait`), then click Send. Expect `stub.received(id)` to match `{ request: { lora: "fake-detail" } }` and the result image to load (`expectImageLoaded`). The test therefore ends with no job running.
10. Keyboard leg (desktop only): reopen the combobox with Enter, press ArrowDown to "Fake detail", then ArrowRight. The card is shown. ArrowLeft returns to the list. Escape closes it, and focus is on the combobox.

**Specs that must stay green, covering the "unchanged" halves of AC 10 and AC 16:**

- `image-mode.spec.ts`, all tests:
  - The STORY_019 add-on test proves picking by row, the option text and the narrow footer fit.
  - "the dropdowns work by keyboard" proves the model, ratio and count menus.
  - "image mode and the ratio survive a reload" proves the session restore.
- `generate.spec.ts` proves the Info panel's add-on row and the request with a LoRA.
- `queue.spec.ts` proves the count dropdown and the narrow footer row.
- `references.spec.ts`, `history.spec.ts`, `settings.spec.ts` (the interface zoom, which the clamp must still respect) and `home.spec.ts`.

**Deliberately not tested:** the card against a screenshot, because the reference has no such control to compare against and visual comparison is a review aid, not a gate (CLAUDE.md §6b). Real Civitai and Hugging Face pages are never fetched by code or tests; "Made for" is text in the manifest.

**Manual verification on the Spark** (not a gate; recorded in the Done note with the date):

1. After the model server restarts onto v1.4, `curl` its `/capabilities` and check each loaded LoRA carries `info` with the creator, made-for text, abilities, scale and guidance from AC 5 and AC 18.
2. Open each of the seven cards on http://localhost:3100 at desktop width and in the phone layout, and check that nothing is clipped and the longest made-for text (NSFW v2's) wraps cleanly.

## Estimated Complexity

M. The change touches three packages (model server, stub and app) and the contract. The UI work is one new view inside a shared component, and the rest follows existing patterns (the parser, the clamp, the touch area, the Info panel's wording).

## Open questions for the owner (answered 2026-10-16 by approval, with the defaults below)

1. **Card in place of the list** (sketched above) or **beside it** on desktop? In place works the same at both widths and reuses the on-screen clamp. Beside it lets you scan several cards faster, but it needs a second placement rule on desktop and still falls back to in place on the phone. The draft assumes in place.
2. **The 200-character limit on "Made for".** The longest line in AC 5 is 188 characters (NSFW v2's), which wraps to seven lines on the card. Say if you would rather have shorter lines.

## Done note (2026-10-16)

- **Gate:** all six steps green, run by hand through `tools/gate/run.sh`: typecheck, lint, unit (app 206, model server 117, stub 71, recon 152), integration (23), build with the production image, and e2e (82 passed, 14 skipped by design). The first e2e run failed one narrow case of this story's own spec: it asserted that the card ends above the whole composer, while the card opens from its trigger in the footer row, exactly where the list does. The card was right and the assertion was not; AC 14's wording is corrected above, and the rerun of step 6, then of steps 1 and 2 on the final files, was green.
- **Tests added:** cases in `spark/model-server/src/loras.test.ts` (the new fields, their limits, and the committed manifest parsing without a warning) and `server.test.ts` (each offered LoRA's `info`; the older add-on cases now compare ids and labels, since `info` is part of each entry), `tools/stub-generation-server/src/server.test.ts`, `app/lib/composer-state.test.ts`, the new `app/lib/lora-card.test.ts` and `app/components/composer/LoraCard.test.tsx`, `app/components/Dropdown.test.tsx` (the card view, in StrictMode; the four earlier cases unchanged), `app/test/integration/jobs.test.ts`, and two scenarios in `app/e2e/image-mode.spec.ts` (the card at both widths with its touch areas, and the keyboard path on desktop).
- **Built as specified, with these choices:** the card replaces the list (open question 1's default) and "Made for" is capped at 200 characters (open question 2's). The pick button says "Use this add-on", because CHORE_006 has not landed (see "How this pairs with CHORE_006"). `Dropdown` now resets its on-screen shift when it opens rather than when the popup unmounts, so the card is measured against the shift the list was drawn with. The stub's `FAKE_LORA_SETTINGS` is now derived from its LoRAs' `info`, so the card and the job cannot disagree.
- **Departures:** as listed above. There is no reference capture to compare side by side.
- **Pending, on the Spark:** the model server still runs the v1.3 code, so until it restarts the app shows no info buttons (a LoRA without `info` has no card, AC 9). At deploy time qwen-model was idle, but minimax's ComfyUI was rendering (GPU 96%, about 46 GiB) and 22 GiB was available. Restarting qwen-model would free its 32 GiB and leave about 54 GiB, under the 60 GiB `spark/up.sh` asks for, so the restart was not attempted. The manual check in the Testing Plan waits for it.
