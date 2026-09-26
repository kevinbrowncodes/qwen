# CLAUDE.md

> **Workflow, conventions, and guardrails** for AI coding assistants working in the `qwen` repository. Kept intentionally stable — **project-specific details live in [README.md](README.md).**

> 📖 **Read [README.md](README.md) first** to understand the project: its purpose, MVP scope, architecture, tech stack, project structure, features, testing setup, and how the model is served. CLAUDE.md only covers _how we work_ (process + rules); the README is the source of truth for _what the project is_. When the two ever disagree about project facts, trust the README and flag it.

---

## 1. Project Overview

**Qwen Local** (repo: `qwen`) is a self-hosted image generation workstation. It is a web UI that copies the look and reproduces the behaviour of the **image generation surface of https://chat.qwen.ai**, backed by **Qwen-Image-2.1** running on the owner's **NVIDIA DGX Spark** instead of Alibaba's cloud. **Primary language: TypeScript** for the UI; the Spark side is shell/Python serving configuration. The sibling project `minimax` (same owner) did this for video against agent.minimax.io; this repo reuses its process, and a lesson earned there is cited as such rather than re-learned here.

**The MVP is image generation — text-to-image and image editing with reference images — and nothing else** (owner's decision 2026-09-26: editing is in). In scope: entering a prompt in image mode, attaching reference images for an edit, choosing the generation options the reference exposes, submitting, watching the job progress, seeing the result in place, downloading it, and the history/gallery of past generations. Everything else chat.qwen.ai does — chat, video generation, voice mode, artifacts, deep research — is **out of scope until the MVP epic is Done**. Such surfaces get a screenshot and a line in the recon inventory if that is cheap, a backlog item if the owner mentions them, and no code.

The work is planned as two phases:

1. **UI recon and rebuild** — capture the reference's image generation surface with Playwright through the owner's own logged-in session, harvest its stylesheets, icons, fonts and markup, then build it with our own code driving those lifted assets ([§3e](#3e-how-recon-is-recorded)).
2. **Image model on the Spark** — serve the model on the DGX Spark behind an async job API (create a generation → poll its status → fetch the result) and point the UI at it through configuration. **The model's license is part of the epic's first decision** — Qwen-Image-2.1 is non-commercial-only; see [README.md → Running the Model](README.md#running-the-model) for the facts and the open question.

Two machines are involved: the **Mac** (where the assistant runs, and where the UI is developed and tested) and the **Spark** (where the model runs; the owner opens this repo on the Spark for that work). **Nothing in the test gate may depend on the Spark being reachable** — see [§4](#4-dev-workflow).

See **[README.md](README.md)** for the full overview, MVP scope, tech stack, and feature list.

---

## 2. Repo Structure

See **[README.md → Project Structure](README.md#project-structure)**. The `docs/` ticket conventions (epics, stories, bugs, backlog, chores, recon) are defined in Sections 3–3e below.

---

## 3. How Features Are Built (IMPORTANT)

> **No story file → no code. No exceptions.** (Trivial, non-feature work that doesn't merit a story — e.g. a copy tweak or a rename — uses a **chore** instead; see [§3d](#3d-how-chores-are-tracked). Chores carry the _same testing bar_ as stories — only the ticket is lighter.)

1. Every new feature **must have a story file** created in `docs/story/` **before any code is written**.
2. Story files follow this format: user story sentence, **UI Mockup** (see item 6), **Acceptance Criteria** checklist, **Technical Notes**, **Testing Plan**, **Estimated Complexity**.
3. Stories are implemented **one at a time**, with the story file used as the spec.
4. **Never write code for a feature that does not yet have a story file.** If the user requests work without a story, draft the story file first, get approval, then implement.
5. **Every story must include a Testing Plan section that calls out which of the three test layers apply: unit, integration, and e2e.** Follow the 70/20/10 pyramid (the testing-foundation epic defines the tooling):
   - **Unit** — pure functions, helpers, prompt and option validation, upload validation (type, size, count), the job-status reducer, polling and backoff logic, history reducers, mocked handlers. Default: required for any new lib/helper or pure logic.
   - **Integration** — the app's API routes and server-side handlers against the **stub generation server** (a local, deterministic fake of the async job API — see [§4a](#4a-two-machines-the-mac-and-the-spark)), and persistence against a real local store. Default: required for any new API route or server-side handler.
   - **E2E** — Playwright against the production build (`build && start`) with the stub generation server. Default: required only when the story touches a critical user flow: submitting a prompt and seeing the job go from queued to running to a rendered result image, an edit with an uploaded reference image, cancelling a running job, reopening a finished generation from history, downloading a result.
   - If a layer is not applicable, the Testing Plan must explicitly say so and explain why. **"No tests needed" is not an acceptable answer without justification.**
   - **Write the Testing Plan so the owner can read it, not just the implementer.** Naming the layers is the floor, not the bar. For each applicable layer, name the test files (new or extended) and say in plain English what each case proves. For e2e, spell the scenario out step by step — the fixture, every stub script with its name, the user action, and each assertion — and **name the existing specs whose staying green covers the "unchanged" halves of the ACs**, so regression cover is part of the plan rather than a lucky accident. When a layer deliberately skips something, say what and why. The bar: the owner can read the Testing Plan alone and know what is proven, at which layer, and which test would catch each regression.
   - **A real-model check is not a test layer.** If a story genuinely needs to be exercised against the model on the Spark (generation time, output quality, a resolution limit), the Testing Plan lists it as a **manual verification step** with what to look for, and the story's Done note records the model, checkpoint and date it was checked. It never gates a push.
6. **Every story that adds or changes user-facing UI must include a `## UI Mockup` section**, placed near the top (after the user story / current state) and agreed **before** implementation, so the design is settled up front. In this project the mockup has two halves:
   - **The reference capture.** For any surface that exists on chat.qwen.ai, cite the recon screenshot(s) in `docs/recon/` the story is matching, and list the measured values the story commits to (font family and sizes, colours, spacing, radii, breakpoints, motion timing). A clone story with no capture cited is not designed — it is a guess at what the reference looks like.
   - **The ASCII sketch.** Sketch the layout in ASCII art for every state the capture does not show — empty, queued, generating with progress, done, failed, moderated, cancelled, narrow — and for anything we deliberately do differently (see [§6 rule 8](#6-key-rules)). For stories with no UI surface (backend, serving config, tooling, refactors), write the section as `UI Mockup: N/A (no UI change)` with a one-line reason. Chores follow the same rule when they touch UI.
7. A story is not **Done** until its Testing Plan tests are written, passing locally, and passing in the local gate ([§4](#4-dev-workflow)).
8. **An acceptance criterion written without reading the code it constrains will describe a product that does not exist — and it reads perfectly.** This is not a drafting-quality problem; a wrong AC is worse than a vague one, because it gets implemented. (Earned in an earlier project, where it bit twice in one session: one AC invented a navigation flow the middleware had already ruled out, and another was built on a page comment that had been stale for months.)

   **The rule:** before writing an AC that asserts where a click goes, what a page renders, or what a handler refuses, open the file that decides it. A comment is not evidence.

   **This extends past ACs to any claim about LIVE state, including one made in an analysis or an answer to the owner, where there is no test to catch it.** In this project, live state means three things:
   - **The reference UI.** What chat.qwen.ai does today is settled by re-opening the capture (or re-running the recon), not by memory of what it looked like last week. Their product changes; our screenshots are dated for a reason.
   - **The Spark.** Which model and checkpoint are loaded, how much memory is free, which serving stack and port answer — verified on the Spark _that session_ (`nvidia-smi`, the serving process, its health endpoint), never recalled from the README. `README.md` is a _description_ of state, never evidence of it.
   - **A model's terms.** What a license permits is read from the license file in the model's own repository, that session — never from a blog post, a tweet, or memory. The Qwen Research License was read on 2026-09-26; re-read it before any decision that leans on it.

   When the AC turns out wrong, **correct it in the story and say so** rather than quietly implementing something else; the next person reads the AC, not the diff.

---

## 3b. How Bugs Are Tracked

> Bug tickets live in `docs/bug/BUG_NNN_short_slug.md`. Use a **bug ticket** when existing behaviour is broken. Use a **story** when new behaviour is being added.

- Bug numbers are three-digit zero-padded: `BUG_001`, `BUG_002`, …
- Each ticket follows this format: **Summary**, **Steps to Reproduce**, **Expected vs Actual Behaviour**, **Root Cause**, **Acceptance Criteria**
- A bug ticket is not a substitute for a story — once a bug is understood and the fix requires meaningful new code, create a story that references the bug ticket
- Bug tickets are never deleted; mark them resolved by updating the **Status** field to `Resolved` and adding a **Resolution** note at the bottom
- **A visual mismatch against the reference is a bug, not a story**, once the surface has shipped: file it with the reference screenshot and ours side by side, and the measured delta.

---

## 3c. How Backlog Is Tracked

> Backlog items live in `docs/backlog/BACKLOG_NNN_short_slug.md`. Use a **backlog item** for potential work that is not yet clear or prioritized enough for implementation.

- Backlog numbers are three-digit zero-padded: `BACKLOG_001`, `BACKLOG_002`, …
- Backlog items should stay lightweight: summary, user impact, rough scope, dependencies, open questions, and priority
- Do **not** implement directly from backlog items
- Once an item is clear and prioritized, convert it to a `docs/story/STORY_NNN_*.md` file before any code is written
- After promotion to story, remove or archive the backlog item and link to the new story
- **Every out-of-MVP surface of chat.qwen.ai the owner mentions becomes a backlog item that session**, with a one-line pointer at whatever recon captured of it, and it stays in backlog until the MVP epic closes. Backlog is where the rest of the reference app lives so that it is neither built early nor forgotten.
- **When a backlog item lists SEVERAL remedies and the story ships only a subset, the item stays OPEN** with the delivered parts struck through. Archive it only when every listed remedy is built, or explicitly withdrawn with a written reason. Archiving on partial delivery is how a deferred half stops existing: in an earlier project an item listing two remedies was stamped delivered after the first shipped, and the gap the second remedy would have closed showed up in production three weeks later. **The deferral was correct; the archiving is what made it invisible.**

---

## 3d. How Chores Are Tracked

> Chore tickets live in `docs/chore/CHORE_NNN_short_slug.md`. Use a **chore** for small, low-risk work that doesn't warrant a full story — user-facing copy tweaks, renames, dependency bumps, config/tooling changes, doc-only edits, recon script maintenance, and non-behavioural refactors or cleanups.

- Chore numbers are three-digit zero-padded: `CHORE_001`, `CHORE_002`, …
- Keep the ticket lightweight. Only these sections are required: **Summary**, **Why**, a **Changes** checklist, and **Testing** (which of unit/integration/e2e apply, and why). No Acceptance Criteria or Estimated Complexity.
- **Same testing bar as a story — a chore is _not_ a way to skip tests.** The 70/20/10 pyramid and [§3 item 5](#3-how-features-are-built-important) still apply in full: every chore that touches runtime code ships with the applicable unit/integration/e2e coverage, "no tests needed" still requires justification, and every gate step ([§4](#4-dev-workflow)) must pass. The _only_ thing lighter about a chore is the ticket format, never the testing.
- **Chore vs. the rest:** use a **chore** when there's no new behaviour to spec and no acceptance criteria worth writing; use a **story** when the work adds or changes a feature/flow or needs acceptance criteria; use a **bug** ([§3b](#3b-how-bugs-are-tracked)) when existing behaviour is broken; use a **backlog** item ([§3c](#3c-how-backlog-is-tracked)) when the work isn't yet clear or prioritized.
- The `# CHORE_NNN — …` heading uses a plain-English title (same rule as stories — no raw symbols or jargon).
- Chore prose is frozen once done, exactly like stories: flip the checklist `[ ]` → `[x]`, but don't rewrite the description. **If scope grows beyond a trivial change, promote it to a story** before writing any more code.
- Commit chores with a `chore(CHORE_NNN): …` message.

---

## 3e. How Recon Is Recorded

> Recon artefacts live in `docs/recon/`. They are **the spec for every clone story**, so they are committed and dated, and they are never edited by hand — re-run the capture instead.

- **The image generation surface is captured first and completely.** Every state of the flow: the empty composer, image mode entered, a prompt typed, a reference image attached, each option control open, the submit, queued, generating with progress, done with the result shown, failed, moderated, cancelled, the download, and the history/gallery with one and with many entries. Other surfaces get a single screenshot and one line in the inventory only if it costs nothing extra; never spend a recon session on an out-of-MVP surface.
- **Curated captures are committed.** Screenshots of each surface and state, a cleaned DOM snapshot of each state (scripts stripped, account identity masked), the harvested assets (stylesheets, icons, fonts, brand images — see "Lift what renders" below), a measured-tokens file (colours, type scale, spacing, radii, shadows, breakpoints, motion timings), a component inventory, and interaction notes (what the network does on submit, how progress is delivered and how often it is polled, what the result payload contains, what cancel sends). Name them by surface and date so a story can cite one unambiguously.
- **Raw output is not.** Uncleaned DOM dumps, HAR files, JavaScript bundles, generated images from the reference, and anything containing a session cookie or auth header go to the gitignored recon output directory and stay there. The README names the paths.
- **Generations on the reference spend the owner's account quota.** Recon runs the minimum number of real generations needed to capture the states above, and the owner says how many before the session starts. Say the count in the recon notes.
- **Lift what renders; write what runs** (owner's decision 2026-09-26, replacing "recreate, don't lift"). The UI is copied, not re-derived: every stylesheet the app loads, the inline SVG icons, the logo and brand images, the font files actually loaded, and the cleaned markup of each state are harvested into `docs/recon/<date>/` and are what the clone builds from. The **behaviour is ours**: their compiled JavaScript is wired to their backend, their auth and Alibaba's anti-bot stack, so it is never copied or run — our code drives the lifted markup and CSS and speaks our job API. **The decision rests on the repo staying private and the use personal and non-commercial** (the same footing as the model license). Making the repo public or sharing the app re-opens it before that happens: their brand marks then become an impersonation question, not a copying one.
- **Recon is read-only and polite.** Browse the way a user would, at a user's pace; capture only the owner's own account and content; never probe endpoints that a normal session doesn't call. The reference sits behind Alibaba's anti-bot stack — if a capture run is challenged, stop and tell the owner rather than working around it.
- **The reference moves.** Every capture carries its date. A story implemented against a capture older than the latest one says which it used.

---

## 4. Dev Workflow

- **Always push to `develop` only — NEVER push to `main`.**
- **There is no CI (as of 2026-09-26).** The test gate is local. The testing-foundation epic adds a Husky pre-push hook that runs steps 1–6 below on every `git push origin develop`; until that hook exists, **run the steps by hand before every push** and say so in the summary. Deploying is a local act too: the UI runs on the Mac, the model runs on the Spark, and each is started by the scripts the README documents.
- **Before every commit, all seven steps must pass in order.** Cheapest checks first so failures surface in seconds, not minutes:
  1. `pnpm typecheck` (`tsc --noEmit`) — fastest; the real type gate.
  2. `pnpm lint` — the real lint gate, parallel to step 1.
  3. `pnpm test` (unit) — no build required.
  4. `pnpm test:integration` — against the stub generation server and a real local store; still no production build.
  5. `pnpm build` — compiles the app.
  6. `pnpm test:e2e` — Playwright against the built app (`pnpm start`) with the stub generation server.
  7. `git commit && git push origin develop` — only after all six steps above are green.
- **The coverage gate, once it exists, is repo-wide and can fail for reasons your change did not cause — measure before padding tests.** When it fails, rank files by missing branches from the coverage summary first. If your own files are already high, say so plainly rather than implying you caused it, then close the gap somewhere **defensible** — a module your feature genuinely depends on, not whatever is cheapest to pad. **Never lower the thresholds.** They ratchet up as coverage improves, never down, and that is not negotiable to get a push through.
- **`--no-verify` skips the whole net.** There is no second gate behind the local one. Emergencies only, with the justification written in the commit message.
- **Never commit or push if any step fails.** Fix locally, re-run from the failed step forward, then commit and push together.
- **Batch your work; push once.** The gate runs the full suite on every push (several minutes). Prefer one push carrying several logical commits over a push per commit.
- **Stage explicit paths. Never `git add -A`, `git add .`, or `git add <dir>/`.** This repo routinely holds in-progress tickets that belong to a _different_ piece of work — an epic being drafted while a story is being landed. A blanket add silently sweeps those into your commit and attributes them to it. Name what you are committing:
  ```bash
  git add app/lib/job-status.ts docs/story/STORY_004_*.md   # yes
  git add -A                                                # no
  ```
  `git status --short` before every commit, and read it. The cost of listing paths is seconds; the cost of a blanket add is someone else's work in your commit message. **This matters doubly here because the recon output directory, generated images, and the models directory must never be staged** — a blanket add puts session cookies, generated media, or tens of gigabytes of weights into git.
- Dev server runs on port 3000. Before starting, kill anything on that port:
  ```bash
  lsof -ti :3000 | xargs kill -9 2>/dev/null; true
  cd /Users/kevinbrown/Documents/GitHub/kevinbrowncodes/qwen/app && pnpm dev
  ```
- Confirm the server is running at http://localhost:3000 before proceeding.
- After every change, open the integrated browser at http://localhost:3000 so the user can verify visually. For clone stories, open the reference capture alongside it.
- Always prefer CLI tools (git, pnpm, ssh, playwright, huggingface-cli, etc.) over asking the user to do anything manually in a UI or dashboard. The one standing exception is the recon browser login — see [§4b](#4b-recon-with-playwright).
- **An AI assistant's shell does not read `~/.zshrc`.** Non-interactive zsh sources **`~/.zshenv`** only, so a secret or `PATH` entry exported in `.zshrc` is invisible to tooling even though it works fine in the user's own terminal. If a credential or tool "is definitely set" but the assistant cannot see it, check which file it is in before anything else.
- Always give a clear summary after making changes — what was changed, what commands were run, and what the outcome was.

### 4a. Two machines: the Mac and the Spark

- **The gate runs entirely on the Mac against the stub generation server.** The stub is a small local server that speaks the same async job protocol as the real one — create a generation, poll its status, fetch the result file — and returns scripted, deterministic outcomes chosen by name: a job that completes after N polls, one that fails, one that is moderated, one that is cancelled mid-way. Its result is a small committed fixture image. Every unit, integration and e2e test targets it. A test that needs the real Spark is not a test — it is a manual verification step ([§3 item 5](#3-how-features-are-built-important)).
- **The model endpoint is configuration, never a literal.** The UI reads the generation server's base URL and any key from environment variables the README names. The Spark's hostname does not appear in application code, tests, or fixtures.
- **A model's license is read before its weights are fetched.** The model epic records, for each candidate model, the license name, the commercial and territorial terms, and the date they were read from the license file in the model's own repository. Qwen-Image-2.1's license is **non-commercial only** — that constraint, and the owner's written decision about it, live in the epic and the README. A use the license does not permit is not a candidate, whatever its benchmarks say, unless the owner decides otherwise in writing in the epic.
- **On the Spark, read before you write.** Before starting, stopping or reconfiguring the serving process, check what is running and what it is using (`nvidia-smi`, the process list, disk free). Another job may be mid-download, mid-generation or mid-benchmark. A signal that looks like a known failure may have a different cause — confirm before restarting anything. **Never stop containers or services on the Spark to free memory; list what is running and ask the owner** (rule earned in the sibling project).
- **Weights are precious.** Model files are tens of gigabytes and take hours to fetch. Never delete, move or re-quantize a weights directory without the owner's explicit say-so in that session, and say which directory and size before doing it. Never commit weights, checkpoints, or anything under the models directory; they live on the Spark's disk and are gitignored. **Generated images never enter git either**, on both machines: every generator writes into a gitignored output directory (`recon/out/`, `generated/`, `outputs/`). The only images in git are the stub's tiny fixture, the curated recon captures, and the harvested reference assets under `docs/recon/` — which is why the ignore is by directory, not by extension.
- **Serving config is code.** The scripts and unit files that install the serving stack, fetch weights, and start the server live in the repo and are the record of how the Spark is set up — that is why the owner opens this repo on the Spark rather than configuring the box by hand. A change made by hand on the Spark that is not reflected in those scripts does not exist the next time the box is rebuilt — write it down the same session.
- **The Spark's unified memory is the budget, and the README states the current split** (weights + activations at the served resolution + headroom). Any change to model, checkpoint, precision or resolution re-derives that arithmetic in the story before it is tried on the box.

### 4b. Recon with Playwright

- **The owner logs in; the assistant never types credentials.** Recon runs a headed browser on a **persistent profile** stored at a gitignored path. The owner signs in to chat.qwen.ai once in that browser (whichever provider they choose); every later recon run reuses the saved session. If the session has expired, the recon script stops and asks the owner to log in again — it does not attempt the OAuth flow, and it never asks for a password or a 2FA code.
- **Never paste a live secret into the chat.** If one is exposed, rotate it immediately (revoke the old token at once rather than taking the grace window). Prefer having the user export the value themselves over quoting it back.
- **Never `echo` a credential at all — not even redacted.** To check whether one is set, test for presence and print nothing but the verdict:
  ```bash
  echo "token set: ${HF_TOKEN:+yes}"          # yes
  echo "$HF_TOKEN" | sed 's/hf_[A-Za-z0-9]*/<redacted>/'   # no
  ```
  A redaction pattern is a second thing that can be wrong, and when it is wrong it fails **open** — the secret is already in the transcript by the time you notice. The credentials this project touches are the recon browser profile (cookies), any SSH key to the Spark, the Hugging Face token used on the Spark for weight downloads, and any hosted-API key if the owner chooses that route. None of them belong in the repo, the transcript, or a HAR file.
- **The recon profile, cookies, storage state, and any HAR are gitignored from the first commit that creates them.** Check `git status --short` shows none of them before every recon commit.

### 4c. Lessons carried over

These are general and earned elsewhere (mostly in the sibling `minimax` project); they apply here unchanged.

- **A test that fails because it asserts the behaviour you just removed is EVIDENCE before it is a chore.** When a change turns tests red, sort them into "asserts an implementation detail I deliberately changed" and "asserts a behaviour a user can perceive." The second kind is a review comment from whoever wrote it, and it is usually the only one you will ever get. Ask "is the test right and am I wrong?" first, because it is the only question whose answer changes what you ship.
- **Behaviour that looks like a bug may be a shipped policy no surface exposes — find the rule that decides it before hunting for a hole.** Read the gate, then run it against the real stored values rather than reasoning about it. A five-line test that prints the decision settles in one run what theories cannot. And if a policy can silently change what the user gets, something in the product must be able to state it.
- **A fix that REMOVES something from one surface must be checked against its siblings for the compensating mechanism.** When a filter is added to close a leak, something must put the filtered rows back for the people entitled to them; if only one of two parallel surfaces gained that half, the other now enforces a stricter rule than anyone intended — and nothing fails, so nothing tells you.
- **A write must START before the local state is applied, and a navigation cancels an in-flight request.** Send first, paint second. Typecheck, lint, unit, integration and the build are all blind to the wrong order; only e2e can see it. A history entry or gallery tile that comes back missing right after an action the UI clearly accepted is this until proven otherwise.
- **Attribute a failure with an A/B before fixing it.** When a gate fails inside a story's push, run the failing spec against a stashed baseline before deciding it is the story's regression. Three runs (fail, pass, baseline-pass) settle nondeterminism in minutes; reasoning about the diff is a guess.
- **A capture script must know the reference's failure states by their exact wording.** In the sibling project, quota and billing walls arrived as agent prose over HTTP 200, and a detector that paraphrased them ("insufficient credits" for "insufficient account credits") polled for minutes past a terminal failure. Match the observed wording, capture the failed state as its own artefact, and stop cleanly.

---

## 5. Stack Reference

See **[README.md → Tech Stack](README.md#tech-stack)** and **[README.md → Running the Model](README.md#running-the-model)** (which documents the serving stack, the model and checkpoint currently on the Spark, its license status, and how the UI is pointed at it).

---

## 6. Key Rules

1. **Always read the relevant story file before writing any code.** The story is the spec.
2. **Never modify a story file's content after it has been implemented.** Acceptance criteria checkboxes may be flipped from `[ ]` to `[x]`, but the prose stays frozen. New requirements → new story.
3. **When adding a new story, follow the `STORY_NNN_short_slug.md` naming convention.** Three-digit zero-padded numbers. Snake_case slugs. **Story numbers must match the implementation order within their epic** — when drafting multiple stories at once, assign numbers in the order they will be tackled, not the order they were written. The lowest-numbered story is always the first to ship. If priorities shift, renumber the unimplemented stories before any code is written. **The `# STORY_NNN — …` heading and epic `# EPIC_NNN — …` heading must use plain-English titles that a non-engineer can understand at a glance — no raw function names, no jargon acronyms, no backtick-wrapped symbols in the title.** Good: `"A finished image appears in place without leaving the page"`. Bad: `` "`pollJobStatus` backoff and terminal states" ``.
4. **Never block the UI thread.** Generation is a long-running async job: submitting returns immediately, progress arrives by polling or a push channel, and the page stays responsive throughout — the composer, the history, and viewing earlier results all keep working while a job runs. Cancel must abort the job cleanly on both sides (UI and server) and leave history consistent: the cancelled job is either shown as cancelled or removed — the story decides, and the test proves it.
5. **Test one story at a time.** Never implement multiple stories in a single session. Land one, verify it works, then start the next.
6. **No `any` types; avoid type assertions unless absolutely necessary.** `strict: true` from the first `tsconfig.json` — this is a new repo, so there is no legacy to excuse it.
7. **Every story _and chore_ ships with tests.** Unit, integration, and e2e per the 70/20/10 pyramid — see Section 3 and the testing-foundation epic. A change with new code and no tests is incomplete. Chores use a lighter ticket format ([§3d](#3d-how-chores-are-tracked)) but the **same** testing bar.
8. **Fidelity to the reference is the acceptance bar for clone stories.** The story cites the capture it matches ([§3 item 6](#3-how-features-are-built-important)), and Done means ours and theirs sit side by side with the measured deltas listed. Their markup, CSS and assets are lifted; the code that runs them is ours ([§3e](#3e-how-recon-is-recorded)). Deliberate departures — an option that only makes sense against their cloud, a limit the local model imposes, an improvement the owner asked for — are written in the story under **Departures from the reference** with the reason, so the next person can tell a choice from a miss.
9. **Verify at the width the capture was taken, then at the narrow width.** The reference has a mobile-first identity (its logged-out fallback page literally says it is designed for mobile), so the narrow layout is not an afterthought here: the story sketches both widths and the e2e renders both. Use a device descriptor (`devices["iPhone 13"]`), never a bare `setViewportSize`: width alone gives no `hasTouch`, so the branch under test may not be the branch that renders. **Anything measured must settle first** — a probe that measures through a slide or fade produces false defects, and a false defect costs more than a missed one, because somebody fixes it. Touch targets are ≥44px on touch branches.
10. **The model is a dependency, not a fixture.** No test, story AC, or example in the repo may depend on a particular generated image or its look. Outputs are nondeterministic and the model will change; the stub's fixture image is the only output a test may assert on.
11. **MVP scope is the image generation flow — text-to-image and editing with references.** Do not draft, estimate, or build anything outside it until the MVP epic is Done. When the owner mentions another surface, write the backlog item that session ([§3c](#3c-how-backlog-is-tracked)) and say that is what you did.

---

## 6b. E2E Test Conventions

- **The e2e suite runs against the stub generation server, and the stub is started by the Playwright config, not by hand.** A spec that needs a particular outcome (a job that takes several polls, a failure, a moderated prompt, a cancel mid-way) selects it through the stub's scripting interface, named in the spec, so the scenario is readable without opening the stub.
- **Job assertions wait for the terminal status response, never a sleep.** Register a `waitForResponse` on the status endpoint returning `done` (or `failed`, or `cancelled`) **before** the click that submits, then assert the rendered result. `page.waitForTimeout` after a submit is the smell: in isolation the job lands inside the sleep and everything passes, under full-suite load it doesn't, and the failure surfaces in the _next_ test.
- **A test must not END with a job still running.** It is a landmine for whatever runs next, and it detonates somewhere else. If a spec submits a generation, it waits for the job to reach a terminal state or for its own cancel to be acknowledged before it returns — even when the spec's own assertion doesn't need the result. The stub exposes a reset so a spec can guarantee that.
- **A fixture must not RETURN with a request in flight — same defect, one level up.** Register the waiter before the navigation, target the one request rather than `networkidle`, and bound it so a fixture can never hang the gate.
- **A finished result is asserted through the image element's load state, not its pixels.** Wait for the result `<img>` to report `complete` with a non-zero `naturalWidth` (or the `load` event) and for its source to be the result URL. Do not screenshot-diff the image; do not assert its dimensions beyond what the fixture file actually is.
- **Uploads use a committed fixture image, and a spec that uploads asserts the server received it** (the stub records what it was sent) rather than only that the thumbnail appeared.
- **`page.waitForRequest()` must be set up before `page.goto()`** — it only listens for requests fired after the promise is created. Setting it up after navigation will miss fetches that fire on mount.
- **Build-time-inlined env vars must be explicitly passed in `playwright.config.ts` `webServer.env`.** They are not inherited from the shell when Playwright runs the build. If a client component guards on one (`if (!baseUrl) return`), it will silently bail out during e2e unless the var is present in the build environment.
- **Never assert an exact count against data the test didn't create.** Assert the cap or range the AC actually specifies, never a fixed number. **A fixed calendar DATE rots the same way** and fails on a day nobody is expecting: derive dates from the clock and write the shelf life down at the constant.
- **E2E runs a _production_ build, so React StrictMode double-mount bugs are invisible to it.** The dev server double-invokes effects; a production build never does. An effect that schedules timers and is torn down by that simulated remount can freeze a component on its first frame **in dev only** while the entire e2e suite stays green. **Guard effect-driven sequences (progress polling, history auto-refresh, showing the result on completion) with a jsdom component test that renders inside `<StrictMode>` and drives fake timers.** Decide-once state belongs in a ref; timers are (re)scheduled on _every_ effect setup and cleared on _every_ cleanup.
- **A spec's whole-test ceiling must exceed the sum of the budgets its own fixtures declare.** A full-suite-only timeout with the page CORRECTLY RENDERED is under-sizing, not a product bug: size the ceiling with `test.slow()` and the arithmetic in a comment; leave every per-step fixture budget untouched so a genuinely hung step still fails fast. **Triage rule:** sort a full-suite-only e2e failure by what it failed ON — wrong _data_ is the unfinished-job class (look at the previous tests' submits); out of _time_ with correct data on screen is this class.
- **Search the fixtures directory for the verb before writing the arrangement inline.** A deterministic fixture that already exists is the one to use; an inline re-implementation reintroduces the flake its header warned about.
- **Source-text guards are regexes over raw source and cannot tell prose from markup.** If a test reads files as text to enforce a rule, a comment that names a tag in angle brackets can trip it. Say such things in words, never in brackets.
- **Visual comparison against the reference is a review aid, not a gate.** Screenshot assertions against the recon capture drift with fonts and rendering; use them to produce a side-by-side for the story's Done note, not as a pass/fail step in the suite.

---

## 7. End-of-Session Checklist

> Adapted from the sibling project's checklist. Run it before the summary, every session.

1. **Every gate step is green** ([§4](#4-dev-workflow)), run in order, and the summary says which steps ran and whether the hook or a hand-run did it.
2. **The ticket reflects reality.** Checkboxes flipped, Status updated, the Done note written (for clone stories: the side-by-side and the deltas; for anything touched by the model: the manual verification with model, checkpoint and date). Prose untouched.
3. **Every claim about live state in the summary was verified this session** — the reference by re-opening the capture, the Spark by looking at the Spark, a license by reading the license file. If something was described from the README instead, say so in the summary rather than presenting it as checked.
4. **README.md is updated if any project fact changed** — stack, structure, the model or checkpoint on the Spark, its license status, ports, env var names, how to run anything. CLAUDE.md changes only when a _process_ lesson was learned, and the lesson goes in as a rule with its reason, not as a diary entry.
5. **Nothing secret or heavy is in the transcript, the diff, or the recon output.** `git status --short` shows no profile, cookies, HAR, generated media, or weights; nothing was echoed.
6. **Explicit paths were staged**, and the commit message names the ticket (`feat(STORY_NNN)`, `fix(BUG_NNN)`, `chore(CHORE_NNN)`, `docs(EPIC_NNN)`).
7. **Pushed to `develop`**, never `main`.
8. **Anything the owner mentioned outside the MVP has a backlog item**, and the summary lists them.
9. **The summary stands on its own:** what changed, what commands ran, what the outcome was, and what is next — written for someone who did not watch the session.
