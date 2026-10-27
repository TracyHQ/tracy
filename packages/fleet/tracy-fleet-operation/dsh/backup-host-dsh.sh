#!/usr/bin/env bash
#
# backup-host-dsh — the identity and the data of this host's dsh, in one archive.
#
#   backup-host-dsh.sh                 # write an archive, prune old ones
#   backup-host-dsh.sh --list          # what is on disk now
#   backup-host-dsh.sh --restore <f>   # put one back (refuses over a running dsh)
#
# ## What it protects, and what it does not
#
# `/srv/tracy/host-dsh/home` holds two files that CANNOT BE RECOVERED FROM ANYWHERE ELSE:
#
#   dsh-passwords.env   the seat door's keys. MCP_SEAT_SECRET is half of a pair whose other half
#                       is a Cloudflare Worker secret — and Worker secrets are WRITE-ONLY, so the
#                       copy at Cloudflare cannot be read back to reconstruct this one.
#                       MCP_TRACY_ACTOR_SECRET is shared by four Workers; the same applies.
#   .credentials.yaml   the model keys.
#
# Losing the host loses both, and every seat on every host stops working until a new actor secret
# is minted into four Workers at once. Measured 07/09: no cron, no timer and no script on either
# fleet host backed any of this up.
#
# 🔒 AN ARCHIVE ON THE SAME DISK DOES NOT SURVIVE THE FAILURE IT EXISTS FOR. Local copies protect
# against a bad deploy, a wrong `rm`, a container recreated with the wrong mount — real and common.
# They do not protect against losing the machine. Set TRACY_BACKUP_REMOTE (an rsync destination) to
# get an off-host copy; without it this script says so on every run rather than letting a green log
# imply a safety it does not have.
#
# ## What is left out on purpose
#
# `profiles/` — 45 MB, and DERIVED: `seed-profile.sh` writes it out of the image on every deploy.
# Backing it up would triple the archive to restore something a deploy rebuilds in seconds, and a
# restored profile from an older image is worse than no profile, because it boots.
set -euo pipefail

DESK_HOME="${HOST_DSH_HOME:-/srv/tracy/host-dsh/home}"
DEST="${TRACY_BACKUP_DIR:-/var/backups/tracy}"
KEEP="${TRACY_BACKUP_KEEP:-14}"
REMOTE="${TRACY_BACKUP_REMOTE:-}"
MODE=backup
RESTORE_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --list) MODE=list ;;
    --restore) MODE=restore; RESTORE_FILE="${2:?--restore needs an archive}"; shift ;;
    --dest) DEST="${2:?--dest needs a path}"; shift ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "error: $*" >&2; exit 1; }

if [ "$MODE" = list ]; then
  ls -lh "$DEST"/host-dsh-*.tar.gz 2>/dev/null || echo "no archives in $DEST"
  exit 0
fi

if [ "$MODE" = restore ]; then
  [ -f "$RESTORE_FILE" ] || die "no such archive: $RESTORE_FILE"
  # Restoring under a running dsh would put the seat door's database back while the gateway holds
  # it open, and the half that wins is whichever wrote last.
  if docker inspect tracy-dsh --format '{{.State.Status}}' 2>/dev/null | grep running >/dev/null; then
    die "tracy-dsh is running. Stop it first: docker compose --env-file /etc/tracy/host-dsh.env -f /opt/tracy-fleet/dsh/host-dsh.yml stop dsh"
  fi
  echo "restoring $RESTORE_FILE into $DESK_HOME"
  tar -C "$DESK_HOME" -xzf "$RESTORE_FILE" --same-owner
  chown -R 33:33 "$DESK_HOME"
  echo "restored. Bring dsh back up, then re-check that HOST_SEAT_SECRET_<HOST> in BOTH Workers"
  echo "still matches MCP_SEAT_SECRET in $DESK_HOME/dsh-passwords.env — a restore from before a"
  echo "rotation puts the OLD key back, and every mint 403s with nothing saying which key signed."
  exit 0
fi

# ── backup ──────────────────────────────────────────────────────────────────────────────────────
[ -d "$DESK_HOME" ] || die "no $DESK_HOME"
mkdir -p "$DEST"
chmod 700 "$DEST"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/host-dsh-$(hostname -s)-$STAMP.tar.gz"

# umask in a subshell around the write, not around the script: `tar` must create the archive 0600,
# and a bare umask here would also apply to anything else this script touches later.
( umask 077
  tar -C "$DESK_HOME" -czf "$OUT" \
      --exclude=./profiles \
      --exclude=./.profiles.incoming.\* \
      --exclude=./.profiles.outgoing.\* \
      . )

# Verify by READING IT BACK, not by trusting tar's exit code. A backup nobody has opened is a
# belief, and the moment you find out is the moment you need it.
MISSING=0
for want in ./dsh-passwords.env ./.credentials.yaml; do
  tar -tzf "$OUT" | grep -x "$want" >/dev/null || { echo "warning: $want is not in the archive" >&2; MISSING=1; }
done
[ "$MISSING" = 0 ] || echo "warning: the archive is missing an identity file — this host may never have been initialised" >&2

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"

if [ -n "$REMOTE" ]; then
  echo "copying to $REMOTE"
  rsync -a --chmod=F600 "$OUT" "$REMOTE/" || die "off-host copy FAILED — the local archive stands, but this host is still one disk away from losing its keys"
  echo "off-host copy ok"
else
  echo "⚠ TRACY_BACKUP_REMOTE is not set: this archive lives on the same disk as the thing it backs up."
  echo "  It survives a bad deploy. It does not survive losing this machine."
fi

# Prune AFTER the new one is written and verified, never before.
ls -1t "$DEST"/host-dsh-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "pruning $(basename "$old")"
  rm -f "$old"
done
