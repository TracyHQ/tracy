#!/usr/bin/env bash
#
# The directories an import leaves out of the copy's files but an extension needs to EXIST (#1650).
#
# The live side's file walker (claude-cowork `FileWalker.php` `skipDirs`) cuts a backup extension's
# output directory whole: its archives are the site's backup of itself, often hundreds of MB, and
# useless in a copy. The webroot history leaves it out too (lib/webroot-excludes.sh). But the
# directory goes with its archives, and Akeeba Backup checks that its output directory exists and is
# writable: measured on prod 23/10/2026, a copy of a Joomla 4.4 site with Akeeba Backup 9.9 showed
# the red "Detected errors prohibit intended operation — Output directory unwritable" where live
# showed only amber notices. So the copy gets the directory back, empty.
#
# Only when the extension that owns it is there: an empty `com_akeeba/backup` on a site without
# Akeeba would be a component folder with no component in it.
#
# Each line: `<directory> <the directory whose presence means its extension is installed>`, both
# from the webroot. WordPress is not listed: the backup plugins its walker skips create their own
# folder when they write (no copy with one installed has been measured yet).
tracy_webroot_skipped_dir_rules() {
  cat <<'EOF'
administrator/components/com_akeebabackup/backup administrator/components/com_akeebabackup
administrator/components/com_akeeba/backup administrator/components/com_akeeba
EOF
}

# tracy_webroot_restore_skipped_dirs <webroot>: makes each missing directory of the rules whose
# extension is installed, with the files that keep its future archives from being served — live has
# Akeeba's own `.htaccess` and `index.html` there, which the walker skipped with the archives. A
# directory already there (a real one, reached through real ones) gets only the guard files it lacks:
# an earlier run may have died between the `mkdir` and the files. A file already there is never
# replaced (Akeeba writes its own), and a link is never followed. Prints what this call created,
# webroot-relative and NUL-separated, for the caller to give to the web user (`tracy_webroot_own`).
# tracy_webroot_real_dir_path <webroot> <relative dir>: true only when every folder on the way from
# the webroot to <relative dir>, that one included, is a real directory and no symlink. The webroot is
# the customer's, and a link anywhere in it (`administrator`, `administrator/components`, the
# component's own folder) may point anywhere, so checking the last folder alone writes through the rest.
tracy_webroot_real_dir_path() {
  local here="$1" part
  local IFS=/
  for part in $2; do
    [ -n "$part" ] || continue
    here="$here/$part"
    [ -d "$here" ] && [ ! -L "$here" ] || return 1
  done
}

# tracy_webroot_guard_file <path> <line>...: writes the lines to <path> only when nothing is there,
# no link either (`set -C` opens it O_EXCL, so a link or a file that appears meanwhile is refused).
tracy_webroot_guard_file() {
  local path="$1"
  shift
  [ ! -e "$path" ] && [ ! -L "$path" ] || return 1
  (set -C; printf '%s\n' "$@" > "$path") 2>/dev/null
}

tracy_webroot_restore_skipped_dirs() {
  local webroot="$1" dir owner
  while read -r dir owner; do
    [ -n "$dir" ] || continue
    # Not through a symlink: the webroot is the customer's, and a link in it may point anywhere.
    tracy_webroot_real_dir_path "$webroot" "$owner" || continue
    if [ ! -e "$webroot/$dir" ] && [ ! -L "$webroot/$dir" ]; then
      mkdir "$webroot/$dir" || continue
      printf '%s\0' "$dir"
    else
      tracy_webroot_real_dir_path "$webroot" "$dir" || continue
    fi
    tracy_webroot_guard_file "$webroot/$dir/.htaccess" \
      '<IfModule !mod_authz_core.c>' 'Order deny,allow' 'Deny from all' '</IfModule>' \
      '<IfModule mod_authz_core.c>' '  Require all denied' '</IfModule>' && printf '%s\0' "$dir/.htaccess"
    tracy_webroot_guard_file "$webroot/$dir/index.html" '<!DOCTYPE html><title></title>' \
      && printf '%s\0' "$dir/index.html"
  done < <(tracy_webroot_skipped_dir_rules)
}
