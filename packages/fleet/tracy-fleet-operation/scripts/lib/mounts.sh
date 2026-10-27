#!/usr/bin/env bash
#
# Asking a mount where it actually points — the half of attach-site.sh that can be tested.
#
# 🔒 "SOMETHING IS MOUNTED HERE" IS NOT THE QUESTION. `mountpoint -q` answers it, and answering it
# is how a label that was torn down and provisioned again keeps the OLD bind: the mount is still
# standing, pointing at the deleted directory's inode, so attach-site does nothing, reports success,
# and the new site's agent reads the previous site's files. Nothing anywhere logs an error.
#
# A separate file, and not two functions inside attach-site.sh, for one reason: attach-site.sh
# refuses to run without root on Linux, so every branch in it is unreachable from a test. This file
# is sourceable and does nothing on its own, so the parsing below can be pinned by a test that runs
# on anyone's machine — and the parsing is where the last bug was.

# bind_source_of_findmnt_output <what `findmnt -no SOURCE` printed>
#
#   /dev/sda1[/tracy/acme/site]  ->  /tracy/acme/site
#   /dev/sda1                    ->  (empty: a whole filesystem, no subpath)
#
# ⚠ THE SUBPATH IS RELATIVE TO ITS OWN FILESYSTEM'S ROOT, not to `/`. On a host with a single root
# partition it happens to equal the absolute path, which is why comparing it against the absolute
# path looks correct on the machine it was written on and is wrong on any host where /srv is a
# mount of its own — there the comparison never matches, and attach-site unmounts and remounts a
# perfectly good bind on every single run, dropping it for an instant under any live session.
bind_source_of_findmnt_output() {
  local out="${1:-}" tail
  case "$out" in
    *'['*']')
      tail="${out#*[}"
      printf '%s\n' "${tail%]}"
      ;;
    *) printf '\n' ;;
  esac
}

# bind_source_matches <target> <source>
bind_source_matches() {
  local target="$1" source="$2" current sub
  mountpoint -q "$target" || return 1

  # The strongest answer first, and on Linux the only one that cannot be fooled: a bind mount
  # exposes the SAME inode on the same device. A stale bind over a directory that has since been
  # deleted and recreated fails this, which is exactly the case that has to fail.
  if current="$(stat -c '%d:%i' "$target" 2>/dev/null)" && [ -n "$current" ]; then
    [ "$current" = "$(stat -c '%d:%i' "$source" 2>/dev/null)" ] && return 0
    return 1
  fi

  # No GNU stat, so not a fleet host. findmnt's bracketed subpath is the fallback: the host path
  # must END with it, because the two differ by wherever that filesystem is mounted.
  command -v findmnt >/dev/null 2>&1 || return 1
  current="$(findmnt -no SOURCE --target "$target" 2>/dev/null || true)"
  sub="$(bind_source_of_findmnt_output "$current")"
  [ -n "$sub" ] || return 1
  case "$source" in
    "$sub"|*"$sub") return 0 ;;
  esac
  return 1
}
