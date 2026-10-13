#!/usr/bin/env bash
# Runs a recon script inside the Playwright container (CHORE_001).
#
#   recon/run.sh login       headed: the window opens on the Spark's desktop
#   recon/run.sh check       headless: prints session: signed-in | signed-out | unknown
#   recon/run.sh test        the recon unit tests
#   recon/run.sh typecheck   the recon typecheck
#   recon/run.sh curate DATE     file the owner's capture into docs/recon/DATE (STORY_002, offline)
#   recon/run.sh harvest DATE    harvest css, icons, brand and tokens (STORY_003, offline)
#   recon/run.sh interactions DATE  endpoints and inventory (STORY_004, offline)
#   recon/run.sh hands DATE preflight | look … | act …   drive Hands on the Mac and file every look (STORY_027)
#
# The host needs only docker. Nothing is installed on it. This script prints
# nothing of its own beyond errors: never the X auth file, never a cookie.
set -euo pipefail

usage() {
  echo "usage: recon/run.sh login|check|test|typecheck | curate|harvest|interactions YYYY-MM-DD | hands YYYY-MM-DD preflight|look|act ..." >&2
  exit 2
}

case "${1:-}" in
  login | check | test | typecheck)
    [[ $# -eq 1 ]] || usage
    script="$1" ;;
  curate | harvest | interactions)
    [[ $# -eq 2 && "$2" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || usage
    script="$1" ;;
  hands)
    [[ $# -ge 3 && "$2" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || usage
    script="$1" ;;
  *) usage ;;
esac

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"

# The Spark's desktop is display :1 (an X11 GNOME session, seen 2026-09-26).
# A VS Code tunnel terminal may not set DISPLAY, so default to it.
display="${DISPLAY:-:1}"
xauth="${XAUTHORITY:-/run/user/$(id -u)/gdm/Xauthority}"

if [[ "$script" == "login" ]]; then
  # ":1" or ":1.0" -> display number 1 -> /tmp/.X11-unix/X1
  number="${display#*:}"
  number="${number%%.*}"
  socket="/tmp/.X11-unix/X${number}"
  if [[ ! -S "$socket" ]]; then
    echo "recon/run.sh: no X display at $display. Is the Spark's desktop session running?" >&2
    exit 2
  fi
  if [[ ! -r "$xauth" ]]; then
    echo "recon/run.sh: cannot read the X auth file for $display. Set XAUTHORITY to it." >&2
    exit 2
  fi
fi
# The mount needs a file even for headless runs; an empty one grants nothing.
[[ -r "$xauth" ]] || xauth=/dev/null

mkdir -p "$repo/recon/.cache"

# STORY_027: Hands runs on the Mac. A container cannot resolve .local names, so the host
# resolves hands.local (the Spark's mDNS) and hands the address in; HANDS_HOST=<address>
# overrides. The repo's .env is mounted read-only for HANDS_API_TOKEN and HANDS_URL, and
# this shell never reads it. Every other command gets a placeholder host and an empty mount.
RECON_HANDS_HOST="127.0.0.1"
RECON_ENV_FILE=/dev/null
if [[ "$script" == "hands" ]]; then
  RECON_HANDS_HOST="${HANDS_HOST:-$(getent hosts hands.local 2>/dev/null | awk '{print $1; exit}' || true)}"
  if [[ -z "$RECON_HANDS_HOST" ]]; then
    echo "recon/run.sh: hands.local does not resolve from the Spark. Is Hands up on the Mac, and its name announced? Or pass HANDS_HOST=<address>." >&2
    exit 2
  fi
  [[ -r "$repo/.env" ]] && RECON_ENV_FILE="$repo/.env"
fi
export RECON_HANDS_HOST RECON_ENV_FILE

export RECON_REPO="$repo"
export RECON_UID RECON_GID RECON_XAUTH DISPLAY
RECON_UID="$(id -u)"
RECON_GID="$(id -g)"
RECON_XAUTH="$xauth"
DISPLAY="$display"

# login and check run with plain node so their exit codes (0 / 1 / 2) come
# through without pnpm wrapping a non-zero exit in an error banner.
if [[ "$script" == "login" || "$script" == "check" ]]; then
  run="cd recon && exec node src/$script.ts"
elif [[ "$script" == "curate" || "$script" == "harvest" || "$script" == "interactions" ]]; then
  # Offline: these scripts make no request (src/offline.test.ts guards their
  # sources); only the pnpm install before them uses the network.
  run="cd recon && exec node src/$script.ts $2"
elif [[ "$script" == "hands" ]]; then
  # Online, to Hands only. The remaining arguments (a subcommand, a JSON act, --as <state>@<width>)
  # are re-quoted for the container's shell; they are ASCII, which is all %q and dash agree on.
  quoted="$(printf '%q ' "${@:3}")"
  run="cd recon && exec node src/hands.ts $2 $quoted"
else
  run="exec corepack pnpm --filter recon $script"
fi

exec docker compose -f "$here/compose.yaml" run --rm --quiet-pull recon \
  sh -c "corepack pnpm install --frozen-lockfile --reporter=append-only > /tmp/install.log 2>&1 || { cat /tmp/install.log >&2; exit 1; }; $run"
