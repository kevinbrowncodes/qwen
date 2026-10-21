#!/usr/bin/env bash
# tools/gate/remote.sh (STORY_034): run the gate (tools/gate/run.sh, unchanged) on another Mac's Docker, for a repo on a
# Mac without Docker. The repo lives on the Mac Studio 2025 and the gate host is the Mac Studio 2022 (EPIC_007).
#
#   tools/gate/remote.sh                     the working tree as it stands: tracked files + untracked files git keeps
#   tools/gate/remote.sh --commit <sha>      exactly that commit (what the pre-push hook gates)
#   tools/gate/remote.sh --from 4            any other arguments go to run.sh unchanged (--from N, step names)
#
# GATE_HOST (the environment, or GATE_HOST= in the gitignored .env) is the gate host, as an ssh destination. Only the
# files git would keep are sent (never .env, outputs/, models/, node_modules/ or .git), as one tar stream over one ssh
# session, which on the gate host takes the lock (~/qwen-gate/lock: one gate at a time), unpacks into ~/qwen-gate/tree
# (keeping that tree's node_modules folders, so step 0's install stays quick), builds the gate image if it is missing,
# and runs run.sh. The exit code is run.sh's. GATE_REMOTE_DRY_RUN=1 prints the file list and the remote command instead
# (remote.test.sh). Written for the bash macOS ships (3.2): an empty array is never expanded bare.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
log() { printf '[gate-remote] %s\n' "$*"; }

commit=""
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) commit="${2:-}"; [ -n "$commit" ] || { log "ERROR: --commit needs a commit"; exit 2; }; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) args+=("$1"); shift ;;
  esac
done

# GATE_HOST from the environment, else its own line in .env; no other .env value is read or printed.
host="${GATE_HOST:-}"
if [ -z "$host" ] && [ -f "$ROOT/.env" ]; then
  host="$(sed -n 's/^GATE_HOST=//p' "$ROOT/.env" | tail -n 1 | tr -d "\"'\r")"
fi
if [ -z "$host" ]; then
  log "ERROR: no gate host. This Mac has no Docker, so the gate runs on another Mac's Docker over ssh (STORY_034)."
  log "Fix: set GATE_HOST to that Mac's ssh destination, in the environment or as GATE_HOST= in .env (see .env.example)."
  exit 64
fi

if [ -n "$commit" ]; then
  sha="$(git -C "$ROOT" rev-parse --verify --quiet "$commit^{commit}")" || { log "ERROR: $commit is not a commit"; exit 2; }
  what="commit ${sha:0:12}"
  list() { git -C "$ROOT" ls-tree -r --name-only "$sha"; }
  stream() { git -C "$ROOT" archive --format=tar "$sha"; }
else
  what="working tree at $(git -C "$ROOT" rev-parse --short=12 HEAD)$([ -z "$(git -C "$ROOT" status --porcelain)" ] || echo ' + uncommitted changes')"
  # Deleted-but-unstaged files are listed by ls-files yet gone from disk; send only what exists.
  list() { git -C "$ROOT" ls-files -co --exclude-standard | while IFS= read -r f; do [ -e "$ROOT/$f" ] || [ -L "$ROOT/$f" ] && printf '%s\n' "$f"; done; }
  stream() { list | tr '\n' '\0' | COPYFILE_DISABLE=1 tar -C "$ROOT" --null -T - -cf -; }
fi

image="$(sed -n 's/^IMAGE="\(.*\)"$/\1/p' "$HERE/run.sh")"
# The gate host's side, run by bash there. $1 = what is gated, $2 = the gate image, the rest = run.sh's arguments.
# Non-interactive ssh on macOS has no Homebrew PATH and no Docker Desktop helpers (CLAUDE.md §4: ~/.zshenv only).
read -r -d '' remote <<'REMOTE' || true
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
what="$1"; image="$2"; shift 2
base="$HOME/qwen-gate"; lock="$base/lock"
mkdir -p "$base"
if ! mkdir "$lock" 2>/dev/null; then
  pid="$(cat "$lock/pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "[gate-remote] ERROR: a gate is already running on $(hostname -s) since $(cat "$lock/started" 2>/dev/null) ($(cat "$lock/what" 2>/dev/null)); try again when it ends"
    exit 75
  fi
  rm -rf "$lock"; mkdir "$lock"
fi
echo $$ > "$lock/pid"; date '+%F %T %Z' > "$lock/started"; echo "$what" > "$lock/what"
trap 'rm -rf "$lock" "$base/incoming"' EXIT
rm -rf "$base/incoming"; mkdir "$base/incoming"
tar -xf - -C "$base/incoming"
if [ -d "$base/tree" ]; then
  (cd "$base/tree" && find . -type d -name node_modules -prune) | while IFS= read -r d; do
    [ -e "$base/incoming/$d" ] && continue
    mkdir -p "$base/incoming/$(dirname "$d")"; mv "$base/tree/$d" "$base/incoming/$d"
  done
  rm -rf "$base/tree"
fi
mv "$base/incoming" "$base/tree"
cd "$base/tree"
echo "[gate-remote] gating $what on $(hostname -s)"
docker image inspect "$image" > /dev/null 2>&1 || { echo "[gate-remote] gate image $image missing here: building it once"; tools/gate/build.sh; }
tools/gate/run.sh "$@" && rc=0 || rc=$?
exit "$rc"
REMOTE

# One quoted command line for the remote login shell (zsh or bash both read $'...').
cmd="bash -c $(printf '%q' "$remote") gate $(printf '%q' "$what") $(printf '%q' "$image")"
for a in ${args[@]+"${args[@]}"}; do cmd="$cmd $(printf '%q' "$a")"; done

if [ -n "${GATE_REMOTE_DRY_RUN:-}" ]; then
  echo "host: $host"
  echo "what: $what"
  echo "args:${args[@]+ ${args[*]}}"
  echo "files:"; list | sed 's/^/  /'
  exit 0
fi

log "gating $what on $host"
stream | ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=30 "$host" "$cmd" && rc=0 || rc=$?
if [ "$rc" -eq 255 ]; then
  log "ERROR: the gate host $host did not answer over ssh (exit 255). The gate did not run, so nothing is gated."
  log "Fix: check the host is up and 'ssh $host true' works, or point GATE_HOST at a Mac with Docker."
fi
exit "$rc"
