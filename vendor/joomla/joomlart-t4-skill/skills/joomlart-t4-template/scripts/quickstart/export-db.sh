#!/usr/bin/env bash
# Dump the live demo DB and tokenize the table prefix to `#__` for the bundled quickstart SQL.
#
# Usage (run from the live site root, DDEV):
#   bash export-db.sh <live_prefix> <out.sql>
#   e.g. bash export-db.sh str_ quickstart.sql
#
# Why backtick-anchored: mysqldump always backticks table IDENTIFIERS (`str_content`), while data VALUES
# that happen to contain "str_" are never preceded by a backtick — so replacing `\`str_` → `\`#__` tokenizes
# identifiers without corrupting data. Sessions are excluded.
set -euo pipefail
PREFIX="${1:?live prefix, e.g. str_}"
OUT="${2:?output .sql path}"

# Volatile/secret/installer-managed tables: ship the table STRUCTURE (Joomla needs them to exist)
# but NOT the rows.
#  - #__session: fully excluding it → 1146 "table doesn't exist" 500 on first boot.
#  - #__schemas: when this dump is the installer's base.sql, the installer post-flight re-records core
#    schema versions → "Duplicate entry … for key PRIMARY" abort if rows ship. Empty → installer fills it.
NODATA=( "${PREFIX}session" "${PREFIX}schemas" )
IGNORE=""        # ignore DATA of these in the main pass...
for t in "${NODATA[@]}"; do IGNORE+=" --ignore-table=db.${t}"; done

# Main dump: everything (structure+data) EXCEPT the no-data tables' rows, then tokenize the prefix.
ddev exec "mysqldump --no-tablespaces --single-transaction --complete-insert --add-drop-table ${IGNORE} db" \
  | sed "s/\`${PREFIX}/\`#__/g" \
  > "${OUT}"

# ...then append the no-data tables' STRUCTURE only (so the tables exist but ship empty).
for t in "${NODATA[@]}"; do
  ddev exec "mysqldump --no-tablespaces --no-data --add-drop-table db ${t}" \
    | sed "s/\`${PREFIX}/\`#__/g" \
    >> "${OUT}"
done

echo "wrote ${OUT}"
echo -n "remaining literal identifier '${PREFIX}' (must be 0): "
grep -c "\`${PREFIX}" "${OUT}" || true
echo "tables tokenized to #__:"
grep -oE "CREATE TABLE \`#__[a-z_]+\`" "${OUT}" | wc -l
