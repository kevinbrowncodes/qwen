# EPIC_002 — The app has a skeleton, a stub generation server, and a test gate before any screen is built

**Status:** In progress (started 2026-09-26)

## Goal

The testing foundation CLAUDE.md refers to: a TypeScript app skeleton with `strict: true`, the stub generation server (async job API: create → status → result, with scripted outcomes and a tiny fixture image), Vitest unit and integration lanes, a Playwright e2e lane that starts the stub itself, coverage floors, and the Husky pre-push hook that runs the seven-step gate from [CLAUDE.md → §4](../../CLAUDE.md#4-dev-workflow).

## Why here

The gate must exist before the first clone story so that story ships with tests rather than promising them. The stack is chosen by this epic's first story: the reference's framework is unidentified from outside (EPIC_001's logged-out observation, 2026-09-26), so the choice is ours — Next.js App Router is the working assumption, for continuity with the sibling `minimax` project rather than as a match of the reference.

## Stories (in implementation order)

Drafted 2026-09-26 when EPIC_001 closed, and self-approved under the owner's overnight authorisation.

| # | Story | Status |
| --- | --- | --- |
| 005 | [The app skeleton builds and runs inside the gate container](../story/STORY_005_the_app_skeleton_builds_and_runs_inside_the_gate_container.md) | Done 2026-09-26 |
| 006 | [A stub generation server speaks the image job API with scripted outcomes](../story/STORY_006_a_stub_generation_server_speaks_the_image_job_api.md) | Done 2026-09-26 |
| 007 | [The app's own routes speak to the generation server, tested against the stub](../story/STORY_007_the_apps_own_routes_speak_to_the_generation_server.md) | Not started |
| 008 | [The gate runs end-to-end tests, enforces coverage floors, and guards every push](../story/STORY_008_the_gate_runs_e2e_enforces_coverage_and_guards_every_push.md) | Not started |

The stack is Next.js App Router, carried over from the sibling project because it is known to work on this box. The reference's own framework is unidentified.
