# BACKLOG_004 — Qwen Local becomes an app generated from PATHS

**Priority:** Medium. The owner's stated end goal (2026-10-20: "the end goal is to refactor this app to be a paths derived app"), after [EPIC_007](../epic/EPIC_007_the_app_runs_on_the_mac_studio_2022_and_draws_on_the_mac_studio_2026.md).

- **Summary:** rebuild the app as an app generated from the PATHS template (`kevinbrowncodes/paths`): FastAPI and Jinja2 with HTMX and Alpine.js, Tailwind through the standalone CLI, SQLite, a jobs table with a worker thread, `/health`, a token-protected `/api`, and `make check`, `test`, `e2e`, `build` and `deploy`. That replaces the Next.js and TypeScript app. Once generated, it is deployed by PATHS' agent on the Mac Studio 2022 from a version tag, like the owner's other apps.
- **User impact:** one way of building, testing and deploying across all the owner's tools. Template fixes arrive with `copier update`, deploys happen by themselves from a tag, and Machines reports each deploy's state.
- **What survives EPIC_007 unchanged:** the model server and the mflux worker on the Mac Studio 2026, which the new app calls through `MODEL_BASE_URL` with the same job API; the name `qwen.local` through PATHS' proxy; and the history EPIC_007 moves.
- **Rough scope:** every feature of the current app is on trial (the owner's porting rule). Use as of 2026-10-20, from 325 jobs:
  - edits 290;
  - a LoRA in 221;
  - Stop 54 times;
  - chat rename twice;
  - five of the seven ratios never chosen;
  - ten-reference edits never used, at most one reference.

  `history.json` becomes SQLite.
- **Dependencies:** EPIC_007 Done. MVP rule 11 still applies to anything new.
- **Open questions:**
  1. **Which look wins?** This repo's premise is fidelity to chat.qwen.ai, from lifted stylesheets and markup (CLAUDE.md §3e, §6 rule 8). A PATHS app draws the Mac's own look, measured from AppKit, with its own page shapes and context menus (PATHS README › What a generated app contains). Either the clone look is dropped, or the app departs from the template's UI and so loses what `copier update` would bring it.
  2. Does the `recon` package (EPIC_001, EPIC_006) stay in this repo or move out, since a PATHS app has no Node?
  3. Is the stub generation server kept for the new app's tests, rewritten in Python, or replaced?
