#!/usr/bin/env bash
#
# Which runtime serves a site, and the ONE way into it: `tracy_site_web_exec` / `tracy_site_db_exec`.
# Sourced, never run. Needs lib/roots.sh first.
#
# Two runtimes exist for a Joomla or WordPress site:
#
#   site   the per-site pair this fleet has always run: `<label>-web-1` (Apache + mod_php) and
#          `<label>-db-1` (MariaDB), one compose project per label. Every customer site, every
#          EmDash site, and a demo that was never folded.
#   farm   a template demo folded into the host's demo farm (provision/fold.sh): its PHP runs in an
#          FPM pool of `tracy-demos-web`, its database is one schema of `tracy-demos-db`, and its own
#          compose project keeps only a TCP forwarder still named `<label>-web-1` (lib/demo-farm.sh).
#
# The runtime is ONE file, `<private>/<label>/runtime`, holding the word `farm`. Absent = `site`.
# Anything else in it is refused rather than guessed: a script that execs into the wrong container
# of a folded demo lands in a forwarder with no PHP, or — worse — in the shared farm as root.
#
#   tracy_site_runtime LABEL            prints `site` or `farm`; exit 1 on a marker it cannot read
#   tracy_site_web_exec LABEL [opts] [--] CMD…
#        -i            keep stdin open (`docker exec -i`)
#        -t            allocate a tty
#        -u USER       default www-data. The farm refuses root: one root exec there reaches every
#                      demo on the host, not one site.
#        -w DIR        default the docroot. `/var/www/html[/…]` is the per-site container's docroot
#                      and is mapped to the farm's (`/site/<label>/.webroot[/…]`), so a caller written
#                      for the per-site container keeps working; `/site/<label>/…` is the same path in
#                      both.
#        -e KEY=VALUE  passed through (repeatable)
#      In the farm the command also gets the demo's own pool environment (label, mail, access key
#      file, TMPDIR) from `<farm>/exec/<label>.env`, so it runs AS the demo, not as the farm.
#   tracy_site_db_exec LABEL [-i] [--] CMD…
#        CMD runs in the database container that holds the site's data, with MYSQL_PWD (never on the
#        command line), TRACY_DB_NAME and TRACY_DB_USER set. When CMD is a MariaDB client
#        (mariadb, mysql, mariadb-dump, mysqldump, mariadb-admin, mysqladmin) the right `-u<user>`
#        is put after it — root of `<label>-db-1` per site, the demo's own user (grants on its own
#        schema only) in the farm.
#   tracy_site_db_name LABEL            the database name in the active runtime
#
# Part 1 of the demo farm adds these and converts only fold/unfold; the callers that still exec into
# `<label>-web-1` / `-db-1` directly are listed in the part-1 report (~/.ops-ram/part1-report.md).

TRACY_RUNTIME_MARKER_NAME=runtime
TRACY_DEMOS_WEB_CONTAINER="${TRACY_DEMOS_WEB_CONTAINER:-tracy-demos-web}"
TRACY_DEMOS_DB_CONTAINER="${TRACY_DEMOS_DB_CONTAINER:-tracy-demos-db}"

# The farm's own directory on this host: compose file, vhosts, pools, the farm's .env.
tracy_demos_dir() { printf '%s' "${TRACY_DEMOS_DIR:-$TRACY_PRIVATE_ROOT/_demos}"; }

tracy_site_runtime_file() { printf '%s/%s' "$(tracy_private_dir "$1")" "$TRACY_RUNTIME_MARKER_NAME"; }

tracy_site_runtime() { tracy_runtime_of_dir "$(tracy_private_dir "$1")" "$1"; }

# The same question asked of a site directory (render-compose.sh knows SITE_DIR, not the root).
tracy_runtime_of_dir() {
  local file="$1/$TRACY_RUNTIME_MARKER_NAME" who="${2:-$1}" value
  if [ ! -e "$file" ] && [ ! -L "$file" ]; then
    printf 'site\n'
    return 0
  fi
  if [ -L "$file" ] || [ ! -f "$file" ]; then
    echo "!! $file is not a plain file — refusing to guess which runtime serves $who" >&2
    return 1
  fi
  value="$(tr -d ' \t\r\n' < "$file")"
  case "$value" in
    farm) printf 'farm\n' ;;
    *) echo "!! $file says '$value', not 'farm' — refusing to guess which runtime serves $who" >&2; return 1 ;;
  esac
}

# The farm's docroot for a label: where the farm mounts the demo's webroot (lib/demo-farm.sh), and
# the same path every per-site web container also mounts it at (render-compose.sh tracy_site_mounts).
tracy_farm_docroot() { printf '/site/%s/.webroot' "$1"; }

# The pool environment an exec in the farm runs with (written by fold.sh, lib/demo-farm.sh).
tracy_farm_exec_env_file() { printf '%s/exec/%s.env' "$(tracy_demos_dir)" "$1"; }

# One value of a site's .env (no sourcing: the file is data).
_tracy_site_dotenv() {
  sed -n "s/^$2=//p" "$(tracy_private_dir "$1")/.env" 2>/dev/null | sed -n 1p
}

