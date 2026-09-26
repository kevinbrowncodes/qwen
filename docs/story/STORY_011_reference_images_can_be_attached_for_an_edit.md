# STORY_011 — Reference images can be attached to the composer for an edit

**Epic:** [EPIC_003](../epic/EPIC_003_the_image_generation_screen_is_rebuilt_to_match_the_reference.md)
**Status:** Not started (after STORY_010)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want to attach up to ten images to the composer and see them as thumbnails I can remove, so that my prompt edits them the way it does on chat.qwen.ai.

## Current state

After STORY_010, the + menu's `Upload attachment` does nothing. The app's `POST /api/jobs` already accepts multipart with up to 10 `referenceImage` parts and checks them (STORY_007).

## UI Mockup

**Reference capture:** `states/composer-reference-attached@1437.json`, and `interactions.md` → "Attaching a reference image".

**Measured values committed to:**

| Element | Values |
| --- | --- |
| Thumbnail row | `.message-input-column-file` / `.file-card-list` above the textarea |
| Thumbnail | `.vision-item-container` 56×56, radius 16, `object-fit: cover`, background `rgba(250,251,255,0.05)` |
| Remove | `button.close-button`, 14×14, always visible, top right |
| Composer | grows from 106 to 170 with one thumbnail |
| Ratio | **the aspect-ratio dropdown disappears while any image is attached**, and returns when the last is removed |

```
┌───────────────────────────────────────────────────────────┐
│ [▣×] [▣×]                                                 │  56×56 thumbnails
│ make the subject wear a shirt                             │
│ (+) (✦ Create Image ×) (Qwen-Image 2.1 ▾)             (↑) │  no ratio dropdown
└───────────────────────────────────────────────────────────┘
```

A refusal appears as a line under the composer, in the reference's secondary text colour:

```
│ photo.gif is not a PNG, JPEG or WebP image.               │
```

**Narrow:** the same row, scrolling sideways when full. The remove buttons get a 44px touch area around the 14px glyph.

## Departures from the reference

- **The limit is shown.** The reference shows no count or size limit. Ours refuses an eleventh image, or a file that is not PNG, JPEG or WebP or is over 20 MB, and says why, because Qwen-Image-2.1 takes at most 10 references.
- **Drag and drop, and paste,** onto the composer also attach an image. The reference's `#dropzone-container` suggests it has drop; it was not observed. This is an addition the owner gets for free.
- **Upload progress** is not shown: files go up with the submit (STORY_012), and the reference showed none either.

## Acceptance Criteria

- [ ] `Upload attachment` opens a file picker with `accept="image/png,image/jpeg,image/webp"` and `multiple`. Choosing files enters image mode if it is not already on, and adds thumbnails in order.
- [ ] Each thumbnail is a local object URL (revoked on remove and unmount) and has a remove button with the accessible name "Remove file".
- [ ] Attaching any image hides the ratio dropdown. Removing the last one shows it again with the ratio that was chosen before.
- [ ] More than 10 images, a non-image, or a file over 20 MB is refused before submit with the message format above, and the files already attached are kept. The same rules as the server's (`lib/upload-validation.ts`) run in the browser.
- [ ] Dropping or pasting image files onto the composer attaches them under the same rules.

## Testing Plan

- **Unit:** `app/lib/composer-state.test.ts`, extended:
  - adding and removing references keeps their order;
  - the ratio is hidden with references and restored after;
  - an eleventh file is refused with the message;
  - a refusal keeps the files already attached.

  `app/components/ReferenceThumbs.test.tsx`: renders a thumbnail per file with "Remove file"; clicking remove calls back with that index; object URLs are revoked on unmount (spy on `URL.revokeObjectURL`).
- **Integration:** N/A. The route's checks are covered by STORY_007.
- **E2E:** `app/e2e/references.spec.ts`, at both widths, using the committed fixture `tools/stub-generation-server/fixtures/reference.png`.
  1. Open `/`, then **+**, then "Upload attachment", and set the file chooser to the fixture.
  2. Expect one "Remove file" button, a thumbnail image that has loaded, and no ratio dropdown.
  3. Remove the image and expect the ratio dropdown back, reading "16:9".
  4. Set a text file named `fake.png` and expect the refusal "fake.png is not a PNG, JPEG or WebP image." with no thumbnail.
  5. The server-received half (the stub records each upload's sha256) is asserted in STORY_012's edit spec, where the submit happens.

## Estimated Complexity

S–M
