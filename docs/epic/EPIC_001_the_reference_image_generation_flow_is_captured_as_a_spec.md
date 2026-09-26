# EPIC_001 — The reference's image generation flow is captured as a spec we can build from

**Status:** In progress
**Started:** 2026-09-26

## Goal

Before a single screen of our own is built, `docs/recon/` holds everything a clone story needs to cite: dated screenshots of every state of chat.qwen.ai's image generation flow, measured design tokens, a component inventory, and notes on what the flow does on the network. After this epic, a story can say "match capture X" and mean something checkable.

## Why this is first

The owner's plan is UI first, model second. The UI is a clone, and a clone without a captured reference is a guess ([CLAUDE.md → §3 item 6](../../CLAUDE.md#3-how-features-are-built-important)). In the sibling `minimax` project the same epic also settled the tech-stack question; here the reference's framework is not identifiable from outside (see below), so EPIC_002 chooses our stack on its own grounds.

## Scope

**In:** the image generation surface only — the composer in image mode, the option controls, submit, every job state (queued, generating, done, failed, moderated, cancelled), the result shown in place, download, and the history/gallery of generations. Both the wide layout and the narrow layout.

**Out:** every other surface of chat.qwen.ai — chat, image editing with reference images, video generation, voice mode, artifacts, deep research. If a screenshot of one costs nothing extra during a capture run, it gets one line in the inventory; otherwise nothing. Out-of-MVP surfaces the owner asks about become backlog items ([CLAUDE.md → §3c](../../CLAUDE.md#3c-how-backlog-is-tracked)).

## Stories (in implementation order)

| # | Story | Status |
| --- | --- | --- |
| 001 | [The owner signs in to the reference once and every recon run reuses that session](../story/STORY_001_the_owner_signs_in_to_the_reference_once_and_every_recon_run_reuses_that_session.md) | In progress — awaiting the owner's login |
| 002 | [Every state of the image generation flow is captured as dated screenshots](../story/STORY_002_every_state_of_the_image_generation_flow_is_captured_as_dated_screenshots.md) | Not started |
| 003 | [The reference's design tokens are measured, not eyeballed](../story/STORY_003_the_references_design_tokens_are_measured_not_eyeballed.md) | Not started |
| 004 | [The component inventory and interaction notes say what the flow does on the network](../story/STORY_004_the_component_inventory_and_interaction_notes_say_what_the_flow_does_on_the_network.md) | Not started |

## Constraints

- **Quota.** Generations on the reference spend the owner's account quota. STORY_002 states how many real generations it needs and the owner approves the number before the run.
- **No credentials through the assistant.** The owner signs in once in a browser the scripts control; the scripts never see a password, a 2FA code, or a cookie value ([CLAUDE.md → §4b](../../CLAUDE.md#4b-recon-with-playwright)).
- **Recreate, don't lift.** Captures are for measuring. Their bundles, brand marks, sample images and the generated images themselves stay in the gitignored output directory ([CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded)).
- **Read-only and polite.** Browse at a human pace, only the owner's own account, only endpoints a normal session calls. The reference loads Alibaba's anti-bot stack (baxia, AWSC — observed 2026-09-26); if a run is challenged, stop and tell the owner rather than working around it.

## What was observed before any story (2026-09-26, logged out, 1440×900, headless desktop Chromium)

- The app is a **versioned `qwen-chat-fe` bundle** (0.3.11 that day) served from Alibaba's CDN (`assets.alicdn.com/g/qwenweb/qwen-chat-fe/…`). **No Next.js or Nuxt markers** (`__NEXT_DATA__`, `__NUXT__`) are present, so the framework is unidentified from outside. jQuery and a large analytics/anti-bot stack (baxia, AWSC, sufei, Google Tag Manager) also load.
- Layout logged out: a top bar with a **New Chat** icon control and the model selector (**"Qwen3.7-Plus"** that day) on the left, **Log in** (filled) and **Sign up** buttons top right; a centred heading "How can I help you?" over a single composer ("Ask Qwen") with a **+** attach control, an **Auto** selector and a voice button; a Terms/Privacy footer. **No sidebar and no image-generation control is visible logged out** — where image mode lives is STORY_002's first question.
- Fonts: body text resolves through a **system-ui stack that names Inter and NotoSansHans**; the only web fonts actually loaded are KaTeX's.
- The app's own API is under **`/api/v2/`** on the same origin (`configs/setting-config`, `models/`, `users/status`, `tts/config` were seen on load).
- **No first-visit modal or overlay was observed logged out** — unlike the sibling project's reference. The signed-in home may differ; STORY_002 records what it finds.
- A non-browser client (plain HTTP fetch) is served a different page entirely: a mobile-app download pitch ("Current System does not Support"). Recon must always look like a real desktop browser.

## Definition of done

Every story above is Done, `docs/recon/` contains the four artefact kinds named in [CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded), each dated, and a reader with no access to the reference can describe the image generation flow from the captures alone.

## Open questions

1. **Where does image generation live once signed in?** A mode of the composer (the Auto selector? the + menu?), a dedicated route, or a capability the model selector implies. Also: what replaces the Log in / Sign up controls, and whether a sidebar appears. Answered by STORY_002's first authenticated look, which amends its capture list before implementation.
2. **How many real generations does a full state capture need?** Proposed by STORY_002 and approved by the owner before the run; generations spend account quota, and the failure/quota states are captured from whatever the reference actually shows.
3. **Which model identifier does the reference use for image generation** (a "Qwen-Image-2.1" chip, a mode name, nothing visible)? Recorded by STORY_002/004 for EPIC_003's Departures sections.
