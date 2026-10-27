#!/usr/bin/env bash
#
# attach-site — show one site's folder to the dsh this host runs, at the path the agent uses.
#
#   attach-site.sh <label>
#
# ## What it does
#
# From Plan 3 there is ONE dsh per fleet host, and it serves every site on it. That container has
# /srv/tracy-sites bind-mounted at /site, so a site is reachable to the agent exactly when its
# folder is bound under /srv/tracy-sites/<label>:
#
#   /srv/tracy/<label>/site      ->  /srv/tracy-sites/<label>            (seen as /site/<label>)
#   /srv/tracy/<label>/webroot   ->  /srv/tracy-sites/<label>/.webroot   (emdash: data + uploads)
#
# `provision/detach-site.sh` is the other half, and teardown runs it. Anything added here is added
# there too, or the host inherits a mount and an /etc/fstab line for a site that no longer exists.
#
# ## Why a bind and not a mount of /srv/tracy
#
# /srv/tracy/<label> also holds the site's `.env` and `tracy-agent.token`, both 0600 and both
# secrets. Mounting the parent would put every site's secrets inside a container that runs every
# site's sessions. One bind per site, of the one directory that is the team's, keeps the boundary
# where the seat check already draws it.
#
# ## All or nothing, and nothing before everything is checked
#
# Every source is checked BEFORE the first mount and before the first line of /etc/fstab. A run
# that binds the site folder, writes an fstab line and then dies on a missing webroot reports
# failure while having changed the host — and the next person to run it by hand has no way to know
# they are running it a second time. So: check, then act, and roll back this run's own mounts if
# an action still fails.
#
# ## Idempotent, and it asks where a mount POINTS
#
# `mountpoint -q` answers "something is mounted here", which is not the question. A label that has
# been torn down and provisioned again finds the old bind still standing, pointing at the deleted
# directory's inode — the agent then reads the previous site's files and nothing anywhere reports
# an error. So the source is compared, and a mount pointing elsewhere is replaced.
#
# ## Propagation
#
# /srv/tracy-sites is made a shared mount, and the dsh container takes it `rshared`. Without that,
# a bind made after the container started stays invisible inside it — the site would appear only
# after a dsh restart, and a restart drops every session on the host.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/fstab.sh
. "$HERE/../lib/fstab.sh"
# `bind_source_matches` and the findmnt parsing it rests on. In a library because this script
# refuses to run without root on Linux, so nothing inside it can be reached by a test — and the
# parsing is where the last bug was.
# shellcheck source=../lib/mounts.sh
. "$HERE/../lib/mounts.sh"
# `container_confinement_problem`, and the measurement that made it necessary. Attaching a site is
# the moment its folder becomes reachable from the agent's shell, so it is the moment to ask
# whether that shell is still inside something.
# shellcheck source=../lib/container-confinement.sh
. "$HERE/../lib/container-confinement.sh"

LABEL="${1:-}"
ROOT="${TRACY_ROOT:-/srv/tracy}"
SITES="${TRACY_SITES_ROOT:-/srv/tracy-sites}"

