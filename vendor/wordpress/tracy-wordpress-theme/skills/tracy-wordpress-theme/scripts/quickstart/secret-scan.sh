#!/usr/bin/env bash
# Refuse a quickstart pack that carries the build stand with it.
#
# Reads the two archives pack.mjs wrote and looks for what must not leave the stand: the stand's
# address, its wp-config.php salts and database constants, an env file or dev tooling inside the
# webroot, a login session or the Cowork token in the SQL, API keys in any shape we know, and —
# by default — password hashes. Hashes belong to the one admin the quickstart declares and are
# not a secret in the strict sense, but export-db.sh blanks them so the restorer sets their own
# password (the j6 precedent); a hash in the dump therefore means the scrub did not run.
# `--allow-hashes` documents the exception when a pack is built with --keep-passwords.
#
# Usage: secret-scan.sh --pack <dir> [--site-url <stand url>] [--stand-config <wp-config.php>]
#        [--env-file <.env>] [--allow-hashes]
set -uo pipefail
PACK=""; SITE_URL=""; STAND_CONFIG=""; ENV_FILE=""; ALLOW_HASHES=0
usage() {
  cat <<'USAGE'
usage: secret-scan.sh --pack <dir> [--site-url <url>] [--stand-config <wp-config.php>] [--env-file <.env>] [--allow-hashes]

  --pack <dir>          directory holding *-webroot-*.tar.gz and *-database-*.sql.gz
  --site-url <url>      the stand's address — must appear nowhere in the pack
  --stand-config <file> the stand's wp-config.php — its salts and DB values must appear nowhere
  --env-file <file>     the stand's compose .env — every value of 8+ chars must appear nowhere
  --allow-hashes        accept password hashes in the SQL (pack built with --keep-passwords)
USAGE
}
while [ $# -gt 0 ]; do
  case "$1" in
    --pack) PACK="$2"; shift 2 ;;
    --site-url) SITE_URL="$2"; shift 2 ;;
    --stand-config) STAND_CONFIG="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --allow-hashes) ALLOW_HASHES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[ -n "$PACK" ] && [ -d "$PACK" ] || { usage >&2; exit 2; }
fail=0
flag() { echo "  ✗ $1"; fail=1; }
note() { echo "  ⓘ $1"; }

