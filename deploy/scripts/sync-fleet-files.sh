#!/usr/bin/env bash
#
# sync-fleet-files - put one build's fleet files on this host:
#   sync-fleet-files.sh --from-image ghcr.io/tracyhq/tracy-host:<tag> [--dest /opt/tracy-fleet] [--dry-run]
#   sync-fleet-files.sh --from-dir <checkout of the source repository> [--dest /opt/tracy-fleet] [--dry-run]
#   sync-fleet-files.sh --list
#
# What it installs is what the two deploy actions install on a runner host today
# (.github/actions/deploy-tracy-stack/action.yml "Put the stack files in place";
# .github/actions/deploy-host-dsh/action.yml "Put the fleet dsh files in place" and "Put the fleet
# provision scripts in place"), plus the shard's own files and web/ (amendment 4 of 15/10/2026). A
# shard has no runner and no checkout, so this is how those files arrive there. Keep these lists and
# the actions' lists the same: a file added to one and not the other reaches half the fleet
# (scripts/test/sync-fleet-files.test.mjs reads both action files to hold that).
#
# ONE LAYOUT IN BOTH PLACES (section 10 of the shard interface contract): /opt/tracy-fleet/stack is
# flat in the tracy-host image AND on this host, so each file has two names only: its path in the
# repository (read from a checkout) and its path under /opt/tracy-fleet (read from the image, and
# written here). FILES below is the one list of that layout; apps/tracy-host/Dockerfile copies it
# file by file, and a test holds the two equal.
#
# Like the actions: no --delete (a host carries files this repository does not know), hooks/ and
# migrate/ are not synced (a host's role is chosen when it is built), the stack directory is flat
# (scripts beside the compose files), and every change is said before it is made: "+ <path>" new,
# "~ <path>" changed.
# Unlike them: every required source file is checked BEFORE the first write, so a broken source
# changes nothing; and every file is written to a temp name and renamed into place, so a script
# running while it is replaced (tracy-updater.sh runs this; this script replaces itself) keeps
# reading its old inode.
#
# --dest <root> must already exist (default /opt/tracy-fleet): the script writes only the files and
# subdirectories it owns below it and never deletes or touches anything else there (a co-hosted
# stack keeps its own files beside them).
#
# Exit: 0 done · 1 failed (a required file missing from the source, or a copy failed) · 2 usage ·
# 3 the image carries no shard files: no /opt/tracy-fleet/stack (built before W5 P4), or no
# stack/sync-fleet-files.sh in it (built before the shard line put its files in the image).
set -euo pipefail

