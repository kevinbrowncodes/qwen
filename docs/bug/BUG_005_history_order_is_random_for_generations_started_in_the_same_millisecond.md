# BUG_005 — History order is random for generations started in the same millisecond

**Status:** Resolved (2026-09-26)
**Found in:** the push of STORY_013, where the gate's integration step failed with its output shown (thanks to BUG_004). It is the same intermittent failure recorded in STORY_011's Done note.

## Summary

History is "newest first" by `createdAt`, an ISO timestamp with millisecond precision. For two generations created in the same millisecond, the tie was broken by comparing their ids, which are random UUIDs. So which one listed first was a coin toss. The integration test creates two jobs back to back, often inside one millisecond, and so failed about one run in ten.

## Steps to Reproduce

1. Create two generations within the same millisecond; the integration test's two back-to-back creates do this often.
2. `GET /api/history`.
3. The older one is listed first about half the time.

## Expected vs Actual Behaviour

- **Expected:** the one started later is listed first, always.
- **Actual:** among equal timestamps, the order followed the random ids.

## Root Cause

`byNewest` in `app/lib/history.ts` broke ties with `a.id.localeCompare(b.id)`. A unit test added in STORY_012 pinned exactly that tie-break ("orders entries created at the same moment by id"). It asserted an implementation detail that contradicted the behaviour a user sees.

## Acceptance Criteria

- [x] Entries with equal `createdAt` keep the order they were added in, newest added first, and through a save and a load.
- [x] The STORY_012 test that pinned the id tie-break is replaced by one asserting insertion order.
- [x] The integration lane passes repeatedly. Checked: 15 runs in a row after the fix.

## Resolution

`addEntry` puts the new entry in front, and `byNewest` compares `createdAt` only. JavaScript's sort is stable, so equal timestamps keep their order, and the stored file (already newest first) reloads the same way.
