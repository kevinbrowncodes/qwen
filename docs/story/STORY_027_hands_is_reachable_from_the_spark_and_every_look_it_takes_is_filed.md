# STORY_027 — Hands is reachable from the Spark, and every look it takes is filed on the Spark

**Epic:** [EPIC_006](../epic/EPIC_006_the_reference_is_captured_again_through_hands_starting_with_a_chat_that_holds_several_images.md)
**Status:** Done (2026-10-13): code and gate. Approved by the owner on 2026-10-13 ("please proceed with completing the epic"). The manual preflight against the real Hands waits for the owner's token in `.env` and is the first thing STORY_028 does
**Created:** 2026-10-13

As the assistant driving recon from the Spark, I want one command in the recon container that takes a single look or a single act through Hands and files what comes back under the date's output folder, with Hands' token read from the gitignored `.env` and never shown, so that STORY_028's capture is a sequence of commands whose every picture I read before choosing the next step, and nothing is lost when Hands forgets a look.

## Current state

Read on 2026-10-13:

- **The recon tooling** is `recon/run.sh` (`login`, `check`, `test`, `typecheck`, and `curate`, `harvest`, `interactions` with a date), which runs `recon/src/<script>.ts` with plain `node` inside the Playwright image defined by `recon/compose.yaml` (CHORE_001). The container mounts the repo and the Spark's X socket; it is given no LAN name and no `.env`. `recon/src/config.ts` names `OUT_DIR` as `recon/out/`, which is gitignored. Nothing in `recon/` speaks to Hands.
- **The secret pattern is CHORE_005's.** `spark/fetch-loras.sh` mounts the repo's `.env` read-only into its container as `/tokens/env` and passes `ENV_FILE`; the shell never reads the file. `envValue()` and `readEnvToken()` in `spark/model-server/src/fetch-loras.ts` parse one `NAME=value` line, strip quotes, execute nothing, and the CLI prints only "Civitai key: found in .env" or "none". `.env.example` documents the file's shape. There is no `HANDS_*` variable anywhere.
- **`hands.local` resolves on the host, not in a container.** The Spark's `/etc/nsswitch.conf` has `mdns4_minimal`, so `getent hosts hands.local` gives 192.168.1.30. A plain Alpine container could not resolve the name; the same container started with a host entry for it resolved the name and read Hands' `/health` (both tested 2026-10-13).
- **Hands' API, as deployed (1.16.2, commit `f85c70a`):**
  - `GET /health` (no token): version, commit, template, jobs, held, skills.
  - `GET /api/hand` (token): `configured`, `ok`, `reason`, and the hand's health: `trusted: {accessibility, screen_recording}`, `mac`, `display`, `keyboard: {full_keyboard_access}`, `frontmost`.
  - `POST /api/hand/look` (token) `{"app": "Safari" | null, "max": 400}` → `{id, taken_at, frontmost, focused, width, height, scale, elements, count, screenshot_url, marked_url}`. An element is `{n, role, title, value?, frame: [x, y, w, h] (points, integers), actions, focusable}`. The pictures are the whole screen at the display's scale, served at `/hand/looks/<id>.png` and `<id>.marked.png`. **Hands keeps the newest 50 looks and deletes the rest.**
  - `POST /api/hand/act` (token) `{"do": press | set | increment | decrement | scroll | focus | type | key | open | wait | fill, "look", "n", "text", "key", "app", "url", "role", "title", "seconds" ≤ 30}` → `{ok, id, do, did, look}`. Element acts name a look's id and an element's `n`. Hands' refusals pass through as 408 (a wait ran out), 409 (the look is no longer held, or has no such element) and 422 (a bad body); anything else from the hand is 503 (a missing grant, no window, an app not running); the app itself answers 401 without the token.
  - Key names are macOS's (`return`, `tab`, `escape`, `delete`, `home`, `end`, `pageup`, `pagedown`, the arrows, letters and digits) with chords such as `cmd+l` and `cmd+shift+g` (`native/hand/keys.py`).
- **`recon/src/offline.test.ts`** reads the sources of `curate.ts`, `harvest.ts` and `interactions.ts` and every local module they import, and fails on `fetch(`, the node network modules, `playwright`, `XMLHttpRequest` and `WebSocket`. A new online module must stay out of those three closures.
- **Tests:** `recon/run.sh test` runs recon's Vitest suite in the container, and the root `pnpm test` runs the same suite as part of the gate (`--filter recon`). There are 13 test files today.

## UI Mockup

N/A (no UI change; the deliverable is a command and the files it writes). What lands, all gitignored:

