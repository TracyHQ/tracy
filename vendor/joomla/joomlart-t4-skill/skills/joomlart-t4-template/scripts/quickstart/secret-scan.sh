#!/usr/bin/env bash
# Fail the quickstart build if a secret or dev artifact is about to ship.
# Usage: bash secret-scan.sh <staging_dir> [live_db_password]
set -uo pipefail
DIR="${1:?staging dir}"
PW="${2:-}"
fail=0

flag(){ echo "  ✗ $1"; fail=1; }

echo "== secret / dev-artifact scan: ${DIR} =="

# 1. No real configuration.php (installer regenerates). A -dist placeholder is OK.
if [ -f "${DIR}/configuration.php" ]; then
  if grep -qE "public \\\$password\s*=\s*'[^']+'" "${DIR}/configuration.php"; then flag "configuration.php with a DB password is present"; fi
fi

# 1b. Joomla writes configuration.bak.php next to configuration.php on every Global Configuration save — with the
#     live DB password and secret in it. Akeeba images it like any other file. (Caught on tracy_business 2026-09-13.)
for bak in configuration.bak.php configuration.php.bak; do
  [ -f "${DIR}/${bak}" ] && flag "backup of configuration.php present: ${bak} (carries the live DB password + secret)"
done

# 2. No .env / secrets files.
for p in ".env" ".env.local" ".env.production"; do
  [ -e "${DIR}/${p}" ] && flag "secrets file present: ${p}"
done

# 3. No dev VCS / tooling / dev artifacts.
for d in ".git" ".ddev" "node_modules" ".idea" ".vscode" "media/t4/optimize" "build-docs"; do
  [ -e "${DIR}/${d}" ] && flag "dev artifact present: ${d}"
done
# Runtime cache/log/tmp — check the SPECIFIC Joomla runtime paths only (not every dir named "cache",
# which would match legit code like plugins/system/cache or vendor/psr/cache).
for rt in "cache" "administrator/cache" "tmp" "logs" "administrator/logs"; do
  if [ -d "${DIR}/${rt}" ] && [ -n "$(find "${DIR}/${rt}" -type f ! -name 'index.html' ! -name '.gitignore' 2>/dev/null | head -1)" ]; then
    echo "  ⚠ non-empty runtime dir (clear before ship): ${rt}"
  fi
done

# 4. The live DB password must not appear anywhere. Skip trivial dev passwords (<8 chars, e.g. DDEV's
#    'db') — they're not real secrets and match legitimate content everywhere, causing false positives.
if [ -n "${PW}" ] && [ "${#PW}" -ge 8 ]; then
  if grep -rqF "${PW}" "${DIR}" 2>/dev/null; then flag "LIVE DB PASSWORD found in the package"; fi
elif [ -n "${PW}" ]; then
  echo "  ⓘ DB password '${PW}' is trivial (<8 chars, dev default) — skipped string-scan; ensure no real configuration.php ships"
fi

# 4b. No extension token left in a shipped SQL dump (Cowork door, API keys): `"token":"<16+ chars>"` inside
#     an INSERT into *_extensions. The provisioner sets these on the target; the package must not carry them.
if grep -rIlE "_extensions" "${DIR}" --include='*.sql' 2>/dev/null | xargs -r grep -lE '"token" *: *"[A-Za-z0-9_-]{16,}"' 2>/dev/null | grep -q .; then
  flag "an extension token is present in a shipped SQL dump (clear it in #__extensions.params before the backup)"
fi

# 5. installation/ must be present (it's a quickstart, not a bare site).
[ -d "${DIR}/installation" ] || flag "installation/ (web installer) is MISSING — not an installable quickstart"

if [ "$fail" -eq 0 ]; then echo "✓ clean — safe to zip"; else echo "BUILD BLOCKED — resolve the ✗ items"; exit 1; fi
