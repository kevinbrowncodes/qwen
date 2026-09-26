# STORY_007 — The app's own routes speak to the generation server, tested against the stub

**Epic:** [EPIC_002](../epic/EPIC_002_the_app_has_a_skeleton_a_stub_generation_server_and_a_test_gate.md)
**Status:** Not started (after STORY_006)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the assistant building the UI, I want the browser to talk only to the app's own API routes, which forward to the generation server named by configuration, so that the Spark's address never reaches the browser, the code or a test, and the routes are proven against the stub before any screen uses them.

## Current state

After STORY_006 the stub exists and the contract is written. The app has only `/api/health`. There is no model client, no configuration reader and no integration lane.

## UI Mockup

N/A (no UI change; server routes and an integration test lane).

## Acceptance Criteria

- [ ] **Configuration:** `MODEL_BASE_URL` (required, no trailing slash) and `MODEL_API_KEY` (optional) are read in one module. A missing or malformed base URL gives a clear error at request time, answered as `503 busy` with the message "The generation server is not configured", and never a crash. The Spark's hostname appears nowhere in the code, tests or fixtures.
- [ ] **Routes** under `app/app/api/`, each forwarding to the contract and passing the bearer key when set:
  - `GET /api/capabilities`;
  - `POST /api/jobs`: JSON, or multipart with reference images passed through unchanged;
  - `GET /api/jobs/:id`: the status, with `result.url` rewritten to `/api/jobs/:id/result`;
  - `DELETE /api/jobs/:id`;
  - `GET /api/jobs/:id/result`: the image bytes streamed, with the upstream type and length, and `Content-Disposition: inline; filename="qwen-<id8>.png"`, or `attachment` when `?download=1`.
- [ ] **Upload validation runs in the app before forwarding:** at most 10 files, PNG, JPEG or WebP, 20 MB each. A refusal carries the contract's error shape and `field: referenceImage`, and nothing is forwarded.
- [ ] **Errors pass through:** an upstream contract error keeps its status and body. An unreachable upstream answers `503 busy` with "The generation server is not reachable". An upstream reply that breaks the contract answers `502` with code `bad_gateway`.
- [ ] **History persists in a real local store:**
  - `POST /api/jobs` records the job (id, prompt, ratio, model, reference count, created time) in a JSON file at `HISTORY_FILE`;
  - `GET /api/history` lists entries newest first, with each entry's last known status;
  - every `GET /api/jobs/:id` that reaches a terminal state updates its entry;
  - a cancelled job stays in history marked cancelled ([CLAUDE.md → §6 rule 4](../../CLAUDE.md#6-key-rules): this story decides "shown as cancelled");
  - `DELETE /api/history/:id` removes a finished entry.

  Writes are atomic: write a temp file, then rename.
- [ ] Root script `test:integration` runs the app's integration lane against the stub, started in-process on an ephemeral port.

## Technical Notes

- Everything outside `app/lib/model-client.ts` is written against the contract types, so EPIC_004's real server only has to speak the same contract.
- The history store is a small module with an injectable file path. Unit tests cover its reducer (upsert, status merge, ordering, and a terminal status that never changes back). Integration tests cover the file.
- Uploads are validated by size and by sniffing the file's magic bytes, not by the declared type alone.

## Testing Plan

- **Unit**
  - `app/lib/config.test.ts`: a present, missing and malformed base URL; a trailing slash is trimmed; the key is optional.
  - `app/lib/upload-validation.test.ts`: count 0, 10 and 11; PNG, JPEG and WebP accepted by magic bytes; a GIF and a PNG-named text file refused; 20 MB accepted and 20 MB + 1 refused.
  - `app/lib/history.test.ts`:
    - upsert keeps one entry per id;
    - newest first;
    - a terminal status is never overwritten by a later non-terminal one;
    - cancelled stays cancelled;
    - removing an entry that does not exist is a no-op.
  - `app/lib/content-disposition.test.ts`: inline vs attachment, and the filename built from the id.
- **Integration**: `app/test/integration/jobs.test.ts` calls the route handlers directly as Request to Response functions, with the stub in-process and a temp `HISTORY_FILE`. It checks:
  - capabilities pass through;
  - create, then poll, then done, then `result.url` is rewritten, then the result bytes' sha256 matches the fixture, then `?download=1` is an attachment;
  - `fails-after-2-polls` and `moderated` pass their error codes through;
  - `cancel-midway`: DELETE, then the history entry reads cancelled, then a second DELETE gives 409;
  - a multipart edit with two references, where the stub's `received` hook shows both sha256 values;
  - 11 references, or a GIF, are refused with nothing reaching the stub (its jobs list stays empty);
  - an upstream on a closed port gives 503 "not reachable";
  - bearer auth: the stub started with a key, and the route passes it;
  - history lists, updates and deletes, with the file's contents checked after each step.
- **E2E**: N/A. There is no screen yet, and STORY_008's smoke spec exercises the routes through the built app.

## Estimated Complexity

M
