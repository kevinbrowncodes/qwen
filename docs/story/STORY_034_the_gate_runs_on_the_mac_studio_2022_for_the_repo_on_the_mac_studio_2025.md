# STORY_034 — The gate runs on the Mac Studio 2022 for the repo on the Mac Studio 2025

**Epic:** [EPIC_007](../epic/EPIC_007_the_app_runs_on_the_mac_studio_2022_and_draws_on_the_mac_studio_2026.md)
**Status:** Done (2026-10-20). Approved by the owner on 2026-10-20 (through the picker: "Approved, fix BUG_016 next"), built that night under the owner's overnight authorisation, after BUG_016.
**Created:** 2026-10-20. Numbered 034 because it is EPIC_007's first story. It ships after [BUG_016](../bug/BUG_016_the_gates_typecheck_fails_on_every_jest_dom_matcher.md): the gate fails at step 1 today, and this story is not Done until a full gate run is green.

As the owner, I want the repo on my Mac Studio 2025 checked by the same six gate steps before every push, run on the Mac Studio 2022's Docker, so that I can keep the repo where I work without installing Docker here, and nothing reaches `develop` without passing the gate.

## Current state

Read on 2026-10-20:

- **The gate runs on the machine that holds the repo.** `tools/gate/run.sh` runs each step with `docker compose run --rm --no-deps -T gate` against `compose.yaml`, which bind-mounts the repo root (`.:/work`). Step 5 also builds the production image (`compose build app`, BUG_003). The image `qwen/gate:1.63.0-node26` is built by `tools/gate/build.sh` with the host user's uid and gid, and `run.sh` stops if it is missing.
- **The pre-push hook** (`.husky/pre-push`) runs `${GATE_RUN:-$root/tools/gate/run.sh}`, with no arguments, when a ref is pushed to `develop`, and refuses the push if the gate fails.
- **The Mac Studio 2025 cannot run it.** There is no Docker. Node v26.7.0 and pnpm 10.32.1 match the gate image's versions. **On this clone the hook is not installed** (`git config core.hooksPath` is empty and `.husky/_` does not exist), so today a push from the 2025 skips the gate without saying so.
- **The Mac Studio 2022 can.** Docker Desktop 29.8.0 (10 CPUs, a 29.4 GB VM) runs about ten of the owner's services, PATHS' proxy among them. No qwen image or container is there yet. `ssh -o BatchMode=yes mac-studio-2022` works from the 2025. A non-interactive ssh shell has no Homebrew `PATH`, so `docker` is found only at `/opt/homebrew/bin/docker`.
- **Machine names in code.** None appear in `app/`, `spark/model-server/`, `spark/model/` or `tools/stub-generation-server/` (`git grep`, 2026-10-20). They appear only in `tools/lan-name`'s tests (retired by STORY_037) and in `tools/spike/`. CLAUDE.md §4a states the rule for the Spark's name, and no gate enforces it.
- **CLAUDE.md is out of date.** §1 and §4 say the repo, the assistant's shell and the dev server are on the Spark, reached through a VS Code tunnel. That was true when written, but this session's shell and clone are on the Mac Studio 2025.

## UI Mockup

N/A (no UI change): this story moves where the gate runs and adds a source check.

## Acceptance Criteria

**Running the gate from the 2025**

