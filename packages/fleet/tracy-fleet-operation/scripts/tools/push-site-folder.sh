#!/usr/bin/env bash
#
# Push one site's site folder to its team repo `TracyHQ/<label>-…`. Runs ON the host (inside the
# tracy-host container), as root.
#
# ## Why this script exists
#
# The repo is created automatically when the site is built, but it is born EMPTY: GitHub's
# `auto_init` writes a one-line `README.md` and nothing else. The site folder lives on the host and
# is not a git repo. So "the folder layout is on GitHub" is not true until somebody pushes — and
# before this script nobody did.
#
# ## Token: ASKED FOR, never held
#
# 🔒 ADR 0023 — the fleet NEVER holds the GitHub App key. That key reaches every customer's repo.
# The host signs a question with its own `HOST_SECRET` and sends it to tracy-web's
# `/fleet/git-token` through `lib/relay-git-token.sh` (the one signing path every fleet caller
# shares), and gets back a token that lives one hour, reaches exactly ONE repo, `contents` only.
# The Worker-era block that read a shared relay secret from /etc/tracy/hooks.env and asked
# seats.tracy.ai is gone: that file does not exist in the tracy-host container, and the new door
# answered it BAD_SIGNATURE — measured 02/10/2026, 58 of 58 repos still held only `Initial commit`.
#
# The site record decides which repo, not this script — so no `repo` is sent. A script that has to
# guess a repo name guesses wrong the day a label and its repo drift apart. The label IS sent: the
# site key comes from `.tracy/site.json`, which the site's agent can edit, and the door refuses a
# key whose record does not name this host and this label (REPO_NOT_YOURS).
#
# A site whose record has no repo (the 43 demo sites, a provision still running) is not a failure:
# the door answers NO_REPO and this script exits 3, which `sync-site-folders.sh` counts as skipped.
#
# 🔒 THE TOKEN MUST NOT TOUCH DISK OR `ps`. It goes neither into the remote URL (which would stay
# in the repo's config for anyone who opens it later) nor into a command line (`ps` is public on
# the machine). It travels through a credential helper that reads it from the environment.
#
# ## Git metadata lives OUTSIDE the site folder (R1)
#
# The site folder belongs to the site's agent (www-data, mode 755). This script runs as root, in a
# container that holds `docker.sock` — root on the host machine. A `.git` inside the site folder
# would let the agent plant a hook or a config line (`core.fsmonitor`, `core.hooksPath`, an alias)
# that root then runs on the next sync. And modern git refuses that `.git` anyway ("dubious
# ownership"), so the sync died there too.
#
# So the repo lives in the private root, root-owned: `$TRACY_PRIVATE_ROOT/<label>/site-sync.git`.
# Every git call names it with `--git-dir`, names the site folder with `--work-tree`, trusts that
# work tree explicitly (`-c safe.directory`, command scope, which git honours) and turns hooks off
# (`-c core.hooksPath=/dev/null`). Nothing is read from a `.git` inside the site folder; a legacy
# one left there by the old version of this script is ignored — git never descends into a `.git`
# directory of its work tree, and it is excluded besides.
#
# ## What may never be pushed (R3)
#
# The host holds its own exclude list in the git-dir's `info/exclude`, outside the agent's reach:
# the CMS (`.webroot/`), the site manifest (`.tracy/`), and anything shaped like a secret or a data
# dump. The site's own `.gitignore` applies on top — but it is the agent's file and can un-ignore
# anything with a `!` line, so after staging the STAGED TREE is scanned against the same patterns:
#
#   - a path shaped like a secret or a dump is staged → this site is aborted (exit 1), the path is
#     printed, nothing is committed. The index is dropped so the file is not left tracked.
#   - a staged blob over 95 MB → only that file is unstaged and named in the log; the rest still
#     goes. GitHub refuses files over 100 MB, and one such file would fail this site's push every
#     hour from then on. Archives (.zip, .tar.gz …) are allowed under that size (Brian 02/10/2026:
#     today they are agent deliverables such as a 2 MB `tracy-site.zip` of static HTML).
#
# ## History: APPEND, never overwrite
#
# The repo already has `auto_init`'s commit, and a long-running site has whatever the customer's
# team pushed. `git push --force` would delete all of it. So HEAD is set to the remote's commit
# **without touching any file in the folder**, and this run's commit goes on top. Our `README.md`
# replaces GitHub's stub as an ordinary, reversible change.
#
# Only an origin that `ls-remote` confirms has NO `main` takes the "first commit" path (R6). Any
# other fetch failure — network, auth, a rejected token — stops this site: committing a root commit
# and pushing it over a `main` we merely failed to read would be a non-fast-forward at best.
#
# ## One writer at a time (R4)
#
# Two runs of this script on one site (the hourly sync and a run by hand) hold the same per-repo lock
# (`lib/repo-lock.sh`) from the setup of the git dir to the push, so neither writes the other's
# config or pushes over a `main` the other just moved.
#
# ## Runs again, and again (Lee, 06/09/2026): the site folder is the truth, one way
#
# `sync-site-folders.sh` runs this script for every site on the host once an hour (started by
# tracy-host, `apps/tracy-host/src/sync.js`), so `Brand/<host>/` — fonts, images and all, Lee's
# call — and whatever the agent writes under `TracyWork/` reach the team repo without anyone
# pushing by hand.
#
# 🔒 ONE WAY. Each run commits the folder AS IT IS ON THE HOST on top of origin/main: a file a
# teammate added on GitHub and nobody brought into the site folder is deleted by the next sync, and
# an edit made on GitHub is overwritten. Pulling the other way is a separate decision, not taken.
#
# The commit message names what changed: the first push says "scaffold", every later one "sync"
# plus the top-level directories touched, so the repo's history reads as a log.
#
# ## Use
#
#   push-site-folder.sh <label> <siteKey>
#   push-site-folder.sh tchwp2 tchwp2.tracy.ai
#
# Exit: 0 pushed or nothing to push · 3 the site has no repo (skipped) · anything else failed.
#
# Overridable for the test suite (test/site-folder-sync.test.mjs), which pushes to a local bare
# repo instead of GitHub: TRACY_GIT_REMOTE_BASE (default https://github.com), TRACY_REPO_LOCK_DIR.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/relay-git-token.sh
. "$HERE/../lib/relay-git-token.sh"
# shellcheck source=../lib/repo-lock.sh
. "$HERE/../lib/repo-lock.sh"

