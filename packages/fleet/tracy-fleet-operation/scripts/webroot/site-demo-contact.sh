#!/usr/bin/env bash
# Called only for a Website Opportunities build; retain the installed template's native form.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../lib/roots.sh"
LABEL=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --op) [[ "$2" == install ]] || exit 2; shift 2 ;;
    *) exit 2 ;;
  esac
done
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || exit 2
WEBROOT="$(tracy_webroot_dir "$LABEL")"
mkdir -p "$(tracy_private_dir "$LABEL")"
exec 9>"$(tracy_private_dir "$LABEL")/demo-contact.lock"
flock 9
VIEW="$WEBROOT/templates/tracy_business/html/com_contact/contact/default.php"
if [[ ! -f "$VIEW" ]]; then
  echo '{"ok":true,"skipped":"unsupported-template"}'
  exit 0
fi
if cmp -s "$HERE/demo-contact/tracydemocontact.php" "$WEBROOT/plugins/system/tracydemocontact/tracydemocontact.php" && grep -q 'TRACY_DEMO_CONTACT_PREVIEW' "$VIEW" && grep -q 'PlgSystemTracydemocontact::render' "$VIEW"; then
  echo '{"ok":true,"reused":true}'
  exit 0
fi
# Installing a system plugin changes files and database: require a full restore point first.
BACKUP="$(bash "$HERE/webroot-backup.sh" --label "$LABEL" --op create --title 'Before demo contact preview')"
python3 -c 'import json,sys; b=json.loads(sys.argv[1].splitlines()[-1]); assert b.get("ok") and b.get("database") and not b.get("databaseError"), "A full backup is required"' "$BACKUP"
CONTAINER="$(docker compose -f "$(tracy_compose_file "$LABEL")" ps -q web)"
[[ -n "$CONTAINER" && "$CONTAINER" != *$'\n'* ]] || exit 1
INSTALL_DIR="$(docker exec "$CONTAINER" mktemp -d /tmp/tracy-demo-contact.XXXXXX)"
trap 'docker exec "$CONTAINER" rm -rf "$INSTALL_DIR" >/dev/null' EXIT
docker cp "$HERE/demo-contact/." "$CONTAINER:$INSTALL_DIR/" >/dev/null
docker exec "$CONTAINER" chmod -R a+rX "$INSTALL_DIR"
if RESULT="$(docker exec -u www-data "$CONTAINER" php "$INSTALL_DIR/install.php")"; then
  :
else
  printf '%s\n' "$RESULT" >&2
  exit 1
fi
docker exec -u www-data -w /var/www/html "$CONTAINER" php cli/joomla.php cache:clean >&2
bash "$HERE/webroot-git.sh" --label "$LABEL" --op moment --title 'Prepare demo contact preview' >&2
printf '%s\n' "$RESULT"