- [x] `tools/gate/remote.sh` on the 2025 runs the **unchanged** `tools/gate/run.sh` on the gate host. It passes its arguments through (`--from 4`, step names), streams the output as it comes, and exits with `run.sh`'s exit code.
- [x] **By default it checks the working tree** as it stands: tracked files, plus untracked files git does not ignore. That is what CLAUDE.md §4 runs before a commit. **With `--commit <sha>` it checks exactly that commit**, and the hook uses this mode.
- [x] **Nothing git ignores is ever copied** to the gate host: `.env`, `outputs/`, `models/`, `node_modules/`, `recon/out/`, coverage and build output. Nor is `.git`.
- [x] **The gate host is configuration.** It is read from `GATE_HOST` in the environment or in the gitignored `.env`. When it is unset, the script stops before doing anything, with a message naming `GATE_HOST` and `.env.example`. `.env.example` gains `GATE_HOST=`, left empty, with a comment.
- [x] **One gate at a time on the gate host.** A second run while one is going is refused, with a message giving when the running one started. A lock whose run has ended is cleared by the next run.
- [x] **A missing gate image is built once.** If `qwen/gate:1.63.0-node26` is not on the gate host, the script runs `tools/gate/build.sh` there, says so, and then runs the gate.
- [x] **The gate host's own services are untouched.** The gate creates nothing on the 2022 except its own `qwen` project resources (the gate container, the `qwen/gate` and `qwen/app` images, the `pnpm-store` volume, a working copy under `~/qwen-gate/`).

**The hook**

- [x] On a machine without Docker and with `GATE_HOST` set, a push to `develop` runs `remote.sh --commit <the pushed sha>`. On a machine with Docker it runs `run.sh` as before, so the Spark's clone keeps working until STORY_037. A failing gate refuses the push, as today. Pushes to other branches run nothing, as today.
- [x] **A push to `develop` with no way to run the gate is refused,** never let through: no Docker and no `GATE_HOST`, or a gate host that does not answer. The message states the rule and the fix, written for a session that has never seen this story.
- [x] **The hook is installed on the 2025's clone** (`core.hooksPath` is `.husky/_`), and README › Running the UI says how to install it on a new clone.

**Machine names stay out of the code**

- [x] A gate check fails when a machine name or LAN address appears in **application code, tests or fixtures**: `app/`, `spark/model-server/`, `spark/model/` and `tools/stub-generation-server/`. It catches:
  - `mac-studio-` followed by a year;
  - `spark-1` and `dgx-spark`;
  - any `<name>.local` host;
  - `192.168.` addresses.

  `localhost` and `127.0.0.1` are not machine names and pass. Each failure gives the file and line, the rule, and the fix: move the value into `.env` and read it through the app's config. The check runs in step 3 (`pnpm test`) and passes on today's tree.

**The docs say where things run**

- [x] **CLAUDE.md** says:
  - in §1, that the repo and the assistant are on the Mac Studio 2025;
  - in §4, that the gate runs on the Mac Studio 2022's Docker through `tools/gate/remote.sh`, how to run it, and that the dev server is `pnpm dev` on port 3100 on the 2025;
  - in §4a, that the Spark still serves the app and the model until STORY_037.

  Each new rule points at its gate. The Spark's serving rules stay as written until STORY_037 retires them.
- [x] **README** › Architecture, Running the UI and Project Structure name the three Macs, `remote.sh` and `GATE_HOST`.

## Departures from the reference

None: no reference surface is involved.

## Technical Notes

- **Copying the tree.** It is rsync over ssh into one working copy on the gate host, `~/qwen-gate/tree`, using `rsync -a --delete --filter=':- .gitignore' --exclude=.git`.
  - Paths git ignores are neither sent nor deleted on the far side, so the far side's `node_modules/` stays and step 0's `pnpm install --frozen-lockfile` stays quick.
  - In working-tree mode the source is the repo root.
  - In commit mode it is `git archive <sha>` unpacked into a scratch folder on the 2025, so the far tree matches the commit exactly.
