# STORY_003 — The reference's stylesheets, icons, fonts and brand assets are harvested into the repo

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** Done (2026-09-26; the logo on 2026-09-27)
**Created:** 2026-09-26, as "The reference's design tokens are measured, not eyeballed". **Rewritten before implementation twice on 2026-09-26.** The first rewrite followed the owner's decision to lift what renders ([CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded)). The second came when the Playwright session was withdrawn ([STORY_001 → Withdrawal](STORY_001_the_owner_signs_in_to_the_reference_once_and_every_recon_run_reuses_that_session.md#withdrawal-2026-09-26)). The harvest now works offline from what the owner saved in their own browser, not from a walk of the live site.

As the assistant building the clone, I want the reference's stylesheets, icons and brand images copied into the repo, with a readable summary of the design tokens they define, so that clone stories build from the reference's own CSS and assets rather than from impressions of them.

## Current state

The source material is in the gitignored `recon/out/2026-09-26/` (checked 2026-09-26):

- **`assets/css/`** holds the nine stylesheets the signed-in app loads, saved by the owner (824 KB; `main.css` alone is 757 KB). The extension's `home-signed-in@1437.json` lists their original URLs under `https://assets.alicdn.com/g/qwenweb/qwen-chat-fe/0.3.11/css/`. Those are `main`, `index4`, `index5`, `index17`, `index25`, `index32`, `index35`, `index42` and `MemoryUpdatedDetailPopup`.
- **`Qwen.html`** holds seven inline `<style>` elements, among them Ant Design's icon styles, which the app adds at run time. It also holds **four hidden inline SVG sprites with 1,113 `<symbol>`s**:

  | Prefix | Count | Used by |
  | --- | --- | --- |
  | `qwpcicon-` | 545 | the desktop layout |
  | `appicon-` | 505 | the narrow layout (notes.md, Phase 7) |
  | `qwcoloricon-` | 37 | coloured icons |
  | `qwenFileicon-` | 26 | file-type icons |

  About 18 other inline `<svg>` elements are not sprites.
- **Fonts: there is nothing to harvest for the flow.** Body text resolves through a system stack naming Inter and NotoSansHans (`system-ui, ui-sans-serif, -apple-system, "system-ui", Inter, NotoSansHans, sans-serif`). The only `@font-face` rules in the stylesheets are KaTeX's math fonts, which the image flow never shows.
- **Brand:** the logo is `<img class="logo-img" src="./Qwen_files/qwen-logo-dark.svg">`. The saved page's `Qwen_files/` folder was not copied to the Spark, so **the logo file is not here yet**. The folder's other images are the mobile-app download guide, which is out of scope.
- **Breakpoints:** the stylesheets carry min/max-width media queries at 360, 599/600, 767/768, 800, 899, 1120, 1260, 1440 and 1760 px. The two widths actually read were 1437 and 393.

## UI Mockup

N/A (no UI change; the deliverables are files under `docs/recon/2026-09-26/`). The layout of what lands:

```
docs/recon/2026-09-26/
  assets/
    css/        the nine stylesheets verbatim, named as on the CDN, plus inline-<n>.css for each
                inline <style> in the saved page
    icons/
      desktop/  one .svg per qwpcicon- symbol, named by its id without the prefix
      app/      one .svg per appicon- symbol
      color/    one .svg per qwcoloricon- symbol
      file/     one .svg per qwenFileicon- symbol
      inline/   one .svg per distinct non-sprite inline svg, named icon-<hash8>
      index.md  every icon: set, name, viewBox, hash, the states it is seen in, duplicates
    brand/      qwen-logo-dark.svg (and any other logo file the page references)
    index.json  every harvested file: source (URL without query, or "inline"), path, bytes, sha256
  tokens.json   palette, type scale, spacing, radii, shadows, motion, breakpoints, custom properties,
                each with where it was seen
  tokens.md     the same, readable, plus the font statement
```

## Acceptance Criteria

- [x] `recon/run.sh harvest 2026-09-26` runs in the recon container, **makes no network request**, reads only `recon/out/2026-09-26/`, and writes the layout above.
- [x] **Stylesheets:**
  - The nine files are copied byte-for-byte to `assets/css/` under their CDN file names, and their `index.json` source is the CDN URL recorded in the extension reading. A file in `assets/css/` with no recorded URL stops the run.
  - Each inline `<style>` element of the saved page is written as `inline-<n>.css` in document order, with its `rc-util-key` or `data-*` origin recorded in `index.json` when present.
  - Every `url(...)` inside the stylesheets is listed in `index.json` with `harvested: false` and a reason (for example "KaTeX font, not used by the flow"), unless it is a `data:` URI.
