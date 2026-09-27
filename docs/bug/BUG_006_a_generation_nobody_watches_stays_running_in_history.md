# BUG_006 — A generation nobody is watching stays "running" in history

**Status:** Resolved (2026-09-26)
**Found in:** STORY_016's manual verification against the real model

## Summary

History's status is updated only by `GET /api/jobs/:id`, which only an open generation page makes. Against the stub, jobs end in a poll or two, so it never showed. Against the real model, a job takes about a minute. Starting a generation and then going home or to My Library left it "running" in the sidebar, with its spinner, and out of My Library, indefinitely.

## Steps to Reproduce

1. With the app pointed at the model server, send a prompt.
2. Before it finishes, click New image.
3. Wait two minutes: the sidebar row still spins, and `/api/history` says `running`.

## Expected vs Actual Behaviour

- **Expected:** the row reaches done, failed or cancelled on its own, and a finished image appears in My Library.
- **Actual:** it stays at its last polled state until its page is opened again.

## Root Cause

Nothing refreshes a non-terminal history entry except the generation page's own polling. The sidebar only re-read the stored file.

## Acceptance Criteria

- [x] `GET /api/history` asks the generation server about each queued or running entry, and records the answers before it lists.
- [x] While any entry is queued or running, the sidebar and My Library read history again every 5 seconds, and they stop once nothing is.
- [x] Integration: an unwatched `done-after-1-poll` job reads as done on the next history read. Unit: the refresh ticks while running and stops after.

## Resolution

Fixed in `app/app/api/history/route.ts` and `app/lib/use-history.ts`, with the tests above.
