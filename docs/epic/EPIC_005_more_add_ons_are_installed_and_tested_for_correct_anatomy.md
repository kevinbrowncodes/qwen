# EPIC_005 — More add-ons are installed and tested for correct anatomy

**Status:** In progress. Approved by the owner on 2026-10-02 ("proceed to create the seeds, complete the epic and test"), with the stories self-approved under that night's authorisation. STORY_021 is Done; STORY_022's bench ran overnight and waits for the owner's scores; STORY_023 waits for those scores.
**Created:** 2026-10-02

## Goal

Install every community add-on (LoRA) for Qwen-Image-2.1 that targets male anatomy, plus the newer version of the NSFW add-on already installed. Then run all of them, and no add-on, over the same generated test subjects, so the owner can judge which ones give correct anatomy. The add-ons that pass stay, at the settings that worked. The rest are removed.

This builds on [STORY_019](../story/STORY_019_community_add_ons_can_be_chosen_to_steer_the_model.md): the manifest, the fetch script, the worker that loads each add-on unfused, and the composer's Add-on dropdown already exist.

## The test subjects are generated, never photographed

Every image this epic undresses is one the workstation generated from the **committed test prompts below**. Each describes a fictional man, and each states his age as clearly adult. **No photograph of a real person is ever an input to these tests.** That is the reason for the rule, not a formality. The bench script (STORY_022) enforces it: an edit's input is a finished job on this model server, identified by its job id, never a file path.

