#!/usr/bin/env bash
# Phase 10 · Q1b — run gen-docs.php inside the site's PHP runtime without copying the script into
# the site tree. The four generated docs land in templates/<tpl>/docs/; nothing else is written.
#
#   gen-docs.sh --template <tpl> (--container <name> | --ddev) [options passed to gen-docs.php]
#
#   --container <name>   docker: the web container (script piped over `docker exec -i`)
#   --ddev               DDEV: `ddev exec php` from the current project
#   --template <tpl>     template folder under templates/ (required)
#   --base <url> · --block-prefix <p> · --layout-prefix <p> · --base-template <name>
#   --purposes <path>    JSON of position → purpose, path AS SEEN INSIDE the runtime
#   --root <dir>         Joomla root inside the runtime (default /var/www/html)
#
# Run it after the LAST content change and before the Akeeba capture — the backup takes the
# site as-is, so a run before the final edit ships a stale inventory (packaging-quickstart.md §Q1b).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
container="" ddev=0 args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --container) container="${2:?--container needs a name}"; shift 2 ;;
    --ddev) ddev=1; shift ;;
    --template|--base|--block-prefix|--layout-prefix|--base-template|--purposes|--root)
      [ $# -ge 2 ] || { echo "gen-docs.sh: $1 needs a value" >&2; exit 2; }
      args+=("$1=$2"); shift 2 ;;
    --help|-h) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "gen-docs.sh: unknown argument $1 (see --help)" >&2; exit 2 ;;
  esac
done
printf '%s\n' "${args[@]:-}" | grep -q '^--template=' || { echo "gen-docs.sh: --template <tpl> is required" >&2; exit 2; }
if [ -n "$container" ] && [ "$ddev" = 1 ]; then echo "gen-docs.sh: choose --container or --ddev, not both" >&2; exit 2; fi
if [ -z "$container" ] && [ "$ddev" = 0 ]; then echo "gen-docs.sh: need --container <name> or --ddev" >&2; exit 2; fi

# A stray DOCKER_HOST makes `docker exec` reach for another machine; the site is on this one.
unset DOCKER_HOST
script="$here/gen-docs.php"
if [ -n "$container" ]; then
  docker exec -i "$container" bash -c 'cat > /tmp/gen-docs.php && php /tmp/gen-docs.php "$@"; rc=$?; rm -f /tmp/gen-docs.php; exit $rc' _ "${args[@]}" < "$script"
else
  ddev exec bash -c 'cat > /tmp/gen-docs.php && php /tmp/gen-docs.php "$@"; rc=$?; rm -f /tmp/gen-docs.php; exit $rc' _ "${args[@]}" < "$script"
fi
