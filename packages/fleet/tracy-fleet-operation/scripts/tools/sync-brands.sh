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
# NEWER than what origin has (by `source.extractedAt`), rebuilds what is generated, and publishes.
#
# ## Published through a pull request, never pushed to `main`
#
# `main` is protected (PR required, admins included, no force-push), so the commit goes to a fresh
# branch `automation/brands/<host>/<short-sha>`, a PR is opened against `main` and merged through
# the REST API with the pushed head pinned, and the branch is deleted once the merge commit is on
# `main` (`lib/github-pr-publish.mjs`). Two hosts publishing within the same minute is a PR closed
# and regenerated, not a lost brand: when `main` moved or the merge conflicts, the PR is closed,
# its branch deleted, and the whole body runs again on top of the new `main` — once. An open PR a
# crashed run of THIS host left behind (authored by this token's identity, from this repository,
# branch unchanged) is closed and its branch deleted, never merged; any other PR is left alone.
# There is no fallback to a direct push.
#
# ## Token: ASKED FOR, never held
#
# 🔒 ADR 0023 — the fleet never holds the GitHub App key. It asks tracy-web's `/fleet/git-token`
# through `lib/relay-git-token.sh` (`tracy_relay_git_token_shared`: signed with this host's own
# `HOST_SECRET`, the one signing path every fleet caller shares) and gets back a token that lives
# one hour and reaches one repository (contents write, pull requests write — the PR and its merge
# go through the API with the same token, so this host needs nothing else and no `gh`). This repository is not a customer's, so no site record can
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
# 🔒 Where the clone talks to and the API the PR goes through are FIXED: github.com and
# api.github.com. The token goes nowhere else. The tests stand a bare repository and a local stub in
# for GitHub through TRACY_BRANDS_REMOTE / TRACY_GITHUB_API, and those are honoured only when they
# can only reach this machine (checked below, before the lock or the token): a loopback http URL,
# or for the remote a local bare repository. Anything else is refused, never used.
REMOTE_URL="https://github.com/$REPO.git"
API_URL="https://api.github.com"
PUBLISH="$HERE/../lib/github-pr-publish.mjs"
# This host's own branch prefix: leftovers under it are this host's to settle, and another host's
# never are.
PUBLISHER_HOST=$(printf '%s' "${HOST_NAME:-$(hostname)}" | tr -c 'A-Za-z0-9._-' '-')
BRANCH_PREFIX="automation/brands/$PUBLISHER_HOST/"
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

if [ -n "${TRACY_GITHUB_API:-}" ]; then
  [[ "$TRACY_GITHUB_API" =~ ^http://(127\.0\.0\.1|localhost):[0-9]{1,5}/?$ ]] \
    || die "refusing TRACY_GITHUB_API=$TRACY_GITHUB_API — only a loopback http URL (tests) may replace api.github.com"
  API_URL="$TRACY_GITHUB_API"
fi
if [ -n "${TRACY_BRANDS_REMOTE:-}" ]; then
  if [[ "$TRACY_BRANDS_REMOTE" =~ ^http://(127\.0\.0\.1|localhost):[0-9]{1,5}(/[A-Za-z0-9._-]+)*/?$ ]]; then
    :
  else
    remote_path="${TRACY_BRANDS_REMOTE#file://}"
    [[ "$remote_path" = /* ]] && [ -d "$remote_path" ] \
      && [ "$(git -C "$remote_path" rev-parse --is-bare-repository 2>/dev/null)" = true ] \
      || die "refusing TRACY_BRANDS_REMOTE=$TRACY_BRANDS_REMOTE — only a loopback http URL or an absolute path to a local bare repository (tests) may replace github.com"
  fi
  REMOTE_URL="$TRACY_BRANDS_REMOTE"
fi
LOCK_FILE=/var/lock/tracy-brands-sync
if [ -n "${TRACY_BRANDS_LOCK:-}" ]; then
  # Only a file of this name, never a symlink or anything but a regular file: the run opens it as
  # root, and a lock must not become a way to create or touch an arbitrary file.
  [ "$(basename "$TRACY_BRANDS_LOCK")" = tracy-brands-sync.lock ] && [ ! -L "$TRACY_BRANDS_LOCK" ] \
    && { [ ! -e "$TRACY_BRANDS_LOCK" ] || [ -f "$TRACY_BRANDS_LOCK" ]; } \
    || die "refusing TRACY_BRANDS_LOCK=$TRACY_BRANDS_LOCK — it must be a regular file named tracy-brands-sync.lock"
  LOCK_FILE="$TRACY_BRANDS_LOCK"
fi

# One sync at a time per host: the timer and a hand run must not push the same repo twice at once.
# Ten minutes at most, like sync-site-folders.sh: a run stuck behind a hung one must not queue
# forever, with every later tick queueing behind it.
exec 9>>"$LOCK_FILE"
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
# 🔒 The helper answers for https://github.com ONLY (every other helper is reset first): whatever the
# remote is, git hands the token to no other host.
CRED=(-c credential.helper= -c "credential.https://github.com.helper=$HELPER")

if [ ! -d "$STORE/.git" ]; then
  say "no clone yet — cloning $REPO into $STORE"
  [ "$DRY_RUN" = true ] && die "--dry-run cannot run before the first clone"
  mkdir -p "$(dirname "$STORE")"
  git "${CRED[@]}" clone -q "$REMOTE_URL" "$STORE" \
    || die "clone of $REPO failed (see git's message above: auth, network, or no such repo)"
  git -C "$STORE" config user.email "fleet@tracy.ai"
  git -C "$STORE" config user.name "Tracy Fleet"
fi

# The remote carries NO token — see the 🔒 block at the top.
git -C "$STORE" remote set-url origin "$REMOTE_URL"

# One pass: reset to origin, copy in every lane folder that is newer, rebuild, commit, publish
# through a PR. `attempt --last` is the second pass: a PR that still cannot merge is left open and
# named instead of closed.
# Returns 0 published, 10 nothing to publish, 20 `main` moved or the merge conflicted (the PR is
# closed and its branch deleted: run again), 1 failed (the cause is printed).
attempt() {
  local last="${1:-}"
  git -C "$STORE" "${CRED[@]}" fetch -q origin main || {
    say "fetch of main failed (see git's message above: auth, network, or no such repo)"
    return 1
  }
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

  local base head
  base=$(git -C "$STORE" rev-parse origin/main)
  head=$(git -C "$STORE" rev-parse --short=12 HEAD)
  # The token reaches git through the same environment-reading helper as above (never argv).
  TRACY_PUBLISH_GIT_TOKEN=1 node "$PUBLISH" publish --dir "$STORE" --repo "$REPO" --api "$API_URL" \
    --branch "$BRANCH_PREFIX$head" --base "$base" --title "brands: $hosts" \
    --body "Published by $(hostname) from the lanes on this host (sync-brands.sh)." ${last:+"$last"}
}

if [ "$DRY_RUN" = false ]; then
  # A run that died between opening its PR and merging it left that PR open: settle it before
  # generating anything, so this run never opens a duplicate beside it.
  TRACY_PUBLISH_GIT_TOKEN=1 node "$PUBLISH" leftover --dir "$STORE" --repo "$REPO" --api "$API_URL" \
    --prefix "$BRANCH_PREFIX" || die "could not settle this host's leftover PR (see above)"
fi

attempt
CODE=$?
if [ "$CODE" = 20 ]; then
  attempt --last
  CODE=$?
fi
[ "$CODE" = 0 ] || [ "$CODE" = 10 ] || die "sync failed (see above)"
[ "$CODE" = 0 ] && say "published to https://github.com/$REPO"
exit 0
