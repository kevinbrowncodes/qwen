# STORY_003 — The reference's stylesheets, icons, fonts and brand assets are harvested into the repo

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** Not started (after STORY_002)
**Created:** 2026-09-26 (as "The reference's design tokens are measured, not eyeballed"; rewritten before implementation on 2026-09-26 after the owner's decision to lift what renders — [CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded))

As the assistant building the clone, I want the reference's stylesheets, inline SVG icons, loaded font files and brand images copied into the repo, with a readable summary of the design tokens they define, so that clone stories build from the reference's own CSS and assets rather than from impressions of them.

## Current state

Nothing harvested. Logged out on 2026-09-26 the app loaded a versioned `qwen-chat-fe` bundle from `assets.alicdn.com/g/qwenweb/qwen-chat-fe/…`; body text resolved through a system-ui stack naming Inter and NotoSansHans; the only web fonts actually loaded were KaTeX's. Signed in may differ — this story records what it finds. STORY_002 supplies the list of states to walk and a page snapshot of each.

## UI Mockup

N/A (no UI change; the deliverables are files under `docs/recon/<date>/`). The layout of what lands:

```
docs/recon/<date>/
  assets/
    css/        every stylesheet the app loads, verbatim, named by CDN path (version kept)
    icons/      one .svg per distinct inline icon + index.md (name, where seen, hash)
    fonts/      the font files actually requested + font-faces.css
    brand/      logo and brand images the flow shows
    index.json  every harvested file: source URL (no query), path, bytes, sha256
  tokens.json   palette, type scale, spacing, radii, shadows, motion, breakpoints,
                :root custom properties — each with where it was seen
  tokens.md     the same, readable
```

## Acceptance Criteria

- [ ] `pnpm recon:harvest` reuses the STORY_001 session, **refuses to run unless the session reads signed-in**, walks the part-1 states in STORY_002's manifest (no generation, never submits), and writes the layout above for the day.
- [ ] **Stylesheets:** every stylesheet the page loads (linked and constructed from `<style>` elements, including those added after load) is saved verbatim under `assets/css/`. Files are named from the CDN path with the version segment kept, so two bundle versions never overwrite each other. `url(...)` references inside them are listed in `index.json` with whether they were harvested.
- [ ] **Icons:** every inline SVG visible in any walked state is saved under `assets/icons/`, de-duplicated by the hash of its normalised markup. Each is named from its accessible name, or the nearest labelled ancestor, or `icon-<hash8>` when neither exists; `icons/index.md` lists each icon with its name, the states it was seen in, and its hash. Icons served as image files are saved the same way.
- [ ] **Fonts:** the font files the page actually requests are saved under `assets/fonts/`, with their `@font-face` rules collected into `font-faces.css` pointing at the local files. `tokens.md` states which families the walked elements actually resolve to, and whether any of them is a system font that is not a file we can harvest (for example the system-ui stack), in which case it says so.
- [ ] **Brand:** the logo and other brand images the walked states show are saved under `assets/brand/`.
- [ ] **Tokens summary:** for a named list of elements (finalised from STORY_002's captures: the shell, the composer and its editor, every option control, the submit control, the job progress surface, the result and its actions, the history surface and its tiles/empty state, plus the narrow composer), computed font family/size/weight/line-height, colours (text, background, border), padding, gap, radius, shadow and transition durations are recorded **after animations settle** (a stable-bounding-box check). Distinct values are de-duplicated into a palette, type scale, spacing scale, radii, shadows and motion, each recording where it was seen. The `:root` custom properties from the harvested stylesheets are included.
- [ ] **Breakpoints** are found two ways: the min/max-width media queries in the harvested stylesheets, and by resizing from 1440 down to 360 with a reload at each width and recording where named layout signals change.
- [ ] **What never lands in `docs/recon/`:** JavaScript files, anything fetched from an analytics or anti-bot host, any URL with a query string, cookies, tokens, or images generated on the reference. Account identifiers are masked in anything recorded. Raw page dumps go to `recon/out/<date>/` only.
- [ ] Re-running the harvest on the same day overwrites that day's files and produces an identical `index.json` when the reference has not changed.
- [ ] Unit tests cover the pure parts and pass with `pnpm test`.

## Technical Notes

- Stylesheets and fonts are fetched with the page's own request context, so versioned CDN URLs resolve the same way the app loads them. Response bodies are taken from the network events of the walk where possible, rather than issuing second requests.
- The harvester is an allow-list, not a deny-list: only `text/css`, font types (`font/woff2`, `font/woff`, `font/ttf`, `font/otf`, `application/font-*`) and image types are ever written under `docs/recon/`. A JavaScript response is never written anywhere in the repo, even by accident of content type.
- SVG normalisation for hashing: strip whitespace between tags, sort attributes, drop `class` and `data-*` attributes, keep `viewBox`, `d`, `fill`, `stroke` and the rest. The committed file is the original markup of the first occurrence, not the normalised one.
- A layout signal that tests element visibility must require the element to lie **inside the viewport** — a collapsed drawer still reports its items as visible off-canvas (lesson from the sibling project's first tokens run).
- Size check: report the total bytes harvested. If `assets/` exceeds 20 MB for one day (most likely from CJK font files), stop and ask the owner before committing rather than committing it silently.

## Testing Plan

- **Unit** — `recon/src/harvest-model.test.ts`: the content-type allow-list keeps CSS, font and image types and refuses JavaScript, JSON and HTML, including JavaScript served with a misleading extension; CDN URLs map to stable local file names that keep the version segment and drop the query; two different versions of one stylesheet map to two different files; `index.json` entries record source URL, path, byte count and sha256, in a stable order. `recon/src/icons.test.ts`: two SVGs differing only in whitespace, attribute order, `class` or `data-*` hash the same; a different `d` hashes differently; naming prefers the accessible name, then the nearest label, then `icon-<hash8>`; names are slugged to `[a-z0-9-]` and collisions get a numeric suffix. `recon/src/tokens-model.test.ts`: CSS variable parsing reads `:root` and `html` blocks and ignores other selectors; `@font-face` parsing extracts family, weight, style and source URLs and rewrites them to local paths; media breakpoint parsing de-duplicates and converts rem; the palette collapses identical colours, keeps alpha variants distinct and drops transparent; the type scale orders by size and records where each was seen; the spacing scale is ascending and drops zero; breakpoint-change detection names the widths where a signal first differs and is empty when nothing changes; box equality tolerates sub-pixel jitter; the markdown renderer emits every section, notes, and missing elements.
- **Integration / E2E** — N/A (third-party site behind a login; the only thing to integrate with is their CDN through the owner's session). Manual: the assistant opens STORY_002's page snapshot for the image-mode composer with the harvested `assets/css/` linked in place of the CDN URLs and confirms it renders like the matching screenshot; spot-checks the palette against the screenshots; the owner confirms the harvested set before it is committed.

## Estimated Complexity

M
