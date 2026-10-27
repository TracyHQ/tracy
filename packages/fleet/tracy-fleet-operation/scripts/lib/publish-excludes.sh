#!/usr/bin/env bash
#
# What never goes up to the team repository, and why each line is there.
#
# Sourced by provision.sh's publish_webroot. Lives here rather than inline so tests/ can run the real
# list against a real rsync instead of a copy of it that drifts.
#
# The list answers one question per line: would a developer opening this repository be worse off
# without this file? Code yes, media no (it travels via R2, ADR 0031 §5), secrets never, and a copy
# of the customer's database never twice over — it is both useless to a developer and the one thing
# in a webroot that stays dangerous after every clone it came from has been destroyed.
#
# 🔒 The dump rules exist because they were missing. Found on 2026-08-17 in
# TracyHQ/joomlart-com-0871462c: `webroot/_resources/ja_j6.sql` (42 MB) and
# `webroot/_resources/joomlart.sql` (40 MB) committed to GitHub. The third dump sitting beside them,
# `ja_j6_seo.sql.zip`, was kept out by the *.zip rule written for something else entirely. Luck was
# doing the work of a rule.

# Print the rsync exclude arguments for a platform, one per line, NUL-safe by virtue of having no
# whitespace in any pattern. Call as:  mapfile / while read into an array.
#
# `purpose` says WHICH copy is being made, and it changes exactly one line — see `media/` below.
#   publish    (default) the team repository: code a developer would want, nothing else
#   read-copy            the desk's `.webroot/`: what an agent needs in order to edit this site
tracy_publish_excludes() {
  local platform="${1:-joomla}"
  local purpose="${2:-publish}"

  # ── media and the transient ────────────────────────────────────────────────────────────────
  printf -- '--exclude=*.mp4\n--exclude=*.mov\n--exclude=*.webm\n--exclude=*.zip\n--exclude=*.jpa\n'
  printf -- '--exclude=.bash_history\n--exclude=*.swp\n--exclude=.DS_Store\n'
  printf -- '--exclude=cache/\n--exclude=tmp/\n'

  # 🔒 Not hypothetical: on 2026-08-26 tracy.ai's own theme carried
  # `wp-content/themes/tracy/node_modules` — 33 MB across 511 files — sitting in the webroot after
  # a build. `npm install` rebuilds it from a lockfile, so it belongs in no copy of anything: not
  # in the repository a developer reads, and not in the desk's read copy either.
  printf -- '--exclude=node_modules/\n'

  # ── the customer's database, in the wrappers that are never source code ────────────────────
  # A compressed or binary database is data whatever its size, so it goes by extension here. Plain
  # `*.sql` is deliberately NOT in this list: see tracy_prune_data_files below for why a name cannot
  # decide that one.
  #
  # Not `*.gz` as a blanket: Joomla's own htaccess.txt negotiates pre-compressed `.css.gz` and
  # `.js.gz` assets, and dropping those would ship a repository whose site 404s its own stylesheets.
  printf -- '--exclude=*.sql.gz\n--exclude=*.sql.xz\n--exclude=*.sql.bz2\n--exclude=*.sql.zip\n'
  printf -- '--exclude=*.sqlite\n--exclude=*.sqlite3\n--exclude=*.dump\n--exclude=*.mwb\n'

  # ── backups of files whose live version is already excluded ────────────────────────────────
  # `configuration.php.bak` is named again below for Joomla, but a `.bak` of anything is a copy of a
  # file someone was editing, and Apache serves a `.bak` as plain text rather than handing it to PHP.
  printf -- '--exclude=*.bak\n--exclude=*.backup\n--exclude=*.old\n--exclude=*.orig\n--exclude=*.save\n'
  printf -- '--exclude=*.tar\n--exclude=*.tgz\n--exclude=*.tar.gz\n--exclude=*.log\n'

  # ── the secret files, named for EVERY platform this is not known to be ─────────────────────
  # A caller that could not name the CMS passes `-`, and this used to take the `else` branch:
  # a WordPress webroot got Joomla's list, and `wp-config.php` — DB password and auth salts —
  # travelled. The one thing this function must never do is ship a secret because nobody could
  # say which CMS wrote it, so an unknown platform gets both lists rather than a guess.
  if [ "$platform" != "joomla" ]; then
    # wp-config.php (and its backups) carries the DB password and the auth salts — never git.
    printf -- '--exclude=wp-config.php*\n'
  fi
  if [ "$platform" != "wordpress" ]; then
    # Joomla: configuration.php carries the DB password and $secret.
    printf -- '--exclude=configuration.php\n--exclude=configuration.php.bak\n'
  fi

  # ── the bulk that regenerates, which only a KNOWN platform can name ────────────────────────
  # Unknown stays out of this half on purpose: over-excluding here does not leak anything, it
  # hides code, and a copy missing its own template is its own kind of wrong.
  if [ "$platform" = "wordpress" ]; then
    # Uploads are media (→ R2); cache/upgrade regenerate; common backup-plugin output dirs.
    printf -- '--exclude=wp-content/uploads/\n--exclude=wp-content/cache/\n--exclude=wp-content/upgrade/\n'
    printf -- '--exclude=wp-content/backup*/\n--exclude=wp-content/updraft/\n--exclude=wp-content/w3tc-config/\n'
  elif [ "$platform" = "joomla" ]; then
    printf -- '--exclude=logs/\n--exclude=administrator/cache/\n--exclude=administrator/logs/\n'
    printf -- '--exclude=administrator/components/com_akeeba/backup/\n'
    # `images/` is the customer's own pictures in every reading, so it goes from both copies.
    #
    # `media/` is the one line that depends on WHY the copy is being made. On the push to the team
    # repository it stays excluded: 87 MB of framework and template assets on joomlart.com, which
    # is code by any honest reading, but ADR 0031 §5 routes media through R2 and this is not the
    # place to reopen that. (The two directions disagreeing is deliberate — deploy-site.sh must
    # never turn "excluded from the push" into "delete it from the running site", which is what
    # its mass-deletion guard is for.)
    #
    # 🔒 For the desk's read copy it must NOT be excluded. Joomla 4 moved template and extension
    # assets there: cassiopeia's stylesheet is `media/templates/site/cassiopeia/css/template.min.css`
    # and nothing under `templates/` serves the browser any more. An agent handed a copy without
    # `media/` sees a webroot whose CSS is missing, and does what one did on 2026-08-22 — writes
    # into `templates/<name>/css/`, the Joomla 3 address, where no page will ever read it, and
    # reports the change as made.
    printf -- '--exclude=images/\n'
    [ "$purpose" = "read-copy" ] || printf -- '--exclude=media/\n'
  fi
}

