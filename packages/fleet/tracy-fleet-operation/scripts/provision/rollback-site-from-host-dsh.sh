#!/usr/bin/env bash
#
# rollback-site-from-host-dsh — put ONE site back on its own lane.
#
#   rollback-site-from-host-dsh.sh <label> [--dry-run] [--lane N]
#
# The undo of migrate-site-to-host-dsh.sh, and it undoes the three things that would otherwise
# leave the lane running against a shape it does not understand:
#
#   1. the site folder's level      $SITE_DIR/site/*  ->  $SITE_DIR/site/<label>/*
#      Only when the migration's own backup (`site.pre-host-dsh.*.tgz`) says the migration moved
#      it. A site that was born at the new shape must not be pushed into the old one.
#      🔒 This is not cosmetic. The lane container binds `$SITE_DIR/site/<label>`, and Docker
#      CREATES a missing bind source as an empty root-owned directory. A lane started against a
#      levelled site hands its agent an empty folder and the agent says, fluently, that the site
#      has nothing in it — the exact silent failure this repo keeps paying for.
#      `.webroot` stays where it is: that directory is where attach-site.sh's bind LANDS (through
#      the bind of `$SITE_DIR/site` onto /srv/tracy-sites/<label>), and moving a mount point's
#      dentry leaves the mount attached to a path nobody can name any more — including the two
#      `umount` lines this script prints at the end.
#   2. the compose file             the pre-migration backup goes back in place, and the web
#      container is recreated from it (`--no-deps`, so the database is genuinely left alone)
#   3. the lane                     `docker start <label>-dsh`, and then it CHECKS
#
# It does NOT touch the KV flags: they live on Cloudflare. The commands are printed at the end, and
# they are the FIRST thing to run — while `host-dsh:<label>` is on, `cowork-web` proxies seats at
# this site to the host dsh no matter what the containers here are doing.
#
# ⚠ AFTER AN ADOPT, THE HISTORY EXISTS IN TWO PLACES, AND THEY DIVERGE FROM THIS MOMENT.
# The migration COPIES session logs (`cp`, never `mv`), so the lane still holds the originals — and
# once `--adopt-sessions-only` has run, the host dsh's workspace registry has adopted the copies.
# After this rollback the lane writes to the originals and the copies stand still; a later second
# migration would carry over both, and the customer would see the same conversation twice, one of
# them frozen. The cleanup command is printed at the end. Run it unless you are about to migrate
# this site again within the hour.
#
# The bind under /srv/tracy-sites is left in place on purpose. With the flags deleted nobody is
# routed through the host dsh, and removing a bind plus its fstab line from a script is a sharper
# edge than a directory nobody reads. The commands are printed if you want them gone.
set -euo pipefail

say() { echo "rollback: $*"; }
warn() { echo "rollback: !! $*" >&2; }
die() { echo "rollback: $*" >&2; exit 1; }

LABEL=""
DRY=0
LANE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --lane) LANE="$2"; shift 2 ;;
    -h|--help) sed -n '2,42p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "unknown argument: $1" >&2; exit 2 ;;
    *) LABEL="$1"; shift ;;
  esac
done
[ -n "$LABEL" ] || { echo "use: rollback-site-from-host-dsh.sh <label> [--dry-run]" >&2; exit 2; }
# Same case as attach-site.sh and the migration: character list AND the names that pass every
# character test while meaning something else in a path.
case "$LABEL" in
  .|..|.*|*/*|*[!A-Za-z0-9._-]*) die "unusable label: $LABEL" ;;
esac

ROOT="${TRACY_ROOT:-/srv/tracy}"
SITES="${TRACY_SITES_ROOT:-/srv/tracy-sites}"
HOST_HOME="${TRACY_HOST_DSH_HOME:-$ROOT/host-dsh/home}"
DOCKER="${TRACY_DOCKER:-docker}"
SITE_DIR="$ROOT/$LABEL"
STAMP="$(date +%Y%m%d-%H%M%S)"
[ -n "$LANE" ] || LANE="$LABEL-dsh"

# `%q` per argument, so a printed line can be pasted back and mean the same thing.
run() {
  if [ "$DRY" = 1 ]; then
    printf '  DRY'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# First match of a sorted list, without a pipe that `head` can close early under `pipefail`.
first_match() {
  local found
  found="$(find "$SITE_DIR" -maxdepth 1 -name "$1" | sort)"
  printf '%s' "${found%%$'\n'*}"
}

[ "$DRY" = 1 ] && say "DRY RUN — mutating commands are printed, not run"
[ -d "$SITE_DIR" ] || die "no site directory at $SITE_DIR"

say "delete the flags FIRST, from a machine with wrangler:"
say "  cd workers/cowork-web"
say "  npx wrangler kv key delete --binding=FLEET_SITES \"host-dsh:$LABEL\" --remote"
say "  npx wrangler kv key delete --binding=FLEET_SITES \"attached:$LABEL\" --remote"

# ── 1. the site folder's level ─────────────────────────────────────────────────────────────────
LEVELLED=false
FOLDER_BACKUP="$(first_match 'site.pre-host-dsh.*.tgz')"
if [ -z "$FOLDER_BACKUP" ]; then
  say "no site.pre-host-dsh.*.tgz — the migration did not move this site's folder, so neither does this"
elif [ -d "$SITE_DIR/site/$LABEL" ]; then
  say "$SITE_DIR/site/$LABEL is already there — the folder is at the lane's shape"
else
  say "putting the site folder back one level down (the lane binds $SITE_DIR/site/$LABEL)"
  run mkdir -p "$SITE_DIR/site/$LABEL"
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    case "${entry##*/}" in
      "$LABEL"|.webroot) continue ;;
    esac
    run mv "$entry" "$SITE_DIR/site/$LABEL/"
  done < <(find "$SITE_DIR/site" -mindepth 1 -maxdepth 1)
  LEVELLED=true
