#!/bin/bash
# Reset remote D1 database by deleting and recreating it.
# With Access auth + autoProvision, users are recreated on first login.
#
# Usage: pnpm db:reset:remote

set -euo pipefail

DB_NAME="emdash-demo"
WRANGLER_CONFIG="wrangler.jsonc"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "Deleting database '$DB_NAME'..."
npx wrangler d1 delete "$DB_NAME" --skip-confirmation

echo "Creating new database '$DB_NAME'..."
OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1)
echo "$OUTPUT"

# Extract new database ID from output
NEW_ID=$(echo "$OUTPUT" | grep -o '"database_id": "[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$NEW_ID" ]; then
  echo "Failed to extract new database ID"
  exit 1
fi

echo "New database ID: $NEW_ID"

# Update wrangler.jsonc with new ID
if [ -f "$WRANGLER_CONFIG" ]; then
  echo "Updating $WRANGLER_CONFIG with new database ID..."
  sed -i '' "s/\"database_id\": \"[^\"]*\"/\"database_id\": \"$NEW_ID\"/" "$WRANGLER_CONFIG"
fi

echo ""
echo "Database recreated. Next steps:"
echo "  1. pnpm deploy        (redeploy with new DB ID)"
echo "  2. Visit /_emdash/admin to run setup wizard (applies seed content)"
echo "  3. Access will auto-provision your admin user on first login"