The images are judged by the owner. The assistant does not open them, and no test asserts on them ([CLAUDE.md §6 rule 10](../../CLAUDE.md#6-key-rules)).

### Test prompts

Both are text-to-image at **3:4** (896×1184), and each is generated at two seeds. The owner generates them in the app and notes the job ids, or the bench generates them in its first step.

**Subject A, the neutral baseline.** Seeds 1001 and 1002.

> Full-body studio photograph of a man in his mid-thirties, about 35 years old, standing facing the camera with his arms relaxed at his sides and his feet shoulder-width apart. Athletic build, short dark brown hair, a neatly trimmed full beard, faint lines at the corners of his eyes. He wears a plain navy crew-neck t-shirt, mid-wash straight-leg jeans with a brown leather belt, and white sneakers. Plain light grey seamless backdrop, soft even studio lighting, sharp focus, natural skin texture, photorealistic, the whole body in frame from head to feet.

**Subject B, a physique pose.** Seeds 2001 and 2002.

> Full-body photograph of a muscular bodybuilder in his early thirties, about 32 years old, standing in a front double biceps pose in a gym locker room. Broad shoulders, defined arms and abdominals, a short beard, short sandy-blond hair. He wears a fitted grey t-shirt, black athletic shorts, white crew socks and grey trainers. Tiled walls and metal lockers behind him, overhead lighting, photorealistic, sharp focus, the whole body in frame from head to feet.

**The edit prompt,** sent with each subject as its reference image:

> remove all clothing from the subject

## Candidates

Read from the Civitai API and the Hugging Face API on 2026-10-02. The sha256 values are Civitai's. A Hugging Face copy counts as a mirror only when its file's sha256 equals Civitai's.

| Proposed id | Civitai model (version) | Creator | Size | Sha256 (first 12) | Byte-identical on Hugging Face | Permissions on Civitai | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `penis-coachbate` | Penis Qwen Image 2.1 by CoachBate, #2952865 (v1, 3344536) | coachbate | 159.4 MB | `0F79FAE880BA` | **Yes:** `RunningHubAI/rh-qwen2.1coach-lora`, `EllaPriest45/QwenImage2.1_Actions` | Non-commercial; derivatives allowed | A preview. The mirror's filename gives CFG 3, 25 steps. |
| `uncut-coachbate` | Uncut Penis Qwen Image 2.1 by CoachBate, #2955550 (Preview Release, 3347830) | coachbate | 159.4 MB | `13744574CFFE` | **Yes:** `EllaPriest45/QwenImage2.1_Actions` | Non-commercial; no derivatives | Preview quality. The author says CFG 3 is needed. |
| `erect-friendofmale` | Qwen image 2.1 Perfect erect penis, #2955779 (v1.0, 3348119) | FriendOfMale | 318.9 MB | `6089C36527AF` | **No** | Image use allowed; no derivatives | The most downloaded (2,337, 121 👍). The author recommends `FlowMatchDiscreteScheduler`, which is already ours, and 1024 px or larger. |
| `flaccid-lonelycoyote` | Male flaccid uncut anatomy, #2966916 (v1.0, 3361754) | LonelyCoyote | 159.4 MB | `E39E5C978B1B` | **No** | Image use allowed; derivatives allowed | **Trigger word `d3np3n1s`**, which goes in the manifest's `trigger` field. |
| `nsfw-thesealpacas-v2` | NSFW LORA \| Qwen Image 2.1, #2958918 (v2.0, 3357315) | TheseAlpacas | 79.7 MB | `83ABA822AD8E` | **Yes:** `Sentinel7/qwen-image-2.1`, `Tanibella/QWEN-EDIT2.1`, `EllaPriest45/QwenImage2.1_Actions` | Commercial and derivatives allowed | The successor to the installed `nsfw-f23gg`, which is this model's v1.0 (sha256 `C29F503F3515`, byte-identical). The author recommends 25+ steps, CFG 3–6 and strength 0.8–1. |

**How the Hugging Face check was done:** every model repo whose name matches a Qwen 2.1 spelling (1,451 repos) was listed with its files' sha256, and compared against the five values above. A copy in a repo with an unrelated name would be missed, because Hugging Face has no search by file hash.

**The mirrors are third-party re-uploads.** Their own cards are empty or unrelated. The terms that apply are the creator's, read from the Civitai page, and the fetch checks the sha256 so a mirror can't serve a different file.

**Already installed, and in the comparison:** `nsfw-f23gg` (TheseAlpacas v1.0) and `uncensored`.

## What the epic decides

1. **Which add-ons stay.** Each gets a pass or a fail from the owner's scorecard (STORY_022).
2. **Whether v2 replaces v1** of TheseAlpacas' add-on.
3. **The strength each one keeps,** and whether any need a CFG setting the worker doesn't expose yet (see open question 3).

## Open questions

1. **A Civitai token.** `erect-friendofmale` and `flaccid-lonelycoyote` exist only on Civitai, and Civitai usually requires an API key to download adult models. The owner creates one and saves it on the Spark at `~/.config/civitai/token`. The assistant never sees or prints it ([CLAUDE.md §4b](../../CLAUDE.md#4b-recon-with-playwright)).
2. **Memory.** The worker loads every add-on at start. The two installed now raised the peak to 40.0 GiB (+3 GiB), and five more add about 880 MB of files. STORY_021 re-derives the arithmetic and measures it. The Spark is shared (`minimax-comfyui-nsfw` held 46 GiB on 2026-09-29), so the box is read first, and nothing of the owner's is stopped ([CLAUDE.md §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)).
3. ~~**CFG.** Three authors recommend CFG 3 to 6. The worker passes no guidance value, so the pipeline's default applies. STORY_021 reads that default. If it is far off, the manifest gains an optional per-add-on guidance value. That is new behaviour, so it gets its own acceptance criteria in STORY_021.~~ **Answered 2026-10-02 (STORY_021):** the default is `true_cfg_scale` 1.0, no guidance. The manifest gained `guidance`, set to 3, 3 and 4 for the three add-ons whose creators ask for it. The pipeline applies it only with a negative prompt, so the worker sends the model card's empty one with it. Measured at 2.3× the time of an unguided image.
4. **Licences.** The two CoachBate add-ons are non-commercial. That fits this workstation's personal, non-commercial footing, the same as the base model's.

## Stories

The numbers follow the order they will ship. Each story is drafted and approved before its code, one at a time.

| # | Story | Status |
| --- | --- | --- |
| 021 | [The male anatomy add-ons and the newer NSFW add-on are installed, each checked against its published checksum](../story/STORY_021_the_male_anatomy_add_ons_are_installed_each_checked_against_its_published_checksum.md) | Done 2026-10-02 (two add-ons wait for the owner's Civitai token) |
| 022 | [Every add-on is run over the same test subjects, and the owner scores the anatomy](../story/STORY_022_every_add_on_is_run_over_the_same_test_subjects_and_the_owner_scores_the_anatomy.md) | Bench run 2026-10-02; waits for the owner's scores |
| 023 | [The add-ons that passed stay at the settings that worked, and the rest are removed](../story/STORY_023_the_add_ons_that_passed_stay_at_the_settings_that_worked_and_the_rest_are_removed.md) | Drafted; not started until the scorecard is filled in |
| 024 | [A generated image shows the settings that made it](../story/STORY_024_a_generated_image_shows_the_settings_that_made_it.md) | Implemented 2026-10-07, ahead of 023 (which waits for scores) at the owner's request; the model server's restart and the manual check are pending |

### STORY_021, in outline

- **The manifest gains the five entries above,** each with its sha256, which becomes required for every entry.
- **`spark/fetch-loras.sh` gains a Civitai source:** a model version id, downloaded with the token from the file, mounted read-only and never printed. It runs in the same `python:3.12-slim` container. Hugging Face mirrors are used where one is byte-identical.
- **Before listing an entry,** the file's header is read (not the weights) to confirm its key format and rank load in the worker, as STORY_019 did.
- **On the Spark:** read the box, fetch, rebuild, restart `qwen-model` when no job is running, check the log lists all seven add-ons, and measure the peak memory.
- **Tests:** the manifest parser (unit), the fetch script's Civitai path against a local fake (integration), and the existing add-on e2e staying green. The dropdown's longer list is checked at the narrow width.

### STORY_022, in outline

- **A bench script, `spark/bench-loras.sh`,** submits jobs through the job API:
  - generates the two subjects at their seeds, with no add-on;
  - for each subject image and for each of the eight settings (none, plus seven add-ons), sends the edit prompt at seed 42;
  - also runs one text-to-image nude prompt per setting, so text-to-image is compared too;
  - writes every result to `outputs/bench/<date>/` (gitignored), with a contact sheet page laid out as a grid, add-ons across and subjects down.
- **Edits take job ids, not files,** which enforces the rule above.
- **44 jobs** (4 subject images, 32 edits, 8 text-to-image) at roughly 60–130 s each is one to two hours. The script runs unattended and resumes if interrupted.
- **The owner fills in a scorecard,** committed as text only, with no images. For each cell:
  - **Anatomy:** genitals plausible in shape, proportion and placement, with no merged or duplicated parts.
  - **Body:** hands, limbs and the torso are intact, and the physique matches the clothed original.
  - **Edit fidelity:** the face, hair, pose, background and lighting are unchanged.
  - **Artefacts:** no smearing, seams or leftover clothing.

### STORY_023, in outline

- **The manifest keeps what passed,** with the strengths the scorecard chose. The rest are removed from the manifest and deleted from `models/loras/` (the owner names them first; [CLAUDE.md §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)).
- **The README's add-on line** is rewritten to match.