# Drop the database dumps out of the staged copy, by size rather than by name.
#
# `*.sql` is the one extension that means two opposite things. It is the customer's whole database:
#
#     webroot/_resources/ja_j6.sql        42,309,868 bytes
#     webroot/_resources/joomlart.sql     40,073,895 bytes
#
# and it is also, in the very same webroot, code that an extension cannot be installed or updated
# without:
#
#     administrator/components/com_admin/sql/updates/mysql/6.0.0-2025-08-16.sql
#     administrator/components/com_easydiscuss/install.mysql.utf8.sql          26,842 bytes
#     administrator/components/com_sh404sef/install.mysql.utf8.sql              2,947 bytes
#     administrator/components/com_xmap/install/uninstall.utf8.sql                 57 bytes
#     libraries/vendor/php-debugbar/.../pdo_storage_schema.sql                    552 bytes
#
# 🔒 That list is not hypothetical: it is what a `--exclude=*.sql` rule silently removed from
# TracyHQ/joomlart-com-0871462c when this was first written, caught by the dry run that printed every
# archive-shaped path in the repository. An earlier attempt protected `**/sql/**`, which reads well
# and covers only the first of those five, because four of them are not in a directory called sql.
#
# Neither the directory nor the filename separates the two. Size does, by four orders of magnitude:
# every schema file in a 27,000-file Joomla install is under 30 KB, and a dump worth worrying about
# is megabytes. 1 MB sits in the empty space between them with room to spare in both directions.
#
# The residual risk, stated rather than hidden: a dump of a very small site could come in under 1 MB
# and go up. That is a copy of a few hundred rows against the certainty of shipping a repository that
# cannot install its own extensions, and the .htaccess deny block still keeps it off the open web.
TRACY_DATA_FILE_BYTES="${TRACY_DATA_FILE_BYTES:-1048576}"

tracy_prune_data_files() {
  local staged="$1" f
  [ -d "$staged" ] || return 0
  # -size +Nc rather than +NM: byte counts are the one form both GNU and BSD find agree on.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    echo "==> not publishing $(basename "$f") ($(wc -c < "$f" | tr -d ' ') bytes) — too large to be schema"
    rm -f "$f"
  done < <(find "$staged" -type f -iname '*.sql' -size "+${TRACY_DATA_FILE_BYTES}c" 2>/dev/null)
}
