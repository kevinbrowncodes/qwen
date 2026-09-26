# Job API contract: create, then status, then result

**Version 1 (2026-09-26, STORY_006).** This is the one protocol the UI speaks to an image generation server. Two servers implement it:
- the **stub** (`tools/stub-generation-server/`, STORY_006), with scripted outcomes for the test gate;
- the **model server** on the Spark (`spark/`, EPIC_004), in front of Qwen-Image-2.1.

The browser never calls either directly. It calls the app's own routes (STORY_007), and those read the base URL from `MODEL_BASE_URL`. A change to this document is a story on both sides. The shape follows the sibling minimax project's contract, with its video-only parts removed.

## Conventions

- **Base URL:** `MODEL_BASE_URL`, with no trailing slash. Every path below is relative to it.
- **Bodies:** JSON everywhere except uploads (multipart) and the result (binary).
- **Optional auth:** `Authorization: Bearer <MODEL_API_KEY>`. A server configured with a key answers `401 { error: { code: "unauthorized" } }` when the header is missing or wrong. A server without a key ignores the header.
- **Errors** always have the shape `{ error: { code, message, field? } }`, with the matching HTTP status. The codes are listed at the end.
- **Ids** are opaque strings. Timestamps are ISO-8601 UTC.
- **Status** is one of `queued | running | done | failed | cancelled`. `done`, `failed` and `cancelled` are **terminal**: a terminal job never changes again. `progress` is an integer from 0 to 100 and never decreases.

## `GET /health`

`200 { "ok": true, "server": "<name>", "version": "<semver>" }`.

## `GET /capabilities`

```json
{
  "models": [{ "id": "qwen-image-2.1", "label": "Qwen-Image 2.1" }],
  "ratios": [{ "id": "1:1", "width": 1328, "height": 1328 }, { "id": "16:9", "width": 1664, "height": 928 }, "…"],
  "defaultRatio": "16:9",
  "prompt": { "maxChars": 4000 },
  "referenceImages": { "max": 10, "maxBytes": 20971520, "types": ["image/png", "image/jpeg", "image/webp"] }
}
```

- `ratios` lists the seven ratios in the reference's order: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `16:9`, `9:16`.
- `width` and `height` are what the server produces for a text-to-image job at that ratio. The model server's are Qwen-Image-2.1's; the stub's are placeholders.
- An edit takes its size from the first reference image, so `ratio` does not apply to it.

## `POST /jobs`: create a job

The request is either `application/json`:

```json
{ "prompt": "A red bicycle against a brick wall", "ratio": "16:9", "model": "qwen-image-2.1", "seed": 42 }
```

or `multipart/form-data`, with the same fields as text parts plus **0–10** `referenceImage` file parts (an edit).

| Field | Rule |
| --- | --- |
| `prompt` | string, 1 to `prompt.maxChars` characters after trimming; required |
| `ratio` | one of `ratios[].id`; required without reference images; ignored, and echoed as `null`, with them |
| `model` | one of `models[].id`; optional, defaults to the first |
| `seed` | integer from 0 to 4294967295; optional. The server draws one when absent and echoes the one used |
| `referenceImage` | multipart file parts, 0 to `referenceImages.max`, each one of `referenceImages.types` and at most `referenceImages.maxBytes`; order is meaningful |

Response `202 { "id": "…", "status": "queued", "progress": 0 }`.

Errors:
- `400 validation` (with `field`);
- `400 unsupported_option` (a value the capabilities do not list, with `field`);
- `413 too_large`;
- `415 unsupported_media_type` (neither JSON nor multipart, or a reference of another type);
- `503 busy` (the server cannot take a job now; the UI shows the message).

## `GET /jobs/:id`: status

```json
{
  "id": "…",
  "status": "done",
  "progress": 100,
  "createdAt": "2026-09-26T22:00:00.000Z",
  "updatedAt": "2026-09-26T22:00:35.000Z",
  "request": { "prompt": "…", "ratio": "16:9", "model": "qwen-image-2.1", "seed": 42, "referenceImages": 0 },
  "error": { "code": "moderated", "message": "…" },
  "result": { "url": "/jobs/…/result", "mimeType": "image/png", "width": 1664, "height": 928, "sizeBytes": 1834221 }
}
```

- `error` is present only when `status` is `failed`. Its `code` is `moderated` when the server refused the prompt or an image on content grounds, and `generation_failed` otherwise.
- `result` is present only when `status` is `done`, and `url` is relative to the base URL.
- An unknown id answers `404 not_found`.

## `DELETE /jobs/:id`: cancel

`202 { "id": "…", "status": "cancelled", "progress": <last> }`. The server stops the work on its side, and the job is terminal from this response on.
- A job that is already terminal answers `409 already_terminal`.
- An unknown id answers `404`.

## `GET /jobs/:id/result`: the image

`200` with the image bytes, `Content-Type` (`image/png`) and `Content-Length`.
- A job that is not `done` answers `409 not_done`.
- An unknown id answers `404`.

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `validation` | 400 | A field is missing or malformed (`field` names it) |
| `unsupported_option` | 400 | A value the capabilities do not offer (`field` names it) |
| `unauthorized` | 401 | Missing or wrong bearer token |
| `not_found` | 404 | Unknown job or route |
| `already_terminal` | 409 | Cancel on a finished job |
| `not_done` | 409 | Result of a job that is not done |
| `too_large` | 413 | Body or a reference over the limit |
| `unsupported_media_type` | 415 | Body type, or a reference type, not accepted |
| `busy` | 503 | The server cannot take a job now |
| `bad_gateway` | 502 | App routes only (STORY_007): the upstream answered outside this contract |
