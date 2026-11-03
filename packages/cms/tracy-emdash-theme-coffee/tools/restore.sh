#!/usr/bin/env bash
# Restore a backup made by tools/backup.sh. STOP the site first: SQLite must not be open while its
# file is replaced. Preflight reads the archive fully before anything moves; the current state is
# moved aside (never deleted) as <dir>.before-restore-<stamp>.
#   tools/restore.sh <archive.tgz> [data-dir] [uploads-dir]
set -euo pipefail
ARCHIVE="${1:?archive}"; DATA="${2:-./data}"; UPLOADS="${3:-./uploads}"
die() { echo "!! $*" >&2; exit 1; }
[ -f "$ARCHIVE" ] || die "archive $ARCHIVE not found"
LIST="$(tar -tzf "$ARCHIVE" 2>/dev/null)" || die "archive $ARCHIVE is not a readable .tgz"
# The listing goes to grep as a here-string, never through `printf | grep -q`: `grep -q` exits at
# its first match, and under `pipefail` the printf still writing the rest dies of SIGPIPE, which
# fails the whole pipeline. Measured 28/09/2026: a backup whose listing outgrows the pipe buffer
# (5000 uploads) read "no ./data/data.db" on every run, and a `..` member early in such a listing
# skipped the refusal below; a small listing failed only when the machine was busy (bash writes it
# one line per write(), and a CI runner saw the check fail for a backup made seconds earlier).
grep -qx './data/data.db' <<<"$LIST" || die "archive has no ./data/data.db; not a backup made by tools/backup.sh"
grep -q -E '(^|/)\.\.(/|$)' <<<"$LIST" && die "archive contains a path with ..; refusing"
# The two directories are MOVED aside, so they must be site-local: refuse the root, anything
# with fewer than three path components (/tmp, /Users/you, /private/tmp -- on macOS the short
# names resolve to /private/..., so the rule is depth, not a name list), the home directory,
# and any ancestor of the home or of the current working directory.
HOME_P="$(cd "$HOME" && pwd -P)"; CWD_P="$(pwd -P)"
for d in "$DATA" "$UPLOADS"; do
  [ -e "$d" ] && [ ! -d "$d" ] && die "$d exists and is not a directory"
  if [ -d "$d" ]; then real="$(cd "$d" && pwd -P)"; else real="$(cd "$(dirname "$d")" 2>/dev/null && pwd -P)/$(basename "$d")"; fi
  depth="$(printf '%s' "$real" | tr -cd '/' | wc -c | tr -d ' ')"
  if [ "$real" = "/" ] || [ "$depth" -lt 3 ]; then die "refusing to restore over $d ($real)"; fi
  case "$HOME_P/" in "$real"/*) die "refusing to restore over $d ($real contains the home directory)" ;; esac
  case "$CWD_P/" in "$real"/*) die "refusing to restore over $d ($real contains the working directory)" ;; esac
  # A direct child of the home directory is not site state. The rules above only catch a target that
  # CONTAINS home; one that sits INSIDE it, one level down, passed everything -- and when it did not
  # exist yet nothing was moved aside and nothing warned, so the operator saw a clean restore into a
  # path they never meant. Measured 2026-09-16: the suite's own dangerous-path case created
  # ~/TracyHQ with the archive's data.db and seed-receipts.json. A nested site directory
  # (~/sites/<label>/data) is still allowed -- it is the top-level one that is never site state.
  case "$real" in "$HOME_P"/*) [ "$(dirname "$real")" = "$HOME_P" ] && die "refusing to restore over $d ($real is a directory of the home directory itself)" ;; esac
  # Site state holds a database, a token, receipts and media -- never a project. An EXISTING target
  # that contains a package/checkout (package.json, .git, astro.config.mjs, node_modules, up to two
  # levels down) is somebody's source tree, not a data directory: refuse regardless of where we run.
  #
  # ⚠ THIS DELIBERATELY DOES NOT LOOK AT THE PARENT. Probing the parent when the target does not
  # exist reads well -- "do not create a directory inside somebody's checkout" -- and refuses the
  # documented default: `tools/restore.sh <archive>` uses ./data and ./uploads from the package
  # directory, which is itself a checkout, so the FIRST restore onto a site that has no data/ yet
  # would be turned away. Measured 2026-09-16: with the parent probe, ./data next to package.json
  # was refused when absent and allowed when present -- the wrong way round for a first restore.
  if [ -d "$real" ] && [ -n "$(find "$real" -maxdepth 2 \( -name package.json -o -name .git -o -name astro.config.mjs -o -name node_modules \) -print -quit 2>/dev/null)" ]; then
    die "refusing to restore over $d ($real contains a project/checkout, not site state)"
  fi
done
TMP="$(mktemp -d)"
tar -C "$TMP" -xzf "$ARCHIVE" || { rm -rf "$TMP"; die "extraction failed; nothing was changed"; }
[ -f "$TMP/data/data.db" ] || { rm -rf "$TMP"; die "extracted archive lacks data/data.db; nothing was changed"; }
node -e 'const D=require("better-sqlite3");const db=new D(process.argv[1],{readonly:true});db.prepare("select count(*) n from sqlite_master").get();db.close()' "$TMP/data/data.db" 2>/dev/null \
  || { rm -rf "$TMP"; die "data.db in the archive is not a valid SQLite database; nothing was changed"; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
[ -d "$DATA" ] && mv "$DATA" "$DATA.before-restore-$STAMP"
[ -d "$UPLOADS" ] && mv "$UPLOADS" "$UPLOADS.before-restore-$STAMP"
mv "$TMP/data" "$DATA"
if [ -d "$TMP/uploads" ]; then mv "$TMP/uploads" "$UPLOADS"; else mkdir -p "$UPLOADS"; fi
rm -rf "$TMP"
chmod 600 "$DATA/tracy-agent.token" 2>/dev/null || true
echo "restored $ARCHIVE -> $DATA, $UPLOADS (previous state kept as *.before-restore-$STAMP)"
