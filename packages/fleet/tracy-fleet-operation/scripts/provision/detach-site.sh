#!/usr/bin/env bash
#
# detach-site — undo attach-site: the binds go, and so do the lines in /etc/fstab.
#
#   detach-site.sh <label>
#
# 🔒 WHY THIS IS NOT OPTIONAL, AND WHY teardown CALLS IT FIRST.
#
# `teardown.sh` ends with `rm -rf /srv/tracy/<label>`. Without this script running before that, the
# host is left with a bind mount over a deleted directory and a line in /etc/fstab naming a source
# that no longer exists. The line is the dangerous half: systemd-fstab-generator makes every fstab
# line a `.mount` unit required by `local-fs.target`, so at the NEXT REBOOT — a kernel update, a
# power event, weeks later — the mount fails, the target fails, and the host drops into an
# emergency shell. Every customer site on that host is down because one site was deleted in
# September. Nothing connects the two events for whoever is woken up.
#
# The `nofail` that attach-site writes is the second belt. This is the first.
#
# Idempotent, in both halves: a label with no mounts and no lines is a success. It is safe to run
# on a site that was never attached, and safe to run twice.
#
# Deepest first. `/srv/tracy-sites/<label>/.webroot` lives INSIDE `/srv/tracy-sites/<label>`, and
# unmounting the parent while the child is mounted leaves the child attached to a directory nobody
# can reach — visible only in /proc/mounts, and still holding the deleted inode.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/fstab.sh
. "$HERE/../lib/fstab.sh"

LABEL="${1:-}"
SITES="${TRACY_SITES_ROOT:-/srv/tracy-sites}"

[ -n "$LABEL" ] || { echo "use: detach-site.sh <label>" >&2; exit 2; }
case "$LABEL" in
  .|..|.*|*/*|*[!A-Za-z0-9._-]*) echo "unusable label: $LABEL" >&2; exit 2 ;;
esac

# Deepest first, and every target attach-site can create — including the emdash pair, whatever the
# site's platform says today. A site that changed platform, or one whose `.env` has since been
# deleted by a half-finished teardown, must still have every one of its mounts removed; asking
# `mountpoint` about a path that was never mounted costs nothing.
TARGETS=(
  "$SITES/$LABEL/.webroot/data"
  "$SITES/$LABEL/.webroot/uploads"
  "$SITES/$LABEL/.webroot"
  "$SITES/$LABEL"
)

if [ "$(uname -s)" = Linux ] && [ "$(id -u)" = 0 ]; then
  for target in "${TARGETS[@]}"; do
    mountpoint -q "$target" || continue
    if umount "$target" 2>/dev/null; then
      echo "    unmounted $target"
    elif umount -l "$target" 2>/dev/null; then
      # Lazy as the fallback, not the default: something inside the dsh container may still hold
      # the directory open, and a teardown that stops at a busy mount leaves the fstab line behind
      # — which is the failure this whole script exists to prevent.
      echo "    unmounted $target (lazily — something still had it open)"
    else
      echo "!! could not unmount $target — remove it by hand before this label is reused" >&2
    fi
  done
else
  echo "==> not Linux or not root — no mounts to remove for $LABEL"
fi

# The fstab lines go whatever the platform, and whether or not anything was mounted just now:
# a line without its mount is exactly the state that breaks the next boot. Runs with TRACY_FSTAB
# pointed elsewhere in tests, which is the only way any of this is provable off a host.
tracy_fstab_remove "${TARGETS[@]}"

# The directory itself, now empty, and only if it IS empty: a non-empty one means a mount is still
# standing (reported above) or that files were written into the mount point rather than through it,
# and either way deleting is the wrong answer.
rmdir "$SITES/$LABEL/.webroot" 2>/dev/null || true
rmdir "$SITES/$LABEL" 2>/dev/null || true

echo "==> detached /site/$LABEL"