```
recon/out/<date>/hands/
  NN-<state>@<width>.json         the look: id, taken_at, frontmost, focused, width, height, scale, elements,
                                  plus the step's name, the asserted width, the act that produced it (text as a
                                  length) and Hands' version and commit
  NN-<state>@<width>.png          the screen
  NN-<state>@<width>.marked.png   the screen with every element's number drawn where it is
  NN-<state>@<width>.wait1.json   (and .png) an intermediate look, when a wait longer than 30 s was split
  acts.jsonl                      one line per command: when, the act (text as a length), the outcome, the files
```

`NN` is a two-digit step number the command assigns itself, the next free one in the folder, so a second session of the same date never overwrites the first.

## Acceptance Criteria

- [x] **The command.** `recon/run.sh hands <DATE> preflight`, `… look [--app <name>] --as <state>@<width>`, and `… act '<json>' --as <state>@<width>` run `recon/src/hands.ts` inside the existing recon container. Nothing is installed on the Spark. `<DATE>` is validated as the other dated commands are; `<state>` is `[a-z0-9-]` and `<width>` an integer, the same grammar as the 2026-09-26 readings' file names.
- [x] **The token and the URL come from `.env`, through the container, never through the shell.** `run.sh` mounts the repo's `.env` read-only at a fixed path and names it with `HANDS_ENV_FILE` (an empty file when `.env` is absent, so the mount never creates a directory). The script reads `HANDS_API_TOKEN` and `HANDS_URL` (default `http://hands.local`) from that file with a copy of CHORE_005's one-line parser: quotes stripped, nothing executed, other lines ignored. It prints exactly one of "Hands token: found in .env" or "Hands token: none", and on none it exits 2 before any request. The token travels only as the `Authorization` header of `/api/*` requests; it is never written to a file, a log line, an error message or `acts.jsonl`, and a test proves it.
- [x] **The name is resolved on the host and handed to the container.** `run.sh hands` resolves `hands.local` with `getent hosts` and passes the address into the container as a host entry (`extra_hosts`), because the container cannot resolve `.local` names. `HANDS_HOST=<address>` on the command line overrides the lookup. When neither gives an address, `run.sh` stops before starting the container with a sentence that says Hands or the Spark's mDNS is the thing to check. `run.sh` reads nothing from `.env`.
- [x] **Every look is saved at once, in full.** Each look Hands returns, whether from `look`, from an `act`, or as an intermediate of a split wait, is written as the three files above before the command prints anything about it: the look's JSON as Hands gave it, with `step`, `state`, `width` (as asserted), `act` (redacted as in the next item) and `hands: {version, commit}` from `/health` added; and both PNGs fetched from `screenshot_url` and `marked_url`. The reason is Hands' 50-look retention; the JSON says so in a `_note` field.
- [x] **Typed text is logged as a length.** The `act` recorded in the look's JSON and in `acts.jsonl` is Hands' own redaction: every field except `text`, and `text_length` in place of `text`. So a typed prompt, a typed path and a typed URL are never in the raw output twice (once on screen in the picture is enough).
- [x] **A long wait is split, never slept.** `act '{"do":"wait", … "seconds": N}'` with N above 30 is sent as successive waits of at most 30 s each, until one succeeds or the total is spent. A 408 on a chunk continues to the next chunk; a 408 on the last chunk is reported as Hands worded it and exits 1. Every intermediate look is saved with a `.waitK` suffix. No chunk is ever a local sleep.
- [x] **Printing is for choosing the next act.** After each saved look the command prints: the files written; the front app and the focused element; the frames of the front window and of the web area (`AXWindow`, `AXWebArea`) when the look has them; and one line per element (`n`, role, title and value cut to 40 characters, frame). The marked picture is what the assistant opens; the table is what it reads when the picture is unambiguous. Nothing printed contains the token.
- [x] **Hands' refusals are Hands' words.** A 401, 408, 409, 422 or 503 from Hands is printed as the `detail` sentence Hands gave, with the HTTP status, and the command exits 1; the refusal is recorded in `acts.jsonl`. A connection failure prints the URL tried (no header) and exits 1. A misconfiguration (no token, a bad date, unparsable JSON, an unknown subcommand, a missing `--as`) prints the usage and exits 2. Nothing else is written on a refusal.
- [x] **Preflight says what is there, and never claims more.** `preflight` prints Hands' version and commit from `/health`, then from `GET /api/hand`: `ok`, both grants, `keyboard.full_keyboard_access`, the display and the front app; it exits 1 with the `reason` when `ok` is false. Then it takes one look of Safari (`"app": "Safari"`), saves it as `NN-preflight@<width>` with the width from the web area's frame, and reports **signed-out** (exit 1) when the look holds a button titled `Log in` or `Sign up`, which is what the reference's logged-out page shows (EPIC_001, 2026-09-26); otherwise it reports **not signed out: read the picture**. It does not claim to detect a challenge or a quota wall, because none has been observed and a detector must match observed wording ([CLAUDE.md → §4c](../../CLAUDE.md#4c-lessons-carried-over)).
- [x] **The client can only reach Hands.** Every request the script makes goes to `HANDS_URL`. A source test asserts that `hands.ts` and the modules it imports never name `chat.qwen.ai`, `qwen.ai` or `REFERENCE_URL`, so the recon client can never be pointed at the reference itself. The three offline entries in `offline.test.ts` stay offline: none of them imports the new modules, and the test stays green.
- [x] **Documentation.** README's "Running Recon" gains the three Hands commands, the `.env` variables and the raw-output layout; `.env.example` gains `HANDS_URL=` and `HANDS_API_TOKEN=` with a comment that the value is `API_TOKEN` from Hands' own `.env` on the Mac. **CLAUDE.md is not changed by this story**; the one-line addition to §4b proposed in EPIC_006 (open question 5) is put to the owner separately when this story lands.
- [x] **Gate.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass at the root, and `recon/run.sh typecheck` and `recon/run.sh test` pass in the container.

