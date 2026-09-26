# BUG_001 — The committed snapshot keeps a style that the capture extension injected

**Status:** Resolved (2026-09-26)
**Found in:** [STORY_002](../story/STORY_002_every_captured_state_of_the_image_generation_flow_is_filed_as_a_dated_spec.md), while preparing STORY_003

## Summary

`docs/recon/2026-09-26/snapshots/home-signed-in@1437.html` contains `<style id="claude-agent-animation-styles">`. Claude in Chrome added that style to the owner's page while it took the readings, and "Save Page As" saved it with the rest. It is not the reference's markup, but the snapshot presents it as if it were, and STORY_003 would have harvested it as one of the reference's inline stylesheets.

## Steps to Reproduce

1. Run `recon/run.sh curate 2026-09-26`.
2. Run `grep -c claude-agent docs/recon/2026-09-26/snapshots/home-signed-in@1437.html`. The count is non-zero.

## Expected vs Actual Behaviour

- **Expected:** the snapshot holds only what the reference rendered.
- **Actual:** it also holds the capture tool's own style, a pulse animation for `#claude-agent-glow-border-inner`.

## Root Cause

The cleaner removes scripts, script hooks and identity, but it had no rule for markup the capture tool adds to a page. The glow element itself was gone by the time the page was saved; its style was not.

## Acceptance Criteria

- [x] The snapshot cleaner removes any element whose `id`, or any of whose classes, starts with `claude-agent`.
- [x] A unit test covers both an injected style and an injected element.
- [x] Re-running curate leaves no `claude-agent` markup in the snapshot.

## Resolution

Fixed in `recon/src/snapshot.ts` (`isCaptureToolMarkup`), with a test in `snapshot.test.ts`, and the snapshot was regenerated. STORY_003 counts the remaining 25 inline styles as the reference's own.
