# EPIC_001 — The reference's image generation flow is captured as a spec we can build from

**Status:** Done (2026-09-26; the logo on 2026-09-27)
**Started:** 2026-09-26

## Goal

Before a single screen of our own is built, `docs/recon/` holds everything a clone story needs to cite: a dated reading of every captured state (DOM, boxes and computed styles, in place of screenshots, which the owner chose not to take, 2026-09-26) of chat.qwen.ai's image generation flow, measured design tokens, a component inventory, and notes on what the flow does on the network. After this epic, a story can say "match capture X" and mean something checkable.

## Why this is first

The owner's plan is UI first, model second. The UI is a clone, and a clone without a captured reference is a guess ([CLAUDE.md → §3 item 6](../../CLAUDE.md#3-how-features-are-built-important)). In the sibling `minimax` project the same epic also settled the tech-stack question; here the reference's framework is not identifiable from outside (see below), so EPIC_002 chooses our stack on its own grounds.

## Scope

**In:** the image generation surface only — the composer in image mode, reference image attachment (editing is in the MVP, owner's decision 2026-09-26), the option controls, submit, every job state (queued, generating, done, failed, moderated, cancelled), the result shown in place, download, and the history/gallery of generations. Both the wide layout and the narrow layout.

**Out:** every other surface of chat.qwen.ai — chat, video generation, voice mode, artifacts, deep research. If a screenshot of one costs nothing extra during a capture run, it gets one line in the inventory; otherwise nothing. Out-of-MVP surfaces the owner asks about become backlog items ([CLAUDE.md → §3c](../../CLAUDE.md#3c-how-backlog-is-tracked)).

## Stories (in implementation order)

| # | Story | Status |
| --- | --- | --- |
| 001 | [The owner signs in to the reference once and every recon run reuses that session](../story/STORY_001_the_owner_signs_in_to_the_reference_once_and_every_recon_run_reuses_that_session.md) | Withdrawn: the reference's access check rejects the automated browser |
| 002 | [Every captured state of the image generation flow is filed in the repo as a dated spec](../story/STORY_002_every_captured_state_of_the_image_generation_flow_is_filed_as_a_dated_spec.md) | Done 2026-09-26 |
| 003 | [The reference's stylesheets, icons, fonts and brand assets are harvested into the repo](../story/STORY_003_the_references_stylesheets_icons_fonts_and_brand_assets_are_harvested_into_the_repo.md) | Done 2026-09-26 (logo 2026-09-27) |
| 004 | [The component inventory and interaction notes say what the flow does on the network](../story/STORY_004_the_component_inventory_and_interaction_notes_say_what_the_flow_does_on_the_network.md) | Done 2026-09-26 |

## Hand-off (2026-09-26, revised the same day)

- **How the capture was actually made.** STORY_001's Playwright sign-in was withdrawn. chat.qwen.ai's access check kept failing in the automated browser even when the owner solved it, and §3e says to stop rather than work around a challenge. The owner then captured the flow in their own signed-in Chrome:
  - Claude in Chrome took 15 per-state DOM readings: 12 at 1437 wide, 3 at 393 wide as an emulated iPhone, plus an endpoint list and prose notes;
  - the owner saved the signed-in home with "Save Page As", which gives the full DOM, the four icon sprites (1,113 icons) and the inline styles;
  - the nine stylesheets were saved separately.

  All of this is in the gitignored `recon/out/2026-09-26/`. **There are no screenshots, by the owner's choice.** Generations used: 2, the edit and one text-to-image run. The cancel run was not spent, because the reference's Stop button stays disabled during an image job.
- **Every remaining story is offline.** It reads `recon/out/2026-09-26/` and writes `docs/recon/2026-09-26/`, in the recon container (`recon/run.sh <command> 2026-09-26`), with no request to the reference.
- **Runs on the Spark, where the repo lives.** The owner works from VS Code on the Mac Studio through a tunnel into the Spark. Tooling runs in the recon container (CHORE_001); nothing is installed on the host.
- **One story at a time**, in the order below ([CLAUDE.md → §6 rule 5](../../CLAUDE.md#6-key-rules)). Each story's gate is `recon/run.sh typecheck` and `recon/run.sh test`.
- **The owner's steps:**
  1. copy the saved page's `Qwen_files/` folder into `recon/out/2026-09-26/` (the logo lives there, and STORY_003 needs it);
  2. confirm nothing identifies them in STORY_002's output before it is committed;
  3. confirm STORY_003's harvested set against the live reference;
  4. read `interactions.md` at STORY_004.

| Order | Story | State | Needs | Produces |
| --- | --- | --- | --- | --- |
| 1 | STORY_001: sign in once, reuse the session | Withdrawn 2026-09-26 | Nothing | Nothing further; the scripts stay in `recon/` unused |
| 2 | STORY_002: file every captured state as a dated spec | Not started | `recon/out/2026-09-26/extension/`, `Qwen.html` | `docs/recon/2026-09-26/states/*.json`, `snapshots/home-signed-in@1437.html`, `capture-notes.md`, `manifest.json`, `coverage.md` |
| 3 | STORY_003: harvest the stylesheets, icons and brand assets | Not started | STORY_002's readings and identity guard; `assets/css/`; `Qwen_files/` for the logo | `docs/recon/2026-09-26/assets/{css,icons,brand}/`, `index.json`, `tokens.json`, `tokens.md` |
| 4 | STORY_004: inventory and interaction notes | Not started. **Its ACs still assume STORY_002's old network log and must be rewritten before it starts**, against `network-endpoints.json`, which holds paths only, with no methods, bodies or cadence | STORY_002's readings; STORY_003's icons | `inventory.md`, `interactions.md`, and the endpoint tables that EPIC_002's stub is designed from |

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

Every story above is Done or withdrawn, and `docs/recon/` contains the artefact kinds named in [CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded), with per-state readings standing in for screenshots: cleaned DOM snapshots, harvested assets (stylesheets, icons, fonts, brand), measured tokens, the component inventory and the interaction notes — each dated, and a reader with no access to the reference can describe the image generation flow from the captures alone.

## Open questions

1. ~~**Where does image generation live once signed in?** A mode of the composer (the Auto selector? the + menu?), a dedicated route, or a capability the model selector implies. Also: what replaces the Log in / Sign up controls, and whether a sidebar appears. Answered by STORY_002's first authenticated look, which amends its capture list before implementation.~~ **Answered 2026-09-26:** image mode is the `Create Image` item in the composer's "+" (`Select Mode`) menu, and the URL stays `/`. A sidebar is present when signed in, with the owner's user button bottom-left. `My Library` (`/library`) appears once an image exists, and it is the history surface. The details are in STORY_002's Current state.
2. ~~How many real generations does a full state capture need?~~ **Approved 2026-09-26: N = 2** — one for the text-to-image submit → generating → done → download → history chain, one for submit-then-cancel. If the editing flow's generating/done states turn out to differ from text-to-image's, STORY_002 asks before spending beyond two.
   **What N = 2 does not capture (stated 2026-09-26):** failed and moderated are captured only if one of the two runs happens to produce them, and the edit flow's generating/done states are **not** captured at all — they cannot be compared with text-to-image's without spending a generation on an edit. So the trigger above is concrete: if the clone needs the edit-done state as a capture, the owner approves one edit generation (the fixture reference image plus a short prompt). Every state left uncaptured is designed in EPIC_003 from an ASCII sketch ([CLAUDE.md → §3 item 6](../../CLAUDE.md#3-how-features-are-built-important)), and STORY_002's Done note lists which those are.
   **What was actually spent (2026-09-26):** 2 generations, the edit (so edit-done *is* captured) and one text-to-image run. The cancel was not spent, because the reference has no UI cancel for image jobs. STORY_002's `coverage.md` lists what remains uncaptured.
3. **Which model identifier does the reference use for image generation** (a "Qwen-Image-2.1" chip, a mode name, nothing visible)? Recorded by STORY_002/004 for EPIC_003's Departures sections. **Answered 2026-09-26:** a composer dropdown offering `Qwen-Image 3.0` and `Qwen-Image 2.0`, with **2.0 selected by default**. `Model 2.0` shows at narrow width. The wire identifier was not observed.
4. ~~**How does the owner see the login window from the Mac?** (raised 2026-09-26) The repo lives on the Spark and the owner works through a VS Code tunnel, so `pnpm recon:login` opens its browser on the Spark's display. Candidates: sign in at the Spark's own monitor; view the Spark's desktop remotely; or run the headed browser in a container with a browser-viewable display. The owner picks; a container route is a change to STORY_001's scripts and gets its own chore.~~ Moot: the owner used remote desktop (CHORE_001), and then STORY_001 was withdrawn.
