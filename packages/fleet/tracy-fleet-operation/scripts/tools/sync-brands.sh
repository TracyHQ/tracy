#!/usr/bin/env bash
#
# Publish every `Brand/<host>/` on this fleet host to the public community shelf,
# `TracyHQ/design-inspirations`. Runs ON the host, inside the tracy-host container, every ten
# minutes — started by tracy-host itself (`apps/tracy-host/src/sync.js`; the old
# `tracy-brands-sync.timer` is gone); can be run by hand any time.
#
#   sync-brands.sh              publish what changed
#   sync-brands.sh --dry-run    say what would be published, write nothing, push nothing
#
# ## Why the repository is the store, and this host only a copy
#
# Brands are written by `@tracy/dsh-brand-engine` inside a lane's container, on whichever host that
# lane runs on — agent lanes on the DigitalOcean box, customer sites on contabo. A brand extracted
# on one host is worth reading on the other, and neither can mount the other's disk. The public
# repository is the only place both can reach, so it holds the shelf and each host keeps a clone.
#
# That makes the merge rule simple and one-directional: `origin/main` is the truth, this host's
# lanes contribute to it. Every run resets the clone to origin, copies in the lane folders that are
# NEWER than what origin has (by `source.extractedAt`), rebuilds what is generated, and pushes.
# Two hosts pushing within the same minute is a rejected push, not a lost brand: the loser resets
# to the winner's commit and runs the whole body again.
#
# ## Token: ASKED FOR, never held
#
# 🔒 ADR 0023 — the fleet never holds the GitHub App key. It asks tracy-web's `/fleet/git-token`
# through `lib/relay-git-token.sh` (`tracy_relay_git_token_shared`: signed with this host's own
# `HOST_SECRET`, the one signing path every fleet caller shares) and gets back a token that lives
# one hour and reaches one repository. This repository is not a customer's, so no site record can
# vouch for it; the door's closed `fleetSharedRepos` list is what vouches instead, and it names
# exactly this one.
#
# 🔒 THE TOKEN MUST NOT TOUCH DISK OR `ps`. It goes neither into the remote URL (which stays in
# `.git/config` for anyone who opens the clone later) nor into a command line (`ps` is public on the
# machine). It travels through a credential helper that reads it from the environment.
#
# ## What is published
#
# Every brand, from every lane, in full — pages, imagery, fonts and all (07/09/2026: "publish
# everything, because a website is already public"). A customer's own site brand goes up alongside a
# reference they extracted; the folder is a measurement of a public page either way.
#
# The one thing held back is a folder carrying a file GitHub will not take. A push that trips the
# 100 MB limit fails for every brand at once, and the fix would be rewriting published history — so
# an oversized folder is skipped, loudly, and the rest still goes.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/relay-git-token.sh
. "$HERE/../lib/relay-git-token.sh"

REPO=TracyHQ/design-inspirations
# The third root (lib/roots.sh): a shared clone, not per-site content, so neither TRACY_SITES_ROOT
# nor TRACY_PRIVATE_ROOT is quite right for it.
STORE="$TRACY_BRANDS_DIR"
# Every site's own Brand/ folder, one level under its site folder — tracy_site_dir("$LABEL") for
# every label on this host at once, hence the glob instead of a function call. Single label, not
# the lane-era .../site/<label>/Brand this line used to spell out: provision.sh (this same task)
# now writes a site's folder straight at tracy_site_dir("$LABEL"), with nothing nested under it.
LANE_GLOB="$TRACY_SITES_ROOT/*/Brand"
# GitHub refuses a file over 100 MB. Stop well short: a brand that big is a runaway crawl, not a
# design system, and history is forever.
MAX_FILE_MB=50

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

die() { echo "sync-brands: $*" >&2; exit 1; }
say() { echo "sync-brands: $*"; }

# One sync at a time per host: the timer and a hand run must not push the same repo twice at once.
# Ten minutes at most, like sync-site-folders.sh: a run stuck behind a hung one must not queue
# forever, with every later tick queueing behind it.
exec 9>/var/lock/tracy-brands-sync
flock -w 600 9 || die "another brand sync has held the lock for 10 minutes — giving up this run"

command -v node >/dev/null || die "no node on this host — build-catalog.mjs needs it"

# A directory name that is a hostname. `.deep`, `<host>.quick` and `<host>.prev` belong to an
# extraction in flight or the one it is replacing; none is a brand, and `.quick`/`.prev` would
# otherwise pass for top-level domains.
is_host() {
  case "$1" in
    *.quick | *.prev | .* | *' '*) return 1 ;;
  esac
  printf '%s' "$1" | grep -E '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' >/dev/null
}

# `source.extractedAt` out of a manifest, or empty. ISO 8601 sorts as text, which is the whole
# reason the engine writes it that way.
extracted_at() {
  [ -f "$1" ] || return 0
  sed -n 's/.*"extractedAt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | sed -n 1p
}

GH_TOKEN=$(tracy_relay_git_token_shared "$REPO") || die "no token for $REPO (see above)"
export GH_TOKEN
# shellcheck disable=SC2016 # expanded by git's shell, from the environment, on purpose
HELPER='!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f'

