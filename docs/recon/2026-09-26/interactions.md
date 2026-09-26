# How the reference's image generation flow behaves, 2026-09-26

Written by hand for STORY_004 from `capture-notes.md`, the readings in `states/`, and `endpoints.md`. Each section says what was observed and what was **not observed on the wire**. The reference's generation protocol was not captured at all ([endpoints.md](endpoints.md)), so nothing here describes its requests. Our protocol is our own async job API, which is create, then poll status, then fetch the result ([CLAUDE.md → §4a](../../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)).

Widths: desktop readings are at 1437 CSS px (the owner's browser was at 125% zoom), and narrow readings are at 393 CSS px, an emulated iPhone 16 with touch and no hover.

## The frame everything happens in

On the reference, a generation is a **chat turn**. The chat model shown in the top bar (`Qwen3.7-Plus`) receives the prompt and calls an image tool. The edit reply opened with a line saying it would use the "image_edit tool", and the result appears as the assistant's reply in a chat at `/c/<id>`. The chat is auto-titled in the sidebar ("Add Shirt to Subject", "Red Bicycle Brick Wall").

- **Observed:** the URL goes from `/` to `/c/new-chat` to `/c/<id>`; the user bubble (`#293652`, radius 18 px); the assistant reply holding the image; the sidebar chat rows.
- **Not observed on the wire:** how the chat turn is sent, whether it streams, and how the tool call and its result are delivered.

## Entering image mode

- The composer's **+** (`Select Mode`, `.mode-select-open`) opens a menu: `Upload attachment`, `Create Image`, `Create Video`, `Web search`, `Deep Research`, `Web Dev`, `Slides`, `More`, `Tools`. **Create Image** enters image mode, and the URL stays `/` ([states/mode-menu-open@1437.json](states/mode-menu-open@1437.json)).
- In image mode the composer grows from 58 to 106 px and splits into two rows: the textarea on top, then a footer row with **+**, a blue `Create Image` pill with an × to leave the mode, and two pill dropdowns, `Qwen-Image 2.0` and `16:9`. The `Auto` selector disappears. Four 189×189 example cards appear with `Use Prompt` (visible on hover), plus `Explore more` ([states/composer-image-mode@1437.json](states/composer-image-mode@1437.json)).
- The image-mode accent is `#426eff`.
- At 393 the pill is icon-only and the model label shortens to `Model 2.0`. The composer collapses to one row. This comes from the notes; the image mode itself was not read at this width.

## The options

- **Image model** ([states/image-model-open@1437.json](states/image-model-open@1437.json)): `Qwen-Image 3.0`, then `Qwen-Image 2.0`. **2.0 is selected by default.** There are no subtitles. The selected item has a 16 px check and a `rgba(250, 251, 255, 0.05)` background.
- **Aspect ratio** ([states/aspect-ratio-open@1437.json](states/aspect-ratio-open@1437.json)): `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `16:9` (default) and `9:16`, each with an icon drawn in its shape (`qwpcicon-a-<w>by<h>AspectRatio`). No pixel sizes are shown.
- **Dropdown popups:** `#2c2c2c`, a 0.8 px border `rgba(250, 251, 255, 0.12)`, radius 12 px, padding 4 px; items 36 px tall with 8 px radius and 14 px `#fafbff` text.
- **Limits:** none shown before submit. There is no character counter, no `maxlength`, and no quota count.

## Typing a prompt

- Typing swaps the mic and voice-mode buttons for one white circular **Send** (`button.send-button`, 32 px, `#ffffff`, dark arrow `qwpcicon-sendChat`). While the box is empty, Send is disabled at `rgba(250, 251, 255, 0.24)` ([states/composer-typed@1437.json](states/composer-typed@1437.json)).
- `Use Prompt` on an example card fills the textarea and attaches that example's reference images **without sending**.

## Attaching a reference image (the edit)

- There is one `input#filesUpload` with `multiple` set, and `accept` is empty at rest. The Upload item's subtitle in image mode is `file, image`. No count or size limit is shown.
- An attached image shows as a 56×56 thumbnail (radius 16 px, `object-fit: cover`) above the textarea, with an always-visible 14 px round `Remove file`. The composer grows to 170 px ([states/composer-reference-attached@1437.json](states/composer-reference-attached@1437.json)).
- **The aspect-ratio dropdown disappears while an image is attached**, so an edit takes its size from the reference. It comes back when the image is removed. The pill and the model dropdown stay, and no "edit" label appears.
- **Not observed on the wire:** the upload request, upload progress, and any server-side validation.

## Submit, then generating

- **Submit** renders the user message and an empty assistant message at once, and the URL moves to `/c/<id>` within about 8 s ([states/job-submitted@1437.json](states/job-submitted@1437.json)).
- **Generating** shows **no progress figure, no status text and no queue position**. There is only a 400×225 skeleton card (`.qwen-media-skeleton`, `#3e474e`, radius 20 px) with drift (3.08 s), pulse (1.89 s) and glow (1.705 s) animations, a grain texture and a centred 32 px icon ([states/job-generating@1437.json](states/job-generating@1437.json)).
- **Duration:** about 33–40 s from send to image for text-to-image. It was read about every 8 s.
- **Not observed on the wire:** whether completion is pushed (a stream) or polled, and at what cadence.

## Cancel

- A **Stop** button (`button.stop-button`, `qwpcicon-stop-fill`) replaces Send while generating, but **it stays disabled for the whole run**. The reference offers no way to cancel an image job from its UI, so there is no cancel state to capture ([coverage.md](coverage.md)).

## Done

- **Text-to-image:** the reply is the image alone. It fades in at 400×229 with a 20 px radius, from a 788×450 CDN-resized copy. The full-resolution size is not exposed ([states/job-done@1437.json](states/job-done@1437.json)).
- **Edit:** the reply is text, then the image (400×223, natural 807×450, keeping the reference's ratio), then text ([states/edit-done@1437.json](states/edit-done@1437.json)).
- **Hover overlay (desktop):** four 32 px circles `rgba(0, 0, 0, 0.32)`, darkening to 0.5 on hover and 12 px apart, top-right: `Good Response`, `Bad Response`, `Publish to community`, `Download`. A bottom pill reads `Create Video` | `Edit`. The row below the image has `Share`, `Regenerate` and `More actions`.
- **After a result**, the composer returns to chat mode, with a `Fast` selector and no Create Image pill. A 10 px footer line reads "AI-generated content may not be accurate."

## Download

- **Desktop:** the round `Download` button on the image's hover overlay. There is no aria-label on the edit reply's; the text-to-image reply's has a black tooltip.
- **Narrow (touch):** no hover overlays, and no Download visible in the action row (`Create Video`, `Edit`, `Good Response`, `Bad Response`, `Share`, `Regenerate`, `More actions`). It is probably under More actions or a full-screen preview (unconfirmed; [coverage.md](coverage.md)).
- **Not observed on the wire:** whether download fetches the full-resolution file or the displayed copy.

## History: My Library

- `My Library` appears in the sidebar **once an image exists**: an icon, the label, a chevron, and 68×68 thumbnails (76×76 in the narrow drawer). It links to **`/library`** ([states/my-library@1437.json](states/my-library@1437.json)).
- `/library` has a `My Library` header and a `My Published` button, then type tabs `All`, `Image`, `Video`, `Document`, `Web Dev` and `Podcast` on a `#19191a` segmented control (the active tab is `#2c2c2c`), then a masonry grid of 276 px cards. Each card has a hover gradient bar with a `Download` icon.
- **Narrow:** 2 columns of 180 px with an 8 px gap. The tabs scroll sideways, and the Download bar is always visible ([states/my-library@393.json](states/my-library@393.json)).
- The sidebar preview updated only after `/library` was opened.
- **Observed on the wire (paths only):** `/api/v2/library/list`, `/api/v2/chats/` and `/api/v2/chats/:id` ([endpoints.md](endpoints.md)).

## Narrow layout (393)

- The sidebar becomes a drawer: fixed, 0 wide closed and 335 px open, `#111112`, a 0.2 s width transition, over a `rgba(0, 0, 0, 0.1)` backdrop. It opens from a ☰ (`appicon-menu`) at the top left of a 58 px header ([states/home-signed-in@393.json](states/home-signed-in@393.json)).
- The home has **no heading and no example cards**. The composer is pinned to the bottom with 17 px margins (359×47, radius 24 px) and has no Auto selector.
- The narrow layout uses the `appicon-` sprite, and many sizes scale by 1.048, which suggests a rem-based mobile scale.

## Mapping onto Qwen-Image-2.1 on the Spark

The entries for EPIC_003's **Departures from the reference** sections. "Same" means the clone matches the reference. "Departure" means it deliberately differs, with the reason. "N/A" means it is outside the MVP or only makes sense against Alibaba's cloud.

| Reference | Clone | Reason |
| --- | --- | --- |
| Image model dropdown: Qwen-Image 3.0 / 2.0, default 2.0 | **Departure:** one model, Qwen-Image 2.1 | Only 2.1 is served on the Spark; a dropdown with one entry is kept, so the layout matches, or is shown as a static pill (EPIC_003 decides) |
| Aspect ratio: 1:1, 2:3, 3:2, 3:4, 4:3, 16:9 (default), 9:16 | **Same** | Qwen-Image-2.1's model card lists exactly these seven |
| Aspect ratio hidden while a reference is attached | **Same** | An edit takes its size from the reference |
| Reference images: `multiple`, no limit shown | **Departure:** up to 10, with the limit enforced and stated | Qwen-Image-2.1 accepts up to 10 references; the local server must refuse more |
| No progress figure; animated skeleton | **Same skeleton**; the job's queued / running state may be shown in text | Our job API reports status; whether to show it is EPIC_003's call |
| Stop disabled for the whole run (no cancel) | **Departure:** Stop cancels the job | [CLAUDE.md → §6 rule 4](../../../CLAUDE.md#6-key-rules) requires cancel on both sides |
| About 33–40 s per text-to-image | Measured on the Spark (EPIC_004) | Local generation time differs; the UI must not assume a duration |
| Generation as a chat turn by a chat model calling an image tool | **Departure:** a generation is a job; no chat model | The MVP has no chat ([CLAUDE.md → §1](../../../CLAUDE.md#1-project-overview)); the result can still render in the same message layout |
| Download on hover (desktop), not visible on touch | **Same on desktop; departure on touch:** Download in the action row | A touch user must be able to download ([CLAUDE.md → §6 rule 9](../../../CLAUDE.md#6-key-rules)) |
| Regenerate | **Same** | Resubmits the same prompt and options as a new job |
| Edit (on the result) | **Same** | Starts an edit with the result attached as the reference |
| Create Video, Publish to community, Share, Good/Bad Response | **N/A** | Out of the MVP, or cloud and community features |
| My Library tabs All / Image / Video / Document / Web Dev / Podcast | **Departure:** image generations only; tabs reduced to what exists | Only images are generated locally |
| My Published, Community, Explore more | **N/A** | Cloud community features |
| Example cards with Use Prompt | **Same**, with local sample prompts and no reference-generated images | Their card art is reference output, which never enters git |
| Auto / Fast selector, voice mode, Upgrade, Free plan | **N/A** | Chat, voice and billing are out of the MVP |
| Footer: "AI-generated content may not be accurate." | **Same** | The same caution applies to a local model |
| Full-resolution output size (not exposed) | Qwen-Image-2.1's native size for the chosen ratio | Our result endpoint serves the file the model wrote |
