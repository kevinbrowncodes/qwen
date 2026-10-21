# STORY_036 — The model server runs on the Mac Studio 2026 as a service, deployed from the Mac Studio 2025

**Epic:** [EPIC_007](../epic/EPIC_007_the_app_runs_on_the_mac_studio_2022_and_draws_on_the_mac_studio_2026.md)
**Status:** Self-approved on 2026-10-20 under the owner's overnight authorisation (EPIC_007 › decision 6). The owner reviews it in the morning.
**Created:** 2026-10-20. Numbered 036, after STORY_035.

As the owner, I want the model server and its mflux worker running on my Mac Studio 2026 as a service:
- it starts with the Mac and restarts if it stops;
- it answers on the LAN only with its key;
- it is deployed from the repo on my Mac Studio 2025 with one command.

Then the app on the Mac Studio 2022 has a model to talk to, and the Spark's image work is gone for good.

## Current state

Read on 2026-10-20:

- **The model server** (`spark/model-server`) is TypeScript run directly by Node 26 (`node src/main.ts`), with no runtime dependencies.
  - It is configured only by its environment (`main.ts`): `PORT` (4120), `HOST` (default `0.0.0.0`), `OUTPUT_DIR`, `MODEL_API_KEY`, `WORKER`, `LORA_MANIFEST`, `LORA_DIR`.
  - When `MODEL_API_KEY` is set, every route, `/health` included, needs `Authorization: Bearer <key>` (`server.ts:323`).
  - On the Spark, Docker published it on `127.0.0.1:4120` only, so the host's `0.0.0.0` never reached the LAN. Natively it would.
- **The worker** for Apple silicon is `spark/model/worker_mlx.py`, from STORY_035, run as `uv run --project spark/model/mlx python spark/model/worker_mlx.py` with `WEIGHTS` set.
- **The Spark's scripts are Linux and Docker:**
  - `spark/up.sh` reads `/proc/meminfo` and refuses below 60 GiB;
  - `spark/fetch-loras.sh` and `spark/bench-loras.sh` run their Node CLIs (`fetch-loras-cli.ts`, `bench-cli.ts`, both tested in the gate) in a pinned Node container.
- **The Mac Studio 2026:**
  - Node v26.12.0 and uv 0.13.1 (Homebrew), no Docker;
  - three of the owner's launch agents already present (two Hermes, one Topaz);
  - 808 GiB free and 95% of memory free (`memory_pressure`, 2026-10-20);
  - the spike's weights at `~/qwen-spike/models/Qwen-Image-2.1` (`790c926`, 33.1 GB) and the six LoRAs at `~/qwen-spike/models/loras` (897 MB).

  macOS does not let a launch agent read `~/Documents` (PATHS BUG_038), so nothing the service reads may live there.

## UI Mockup

UI Mockup: N/A (no UI change). The service sits behind the job API, and the app does not change.

## Acceptance Criteria

**One command deploys it**

- [ ] `tools/deploy/model.sh` on the 2025 deploys the model side to `MODEL_HOST`, an ssh destination read from the environment or `.env`.
  - It copies exactly the files the service runs, from **a commit that is on `origin/develop`**, so a gated one, into `~/qwen-model/app/` on the 2026. The files are `spark/model-server/src`, the worker's Python files, `spark/model/mlx`, `spark/loras.json` and `spark/mac/`.
  - It installs the worker's locked environment (`uv sync --frozen`), installs or refreshes the launch agent, and waits until `/health` says `ready`.
  - It refuses a working tree with uncommitted changes, or a commit not on `origin/develop`. Each refusal states the rule and the fix.
- [ ] **It reads before it writes.** Before restarting a running server it reads `/health`. When a job is running or queued it refuses, saying which job, unless given `--now`.

**The service**

- [ ] A launch agent `com.qwen.model` for the owner's user runs the model server natively, with the mflux worker as `WORKER`:
  - `HOST=0.0.0.0` and `PORT=4120`;
  - `OUTPUT_DIR`, `LORA_MANIFEST`, `LORA_DIR` and `WEIGHTS` under `~/qwen-model/`;
  - `MODEL_API_KEY` from `~/qwen-model/.env`.

  It starts at login and restarts when it exits, at most every 30 s. It logs to `~/Library/Logs/qwen-model.log`. Nothing it reads is under `~/Documents`.
- [ ] **The memory check** (BUG_013, restated for macOS). Its start script refuses to start the server when less than 48 GiB is available, reading free, inactive, speculative and purgeable pages from `vm_stat`. It logs the figure and says not to stop the owner's other services to make room (CLAUDE.md §4a).

**The key**

- [ ] **The server refuses to listen beyond loopback without a key.** With a `HOST` other than `127.0.0.1`, `::1` or `localhost` and no `MODEL_API_KEY`, `node src/main.ts` exits with a message naming `MODEL_API_KEY` and the fix. A test proves it.
- [ ] The first deploy generates the key on the 2026, 32 random bytes as hex, into `~/qwen-model/.env` (mode 600), and it is never printed. Later deploys keep it. The deploy reads it over ssh for its own health check without echoing it.

