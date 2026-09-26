# STORY_004 — The component inventory and interaction notes say what the flow does on the network

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26. **Rewritten before implementation on 2026-09-26.** The original assumed STORY_002 would log every first-party request and response body during a scripted run. That run was withdrawn with STORY_001: the reference rejects the automated browser. What exists instead is the owner's own-browser capture, and in it the network side is a list of API paths read from resource timing, with no methods, bodies or cadence. **The generation, upload and status endpoints were not observed**, because they ran in page loads whose timing records had been cleared by the time the extension looked.

As the assistant designing the stub generation server and the clone, I want a written inventory of every component in the image generation flow, and notes on what each interaction does, so that EPIC_002's stub and EPIC_003's stories are cut along real seams. Where the reference's wire protocol is unknown, the notes say so rather than guessing.

## Current state

- `docs/recon/2026-09-26/states/` holds 15 readings. Each has a component tree with names, selectors, boxes, styles and the sprite ids of its icons (STORY_002).
- `docs/recon/2026-09-26/assets/icons/` holds every sprite icon, with `assets/index.json` mapping each file to its `symbol #id` (STORY_003).
- `recon/out/2026-09-26/extension/network-endpoints.json` holds 17 first-party API paths under `/api/v2/` on `chat.qwen.ai` and `auth.qwen.ai`, grouped by the extension. There are no methods ("all were XHR") and no bodies. It lists what was not observed, and it notes that analytics (`aplus.qwen.ai`), anti-bot (`ss.qwen.ai`) and CDN traffic were skipped.
- The capture notes (`capture-notes.md`) describe each interaction in prose:
  - submit changes the URL from `/` to `/c/new-chat` to `/c/<id>` within about 8 s;
  - while generating there is no progress figure, only a skeleton;
  - Stop is disabled for the whole run;
  - the image arrives after about 33–40 s;
  - download is on the image's hover overlay;
  - My Library is at `/library`;
  - an edit hides the aspect-ratio control.

## UI Mockup

N/A (no UI change; the deliverables are files under `docs/recon/2026-09-26/`):

```
docs/recon/2026-09-26/
  endpoints.json     the API paths, grouped, ids as :id, no query, with what was not observed
  endpoints.md       the same, readable
  inventory.md       per state, the component tree: name, selector, size, and links to its icon files
  interactions.md    hand-written: what each interaction does, what is known and unknown on the wire,
                     and how each option maps onto Qwen-Image-2.1 served locally
```

## Acceptance Criteria

- [x] `recon/run.sh interactions 2026-09-26` runs offline in the recon container and writes `endpoints.json`, `endpoints.md` and `inventory.md`. It reads `recon/out/<date>/extension/network-endpoints.json`, `docs/recon/<date>/states/` and `docs/recon/<date>/assets/index.json`. A second run is byte-identical.
- [x] **Endpoints:**
  - every path is kept with its group and host;
  - ids become `:id`, UUIDs become `:uuid`, long hex strings become `:hex`, and no query string survives;
  - analytics, anti-bot and CDN hosts are dropped even if present;
  - the source's "not observed" list and its reason are carried into both files verbatim, so a reader cannot mistake the list for the full protocol.
- [x] **Inventory:**
  - For every reading, `inventory.md` renders the component tree as a nested list: name, selector when present, and size when the box has one.
  - Each sprite id a component names is rendered as a link to its harvested file (`assets/icons/<set>/<file>`, resolved through `assets/index.json`, so case-suffixed files resolve correctly).
  - Any id with no harvested file is listed at the end as unresolved.
  - States are ordered desktop first, then narrow, following EPIC_001's flow order.
- [x] **Interactions** (`interactions.md`, written by hand from the notes, readings and endpoints) covers:
  - entering image mode;
  - the model and aspect-ratio options;
  - attaching a reference;
  - submit;
  - generating;
  - done;
  - download;
  - cancel (the reference has none);
  - My Library;
  - the narrow layout.

  For each it states what is observed and what is **not observed on the wire**. It ends with a table mapping each reference option onto Qwen-Image-2.1 on the Spark, marking each as same, departure (with the reason) or not applicable. Those are the entries for EPIC_003's Departures sections.
- [x] `interactions.md` passes the identity guard, which `recon/run.sh interactions` runs over it and over its own outputs. The guard reads the owner's name from the saved page, so it cannot run in a unit test. The unit test checks the committed file for generated-image links only.
- [x] Root `pnpm typecheck` and `pnpm test` pass through `recon/run.sh`.

## Technical Notes

- The reference's generation protocol being unknown is not a blocker. CLAUDE.md fixes our own protocol as an async job API (create, then poll status, then fetch the result), and EPIC_002's stub implements that. The reference only informs timing (a text-to-image job takes about 33–40 s; the UI shows no progress figure) and states (there is no cancel). EPIC_003 records any difference as a departure.
- The sibling project's placeholder rules carry over: UUIDs become `:uuid`, long numeric ids `:id`, long hex ids `:hex`.

## Testing Plan

- **Unit**
  - `recon/src/endpoints-model.test.ts`:
    - placeholders replace a UUID, a long number and a long hex string, and leave `/api/v2/chats/pinned` alone;
    - a query string is dropped;
    - hosts on the noise list (`aplus.qwen.ai`, `ss.qwen.ai`, `assets.alicdn.com`, `cdn.qwenlm.ai`) are dropped;
    - grouping keeps the source's groups in a stable order;
    - the markdown carries the not-observed list and its reason.
  - `recon/src/inventory-model.test.ts`:
    - a nested component renders as an indented list with its selector and size;
    - a partial box renders only what it has;
    - a sprite id inside prose resolves to its file through the index, including a `__2` case-suffixed file;
    - an unknown id lands in the unresolved list;
    - states are ordered desktop first, in flow order.
  - `recon/src/interactions-doc.test.ts`: the committed `interactions.md` has every section the AC names, and the options table, and it contains no generated-image link.
- **Integration**: N/A. This is an offline transform of local files, and there is no server or store.
- **E2E**: N/A. There is no product UI. Manual: the owner reads `interactions.md` and confirms nothing identifies the account. By the owner's choice on 2026-09-26, that review happens after the push.

## Estimated Complexity

S–M

## Done (2026-09-26)

- `recon/run.sh interactions 2026-09-26` wrote `endpoints.json` / `endpoints.md` (all 16 first-party paths in the source) and `inventory.md` (15 states; every sprite id resolved, none unresolved). The identity guard was clean over those files and the hand-written `interactions.md`. A second run was byte-identical.
- `interactions.md` covers every interaction in the AC, marks what was not observed on the wire, and ends with an 18-row mapping table for EPIC_003's Departures sections.
- **The owner's read of `interactions.md` happens after the push, by the owner's choice (2026-09-26).**
- Gate: `recon/run.sh typecheck` and `recon/run.sh test` (98 tests) were green, run by hand.