- [x] **Icons:**
  - Every `<symbol>` in the four sprites becomes a standalone `.svg`: an `<svg>` root with the symbol's `viewBox` and the `xmlns`, holding the symbol's children unchanged. It goes in the folder for its prefix, named by its id without the prefix. Names are kept as the reference spells them, because clone code references them by id.
  - Each non-sprite inline `<svg>` goes to `icons/inline/icon-<hash8>.svg`, de-duplicated by the hash of its normalised markup.
  - `icons/index.md` lists every icon, and lists the states it is seen in from the sprite ids the `states/` readings record (STORY_002). It flags symbols in different sets whose normalised markup is identical.
  - The count per set matches the count of `<symbol>`s in the saved page, and a mismatch stops the run.
- [x] **Fonts:** no font file is harvested. `tokens.md` states:
  - the family stack the flow's elements resolve to (from the readings);
  - that it is a system stack with no web font to harvest;
  - that the only `@font-face` rules in the stylesheets are KaTeX's, which are out of scope.
- [x] **Brand:**
  - If `recon/out/2026-09-26/Qwen_files/qwen-logo-dark.svg` exists, it is copied to `assets/brand/`.
  - If it does not, the run finishes everything else and prints that the brand step is waiting for the owner to copy `Qwen_files/` over. This AC stays unticked until the file is there.
  - Only image files the page's markup names as a logo are taken. The app-download guide images are not.
- [x] **Tokens:**
  - `tokens.json` gathers values from two sources: the computed styles in every `states/` reading (font family, size, weight and line height; text, background and border colours; padding; gap; radius; shadow; transition), and the custom properties the stylesheets define on `:root`, `html` and `.dark`.
  - Distinct values are de-duplicated into a palette, a type scale, a spacing scale, radii, shadows and motion. Each value records the states and component names it was seen in.
  - Dark-theme values are kept apart from light-theme ones, because the capture is dark (`<html class="dark">`).
- [x] **Breakpoints** come from the media queries in the harvested stylesheets, de-duplicated and sorted, with the file each appears in. `tokens.md` also lists the layout differences the 1437 and 393 readings show: the sidebar becomes a drawer, the heading and example prompts disappear, the composer is pinned to the bottom, and the icon sprite switches to `appicon-`. **Resizing through widths on the live site is dropped**, because there is no live session. Which query produces each change is inferred, and `tokens.md` says so.
- [x] **What never lands in `docs/recon/`:** JavaScript, any URL with a query string, anything from an analytics or anti-bot host, and the owner's identity. The write is an allow-list: only CSS, SVG and the brand image types are ever written under `assets/`. The STORY_002 identity guard runs over the output before anything is written.
- [x] **Size:** the run prints the total bytes harvested. If `assets/` exceeds 20 MB, the run stops and asks the owner before anything is committed.
- [x] Re-running produces byte-identical output and an identical `index.json`.
- [x] Root `pnpm typecheck` and `pnpm test` pass through `recon/run.sh typecheck` and `recon/run.sh test`.

## Corrections before implementation (2026-09-26)

These were made on reading the files, before the harvest's code was written ([CLAUDE.md → §3 item 8](../../CLAUDE.md#3-how-features-are-built-important)):

- **The saved page holds 26 inline `<style>` elements, not seven.** One of them was injected by the capture extension ([BUG_001](../bug/BUG_001_the_snapshot_keeps_a_style_the_capture_extension_injected.md)). So the harvest reads inline styles and sprites from STORY_002's cleaned snapshot rather than from `Qwen.html`. The extension's markup and the owner's identity are then already gone. Only the identity guard reads `Qwen.html`, to learn what to look for.
- **Theme custom properties live under `html.dark` and `html.light`** (36 blocks each in `main.css`), plus one inline `:root` block. The parser reads `:root`, `html`, `html.dark`, `html.light`, `.dark` and `.light`.
- **Two id pairs differ only by case** (`qwpcicon-plan` and `qwpcicon-Plan`, and likewise `fullscreen2`). They would collide on a case-insensitive checkout, so the later one in document order gets a `__2` suffix, and the index maps each id to its file.
- **The 18 inline SVGs outside the sprites are all sprite references** (`use` elements). They are recorded as usage of those symbols, and `icons/inline/` is not created.
- The page also links `index46.css`, which the owner's save did not include. It stays a dead link, reported by curate ([BUG_002](../bug/BUG_002_the_snapshot_renders_unstyled_when_opened_from_disk.md)).

## Technical Notes

- Depends on STORY_002 for the `states/` readings (icon usage, computed styles) and the identity guard. The snapshot STORY_002 writes already links `../assets/css/`, so it renders once this story lands.
- HTML is parsed with `parse5`. CSS is parsed with `postcss`, used for `:root` / `.dark` custom properties, `@media` preludes, `url()` references and `@font-face` blocks. Both are recon devDependencies installed in the container.
- SVG normalisation for hashing: strip whitespace between tags, sort attributes, drop `class`, `id` and `data-*` attributes, and keep `viewBox`, `d`, `fill`, `stroke` and the rest. The committed file is built from the original markup, not the normalised one.
- A sprite symbol may use `fill="currentColor"`. It stays as it is, because the clone colours icons the way the reference does, through CSS `color`.
- The per-state readings are already settled values. The extension read them after animations finished, with the exception of `composer-typed`, which notes an 18px shift that settled. So no stable-box check is needed here.
- Remaining gap: the stylesheets' `url()` assets (images referenced from CSS, if any turn up beyond the KaTeX fonts) are listed but not fetched, because the harvest makes no network request. Any that the flow's surfaces need are raised with the owner rather than fetched.