F=packages/fleet/tracy-fleet-operation
# <path in the repository> <path under /opt/tracy-fleet, in the image and on this host> <mode>.
# stack/ and dsh/ are flat: one name each, no subdirectory (contract section 10). The 8 stack and 7
# dsh files are W5's (what the two deploy actions install, plus prune-old-images.sh and the
# tracy-web.env template); the 18 after them are the shard's, the contract's list (section 10):
# install-shard-steps.sh is sourced by install-shard.sh, never run, so it carries no x bit.
FILES="
deploy/compose.yml stack/compose.yml 0644
deploy/compose.server.yml stack/compose.server.yml 0644
deploy/.env.example stack/tracy-web.env.example 0644
deploy/scripts/deploy-tracy-stack.sh stack/deploy-tracy-stack.sh 0755
deploy/scripts/check-server.sh stack/check-server.sh 0755
deploy/scripts/backup-postgres.sh stack/backup-postgres.sh 0755
deploy/scripts/sync-prefixed-site-dns.py stack/sync-prefixed-site-dns.py 0755
deploy/scripts/prune-old-images.sh stack/prune-old-images.sh 0755
deploy/scripts/install-shard.sh stack/install-shard.sh 0755
deploy/scripts/install-shard-steps.sh stack/install-shard-steps.sh 0644
deploy/scripts/tracy-heartbeat.sh stack/tracy-heartbeat.sh 0755
deploy/scripts/tracy-updater.sh stack/tracy-updater.sh 0755
deploy/scripts/tracy-pgdump-r2.sh stack/tracy-pgdump-r2.sh 0755
deploy/scripts/check-shard.sh stack/check-shard.sh 0755
deploy/scripts/shard-sign.sh stack/shard-sign.sh 0755
deploy/scripts/shard-env-check.sh stack/shard-env-check.sh 0755
deploy/scripts/sync-fleet-files.sh stack/sync-fleet-files.sh 0755
deploy/compose.shard.yml stack/compose.shard.yml 0644
deploy/nginx/shard.conf stack/nginx-shard.conf 0644
deploy/shard.env.example stack/shard.env.example 0644
deploy/systemd/tracy-heartbeat.service stack/tracy-heartbeat.service 0644
deploy/systemd/tracy-heartbeat.timer stack/tracy-heartbeat.timer 0644
deploy/systemd/tracy-updater.service stack/tracy-updater.service 0644
deploy/systemd/tracy-updater.timer stack/tracy-updater.timer 0644
deploy/systemd/tracy-backup-postgres.service stack/tracy-backup-postgres.service 0644
deploy/systemd/tracy-backup-postgres.timer stack/tracy-backup-postgres.timer 0644
$F/dsh/host-dsh.yml dsh/host-dsh.yml 0644
$F/dsh/docker-proxy.haproxy.cfg dsh/docker-proxy.haproxy.cfg 0644
$F/dsh/host-dsh.env.example dsh/host-dsh.env.example 0644
$F/dsh/host-dsh-init.sh dsh/host-dsh-init.sh 0755
$F/dsh/deploy-host-dsh.sh dsh/deploy-host-dsh.sh 0755
$F/dsh/seed-profile.sh dsh/seed-profile.sh 0755
$F/dsh/backup-host-dsh.sh dsh/backup-host-dsh.sh 0755
"
# Whole trees, file by file, each keeping its own mode: <dir in the repository> <dir under /opt/tracy-fleet>.
TREES="
$F/scripts/lib lib
$F/scripts/provision provision
$F/scripts/tools tools
$F/scripts/webroot webroot
$F/web web
"
# Files those trees must hold: provision.sh sources the four lib files (the deploy action asserts the
# same four); bootstrap.sh is step 4 of install-shard.sh; IMAGE_TAGS and build.sh are what
# tracy-updater.sh reads and runs. <path in the repository> <path under /opt/tracy-fleet>.
NEEDS="
$F/scripts/lib/publish-excludes.sh lib/publish-excludes.sh
$F/scripts/lib/site-apache-conf.sh lib/site-apache-conf.sh
$F/scripts/lib/web-image.sh lib/web-image.sh
$F/scripts/lib/webroot-htaccess.sh lib/webroot-htaccess.sh
$F/scripts/provision/bootstrap.sh provision/bootstrap.sh
$F/web/IMAGE_TAGS web/IMAGE_TAGS
$F/web/build.sh web/build.sh
"

DEST=/opt/tracy-fleet
FROM_DIR=""; IMAGE=""; DRY_RUN=0; LIST=0
STAGE=""; CID=""; CHANGED=0; MISSING=""; FROM=""

usage() { sed -n '3,6p' "$0" | sed 's/^# \{0,1\}//'; }
die_usage() { echo "sync-fleet-files: $1" >&2; usage >&2; exit 2; }

cleanup() {
  if [ -n "$CID" ]; then docker rm -f "$CID" >/dev/null 2>&1 || true; fi
  if [ -n "$STAGE" ]; then rm -rf "$STAGE"; fi
}

# source_path <path in the repository> <path under /opt/tracy-fleet>: that file in this run's
# source. A checkout is read by the first name; the image (staged in $STAGE with its own layout,
# which is this host's) by the second.
source_path() {
  if [ -n "$IMAGE" ]; then printf '%s/%s' "$STAGE" "$2"; else printf '%s/%s' "$FROM_DIR" "$1"; fi
}

print_list() {
  local repo under mode
  while read -r repo under mode; do
    [ -n "$repo" ] || continue
    printf 'file %s %s %s\n' "$repo" "$under" "$mode"
  done <<< "$FILES"
  while read -r repo under; do
    [ -n "$repo" ] || continue
    printf 'tree %s %s\n' "$repo" "$under"
  done <<< "$TREES"
  while read -r repo under; do
    [ -n "$repo" ] || continue
    printf 'need %s %s\n' "$repo" "$under"
  done <<< "$NEEDS"
}

fetch_image() {
  local part
  CID="$(docker create --pull never "$IMAGE" 2>/dev/null)" \
    || { CID=""; echo "sync-fleet-files: $IMAGE is not on this host (docker pull it first)" >&2; exit 1; }
  if ! docker cp "$CID:/opt/tracy-fleet/stack" "$STAGE/stack" >/dev/null 2>&1; then
    echo "sync-fleet-files: $IMAGE has no /opt/tracy-fleet/stack - built before W5 P4; install from a checkout (--from-dir)" >&2
    exit 3
  fi
  if [ ! -f "$STAGE/stack/sync-fleet-files.sh" ]; then
    echo "sync-fleet-files: $IMAGE carries no shard files in /opt/tracy-fleet/stack - built before the shard line (W3/W4 Task 18); install from a checkout (--from-dir)" >&2
    exit 3
  fi
  docker cp "$CID:/opt/tracy-fleet/dsh" "$STAGE/dsh" >/dev/null
  for part in lib provision tools webroot web; do docker cp "$CID:/opt/tracy-fleet/$part" "$STAGE/$part" >/dev/null; done
}

