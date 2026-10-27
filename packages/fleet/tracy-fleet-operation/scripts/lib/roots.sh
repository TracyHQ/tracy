#!/usr/bin/env bash
#
# The fleet host's two roots — and the paths every script above derives from them.
#
# Sourced, never executed, at the top of every script under provision/, webroot/, platform/ and
# tools/ that touches a site's files. Plan 5 moves a host from one root (today: /srv/tracy, with
# /srv/tracy-sites bind-mounted over its site/ and webroot/) to two — TRACY_SITES_ROOT (what dsh
# mounts at /site) and TRACY_PRIVATE_ROOT (secrets, compose.yml, the baseline git repo) — with no
# bind mount between them. This file is the ONLY place that split is named: every caller asks it
# for a path instead of building one, so the day a host migrates, defaults change here and nowhere
# else has to move.
#
# Two roots. Defaults are today's single root, so a host that has not migrated keeps working.
: "${TRACY_SITES_ROOT:=/srv/tracy-sites}"      # what dsh mounts at /site — <label>/ is the site folder, <label>/.webroot the running site
: "${TRACY_PRIVATE_ROOT:=/srv/tracy}"          # .env, tokens, apache/, compose.yml, work/, webroot-baseline.git
: "${TRACY_FLEET_DIR:=/opt/tracy-fleet}"
# Where READERS look for provision's per-site lock (webroot-git.sh `provision_running`). The lock
# itself is a fixed contract: provision.sh holds `/var/lock/tracy-provision-<label>.lock` literally and
# tracy-host waits on that same path (`content-identity.js` `provisionLock`; gate
# check-infra-contracts). This variable exists only so a test can point the reader at a lock it
# holds itself; on a host it stays /var/lock.
: "${TRACY_PROVISION_LOCK_DIR:=/var/lock}"
# A site label as tracy-host's door takes one (`SAFE_LABEL`, apps/tracy-host/src/provision.js): one
# path segment — never `.` or `..`, never a `/`, never a leading `-`. Every path below is built from
# a label, so a script that reads one from its argv calls this at its top level, after parsing and
# before any path is built: the second fence behind the door, which once let `--label ../../etc`
# reach teardown.sh (QA run 20/10/2026). Exits the script; never call it inside `$(...)`.
tracy_require_label() {
  if [[ ! "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "refused label: ${1:-}" >&2
    exit 2
  fi
}
tracy_site_dir()    { printf '%s/%s' "$TRACY_SITES_ROOT" "$1"; }          # site folder (AGENTS.md …)
tracy_webroot_dir() { printf '%s/%s/.webroot' "$TRACY_SITES_ROOT" "$1"; }
tracy_private_dir() { printf '%s/%s' "$TRACY_PRIVATE_ROOT" "$1"; }
tracy_repo_dir()    { printf '%s/%s/webroot-baseline.git' "$TRACY_PRIVATE_ROOT" "$1"; }
# A site's compose file, in the private dir. provision (render-compose.sh) writes
# `docker-compose.yml`; `compose.yml` is accepted too for stacks laid out by hand. The names are
# listed once here, in preference order: site-address.sh exports them to Python, and site-address.py
# reads this line itself when loaded directly, so no second copy of the rule exists (keep the
# single-quoted one-line form it parses). With neither file present the provision
# name is returned, so the caller's docker/read error names the file provision would have written.
TRACY_COMPOSE_NAMES='docker-compose.yml compose.yml'
tracy_compose_file() {
  local dir name
  dir="$(tracy_private_dir "$1")"
  for name in $TRACY_COMPOSE_NAMES; do
    if [ -f "$dir/$name" ]; then printf '%s/%s' "$dir" "$name"; return 0; fi
  done
  printf '%s/docker-compose.yml' "$dir"
}
: "${TRACY_BRANDS_DIR:=$TRACY_PRIVATE_ROOT/_brands}"
# `TRACY_SRV` (webroot-backup.sh and the test suite) is the OLD name of the private root: honour
# it. `if`, not `[ ... ] && ...`: every caller sources this file under `set -e`, and a bare `&&`
# chain whose left side is false (the ordinary case — TRACY_SRV is unset almost everywhere) returns
# 1 as the file's own exit status, which `set -e` treats as this sourced file itself having failed
# and kills the caller before its own first line. Measured: `bash -euo pipefail -c '. roots.sh;
# echo reached'` prints nothing and exits 1 with TRACY_SRV unset.
if [ -n "${TRACY_SRV:-}" ]; then TRACY_PRIVATE_ROOT="$TRACY_SRV"; fi