if [ ! -d "$STORE/.git" ]; then
  say "no clone yet — cloning $REPO into $STORE"
  [ "$DRY_RUN" = true ] && die "--dry-run cannot run before the first clone"
  mkdir -p "$(dirname "$STORE")"
  git -c credential.helper="$HELPER" clone -q "https://github.com/$REPO.git" "$STORE" \
    || die "clone failed"
  git -C "$STORE" config user.email "fleet@tracy.ai"
  git -C "$STORE" config user.name "Tracy Fleet"
fi

# The remote carries NO token — see the 🔒 block at the top.
git -C "$STORE" remote set-url origin "https://github.com/$REPO.git"

# One pass: reset to origin, copy in every lane folder that is newer, rebuild, commit, push.
# Returns 0 published, 10 nothing to publish, 20 push rejected (someone else got there first).
attempt() {
  git -C "$STORE" -c credential.helper="$HELPER" fetch -q origin main || return 1
  git -C "$STORE" reset -q --hard origin/main
  git -C "$STORE" clean -qfd
  mkdir -p "$STORE/systems"

  local copied=0 skipped=0
  local brand_dir host lane_manifest store_manifest lane_at store_at big
  for brand_root in $LANE_GLOB; do
    [ -d "$brand_root" ] || continue
    for brand_dir in "$brand_root"/*/; do
      [ -d "$brand_dir" ] || continue
      host=$(basename "$brand_dir")
      is_host "$host" || continue
      lane_manifest="$brand_dir/manifest.json"
      # No manifest means an extraction that is running or one that failed: not an entry yet.
      [ -f "$lane_manifest" ] || continue
      store_manifest="$STORE/systems/$host/manifest.json"
      lane_at=$(extracted_at "$lane_manifest")
      store_at=$(extracted_at "$store_manifest")
      [ -n "$lane_at" ] || continue
      # 🔒 Being rewritten right now. `extractBrand` empties a folder before refilling it, and it
      # writes `manifest.json` LAST — so a copy taken inside that window publishes a design system
      # missing most of itself, and the next pass sees a complete-looking folder and leaves it. The
      # engine holds `Brand/.locks/<host>` for exactly as long as it is writing; ten minutes from
      # now this host is published like any other.
      # A lock older than the longest an extraction can run (90 s harvest + 150 s recon, rounded
      # up) belonged to a process that died holding it. Waiting on one of those would take a host
      # off the shelf permanently, which is worse than the race the lock guards.
      if [ -n "$(find "$brand_root/.locks/$host" -mmin -5 2>/dev/null)" ]; then
        say "$host: skipped — the lane is writing it right now"
        skipped=$((skipped + 1))
        continue
      fi
      # Not newer than the shelf: another lane, or another host, already published this one.
      [ -n "$store_at" ] && [ ! "$lane_at" \> "$store_at" ] && continue
      big=$(find "$brand_dir" -type f -size +${MAX_FILE_MB}M | sed -n 1p)
      if [ -n "$big" ]; then
        say "$host: skipped — $(basename "$big") is over ${MAX_FILE_MB} MB"
        skipped=$((skipped + 1))
        continue
      fi
      if [ "$DRY_RUN" = true ]; then
        say "$host: would publish ($lane_at${store_at:+, shelf has $store_at})"
      else
        rsync -a --delete "$brand_dir" "$STORE/systems/$host/"
      fi
      copied=$((copied + 1))
    done
  done

  if [ "$DRY_RUN" = true ]; then
    say "dry run: $copied to publish, $skipped skipped"
    return 10
  fi

  node "$STORE/scripts/build-catalog.mjs" >/dev/null || die "build-catalog failed"
  git -C "$STORE" add -A
  if git -C "$STORE" diff --cached --quiet; then
    say "nothing to publish — the shelf already has what this host has"
    return 10
  fi

  # Name the hosts in the subject: the repository's log is how anyone finds out what arrived.
  local hosts
  hosts=$(git -C "$STORE" diff --cached --name-only \
    | sed -n 's|^systems/\([^/]*\)/.*|\1|p' | sort -u | paste -sd, - | sed 's/,/, /g')
  [ -n "$hosts" ] || hosts="the index"
  say "publishing: $hosts"
  git -C "$STORE" commit -q -m "brands: $hosts

Published by $(hostname) from the lanes on this host (sync-brands.sh). Each folder
is one public page as the brand engine measured it; the index is generated."

  if git -C "$STORE" -c credential.helper="$HELPER" push -q origin HEAD:main 2>/dev/null; then
    return 0
  fi
  say "push rejected — the other host published first; redoing on top of theirs"
  return 20
}

attempt
CODE=$?
if [ "$CODE" = 20 ]; then
  attempt
  CODE=$?
  [ "$CODE" = 20 ] && die "push rejected twice — another host is publishing right now, try again"
fi
[ "$CODE" = 0 ] || [ "$CODE" = 10 ] || die "sync failed"
[ "$CODE" = 0 ] && say "published to https://github.com/$REPO"
exit 0
