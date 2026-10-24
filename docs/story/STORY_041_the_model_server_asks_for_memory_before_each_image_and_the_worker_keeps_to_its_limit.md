# STORY_041 — The model server asks for memory before each image, and the worker keeps to its limit

**Epic:** [EPIC_007](../epic/EPIC_007_the_app_runs_on_the_mac_studio_2022_and_draws_on_the_mac_studio_2026_deployed_from_the_mac_studio_2025.md) (a follow-up); PATHS EPIC_023 (Memory agent), row 7
**Status:** Approved by the owner 2026-10-23 (through the picker, in PATHS' session); built the same day by Opus. Not Done until the declared working set is the owner's measurement (PATHS CHORE_036) and the server is deployed to the Ultra with it.
**Created:** 2026-10-23
**Relates to:** [BUG_013](../bug/BUG_013_the_spark_runs_short_of_gpu_memory_and_up_sh_can_restart_the_model_without_checking.md) (the same problem on the Spark, "a memory budget for each"), Topaz STORY_008 (the other asker on the Ultra)

As the owner, I want the model server on the Ultra to ask the Ultra's memory agent for room
before it starts an image, and the worker to stay inside the memory it declared, so that an image
can wait a minute for a clip but can never take the Ultra down with it.

## Current state

Read on the Ultra, 2026-10-23. The worker (`spark/model/worker_mlx.py`) loads Qwen-Image-2.1 once,
about 33 GB, and calls `mx.clear_cache()` after each job; it sets no MLX memory limit, and MLX's
default on the Ultra is 91.2 GiB, sized from `iogpu.wired_limit_mb=94208`. At the 2026-10-23
panic the worker's footprint was 81 GB mid-generation (89 GB at the 2026-10-21 one), beside
qwen38's 31 GB and Topaz's 16 GB on a 96 GB Mac. `spark/mac/start.sh` refuses to start below 48
GiB available and checks nothing after that. The server (`spark/model-server/src/server.ts`)
runs one job at a time from its own queue and reports `/health`.

## UI Mockup

UI Mockup: N/A in the app's pages, which already show a queued job as queued. The job's new
`note` ("Waiting for memory on the Ultra (2nd in line)") is in `GET /jobs/{id}` and `/health`
for Machines and the next story that wants to show it.

## Acceptance Criteria

- [x] `spark/model-server/src/memory.ts` (new): `ask`, `renew` and `release` against the agent's
      API (`POST /api/leases`, `POST /api/leases/{id}/renew`, `DELETE /api/leases/{id}`) at
      `MEMORY_AGENT` (default `http://127.0.0.1:8700`) with `MEMORY_TOKEN`, both from `.env`.
      Unset, every ask is granted and one line is logged at start; set and not answering, the
      ask is waiting with the note "The memory agent on the Ultra does not answer", never
      granted by default.
- [x] In `server.ts`'s pump, before `worker.send`: ask `{holder: "qwen-model", service:
      "qwen-model", kind: "image", job: <id>, gb: <the working set>}`. Waiting: the job's
      `note` is set (a new optional field on `JobRecord`, in `GET /jobs/{id}` and in
      `/health.memory` with the agent's answer), and the pump tries again on a 10 s timer.
      Granted: the job is sent and the lease renewed every 60 s while a job runs; released when
      the job ends however it ends (done, failed, cancelled, the worker exiting).
- [ ] The declared working set is the owner's measurement from PATHS CHORE_036 with the limit
      below in place, written here as a number with its date; until then the story is not Done.
      The 33 GB of the loaded model is the registered service's standing reservation, not the
      lease.
- [x] `worker_mlx.py`'s `main()` calls `mx.set_memory_limit(MEMORY_LIMIT_GB << 30)` from the
      environment (the standing 33 plus the working set), before the model loads, checked against
      mlx 0.32.4 on the Ultra (`set_memory_limit` is there); ~~an allocation beyond it raises the
      out-of-memory error~~ MLX calls the limit a guideline: past it MLX frees its cache and waits
      for work in flight, and an allocation raises (the error `mlxjob.failure_message` words) only
      once RAM and swap are also exhausted (its docstring, read on the Ultra 2026-10-23). It slows
      the worker's growth; the lease is the guard. `start.sh`'s 48 GiB refusal stays.
- [x] ~~`com.qwen.model.plist.in` and `tools/deploy/model.sh` pass `MEMORY_LIMIT_GB`~~ (they need
      not: `spark/mac/start.sh` sources `~/qwen-model/.env` with `set -a`, so `MEMORY_TOKEN`,
      `MEMORY_LEASE_GB` and `MEMORY_LIMIT_GB` set there reach the server and the worker it
      starts), and `README.md`'s "Running the Model" table records the limit, the lease and the
      agent.

## Technical Notes

- The agent's contract is PATHS STORY_101; the Node client mirrors the template's
  `app/memory.py` (PATHS STORY_102) in shape: one asker per unit of work, the lease id kept with
  the job, a heartbeat while it runs, a release on every end.
- The server stays FIFO; the agent is FIFO too. Priorities are PATHS BACKLOG_010.

## Testing Plan

Unit (Vitest): `memory.test.ts` (new) — unset env grants and logs once; a waiting answer, a
granted one, a renew, a release, a 404 that asks afresh, an unreachable agent that waits; the
pump in `jobs.test.ts` or `server.test.ts` (extended) — a job told to wait keeps its place and
carries `note`, is sent once granted, renews on the timer, and releases on done, failed,
cancelled and worker exit. Integration: `server.test.ts` (extended) against a fake agent on a
local port — `GET /jobs/{id}` carries `note` while waiting, `/health.memory` shows the agent's
answer, and the existing submit, status, cancel and result tests stay green. The worker:
`spark/model/test_mlxjob.py` (extended) — the limit is read from the environment and the
out-of-memory message is unchanged; a gate test that `worker_mlx.py` names `set_memory_limit`.
E2E: none; the app's flow is unchanged and the stub generation server does not lease. Manual
verification, not a layer: one image on the Ultra with the limit in place, the peak read from
the agent's `/health`, recorded in Notes with the date.

## Estimated Complexity

Medium: one new module and a pump change in the server, one call in the worker, the plist and
the deploy script; the number itself comes from CHORE_036.

## Notes

- Built 2026-10-23 by Opus. The server keeps one lease, for the job at the head of the line:
  asked before the worker is sent the job, asked again every 10 s (`memoryRetryMs`) while told
  to wait, renewed every 60 s while the image runs, released on done, failed, cancelled and a
  worker exit, and given back when a waiting job is cancelled. `GET /jobs/{id}` carries `note`
  only while that job is the one waiting; `/health.memory` says whether leases are on, the
  lease's size and the lease held or waited on. The lease size defaults to 48 GB, `start.sh`'s
  `NEED_GIB`, until CHORE_036 measures it; with `MEMORY_TOKEN` unset (today) nothing changes.
- Not deployed to the Ultra yet: with `MEMORY_TOKEN` unset in `~/qwen-model/.env` the deployed
  server would behave exactly as now, and a deploy reloads the 33 GB model. It goes out with
  `tools/deploy/model.sh` once the owner has set the token and the two numbers (PATHS CHORE_036).
