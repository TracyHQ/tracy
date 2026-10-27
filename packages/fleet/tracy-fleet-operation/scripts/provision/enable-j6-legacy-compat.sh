#!/usr/bin/env bash
#
# enable-j6-legacy-compat — make a site's legacy template render on Joomla 6.
#
# A JoomlArt template built on the T3 framework calls the global class aliases (JFactory, JText,
# JHtml, …) that Joomla 6 removed, so it fatals the front page even when the core reached 6 cleanly.
# Joomla 6 SHIPS the replacement — the `compat6` behaviour plugin, whose classmap re-registers every
# one of those aliases — but the upgrade does not install or enable it, and even enabled it loads too
# late for T3, which uses the aliases while it is still being constructed, before any plugin event.
#
# Two things fix it, and neither is a rewrite of the template:
#   1. discover + install the plugins Joomla 6 laid on disk (compat6 among them), and enable compat6.
#   2. teach the T3 entry to load compat6's classmap right before it includes its legacy core, so the
#      aliases exist by the time that core asks for them. One idempotent edit to one file.
#
# T4 (the current framework) already uses namespaced classes and needs none of this. Run once, after
# the chain has landed on 6.
#
# THIS EDITS THE COPY's template plugin. Run it on a working copy, never a live site.
#
# Usage, on the fleet host:
#   enable-j6-legacy-compat.sh --label example-com-1234 [--root /srv/tracy]
set -euo pipefail

LABEL=""; ROOT="/srv/tracy"
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --root)  ROOT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] || { echo "need --label" >&2; exit 2; }
SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no working copy at $SITE_DIR" >&2; exit 1; }

cd "$SITE_DIR"
DBPASS="$(sed -n 's/^DB_PASSWORD=//p' .env | sed -n 1p)"
in_web() { docker compose exec -T web sh -c "$1" 2>/dev/null; }
in_db()  { docker compose exec -T db mariadb -uroot -p"$DBPASS" joomla -e "$1" 2>/dev/null; }
PREFIX="$(in_web 'cd /var/www/html && php -r "require \"configuration.php\"; \$c=new JConfig(); echo \$c->dbprefix;"' | tr -d "\r\n ")"

echo "==> register the plugins Joomla 6 shipped (compat6 among them)"
in_web 'cd /var/www/html && php cli/joomla.php extension:discover >/dev/null 2>&1; php cli/joomla.php extension:discover:install 2>&1' | tail -1

echo "==> enable compat6"
in_db "UPDATE ${PREFIX}extensions SET enabled = 1 WHERE folder = 'behaviour' AND element = 'compat6';"

echo "==> teach the T3 entry to load the classmap before its legacy core"
in_web 'php -r '\''
  $f = "/var/www/html/plugins/system/t3/t3.php";
  if (!is_file($f)) { echo "no T3 on this site (nothing to do)\n"; exit; }
  $s = file_get_contents($f);
  if (strpos($s, "compat6/src/classmap") !== false) { echo "T3 already prepared\n"; exit; }
  if (strpos($s, "includes/core/t3.php") === false) { echo "T3 entry not in the expected shape; left untouched\n"; exit; }
  $guard = "if (!class_exists(\"JFactory\", false)) { \$__cm = JPATH_PLUGINS . \"/behaviour/compat6/src/classmap/classmap.php\"; if (is_file(\$__cm)) { require_once \$__cm; } }\n\t\tinclude_once";
  $s = preg_replace("/include_once(\s+dirname\(__FILE__\)\s*\.\s*.\/includes\/core\/t3\.php.)/", $guard . "$1", $s, 1, $n);
  if ($n) { file_put_contents($f, $s); echo "T3 entry prepared\n"; } else { echo "T3 include not matched; left untouched\n"; }
'\'''

echo "==> clear the cache so the change takes"
in_web 'rm -rf /var/www/html/cache/* /var/www/html/administrator/cache/* 2>/dev/null; true'
docker compose restart web >/dev/null 2>&1
echo "==> done. The legacy template should now render on Joomla 6."
