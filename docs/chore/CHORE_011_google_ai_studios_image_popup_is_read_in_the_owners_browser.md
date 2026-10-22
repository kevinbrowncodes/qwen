# CHORE_011 — Google AI Studio's image popup is read in the owner's browser

**Status:** Open, for the owner (2026-10-22)
**Created:** 2026-10-22, from [STORY_038](../story/STORY_038_a_clicked_image_opens_in_a_viewer_over_the_page.md), whose viewer was built from values read off the owner's screenshot because no session could open AI Studio signed in.

## Summary

STORY_038's viewer copies Google AI Studio's image popup. The story asked for the popup's DOM and computed styles to be read in a real browser before building. The build session had no signed-in browser, so the viewer uses the values the story read off the owner's screenshot of 2026-10-21. They are inferred, not measured. This chore records the real values and the screenshot.

## Why

A clone is measured, not guessed (CLAUDE.md §3 item 6). Only the owner can sign in to AI Studio, and the screenshot exists only in his conversation of 2026-10-21.

## Changes

Steps for the owner, on his own Mac:

- [ ] Save the screenshot of AI Studio's image popup from 2026-10-21 as `docs/recon/2026-10-21/ai-studio-image-viewer.png`.
- [ ] Open https://aistudio.google.com signed in, open a chat with a generated image, and click the image so the popup opens. Note the window's width.
- [ ] Either read the values yourself, or start a Claude session with Claude in Chrome on that tab and ask it to read them: in DevTools, select the popup's outer sheet and note its width, height, border radius and background colour; the file name's font size and weight; the Download and Close buttons' size; the backdrop's colour and blur. Write them, with the date and window width, in `docs/recon/2026-10-21/ai-studio-image-viewer.md`.
- [ ] Compare them with what was built (`app/app/clone.css`, the block that starts "STORY_038: the image viewer"): the sheet is `min(1340px, 100% - 160px)` wide, r12, `#1e1e20`; the name 15 px regular; the buttons 36 px; the backdrop `rgba(0, 0, 0, 0.6)` with `blur(12px)`. Any difference that matters becomes a bug against STORY_038 with both values.

## Testing

None applies to the reading itself: it changes no code. A bug filed from it carries its own tests; `app/e2e/viewer.spec.ts` holds the viewer's behaviour.
