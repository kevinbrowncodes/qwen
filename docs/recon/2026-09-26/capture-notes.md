# Capture notes, 2026-09-26

Copied verbatim from the owner's capture by `recon/run.sh curate`; do not edit by hand.

## notes.md

# Extension recon notes — 2026-09-26

Collected by Claude in Chrome in the owner's own signed-in Chrome, reading the DOM read-only. There are no screenshots, by the owner's choice. The viewport is 1437×1031, since Chrome cannot be made exactly 1440 wide on the owner's screen.

## Phase 1: finding image mode

- **Routes into image mode.** The composer's "+" (`Select Mode`) opens a menu. Its items, exactly as shown: `Upload attachment` (subtitle `file, image, video, audio`), `Create Image`, `Create Video`, `Web search`, `Deep Research`, `Web Dev`, `Slides`, `More`, `Tools`. **Create Image** is the route in. The top-bar model picker (`Qwen3.7-Plus`) has not been opened yet. The sidebar has no image entry, and the URL stays `/`.
- **What entering image mode changes:**
  - The composer grows from 58px to 106px and splits into two rows: the textarea on top, a footer row of controls below.
  - The footer shows "+", then a blue `Create Image` pill with an × to leave the mode, then two pill dropdowns, `Qwen-Image 2.0` and `16:9`.
  - The `Auto` thinking selector disappears.
  - Four 189×189 example-prompt cards appear, each with a `Use Prompt` button, plus an `Explore more` link.
  - The placeholder stays `Ask Qwen`, and the heading stays `How can I help you?`.
- **The model is named `Qwen-Image 2.0` in the UI**, while the chat model reads `Qwen3.7-Plus`. We serve Qwen-Image-2.1, which EPIC_003 records as a departure.
- **No popup, tour, banner or toast** appeared.
- **The owner's identity shows** in the sidebar's bottom-left user button (name, a "Free" plan label, the avatar), with an `Upgrade` button beside it.
- **Theme:** dark, with `<html class="splash-detail dark">`, a page background of `#171717` and a composer of `#2c2c2c`. The image-mode accent is `#426eff`.
- **Icons** are an own sprite (`#qwpcicon-*`), not a public set. The extension will not copy the SVG markup, so the sprite comes from a "Save Page As… Complete" save.
- **Fonts:** no web font is loaded. Text uses a system stack naming Inter and NotoSansHans.
- **Stylesheets:** nine CSS files from `assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.3.11/css/`, listed in `home-signed-in@1437.json`.

## Phase 2: the image-mode controls

- **Image model dropdown:** `Qwen-Image 3.0` and `Qwen-Image 2.0`. **2.0 is selected by default**, even though 3.0 is listed first. There are no subtitles or badges. The selected item has a check (a CSS mask, 16px) and a `rgba(250,251,255,0.05)` background.
- **Aspect ratio dropdown:** `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `16:9` (default), `9:16`, in that order. Each has a rectangle icon drawn in its shape (sprite `qwpcicon-a-<w>by<h>AspectRatio`). No pixel sizes are shown. The closed trigger shows only the text. **These are the same seven ratios Qwen-Image-2.1's model card lists**, so they map one to one.
- **Dropdown popup look:** background `#2c2c2c`, a 0.8px border `rgba(250,251,255,0.12)`, radius 12px, padding 4px, shadow `0 12px 24px -2px rgba(0,0,0,0.05)`, z-index 1050. Items are 36px tall with 8px radius and `6px 12px` padding, in 14px `#fafbff` text.
- **The "+" menu in image mode** is the same list as on the home screen, with two differences: the Upload subtitle becomes `file, image`, and the menu narrows from 331px to 255px. `Create Image` is not marked selected. `More` opens a submenu (`Artifacts`, `Learn`, `Travel Planner`), and `Tools` has a switch that is on.
- **The top-bar model picker** lists only chat models (`Qwen3.7-Plus`, `Qwen3.8-Max`, `Qwen3.8-Omni-Flash`, `Expand more models`). Image models appear only in the composer's dropdown.
- **`Explore more`** runs code that opens the Community page. It is not a link. **`Use Prompt`** fills the textarea with the example's prompt and attaches its reference images, without sending. The overlay on each card (the prompt text and `Use Prompt`) shows only on hover, so a resting card is just the image.
- **Limits:** none are shown before submit. There is no character counter or quota count, and the textarea has no `maxlength`.