**The weights and the LoRAs**

- [ ] `~/qwen-model/models/Qwen-Image-2.1` is the spike's copy at `790c926`, **linked, not moved or copied**, because weights are only moved with the owner's say-so (CLAUDE.md §4a). The deploy refuses to start when `model_index.json` is missing there.
- [ ] The LoRAs in `spark/loras.json` (six as of 2026-10-20; EPIC_005 decides which stay) are in `~/qwen-model/models/loras/<id>/`, copied from the spike's folder. They are checked against the manifest's sha256 by `fetch-loras-cli.ts verify`, run natively with Node 26 on the 2026.

**The bench from the 2025**

- [ ] `spark/bench-loras.sh` runs on a Mac without Docker against `MODEL_BASE_URL`, with `MODEL_API_KEY`, using the Mac's own Node 26 (owner, 2026-10-20: keep the bench, run from the 2025). Where Docker exists it runs exactly as before.

## Departures from the reference

None: there is no reference surface.

## Technical Notes

- **The files and the commit.** `git archive <sha> spark/model-server/src spark/model/jobloop.py spark/model/mlxjob.py spark/model/worker_mlx.py spark/model/mlx spark/loras.json spark/mac` is streamed over one ssh session and unpacked into a fresh `~/qwen-model/app.new`, which is then swapped for `app`, the same way STORY_034's `remote.sh` does it. `data/`, `models/` and `.env` sit beside `app/`, never inside it, so a deploy never touches them.
- **`spark/mac/`** holds `start.sh` (the memory check, then `exec node src/main.ts` with the environment) and the launch agent's plist template (`com.qwen.model.plist.in`, with `@HOME@` filled in at deploy time). The plist names the key's file, never the key. `start.sh` reads `.env` itself.
- **Restarting** is `launchctl bootout gui/$(id -u)/com.qwen.model` then `bootstrap`, after the busy check. A cold start loads the model in about 14 s (STORY_035), not the Spark's 3.3 minutes, so the deploy waits up to 3 minutes for `ready`.
- **The bind rule** is `bindProblem(host, apiKey)` in `spark/model-server/src/bind.ts`, which `main.ts` calls before it listens.
- **The busy check** reads `/health`'s `job` and `queued` (STORY_026).

## Testing Plan

- **Unit, TypeScript** (`spark/model-server/src/bind.test.ts`, new, vitest):
  - loopback hosts pass without a key;
  - `0.0.0.0` and a LAN host without a key give a message naming `MODEL_API_KEY`;
  - any host with a key passes.
- **Integration** (`spark/model-server/src/main.test.ts`, new, vitest). It spawns `node src/main.ts` with `HOST=0.0.0.0`, `PORT=0` and no key, and asserts exit code 1 and the message on stderr. With `HOST=127.0.0.1`, `PORT=0`, a temp `OUTPUT_DIR` and the fake worker, the server prints its listening line. This proves the rule where it is enforced.
- **Unit, shell** (`tools/deploy/model.test.sh`, new; run in step 3 by the gate package's `test` script). It uses a throwaway git repo with a fake `origin/develop` ref and `MODEL_DEPLOY_DRY_RUN=1`:
  - uncommitted changes are refused;
  - a commit not on `origin/develop` is refused;
  - the file list is exactly the service's files;
  - the rendered plist names `~/qwen-model/.env` and holds no key.
- **Unit, shell** (`spark/mac/start.test.sh`, new; run in the same lane). `start.sh` with a `VM_STAT` command that prints a fixed `vm_stat`:
  - 40 GiB available is refused, with the figure and "do not stop other services";
  - 60 GiB available reaches the point of starting Node, which the test replaces with `true`.
- **E2E: not applicable.** The app and the stub do not change.
- **Manual, from the 2025 to the 2026:**
  1. `tools/deploy/model.sh` deploys, and `/health` answers `ready` with the six LoRAs. Record the cold-start time.
  2. Without the key `/health` answers 401; with it, 200.
  3. A text-to-image job created through the job API with `curl` (3:4, 40 steps) reaches `done`, and its result downloads. Record the seconds against the Spark's 53.1 s.
  4. A job stopped with `DELETE` ends `cancelled`.
  5. `launchctl kickstart -k gui/<uid>/com.qwen.model` restarts it, and it is `ready` again. Record the time.
  6. `docker`-free `spark/bench-loras.sh --help` runs from the 2025. The bench is not run tonight: one to two hours, and its output is the owner's to score.

## Estimated Complexity

Medium:
- a deploy script and its tests;
- a start script and its tests;
- a plist template;
- a small bind check;
- a wrapper change.

The risk is launchd's environment on the 2026 (`PATH`, Metal from a launch agent). Manual step 1 shows it.
