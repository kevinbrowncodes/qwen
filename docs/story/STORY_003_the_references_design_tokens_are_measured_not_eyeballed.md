# STORY_003 — The reference's design tokens are measured, not eyeballed

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** Not started (after STORY_002)
**Created:** 2026-09-26

As the assistant building the clone, I want the reference's colours, type scale, spacing, radii, shadows, breakpoints and motion timings extracted from computed styles, so that clone stories commit to numbers rather than impressions.

## UI Mockup

N/A (no UI change; the deliverables are `docs/recon/<date>/tokens.json` and the readable `tokens.md`).

## Acceptance Criteria

- [ ] `pnpm recon:tokens` reuses the session, opens the image-mode composer, and for a named list of elements (finalised from STORY_002's captures: the shell, the composer and its editor, every option control, the submit control, the job progress surface, the result and its actions, the history surface and its tiles/empty state, plus the narrow composer) records computed font family/size/weight/line-height, colours (text, background, border), padding, gap, radius, shadow, and transition durations.
- [ ] Distinct values are de-duplicated into a palette, a type scale, a spacing scale, radii, shadows and motion; each token records which elements it was seen on.
- [ ] Breakpoints are found two ways: the min/max-width media queries in the reference's stylesheets, and by resizing from 1440 down to 360 with a reload at each width and recording where named layout signals change.
- [ ] Fonts: the tokens file names the loaded families, states their licence where it matters, and says which family the measured elements actually use and whether a substitute is needed. (Logged out on 2026-09-26 the body resolves through a system-ui stack naming Inter and NotoSansHans, with only KaTeX web fonts loaded — to be re-verified signed in.)
- [ ] Values are taken **after animations settle** (a stable-bounding-box check), never mid-transition.
- [ ] The CSS custom properties declared on `:root` are extracted from the fetched stylesheets and included, and the raw stylesheets are saved under the gitignored `recon/out/`.
- [ ] Unit tests cover the pure reducers (variable parsing, breakpoint parsing, palette/type/spacing de-duplication, box stability) and pass with `pnpm test`.

## Technical Notes

- A layout signal that tests element visibility must require the element to lie **inside the viewport** — a collapsed drawer still reports its items as visible off-canvas (lesson from the sibling project's first tokens run).
- Any account identifier is masked in recorded element text.
- Stylesheets are fetched with the page's own request context, so versioned CDN URLs resolve the same way the app loads them.

## Testing Plan

- **Unit** — `recon/src/tokens-model.test.ts`: CSS variable parsing reads `:root` and `html` blocks and ignores other selectors; media breakpoint parsing de-duplicates and converts rem; the palette collapses identical colours, keeps alpha variants distinct and drops transparent; the type scale orders by size and records where each was seen; the spacing scale is ascending and drops zero; breakpoint-change detection names the widths where a signal first differs and is empty when nothing changes; box equality tolerates sub-pixel jitter; the markdown renderer emits every section, notes, and missing elements.
- **Integration / E2E** — N/A (third-party site behind a login). Manual: the assistant spot-checks the measured palette against STORY_002's screenshots.

## Estimated Complexity

M
