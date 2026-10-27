#!/bin/sh
# Seed the local stand: dev/seed.sql (pages, menu, style), then the bodies SQL cannot read —
# the home page carries the chosen design system's own fixture (pixel for pixel the preview's
# Home chip), the style guide and contact pages carry the section library.
#
#   dev/seed.sh [--host unix:///path/to/docker.sock] [--fixture <id>]
#
# --fixture <id> only rewrites the home body for that design system (demo.sh calls it on every
# style switch, because the fixture markup is the system's own).
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
SECTIONS="$HERE/../src/tpl_tracy/sections"
FIXTURE_BODY="$HERE/../../tracy-cms-sections/scripts/fixture-body.mjs"
ARTIFACT_BODY="$HERE/../../tracy-cms-sections/scripts/artifact-body.mjs"
HOST_FLAG=""
ONLY_FIXTURE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST_FLAG="-H $2"; shift 2 ;;
    --fixture) ONLY_FIXTURE="$2"; shift 2 ;;
    *) echo "seed: unknown argument $1" >&2; exit 2 ;;
  esac
done

# shellcheck disable=SC2086
sql() { docker $HOST_FLAG compose -f "$HERE/compose.yml" exec -T db mariadb -uroot -ptracy-dev joomla "$@" 2>/dev/null; }

# One article body from one file: quote for SQL and update by alias.
put_body() {
  alias="$1"
  file="$2"
  body="$(sed "s/\\\\/\\\\\\\\/g; s/'/''/g" "$file")"
  printf "UPDATE jos_content SET \`fulltext\` = '%s' WHERE alias = '%s';\n" "$body" "$alias" | sql
}

put_fixture() {
  id="$1"
  tmp="$(mktemp)"
  node "$ARTIFACT_BODY" "$id" landing > "$tmp"
  put_body home "$tmp"
  node "$FIXTURE_BODY" "$id" > "$tmp"
  put_body design "$tmp"
  rm -f "$tmp"
  echo "seed: home carries the $id landing artifact, design its fixture."
}

if [ -n "$ONLY_FIXTURE" ]; then
  put_fixture "$ONLY_FIXTURE"
  exit 0
fi

# seed.sql inserts; a second run would double the articles and the menu. Bodies can be refreshed any time.
if [ "$(sql -N -e "SELECT COUNT(*) FROM jos_content WHERE alias = 'home'")" = "0" ]; then
  sql < "$HERE/seed.sql"
else
  echo "seed: content already seeded — refreshing the bodies only (down -v to start over)."
fi

current="$(sql -N -e "SELECT JSON_UNQUOTE(JSON_EXTRACT(params, '\$.inspiration')) FROM jos_template_styles WHERE template = 'tpl_tracy' AND client_id = 0 LIMIT 1")"
put_fixture "${current:-brutalism}"
put_body sections "$SECTIONS/landing.html"
put_body style-guide "$SECTIONS/styleguide.html"
put_body contact "$SECTIONS/contact.html"
echo "seed: sections, style-guide and contact carry the section library."