fi

# ── 2. the compose file ────────────────────────────────────────────────────────────────────────
#
# The OLDEST backup is the pre-migration one: migrate takes exactly one and never overwrites it,
# precisely so this line has an unambiguous answer.
BACKUP="$(first_match 'docker-compose.yml.pre-host-dsh.*')"
[ -n "$BACKUP" ] || die "no docker-compose.yml.pre-host-dsh.* in $SITE_DIR — nothing to restore. If this site was never migrated, there is nothing to roll back."
say "restoring $BACKUP"
# Keep the host-dsh shape beside it, so a second attempt at the migration does not have to
# re-derive it and so the two files can be diffed after a rollback nobody expected.
run cp -a "$SITE_DIR/docker-compose.yml" "$SITE_DIR/docker-compose.yml.host-dsh.$STAMP"
run cp -a "$BACKUP" "$SITE_DIR/docker-compose.yml"

say "recreating the web container from the restored file — down for seconds, db left alone"
if [ "$DRY" = 1 ]; then
  printf '  DRY (cd %q && %q compose up -d --no-deps web)\n' "$SITE_DIR" "$DOCKER"
else
  ( cd "$SITE_DIR" && "$DOCKER" compose up -d --no-deps web )
fi

# ── 3. the lane, and then a look ───────────────────────────────────────────────────────────────
LANE_STARTED=false
if "$DOCKER" inspect "$LANE" >/dev/null 2>&1; then
  run "$DOCKER" start "$LANE"
  if [ "$DRY" = 1 ]; then
    LANE_STARTED=unknown
  elif [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$LANE" 2>/dev/null || true)" = true ]; then
    LANE_STARTED=true
    say "lane $LANE is running again"
  else
    # `docker start` can return on a container that immediately dies. Saying "started" then is the
    # fail-open shape: the site is dark and the rollback reports success.
    die "$LANE did NOT come back up. Look now: $DOCKER logs --tail 50 $LANE"
  fi
else
  warn "no container named $LANE — this site has no lane to bring back (pass --lane <name> if it is called something else)"
fi

printf '{"label":"%s","composeRestored":"%s","siteFolderRelevelled":%s,"laneStarted":%s}\n' \
  "$LABEL" "$BACKUP" "$LEVELLED" \
  "$([ "$LANE_STARTED" = unknown ] && echo null || echo "$LANE_STARTED")"

say ""
say "⚠ the conversations exist in TWO places now, and they diverge from this second:"
say "    the lane's own $SITE_DIR/<its dsh-home>/sessions/  (live again)"
say "    the copy at $HOST_HOME/sessions/--site-$LABEL--/   (frozen, and adopted by the host dsh if"
say "    --adopt-sessions-only has run)"
say "  unless this site is going back to the host dsh within the hour, remove the copy:"
say "    rm -rf $HOST_HOME/sessions/--site-$LABEL--"
say "  the staged audit copy under $ROOT/host-dsh/migrated/$LABEL/ is not read by anything; keep it."
say ""
say "the bind under $SITES/$LABEL is left in place. To remove it as well:"
say "  umount $SITES/$LABEL/.webroot; umount $SITES/$LABEL"
say "  and delete the two lines naming those targets from /etc/fstab"
