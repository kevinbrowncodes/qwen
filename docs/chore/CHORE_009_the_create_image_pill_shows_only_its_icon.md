# CHORE_009 — The Create Image pill shows only its icon

**Status:** Done 2026-10-17, approved by the owner that day ("yes please proceed"); deployed on the Spark later that day, after the owner's job finished (the live pill has no text and the tooltip "Create Image")
**Created:** 2026-10-17, at the owner's request ("Please remove the words create image I think so a icon is enough and you can keep the blue circle around it")

## Summary

In image mode, the composer's blue pill reads `[icon] Create Image ×` on desktop. On the phone it already reads `[icon] ×` (`Composer.tsx`: `{narrow ? null : <span>Create Image</span>}`). This chore drops the words on desktop too, so the pill is the icon and the ×, in its blue rounded background, at both widths.

## Why

At desktop width the words wrap onto two lines inside the 32px pill (owner's screenshot, 2026-10-17: "Create" over "Image"), which crowds the footer row next to the model, ratio, LoRA and ×N dropdowns. The icon alone already identifies the mode, as it does on the phone.

## UI Mockup

**Reference capture:** [states/composer-image-mode@1437.json](../recon/2026-09-26/states/composer-image-mode@1437.json). The pill is `.mode-select-current-mode`: `padding: 4px 8px; gap: 4px; height: 32px; border-radius: 999px; color: var(--text-theme)` (#426eff), on `var(--background-weaken)`. All of that is kept. Only the text goes.

```
Before (desktop):   [ + ]  ( 🖼 Create ✕ )  Qwen-Image 2.1 ⌄   16:9 ⌄   NSFW v2 ⌄   ×4 ⌄   (↑)
                            (    Image   )
After (desktop):    [ + ]  ( 🖼 ✕ )  Qwen-Image 2.1 ⌄   16:9 ⌄   NSFW v2 ⌄   ×4 ⌄   (↑)
Phone (unchanged):  [ + ]  ( 🖼 ✕ )  Model 2.1 ⌄  16:9 ⌄  …
```

The pill keeps an accessible name, "Create Image", and shows it as a tooltip on hover, so the mode is still named for screen readers and for a mouse user who wonders what the icon means. The ×'s name stays "Leave Create Image".

**Departure from the reference:** the reference shows the words on desktop. Dropped at the owner's request, 2026-10-17.

## Changes

- [x] `app/components/composer/Composer.tsx`: remove the `Create Image` span at both widths, and name the pill's wrapper with `role="group"`, `aria-label="Create Image"` and `title="Create Image"` (the tooltip).
- [x] Update the composer's header comment (line 4), which describes the pill's words.
- [x] README: none, since Features does not mention the pill's text. Say so in the commit.

## Testing

- **Unit:** not applicable. There is no `Composer` component test (checked 2026-10-17), and the change is one removed element and three attributes, with no logic. The e2e below asserts it at both widths.
- **Integration:** not applicable. No route or server code changes.
- **E2E:** `e2e/image-mode.spec.ts`'s first test currently asserts the desktop pill **contains** "Create Image". It changes to assert that the pill has no text at both widths, is named "Create Image" (`getByLabel`), and is still #426eff. That line asserted the words this chore deliberately removes (§4c: an implementation detail changed on purpose). `references.spec.ts` (the pill stays visible with a reference attached) and the rest of `image-mode.spec.ts` (Leave Create Image) stay green unchanged.

## Done note (2026-10-17)

The gate is green (a hand-run, resumed from step 3 after the model server's `/health` test failed once, which is open BUG_012 and unrelated). `image-mode.spec.ts` now asserts the pill has no text, is named "Create Image" and has that tooltip, at both widths. The README is unchanged: Features does not mention the pill's text.
