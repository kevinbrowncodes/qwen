# BUG_011 — A stopped image froze the model server's queue for two days

**Status:** Resolved (2026-10-13). The fix is [STORY_026](../story/STORY_026_a_stopped_image_can_no_longer_freeze_the_queue.md)
**Found by:** the owner, 2026-10-13 ("I am running a generation and I am noticing it's taking longer than expected")

## Summary

On 2026-10-11 at 21:10 UTC, two images were stopped 1.4 seconds apart. After that the model server on the Spark ran nothing. Every later job stayed **Queued** with no error, and the GPU sat idle. It stayed that way until the `qwen-model` container was restarted on 2026-10-13 at about 15:55 UTC. Nothing on the server or in the app reported a problem: `/health` answered `{"ok":true,…,"ready":true}` throughout.

Jobs lost to it:
- six jobs created on 2026-10-11 at 21:04 UTC with the `erect-friendofmale` add-on. They waited about 42 hours, and the owner stopped them on 2026-10-13 at 15:46 UTC;
- two jobs created on 2026-10-13 at 15:41 UTC (`b8e4af6e`, `51467307`). The restart that cleared the stall failed them with "The model server restarted before this job finished."

## Steps to Reproduce

Confirmed only from the record (below). Not yet reproduced on demand; STORY_026's first test does that.

1. Queue at least three images, so one is running and two are waiting.
2. Stop the running one. As soon as the worker confirms it, the server hands the worker the next job.
3. Within a second or two, before that job takes its first step, stop it too.

## Expected vs Actual Behaviour

- **Expected:** the second job is reported stopped, and the worker moves on to the third.
- **Actual:** the worker never answers for the second job. The server keeps that job as the one in progress, so it never hands the worker another one. Every job sent after it waits forever.

## Root Cause

A deadlock in the worker's main loop (`spark/model/worker.py`, lines 202–205):

```python
with _lock:
    if job["id"] in _cancelled:
        _cancelled.discard(job["id"])
        say({"type": "cancelled", "id": job["id"]})   # say() takes _lock again
        continue
```

`say()` (lines 48–51) does `with _lock:` to write its line. `_lock` is a plain `threading.Lock`, which the same thread cannot take twice, so the main thread blocks forever. This path only runs when a job is stopped after the server has sent it to the worker but **before the worker has started it**. In practice that means stopping the next job within a second or two of stopping the one before it. A stop during a run goes through the step callback, which releases the lock before calling `say()`, and works. So does a stop of a job the worker has not been sent yet, which the server handles itself.

What made it last two days, not seconds: the server frees its one "in progress" slot (`current` in `spark/model-server/src/server.ts`) only when the worker answers done, failed or cancelled, or exits. A worker that is alive but silent holds the slot forever. Nothing checks how long it has been, and `/health` does not show it.

**Evidence, read on the Spark on 2026-10-13:**
- The job index (`/outputs/jobs.json`) showed `e74cf8e0` stopped at 21:10:22.141 UTC and `d4d9c021` at 21:10:23.575 UTC. Both were created at 20:47:33 UTC; the job before them (`d425fe77`) finished at 21:05:57 UTC. Nothing finished after that.
- No job had status `running`, yet two were `queued` and the worker was ready. The server's `pump()` only stops for a non-null `current`.
- `d4d9c021`'s upload folder (`/outputs/uploads/d4d9c021-…`) was still there. The server deletes it when the worker answers for the job, or at once for a job stopped while waiting, so the server had sent it and heard nothing back.
- The worker process (pid 142890, up 5 days 23 h) was alive at 0% CPU. One thread was waiting on its stdin; the main thread was blocked on a futex. GPU use was 0% at 10 W.
- The server logs any worker line it cannot parse. Its log had nothing after the worker's start on 2026-10-07, so no answer was sent and mangled.

**Found alongside, not the cause:** the `qwen/model:dev` image running on the Spark was built on 2026-10-07 at 12:01 (local) from before STORY_024's commit (15:57 the same day). Its `worker.py` lacks STORY_024's PNG settings, so images made since then do not carry them. The next image rebuild fixes it.

## Acceptance Criteria

- [x] Stopping a job the worker has received but not started gets a "stopped" answer, and the worker goes on to the next job.
- [x] A worker that stops answering cannot hold the queue: the server notices and restarts it within a bounded time.
- [x] `/health` shows the job in progress and when the worker was last heard from, so a stall can be seen without reading the job index.
- [x] A restart of the model server does not throw away jobs that were only waiting.

## Resolution

[STORY_026](../story/STORY_026_a_stopped_image_can_no_longer_freeze_the_queue.md), deployed on 2026-10-13. The worker's job loop is now `spark/model/jobloop.py`, with separate locks for its output and for the stopped set, and nothing writes a line while holding the second. `test_jobloop.py` replays this bug's sequence and times out on the old design. The server now restarts a worker that leaves a stop unanswered for 60 s, or says nothing about a running job for 5 minutes. `/health` shows the job in progress and when the worker last spoke. A server restart keeps waiting jobs. On the Spark, two images stopped 2.86 s apart were both answered and the next one ran.
