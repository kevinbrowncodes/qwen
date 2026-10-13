# STORY_026 — A stopped image can no longer freeze the queue, and the model server recovers on its own

**Epic:** [EPIC_004](../epic/EPIC_004_an_image_model_runs_on_the_dgx_spark_behind_the_same_job_api.md) (a follow-up to [BUG_011](../bug/BUG_011_a_stopped_image_froze_the_model_servers_queue_for_two_days.md))
**Status:** Done (2026-10-13). Approved by the owner on 2026-10-13 ("Please proceed with completing story 26")
**Created:** 2026-10-13. Numbered 026 because it ships first. The chat story, which waits for CHORE_007's recon, becomes STORY_027, although STORY_025's frozen text still calls it 026.

As the owner, I want the model server on the Spark to keep working through any order of Stop clicks, to notice and recover by itself when its worker stops answering, to say on `/health` what it is busy with, and to keep my waiting images when it restarts. Then a queue I leave running does not quietly stall for days, as it did from 2026-10-11 to 2026-10-13.

## Current state

Read on 2026-10-13:

- **The worker deadlocks on one Stop path.** In `spark/model/worker.py`, the main loop holds `_lock` while it checks whether the job it just took was stopped (lines 202–205), and calls `say()` inside that block. `say()` (lines 48–51) takes the same `_lock`, a plain `threading.Lock`, so the main thread blocks forever. A Stop during a run goes through `on_step` (lines 147–150), which releases the lock before calling `say()`. The same lock also guards `_cancelled` in `read_stdin` (line 65) and in `run`'s `finally` (line 184).
- **The worker cannot be tested in the gate today.** `worker.py` imports `torch` at the top (line 33) and redirects file descriptor 1 at import (lines 29–31). The gate has no torch, so nothing in the gate runs any of the worker's Python. The gate image (`qwen/gate:1.63.0-node26`, base `node:26-bookworm`) does include **Python 3.11.2** (checked on 2026-10-13), so standard-library `unittest` needs nothing installed.
- **The server waits on the worker with no time limit.** `current` in `spark/model-server/src/server.ts` (line 83) is cleared only by the worker's done, failed or cancelled answer (`handle`, line 185) or by the worker exiting (`onExit`, line 108). `pump()` (line 123) does nothing while it is set. A DELETE of a running job marks it cancelled and sends the worker `cancel` (line 301), and nothing checks that an answer came.
- **`Worker` can stop but not restart on demand.** `spark/model-server/src/worker.ts` restarts the child after it exits (lines 60–66), unless `stop()` was called. There is no way to kill a live, silent worker and have it come back.
- **`/health` says only that a worker has loaded:** `{ ok, server, version, ready }` (server.ts line 279). The contract (`docs/contracts/job-api.md`) defines `{ ok, server, version }`; `ready` is already an extra the model server adds.
- **A restart fails every unfinished job.** `Jobs.fromIndex` (`spark/model-server/src/jobs.ts`, line 180) fails both `queued` and `running` jobs with `RESTARTED`, because `toIndex` drops their upload paths (line 148). The upload folders themselves are in `outputs/uploads/<id>/` on the bind mount and outlive a restart. `d4d9c021`'s was still there two days on, because nothing ever deletes a folder its job no longer needs.
- **Restart cost, measured on 2026-10-13:** the worker reloaded the pipeline and the 7 add-ons in about 230 s. One image takes 51–60 s at 40 steps without guidance (EPIC_004), and about twice that with an add-on's guidance. So one step takes about 1.5 to 3 s.

## UI Mockup

UI Mockup: N/A (no UI change). Everything here is on the model server. The one user-visible effect is that a job failed by the watchdog shows on its card as any failed job already does, with the server's message (STORY_012's failed state, unchanged).

## Acceptance Criteria

**The deadlock**

- [x] **A job stopped before the worker starts it is answered.** When the worker takes a job that has already been stopped, it writes `{"type":"cancelled","id":…}` and takes the next job. No code path writes a protocol line while holding the lock that guards the stopped set. This is true by construction: the output lock and the stopped-set lock are separate.
- [x] **The worker's job loop runs without torch.** Reading stdin, the stopped set, `say()` and the loop that takes jobs move to `spark/model/jobloop.py`, which imports only the standard library. `worker.py` passes it the function that runs one job. The protocol on the wire is unchanged.

