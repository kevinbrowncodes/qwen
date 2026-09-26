# STORY_001 — The owner signs in to the reference once and every recon run reuses that session

**Epic:** [EPIC_001](../epic/EPIC_001_the_reference_image_generation_flow_is_captured_as_a_spec.md)
**Status:** In progress — awaiting the owner's login
**Created:** 2026-09-26

As the owner, I want to sign in to chat.qwen.ai once, in a browser the recon scripts control, so that every later capture runs against my account without the assistant ever handling my credentials.

## Current state

Nothing exists. An unauthenticated headless desktop visit on 2026-09-26 shows a top bar with a **New Chat** icon control and the model selector on the left and **Log in** / **Sign up** buttons on the right, a centred composer ("Ask Qwen"), and no modal or overlay. A non-browser client is served a mobile-app download page instead, so every script must present as a real desktop browser.

## UI Mockup

N/A (no UI change in our product). The only screens involved are the reference's own sign-in flow inside a Chromium window the script opens. What the owner sees in the terminal:

```
$ pnpm recon:login
A Chromium window is opening on https://chat.qwen.ai/.
Sign in there with your Qwen account. This script never reads what you type.
Waiting for the session to read as signed in (up to 10 minutes)…
Signed in. The session is saved in recon/.profile/ (gitignored). You can close this.

$ pnpm recon:check
session: signed-in
```

## Acceptance Criteria

- [ ] `pnpm recon:login` opens a **headed** Chromium on the reference using a **persistent profile at `recon/.profile/`**, prints the instructions above, polls until the session reads as signed in (up to 10 minutes), then closes the browser so the profile is flushed, and prints that it is signed in. On timeout it says so and exits non-zero.
- [ ] `pnpm recon:check` opens the reference **headless** with the same profile and prints exactly one of `session: signed-in`, `session: signed-out`, `session: unknown`, exiting 0 / 1 / 2 respectively.
- [ ] Signed-out is detected by a visible control whose text is exactly "Log in" on the reference origin (observed 2026-09-26). Absence of that control on a **rendered** reference page (the New Chat control is visible) reads as signed in; a page that has not rendered, or is not on the reference origin (e.g. mid-OAuth on another site), reads as unknown.
- [ ] The login loop requires several consecutive signed-in readings before trusting the verdict, and prints each state change so the owner can see it is still waiting. (Rule earned in the sibling project: a still-loading page has no "Log in" control and once read as signed in, closing the window before the owner had signed in.)
- [ ] Neither script types into any form, reads a cookie value, or prints a cookie name, a token, or a URL with a query string. `recon/.profile/` and `recon/out/` are gitignored and `git status --short` shows neither after a login and a check.
- [ ] Root `pnpm typecheck` and `pnpm test` exist, cover the `recon` package, and pass.

## Technical Notes

- Playwright 1.63 in a `recon` workspace package; `chromium.launchPersistentContext(PROFILE_DIR, { channel: "chromium", … })` so the headed login and the headless check use the **same browser binary** and therefore the same profile format. Node runs the TypeScript directly (no tsx — lesson from the sibling project's CHORE_001).
- The session classifier is a pure function over three signals — the page's final URL, whether the home has rendered (the New Chat control is visible), and whether the "Log in" control is visible — so it is unit-tested without a browser. **The signed-in signal is inferred from the logged-out capture only** (no "Log in" control on a rendered page ⇒ signed in). The first authenticated run confirms what actually replaces that control; if a tighter signal exists (an avatar, an account menu), STORY_002 records it and tightens the classifier under its own AC.
- The "home rendered" signal and the consecutive-confirmation loop are carried over from the sibling project's STORY_001, where their absence produced a false "Signed in" on a still-loading page. They are built in from the start here rather than re-learned.
- No first-visit modal was observed logged out (2026-09-26), so the scripts carry no dismissal logic. If the signed-in home shows one, STORY_002 records it and adds the dismissal under its own AC.
- The login loop tolerates navigation off-origin during an OAuth hop (reads as unknown, keeps polling) and evaluation errors while a page is mid-navigation.
- Nothing prints a URL: the check prints only the verdict.

## Testing Plan

- **Unit** — `recon/src/session.test.ts`: `classifySession` returns `signed-out` when the Log in control is visible on a rendered reference page; `signed-in` when it is not; `unknown` when the page has not rendered (whatever the control says), on a different origin (an OAuth provider mid-flow, qwen.ai marketing pages), and on an unparsable URL; the reference origin with a path or trailing slash still counts as the reference. `countConfirmation` grows only on consecutive signed-in readings and resets on anything else. `exitCodeFor` maps the three states to 0/1/2. These prove the only logic that decides the verdict.
- **Integration** — N/A. The only thing to integrate with is a third-party site behind a login; putting it in the gate would hit their service on every push and needs a live session the gate cannot have ([CLAUDE.md → §3e](../../CLAUDE.md#3e-how-recon-is-recorded), read-only and polite).
- **E2E** — N/A, same reason. **Manual verification** (recorded in Done): the owner runs `pnpm recon:login`, signs in, then runs `pnpm recon:check` and reports the one-line verdict. Then `git status --short` shows no profile.

## Estimated Complexity

S — two scripts, one pure module, one test file.
