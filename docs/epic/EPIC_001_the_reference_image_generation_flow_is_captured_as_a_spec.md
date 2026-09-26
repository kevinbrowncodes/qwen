# EPIC_001 — The reference's image generation flow is captured as a spec we can build from

**Status:** In progress
**Started:** 2026-09-26

## Goal

Before a single screen of our own is built, `docs/recon/` holds everything a clone story needs to cite: dated screenshots of every state of chat.qwen.ai's image generation flow, measured design tokens, a component inventory, and notes on what the flow does on the network. After this epic, a story can say "match capture X" and mean something checkable.

## Why this is first

The owner's plan is UI first, model second. The UI is a clone, and a clone without a captured reference is a guess ([CLAUDE.md → §3 item 6](../../CLAUDE.md#3-how-features-are-built-important)). In the sibling `minimax` project the same epic also settled the tech-stack question; here the reference's framework is not identifiable from outside (see below), so EPIC_002 chooses our stack on its own grounds.

## Scope

**In:** the image generation surface only — the composer in image mode, reference image attachment (editing is in the MVP, owner's decision 2026-09-26), the option controls, submit, every job state (queued, generating, done, failed, moderated, cancelled), the result shown in place, download, and the history/gallery of generations. Both the wide layout and the narrow layout.

**Out:** every other surface of chat.qwen.ai — chat, video generation, voice mode, artifacts, deep research. If a screenshot of one costs nothing extra during a capture run, it gets one line in the inventory; otherwise nothing. Out-of-MVP surfaces the owner asks about become backlog items ([CLAUDE.md → §3c](../../CLAUDE.md#3c-how-backlog-is-tracked)).

## Stories (in implementation order)

| # | Story | Status |
| --- | --- | --- |
| 001 | [The owner signs in to the reference once and every recon run reuses that session](../story/STORY_001_the_owner_signs_in_to_the_reference_once_and_every_recon_run_reuses_that_session.md) | In progress — awaiting the owner's login |
| 002 | [Every state of the image generation flow is captured as dated screenshots and page snapshots](../story/STORY_002_every_state_of_the_image_generation_flow_is_captured_as_dated_screenshots.md) | Not started |
| 003 | [The reference's stylesheets, icons, fonts and brand assets are harvested into the repo](../story/STORY_003_the_references_stylesheets_icons_fonts_and_brand_assets_are_harvested_into_the_repo.md) | Not started |
| 004 | [The component inventory and interaction notes say what the flow does on the network](../story/STORY_004_the_component_inventory_and_interaction_notes_say_what_the_flow_does_on_the_network.md) | Not started |

## Hand-off (2026-09-26)

- **Runs on the Spark, where the repo lives.** The owner works from VS Code on the Mac Studio through a tunnel into the Spark (stated 2026-09-26), so the scripts, the profile at `recon/.profile/` and the captures are all on the Spark. The Spark has no pnpm on the host; Node tooling runs through the `node:26-alpine` image with `npx -y pnpm@10.32.1` (Node 26 ships no corepack).
- **The login window opens on the Spark's own desktop**, not on the Mac: a headed browser the script launches appears on the Spark's display (a GNOME session on `:1`, seen 2026-09-26). STORY_001's manual step therefore needs the owner at that display, or a remote view of it. How to make that practical from the Mac is an open question below; it is settled before STORY_001 is closed.
- **One story at a time**, in the order below ([CLAUDE.md → §6 rule 5](../../CLAUDE.md#6-key-rules)). Each story's gate is `pnpm typecheck` and `pnpm test` at the root, which cover the `recon` package.
- **The owner's steps:** sign in once for STORY_001; review the committed part-1 captures and confirm N = 2 before STORY_002's part 2 runs; read `interactions.md` at STORY_004 and confirm nothing identifies the account.

| Order | Story | State | Needs | Produces |
| --- | --- | --- | --- | --- |
| 1 | STORY_001 — sign in once, reuse the session | Code landed (0aed345); awaiting the owner's login | Owner runs `pnpm recon:login`, then `pnpm recon:check` reads `session: signed-in`; `git status --short` shows no profile | ACs flipped, Done note, Status → Done |
| 2 | STORY_002 — every state as screenshots and page snapshots | Not started | A signed-in session. **First an authenticated look**, then amend its Current state and capture list before writing `recon:capture` ([§3 item 8](../../CLAUDE.md#3-how-features-are-built-important)). Part 1 needs no generation; part 2 runs with `--generate 2` after the owner reviews part 1 | `docs/recon/<date>/*.png`, `*.html`, `manifest.json`; raw `recon/out/<date>/network.jsonl` |
| 3 | STORY_003 — stylesheets, icons, fonts and brand assets harvested | Not started | STORY_002's state list and snapshots | `docs/recon/<date>/assets/{css,icons,fonts,brand}/`, `tokens.json`, `tokens.md` |
| 4 | STORY_004 — inventory and interaction notes | Not started | STORY_002's network log and snapshots; STORY_003's icons | `inventory.md`, `interactions.md`, generated `endpoints.md` / `endpoints.json` — the input EPIC_002's stub is designed from |

## Constraints

- **Quota.** Generations on the reference spend the owner's account quota. STORY_002 states how many real generations it needs and the owner approves the number before the run.
- **No credentials through the assistant.** The owner signs in once in a browser the scripts control; the scripts never see a password, a 2FA code, or a cookie value ([CLAUDE.md → §4b](../../CLAUDE.md#4b-recon-with-playwright)).
- **Lift what renders; write what runs** (owner's decision 2026-09-26). Their stylesheets, inline SVG icons, logo and brand images, loaded font files and the cleaned markup of each state are harvested into `docs/recon/<date>/` and committed; the clone builds from them. Their JavaScript bundles, the owner's session material, and images generated on the reference stay in the gitignored output directory. The decision rests on the repo staying private and the use personal ([CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded)).
- **Read-only and polite.** Browse at a human pace, only the owner's own account, only endpoints a normal session calls. The reference loads Alibaba's anti-bot stack (baxia, AWSC — observed 2026-09-26); if a run is challenged, stop and tell the owner rather than working around it.

## What was observed before any story (2026-09-26, logged out, 1440×900, headless desktop Chromium)

- The app is a **versioned `qwen-chat-fe` bundle** (0.3.11 that day) served from Alibaba's CDN (`assets.alicdn.com/g/qwenweb/qwen-chat-fe/…`). **No Next.js or Nuxt markers** (`__NEXT_DATA__`, `__NUXT__`) are present, so the framework is unidentified from outside. jQuery and a large analytics/anti-bot stack (baxia, AWSC, sufei, Google Tag Manager) also load.
- Layout logged out: a top bar with a **New Chat** icon control and the model selector (**"Qwen3.7-Plus"** that day) on the left, **Log in** (filled) and **Sign up** buttons top right; a centred heading "How can I help you?" over a single composer ("Ask Qwen") with a **+** attach control, an **Auto** selector and a voice button; a Terms/Privacy footer. **No sidebar and no image-generation control is visible logged out** — where image mode lives is STORY_002's first question.
- Fonts: body text resolves through a **system-ui stack that names Inter and NotoSansHans**; the only web fonts actually loaded are KaTeX's.
- The app's own API is under **`/api/v2/`** on the same origin (`configs/setting-config`, `models/`, `users/status`, `tts/config` were seen on load).
- **No first-visit modal or overlay was observed logged out** — unlike the sibling project's reference. The signed-in home may differ; STORY_002 records what it finds.
- A non-browser client (plain HTTP fetch) is served a different page entirely: a mobile-app download pitch ("Current System does not Support"). Recon must always look like a real desktop browser.

## Definition of done

Every story above is Done, `docs/recon/` contains the artefact kinds named in [CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded) — screenshots, cleaned DOM snapshots, harvested assets (stylesheets, icons, fonts, brand), measured tokens, the component inventory and the interaction notes — each dated, and a reader with no access to the reference can describe the image generation flow from the captures alone.

## Open questions

1. **Where does image generation live once signed in?** A mode of the composer (the Auto selector? the + menu?), a dedicated route, or a capability the model selector implies. Also: what replaces the Log in / Sign up controls, and whether a sidebar appears. Answered by STORY_002's first authenticated look, which amends its capture list before implementation.
2. ~~How many real generations does a full state capture need?~~ **Approved 2026-09-26: N = 2** — one for the text-to-image submit → generating → done → download → history chain, one for submit-then-cancel. If the editing flow's generating/done states turn out to differ from text-to-image's, STORY_002 asks before spending beyond two.
   **What N = 2 does not capture (stated 2026-09-26):** failed and moderated are captured only if one of the two runs happens to produce them, and the edit flow's generating/done states are **not** captured at all — they cannot be compared with text-to-image's without spending a generation on an edit. So the trigger above is concrete: if the clone needs the edit-done state as a capture, the owner approves one edit generation (the fixture reference image plus a short prompt). Every state left uncaptured is designed in EPIC_003 from an ASCII sketch ([CLAUDE.md → §3 item 6](../../CLAUDE.md#3-how-features-are-built-important)), and STORY_002's Done note lists which those are.
3. **Which model identifier does the reference use for image generation** (a "Qwen-Image-2.1" chip, a mode name, nothing visible)? Recorded by STORY_002/004 for EPIC_003's Departures sections.
4. **How does the owner see the login window from the Mac?** (raised 2026-09-26) The repo lives on the Spark and the owner works through a VS Code tunnel, so `pnpm recon:login` opens its browser on the Spark's display. Candidates: sign in at the Spark's own monitor; view the Spark's desktop remotely; or run the headed browser in a container with a browser-viewable display. The owner picks; a container route is a change to STORY_001's scripts and gets its own chore.