tracy_site_web_exec() {
  local label="$1"; shift
  tracy_require_label "$label"
  local runtime user="www-data" workdir="" interactive=() envs=()
  runtime="$(tracy_site_runtime "$label")" || return 1
  while [ $# -gt 0 ]; do
    case "$1" in
      -i) interactive+=(-i); shift ;;
      -t) interactive+=(-t); shift ;;
      -it|-ti) interactive+=(-i -t); shift ;;
      -u) user="${2:?-u needs a user}"; shift 2 ;;
      -w) workdir="${2:?-w needs a directory}"; shift 2 ;;
      -e) envs+=(-e "${2:?-e needs KEY=VALUE}"); shift 2 ;;
      --) shift; break ;;
      -*) echo "tracy_site_web_exec: unknown option $1" >&2; return 2 ;;
      *) break ;;
    esac
  done
  [ $# -gt 0 ] || { echo "tracy_site_web_exec: no command" >&2; return 2; }

  if [ "$runtime" = site ]; then
    docker exec ${interactive[@]+"${interactive[@]}"} -u "$user" -w "${workdir:-/var/www/html}" \
      ${envs[@]+"${envs[@]}"} "$label-web-1" "$@"
    return
  fi

  local docroot env_file
  docroot="$(tracy_farm_docroot "$label")"
  case "$user" in
    root|0|0:*|root:*)
      echo "!! $label is served by the demo farm: a root exec there reaches every demo on this host — refused" >&2
      return 1 ;;
  esac
  case "$workdir" in
    '') workdir="$docroot" ;;
    /var/www/html) workdir="$docroot" ;;
    /var/www/html/*) workdir="$docroot/${workdir#/var/www/html/}" ;;
    "/site/$label"|"/site/$label/"*) ;;
    *) echo "!! $label is served by the demo farm: -w $workdir is outside the demo's own folder — refused" >&2
       return 1 ;;
  esac
  env_file="$(tracy_farm_exec_env_file "$label")"
  [ -f "$env_file" ] || { echo "!! $label is marked farm but $env_file is missing — fold.sh did not finish" >&2; return 1; }
  docker exec ${interactive[@]+"${interactive[@]}"} -u "$user" -w "$workdir" --env-file "$env_file" \
    ${envs[@]+"${envs[@]}"} "$TRACY_DEMOS_WEB_CONTAINER" "$@"
}

# The (container, user, password, database) of a label's data in the active runtime, into
# SITE_DB_CONTAINER, SITE_DB_USER, SITE_DB_PASSWORD, SITE_DB_NAME.
tracy_site_db_target() {
  local label="$1" runtime compose
  runtime="$(tracy_site_runtime "$label")" || return 1
  if [ "$runtime" = farm ]; then
    SITE_DB_CONTAINER="$TRACY_DEMOS_DB_CONTAINER"
    SITE_DB_USER="$(_tracy_site_dotenv "$label" FARM_DB_USER)"
    SITE_DB_PASSWORD="$(_tracy_site_dotenv "$label" FARM_DB_PASSWORD)"
    SITE_DB_NAME="$(_tracy_site_dotenv "$label" FARM_DB_NAME)"
  else
    compose="$(tracy_compose_file "$label")"
    SITE_DB_CONTAINER="$label-db-1"
    SITE_DB_USER=root
    SITE_DB_PASSWORD="$(_tracy_site_dotenv "$label" DB_PASSWORD)"
    SITE_DB_NAME="$(sed -n 's/^ *MARIADB_DATABASE: *//p' "$compose" 2>/dev/null | tr -d '"' | sed -n 1p)"
  fi
  if [ -z "$SITE_DB_USER" ] || [ -z "$SITE_DB_PASSWORD" ] || [ -z "$SITE_DB_NAME" ]; then
    echo "!! cannot tell the $runtime database of $label (user, password or name missing)" >&2
    return 1
  fi
}

tracy_site_db_name() {
  tracy_site_db_target "$1" || return 1
  printf '%s\n' "$SITE_DB_NAME"
}

tracy_site_db_exec() {
  local label="$1"; shift
  tracy_require_label "$label"
  local interactive=()
  while [ $# -gt 0 ]; do
    case "$1" in
      -i) interactive+=(-i); shift ;;
      --) shift; break ;;
      -*) echo "tracy_site_db_exec: unknown option $1" >&2; return 2 ;;
      *) break ;;
    esac
  done
  [ $# -gt 0 ] || { echo "tracy_site_db_exec: no command" >&2; return 2; }
  tracy_site_db_target "$label" || return 1
  local cmd=("$1"); shift
  case "${cmd[0]}" in
    mariadb|mysql|mariadb-dump|mysqldump|mariadb-admin|mysqladmin) cmd+=("-u$SITE_DB_USER") ;;
  esac
  # `-e MYSQL_PWD` with no value: docker takes it from this process's environment, so the password
  # is never an argument anyone on the host can read in `ps`.
  MYSQL_PWD="$SITE_DB_PASSWORD" docker exec ${interactive[@]+"${interactive[@]}"} -e MYSQL_PWD \
    -e "TRACY_DB_NAME=$SITE_DB_NAME" -e "TRACY_DB_USER=$SITE_DB_USER" \
    "$SITE_DB_CONTAINER" "${cmd[@]}" "$@"
}

# An operation that changes a site's OWN runtime (its image, PHP, limits, mounts, network, host) has
# no meaning for a demo folded into the demo farm: that runtime is the farm, shared by every folded
# demo. Such a script asks this before it changes anything, and ends on its refusal.
#   tracy_refuse_if_farm SITE_DIR LABEL WHAT     0 = not a farm demo, go on; 1 = refused (said why)
# A marker that cannot be read is a refusal too: guessing `site` would act on the forwarder.
tracy_refuse_if_farm() {
  local runtime
  runtime="$(tracy_runtime_of_dir "$1" "$2")" || return 1
  [ "$runtime" = farm ] || return 0
  echo "!! $2 is a demo served by the demo farm — $3 does not apply there; unfold it first (provision/unfold.sh $2), then run this again" >&2
  return 1
}
