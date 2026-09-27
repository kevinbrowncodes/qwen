# STORY_015 — A model server speaks the job API in front of Qwen-Image-2.1

**Epic:** [EPIC_004](../epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md)
**Status:** Done (2026-09-26)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want a server on the Spark that speaks exactly the job API the UI already speaks to the stub, with Qwen-Image-2.1 behind it, so that pointing the app at it is a configuration change and nothing else.

## Current state

After STORY_014 there is a working image and measured numbers. The contract is `docs/contracts/job-api.md` v1. The stub implements it in TypeScript with no dependencies, and the app's integration lane exercises it.

## UI Mockup

N/A (no UI change; a server).

## Acceptance Criteria

- [x] **Two processes in one container:**
  - `spark/model-server/` (TypeScript, Node 26, no runtime dependencies) owns the contract: HTTP, validation, the job table, the queue, cancel, results on disk and bearer auth;
  - `spark/model/worker.py` owns the pipeline. It loads it once, then reads jobs as JSON lines on stdin and writes progress, done and failed as JSON lines on stdout.

  The server starts the worker and restarts it if it dies, failing any job the worker was running at that moment with `generation_failed`.
- [x] **The contract, exactly:**
  - `GET /health`, and `GET /capabilities`, whose sizes per ratio were chosen in STORY_014;
  - `POST /jobs`: JSON, or multipart with 0–10 references;
  - `GET /jobs/:id`, `DELETE /jobs/:id` and `GET /jobs/:id/result`;
  - the error shape and codes, and optional bearer auth (`MODEL_API_KEY`).

  The validation rules match the stub's (shared test vectors).
- [x] **One job at a time; the rest wait** in a FIFO as `queued`, and `POST /jobs` answers `503 busy` beyond 8 waiting. Progress is the worker's steps done over steps total, and it never decreases.
- [x] **Cancel works on both sides.** A queued job is removed at once. A running job is signalled to the worker, which stops at its next step. Either way, the job is `cancelled` from the `202` on.
- [x] **Results persist:**
  - PNGs are written under `OUTPUT_DIR` (gitignored `spark/data/outputs/` on the Spark);
  - a small JSON job index sits beside them, so finished results survive a restart;
  - jobs that were queued or running at a restart are marked `failed` with "The model server restarted".
- [x] **Moderation:** the model has no safety checker, so `moderated` is never produced. The contract allows that, and the README states it.

## Technical Notes

- The worker protocol has one message per line:
  - in: `{type:"job", id, prompt, width?, height?, seed, steps, references:[paths]}` and `{type:"cancel", id}`;
  - out: `{type:"ready"}`, `{type:"progress", id, step, steps}`, `{type:"done", id, path, width, height}` and `{type:"failed", id, message}`.
- Uploads are written to a per-job temp directory for the worker, then deleted after the job ends.
- An edit's size comes from the model (`output_resolution` against the last reference), so the server passes no width and height for an edit and reports what the worker wrote.

## Testing Plan

- **Unit** (in the gate; nothing here needs the Spark): `spark/model-server/src/*.test.ts`.
  - The queue: FIFO order, the busy limit, cancelling a queued job, and progress that never decreases.
  - The job table: the state machine, where a terminal state is final.
  - Restart recovery from the job index, where queued or running become failed and done keeps its result.
  - The worker line protocol: parsing, framing and malformed lines.
  - The contract's validation, run against the same vectors as the stub's.
- **Integration** (in the gate): `spark/model-server/src/server.test.ts` starts the real HTTP server with a **fake worker**, a small Node script that speaks the line protocol with scripted steps and writes the stub's fixture PNG. It checks:
  - create, then poll to done, then fetch the result;
  - an edit with two references reaching the worker as files;
  - cancel while running, where the worker is told and the job ends cancelled;
  - cancel while queued;
  - a worker crash, which fails the running job, restarts the worker, and lets the next job succeed;
  - a restart with the index on disk;
  - bearer auth;
  - busy.
- **E2E**: N/A. The UI's e2e runs against the stub by design ([CLAUDE.md → §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)). The app's integration lane already proves the app speaks the contract, and this story proves the server does.
- **Manual verification**, recorded with the model, the checkpoint and the date: on the Spark, `curl` a text-to-image job to done and open the PNG; cancel one mid-run, and see `cancelled` with the worker free for the next.

## Estimated Complexity

L

## Done (2026-09-26)

- **In the gate:** 41 model-server tests, covering the protocol, the job table, validation (the shared vectors, which the stub now runs too), and the server end to end with a fake worker. The fake worker covers queueing, cancel while running and while queued, a worker crash with restart, recovery from a restart, busy, and auth.
- **Manual verification against the real model**, `Qwen/Qwen-Image-2.1` at `790c926`, 2026-09-26:
  - text to image, 1376×768, done in 53 s, and the PNG fetched;
  - a cancel at 25%, answered 202, with the worker free for the next job;
  - an edit of that image ("make the lighthouse red and white striped") in 61 s, which changed only what was asked and kept the 16:9 shape.
- **Found on the Spark and fixed:**
  - The Node binary needs `libatomic1`, which the CUDA base lacks. The first container restart-looped on it; it is now in the image.
  - A clean shutdown now leaves a running job to be reported as interrupted by the restart ("The model server restarted…"), rather than as "worker stopped".
- **`moderated` never occurs,** because the model has no safety checker. The README says so.
