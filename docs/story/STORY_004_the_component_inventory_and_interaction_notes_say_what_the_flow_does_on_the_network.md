# STORY_004 — The component inventory and interaction notes say what the flow does on the network

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** Not started (after STORY_003)
**Created:** 2026-09-26

As the assistant designing the stub generation server and the clone, I want a written inventory of every component in the image generation flow and notes on what each interaction sends and receives, so that EPIC_002's stub speaks a realistic protocol and EPIC_003's stories are cut along real seams.

## UI Mockup

N/A (no UI change; the deliverables are `docs/recon/<date>/inventory.md`, `interactions.md`, and the generated `endpoints.md` / `endpoints.json`).

## Acceptance Criteria

- [ ] `inventory.md` lists every visible component of the flow with its states, its capture references, and its children — a tree, not a flat list. Each component also points at the page snapshot it appears in (STORY_002, with the selector that isolates it) and at the icon files it uses (STORY_003's `assets/icons/`), so EPIC_003's stories are cut along the reference's real markup.
- [ ] `interactions.md` records, for submit / progress / cancel / download / history load: method, path (no query string, no ids — replaced by placeholders), request and response shape, how progress is delivered (polling and its cadence, or a stream) and how completion is signalled. Ids, tokens and the owner's content are replaced by placeholders before the file is written.
- [ ] Third-party analytics, anti-bot and pixel traffic is excluded.
- [ ] The notes state explicitly which of the reference's options map onto Qwen-Image-2.1 served locally and which do not (input for EPIC_003's Departures sections), including what the reference calls its image model on the wire.
- [ ] `pnpm recon:interactions <date>` regenerates the endpoint tables and redacted response shapes from the day's raw logs, offline.
- [ ] Unit tests cover the pure reducers (API-event filtering, shape extraction, cadence, endpoint grouping) and pass with `pnpm test`.

## Technical Notes

- `endpoints.md` is generated (one row per method + host + path with counts, statuses, content types, median cadence; the first JSON body's shape with every value replaced by its type). `interactions.md` and `inventory.md` are written by hand from the captures, the page dumps and the generated tables.
- The sibling project found its reference delivered generation through an agent event stream rather than a clean job API, and JSON-only response logging missed the live stream format. If this reference streams (the chat surface suggests it will), the logger records enough of the stream envelope to reconstruct the protocol, or the gap is stated here explicitly.
- Placeholders: UUIDs → `:uuid`, long numeric ids → `:id` (also when used as a file name), long hex ids → `:hex`; query strings never survive.

## Testing Plan

- **Unit** — `recon/src/interactions-model.test.ts`: API-event filtering keeps product API traffic and drops chunks, images, pages and CDN media; shape extraction replaces every value by its type and keeps no string content; median cadence handles the median and the fewer-than-two case; endpoint grouping groups, counts, records statuses and cadence, takes the first body's shape, and renders a row. `recon/src/network-log.test.ts` extended: ids used as file names and signed storage URLs reduce to placeholders with no query.
- **Integration / E2E** — N/A (offline reduction of a local log; no product code). Manual: the owner reads `interactions.md` and confirms nothing identifies the account.

## Estimated Complexity

M
