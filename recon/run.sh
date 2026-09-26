#!/usr/bin/env bash
# Runs a recon script inside the Playwright container (CHORE_001).
#
#   recon/run.sh login       headed: the window opens on the Spark's desktop
#   recon/run.sh check       headless: prints session: signed-in | signed-out | unknown
#   recon/run.sh test        the recon unit tests
#   recon/run.sh typecheck   the recon typecheck
#
# The host needs only docker. Nothing is installed on it. This script prints
# nothing of its own beyond errors: never the X auth file, never a cookie.
set -euo pipefail

usage() {
  echo "usage: recon/run.sh login|check|test|typecheck" >&2
  exit 2
}

[[ $# -eq 1 ]] || usage
case "$1" in
  login | check | test | typecheck) script="$1" ;;
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
else
  run="exec corepack pnpm --filter recon $script"
fi

exec docker compose -f "$here/compose.yaml" run --rm --quiet-pull recon \
  sh -c "corepack pnpm install --frozen-lockfile --reporter=silent && $run"
