# STORY_016 — The model server runs as a service on the Spark, and the app uses it

**Epic:** [EPIC_004](../epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md)
**Status:** Not started (after STORY_015)
**Created:** 2026-09-26 (self-approved under the owner's overnight authorisation, 2026-09-26)

As the owner, I want the model server to start with the Spark and the app to point at it, so that opening http://localhost:3100 and pressing Send makes a real image.

## Current state

After STORY_015 the server runs when started by hand. The app container `qwen-app` (port 3100) has no `MODEL_BASE_URL`, so every generation answers "The generation server is not configured".

## UI Mockup

N/A (no UI change; configuration and a service).

## Acceptance Criteria

- [ ] `spark/compose.yaml` (project `qwen-spark`) runs the model server:
  - with the GPU, and with `restart: unless-stopped`;
  - with the weights mounted read-only and `spark/data/outputs` mounted read-write;
  - on a docker network `qwen` that the app's compose joins;
  - with no host port except `127.0.0.1:4120`, for checks on the Spark.

  `spark/up.sh` creates the network if needed, reads before it writes (prints what is running and the memory available, and refuses below 60 GB), and starts the service.
- [ ] The app's `compose.yaml` joins the `qwen` network and sets `MODEL_BASE_URL=http://qwen-model:4120` by default. The model's address is still configuration, never a literal in the code.
- [ ] After deploying both, a generation from the UI at http://localhost:3100 completes with a real image. That is recorded, with the time it took, in the Done note.
- [ ] README → Running the Model says how to start, stop and check the model server, what it holds in memory, and where outputs go. README → Deployment gives the order: the model first, then the app.

## Testing Plan

- **Unit / Integration**: N/A for new code. This story is compose files and a shell wrapper (linted with shellcheck in its container). The server's logic is tested in STORY_015, and the app's in EPIC_002 and EPIC_003. The gate runs on the commit, with nothing in it depending on the Spark.
- **E2E**: N/A. The e2e lane is the stub's by design.
- **Manual verification** (recorded with model, checkpoint and date):
  1. `spark/up.sh`, then `curl 127.0.0.1:4120/health`.
  2. `docker compose up -d app`.
  3. In the browser, a text-to-image and an edit at http://localhost:3100 reach done and show real images.
  4. Download saves a PNG.
  5. Stop cancels a running generation.
  6. My Library lists the results.
  7. `docker ps` shows minimax's containers untouched.

## Estimated Complexity

S–M
