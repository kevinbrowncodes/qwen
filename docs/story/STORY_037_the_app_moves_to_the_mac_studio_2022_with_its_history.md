# STORY_037 — The app moves to the Mac Studio 2022 with its history, and draws on the Mac Studio 2026

**Epic:** [EPIC_007](../epic/EPIC_007_the_app_runs_on_the_mac_studio_2022_and_draws_on_the_mac_studio_2026.md)
**Status:** Self-approved on 2026-10-20 under the owner's overnight authorisation (EPIC_007 › decision 6). The owner reviews it in the morning.
**Created:** 2026-10-20. Numbered 037, the last of EPIC_007.

As the owner, I want the app running on my Mac Studio 2022 at `http://qwen.local`, drawing on the Mac Studio 2026, with every chat and image I made on the Spark still there. Then I am back to generating, on the new machines, as if nothing moved.

## Current state

Read on 2026-10-20:

- **Nothing serves the app.** The Spark's `qwen-app`, `qwen-proxy` and `qwen-lan-name` were removed that evening, without `-v` (EPIC_007 › decision 6). The model is served from the Mac Studio 2026 (STORY_036), at `http://mac-studio-2026.local:4120`, behind `MODEL_API_KEY`.
- **The data waiting on the Spark:**
  - its `qwen_app-data` volume holds `history.json`, 325 entries in 278 chats, with a copy on the Mac Studio 2025 in the gitignored `outputs/spark-retire/2026-10-20/`;
  - `spark/data/outputs` holds the model server's `jobs.json`, 395 jobs, plus 320 PNGs, 521 MB in all.

  `jobs.json` names each result by file name only (`result.file`, `jobs.ts`), so the index is portable. The 2026's own `jobs.json` holds the two jobs of STORY_036's checks.
- **The app** (`compose.yaml`, service `app`) is built from `app/Dockerfile` and runs as `node`, with history in its `/data` volume (`app-data`). It reads `MODEL_BASE_URL`, `MODEL_API_KEY` and `HISTORY_FILE`, and streams every result from the model server (`/api/jobs/:id/result` → `/jobs/:id/result`). It joins the external network `qwen`, which `spark/up.sh` used to create, and it is `restart: unless-stopped`.
  - `compose.yaml` also defines `app-dev`, `proxy` and `lan-name`. The epic drops all three (EPIC_007 › What crosses over).
- **The Mac Studio 2022:**
  - Docker Desktop 29.8.0 with PATHS' external network `paths`;
  - a container there resolves `mac-studio-2026.local` to 192.168.1.47 and reaches the model server (401 without the key, checked 2026-10-20);
  - PATHS' proxy routes `<slug>.local` to a container labelled `caddy: http://<slug>.local` and `caddy.reverse_proxy: "{{upstreams <port>}}"` on `paths`, and its Bonjour agent announces the name (as in Hands' `deploy/compose.yaml`). PATHS apps use `restart: always`, because `unless-stopped` stays down after a daemon restart (PATHS BUG_005).
  - **PATHS' proxy is down tonight** (PATHS BUG_051: Tailscale holds port 443). The owner runs `make proxy` on the 2022 in the morning, after which it publishes port 80 only.
- **The 2025 has no Docker**, so the app is built and started on the 2022 over ssh.

## UI Mockup

UI Mockup: N/A (no UI change). The same app, at the same name, on another machine.

## Acceptance Criteria

**One command deploys the app**

- [ ] `tools/deploy/app.sh` on the 2025 deploys the app to `APP_HOST`, an ssh destination from the environment or `.env`.
  - It takes **a commit on `origin/develop`, with a clean tree**; otherwise it refuses with the rule and the fix, as `model.sh` does.
  - It unpacks `git archive <sha>` into `~/qwen-app/src` on the 2022 and runs `docker compose -p qwen up -d --build app` there. The image is tagged with the commit (`APP_TAG=<sha12>`), so the gate's own builds on that machine never become what serves.
  - It waits until the app's `/api/health` answers.
- [ ] **The app's environment** lives in `~/qwen-app/.env` on the 2022 (mode 600):
  - `MODEL_BASE_URL` is `http://<the model Mac's hostname>:4120`, taken from `MODEL_HOST`'s ssh config;
  - `MODEL_API_KEY` is piped from the 2026's `~/qwen-model/.env` on every deploy, so a new key carries over. It is never printed and never written on the 2025.