## Testing Plan

- **Unit**
  - `recon/src/harvest-model.test.ts`:
    - the allow-list keeps CSS, SVG and the brand image types, and refuses JavaScript, JSON and HTML, including JavaScript with a `.css` or `.svg` extension (checked by sniffing the content);
    - CDN URLs map to stable file names and drop the query;
    - a stylesheet with no recorded URL is an error;
    - `index.json` entries carry source, path, byte count and sha256, in a stable order.
  - `recon/src/icons.test.ts`, run on a fixture sprite with three symbols, one of them duplicated in a second set:
    - a symbol becomes a standalone svg with its `viewBox` and `xmlns`, and its children unchanged;
    - the prefix picks the folder and is stripped from the name;
    - two svgs that differ only in whitespace, attribute order, `class`, `id` or `data-*` hash the same, and a different `d` hashes differently;
    - cross-set duplicates are flagged;
    - a count mismatch throws;
    - usage is joined from the sprite ids named in readings.
  - `recon/src/tokens-model.test.ts`:
    - custom-property parsing reads `:root`, `html` and `.dark` and ignores other selectors, keeping dark apart from light;
    - `@font-face` parsing finds the families and marks KaTeX as out of scope;
    - media-query parsing reads `max-width`, `min-width` and range syntax (`width<=768px`, `width>=1440px and width<1760px`), de-duplicates and sorts;
    - the palette collapses identical colours written as hex and as rgb, keeps alpha variants distinct and drops transparent;
    - the type scale is ordered by size and records where each size was seen;
    - the spacing scale is ascending and drops zero;
    - the markdown renderer emits every section and the font statement.
- **Integration**: N/A. This is an offline transform of local files into local files, and the unit tests cover it through fixtures. There is no server or store.
- **E2E**: N/A. There is no product UI. Manual steps:
  1. The assistant opens `snapshots/home-signed-in@1437.html` with the harvested CSS through a local static server in a container on a free port, and confirms it renders as the dark signed-in home, with icons.
  2. The assistant spot-checks the palette against the readings (`#171717` page, `#2c2c2c` composer, `#426eff` image-mode accent).
  3. **The owner looks at the rendered snapshot next to the live reference in their own browser and confirms the harvested set before it is committed.**

## Estimated Complexity

M

## Done (2026-09-26)

- `recon/run.sh harvest 2026-09-26` wrote 1,145 files (2.32 MB of content) and reported the identity guard clean. A second run was byte-identical.
- **Stylesheets:** 9 from the CDN plus 23 inline (non-empty), 32 in all. 66 `url()` references were not fetched: 59 KaTeX font files and the app-download guide's images.
- **Icons:** desktop 545, app 505, color 37, file 26, which matches the sprite counts. `icons/index.md` records usage from the readings and the snapshot, and the groups of identical markup.
- **Tokens:** 25 colours, 10 type sizes, 20 breakpoints and 597 custom properties. The palette matches the readings: `#171717` page, `#2c2c2c` composer, `#426eff` image-mode accent, `#293652` user bubble.
- **Fonts:** none harvested. The flow uses the system stack, and the only `@font-face` rules are KaTeX's.
- **Brand: waiting.** `qwen-logo-dark.svg` is in the saved page's `Qwen_files/`, which is not on the Spark. When the owner copies it to `recon/out/2026-09-26/Qwen_files/`, re-running the harvest adds it and this AC can be ticked.
- **Manual render check:** the snapshot, opened from disk in headless Chromium at 1437×1031 with the harvested CSS and all network blocked, renders as the dark signed-in home: sidebar, heading, composer with its icons, "Owner" and a grey avatar. The first attempt rendered unstyled, which is how [BUG_002](../bug/BUG_002_the_snapshot_renders_unstyled_when_opened_from_disk.md) was found and fixed. The screenshot is in `recon/out/2026-09-26/render/` (gitignored).
- **The owner's comparison with the live reference was deferred by the owner's choice (2026-09-26):** commit and push, then review.
- Gate: `recon/run.sh typecheck` and `recon/run.sh test` (81 tests) were green, run by hand.

**Logo, 2026-09-27:** the owner copied `Qwen_files/` onto the Spark. The harvest wrote `assets/brand/qwen-logo-dark.svg` (3,780 bytes, no script), and the identity guard reported clean. The Brand AC is ticked, and the app shows the logo (CHORE_003).