## Corrections before implementation (2026-10-13)

Made on reading Hands' code again before writing any ([CLAUDE.md → §3 item 8](../../CLAUDE.md#3-how-features-are-built-important)):

- **A wait that runs out returns no look.** Hands answers a 408 with a sentence and nothing else, so there is no intermediate look to save from the chunk itself. On a 408 before the last chunk the client takes a plain look, saves it with the `.waitK` suffix, and waits again; that is what "never blind" means in practice.
- **The whole answer of an act is kept, not only its look.** Hands' answer (`ok`, `id`, `do`, `did`, and any field a later act kind adds, such as a result) is saved in the look's JSON under `answer`, or as `NN-<state>@<width>.act.json` when the act returned no look. The client validates nothing about `do` beyond its being a non-empty string, so an act Hands gains later passes through unchanged and Hands' own 422 is the answer for an unknown one. EPIC_006's Hands additions (an evaluation act, a hover act) will need no change here.
- **The preflight's own message says "the reference", not the host name**, because the source guard in this story forbids the client from naming it anywhere.

## Technical Notes

- **Files.** `recon/src/hands.ts` is the entry: argument parsing and the order of operations, kept thin. `recon/src/hands-client.ts` is the pure part, tested with a fake `fetch`: request builders, response validation (type guards; no `any`, no assertions), the wait splitter, the redaction, the file naming (next free `NN`), the element table, and the signed-out check. `recon/src/env-file.ts` is CHORE_005's `envValue` copied with its tests, because `recon/` is its own workspace package with its own container install and must not import from `spark/model-server/`. `recon/compose.yaml` gains `extra_hosts` and the `.env` mount; `recon/run.sh` gains the `hands` command, the lookup and the `/dev/null` fallback it already uses for the X auth file.
- **Types.** `Look`, `Element` and `ActRequest` (a union discriminated on `do`) are declared from Hands' contract above. `width`, `height` and `scale` are kept so a later step can convert points to pixels: the picture is `width × height` pixels at `scale`, and frames are in points.
- **No new dependency.** Node's `fetch` and `fs`. The container already runs TypeScript directly with `node src/<script>.ts`, as `curate` does.
- **Why not one long-running session.** Each command is one `docker compose run`, which costs a few seconds for the pnpm install check with a warm cache. For a capture of 60 to 90 steps that is minutes, not hours, and it keeps every step a plain command the assistant can see, repeat and reason about. A persistent process would save seconds and cost a protocol.
- **Size.** A full-screen PNG at 1920 × 1080 × 2 is a few megabytes, twice per look; a capture of 90 looks is on the order of half a gigabyte in `recon/out/`, which is gitignored and on the Spark's disk. The README says so.
- **Hands is not changed.** Everything here is on our side of its API. If the capture turns out to need something Hands lacks, that is a ticket in the Hands repo, named in STORY_028's log.

## Testing Plan

