#!/usr/bin/env bash
#
# The two edits this fleet makes to /etc/fstab, in one place, matched the same way both times.
#
# 🔒 A LINE IN /etc/fstab IS A PROMISE THE BOOT KEEPS. systemd-fstab-generator turns every line
# into a `.mount` unit, and a unit WITHOUT `nofail` is required by `local-fs.target`: a mount that
# fails takes the target down and drops the host into an emergency shell. So a stale line left by a
# torn-down site does not fail that site — it fails the HOST, every customer on it, at the next
# reboot, weeks after the site was deleted and with nothing connecting the two.
#
# Two rules follow, and they are why this is a library rather than four inline `printf`s:
#
#   1. every line this fleet writes carries `nofail`;
#   2. whatever writes a line owns removing it — `provision/attach-site.sh` adds,
#      `provision/detach-site.sh` removes, and teardown calls the second one.
#
# Matched on the TARGET column, never on the whole line: a line naming this target already answers
# for it whatever else it says, and a second one would give the boot two answers for one directory.
#
# TRACY_FSTAB points somewhere else for tests. Without it there would be no way to prove any of
# this without a root shell on a host, which is the one place it must not be tried out.

tracy_fstab_file() {
  printf '%s\n' "${TRACY_FSTAB:-/etc/fstab}"
}

# tracy_fstab_has <target>
tracy_fstab_has() {
  local file
  file="$(tracy_fstab_file)"
  [ -f "$file" ] || return 1
  awk -v t="$1" '$1 !~ /^#/ && $2 == t { found = 1 } END { exit !found }' "$file"
}

# tracy_fstab_add <source> <target> [options]
#
# Idempotent, and silent when the line is already there — attach-site runs on every provision.
tracy_fstab_add() {
  local source="$1" target="$2" options="${3:-bind,nofail}" file
  file="$(tracy_fstab_file)"
  tracy_fstab_has "$target" && return 0
  [ -e "$file" ] || : > "$file"
  printf '%s %s none %s 0 0\n' "$source" "$target" "$options" >> "$file"
  echo "    fstab: $target"
}

# tracy_fstab_remove <target> [target...]
#
# Rewritten through a temp file in the same directory and renamed over the original: /etc/fstab
# edited in place by a process that dies halfway is a host that does not boot, which is a worse
# outcome than every problem this function exists to solve.
tracy_fstab_remove() {
  local file tmp removed=0 target
  file="$(tracy_fstab_file)"
  [ -f "$file" ] || return 0
  for target in "$@"; do
    tracy_fstab_has "$target" || continue
    tmp="$file.tracy.$$"
    awk -v t="$target" '$1 ~ /^#/ || $2 != t' "$file" > "$tmp" || { rm -f "$tmp"; return 1; }
    # The original's mode, not the umask of whoever is running: /etc/fstab is 0644 and a fresh
    # file from a root shell would be too, but a test tree or a tighter umask must not change it.
    chmod --reference="$file" "$tmp" 2>/dev/null || chmod 644 "$tmp"
    mv "$tmp" "$file"
    echo "    fstab: removed $target"
    removed=1
  done
  [ "$removed" = 1 ] || return 0
}