TAR=$(ls "$PACK"/*-webroot-*.tar.gz 2>/dev/null | head -1)
SQLGZ=$(ls "$PACK"/*-database-*.sql.gz 2>/dev/null | head -1)
[ -n "$TAR" ] || { echo "no *-webroot-*.tar.gz in $PACK" >&2; exit 2; }
[ -n "$SQLGZ" ] || { echo "no *-database-*.sql.gz in $PACK" >&2; exit 2; }
echo "== secret / dev-artifact scan: $PACK =="

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
tar -tzf "$TAR" > "$TMP/entries" || { echo "cannot list $TAR" >&2; exit 1; }
gzip -dc "$SQLGZ" > "$TMP/database.sql" || { echo "cannot read $SQLGZ" >&2; exit 1; }
tar -xzOf "$TAR" wp-config.php > "$TMP/wp-config.php" 2>/dev/null || tar -xzOf "$TAR" ./wp-config.php > "$TMP/wp-config.php" 2>/dev/null
[ -s "$TMP/wp-config.php" ] || flag "the webroot archive carries no wp-config.php (the fleet edits it, it cannot create it)"

# 1. Nothing dev-only in the webroot. Anchored patterns on the entry list, so `plugins/x/cache/`
#    inside a plugin is not confused with wp-content/cache.
while read -r pat why; do
  hit=$(grep -E "$pat" "$TMP/entries" | head -1)
  [ -n "$hit" ] && flag "$why: $hit"
done <<'LIST'
(^|/)\.env(\.[^/]*)?$ env file in the webroot
(^|/)\.git(/|$) git metadata in the webroot
(^|/)node_modules(/|$) node_modules in the webroot
(^|/)debug\.log$ debug log in the webroot
(^|/)\.DS_Store$ Finder metadata in the webroot
(^|/)\._[^/]+$ AppleDouble sidecar in the webroot (build the tar with COPYFILE_DISABLE=1)
^(\./)?wp-content/upgrade/.+ upgrade scratch files in the webroot
^(\./)?wp-content/cache/ cache directory in the webroot
(^|/)apply\.json$ seeder apply record in the webroot
^(\./)?wp-config-docker\.php$ docker image config template in the webroot
^/ absolute path in the archive (the fleet refuses it)
(^|/)\.\.(/|$) parent-directory member in the archive (the fleet refuses it)
LIST

# 2. wp-config.php: placeholders in, the stand's values out.
if [ -s "$TMP/wp-config.php" ]; then
  for c in DB_NAME DB_USER DB_PASSWORD DB_HOST; do
    v=$(grep -oE "define\( *'$c' *, *'[^']*'" "$TMP/wp-config.php" | head -1 | sed -E "s/.*, *'([^']*)'/\1/")
    case "$v" in
      "{{$c}}") ;;
      "") flag "wp-config.php does not define $c as a quoted literal (render_wp_config.py needs define('$c', …))" ;;
      *) flag "wp-config.php ships a real-looking $c ('$v') instead of the {{$c}} placeholder" ;;
    esac
  done
  grep -q "^\$table_prefix *= *'[A-Za-z0-9_]*';" "$TMP/wp-config.php" || flag "wp-config.php has no literal \$table_prefix = '…'; (the fleet's prefix fallback reads only that shape)"
  grep -q "put your unique phrase here" "$TMP/wp-config.php" && flag "wp-config.php still carries the sample salts"
  grep -qE "getenv_docker\( *['\"\$]" "$TMP/wp-config.php" && flag "wp-config.php still calls getenv_docker() — the docker template shipped unrewritten"
  grep -q "That's all, stop editing" "$TMP/wp-config.php" || flag "wp-config.php lacks the stop-editing marker render_wp_config.py anchors WP_HOME on"
  if [ -n "$STAND_CONFIG" ] && [ -f "$STAND_CONFIG" ]; then
    n=0
    for c in AUTH_KEY SECURE_AUTH_KEY LOGGED_IN_KEY NONCE_KEY AUTH_SALT SECURE_AUTH_SALT LOGGED_IN_SALT NONCE_SALT; do
      # The stand's value is whatever literal sits last on the define line (a docker default or a plain literal).
      sv=$(grep -E "define\( *'$c'" "$STAND_CONFIG" | grep -oE "'[^']{20,}' *\)" | tail -1 | sed -E "s/^'//; s/' *\)$//")
      [ -n "$sv" ] || continue
      n=$((n+1))
      grep -qF "$sv" "$TMP/wp-config.php" && flag "the stand's $c is in the shipped wp-config.php"
      grep -qF "$sv" "$TMP/database.sql" && flag "the stand's $c is in the SQL"
    done
    note "compared $n stand salts"
  fi
fi

# 3. The SQL: no stand address, no sessions, no Cowork token, no hashes unless allowed.
if [ -n "$SITE_URL" ]; then
  u="${SITE_URL%/}"
  grep -qF "$u" "$TMP/database.sql" && flag "the stand address $u is in the SQL: $(grep -nF "$u" "$TMP/database.sql" | head -1 | cut -c1-160)"
  grep -qF "$u" "$TMP/wp-config.php" && flag "the stand address $u is in wp-config.php"
  host=$(printf '%s' "$u" | sed -E 's#^[a-z]+://##; s#/.*$##')
  grep -qF "${host//\//\\/}" "$TMP/database.sql" && flag "the stand host $host is in the SQL (a JSON-escaped or bare-host spelling)"
fi
grep -qE "'session_tokens'" "$TMP/database.sql" && flag "a login session (usermeta session_tokens) is in the SQL"
grep -qE "'claude_cowork_token'" "$TMP/database.sql" && flag "the Cowork token option is in the SQL (the receiver mints one per site)"
grep -qE "'tracy_access_(aud|team_domain)'" "$TMP/database.sql" && flag "a tracy_access option is in the SQL (the provisioner sets it)"
if [ "$ALLOW_HASHES" = 0 ]; then
  h=$(grep -oE "'\\\$(P|wp|2y|2a|argon2id?)\\\$[^']{10,}'" "$TMP/database.sql" | head -1)
  [ -n "$h" ] && flag "a password hash is in the SQL (${h:0:12}…) — export-db.sh blanks user_pass; pass --allow-hashes only for a --keep-passwords build"
else
  note "password hashes allowed by --allow-hashes"
fi
# API keys in any shape we know, in both artifacts (the tar's text members, the SQL).
tar -xzf "$TAR" -C "$TMP" --exclude='*.png' --exclude='*.jpg' --exclude='*.gif' --exclude='*.woff*' --exclude='*.ttf' --exclude='*.svg' --exclude='*.webp' --exclude='*.mp4' --exclude='*.ico' 2>/dev/null
mkdir -p "$TMP/root"; for e in "$TMP"/*; do case "$(basename "$e")" in entries|database.sql|wp-config.php|root) ;; *) mv "$e" "$TMP/root/" ;; esac; done
while IFS='|' read -r name pat; do
  hit=$(grep -rEl "$pat" "$TMP/root" "$TMP/database.sql" 2>/dev/null | head -1)
  [ -n "$hit" ] && flag "$name in ${hit#$TMP/}"
done <<'PATTERNS'
anthropic key|sk-ant-[A-Za-z0-9_-]{20,}
openai-style key|\bsk-[A-Za-z0-9]{32,}
github token|\bgh[pousr]_[A-Za-z0-9]{30,}
aws access key|\bAKIA[0-9A-Z]{16}\b
slack token|\bxox[abp]-[A-Za-z0-9-]{10,}
private key block|-----BEGIN [A-Z ]*PRIVATE KEY-----
PATTERNS

# 4. Values from the stand's env file (the database root password lives there).
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r k v; do
    v="${v%\"}"; v="${v#\"}"
    [ -n "$k" ] && [ "${k:0:1}" != "#" ] && [ "${#v}" -ge 8 ] || continue
    if grep -rqF "$v" "$TMP/root" "$TMP/database.sql" "$TMP/wp-config.php" 2>/dev/null; then flag "the value of $k from $ENV_FILE is in the pack"; fi
  done < "$ENV_FILE"
fi

if [ "$fail" -eq 0 ]; then echo "✓ clean"; else echo "PACK BLOCKED — resolve the ✗ items"; exit 1; fi
