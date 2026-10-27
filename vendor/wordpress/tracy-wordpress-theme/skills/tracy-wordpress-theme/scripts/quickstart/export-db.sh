#!/usr/bin/env bash
# Export the build stand's database as the quickstart SQL: table prefix kept literal, the stand's
# address replaced by the placeholder, gzip'd.
#
# `wp search-replace --export` and not `wp db export | sed`: WordPress serializes arrays with the
# byte LENGTH of every string inside, so a sed on a URL of a different length leaves those options
# unreadable — silently, and only where a URL happened to be. search-replace unserializes,
# replaces, re-serializes, and with --export writes the whole dump (DROP/CREATE/INSERT for every
# table) instead of touching the stand's database. Every column is rewritten, guid included:
# a quickstart's guid is nobody's feed identifier, and the pack must carry no trace of the stand.
#
# Usage: export-db.sh --wp "<runner>" --site-url <url> --out <file.sql.gz>
#        [--placeholder-url https://quickstart.invalid] [--prefix tr_] [--keep-passwords]
set -euo pipefail
WP=""; SITE_URL=""; OUT=""; PLACEHOLDER="https://quickstart.invalid"; PREFIX="tr_"; KEEP_PW=0
usage() {
  cat <<'USAGE'
usage: export-db.sh --wp "<runner>" --site-url <url> --out <file.sql.gz>
       [--placeholder-url <url>] [--prefix tr_] [--keep-passwords]

  --wp <runner>          wp-cli runner for the stand (e.g. "docker compose -p tracy-base-wp7 run --rm -T cli")
  --site-url <url>       the stand's own address (siteurl/home), replaced everywhere by the placeholder
  --out <file>           output, gzip'd SQL
  --placeholder-url      default https://quickstart.invalid
  --prefix               table prefix expected in the dump (default tr_) — checked, not rewritten
  --keep-passwords       do not blank user passwords / activation keys / login sessions
USAGE
}
while [ $# -gt 0 ]; do
  case "$1" in
    --wp) WP="$2"; shift 2 ;;
    --site-url) SITE_URL="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --placeholder-url) PLACEHOLDER="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --keep-passwords) KEEP_PW=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[ -n "$WP" ] && [ -n "$SITE_URL" ] && [ -n "$OUT" ] || { usage >&2; exit 2; }
SITE_URL="${SITE_URL%/}"
wp() { sh -c "$WP \"\$@\"" wp "$@"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
SQL="$TMP/database.sql"

echo "==> exporting with $SITE_URL → $PLACEHOLDER"
# --export with no file writes the dump to STDOUT and the report to STDERR. Every stand-URL
# spelling is replaced in one pass each: the plain form and the JSON-escaped one (block markup
# stores URLs inside JSON attributes as http:\/\/…).
wp search-replace "$SITE_URL" "$PLACEHOLDER" --all-tables --export --export_insert_size=200 --precise --quiet > "$SQL"
# A second pass on the exported TEXT for the JSON-escaped spelling: block markup keeps URLs in
# JSON attributes as `http:\/\/…`, which the dump writes as `http:\\/\\/…` once SQL-escaped. It
# sits inside JSON, whose lengths are not serialized, so a plain text replacement is exact here.
python3 - "$SQL" "$SITE_URL" "$PLACEHOLDER" <<'PY'
import sys; p, site, ph = sys.argv[1:4]
s = open(p, encoding='utf-8', errors='surrogateescape').read()
for bs in ('\\', '\\\\'):
    s = s.replace(site.replace('/', bs + '/'), ph.replace('/', bs + '/'))
open(p, 'w', encoding='utf-8', errors='surrogateescape').write(s)
PY
[ -s "$SQL" ] || { echo "export produced no SQL" >&2; exit 1; }

echo "==> checking the dump"
tables=$(grep -cE "^CREATE TABLE \`${PREFIX}" "$SQL" || true)
[ "$tables" -gt 0 ] || { echo "no CREATE TABLE \`${PREFIX}…\` in the dump — wrong prefix or empty export" >&2; exit 1; }
if grep -qF "$SITE_URL" "$SQL"; then
  echo "the stand address $SITE_URL is still in the dump:" >&2
  grep -nF "$SITE_URL" "$SQL" | head -5 | cut -c1-200 >&2
  exit 1
fi
grep -q "\`${PREFIX}options\`" "$SQL" || { echo "no ${PREFIX}options table in the dump" >&2; exit 1; }

# Passwords, activation keys and login sessions are scrubbed IN the text (scrub-sql.py): an
# appended UPDATE would leave the hash in the INSERT above it and the file would still carry it.
# Every account is unusable until the restorer sets a password — the j6 precedent.
python3 "$(dirname "$0")/scrub-sql.py" --file "$SQL" --prefix "$PREFIX" $([ "$KEEP_PW" = 1 ] && echo --keep-passwords)


gzip -n -6 -c "$SQL" > "$OUT"
bytes=$(wc -c < "$OUT" | tr -d ' ')
echo "wrote $OUT ($tables tables, $bytes bytes gzip'd, prefix $PREFIX, url $PLACEHOLDER)"
