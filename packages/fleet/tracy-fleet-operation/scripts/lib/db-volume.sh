#!/usr/bin/env bash
#
# Whether a database password minted by THIS run can open the database this stack will start.
#
# Sourced by `provision/provision.sh`, never executed. It lives here so a test can ask the question
# against a fake `docker` without standing a site up.
#
# MariaDB keeps the root password it was first initialised with, in its volume, and ignores
# MARIADB_ROOT_PASSWORD on every later boot. provision.sh reuses the password from the stack's own
# `.env`; when there is no `.env` it mints a new one — and that is only right when the volume is
# new too. Two ways it is not, both measured:
#
#   * ANOTHER STACK OWNS THE COMPOSE PROJECT. Compose names the project after the directory, so
#     `/srv/tracy/<label>` (an older root) and `/srv/tracy-private/<label>` are the SAME project and
#     share `<label>_db`. Measured 23/09 on tracy-fleet-01: `business-joomla` from the tracy.ai
#     days (volume created 14/09, web container up 8 days) was still running under `/srv/tracy`;
#     the new provision recreated its `db` container over the old volume, and the readiness loop
#     was refused 90 times ("Access denied for user 'root'") before saying "database never became
#     ready" — three minutes, and a reason that sent the reader to the database, not the stack.
#   * THE VOLUME OUTLIVED ITS STACK: `.env` gone, `<label>_db` still there. Same symptom.
#
# 🔒 THIS REFUSES; IT NEVER REMOVES. The other stack may be serving, and an orphaned volume may be
# the only copy of somebody's database. Which of them may go is a person's call; this only names
# the stack or volume and the command, before anything on the host has been touched.
#
# 🔒 A DOCKER THAT CANNOT BE READ IS A REFUSAL, not "nothing there" (the fail-open `site-port.sh`
# was bitten by): an unanswered question is not a clean host.

# tracy_db_volume_conflict <label> <site-dir>
# Prints the reason and returns 1 when a freshly minted password would be refused; returns 0
# silently when the stack's database will be new.
tracy_db_volume_conflict() {
  local label="$1" dir="$2" owners volumes
  if ! owners="$(docker ps -a --filter "label=com.docker.compose.project=$label" \
      --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>&1)"; then
    echo "cannot ask docker which stack owns compose project $label: $owners"
    return 1
  fi
  owners="$(printf '%s\n' "$owners" | sed '/^$/d' | sort -u | grep -vxF "$dir" || true)"
  if [ -n "$owners" ]; then
    echo "compose project $label already belongs to the stack at $(printf '%s' "$owners" | tr '\n' ' ')— its ${label}_db volume holds a password this run cannot know. Tear that stack down first (cd <that dir> && docker compose down --volumes)"
    return 1
  fi
  if ! volumes="$(docker volume ls -q --filter "name=^${label}_db\$" 2>&1)"; then
    echo "cannot ask docker whether volume ${label}_db exists: $volumes"
    return 1
  fi
  if printf '%s\n' "$volumes" | grep -xF "${label}_db" >/dev/null; then
    echo "volume ${label}_db outlived its stack: $dir/.env names no DB_PASSWORD, so this run cannot open it. Drop it (docker volume rm ${label}_db) if nothing in it is still wanted"
    return 1
  fi
  return 0
}
