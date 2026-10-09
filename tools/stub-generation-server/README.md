# Stub generation server

A local, deterministic fake of the job API in [docs/contracts/job-api.md](../../docs/contracts/job-api.md) (STORY_006). Every unit, integration and e2e test targets it; the real server is the model server on the Spark (EPIC_004). Zero runtime dependencies; runs on Node 26 with type stripping (`node src/main.ts`). It offers two fake add-ons, `fake-detail` and `fake-style` (contract v1.2, STORY_019), and `received` echoes the one a job named.

```bash
pnpm --filter stub-generation-server start      # STUB_PORT (4110), STUB_HOST (0.0.0.0), STUB_API_KEY
pnpm --filter stub-generation-server fixtures   # rebuild fixtures/*.png byte for byte
```

## Choosing an outcome

Per job, with `X-Stub-Script: <name>` or `?script=<name>` on `POST /jobs`. **Progress advances per status poll, never by wall clock.** The k-th `GET /jobs/:id` returns the k-th step, and the last step holds.

| Script | Steps after creation (`queued/0`) |
| --- | --- |
| `done-after-3-polls` (default) | running 33, then running 66, then done 100 |
| `done-after-1-poll` | done 100 |
| `slow-done-after-10-polls` | queued, then running 10 to 95, then done on the 10th poll |
| `fails-after-2-polls` | running 40, then failed (`generation_failed`) |
| `moderated` | failed on the first poll (`moderated`) |
| `cancel-midway` | running 10, 25, 50, and stays running until `DELETE` |
| `rejects-upload` | `POST /jobs` with a reference image answers `400` (`field: referenceImage`) |

The result is always `fixtures/result.png` (64×36, 156 bytes). `fixtures/reference.png` (32×32) is the upload fixture for tests. Both are drawn by `src/png.ts`, so neither comes from the reference or the model.

## Test hooks (not part of the contract)

- `POST /__stub/reset` forgets every job and clears busy.
- `POST /__stub/busy` with `{ "busy": true }` makes `POST /jobs` answer `503 busy`.
- `POST /__stub/busy` with `{ "afterAccepting": k }` accepts the next k creates, then answers `503 busy` to every one until reset (STORY_025: an image count the server stops part-way).
- `GET /__stub/jobs` returns `{ jobs: [{ id, script, status, progress }] }`, so a spec can assert nothing is left running.
- `GET /__stub/jobs/:id/received` returns what the job was sent: `request`, and `uploads[] { filename, contentType, size, sha256 }`.

Hooks never require the bearer token.
