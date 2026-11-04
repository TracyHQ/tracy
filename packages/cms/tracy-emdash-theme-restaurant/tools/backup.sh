#!/usr/bin/env bash
# Snapshot a site's runtime state (SQLite + uploads + receipts + token) into one archive.
#   tools/backup.sh [data-dir] [uploads-dir] [out-dir]
# SQLite is copied with the online backup API (consistent even while the site runs).
set -euo pipefail
DATA="${1:-./data}"; UPLOADS="${2:-./uploads}"; OUT="${3:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$(mktemp -d)"
mkdir -p "$OUT" "$TMP/data"
node -e "const D=require('better-sqlite3');new D(process.argv[1],{readonly:true}).backup(process.argv[2]).then(()=>process.exit(0))" "$DATA/data.db" "$TMP/data/data.db"
for f in tracy-agent.token seed-receipts.json; do [ -f "$DATA/$f" ] && cp "$DATA/$f" "$TMP/data/"; done
[ -d "$UPLOADS" ] && cp -R "$UPLOADS" "$TMP/uploads"
NAME="$(node -e "try{process.stdout.write(require('./template.config.json').id||'site')}catch{process.stdout.write('site')}" 2>/dev/null || echo site)"
ARCHIVE="$OUT/$NAME-$STAMP.tgz"
tar -C "$TMP" -czf "$ARCHIVE" .
rm -rf "$TMP"
echo "$ARCHIVE $(du -h "$ARCHIVE" | cut -f1)"
