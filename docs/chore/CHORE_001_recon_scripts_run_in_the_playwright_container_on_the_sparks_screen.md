# CHORE_001 — The recon scripts run in a container and open their window on the Spark's screen

**Status:** Done (2026-09-26) — manual sign-in pending, tracked in STORY_001
**Created:** 2026-09-26
**Relates to:** [STORY_001](../story/STORY_001_the_owner_signs_in_to_the_reference_once_and_every_recon_run_reuses_that_session.md), [EPIC_001 → open question 4](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md#open-questions)

## Summary

`pnpm recon:login` and `pnpm recon:check` run inside the official Playwright image instead of on the host. The headed login window opens on the Spark's own desktop, which the owner views over remote desktop from the Mac. STORY_001's scripts and behaviour are unchanged; only how they are launched changes.

## Why

- The repo lives on the Spark and the owner works through a VS Code tunnel (stated 2026-09-26). The Spark host has Node 18 and no pnpm, and nothing is installed on the host (owner's rule). Node 18 cannot run the TypeScript sources directly, so the scripts cannot run on the host as they stand.
- The owner answered EPIC_001's open question 4 on 2026-09-26: **they remote-desktop into the Spark from the Mac**, so a window on the Spark's display is one they can see and sign in through.
- Checked on the Spark on 2026-09-26: an X11 GNOME session on display `:1` (Xorg with `-nolisten tcp`, socket at `/tmp/.X11-unix/X1`, auth file at `/run/user/1000/gdm/Xauthority`). `mcr.microsoft.com/playwright:v1.63.0-noble` is published for arm64.

## Changes

- [x] `recon/compose.yaml` defines one service on `mcr.microsoft.com/playwright:v1.63.0-noble`, pinned to the same Playwright version as `recon/package.json`. It runs as the owner's uid/gid, mounts the repo at the same path, bind-mounts `/tmp/.X11-unix` read-only, mounts the X auth file read-only, and passes `DISPLAY`. It uses no `--privileged` and no host network.
- [x] `recon/run.sh` is a thin wrapper that checks `DISPLAY` and the auth file exist, then runs `docker compose run --rm recon <script>`. It prints nothing but the script's own output: never the auth file's contents or a cookie.
- [x] The owner types `recon/run.sh login` and `recon/run.sh check` from the repo root; pnpm is not on the host, so `pnpm recon:login` cannot be the entry point there. Inside the container the wrapper installs dependencies if needed and calls the existing `recon` package scripts, so `pnpm recon:login` / `recon:check` keep working anywhere pnpm exists.
- [x] `browser.ts` keeps `channel: "chromium"`. Login and check both run in the same image, so the profile one writes is read by the same browser binary.
- [x] The pnpm store and `node_modules` created by the container stay out of git: `.pnpm-store/` is added to `.gitignore`, and `node_modules/` is already ignored.
- [x] README → Running Recon says the commands run in the Playwright container and the window appears on the Spark's desktop.

## Testing

- **Unit** — no new logic in TypeScript, so `recon/src/session.test.ts` stays as it is and must stay green. It runs inside the same container.
- **Shell** — `recon/run.sh` is linted with shellcheck through the `koalaman/shellcheck:stable` image. Nothing is installed on the host.
- **Integration / E2E** — N/A, for the same reason as STORY_001: the only thing to integrate with is a third-party site behind a login.
- **Manual (closes STORY_001 too)** — The owner is on remote desktop and runs `recon/run.sh login`. The window appears on the Spark's desktop, they sign in, and the script prints "Signed in". `recon/run.sh check` then prints `session: signed-in`. `git status --short` shows no profile, store or output directory.

## Done note (2026-09-26)

- Verified on the Spark: `recon/run.sh typecheck` clean; `recon/run.sh test` 9 of 9 pass; shellcheck clean through the image; `recon/run.sh check` with no profile yet prints `session: signed-out`, exit 1; a headed Chromium launched from the container opened and closed a blank window on display `:1`.
- One addition to the changes above: the container's pnpm and store are cached in the gitignored `recon/.cache/`, so no store lands in the repo root. `.pnpm-store/` is ignored too, as listed.
- `login` and `check` run with plain `node` inside the container, so their 0 / 1 / 2 exit codes reach the shell without a pnpm error banner.
