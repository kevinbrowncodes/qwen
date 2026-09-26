# EPIC_002 — The app has a skeleton, a stub generation server, and a test gate before any screen is built

**Status:** Not started (after EPIC_001)

## Goal

The testing foundation CLAUDE.md refers to: a TypeScript app skeleton with `strict: true`, the stub generation server (async job API: create → status → result, with scripted outcomes and a tiny fixture image), Vitest unit and integration lanes, a Playwright e2e lane that starts the stub itself, coverage floors, and the Husky pre-push hook that runs the seven-step gate from [CLAUDE.md → §4](../../CLAUDE.md#4-dev-workflow).

## Why here

The gate must exist before the first clone story so that story ships with tests rather than promising them. The stack is chosen by this epic's first story: the reference's framework is unidentified from outside (EPIC_001's logged-out observation, 2026-09-26), so the choice is ours — Next.js App Router is the working assumption, for continuity with the sibling `minimax` project rather than as a match of the reference.

## Stories

Drafted when EPIC_001 closes. Expected shape: app skeleton and tooling; stub generation server; unit + integration lanes; e2e lane with fixtures (a tiny result image, and whatever STORY_004's interaction notes say the protocol needs); coverage floors and the pre-push hook.