- **The remote shell's `PATH`.** Non-interactive ssh on macOS has no `/opt/homebrew/bin`, and Docker Desktop's credential helper (`docker-credential-desktop`) is in `/Applications/Docker.app/Contents/Resources/bin`. `remote.sh` puts both on `PATH` before running `run.sh`. This is the `~/.zshenv` lesson in CLAUDE.md §4: don't rely on the user's shell files.
- **The uid.** `run.sh` and `build.sh` take the uid with `id -u` on the machine they run on. On the 2022 that is the owner's uid there, so the gate image is built for that machine and never copied between machines.
- **The `qwen` network.** `compose.yaml` declares an external network `qwen`, created today by `spark/up.sh` on the Spark, and it does not exist on the 2022. The `gate` service doesn't use it, and `run --no-deps` should not need it, but that is checked on the first real run. If Compose insists, `remote.sh` creates an empty `qwen` network on the 2022, and STORY_037 removes it when the app joins `paths`. The Done note says which happened.
- **The lock** is a directory, `~/qwen-gate/lock`, made atomically with `mkdir`. It holds the start time, the commit and the pid of the remote run. When that pid has gone, the next run clears the lock.
- **The test seam.** `GATE_REMOTE_DRY_RUN=1` prints the list of files that would be sent and the remote command, instead of running ssh, which is the same idea as `run.sh`'s `GATE_DRY_RUN`. The hook already has `GATE_RUN`.
- **The scan** is a pure function in `tools/gate/src/hostnames.ts`: given paths and their contents, it returns the violations. A small CLI runs it over `git ls-files` for the four folders, and the gate package's `test` script runs that CLI. Comments count too, so prose in code that names a host fails as well; say it in words instead (the lesson in CLAUDE.md §6b).

## Testing Plan