- [ ] **The app joins PATHS.** In `compose.yaml` the `app` service joins the external `paths` network with `caddy: http://qwen.local` and `caddy.reverse_proxy: "{{upstreams 3100}}"`. It still publishes port 3100, and it is `restart: always`. The `qwen` network is gone from `compose.yaml`.
- [ ] **Dropped** (EPIC_007 › What crosses over): the `proxy` and `lan-name` services and `tools/lan-name/` (PATHS' proxy and Bonjour agent replace them), and `app-dev` (the dev server runs natively on the 2025). The workspace, the root `test` script and the lockfile no longer name `lan-name`.

**The history comes across whole**

- [ ] `tools/deploy/migrate-from-spark.sh`, run once from the 2025, does four things.
  - **History.** It copies the Spark's `history.json` (read from its `qwen_app-data` volume) into the 2022 app's `/data/history.json`. It refuses if the 2022's history already holds entries, so nothing new is overwritten.
  - **Images.** It copies the Spark's `spark/data/outputs` PNGs into the 2026's `~/qwen-model/data/outputs`, and merges the Spark's `jobs.json` into the 2026's: entries are joined by id, and the 2026's own entries win on a clash.
  - **Restarts.** It restarts the model server, after its busy check, and the app, so both read their files again.
  - **Report.** It reports the counts.
- [ ] After the move, **every finished image in the history loads through the app** on the 2022 (`/api/jobs/:id/result` → 200 with an image), and the history lists 325 entries.
- [ ] The Spark is left as it is: its volume, `spark/data/outputs` and weights stay on its disk until the owner says otherwise. Its four qwen containers are already gone (EPIC_007 › decision 6).

**It works end to end**

- [ ] Through the app on the 2022, `/api/capabilities` lists the six LoRAs, which proves the app reaches the 2026 with the key. A text-to-image job created through the app reaches `done`, and its image loads.
- [ ] **`http://qwen.local` serves the app through PATHS' proxy.** This depends on PATHS BUG_051's fix, which the owner deploys in the morning. Until then, the app answers at `http://mac-studio-2022.local:3100`.

**The docs say where things run**

- [ ] README (Architecture, Running the UI, Deployment) and CLAUDE.md §1 and §4a describe the app on the 2022, the model on the 2026 and the two deploy scripts. They say the Spark serves nothing of qwen's. CHORE_004's `qwen.local` now comes from PATHS.

## Departures from the reference

None for the reference UI.

## Technical Notes

- **The key's path:** `ssh <model host> 'sed -n s/^MODEL_API_KEY=//p ~/qwen-model/.env' | ssh <app host> 'umask 077; … > ~/qwen-app/.env'`. It passes through the 2025's pipe and is written nowhere there.
- **Compose project `qwen`** is shared with the gate's runs on the 2022, which only ever `run --rm gate` and build images. The deploy's `APP_TAG=<sha12>` keeps the served image distinct from the gate's `qwen/app:dev`. The volume is `qwen_app-data`.
- **Merging the index** is `spark/model-server/src/merge-index.ts`, a pure function with a vitest test, plus a small CLI run with Node on the 2026. It reads both lists, keeps the 2026's entries on an id clash, and adds the Spark's. Jobs that were running or queued on the Spark are already failed with `RESTARTED` by the server's own load (`Jobs.fromIndex`).
- **The busy check** before restarting the model server is the same `/health` read `model.sh` does.

## Testing Plan

- **Unit, TypeScript** (`spark/model-server/src/merge-index.test.ts`, new):
  - two lists with disjoint ids give their union, the 2026's first;
  - on an id clash, the 2026's entry wins;
  - a malformed entry in either list is skipped, as `Jobs.fromIndex` skips it;
  - the output parses as `Jobs.fromIndex` input.
- **Unit, shell** (`tools/deploy/app.test.sh`, new; run in step 3 by the gate package's `test` script). Dry runs against a throwaway repo with a bare `origin`:
  - no `APP_HOST` is refused;
  - uncommitted changes are refused;
  - a commit not on `origin/develop` is refused;
  - the dry run prints `APP_TAG=<sha12>`, the project `qwen` and the env file `~/qwen-app/.env`, and never a key.
- **Unit, the hostname check** (STORY_034) still passes: the model Mac's name appears only in `~/qwen-app/.env` on the 2022, never in the code.
- **Integration: not applicable as new tests.** No route changes. The app's integration lane runs against the stub as before.
- **E2E: not applicable as new specs.** The app's code does not change. The whole existing suite runs in the gate on the 2022 and covers the app's behaviour. Deployment is proved by the manual steps.
- **Manual, across the three Macs:**
  1. `tools/deploy/app.sh` builds and starts the app on the 2022. `/api/health` answers there and at `http://mac-studio-2022.local:3100`.
  2. `/api/capabilities` through the app lists the six LoRAs.
  3. `migrate-from-spark.sh` moves the history and the images. The history count is 325, the 2026's index has 395 entries plus its own, and every finished result loads through the app. Record the counts and the time.
  4. A 3:4 job through the app reaches `done`, and its image loads. Record the seconds.
  5. After PATHS BUG_051's fix (the owner's `make proxy`), `http://qwen.local` answers with the app. Recorded in the morning.

## Estimated Complexity

Medium:
- a deploy script and its tests;
- a one-time migration with a merge function and its test;
- `compose.yaml` changes;
- removing `tools/lan-name`;
- the docs.

The risk is the one-time move of the owner's data, which is why it refuses to overwrite, and checks every image afterwards.