## Phase 3: prompt and reference image

- **Typing a prompt** swaps the mic and voice-mode buttons for one white circular send button (`button.send-button`, aria-label `Send`, 32px, `#ffffff`, radius 50%, a dark up-arrow `#222222` from sprite `qwpcicon-sendChat`). The composer stays 106px for one line. No counter appears, and the textarea has no `maxlength`. The block briefly shifts 18px down while typing, then settles back.
- **File input:** a single `input#filesUpload` inside `.mode-select`, with `multiple` true. `accept` is empty at rest, so it may be set just before the picker opens. The only hint is the Upload subtitle `file, image`, and no count or size limit is shown.
- **Attaching a reference image** puts a 56×56 thumbnail row above the textarea (radius 16px, `object-fit: cover`, background `rgba(250,251,255,0.05)`). An always-visible 14px round `Remove file` button sits top-right. The composer grows from 106px to 170px. **The aspect-ratio dropdown disappears while an image is attached**, so an edit takes its size from the reference, and it comes back on removal. The Create Image pill and the model dropdown stay, no "edit" label appears, and the placeholder stays `Ask Qwen`. No upload progress was visible at read time, because the image was already served over https. The photo the owner attached had consent, per the owner.

## The owner's edit generation (seen in the owner's own screenshot, 2026-09-26)

The owner sent one edit: their consented reference photo, with the prompt "make the subject wear a shirt". **This is the third generation, the edit.** The text-to-image run and the cancel are still unused. What the finished chat shows (the screenshot itself is not kept):

- **The sidebar gains "My Library"**, with a chevron and a thumbnail of the result below it. It was absent from the Phase 1 sidebar reading, so it likely appears once an image exists. This is the likely gallery surface for history.
- **The chat list:** an "All chats" heading, a "Today" group label, and the active row showing the auto-generated title "Add Shirt to Subject" with a "…" menu. The row is highlighted and rounded.
- **The generation runs as a chat turn by the chat model (`Qwen3.7-Plus` in the top bar), which calls a tool.** The reply opens with a line saying it will use the "image_edit tool", then shows the image, then a paragraph describing the result.
- **The user message** is a right-aligned blue-grey rounded bubble, with the reference image as a rounded thumbnail above it.
- **The result** is a large inline image with rounded corners, at roughly half the message column's width in the screenshot.
- **The action row** under the reply has six icons: copy, thumbs up, thumbs down, share, regenerate, and "…". There are no labels, and download is not visible there, so it probably sits under "…" or on the image itself.
- **The composer after completion is back in chat mode.** It has no Create Image pill and shows a "Fast" dropdown where the home screen had "Auto", plus mic and send.
- **A footer line under the composer:** "AI-generated content may not be accurate."

## Finished edit, My Library and the chat menu (extension read, 2026-09-26)

- **Finished chat** at `/c/[chat-id]`:
  - The user bubble is `#293652`, radius 18px, padding `9px 16px`, 16px/26px text. The reference thumbnail above it is 112×112 with a 12px radius. Under the bubble are Copy, Edit and Delete (32px buttons).
  - The reply is text, then the image, then text. The image renders 400×223 with a 20px radius (natural size 807×450), which suggests the reference's aspect ratio was kept.
  - **The image hover overlay** has a round 32px download button top-right (`rgba(0,0,0,0.32)`, no aria-label) and a bottom pill reading `Create Video` | `Edit`.
  - **The reply's action row:** `Copy`, `Good Response`, `Bad Response`, `Share`, `Regenerate`, `More actions`. The last opens `Read aloud`, `Branch in new chat` and `Delete`.