**The watchdog**

- [x] **An unanswered Stop restarts the worker.** If the worker has not answered for a stopped running job within **60 s** (`cancelGraceMs`), the server logs `[model] the worker did not answer the stop of <id> within 60 s; restarting it` and restarts the worker. The job stays `cancelled`. Once the worker reports ready, the next waiting job runs.
- [x] **A silent worker is restarted, and its job failed.** If a running job has had no message from the worker (progress, done or failed) for **5 minutes** (`silenceMs`), the server fails it with "The model worker stopped responding during this image and was restarted.", logs that, and restarts the worker. The next waiting job runs once it is ready.
- [x] **Restarting does not lose the waiting jobs.** While the worker reloads (about 4 minutes on the Spark), waiting jobs stay `queued`, and new ones are accepted up to the existing cap of 8.
- [x] **A worker that ignores the signal is still replaced.** A restart sends SIGTERM, then SIGKILL if the process has not exited 10 s later.

**What `/health` says**

- [x] `GET /health` keeps `ok`, `server`, `version` and `ready`, and adds:
  - `job`: `null`, or `{ id, status, startedAt, lastHeardAt, stopRequestedAt }` for the job the worker is busy with. `stopRequestedAt` is `null` unless a Stop was sent;
  - `queued`: the number of waiting jobs;
  - `lastRestart`: `null`, or `{ at, reason }` for the last time the server restarted the worker. The reason is one of `"exited"`, `"stop not answered"` or `"silent"`.

  This is the model server's own extra, like `ready`. The contract does not change, and the stub and the app do not read it.

**Restarts keep waiting jobs**

- [x] **A job that was waiting when the server stopped is waiting again when it comes back,** in its original order. A waiting edit gets its references back from `outputs/uploads/<id>/` (files sorted by name). If the number of files found differs from the job's `referenceImages`, the job fails with `RESTARTED`, as today.
- [x] **A job that was running when the server stopped still fails with `RESTARTED`.** It is not retried, because whatever stopped the server may have been that job.
- [x] **Leftover upload folders are removed at start.** Any `outputs/uploads/<id>/` whose job is finished, or not in the index, is deleted when the server starts.

## Departures from the reference

None. chat.qwen.ai's servers are not visible to recon, and nothing here changes what the UI shows.

## Technical Notes