[ -n "$LABEL" ] || { echo "use: attach-site.sh <label>" >&2; exit 2; }
# The label reaches `mount`, /etc/fstab and a path. Keep it to what a site label can legally be —
# and refuse `.` and `..` by name, because they pass every character test there is and mean
# something else entirely when pasted into a path.
case "$LABEL" in
  .|..|.*|*/*|*[!A-Za-z0-9._-]*) echo "unusable label: $LABEL" >&2; exit 2 ;;
esac

SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no site directory at $SITE_DIR" >&2; exit 1; }

# The dev machine still has to get through here. Binds are a Linux thing and need root; on macOS
# the whole idea is absent, and the sites there are reached another way (the compose test bed in
# packages/tools/tracy-subprocess-docker/dev). Skipped out loud, and successfully: a provision on a
# laptop must not report a failure for a step that does not apply to it.
if [ "$(uname -s)" != Linux ]; then
  echo "==> not Linux — skipping the bind of /site/$LABEL (nothing to attach to on this machine)"
  exit 0
fi
if [ "$(id -u)" != 0 ]; then
  echo "==> not root — skipping the bind of /site/$LABEL (run attach-site.sh $LABEL as root on the host)"
  exit 0
fi

# Which CMS, because emdash keeps its site in a database and two directories rather than a webroot.
#
# ⚠ NOT FROM THE SHAPE OF THE DIRECTORY. provision.sh creates `webroot/` for every platform, emdash
# included, so "has no webroot" is never true and an emdash site would be bound like a PHP one:
# an empty webroot at `.webroot`, and `data`/`uploads` never bound at all. The agent then opens the
# site and describes, fluently, a site with no content — the exact failure create-lane.sh recorded
# (that script is gone since 2026-09-06; the failure it recorded is not)
# on tchemdash1. So: what provision wrote down, then what the compose file says it runs.
tracy_site_platform() {
  local from_env
  from_env="$(sed -n 's/^PLATFORM=//p' "$SITE_DIR/.env" 2>/dev/null | head -1 || true)"
  if [ -n "$from_env" ]; then printf '%s\n' "$from_env"; return 0; fi
  if grep -qs '^ *image:.*emdash' "$SITE_DIR/docker-compose.yml"; then printf 'emdash\n'; return 0; fi
  printf 'other\n'
}
PLATFORM="$(tracy_site_platform)"

# ── The web container must still be confined ────────────────────────────────────────────────────
#
# 🔒 THIS REFUSES, IT DOES NOT WARN. Attaching is what makes /site/<label> reachable from the
# agent's shell, and that shell is a `docker exec` into `<label>-web-1`. The socket proxy bounds
# WHICH container that is; it cannot bound the exec's request body, so a privileged root exec into
# that container is reachable (measured — see lib/container-confinement.sh). Everything standing
# between that and root on the HOST is the web container's own seccomp/AppArmor profile. A site
# that has lost it must not be handed to the agent, and "attached anyway, with a warning in a log"
# is how it would be.
#
# The refusal is loud and it names the fix, because the operator reading it did not cause it: the
# usual origin is a `--privileged` someone added once to debug a mount and never took off.
WEB_CONTAINER="$LABEL-web-1"
if ! command -v docker >/dev/null 2>&1; then
  # No docker: this is not a fleet host. Say so at the same volume as a refusal — a check that
  # skips quietly is a check that reports the same green as a check that passed.
  echo "!! no docker on PATH — SKIPPING the confinement check on $WEB_CONTAINER." >&2
  echo "!! On a fleet host this check is what keeps a privileged web container out of the agent's reach." >&2
elif CONFINEMENT="$(docker inspect "$WEB_CONTAINER" \
    --format '{{.HostConfig.Privileged}} {{.HostConfig.SecurityOpt}}' 2>/dev/null)"; then
  # `false [seccomp=unconfined …]` — the first word is Privileged, the rest is the option list.
  CONFINEMENT_PROBLEM="$(container_confinement_problem "${CONFINEMENT%% *}" "${CONFINEMENT#* }")"
  if [ -n "$CONFINEMENT_PROBLEM" ]; then
    echo "!! refusing to attach $LABEL: $CONFINEMENT_PROBLEM" >&2
    echo "!! $WEB_CONTAINER: $CONFINEMENT" >&2
    echo "!! Re-create it under the default profile (render-compose.sh writes one), then run this again." >&2
    exit 1
  fi
else
  # No container yet is not a failure: provision attaches the site on the same run that starts it,
  # and a migration may attach a site whose stack is down. There is nothing unsafe about a
  # container that does not exist — and the next attach checks again.
  echo "==> no container named $WEB_CONTAINER — nothing to check yet (checked again on the next attach)"
fi

# source -> target, in the order they must be mounted (a nested target after its parent).
BINDS=()
BINDS+=("$SITE_DIR/site|$SITES/$LABEL")
if [ "$PLATFORM" = emdash ]; then
  BINDS+=("$SITE_DIR/data|$SITES/$LABEL/.webroot/data")
  BINDS+=("$SITE_DIR/uploads|$SITES/$LABEL/.webroot/uploads")
fi
# 🔒 NO webroot bind for Joomla/WordPress any more, and its absence is the fix, not an omission.
# That line used to be `$SITE_DIR/webroot|$SITES/$LABEL/.webroot`: under the OLD single root the
# webroot was provisioned under the PRIVATE root and this bind was what made it visible at
# $SITES/$LABEL/.webroot, where dsh reads it. Since Plan 3 Task 2 provisioning writes STRAIGHT to
# tracy_webroot_dir() — which IS $SITES/$LABEL/.webroot — so the target already holds the site.
# Re-creating the bind would mount the near-empty private directory OVER the real webroot and hide
# it. The emdash pair above stays: those two source directories are still under the private root.

# ── check everything first ──────────────────────────────────────────────────────────────
missing=""
for pair in "${BINDS[@]}"; do
  source="${pair%%|*}"
  [ -d "$source" ] || missing="$missing $source"
done
if [ -n "$missing" ]; then
  echo "!! $LABEL is not attachable — these directories do not exist:$missing" >&2
  echo "   nothing was mounted and /etc/fstab was not touched." >&2
  exit 1
fi

# ── act, remembering what this run mounted ──────────────────────────────────────────────
MOUNTED=()
rollback() {
  local i
  for (( i = ${#MOUNTED[@]} - 1; i >= 0; i-- )); do
    umount "${MOUNTED[$i]}" 2>/dev/null || true
  done
}

bind_once() { # source target
  local source="$1" target="$2"
  mkdir -p "$target"
  if mountpoint -q "$target"; then
    bind_source_matches "$target" "$source" && return 0
    echo "    remounting $target — it was pointing somewhere else"
    umount "$target" || { echo "!! could not unmount the stale bind at $target" >&2; return 1; }
  fi
  mount --bind "$source" "$target" || return 1
  MOUNTED+=("$target")
}

# The parent has to be a mount point of its own before it can be shared, and shared before a bind
# made now can reach a container that started earlier. Both are cheap and both are asked first.
mkdir -p "$SITES"
if ! mountpoint -q "$SITES"; then
  mount --bind "$SITES" "$SITES"
fi
mount --make-rshared "$SITES"
# `shared` beside `bind` so a reboot brings back the propagation as well as the mount; without it
# the first site attached after a reboot is invisible to a dsh that is already running. No
# `nofail` needed on this one: its source is its own target, so it cannot go missing while the
# line exists — and if /srv/tracy-sites itself is gone, the host has bigger news.
tracy_fstab_add "$SITES" "$SITES" "bind,shared"

for pair in "${BINDS[@]}"; do
  source="${pair%%|*}"; target="${pair##*|}"
  if ! bind_once "$source" "$target"; then
    echo "!! could not bind $source -> $target — undoing this run" >&2
    rollback
    exit 1
  fi
done
# Only once every mount stands: an fstab line for a bind that did not happen is a line that fails
# at the next boot, and `nofail` is what keeps that from taking the host with it.
for pair in "${BINDS[@]}"; do
  tracy_fstab_add "${pair%%|*}" "${pair##*|}"
done

echo "==> attached /site/$LABEL"