- **After a result, the composer is in chat mode:** a `Fast` dropdown and no Create Image pill. The send button stays visible but disabled (`rgba(250,251,255,0.24)`) while the box is empty. The footer line "AI-generated content may not be accurate." is 10px/12px in `rgba(250,251,255,0.5)`.
- **My Library** appears in the sidebar once an image exists: an icon, the label, and a chevron, with 68×68 thumbnails below. Clicking goes to **`/library`**, which has:
  - a header titled `My Library` and a `My Published` button;
  - type tabs `All` / `Image` / `Video` / `Document` / `Web Dev` / `Podcast` on a `#19191a` segmented control, with the active tab `#2c2c2c`;
  - a masonry grid of 276px cards, each with a hover gradient bar and a `Download` icon.
  **This is the history/gallery surface for the clone.**
- **The chat row's "…" (`Chat Menu`, hover-only)** offers: `Pin`, `Rename`, `Clone`, `Archive`, `Share`, `Select`, `Download` › (`Export chat (.json)`, `Plain text (.txt)`), `Move to Project` › (`New Project`), `Delete` (red `rgb(255,64,64)`), and `Report Content`.
- **Generations used: one**, the edit. The extension counts it as one of two. The owner's approved plan is the edit plus the text-to-image run plus the cancel, so two remain.

## Phase 5: text-to-image, followed to the end (generation 2 of 3)

- **Submit:** the URL goes `/` → `/c/new-chat` → `/c/[id]` within about 8s. The user message and an empty assistant message render at once, and the chat is auto-titled in the sidebar.
- **While generating** there is **no progress %, no status text, and no queue position**. There is only a 400×225 skeleton card (`.qwen-media-skeleton`, background `#3e474e`, radius 20px) with animated layers: drift-y 3.08s, pulse 1.89s, glow 1.705s, a grain texture and a centred 32px icon.
- **The Stop button** (`button.stop-button`, aria-label `Stop`, icon `qwpcicon-stop-fill`) replaces Send but **stays disabled for the whole run** (cursor not-allowed). **The reference offers no way to cancel a text-to-image job from the UI.**
- **Duration:** about 33–40s from send to image. The extension could only read about every 8s.
- **Done:** the reply is the image alone, with no text. The image fades in and renders 400×229 with a 20px radius. The display copy is 788×450 (the CDN resize `m_mfit,w_450,h_450`), and the full-resolution size is not exposed.
- **Hover actions on a text-to-image result**, all 32px circles `rgba(0,0,0,0.32)` darkening to `rgba(0,0,0,0.5)` on hover, 12px apart, with 20px white icons:
  - top-right: `Good Response`, `Bad Response`, `Publish to community`, `Download` (a black tooltip below);
  - a bottom pill: `Create Video` | `Edit`.
  The row below the image is `Share`, `Regenerate`, `More actions`. **This differs from the edit reply**, which had text around the image and Copy/Good/Bad in the row.
- **My Library** now has two cards, one 276×158 (16:9) and one 276×276. The sidebar preview updated only after `/library` was opened.

## Phase 6 skipped; Phase 7 narrow, first pass (partial)

- **Phase 6, the cancel, was skipped.** Stop was disabled for the whole Phase 5 run, so the reference has no UI cancel for image jobs. Our clone adds one, because CLAUDE.md §6 rule 4 requires it, and it is recorded as a Departure. Generations used: 2 (the edit and text-to-image).
- **Narrow width, emulated iPhone 16 in DevTools:** innerWidth 393, height 852, `maxTouchPoints` 1, coarse pointer, no hover. The viewport later jumped to 314×681 mid-phase, so later reads were discarded.
- **At 393:**
  - The sidebar becomes a slide-in drawer (fixed, width 0 when closed, 0.2s width transition). It is opened by a ☰ at the header's top-left (`.sidebar-toggle-icon`, 21px, no aria-label and not a real button).
  - The drawer puts the username menu at the top, then New Chat, Community, New Project and All chats.
  - The header is 58px: ☰, then `Qwen3.7-Plus` (15px semibold, with a caret), then the temporary-chat icon on the right.
  - **There is no "How can I help you?" heading**, and the home screen is blank.
  - The composer is pinned to the bottom with 17px margins, 359×49, radius 24px. It shows "+", `Ask Qwen`, mic and voice mode, with **no `Auto` selector**.
  - **The narrow layout uses a different icon sprite, `#appicon-*`**, not the desktop `#qwpcicon-*`.

