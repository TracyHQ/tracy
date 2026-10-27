#!/usr/bin/env bash
# webroot-excludes.sh — what the webroot's git does NOT hold, and the single place that says so.
#
# The rule is in ADR 0091 §8: git holds the whole site, EXCEPT operational junk, Migrate dumps and giant files.
# The CMS core stays on purpose — it is big but it is the part most worth tracking (Changes flagging red when the core is
# edited is a security signal), and it costs only once, at the baseline.
#
# Why a separate file rather than inside `ensure`: 🔒 measured on tracy-ai-8836f920 on 26/08,
# its `info/exclude` still had exactly the first version's six lines — missing `_resources/`, `wp-content/cache/`,
# `wp-content/upgrade/` and the >50MB rule that §8 settled later. Nobody did anything wrong: `ensure`
# writes that file WHEN BUILDING the baseline, and once a site has a baseline nobody calls `ensure` again.
# So the rules changed while old sites kept running the old rules, silently — the same kind of drift ADR 0081/0082 already hit once.
#
# The cure is to call this function EVERYWHERE right before `git add`, not only at build time: an old site heals itself on
# its first seal (one look at Site changes, one backup), without rebuilding the baseline (a
# walk of the whole webroot on a one-core droplet, a job someone has to press).

# The fixed rules of `info/exclude` (everything but the giant files), printed to stdout.
# tracy_write_webroot_exclude writes them; tracy_webroot_exclude_current compares against them.
tracy_webroot_exclude_rules() {

  # gitignore syntax, and the leading `/` here is NOT decoration — it is the line between
  # "the site's junk folder" and "a package that happens to share the name".
  #
  # 🔒 Lesson measured on 26/08 on tracy.ai: an unanchored `log/` also matched
  # `wp-content/plugins/respira-for-wordpress/vendor/psr/log/` — 12 files of the PSR Log library, that is
  # CODE — and a seal removed them from the snapshot. Undoing to that point would take the library out
  # of the webroot and kill the plugin. Same family as the `*.sql` passage in publish-excludes.sh: a
  # name cannot decide by itself whether it is junk or source code.
  #
  # So: junk folders are anchored at the webroot ROOT. `node_modules` is the deliberate exception — it is never
  # at the root, always next to a package.json somewhere deep inside, and there is no other way to read it.
  cat <<'EOF'
/cache/
/administrator/cache/
/administrator/logs/
/tmp/
/logs/
/log/
*.log
.git
/_resources/
**/node_modules/
/wp-content/cache/
/wp-content/upgrade/
/tracy-changed.json
/tracy-changed.json.tmp
/tracy-cowork.zip
/wp-content/mu-plugins/.tracy-access.php.*
/media/t4/optimize/
/media/t4/css/
/t3-assets/
/media/cache/
/administrator/components/com_joomlaupdate/update.php
/administrator/components/com_akeebabackup/backup/
/administrator/components/com_akeeba/backup/
/jaextmanager_data/
/wp-content/upgrade-temp-backup/
/.maintenance
/wp-content/et-cache/
/wp-content/litespeed/
/wp-content/wflogs/
/wp-content/uploads/elementor/css/
/wp-content/uploads/wc-logs/
/wp-content/uploads/wpcf7_uploads/
/wp-content/uploads/wpcf7_captcha/
EOF

  # Everything from `/media/t4/optimize/` down is what a CMS or one of its extensions rewrites BY
  # ITSELF, at runtime — a page view, an update, a cron run — never a change a person made (Q4,
  # 02/10; each line read in the CMS's own code or measured on the test sites, survey
  # tasks/evidence/site-changes/Q4/cache-survey.md). Left in, they landed in a person's chat moment
  # and read as "Tracy edited this CSS": 🔒 leemood on dev, three moments holding only
  # `t3-assets/css/css-<hash>-37980.css`; scjo1002 c0a061d4, two `media/t4/optimize/css/*.css` beside
  # the real edit. Undo never needs them: each is rebuilt from what IS tracked.
  #   Joomla, JoomlArt T4  `media/t4/optimize/` (css/js optimizer, every render, Optimizer/Base.php)
  #                        `media/t4/css/` (<styleId>[-sub|-preview].css compiled from the template
  #                        style on render when missing or stale, Document/Template.php)
  #   Joomla, JoomlArt T3  `t3-assets/` (minified css/js, and `dev/` for LESS output)
  #   Joomla core          `media/cache/` (Media Manager thumbnails, LocalAdapter.php); the core
  #                        update's scratch `com_joomlaupdate/update.php` (it holds a password)
  #   Joomla extensions    Akeeba Backup's output folder (archives + logs), JA Extension Manager's
  #                        download store `jaextmanager_data/`
  #   WordPress core       `upgrade-temp-backup/` (rollback copy during an update), `.maintenance`
  #   WordPress plugins    compiled CSS caches (Divi `et-cache/`, LiteSpeed, Elementor
  #                        `uploads/elementor/css/`), Wordfence `wflogs/`, WooCommerce `wc-logs/`,
  #                        Contact Form 7's temp uploads and captcha images
  # Every line is anchored, for the reason above `log/`: Akeeba ships CODE in `tmpl/backup/`, the T4
  # plugin in `…/googlefonts/thumbs/`. Not here on purpose: drop-ins (`advanced-cache.php`,
  # `object-cache.php` are code), `w3tc-config/` (settings), media in `uploads/` and `images/`
  # (a `-300x200` thumbnail is part of the upload, not rebuilt by itself), `uploads/fonts/` (fonts a
  # person installed), and `wp-content/languages/` — downloaded translations are not a cache; whether
  # they belong in the history is the product owner's call (plan §12).

  # The last four lines are files Tracy writes for ITSELF, never the customer's site (P0 survey
  # tasks/evidence/site-changes/P0/tmp-files.md): `tracy-changed.json` is the Cowork plugin's
  # change stamp `{at, reason}`, rewritten on every save, even one made in wp-admin, so it rode
  # into every moment — 01/10 on tracy.ai, moment 6 held nothing else. Its `.tmp` is the
  # write-then-rename of that stamp, `tracy-cowork.zip` is provision's download (only left when
  # provision was killed), and `.tracy-access.php.<hex>` is the resync's staging file.
  # `tracy-access.php` itself stays: it is code that runs, and a deploy that changes it gets a
  # moment of its own (tools/resync-access-plugin.sh).

  # `*.log` and not just `logs/`: those two folder lines only match at the webroot root, so 🔒 on 26/08
  # on tracy.ai, WooCommerce's `wp-content/uploads/wc-logs/fatal-errors-2026-08-24-….log` stood
  # in the Changes panel under **Content**, i.e. posing as the customer's content. They appear daily
  # and nobody undoes to a log file. `publish-excludes.sh` has excluded `*.log` for a long time — these
  # are two filters saying the same thing, instead of two different things.

  # `node_modules/` is the newest line, and it is here because of a near miss: 🔒 26/08, tracy.ai's theme
  # had `wp-content/themes/tracy/node_modules` — 33 MB, 511 files — sitting untracked, waiting for the next
  # seal to swallow it into history and push it on to GitHub. No line in either filter mentioned it.
  # It is something `npm install` can rebuild, so it belongs in no snapshot.

}