LABEL="${1:?usage: push-site-folder.sh <label> <siteKey>}"
SITE_KEY="${2:?missing siteKey}"

EXIT_NO_REPO=3
# GitHub's hard limit is 100 MB per file; stop short of it.
MAX_BLOB_BYTES=$((95 * 1024 * 1024))

# The host's own exclude list, written to the git-dir's info/exclude on every run (so a change
# here reaches every site on its next sync). `.git` is listed too, for the legacy repo the old
# version of this script left inside site folders.
HOST_EXCLUDES='.git
.webroot/
.tracy/
.env*
*.pem
*.key
id_*
*.sql
*.sqlite*'

die() { echo "push-site-folder: $*" >&2; exit 1; }
say() { echo "push-site-folder: $*"; }

# True when a staged path must never leave the host — the same shapes as HOST_EXCLUDES, matched
# on the file name (and `.webroot/`/`.tracy/` on the path), because the site's .gitignore may
# have un-ignored any of them.
forbidden_path() {
  local base="${1##*/}"
  case "$1" in
    .webroot/* | */.webroot/* | .tracy/* | */.tracy/*) return 0 ;;
  esac
  case "$base" in
    .env* | *.pem | *.key | id_* | *.sql | *.sqlite*) return 0 ;;
  esac
  return 1
}

# The site folder itself — tracy_site_dir(), the same path provision.sh writes AGENTS.md and the
# rest of ensure-site-folder.mjs's output to.
SITE_FOLDER="$(tracy_site_dir "$LABEL")"
[ -d "$SITE_FOLDER" ] || die "$SITE_FOLDER does not exist — this site has no site folder yet"
[ -f "$SITE_FOLDER/.gitignore" ] || die "$SITE_FOLDER has no .gitignore — not built by ensure-site-folder.mjs"

# 🔒 The last stop before anything is committed. `.webroot/` is a whole CMS with its own history in
# `webroot-baseline.git`. Committing it to the team repo is forever — nobody can take it out of git
# history once the customer's team has cloned. (Also in HOST_EXCLUDES; this check predates it and
# stays as the louder of the two.)
grep -qx '\.webroot/' "$SITE_FOLDER/.gitignore" || die ".gitignore does not exclude .webroot/ — refusing to push"

# ── token ──────────────────────────────────────────────────────────────────────────────────────
ANSWER=""
rc=0
ANSWER=$(tracy_relay_git_token_for_site "$SITE_KEY" "$LABEL") || rc=$?
if [ "$rc" -eq 3 ]; then
  say "the site record has no repo for $SITE_KEY — skipped"
  exit "$EXIT_NO_REPO"
fi
[ "$rc" -eq 0 ] || die "the token door refused or could not be reached (see above)"
REPO=${ANSWER%% *}
GH_TOKEN=${ANSWER#* }
ANSWER=""
export GH_TOKEN
say "the site record says the repo is $REPO"

REMOTE="${TRACY_GIT_REMOTE_BASE:-https://github.com}/$REPO.git"
SYNC_GIT="$(tracy_private_dir "$LABEL")/site-sync.git"

# The helper reads the token from the environment: never in argv, never in a config file.
# shellcheck disable=SC2016 # expanded by git's shell, from the environment, on purpose
HELPER='!f() { echo username=x-access-token; echo password=$GH_TOKEN; }; f'

# Every git call in this script. `credential.helper=` first clears any helper a system config
# names, so only ours answers.
sg() {
  git --git-dir="$SYNC_GIT" --work-tree="$SITE_FOLDER" \
    -c safe.directory="$SITE_FOLDER" -c safe.directory="$SYNC_GIT" \
    -c core.hooksPath=/dev/null -c core.fsmonitor=false \
    -c credential.helper= -c credential.helper="$HELPER" \
    -c user.email=fleet@tracy.ai -c user.name="Tracy Fleet" \
    "$@"
}

# Unstage one path back to what HEAD has (or out of the index when there is no HEAD yet).
unstage() {
  if sg rev-parse -q --verify HEAD >/dev/null 2>&1; then
    sg reset -q HEAD -- "$1" 2>/dev/null || true
  else
    sg rm -r -q --cached --ignore-unmatch -- "$1" >/dev/null
  fi
}

# ── from here to the push, this repo is ours alone (lib/repo-lock.sh) ─────────────────────────────
# Taken before the git-dir is set up, not after: a second run of this site writing the same
# `site-sync.git/config` at the same moment fails with "could not lock config file" (seen when the
# R4 test started two runs of one site together, 03/10/2026).
tracy_lock_repo "$LABEL" || die "could not take the repo lock"

if [ ! -d "$SYNC_GIT" ]; then
  mkdir -p "$(dirname "$SYNC_GIT")"
  git init -q --bare "$SYNC_GIT"
  git --git-dir="$SYNC_GIT" config core.bare false
  git --git-dir="$SYNC_GIT" symbolic-ref HEAD refs/heads/main
  say "created $SYNC_GIT"
fi
mkdir -p "$SYNC_GIT/info"
printf '%s\n' "$HOST_EXCLUDES" >"$SYNC_GIT/info/exclude"
# The remote carries NO token — see the 🔒 block at the top.
git --git-dir="$SYNC_GIT" config remote.origin.url "$REMOTE"

FIRST=false
if sg fetch -q --depth=1 origin main; then
  # HEAD onto the remote's commit WITHOUT touching the folder, so our commit appends instead of
  # overwriting. `git checkout` here would overwrite our README.md with GitHub's stub. The index is
  # kept from the last run, so unchanged files are not hashed again.
  sg update-ref refs/heads/main FETCH_HEAD
  sg symbolic-ref HEAD refs/heads/main
  sg reset -q --soft refs/heads/main
  say "appending to the history already on origin/main"
  # The scaffold is the first commit whose tree carries AGENTS.md; origin holding only GitHub's
  # auto_init stub (or anything without it) means this run IS the scaffold.
  sg cat-file -e refs/heads/main:AGENTS.md 2>/dev/null || FIRST=true
else
  # Only a remote that answers, and answers "no main", is an empty repo.
  HEADS=$(sg ls-remote --heads origin main) || die "could not read origin ($REPO) — not treating it as empty"
  [ -z "$HEADS" ] || die "origin has main but the fetch failed — refusing to start a second history"
  say "origin has no main yet — this is the first commit"
  # A local main left by an earlier run whose push failed must not become the new root's parent.
  sg update-ref -d refs/heads/main 2>/dev/null || true
  sg symbolic-ref HEAD refs/heads/main
  FIRST=true
fi

sg add -A

# R3: the staged tree, not the folder. `-z` because a file name may hold anything.
BLOCKED=""
while IFS= read -r -d '' path; do
  if forbidden_path "$path"; then
    BLOCKED="$BLOCKED $path"
    echo "push-site-folder: refusing to push $path — shaped like a secret or a data dump" >&2
  fi
done < <(sg diff --cached --name-only -z --diff-filter=ACMR)
if [ -n "$BLOCKED" ]; then
  # Drop the index: a refused file must not stay tracked into the next run, where it would be
  # pushed the moment the scan was weakened. The next run rebuilds the index from the folder.
  rm -f "$SYNC_GIT/index"
  die "nothing pushed for $LABEL: remove the file(s) above from the site folder, or ignore them"
fi

while IFS= read -r -d '' path; do
  size=$(sg cat-file -s ":$path" 2>/dev/null || echo 0)
  if [ "$size" -gt "$MAX_BLOB_BYTES" ]; then
    unstage "$path"
    say "skipped $path — $((size / 1024 / 1024)) MB, over GitHub's per-file limit; the rest still goes"
  fi
done < <(sg diff --cached --name-only -z --diff-filter=ACMR)

if sg diff --cached --quiet; then
  say "nothing to push — the repo already matches the site folder"
  exit 0
fi

# Print what is ABOUT to be pushed. A script that pushes silently is one nobody can check later.
say "about to push $(sg diff --cached --name-only | wc -l | tr -d ' ') file(s):"
sg diff --cached --name-status | sed 's/^/  /'

if [ "$FIRST" = true ]; then
  sg commit -q -m "chore(tracy): scaffold the site folder

Written by Tracy when the site was built: the folder layout, the READMEs saying
what belongs in each directory, and AGENTS.md — the file the site's agent reads
at the start of every session.

The live site is not here. It stays on the host, where its own history is kept."
else
  # The top-level directories touched, as the subject: `Brand, TracyWork`. A root file shows as its name.
  TOUCHED=$(sg diff --cached --name-only | awk -F/ '{print (NF>1 ? $1 : $0)}' | sort -u | paste -sd, - | sed 's/,/, /g')
  sg commit -q -m "chore(tracy): sync the site folder from the host — $TOUCHED

The folder as it stands on the host, committed on top of origin/main by the
hourly sync (sync-site-folders.sh). One way: the site folder is the source of truth."
fi

sg push -q origin HEAD:refs/heads/main || die "push to $REPO was refused — the next run starts again from origin/main"
say "pushed to $REPO"
