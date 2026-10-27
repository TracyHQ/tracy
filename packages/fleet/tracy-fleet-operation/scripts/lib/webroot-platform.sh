#!/usr/bin/env bash
#
# Which CMS a standing Preview runs, read from the webroot itself.
#
# Lives here rather than inline in each tool because it was inline in three of them
# (webroot-edit.sh, webroot-push.sh, webroot-pack.sh) and all three were wrong the same way.
#
# 🔒 2026-08-21, bytebrains.site. The answer used to be "`administrator/` exists, so Joomla",
# checked before WordPress. But provision.sh step 6 created `administrator/logs` and
# `administrator/cache` on EVERY clone, WordPress ones included — a Joomla list that predated
# WordPress support by one day and was never split. The stray directory was harmless for ten
# days, until the ADR 0070 write gate started reading it as evidence: a WordPress Preview was
# classified as Joomla, Joomla's zone map recognises no `wp-content/` path, and the gate's rule
# for what it does not recognise is `core` — so every write into a WordPress Preview was
# refused, including the extension directory the refusal message tells the agent to use.
#
# Hence both halves of this function: WordPress first, and Joomla by a file it alone ships.
# A directory anyone might create proves nothing; a manifest does.

# Print `wordpress`, `joomla`, or `-` for a webroot path. Never fails, never guesses a CMS —
# `-` means "say so and let the caller decide", which for the zone classifier means inferring
# from the path and for the exclude list means naming both platforms' secrets.
tracy_webroot_platform() {
  local webroot="$1"

  # `wp-includes/` is the one directory a WordPress install cannot be without, and nothing of
  # Tracy's ever creates it.
  if [ -d "$webroot/wp-includes" ]; then
    echo wordpress
    return 0
  fi

  # Joomla's own manifest — the same file snapshot.sh and verify.sh read a version out of.
  if [ -f "$webroot/administrator/manifests/files/joomla.xml" ]; then
    echo joomla
    return 0
  fi

  echo -
}
