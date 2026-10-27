#!/usr/bin/env bash
#
# Push every site's site folder on this host to its team repo. Runs ON the host, inside the
# tracy-host container, once an hour — started by tracy-host itself (`apps/tracy-host/src/sync.js`;
# the old `tracy-site-sync.timer` is gone); can be run by hand any time.
#
#   sync-site-folders.sh            every lane
#   sync-site-folders.sh <label>    one lane
#
# ## Why a timer and not the plugin (Lee, 06/09/2026, option two)
#
# `Brand/<host>/` is written by `@tracy/dsh-brand-engine` inside the lane's container, and
# `TracyWork/` by the agent; neither may hold a GitHub token (ADR 0023 — a token reaches one
# customer's repo, the fleet host asks the seat book for a one-hour one per push). So the push
# happens here, on the host, on a clock: cheap, covers every directory of the site folder at once,
# and needs no message from the container to the host.
#
# ## What counts as a lane with a site folder
#
# `$TRACY_SITES_ROOT/<label>/.gitignore` exists — the shape `ensure-site-folder.mjs` builds and
# `push-site-folder.sh` insists on. Single label, not the lane-era `<label>/site/<label>` this
# script used to glob for: provision.sh now writes the site folder straight at
# `tracy_site_dir("$LABEL")`, with nothing nested under it (Plan 3 Task 2).
#
# The site key comes from `<site>/.tracy/site.json`'s `siteKey` field — the file
# `provision/siteFolder.mjs` writes (`{ siteKey, platform }`, `skeletonFiles()`), not the old
# `MCP_TRACY_SITE_KEY` line in a lane's `dsh-home/dsh-passwords.env`, which belonged to the
# one-dsh-per-lane era. A site without a readable `siteKey` is skipped and named, not guessed at.
#
# Three outcomes per site, counted apart, because they mean different things to whoever reads the
# log (`/var/lib/tracy-host/logs/sync-site-folders.log`):
#
#   synced    push-site-folder.sh exited 0 — pushed, or nothing had changed.
#   skipped   it exited 3 — the site record has no repo (a demo site, a provision still running).
#             Expected, not a fault: 43 demo sites on dev have no repo by design.
#   failed    any other exit — refused token, unreachable GitHub, a secret-shaped file, a rejected
#             push.
#
# The last line is always `done: N synced, S skipped, F failed`. One site failing does not stop the
# others; the exit code is non-zero only when F > 0.
#
# The site's label is passed with its site key: push-site-folder.sh sends both to the token door,
# which refuses a key whose record does not name this host and this label.
#
# TRACY_SYNC_LOCK and TRACY_PUSH_SITE_FOLDER (below) are both overridable for the test suite, which
# cannot write to /var/lock and must not shell out to the real push-site-folder.sh (a GitHub push).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

TOOLS="$HERE"
# An explicit override, not a PATH lookup: this script runs as root from a timer, and resolving a
# sibling script's name through PATH is a hijack surface with no upside — the file is always right
# here. Default is exactly what the old hardcoded "$TOOLS/push-site-folder.sh" called.
PUSH="${TRACY_PUSH_SITE_FOLDER:-$TOOLS/push-site-folder.sh}"
ONLY="${1:-}"

say() { echo "sync-site-folders: $*" >&2; }

# One sync at a time per host: the timer and a hand run must not push the same repo twice at once.
# Overridable so a test can point the lock into its own throwaway tree instead of the real
# /var/lock, which a non-root test runner cannot write to anyway.
#
# Ten minutes at most, then give up: a run stuck behind a hung one would otherwise queue forever,
# and every hourly tick after it would queue behind that. tracy-host also skips a tick while the
# previous run is alive, so waiting here is the hand-run-meets-timer case, not the normal one.
command -v flock >/dev/null 2>&1 || { say "'flock' is not on PATH — refusing to run unlocked"; exit 1; }
exec 9>"${TRACY_SYNC_LOCK:-/var/lock/tracy-site-sync}"
flock -w 600 9 || { say "another sync has held the lock for 10 minutes — giving up this run"; exit 1; }

site_key_of() { # site_key_of <site-dir>
  local manifest="$1/.tracy/site.json"
  [ -f "$manifest" ] || return 1
  sed -n 's/.*"siteKey"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | sed -n 1p
}

synced=0
skipped=0
failed=0
for dir in "$TRACY_SITES_ROOT"/*/; do
  [ -d "$dir" ] || continue
  label=$(basename "$dir")
  [ -z "$ONLY" ] || [ "$ONLY" = "$label" ] || continue
  [ -f "$dir/.gitignore" ] || { say "$label: no .gitignore in $dir — not a site folder, skipped"; continue; }
  key=$(site_key_of "$dir") || key=""
  if [ -z "$key" ]; then
    say "$label: no .tracy/site.json (or no siteKey in it) — skipped"
    continue
  fi
  say "$label ($key)"
  "$PUSH" "$label" "$key" 2>&1 | sed 's/^/  /' >&2
  # The push's own exit code, not sed's (pipefail would fold them into one non-zero).
  code=${PIPESTATUS[0]}
  case "$code" in
    0) synced=$((synced + 1)) ;;
    3)
      say "$label: no repo on record — skipped"
      skipped=$((skipped + 1))
      ;;
    *)
      say "$label: push failed (exit $code)"
      failed=$((failed + 1))
      ;;
  esac
done

say "done: $synced synced, $skipped skipped, $failed failed"
[ "$failed" -eq 0 ]