check_source() {
  local repo under mode
  while read -r repo under mode; do
    [ -n "$repo" ] || continue
    [ -f "$(source_path "$repo" "$under")" ] || MISSING="$MISSING $(source_path "$repo" "$under")"
  done <<< "$FILES"
  while read -r repo under; do
    [ -n "$repo" ] || continue
    [ -d "$(source_path "$repo" "$under")" ] || MISSING="$MISSING $(source_path "$repo" "$under")/"
  done <<< "$TREES"
  while read -r repo under; do
    [ -n "$repo" ] || continue
    [ -f "$(source_path "$repo" "$under")" ] || MISSING="$MISSING $(source_path "$repo" "$under")"
  done <<< "$NEEDS"
  if [ -n "$MISSING" ]; then
    echo "sync-fleet-files: missing in the source:$MISSING - nothing was changed" >&2
    exit 1
  fi
}

# put <source file> <path under DEST> <mode | keep>
put() {
  local src="$1" rel="$2" mode="$3" dest="$DEST/$2" mark
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    if [ "$DRY_RUN" = 0 ] && [ "$mode" != keep ]; then chmod "$mode" "$dest"; fi
    return 0
  fi
  if [ -e "$dest" ]; then mark='~'; else mark='+'; fi
  printf '  %s %s\n' "$mark" "$rel"
  CHANGED=$((CHANGED + 1))
  if [ "$DRY_RUN" = 1 ]; then return 0; fi
  mkdir -p "$(dirname "$dest")"
  cp -p "$src" "$dest.sync-tmp.$$"
  if [ "$mode" != keep ]; then chmod "$mode" "$dest.sync-tmp.$$"; fi
  mv -f "$dest.sync-tmp.$$" "$dest"
}

install_all() {
  local repo under mode root rel
  while read -r repo under mode; do
    [ -n "$repo" ] || continue
    put "$(source_path "$repo" "$under")" "$under" "$mode"
  done <<< "$FILES"
  while read -r repo under; do
    [ -n "$repo" ] || continue
    root="$(source_path "$repo" "$under")"
    while IFS= read -r rel; do
      put "$root/$rel" "$under/$rel" keep
    done < <(cd "$root" && find . -type f | sed 's|^\./||' | LC_ALL=C sort)
  done <<< "$TREES"
  if [ "$DRY_RUN" = 0 ]; then
    # The same as the deploy action: a checkout made on a filesystem without the x bit still runs.
    chmod +x "$DEST"/lib/*.sh "$DEST"/tools/*.sh "$DEST"/provision/*.sh 2>/dev/null || true
  fi
}

# Everything runs inside main, called once at the bottom: bash has then read the whole body, so
# replacing this very file halfway through (stack/sync-fleet-files.sh is in FILES) cannot change
# what this run executes.
main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --from-image) [ $# -ge 2 ] || die_usage "--from-image needs <repo:tag>"; IMAGE="$2"; shift ;;
      --from-dir) [ $# -ge 2 ] || die_usage "--from-dir needs a checkout"; FROM_DIR="$2"; shift ;;
      --dest) [ $# -ge 2 ] || die_usage "--dest needs a directory"; DEST="$2"; shift ;;
      --dry-run) DRY_RUN=1 ;;
      --list) LIST=1 ;;
      -h|--help) usage; exit 0 ;;
      *) die_usage "unknown argument: $1" ;;
    esac
    shift
  done
  if [ "$LIST" = 1 ]; then print_list; return 0; fi
  if [ -n "$IMAGE" ] && [ -n "$FROM_DIR" ]; then die_usage "one source only: --from-image or --from-dir"; fi
  if [ -z "$IMAGE" ] && [ -z "$FROM_DIR" ]; then die_usage "a source is needed: --from-image or --from-dir"; fi
  [ -d "$DEST" ] || die_usage "--dest $DEST is not an existing directory"
  trap cleanup EXIT
  if [ -n "$IMAGE" ]; then
    STAGE="$(mktemp -d "${TMPDIR:-/tmp}/sync-fleet-files.XXXXXX")"
    fetch_image
    FROM="image $IMAGE"
  else
    [ -d "$FROM_DIR" ] || die_usage "--from-dir $FROM_DIR is not a directory"
    FROM="checkout $FROM_DIR"
  fi
  check_source
  install_all
  if [ "$DRY_RUN" = 1 ]; then FROM="$FROM, dry run: nothing written"; fi
  echo "sync-fleet-files: $CHANGED changed under $DEST (from $FROM)"
}

main "$@"; exit $?
