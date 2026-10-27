#!/usr/bin/env bash
# A wp-cli stand-in for the export-db.sh test: `search-replace … --export` prints the fixture dump
# with the requested replacement applied to plain (non-escaped) occurrences only, the way wp-cli's
# serialized-aware replace leaves JSON-escaped spellings alone. Anything else is unsupported.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
if [ "$1" = "search-replace" ]; then
  old="$2"; new="$3"
  python3 - "$here/dump.sql" "$old" "$new" <<'PY'
import sys; p, a, b = sys.argv[1:4]
print(open(p).read().replace('https://quickstart.invalid', a).replace(a, b), end='')
PY
  exit 0
fi
echo "fake wp: unsupported $*" >&2; exit 3
