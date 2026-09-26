# BACKLOG_001 — Local sample prompts in place of the reference's example cards

**Priority:** Low (after the MVP epic)

- **Summary:** image mode on the reference shows four 189×189 example cards with `Use Prompt` and `Explore more` (`docs/recon/2026-09-26/states/composer-image-mode@1437.json`). STORY_010 leaves them out, because their art is output generated on the reference, which never enters git.
- **User impact:** a starting point for someone without an idea. The owner may not need it.
- **Rough scope:** four or so prompts written by us, with art generated locally by Qwen-Image-2.1 and stored outside git (or no art at all), filling the textarea without sending.
- **Dependencies:** EPIC_004 (local generation), for art.
- **Open questions:** Is it wanted at all? With art, or text only?
