#!/usr/bin/env bash
set -euo pipefail

FIXTURE_DIR="${1:?Usage: $0 <fixture-dir>}"
HOST="${2:-http://localhost:8787}"

if [ ! -f "$FIXTURE_DIR/manifest.json" ]; then
	echo "Error: $FIXTURE_DIR/manifest.json not found" >&2
	exit 1
fi

TMPFILE=$(mktemp /tmp/audit-bundle-XXXXXX.tar.gz)
trap 'rm -f "$TMPFILE"' EXIT

tar -czf "$TMPFILE" -C "$FIXTURE_DIR" .

curl -s -X POST "$HOST/api/v1/dev/audit" \
	-F "bundle=@$TMPFILE" | jq