- **Unit, shell** (`tools/gate/remote.test.sh`, new; the gate package's `test` script runs it, as it runs `run.test.sh`). Each case builds a throwaway git repo in a temp folder and runs `remote.sh` with `GATE_REMOTE_DRY_RUN=1`:
  1. **What is sent, in working-tree mode.** The temp repo has a tracked file, an untracked file, and ignored ones (`.env`, `outputs/x.png`, `node_modules/a/index.js`). The list sent holds the first two and none of the ignored ones, and nothing under `.git`.
  2. **Commit mode sends the commit, not the working tree.** After an uncommitted edit, `--commit HEAD` sends the committed content, and the edit is absent.
  3. **Arguments pass through.** `remote.sh --from 4` produces a remote command ending in `tools/gate/run.sh --from 4`; `remote.sh lint build` ends in `run.sh lint build`.
  4. **The host is configuration.** With no `GATE_HOST` in the environment or `.env`, it exits non-zero and the message names `GATE_HOST`. With `GATE_HOST` in the temp repo's `.env`, the remote command targets that host.
  5. **Exit codes come back.** With a stub `ssh` on `PATH` that exits 3, `remote.sh` exits 3.
  6. **The lock refuses.** With a stub `ssh` that reports the lock held, `remote.sh` exits non-zero, and the message gives the running gate's start time.
- **Unit, shell** (`tools/gate/pre-push.test.sh`, new). It runs `.husky/pre-push` with crafted stdin lines, a stub `GATE_RUN` or `remote.sh` that records its arguments, and `PATH` set up with or without a `docker` stub:
  1. A push to `develop` with no Docker and `GATE_HOST` set calls `remote.sh --commit <local sha>`.
  2. With Docker present, it calls `run.sh` with no arguments, as today.
  3. A push to `feature/x` calls nothing.
  4. No Docker and no `GATE_HOST`: exit 1, and the message names the fix.
  5. The gate stub exits 2: the hook exits 1 with today's "push refused" line.
- **Unit, TypeScript** (`tools/gate/src/hostnames.test.ts`, new, `node --test`):
  - Each pattern is caught, with its file and line: `mac-studio-2026`, `spark-1`, `dgx-spark`, `hands.local`, `192.168.1.47`.
  - `localhost`, `127.0.0.1`, the word "local" in prose and `MODEL_BASE_URL` read from the environment all pass.
  - A file outside the four folders is not scanned.
  - A hostname in a comment is caught.
  - The CLI's run over the real repo passes, which proves the check is green on today's tree.
- **Integration: not applicable.** No API route or server-side handler changes. The gate scripts are covered by the shell tests with stubs, and by the real run below.
- **E2E: not applicable** as new specs: no UI or user flow changes. The whole existing e2e suite runs inside the gate on the 2022, and its staying green there proves the move changed nothing the app does. Every spec in `app/e2e/` is that regression cover.
- **Manual verification, on the three Macs** (after BUG_016):
  1. On the 2025, `tools/gate/remote.sh` gives all six steps green on the 2022. The Done note records how long it took, and whether the `qwen` network had to be created.
  2. `docker ps` on the 2022 before and after lists the same containers with the same uptimes.
  3. A push to `develop` on a **local bare repository** (`git init --bare` in a scratch folder, added as a temporary remote) runs the remote gate from the hook. A commit with a deliberate typecheck error pushed to that bare repository is refused. No real remote is touched.
  4. With `GATE_HOST=no-such-host`, the same push to the bare repository is refused with the "did not answer" message.

## Estimated Complexity

Small to medium:
- two shell scripts of about 120 lines, with their shell tests;
- a small TypeScript scan and its test;
- a change to the hook;
- the CLAUDE.md and README rewrites.

The risk is in Docker Desktop over ssh (`PATH`, the credential helper, Compose's external network). Manual step 1 shows that up on the first run.

## Corrections made during implementation (2026-10-20)

- **Copying the tree (Technical Notes).** It does not use rsync with `--filter=':- .gitignore'`. A test showed that filter differs from git: it dropped `.env.example` (rsync reads the `!` line differently) and sent `.husky/_`. Instead, `remote.sh` streams exactly git's list as one tar over one ssh session:
  - in working-tree mode, `git ls-files -co --exclude-standard`;
  - in commit mode, `git archive <sha>`.

  On the gate host that one session takes the lock, unpacks into a fresh folder, moves the old tree's `node_modules` folders into it, and swaps it in.
- **The scan (Technical Notes).** It is a test case in `tools/gate/src/hostnames.test.ts` that walks the four folders, not a CLI over `git ls-files`. The gate host's copy has no `.git`.
- **The `qwen` network.** Compose did not need it. `run --no-deps gate` ran on the 2022 without it, so nothing was created.
- **Manual check 2 compares names and states only.** Uptime text changes by itself ("59 minutes", then "About an hour").

## Done note (2026-10-20)

- **Gate:** the whole gate is green on the Mac Studio 2022 through `tools/gate/remote.sh`. All six steps took 183 s (224 s including the transfer); step 6 took 109 s. Step 3 now runs `remote.test.sh` (15 cases), `pre-push.test.sh` (6 cases), `run.test.sh` (9 cases, with its hook cases now given `GATE_DOCKER=sh`), and `hostnames.test.ts` (4 cases).
- **Manual checks on the three Macs:**
  1. The full run is green as above. The gate image was built on the 2022 on first use (3.97 GB), and the `qwen` network was not needed.
  2. `docker ps -a` on the 2022 before and after the run listed the same names and states. Earlier that evening PATHS' proxy went down there. That was PATHS BUG_051 (Tailscale holds port 443 after a reboot), unrelated to the gate, as the topaz session confirmed.
  3. The hook works through a local bare repository:
     - pushing `a9c0229` to its `develop` gated that commit on the 2022 (green in 170 s) and let it through;
     - a commit with a deliberate type error, made with `git commit-tree` so the working tree never changed, was refused at step 1 with the compiler's message.
  4. With `GATE_HOST=no-such-host` the same push was refused: "did not answer over ssh (exit 255) … nothing is gated".
- **Found while checking:** a push from a **git worktree** skips the hook entirely, because `core.hooksPath` is relative and `.husky/_` exists only where `pnpm install` ran. Filed as [BUG_017](../bug/BUG_017_a_push_from_a_git_worktree_skips_the_gate.md). Until it is fixed, push only from the main clone.
- **The hostname check found one real case on its first run:** a comment in `app/lib/clipboard.ts` named the app's `.local` address. It is reworded in words, with no change in behaviour.
- **The hook is installed on the 2025's clone** (`core.hooksPath=.husky/_`) by a native `pnpm install`, and `GATE_HOST` is in its gitignored `.env`.