- **Unit** (`recon/run.sh test`, and the root `pnpm test`):
  - `recon/src/hands-client.test.ts`, with a fake `fetch` that records requests and serves canned looks, acts and `/health`:
    - every `/api/*` request carries `Authorization: Bearer <token>`; `/health` and the picture fetches do not need one;
    - the token appears in no written file, no returned log line and no error message, checked by searching everything the client produced for the token string;
    - with no token the client returns the "none" verdict and exit code 2 without having made a request;
    - a look is written as `NN-<state>@<width>.json`, `.png` and `.marked.png`, with `NN` the next free number when files `01` and `02` already exist;
    - the JSON carries `step`, `state`, `width`, `act` (with `text_length`, never `text`) and `hands.version`; `acts.jsonl` gains one line with the same redaction;
    - a wait of 70 s becomes three waits of 30, 30 and 10 s; a 408 on the first continues; a 408 on the last reports Hands' sentence with exit 1; a success on the second stops there and saves two looks;
    - a 409 and a 503 surface Hands' `detail` and exit 1; a refused act writes only the `acts.jsonl` line;
    - the element table cuts a 60-character title to 40 and prints the frame;
    - the preflight reports signed-out for a fixture look with `Log in` and `Sign up` buttons, and "not signed out" for a fixture with the sidebar's `New Chat` and no such buttons.
  - `recon/src/env-file.test.ts`: `HANDS_API_TOKEN=abc` gives `abc`; quotes are stripped; a commented-out line, an empty value and a missing key give none; other variables are ignored; `HANDS_URL` is read the same way.
  - `recon/src/hands-client.test.ts` also holds the source guard: the sources of `hands.ts` and its local imports contain neither `chat.qwen.ai` nor `REFERENCE_URL`.
  - `recon/src/offline.test.ts` is unchanged and stays green: `hands.ts` is in none of the three offline closures.

  Together these prove every rule that decides what reaches Hands and what lands on disk, which typecheck and lint cannot see.
- **Integration:** N/A. The only external service is Hands on the Mac, and a test that needs another machine is not a test ([CLAUDE.md → §4a](../../CLAUDE.md#4a-two-machines-the-mac-and-the-spark)). The fake `fetch` stands in for it, down to its status codes and `detail` sentences.
- **E2E:** N/A. The app does not change, so no spec is added and every existing spec is unaffected.
- **Manual, against the real Hands (not a gate), with the owner's steps 1 and 2 from EPIC_006 done:**
  1. `recon/run.sh hands <date> preflight`: the version matches `/health`, both grants read true, and the verdict is "not signed out" with Safari on the signed-in home. If it reads signed-out, the owner signs in and it is run again.
  2. `recon/run.sh hands <date> look --app Safari --as home-signed-in@<width>`: the marked picture is opened and read, and the width asserted matches the web area's frame.
  3. `git status --short` shows nothing under `recon/out/` and no `.env`.

## Estimated Complexity

M: one thin entry, two pure modules, changes to `run.sh` and `compose.yaml`, two test files, and the README.

## Done (2026-10-13)

- **Gate:** all six steps green, run by hand through `tools/gate/run.sh` in 155 s: typecheck, lint, unit (gate 9, stub 69, recon 137 in 15 files, model server 109, app 185), integration 22, the build with the production image, and e2e 79 passed (13 skipped, as always). The pre-push hook ran the same gate on the push.
- **Tests added:** recon's suite went from 111 to 137. `recon/src/hands-client.test.ts` (22 cases: the bearer on `/api/*` only, the token in no file or line, the "none" verdict with no request, the three files per look with the next step number, the redaction, the split wait with its intermediate look, the last chunk's 408, a 409 and a 503 in Hands' words, the preflight's verdicts and its stop on a hand that is not ready, and the source guard) and `recon/src/env-file.test.ts` (4 cases). `offline.test.ts` stayed green with `hands.ts` outside its closures.
- **What landed:** `recon/src/hands.ts`, `hands-client.ts` and `env-file.ts`; `recon/run.sh hands` with the host lookup and the `.env` mount; `recon/compose.yaml`'s host entry and mount; README's "Through Hands" section and env-vars sentence; `.env.example`'s two variables.
- **Verified on 2026-10-13:** a container with the host entry resolves `hands.local` and reads Hands' `/health` (1.16.2, `f85c70a`); a plain container cannot. `.env` exists on the Spark (mode 600) and holds no `HANDS_API_TOKEN` yet.
- **Not yet run:** the manual preflight and smoke look against the real Hands, because the token is not on the Spark. They are STORY_028's first step, and the first real picture is read there.
- **CLAUDE.md:** unchanged. The one-line addition to §4b (EPIC_006, open question 5) is put to the owner separately.