- **`spark/model/jobloop.py` (new):** module-level state is replaced by a small `JobLoop` class holding the output stream, an output lock, a stopped-set lock and the job queue. Its methods are `say(message)`, `read(stream)` (the stdin thread), `stopped(id)` (check-and-forget, under the stopped-set lock only) and `serve(run_one)` (the main loop). `run_one(job, loop)` raises nothing, and checks `loop.stopped(job_id)` from the step callback. `worker.py` keeps the descriptor redirect, the torch imports and `run`/`use_lora`/`png_info`. It builds a `JobLoop` on the saved protocol stream and calls `serve(run)`. The model image's Dockerfile copies `jobloop.py` beside `worker.py` (line 56).
- **Where the Python tests run:** `spark/model/test_jobloop.py`, standard-library `unittest` only, run by the model-server package's `test` script after vitest (`… && python3 -m unittest discover -s ../model -p "test_*.py"`). They then run in the existing unit lane of the gate, with no new tool and no new image. Each test runs `serve` on a thread and joins it with a 5 s timeout, so a deadlock fails the test instead of hanging the gate.
- **`Worker.restart(reason)` (new, `worker.ts`):** it kills the child (SIGTERM, then SIGKILL after `killAfterMs`, default 10 000) and lets the existing exit handler start a new one. `onExit` receives the reason, so the server can record `lastRestart`. A plain exit records `"exited"`.
- **The watchdog is one timer in the server**, checked every `watchdogTickMs` (default 5 000) while `current` is set. The server records `lastHeardAt` on every message for `current`, and `stopRequestedAt` when a DELETE signals the worker. A silent job is failed **before** the worker is killed, so `onExit`'s `jobs.fail(current, WORKER_STOPPED)` finds it terminal and leaves the watchdog's message. `cancelGraceMs`, `silenceMs`, `watchdogTickMs` and `killAfterMs` are `ModelServerOptions`, so tests can use milliseconds. `main.ts` uses the defaults.
- **Why 60 s and 5 minutes:** a Stop is honoured at the next step (at most about 3 s), plus the VAE decode and save if it lands after the last step (a few seconds), so 60 s leaves a wide margin. The longest silent stretch in a healthy run is the text encoding and first step of an edit with references (seconds). Five minutes is well clear of both and still well short of two days. Each false trigger costs a 4-minute reload, so these lean long.
- **`Jobs.fromIndex(text, maxQueued, now, uploadsDir?)`** keeps `queued` jobs queued and rebuilds `references` from `uploadsDir/<id>/`. Restored jobs are not subject to the cap: they were saved under it.
- **A deliberately changed assertion.** `jobs.test.ts`'s "survives a restart: finished jobs keep their result, unfinished ones fail" expects a waiting job to come back failed. That rule existed only because the upload paths were lost (`jobs.ts`'s header and line 148 say so). This story restores them, so the waiting half of that case changes. Its running half, and `server.test.ts`'s "keeps finished jobs across a restart and fails the unfinished ones" (which restarts with a job running), stay as they are.
- **The fake worker gains two keywords** (`fake-worker.ts`): `deaf` ignores a stop for that job and finishes it slowly without answering the stop, and `hang` sends one progress line and then nothing. This is how the gate reaches the server's two watchdog paths without the real deadlock, which `test_jobloop.py` covers directly.
- **Deploying it** means rebuilding `qwen/model:dev` and restarting `qwen-model`. That also brings in STORY_024's PNG settings, which the running image lacks (BUG_011). The restart waits until `/health` shows `job: null`. A restart reloads the worker for about 4 minutes, and waiting jobs now survive it.
- **Not in this story:** a warning in the app when the model server is stuck or reloading (the owner chose to leave it out on 2026-10-13; a follow-up if wanted). Retrying a job that was running when the server stopped.

## Testing Plan

- **Unit, Python** (`spark/model/test_jobloop.py`, new; each case joins `serve` with a 5 s timeout):
  - **The 2026-10-11 race.** A fake `run_one` blocks job A on an event. Feed job A, job B, then a stop for B, then release A. Expect the output lines `done A`, then `cancelled B`. Then feed job C and expect `done C`, which proves the loop is still alive. On today's code this case times out.
  - **A stop during a run** is seen by `run_one` through `stopped(id)`, which answers `cancelled`; the next job runs.
  - **A stop for an id that is not queued or running** writes nothing, and the jobs after it run as normal.
  - **A line that is not JSON** is logged to stderr and ignored. **End of stdin** ends `serve`.
- **Unit, TypeScript:**
  - `spark/model-server/src/jobs.test.ts` (extended): the restart case now expects the waiting job to come back `queued` and `next()` to return it, with the running job still failed. A waiting edit whose upload folder holds its files is restored with those paths in order. One whose folder is missing or short fails with `RESTARTED`.
- **Integration** (`spark/model-server/src/server.test.ts`, extended, against the fake worker; it runs in the unit lane, as STORY_025 recorded):
  - **Unanswered stop:** with `cancelGraceMs: 200`, create a `deaf` job, wait for running, and DELETE it. Assert that the fake worker's log shows a second start (a second `init`, or a new `ready`), the job stays `cancelled`, `/health`'s `lastRestart.reason` is `"stop not answered"`, and a following ordinary job reaches `done`.
  - **Silent worker:** with `silenceMs: 200`, create a `hang` job. Assert it fails with the silence message, `lastRestart.reason` is `"silent"`, and the next job reaches `done`.
  - **Waiting jobs survive a worker restart:** queue two ordinary jobs behind a `hang` job. Assert both reach `done` after the restart.
  - **`/health`:** `job` is `null` when idle. While a `slow` job runs, `job.id` is that job and `lastHeardAt` advances. After a DELETE, `stopRequestedAt` is set. `queued` counts waiting jobs.
  - **Server restart keeps waiting jobs:** start a `slow` job and queue an edit with the fixture reference. Close and start the server. Assert the running one is failed with `RESTARTED`, the edit runs to `done`, the fake worker received its reference path, and its upload folder is gone afterwards.
  - **Leftover folders:** create `uploads/<unknown id>/` and a folder for a finished job before start. Assert both are gone after start.
  - **Existing cases that must stay green** cover the unchanged halves: "cancels a running job on both sides, and the worker moves on", "cancels a queued job without the worker ever seeing it", "fails the running job when the worker dies, restarts it, and the next job succeeds", "keeps finished jobs across a restart and fails the unfinished ones", and the add-on cases, including "fails a waiting job whose add-on did not load again after the worker restarted".