## Phase 7 at 393×852 (iPhone 16 emulation, DPR 3, touch, no hover)

- **The site was at 125% Chrome zoom on the owner's machine** (DPR 2.5 on desktop). The desktop @1437 files are in CSS px and are correct, but they describe a 1437-px CSS layout, not a 100%-zoom window.
- **Clicks from the extension break the emulation** (it drops back to 314px), so taps at this width are done by the owner. The extension reached the chat and library pages by loading their addresses, with the chat id taken from the page's own data.
- **Home:** a 58px header with ☰ (`appicon-menu`, no aria-label), `Qwen3.7-Plus` (15px/600, aria `Models Qwen3.7-Plus`) and the temporary-chat icon. **No heading and no example prompts.** The composer is pinned at the bottom (359×47, radius 24px), with a "+" on a `#232326` circle, `Ask Qwen` at 16.768px, mic and voice mode, and **no Auto selector**.
- **Drawer:** fixed, 0 wide when closed and 335 when open, background `#111112`, width 0.2s ease-in-out, z-index 50. The user menu (63px tall) is at the top, then New Chat, My Library with 76×76 thumbnails, Community, Projects and All chats. **No Upgrade button.**
- **Finished image at 393:** it renders 300×171 (radius ~21px), from a CDN copy fitted to 320 (560×320). **Touch has no image overlays.** One action row under the image: `Create Video`, `Edit`, `Good Response`, `Bad Response`, `Share`, `Regenerate`, `More actions`, **with no Download visible**; it is probably under More actions or a full-screen preview (unconfirmed). In image mode the composer collapses to one row; the pill is icon-only and the model label shortens to `Model 2.0`. There is no footer statement at this width.
- **My Library at 393:** the header has ☰, a centred `My Library` (18.864px) and an icon-only `My Published`. The tabs scroll sideways, and the active tab is `rgba(255,255,255,0.12)` with no track. The grid has 2 columns of 180px with an 8px gap. **The `Download` bar is always visible on touch.**
- The narrow layout uses the `#appicon-*` sprite, and many sizes are scaled by ×1.048 (16.768 = 16×1.048), which suggests a rem-based scale on mobile.
- **Drawer open at 393:** 335px wide over a `rgba(0,0,0,0.1)` backdrop (z-index 999). Rows are 42px with an 8px radius and a 13px inset: the user row (63px), New Chat, Search (icon only), My Library with 76px thumbnails, Community, Projects/New Project, All chats, and the chat rows. **On touch the chat "…" menu is always visible.** There is no Upgrade button.

## notes-extension-summary.md

# Summary written by Claude in Chrome at the end of the session (2026-09-26)

It restates the per-phase notes in `notes.md`. The points below are the ones it adds or states differently.

- **Not captured:**
  - a cancelled run (Stop stayed disabled, so there may be no cancel for text-to-image);
  - a failed run, a moderated prompt, and any quota or limit message;
  - upload progress;
  - the full-resolution output size;
  - on the phone: the image-mode entry, the ratio dropdown (a dropdown or a bottom sheet), the typed state, and where Download lives;
  - Qwen-Image 3.0's behaviour, the "Expand more models" list, and the My Published view;
  - a fresh desktop Create Image state at the very end, because the extension's clicks stopped working after the phone emulation.
- **Extra UI strings seen:** `Model`, `Model Comparison`, `Upload files`, `Toggle sidebar`.
- **No error, refusal, limit, captcha or "unusual activity" message** appeared at any point in the session.
- **Generations used:** two, the edit and the text-to-image run.
- **The generation, upload and status endpoints were not observed.** They ran in page loads whose timing records had been cleared by the time the extension looked. The clone uses its own job API in any case.
