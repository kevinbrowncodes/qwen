# BUG_015 — The prompt box shows grey scroll bars and never grows

**Status:** Resolved (2026-10-17), approved by the owner that day ("yes please proceed"). Built and pushed, not yet deployed: the owner had a job running
**Found by:** the owner, 2026-10-17, with a screenshot of Safari on the Mac ("help me understand why there they weird grey scroll bars in the prompt box")

## Summary

The composer's prompt box (`textarea.message-input-textarea`) is a fixed one-line box, 32px tall. Anything that does not fit in it scrolls inside that one line instead of growing the box. When it scrolls, the reference's stylesheet paints the scroll track grey, so the owner sees a grey bar under the text and another down its right side. The reference grows the box with its text up to 208px (122px on the phone), so its tracks show only for a very long prompt.

## Steps to Reproduce

1. In Safari on the Mac, enter image mode.
2. Type, or paste, a prompt longer than one line.
3. Look at the prompt box.

## Expected vs Actual Behaviour

- **Expected (the reference):** the box grows line by line with the text and has no scroll bars, up to 208px tall (`max-height`, 7.625rem on the phone). Only past that does it scroll.
- **Actual:** the box stays 32px. The text scrolls inside it, and the reference's grey track (`var(--background-option)`, fully rounded) is drawn for the vertical scroll bar and, in the owner's screenshot, a horizontal one too.

## Root Cause

**Lift what renders, write what runs (§3e): this is the "runs" half that was not written.**

- **The lifted stylesheet** gives the box `min-height: 32px; max-height: 208px; overflow-y: auto` and `.message-input-textarea::-webkit-scrollbar-track { background: var(--background-option); border-radius: 999px }`. A global rule sizes every WebKit scroll bar to 5px (`::-webkit-scrollbar { width: 5px; height: 5px }`). So whenever the box can scroll, Safari and Chrome draw a grey 5px track.
- **The reference's JavaScript** keeps the box from scrolling. It sets the box's height to fit its text, with scrolling turned off, on every change. The capture shows it as an inline style: `<textarea rows="1" class="message-input-textarea" … style="height: 32px; overflow-y: hidden;">` ([states/home-signed-in@1437.json](../recon/2026-09-26/states/home-signed-in@1437.json)).
- **Ours** (`app/components/composer/Composer.tsx`, the `input` element) renders `rows={1}` with no height and no overflow handling, so it never grows and always scrolls.

**What was and was not verified (2026-10-17):** the captured inline style, the lifted rules, and our missing sizing code were each read from the files. The owner's exact screenshot, with a grey bar while the box shows only the placeholder, was **not** reproduced. Headless WebKit and Chromium on the Spark measure the empty box at exactly 32 × 32 with nothing to scroll (`scrollHeight` 32). The remaining trigger on the Mac is most likely Safari's own text metrics overflowing a box sized to exactly one line, or the prompt just sent still being in the box. Either way, sizing the box to its content removes the scroll it depends on. The fix below is checked on the Mac by hand (the manual step), since the gate has no macOS Safari.

## Acceptance Criteria

- [x] 1. **The box fits its text:** on every change of text (typing, pasting, `Use Prompt`, clearing after a send) its height is set to its content's height, between 32px and the stylesheet's `max-height` (208px; 7.625rem on the phone), as the reference's inline style does.
- [x] 2. **No scroll bars below the maximum:** `overflow-y` is `hidden` while the content fits, and `auto` only once the content is taller than the maximum (the reference's grey track then shows, as on theirs). Horizontal scrolling is off at all times (`overflow-x: hidden`), since the text wraps.
- [x] 3. **Empty, or after a send,** the box is back to one line: 32px on desktop, and on the phone its line height (24.96px measured on 2026-10-17, since the phone's root font is 16.64px), with no scroll bars. *(Corrected 2026-10-17, before the fix landed: this AC first said the phone's `min-height`, but one line there is taller than that minimum.)*
- [x] 4. **Nothing else changes:** the composer's other rows, Enter to send, and the composer's measured heights in image mode for one line (106px, the 2026-09-26 reading) and with a reference attached (170px).

## Testing Plan

- **Unit** (`app/lib/composer-fit.test.ts`, new): a pure `fitTextarea(scrollHeight, minHeight, maxHeight)` returns `{ height, overflowY }`. Content shorter than the minimum gives the minimum and `hidden` (AC 3). Content in between gives its own height and `hidden` (AC 1, 2). Content past the maximum gives the maximum and `auto` (AC 2). A jsdom component test cannot measure layout, so the measuring itself is proven in e2e.
- **Integration:** not applicable. No route or server code changes.
- **E2E** (`app/e2e/image-mode.spec.ts`, new test "the prompt box grows with its text and scrolls only past its maximum", both projects):
  1. Enter image mode. The empty box is one line tall (the larger of `min-height` and line height plus padding, read from the computed style, since the phone's values are in rem), `overflow-y: hidden`, and `scrollWidth === clientWidth`.
  2. Fill three lines. It is taller than one line, and its `scrollHeight` equals its `clientHeight` (nothing hidden, no scroll bar).
  3. Fill thirty lines. It is the computed `max-height` (208px on desktop) and `overflow-y: auto`.
  4. Clear it. It is back to the empty height.
  The composer-height checks in `image-mode.spec.ts` and `references.spec.ts`, and `generate.spec.ts`'s send flows, stay green unchanged (AC 4).
- **Manual verification (the owner's Mac, Safari):** open image mode with an empty box, then type a three-line prompt. Expect no grey bars in either case. The Done note records the Safari version and date.

## Resolution

Fixed on 2026-10-17, not yet deployed. `Composer.tsx` sizes the box in a layout effect on every change of text, mode or width, and on window resize. It sets the height to "auto", measures `scrollHeight`, and applies `fitTextarea` (`app/lib/composer-fit.ts`) with the computed `min-height` and `max-height`. That sets the height and `overflow-y` inline, as the reference's code does. `clone.css` turns sideways scrolling off.

- **Gate:** green in a hand-run (unit 259, integration 34, e2e 96 at both widths).
- **AC 3 was corrected** in this ticket before the fix landed: the phone's empty box is one line (24.96px), not its `min-height` (23.92px). The first e2e run caught the wrong expectation.
- **Still owed:** the manual check in Safari on the owner's Mac, after the deploy.