- **E2E: not applicable.** The app, the stub and the contract are unchanged, and the app does not read the new `/health` fields. The e2e suite runs against the stub, so nothing here can reach it. The full suite still runs in the gate as usual.
- **Manual, on the Spark** (after the rebuild, when `/health` shows `job: null`):
  1. Queue three images. Stop the running one, then stop the next one within a second. Look for the third starting within a few seconds, and `nvidia-smi` showing the GPU busy again.
  2. While a job runs, read `/health`. `job.lastHeardAt` should advance every few seconds.
  3. Queue two images, restart `qwen-model`, and wait about 4 minutes. Both should run after the reload rather than fail.
  4. Generate one image and check its PNG carries the STORY_024 settings (the rebuild brings them in).

  Record the model, checkpoint and date in the Done note.

## Estimated Complexity

M

## Corrections made during implementation (2026-10-13)

- **A clean shutdown no longer deletes unfinished jobs' uploads.** `close()` removed the upload folder of every unfinished job, so a `docker restart` would have thrown away a waiting edit's references before the restart could restore them. That step is gone; the clean-up at start removes whatever is left over. The ACs above already require the result; this is how it is met.
- **The watchdog does not fire twice for one restart.** While a restart it asked for is under way, it waits for the old worker to exit (`replacing`), so a silent job is failed and logged once, not on every tick.
- **The Python tests run with `-B`**, so the gate writes no `__pycache__` into the bind-mounted repo.

## Done note (2026-10-13)

- **Gate:** all six steps green, run by hand through `tools/gate/run.sh`: typecheck, lint, unit (app 185, stub 69, model server 109 plus 6 Python, recon 111, gate 9), integration 22, the build, and e2e 79 passed. After the gate, only `worker.py`'s docstring changed (a line pointing at `jobloop.py`); the file was checked to parse.
- **The deadlock test fails on BUG_011's code.** As an A/B check, a scratch copy of `jobloop.py` was given the old design (one plain lock, the answer written while holding it). Against it, "a job stopped before it starts is answered" timed out after 5 s. It passes against the shipped version.
- **Tests added:** `spark/model/test_jobloop.py` (6 cases, new); 7 cases in `server.test.ts` (unanswered stop, silent worker with two jobs waiting behind it, no restart for a healthy worker, `/health`, a worker that crashed by itself, a waiting edit kept across a server restart, leftover upload folders); one new case and one changed case in `jobs.test.ts`.
- **Manual, on the Spark** (Qwen-Image-2.1, the weights in `models/Qwen-Image-2.1`, 2026-10-13, after rebuilding `qwen/model:dev` with `spark/up.sh`):
  1. Three images queued. The first was stopped at 5%; the server handed the second to the worker 2.86 s later, and it was stopped 13 ms after that. Both stopped without a watchdog restart (`lastRestart` stayed `null`), neither wrote an image, and the third ran to done.
  2. `/health` during that run showed the job in progress with `stopRequestedAt` set and `queued: 1`, and `job: null` once idle.
  3. One image running and one waiting, then `docker restart qwen-model`. Ready again after 198 s. The running one failed with "The model server restarted before this job finished."; the waiting one ran to done.
  4. The third image of check 1 carries STORY_024's settings in its PNG (Model, Size, Seed, Add-on), which the image running before this deploy did not.
- **Observed, not investigated:** the first full image after each reload took about 2 minutes (129 s from the first stop in check 1, 128 s from ready in check 3), against 51–60 s measured in EPIC_004. This story did not change the pipeline, but no warm image was timed after it. Worth one timed image before reading anything into it.
- **Not done:** the watchdog's two paths were not triggered on the real worker. They need a worker that stops answering, and the deadlock that caused one is now fixed. They are covered against the fake worker.