# Writes `info/exclude` for a webroot repo. Call: tracy_write_webroot_exclude <git-dir> <webroot>
tracy_write_webroot_exclude() {
  local repo="$1" webroot="$2"
  [ -d "$repo" ] && [ -d "$webroot" ] || return 0
  tracy_webroot_exclude_rules > "$repo/info/exclude"
  # Giant files, listed by their real paths: `info/exclude` cannot express size, and an original image of a few
  # hundred MB in the history cannot be removed without rewriting the whole tree.
  ( cd "$webroot" && find . -type f -size +50M 2>/dev/null | sed 's|^\./||' ) >> "$repo/info/exclude" || true
}

# 0 when `<git-dir>/info/exclude` starts with exactly today's fixed rules, i.e. it was written by
# this version of tracy_write_webroot_exclude (the giant-file lines that follow are the ones its
# last size walk found). An older script's list, or none, answers 1. Call:
# tracy_webroot_exclude_current <git-dir>
tracy_webroot_exclude_current() {
  local file="$1/info/exclude" rules lines
  [ -f "$file" ] || return 1
  rules="$(tracy_webroot_exclude_rules)"
  lines="$(printf '%s\n' "$rules" | wc -l)"
  [ "$(head -n "$lines" "$file")" = "$rules" ]
}

# Removes from the index what `info/exclude` just said does not belong in the snapshot. Call RIGHT AFTER `git add`.
#
# Why this step is needed rather than just a list: every place here does `add -A -f`, and `-f`
# means **ignore every ignore rule** — our own included. The flag has its reason (many
# sites carry their own `.gitignore`; JoomlArt ignores `images/`, and obeying it would hide what the agent just edited
# from Changes). But the price is that `info/exclude` only affects READ commands:
# 🔒 measured on tracy.ai on 26/08, `add -A -f --dry-run` queued **514** `node_modules` paths,
# while `add -A` queued none. A rule respected only when reading is no rule at all.
#
# It also cleans up what slipped in earlier — `--cached` removes from the index, the file on disk is untouched
# — so `wc-logs/*.log` already in the history from old points stops following into new ones. Old history
# cannot be fixed retroactively, and ADR 0091 §8 said so up front.
tracy_unstage_webroot_junk() {
  local repo="$1" webroot="$2" line
  local specs=()
  [ -f "$repo/info/exclude" ] || return 0

  # Read exactly the syntax written above, and the `/**` at the end of each folder is where the first version went wrong:
  # 🔒 `:(glob)**/node_modules` matches 0 paths, `:(glob)**/node_modules/**` matches 514 — the index
  # holds the FILES inside, not the folder.
  while IFS= read -r line; do
    case "$line" in
      '' | \#* | .git) continue ;;
      # `**/foo/` — every level, the only form allowed to sweep the whole tree.
      '**/'*/) specs+=( ":(glob)${line%/}/**" ) ;;
      # `/foo/` or `/foo/bar/` — anchored at the webroot root, exactly what keeps `vendor/psr/log/` alive.
      /*/) specs+=( "${line#/}" "${line#/}**" ) ;;
      # `/foo*` — a glob anchored at the webroot. 🔒 The leading `/` must go: git reads the
      # pathspec `/foo` as an ABSOLUTE path, exits 128 ("is outside repository"), and since every
      # pathspec rides ONE `git rm`, none of the other lines is unstaged either (measured in the P0
      # survey, 01/10: `cache/` stayed as well).
      /*'*'*) specs+=( ":(glob)${line#/}" ) ;;
      # `/foo` — one file anchored at the webroot (`/tracy-changed.json`), same reason.
      /*) specs+=( "${line#/}" ) ;;
      *'*'*) specs+=( ":(glob)**/$line" ) ;;
      # The rest are real paths of giant files, already relative to the webroot.
      *) specs+=( "$line" ) ;;
    esac
  done < "$repo/info/exclude"

  [ ${#specs[@]} -gt 0 ] || return 0
  git --git-dir="$repo" --work-tree="$webroot" \
    rm -r --cached --quiet --ignore-unmatch -- "${specs[@]}" >/dev/null 2>&1 || true
}
