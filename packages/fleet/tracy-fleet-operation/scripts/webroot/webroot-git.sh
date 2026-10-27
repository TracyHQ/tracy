#!/usr/bin/env bash
# webroot-git.sh — the webroot's git lives ON the fleet host (ADR 0073 §3): build it, read what
# changed, read the history, write the moments.
#
# The source of truth for a webroot is the repo next to it: GIT_DIR=/srv/tracy/<label>/
# webroot-baseline.git, worktree = webroot/ beside it. GIT_DIR sits OUTSIDE the webroot on
# purpose — a .git inside the webroot is a directory Apache serves to the whole world.
#
# Never borrow `repo.git` next door: that is the code clone deploy pulls from GitHub (ADR 0050)
# and it runs sparse-checkout, which refuses to add the whole tree (measured 21/08 on joomlart).
#
# WHO WRITES WHAT (Lee, 04/09/2026; backups since ADR 0024):
#
#   moment    the machine, after an agent turn: whatever is dirty becomes one commit
#             "agent: <title>", author Agent <agent@tracy.ai>.
#   outside   the machine, whenever somebody looks or backs up: edits made on the site itself
#             (admin, FTP, an extension update) become "outside Tracy: …", author
#             On the site <outside@tracy.ai>.
#   backup    a PERSON, by name: an annotated tag tracy-release/vN whose tagger is that person
#             (webroot-backup.sh; the tags keep the prefix they were first numbered under). v1 is
#             the baseline itself, tagged "Initial backup" by the machine — a site never starts
#             without a backup to compare against.
#
# Ops:
#   --op ensure                creates the repo if missing, commits the baseline, tags tracy-baseline + v1
#   --op changes               JSON: everything since the latest backup — the moments, and the
#                              files they add up to (committed AND still on the worktree), each
#                              file with its zone and who touched it last
#   --op history               JSON: backups and the moments between them, newest first
#   --op moment --title T [--turn S:N]
#                              seal the dirty worktree as one agent moment (no-op when clean); with
#                              --turn the commit carries a `Tracy-Turn: S:N` trailer and the turn's
#                              open mark is cleared
#   --op seal-outside [--turn S:N]
#                              seal what is dirty as "outside Tracy": at the start of a chat turn, so
#                              files dirty BEFORE the turn never land in its moment; with --turn it
#                              marks the turn open, and a look while a turn is open seals nothing
#   --op turn-moments --turns A,B,C
#                              JSON: the commits each named turn made, with their files
#   --op deploy-prepare --path P --tag T --source F
#   --op deploy-commit         a deploy rewriting one file (tools/resync-access-plugin.sh) gets an
#                              outside commit of its own; see "A deploy's own commit" below
#   --op commit --sha X        JSON: the files ONE moment touched, with status, line counts, zone
#   --op file-diff --path X    diff of one file against the baseline (uncommitted included);
#                              a configuration file is refused (lib/webroot-sensitive.sh)
#   --op file-diff --path X --sha S
#                              that moment's own change to the file, S^ → S (same refusals)
#   --op file-show --path X --ref baseline|worktree
#   --op restore-undo --sha X  revert exactly the files one moment touched
#   --op restore-reset --sha X bring the whole webroot back to that moment
#   --op undo-check --shas A,B,C
#                              JSON, read-only: whether undoing those moments one after another,
#                              newest first (A first), would succeed — the restore-undo test run on
#                              the tree each earlier undo would leave — plus each moment's zones
#
# Each op is one whole run — the script keeps no state between two calls.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="${TRACY_LIB_DIR:-$HERE/../lib}"
# shellcheck source=../lib/roots.sh
. "$LIB_DIR/roots.sh"
# shellcheck source=../lib/webroot-excludes.sh
. "$LIB_DIR/webroot-excludes.sh"
# shellcheck source=../lib/webroot-platform.sh
. "$LIB_DIR/webroot-platform.sh"
# shellcheck source=../lib/webroot-sensitive.sh
. "$LIB_DIR/webroot-sensitive.sh"
# shellcheck source=../lib/webroot-repo-git.sh
. "$LIB_DIR/webroot-repo-git.sh"

LABEL="" OP="" FILE_PATH="" REF="worktree" SHA="" SHAS="" TITLE="" TURN="" TURNS="" TAG="" SOURCE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --turn) TURN="$2"; shift 2 ;;
    --turns) TURNS="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --op) OP="$2"; shift 2 ;;
    --path) FILE_PATH="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --sha) SHA="$2"; shift 2 ;;
    --shas) SHAS="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$LABEL" && -n "$OP" ]] || { echo "need --label and --op" >&2; exit 2; }
tracy_require_label "$LABEL"

# A chat turn's id is `<dsh session id>:<turn number>` (P0 turn-id.md): the number survives a dsh
# restart and a fork gets a new session id, so the pair names one turn for good. It becomes a file
# name and a commit trailer below, so its shape is checked before anything uses it.
TURN_SHAPE='^[A-Za-z0-9_-]{1,128}:[0-9]{1,9}$'
if [[ -n "$TURN" && ! "$TURN" =~ $TURN_SHAPE ]]; then echo "refused --turn" >&2; exit 2; fi

# STACK stays the private root (core-manifest.json below lives beside .env, not beside the
# webroot). `TRACY_SRV` — honoured by lib/roots.sh — exists for the test suite, which builds a
# throwaway stack under a temp dir; on a host it is unset and the stack is where it has always
# been.
STACK="$(tracy_private_dir "$LABEL")"
WEBROOT="$(tracy_webroot_dir "$LABEL")"
REPO="$(tracy_repo_dir "$LABEL")"
[[ -d "$WEBROOT" ]] || { echo "no webroot at $WEBROOT" >&2; exit 1; }

# Every git command goes through one GIT_DIR/work-tree pair — never cd into the webroot, so
# nothing here depends on whether the repo has core.worktree set.
g() { git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" "$@"; }

BASELINE_TAG="tracy-baseline"
# The backups' tag prefix, the same value as webroot-backup.sh's — which says why it keeps the name
# the points were first numbered under.
BACKUP_TAG_PREFIX="tracy-release"

# The two machine authors. The seat book maps them back to the "agent" and "outside" faces; a
# backup's tagger is a real person and carries their own name (webroot-backup.sh).
AGENT_NAME="Agent"        AGENT_EMAIL="agent@tracy.ai"
OUTSIDE_NAME="On the site" OUTSIDE_EMAIL="outside@tracy.ai"

# Heavy work yields the DISK to the customers' sites (ionice idle class; Linux-only, the test host
# has none). It does NOT yield the CPU any more. 🔒 NEVER `nice` WORK THAT HOLDS THE HEAVY LOCK:
# every other heavy job on the machine waits on that lock, so a holder at nice 19 is a priority
# inversion. 12/10/2026 on fleet01 (2 cores, 14 demo installs): one baseline held the lock 46+ min
# and ten waited behind it. Measured in a 2-core lab with the ja-space webroot (11,302 files): the
# baseline takes 2-3 s alone; with two normal-priority busy processes it takes 6 s at nice 0 and
# does not finish in 240 s at nice 19 (CFS weight 15 against 1024). The lock already keeps this
# to one job per machine, so at normal priority it costs the sites at most one core, for seconds.
# Pinned by test/webroot-heavy-lock-priority.test.mjs.
GENTLE=(env)   # a no-op prefix: an empty array trips `set -u` in the macOS test host's bash 3.2
command -v ionice >/dev/null 2>&1 && GENTLE+=(ionice -c3)

# And never two heavy jobs at once: one lock for the whole machine, not per site, because the
# scarce thing is the core, not the directory.
HEAVY_LOCK="${TRACY_HEAVY_LOCK:-/var/lock/tracy-webroot-heavy.lock}"
run_heavy() {
  # `flock` is util-linux; the test host (macOS) has none, and there nothing else contends.
  # TRACY_HEAVY_LOCK_HELD: the caller (webroot-backup.sh restore-everything) already holds it, and
  # a second open of the same file would wait on its own parent.
  if [[ -n "${TRACY_HEAVY_LOCK_HELD:-}" ]] || ! command -v flock >/dev/null 2>&1; then "$@"; return; fi
  exec 9>"$HEAVY_LOCK"
  # A queue must LOOK like a queue (12/10/2026, fleet01). The step a provision job shows is the last
  # `==> ` line its script printed (`stepFromLine`, apps/tracy-host/src/provision.js), so eight demo
  # installs pressed together all read "building the webroot baseline" for 10+ minutes while seven
  # only waited here. Try once without waiting; when the lock is taken, say so, wait as before, then
  # put the step back to the work this caller is about to do (HEAVY_RESUME_STAGE). On stderr, never
  # stdout: every op answers its caller with one JSON line there.
  if ! flock -n 9; then
    echo "==> waiting for another site's webroot baseline (one at a time per machine)" >&2
    if ! flock -w 1800 9; then
      echo "another heavy webroot job is running; try again shortly" >&2
      exit 1
    fi
    [[ -n "${HEAVY_RESUME_STAGE:-}" ]] && echo "==> ${HEAVY_RESUME_STAGE}" >&2
  fi
  "$@"
}

# One site, one writer at a time. Every op that commits (a moment, a seal, a look that seals, a
# restore, a deploy's copy) takes this lock, so a deploy rewriting `tracy-access.php` never has its
# file swept into a moment that commits halfway through the copy. Per site, unlike the heavy lock:
# two sites never contend. The same file is what tools/resync-access-plugin.sh locks, and a caller
# that already holds it sets TRACY_WEBROOT_LOCK_HELD. No flock (the macOS test host) → unlocked,
# as `run_heavy` does.
locked() {
  if ! command -v flock >/dev/null 2>&1 || [[ ! -d "$REPO" ]]; then
    "$@"
    return
  fi
  if [[ -z "${TRACY_WEBROOT_LOCK_HELD:-}" ]]; then
    exec 8>"$REPO/tracy-webroot.lock"
    if ! flock -w 120 8; then
      echo "another webroot job holds this site; try again shortly" >&2
      exit 1
    fi
  fi
  clear_orphan_index_lock
  "$@"
}

# ── an orphaned index.lock ───────────────────────────────────────────────────────────────────
# A git process killed mid-write (OOM, a container stopped, a deploy cancelled) leaves
# `index.lock` behind, and every later write refuses with "remove the file manually to continue".
# Measured 03/10 on dev: an EMPTY index.lock from 28/09 froze one site's Site changes for 4.5 days
# and turned the deploy's hook resync red. Nobody is ever there to remove it by hand.
#
# Removed only when all three hold, so a live writer never loses its lock:
#   1. this run holds the site's `tracy-webroot.lock` (or its caller does) — every op that commits
#      takes it, so no other committing op is running;
#   2. the file is older than INDEX_LOCK_STALE_MINUTES. The writers that do NOT take the site lock
#      are webroot-edit.sh / webroot-push.sh (one file or one batch: seconds) and provision's
#      baseline `ensure`; 10 minutes is far past the first and is ruled out for the second by (3).
#      A git that held index.lock that long while alive is not a case this host has ever shown;
#   3. the site is not being provisioned — the baseline `add -A` of a large webroot runs under
#      nice/ionice, outside the site lock, and may legitimately hold index.lock for minutes.
# No flock on the machine (the macOS test host without the shim) → never removed: without the lock
# there is no proof nobody else is writing, so the old behaviour (stop and say so) stays.
INDEX_LOCK_STALE_MINUTES=10
clear_orphan_index_lock() {
  local lock="$REPO/index.lock"
  [[ -f "$lock" ]] || return 0
  [[ -n "$(find "$lock" -maxdepth 0 -mmin "+$INDEX_LOCK_STALE_MINUTES" 2>/dev/null)" ]] || return 0
  provision_running && return 0
  rm -f "$lock"
  echo "==> removed an orphaned index.lock (older than ${INDEX_LOCK_STALE_MINUTES} min) in $REPO" >&2
}

# ── open turns ───────────────────────────────────────────────────────────────────────────────
# A chat turn is OPEN from its first step to its moment: one file per turn under the repo dir
# (outside the webroot, so never a change itself). While one is open, a look at Changes seals
# nothing: what is dirty may be the file the agent is writing right now, and sealing it would make
# it "outside Tracy" and leave the turn's moment empty (plan todo-site-changes invariant 2). A mark
# older than 30 minutes is a turn that died without its moment (dsh killed mid-turn): it stops
# holding anything back. A directory of marks, not one file, so two conversations' turns on one
# site never clear each other's.
TURN_MARKS="$REPO/tracy-turn-open"
TURN_MARK_MINUTES=30

# 0 when a turn is open on this site that is not conversation `$1`'s (empty `$1`: any turn).
other_turn_open() {
  local session="${1:-}" mark
  [[ -d "$TURN_MARKS" ]] || return 1
  while IFS= read -r mark; do
    [[ -n "$mark" ]] || continue
    mark="${mark##*/}"
    [[ -n "$session" && "${mark%:*}" == "$session" ]] && continue
    return 0
  done < <(find "$TURN_MARKS" -type f -mmin "-$TURN_MARK_MINUTES" 2>/dev/null)
  return 1
}

require_repo() {
  [[ -d "$REPO" ]] && g rev-parse --verify HEAD >/dev/null 2>&1 \
    || { echo "webroot repo not built yet: run webroot-ensure first" >&2; exit 1; }
}

# A READER never turns a missing repo into an error. Provision builds the repo for WordPress and
# Joomla, but the emdash road never did (measured 05/09: every emdash lane lacked one, and only
# those), and a site that reached the host any other way has none either. Building it here costs
# the first look one snapshot of the webroot — the snapshot provision would have taken — and
# nothing after. `ensure` prints its own JSON; it goes to stderr so the reader's line stays last.
repo_built() { [[ -d "$REPO" ]] && g rev-parse --verify HEAD >/dev/null 2>&1; }

# provision.sh holds `tracy-provision-<label>.lock` for the whole build: if it cannot be taken
# now, the site is still being built. Taken and released at once otherwise; no flock (the macOS
# test host without the shim) reads as "not building", the behaviour before this check.
provision_running() {
  local lock="$TRACY_PROVISION_LOCK_DIR/tracy-provision-$LABEL.lock"
  [[ -e "$lock" ]] && command -v flock >/dev/null 2>&1 || return 1
  local held=1
  exec 6>"$lock"
  flock -n 6 && held=0
  exec 6>&-
  return $(( 1 - held ))
}

ensure_repo_built() {
  if repo_built; then return 0; fi
  echo "==> no webroot repo yet: building it on this first read" >&2
  run_heavy ensure 1>&2
}

# ── v1 is the baseline ───────────────────────────────────────────────────────────────────────
# A site that has a baseline has a first backup, by definition (Lee, 04/09): there is no "no
# version yet" state for Changes to compare against. Idempotent, cheap (one for-each-ref), and
# called from every reading op so a site built before this rule heals itself on the first look.
# A v1 tagged before 03/10/2026 says "Initial release": its message is data and stays.
ensure_initial_backup() {
  if g for-each-ref "refs/tags/$BACKUP_TAG_PREFIX/*" | grep . >/dev/null; then return 0; fi
  g rev-parse --verify "refs/tags/$BASELINE_TAG" >/dev/null 2>&1 || return 0
  GIT_COMMITTER_NAME="$AGENT_NAME" GIT_COMMITTER_EMAIL="$AGENT_EMAIL" \
    g tag -a "$BACKUP_TAG_PREFIX/v1" -m "Initial backup" "$BASELINE_TAG"
  echo "==> tagged $BACKUP_TAG_PREFIX/v1 on the baseline" >&2
}

ensure() {
  if [[ ! -d "$REPO" ]]; then
    git init --quiet --separate-git-dir="$REPO" "$WEBROOT"
    # `git init --separate-git-dir` leaves a `.git` pointer file inside the webroot — the exact
    # thing Apache would serve. Remove it now; every later command carries --git-dir/--work-tree.
    rm -f "$WEBROOT/.git"
  fi
  g config user.name "Tracy"
  g config user.email "fleet@tracy.ai"
  # Git here holds the site MINUS operational junk and giant files (ADR 0091 §8, revised 26/08):
  # the list lives in lib/webroot-excludes.sh and is rewritten before every `git add`, not only
  # at build time, because a site that has a baseline never calls `ensure` again.
  tracy_write_webroot_exclude "$REPO" "$WEBROOT"
  if ! g rev-parse --verify HEAD >/dev/null 2>&1; then
    # `-f`: this tree is a SNAPSHOT of the webroot, not the customer's repo. Many sites carry a
    # .gitignore of their own (JoomlArt ignores `images/`), and honouring it means the thing the
    # agent just edited does not show in Changes. OUR exclusion rules sit in info/exclude below.
    "${GENTLE[@]}" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" add -A -f
    # `-f` skips the customer's .gitignore and, at the same time, our info/exclude. Take it back.
    tracy_unstage_webroot_junk "$REPO" "$WEBROOT"
    # `--allow-empty`: a webroot with nothing to track is still a site with a baseline. Emdash keeps
    # its content in `data/` and `uploads/`, not under the webroot (measured 05/09 on tchemdash1:
    # zero files), and without this the first read failed with "nothing to commit" every time.
    "${GENTLE[@]}" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" commit --quiet --allow-empty -m "chore: webroot baseline"
  fi
  if ! g rev-parse --verify "refs/tags/$BASELINE_TAG" >/dev/null 2>&1; then
    g tag "$BASELINE_TAG"
  fi
  ensure_initial_backup
  echo "{\"ok\":true,\"head\":\"$(g rev-parse HEAD)\",\"baseline\":\"$(g rev-parse "$BASELINE_TAG")\"}"
}

# ── sealing the worktree ─────────────────────────────────────────────────────────────────────
# Stage everything that is dirty (excludes rewritten first, junk unstaged after) and report
# whether anything is left to commit. Shared by `moment` (author: the agent) and by the outside
# seal (author: the site). Sets STAGED_FILES.
STAGED_FILES=0
stage_dirty() {
  if worktree_unchanged; then
    STAGED_FILES=0
    return 1
  fi
  tracy_write_webroot_exclude "$REPO" "$WEBROOT"
  recover_pending
  housekeep
  "${GENTLE[@]}" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" add -A -f
  tracy_unstage_webroot_junk "$REPO" "$WEBROOT"
  if g diff --cached --quiet; then
    STAGED_FILES=0
    return 1
  fi
  STAGED_FILES="$(g diff --cached --name-only | wc -l | tr -d ' ')"
  return 0
}

# 0 when nothing in the webroot changed since the last commit, proved without the whole-webroot
# walks the road above pays (`find -size +50M`, `add -A -f`, the housekeeping scan, a full-index
# `diff --cached`): measured 12/10/2026 on the local stand, demo-tb-joomla (42,650 files over
# virtiofs), those cost ~3.2 s of a 4.5 s `history`, and Site changes runs one on every open.
# Each check answers "dirty" when unsure, and dirty takes the full road, so nothing is missed:
#   - a deploy record is pending (it commits one path under its own name: recover_pending);
#   - the exclude list was written by another version of the rules (housekeeping may be owed);
#   - the index differs from HEAD (a crashed op left something staged);
#   - a tracked file was edited or deleted (`diff-files`);
#   - an untracked file exists that our exclude list does not name. `ls-files --others` with only
#     `--exclude-from` reads info/exclude ALONE, never the customer's .gitignore — exactly the set
#     `add -A -f` + tracy_unstage_webroot_junk would stage. A new giant file is such a file, so it
#     still reaches the size walk.
# What waits for the next dirty look: housekeeping a commit made by another writer (a restore to an
# old point) brought back — the next moment's stage_dirty runs it before staging anything, so no
# deletion ever rides into a person's moment; and a giant file that shrank under 50 MB stays out.
worktree_unchanged() {
  [[ ! -f "$PENDING" ]] || return 1
  tracy_webroot_exclude_current "$REPO" || return 1
  # Index == HEAD, by tree id: `write-tree` reads the index's cache-tree and rebuilds it when an
  # earlier `rm --cached` invalidated it, so after the first look this is one lookup, where
  # `diff-index --cached` walked all 42,650 entries (~0.45 s) every time.
  local tree absolute_repo
  absolute_repo="$(g rev-parse --absolute-git-dir 2>/dev/null)" || return 1
  # Git must inspect racy index entries relative to the actual worktree.
  tree="$(g -C "$WEBROOT" --git-dir="$absolute_repo" --work-tree=. write-tree 2>/dev/null)" || return 1
  [[ "$tree" == "$(g rev-parse 'HEAD^{tree}')" ]] || return 1
  # One lstat pass, no refresh first: a file whose stat changed but whose bytes did not reads as
  # dirty, which only means the full road once (its `add` refreshes the index).
  g diff-files --quiet 2>/dev/null || return 1
  # The first untracked path is enough to answer; `head` ends the walk there. Under pipefail the
  # walk's SIGPIPE (141) would be the pipeline's status; `|| true` drops it, the byte read stands.
  [[ -z "$(g ls-files -z --others --exclude-from="$REPO/info/exclude" 2>/dev/null | head -c 1 || true)" ]]
}

# Files the exclude list now names but an older script already committed (`tracy-changed.json`
# on every site sealed before 01/10, a log from before `*.log`). Left alone, the next `add` +
# unstage turns each into a staged DELETION, and that deletion rode into whatever moment came next
# — a person's turn showing "deleted tracy-changed.json". So they leave the index first, in a commit
# of their own, by the site's author and titled "housekeeping" (the reader hides a commit that holds
# only such files — except this one in `history`, where Site changes lists it as Tracy tidying up).
# The files stay on disk. The index is set back to HEAD first so nothing else
# a crashed earlier op may have staged rides along.
HOUSEKEEPING_TITLE="housekeeping, internal files taken out of the history"
housekeep() {
  local -a junk=()
  local path
  while IFS= read -r -d '' path; do junk+=("$path"); done \
    < <(g ls-files -z --cached --ignored --exclude-from="$REPO/info/exclude" 2>/dev/null)
  [[ ${#junk[@]} -gt 0 ]] || return 0
  g reset --quiet
  printf '%s\0' "${junk[@]}" | g rm -r --cached --quiet --ignore-unmatch \
    --pathspec-from-file=- --pathspec-file-nul >/dev/null
  g diff --cached --quiet && return 0
  g commit --quiet --author="$OUTSIDE_NAME <$OUTSIDE_EMAIL>" -m "outside Tracy: $HOUSEKEEPING_TITLE"
  echo "==> housekeeping: ${#junk[@]} internal file(s) out of the index at $(g rev-parse --short HEAD)" >&2
}

# Edits made on the site itself become one commit. Called before every read so the list a person
# looks at is complete, and before a backup so the tag never points at a state that lacks the
# customer's own work (ADR 0091 §6). Prints nothing; the callers report.
SEALED_SHA=""
seal_outside() {
  SEALED_SHA=""
  if stage_dirty; then
    g commit --quiet --author="$OUTSIDE_NAME <$OUTSIDE_EMAIL>" \
      -m "outside Tracy: changes made to the site outside Tracy"
    SEALED_SHA="$(g rev-parse HEAD)"
    echo "==> sealed $STAGED_FILES file(s) made outside Tracy at $(g rev-parse --short HEAD)" >&2
  fi
}

# The files one commit touched, as a JSON list.
paths_json() {
  g -c core.quotePath=false diff-tree --no-commit-id --root -r --name-only -z "$1" \
    | python3 -c 'import json,sys; print(json.dumps([p for p in sys.stdin.read().split("\0") if p]))'
}

# `{"sha":…,"files":[…],"at":…,"parentAt":…}` of the seal this run made, or `null`. `at` is the seal's
# commit time and `parentAt` its parent's (unix seconds; null for a root commit): every file in the
# seal changed between the two, which is how Site changes tells the CMS row that wrote them (E5.1c).
sealed_json() {
  if [[ -n "$SEALED_SHA" ]]; then
    local at parent_at
    at="$(g log -1 --format=%ct "$SEALED_SHA")"
    parent_at="$(g log -1 --format=%ct "$SEALED_SHA^" 2>/dev/null || true)"
    echo "{\"sha\":\"$SEALED_SHA\",\"files\":$(paths_json "$SEALED_SHA"),\"at\":$at,\"parentAt\":${parent_at:-null}}"
  else
    echo null
  fi
}

# The site's latest outside commits (seals, housekeeping, deploys) as JSON, newest first. The op
# that opens a turn returns them, and tracy-web keeps each as a `site_outside` row (insert-or-skip
# by sha): a deploy's commit is made where no tracy-web can be called (a container with no
# network), so this is how it reaches the activity list — at the next turn on that site. Git is the
# record; Postgres reads it.
recent_outside_json() {
  python3 - "$REPO" "$WEBROOT" "$OUTSIDE_EMAIL" "outside Tracy: $HOUSEKEEPING_TITLE" <<'PYEOF'
import json, re, subprocess, sys
repo, webroot, outside, housekeeping = sys.argv[1:5]
sep = "\x1e"
out = subprocess.run(["git", "-c", "core.quotePath=false", "--git-dir", repo, "--work-tree", webroot, "log", "-30",
                      f"--author=<{outside}>", f"--format={sep}%H%x09%at%x09%P%x09%s", "--name-only"],
                     capture_output=True, text=True, check=True).stdout
chunks = out.split(sep)[1:]
# Each commit's first parent, and when that parent was made (one git call for all of them): the seal's
# window opens there (E5.1c).
parents = [((c.split("\n")[0].split("\t") + ["", "", ""])[2].split(" ") or [""])[0] for c in chunks]
parent_at = {}
wanted = sorted({p for p in parents if p})
if wanted:
    shown = subprocess.run(["git", "--git-dir", repo, "show", "-s", "--format=%H%x09%ct", *wanted],
                           capture_output=True, text=True, check=True).stdout
    for line in shown.splitlines():
        h, _, t = line.partition("\t")
        if t.isdigit(): parent_at[h] = int(t)
rows = []
for chunk, parent in zip(chunks, parents):
    lines = chunk.split("\n")
    sha, at, _, subject = (lines[0].split("\t", 3) + ["", "", "", ""])[:4]
    deploy = re.match(r"^outside Tracy: deploy (\S+) updated ", subject)
    cause = "deploy" if deploy else ("housekeeping" if subject == housekeeping else "seal")
    title = subject[len("outside Tracy: "):] if subject.startswith("outside Tracy: ") else subject
    rows.append({"sha": sha, "at": int(at), "title": title, "cause": cause,
                 "deployTag": deploy.group(1) if deploy else None, "files": [p for p in lines[1:] if p],
                 "parentAt": parent_at.get(parent)})
print(json.dumps(rows))
PYEOF
}

# A chat turn opens: what is dirty NOW was changed before the turn, so it is sealed as outside, and
# the turn is marked open. This conversation's own older marks go first: a new turn means its
# previous one is over, moment or not, and what that one left is sealed as outside rather than
# handed to this turn. One refusal to seal, said in `skipped: "turn-open"`: ANOTHER conversation's
# turn is open on this site, its files are on the worktree right now, and sealing them would give
# them to nobody. Both turns then share what their moments find (plan §4, two people chatting at
# once, a declared limit); tracy-web flags both `concurrent`.
seal_outside_op() {
  ensure_repo_built
  ensure_initial_backup
  local session="" skipped="null"
  if [[ -n "$TURN" ]]; then
    session="${TURN%:*}"
    mkdir -p "$TURN_MARKS"
    find "$TURN_MARKS" -type f -name "${session}:*" -delete 2>/dev/null || true
  fi
  SEALED_SHA=""
  if other_turn_open "$session"; then
    skipped='"turn-open"'
    recover_pending
  else
    seal_outside
  fi
  [[ -z "$TURN" ]] || touch "$TURN_MARKS/$TURN"
  echo "{\"ok\":true,\"head\":\"$(g rev-parse HEAD)\",\"sealed\":$(sealed_json),\"skipped\":$skipped,\"outside\":$(recent_outside_json)}"
}

# One agent turn → one moment. The host dsh calls this when a chat turn stops (site-tabs
# `agent/turn-stopping`), with the turn id; an older dsh calls it on idle without one. The title is
# the request the person typed. A clean worktree is a normal answer, not an error: most turns are
# questions, not edits. With a turn, the commit carries `Tracy-Turn: <id>` as a trailer — its own
# paragraph, so `%(trailers)` reads it and the title stays one line — and the turn's mark is cleared.
moment() {
  require_repo
  [[ -n "$TITLE" ]] || { echo "need --title" >&2; exit 2; }
  ensure_initial_backup
  local committed=false sha=null paths="[]"
  if stage_dirty; then
    if [[ -n "$TURN" ]]; then
      g commit --quiet --author="$AGENT_NAME <$AGENT_EMAIL>" -m "agent: $TITLE" -m "Tracy-Turn: $TURN"
    else
      g commit --quiet --author="$AGENT_NAME <$AGENT_EMAIL>" -m "agent: $TITLE"
    fi
    committed=true
    sha="\"$(g rev-parse HEAD)\""
    paths="$(paths_json HEAD)"
    echo "==> moment: $STAGED_FILES file(s) at $(g rev-parse --short HEAD)" >&2
  fi
  [[ -z "$TURN" ]] || rm -f "$TURN_MARKS/$TURN"
  echo "{\"ok\":true,\"committed\":$committed,\"files\":$STAGED_FILES,\"head\":\"$(g rev-parse HEAD)\",\"sha\":$sha,\"paths\":$paths}"
}

# ── A deploy's own commit ────────────────────────────────────────────────────────────────────
# tools/resync-access-plugin.sh rewrites `wp-content/mu-plugins/tracy-access.php` on every
# WordPress site when a deploy ships a new one. That is a change no person asked for in chat, so it
# is OUTSIDE (Brian 01/10) and gets a commit of its own the moment it is written — otherwise the
# next turn's moment swallowed it (01/10, "Change the badge text" holding tracy-access.php). The
# resync holds this site's lock across three steps:
#   deploy-prepare  a pending record is written BEFORE the copy (`<repo>/tracy-deploy-pending`), and
#                   a destination already dirty is committed first: as the deploy's when it already
#                   holds the shipped bytes (an earlier deploy copied it untracked), as an ordinary
#                   outside seal otherwise — so a customer's own edit is never relabelled a deploy.
#   (the copy)      in the resync's own process (O_NOFOLLOW, renameat).
#   deploy-commit   exactly that one path, author outside, "outside Tracy: deploy <tag> updated …";
#                   the pending record goes. Bytes equal to HEAD: no commit.
# A run killed after the copy leaves the pending record; the next op that stages anything (a
# moment, a seal, a look, the next resync) commits it first, under the deploy's name.
PENDING="$REPO/tracy-deploy-pending"
TAG_SHAPE='^[A-Za-z0-9._:+-]{1,128}$'

# Commit one path alone, author outside, with this subject. Index set back to HEAD first, so the
# commit holds that path and nothing else. Sets SEALED_SHA (empty when the path was clean).
commit_one_path() {
  local rel="$1" subject="$2"
  SEALED_SHA=""
  [[ -n "$(g status --porcelain --untracked-files=all -- "$rel")" ]] || return 0
  g reset --quiet
  g add -A -f -- "$rel"
  g diff --cached --quiet && return 0
  g commit --quiet --author="$OUTSIDE_NAME <$OUTSIDE_EMAIL>" -m "$subject"
  SEALED_SHA="$(g rev-parse HEAD)"
}

recover_pending() {
  [[ -f "$PENDING" ]] || return 0
  local tag rel
  IFS=$'\t' read -r tag rel < "$PENDING" || true
  if [[ -n "$rel" ]]; then
    commit_one_path "$rel" "outside Tracy: deploy ${tag:-unknown} updated ${rel##*/}"
    [[ -z "$SEALED_SHA" ]] || echo "==> deploy ${tag:-unknown}: committed $rel at $(g rev-parse --short HEAD)" >&2
  fi
  rm -f "$PENDING"
}

deploy_prepare() {
  require_repo
  [[ -n "$FILE_PATH" && -n "$SOURCE" ]] || { echo "need --path and --source" >&2; exit 2; }
  [[ "$TAG" =~ $TAG_SHAPE ]] || { echo "refused --tag" >&2; exit 2; }
  case "/$FILE_PATH/" in //* | */../* | */./*) echo "refused --path" >&2; exit 2 ;; esac
  recover_pending
  local sealed="null"
  if [[ -f "$WEBROOT/$FILE_PATH" ]] && cmp -s "$SOURCE" "$WEBROOT/$FILE_PATH"; then
    commit_one_path "$FILE_PATH" "outside Tracy: deploy $TAG updated ${FILE_PATH##*/}"
  else
    commit_one_path "$FILE_PATH" "outside Tracy: changes made to the site outside Tracy"
  fi
  sealed="$(sealed_json)"
  local pending=false
  if ! { [[ -f "$WEBROOT/$FILE_PATH" ]] && cmp -s "$SOURCE" "$WEBROOT/$FILE_PATH"; }; then
    printf '%s\t%s\n' "$TAG" "$FILE_PATH" > "$PENDING"
    pending=true
  fi
  echo "{\"ok\":true,\"sealed\":$sealed,\"pending\":$pending}"
}

deploy_commit() {
  require_repo
  SEALED_SHA=""
  recover_pending
  echo "{\"ok\":true,\"committed\":$([[ -n "$SEALED_SHA" ]] && echo true || echo false),\"sealed\":$(sealed_json)}"
}

# The commits each named turn made (`--turns a,b,c`), newest first, with their files: one walk
# of the last 2000 commits, read by trailer. `truncated` when the walk hit that floor.
turn_moments() {
  require_repo
  [[ -n "$TURNS" ]] || { echo "need --turns" >&2; exit 2; }
  local one
  IFS=',' read -r -a wanted <<<"$TURNS"
  [[ ${#wanted[@]} -le 100 ]] || { echo "refused --turns: at most 100" >&2; exit 2; }
  for one in "${wanted[@]}"; do
    [[ "$one" =~ $TURN_SHAPE ]] || { echo "refused --turns" >&2; exit 2; }
  done
  python3 - "$REPO" "$WEBROOT" "$TURNS" <<'PYEOF'
import json, subprocess, sys
repo, webroot, turns = sys.argv[1:4]
wanted = {t: [] for t in turns.split(",")}
sep, floor = "\x1e", 2000
fmt = f"{sep}%H%x09%at%x09%(trailers:key=Tracy-Turn,valueonly,separator=%x2C)"
out = subprocess.run(["git", "-c", "core.quotePath=false", "--git-dir", repo, "--work-tree", webroot, "log",
                      f"-{floor + 1}", f"--format={fmt}", "--name-only"], capture_output=True, text=True, check=True).stdout
chunks = out.split(sep)[1:]
for chunk in chunks[:floor]:
    lines = chunk.split("\n")
    sha, at, turn = (lines[0].split("\t") + ["", "", ""])[:3]
    for t in turn.strip().split(","):
        if t in wanted:
            wanted[t].append({"sha": sha, "at": int(at), "files": [p for p in lines[1:] if p]})
print(json.dumps({"ok": True, "turns": wanted, "truncated": len(chunks) > floor}))
PYEOF
}

# ── reading ──────────────────────────────────────────────────────────────────────────────────
# Both readers share one Python body: git plumbing in, one JSON document out. The last line of
# stdout is the answer (the hook folds stderr into the job output; narration goes there).
read_op() {
  local op="$1"
  # A site still being built has no history to read yet, and must not be given one by a reader: the
  # baseline and v1 are provision's to make, at the moment the site is as handed over — v1 gets the
  # Initial backup's database at the END of provision (ADR 0024). QA r2 (02/10): a list polled 15 s
  # into an EmDash build tagged v1 itself and read "File backup (no database)" for the six minutes
  # until provision put the database on it. Nothing built here; an empty answer that says why.
  if ! repo_built && provision_running; then
    echo '{"ok":true,"building":true,"head":null,"latest":null,"since":null,"rows":[],"moments":[],"files":[],"hidden":[],"truncated":false,"sealed":null}'
    return
  fi
  ensure_repo_built
  ensure_initial_backup
  # Never mid-turn: what is dirty now may be the file the agent is writing ("open turns" above).
  # A seal this look does make is answered as `sealed`, so tracy-web keeps it as a `site_outside`
  # row like any other.
  SEALED_SHA=""
  if other_turn_open; then recover_pending; else seal_outside; fi
  local platform manifest="" sealed
  sealed="$(sealed_json)"
  platform="$(tracy_webroot_platform "$WEBROOT")"
  [[ -f "$STACK/core-manifest.json" ]] && manifest="$STACK/core-manifest.json"
  python3 - "$op" "$REPO" "$WEBROOT" "$BACKUP_TAG_PREFIX" "$BASELINE_TAG" "$platform" "$manifest" "$LIB_DIR/webroot-zones.cjs" "$sealed" "outside Tracy: $HOUSEKEEPING_TITLE" <<'PYEOF'
import json, re, subprocess, sys, tempfile
op, repo, webroot, prefix, baseline_tag, platform, manifest, zones_cli, sealed, housekeeping = sys.argv[1:11]
import os
sys.path.insert(0, os.path.dirname(zones_cli))   # lib/: backup_points.py lives beside the zones CLI
try:
    import backup_points
except ImportError:                               # a fleet copy without it: rows as before
    backup_points = None
backups_dir = os.path.join(os.path.dirname(repo), "backups")
sealed = json.loads(sealed)

def git(*args):
    return subprocess.run(["git", "-c", "core.quotePath=false", "--git-dir", repo, "--work-tree", webroot, *args],
                          capture_output=True, text=True, check=True).stdout

# The ceilings of one read. Reaching one is SAID (`truncated`), never silent: a count that stops at
# 200 while the site has more is a number that lies (plan todo-site-changes invariant 13).
CAP_COMMITS, CAP_FILES = 200, 500

def internal(paths):
    """The paths the exclude list names (Tracy's own files, operational junk) — judged against
    info/exclude ALONE: `check-ignore` runs on an empty work tree, so a customer's own .gitignore
    (JoomlArt ignores `images/`) hides nothing the tab should show."""
    paths = sorted({p for p in paths if p})
    if not paths: return set()
    with tempfile.TemporaryDirectory() as empty:
        r = subprocess.run(["git", "--git-dir", repo, "--work-tree", empty, "check-ignore", "--no-index", "-z", "--stdin"],
                           input="\0".join(paths) + "\0", capture_output=True, text=True)
    return {p for p in r.stdout.split("\0") if p}

AGENT = ("agent@tracy.ai", "fleet@tracy.ai")   # fleet@ is the pre-04/09 identity of every commit
OUTSIDE = "outside@tracy.ai"

def who(name, email):
    """A commit's author, as the face the tab draws."""
    if email in AGENT: return {"kind": "agent"}
    if email == OUTSIDE: return {"kind": "outside"}
    return {"kind": "person", "name": name, "email": email}

def title_of(subject):
    for p in ("agent: ", "outside Tracy: "):
        if subject.startswith(p): return subject[len(p):]
    return subject

def backups():
    """Every backup tag (`<prefix>/vN`): version → row. Tagger is the person who pressed the button."""
    rows = {}
    fmt = "%(refname:short)%09%(*objectname)%09%(objectname)%09%(creatordate:unix)%09%(taggername)%09%(taggeremail:trim)%09%(subject)"
    for line in git("for-each-ref", f"--format={fmt}", f"refs/tags/{prefix}/*").splitlines():
        if not line: continue
        name, peeled, own, at, tname, temail, subject = (line.split("\t") + [""] * 7)[:7]
        m = re.search(r"/v(\d+)$", name)
        if not m: continue
        # ADR 0024: the point's notes without its trailers, what its database can restore
        # (`database`, null without one) and `auto` on a Before-restore point — read by the same
        # code as `webroot-backup.sh --op list` (lib/backup_points.py).
        if backup_points:
            notes, extra, _ = backup_points.point_fields(
                int(m.group(1)), git("tag", "-l", "--format=%(contents)", name), backups_dir)
        else:
            notes, extra = git("tag", "-l", "--format=%(contents:body)", name).strip() or None, {}
        rows[int(m.group(1))] = {
            "version": int(m.group(1)), "sha": peeled or own,
            "at": int(at) if at.isdigit() else None, "title": subject,
            "notes": notes,
            "by": who(tname, temail) if temail else {"kind": "agent"},
            **extra,
        }
    return rows

def tree_files(sha):
    """How many files the tree of `sha` holds — the first backup's count, i.e. the whole baseline
    (~0.45 s of `ls-tree -r` on 42,650 files). A commit never changes, so the count is kept beside
    the repo once read (`tracy-tree-files/<sha>`); a missing or unreadable record is counted again."""
    record = os.path.join(repo, "tracy-tree-files", sha)
    try:
        with open(record) as f: return int(f.read())
    except (OSError, ValueError):
        pass
    count = len(git("ls-tree", "-r", "--name-only", sha).splitlines())
    try:
        os.makedirs(os.path.dirname(record), exist_ok=True)
        with open(record + ".tmp", "w") as f: f.write(str(count))
        os.replace(record + ".tmp", record)
    except OSError:
        pass
    return count

def files_between(a, b):
    out = git("diff", "--name-only", a, b).splitlines() if a else []
    return [p for p in out if p]

def numstat(rev):
    """Files changed since `rev`, worktree included — the same picture the tab draws, minus the
    files Tracy writes for itself."""
    status = {}
    for line in git("diff", "--name-status", rev).splitlines():
        code, path = line.split("\t", 1)
        path = path.split("\t")[-1]   # a rename line carries two paths; keep the destination
        status[path] = {"A": "added", "D": "deleted"}.get(code[0], "modified")
    rows = []
    for line in git("diff", "--numstat", rev).splitlines():
        added, deleted, path = line.split("\t", 2)
        path = path.split("\t")[-1]
        rows.append({"path": path, "status": status.get(path, "modified"),
                     # "-" is a binary: no lines to count, and inventing 0 would be a lie.
                     "additions": None if added == "-" else int(added),
                     "deletions": None if deleted == "-" else int(deleted)})
    hidden = internal(r["path"] for r in rows)
    return [r for r in rows if r["path"] not in hidden]

def zones(paths):
    if not paths: return {}
    args = ["node", zones_cli] + (["--manifest", manifest] if manifest else []) + [platform] + [f"webroot/{p}" for p in paths]
    try:
        out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, OSError):
        return {}
    result = {}
    for line in out.splitlines():
        if "\t" not in line: continue
        zone, path = line.split("\t", 1)
        result[path[len("webroot/"):]] = zone
    return result

def commits(rng, keep=frozenset(), housekeeping_rows=False):
    """Commits in `rng`, newest first: sha, time, author, title, the turn it belongs to, and the
    files each touched — ONE `git log`, not a `git show` per commit (up to 200 child processes per
    look, P0 activity-api.md §1). Returns (rows, truncated, skipped).

    The turn is the commit's `Tracy-Turn:` trailer, read with `%(trailers)` on the SAME format line:
    a body (`%B`) is free text and would break this line-per-field parser. A commit that holds ONLY
    files the exclude list names (an older moment that swallowed `tracy-changed.json`, a housekeeping
    commit) is not a row — unless a backup points at it (`keep`), since the backup row sits on it.

    `skipped` names those commits, `{sha, turn}`: an older chat moment that held nothing but a CMS cache
    (Q4, leemood on dev: three moments of T3 CSS) has a Postgres turn row the activity list must drop
    too, and only Git knows its files were all cache.

    `housekeeping_rows` (the history op): Tracy's housekeeping commit stays a row although every
    file in it is excluded — that is what it is about — with all its files. Site changes counts it
    (an Automatic event) and Postgres keeps it once a turn records it in `site_outside`; hiding it
    here made it appear only after the next turn, counts jumping by one (BUG-DEV-1, dev round
    02/10). Recognised as the D2 restore is: author outside@ AND the exact subject this script
    writes — never a title anyone could type."""
    sep = "\x1e"
    fmt = f"{sep}%H%x09%at%x09%an%x09%ae%x09%s%x09%(trailers:key=Tracy-Turn,valueonly,separator=%x2C)"
    raw = []
    # `log.showRoot=false`: the root commit is the baseline, whose file list is the whole webroot
    # (42,650 names on demo-tb-joomla, ~0.4 s to list and as long again to judge in `internal`). It
    # is v1, never a row of its own, so its files are never read; it keeps an empty list here.
    for chunk in git("-c", "log.showRoot=false", "log", f"--format={fmt}", "--name-only", f"-{CAP_COMMITS + 1}", rng).split(sep)[1:]:
        lines = chunk.split("\n")
        sha, at, name, email, subject, turn = (lines[0].split("\t") + [""] * 6)[:6]
        raw.append((sha, at, name, email, subject, turn.strip(), [p for p in lines[1:] if p]))
    truncated = len(raw) > CAP_COMMITS
    raw = raw[:CAP_COMMITS]
    hidden = internal(p for r in raw for p in r[6])
    rows, skipped = [], []
    for sha, at, name, email, subject, turn, files in raw:
        visible = [p for p in files if p not in hidden]
        if housekeeping_rows and email == OUTSIDE and subject == housekeeping:
            visible = files
        if files and not visible and sha not in keep:
            skipped.append({"sha": sha, "turn": turn or None})
            continue
        # `author`/`subject`: the RAW author email and subject, next to the cut `title` — so
        # tracy-web can tell a real restore commit (fleet@ + "restore: …", contract D2) from a chat
        # moment titled the same way. Compared against a shape, never shown as text.
        rows.append({"sha": sha, "at": int(at), "by": who(name, email),
                     "kind": "outside" if email == OUTSIDE else "moment",
                     "title": title_of(subject), "turn": turn or None, "files": visible,
                     "author": email, "subject": subject})
    return rows, truncated, skipped

head = git("rev-parse", "HEAD").strip()
rels = backups()
latest = max(rels) if rels else None

if op == "changes":
    since = rels[latest] if latest else {"version": None, "sha": git("rev-parse", baseline_tag).strip()}
    moments, truncated, _ = commits(f"{since['sha']}..HEAD")
    files = numstat(since["sha"])
    zone_of = zones([f["path"] for f in files])
    # Who touched a file last: the newest moment naming it; a path no moment names is still on
    # the worktree, i.e. made on the site since the last seal a moment ago.
    last_by = {}
    for m in reversed(moments):
        for p in m["files"]: last_by[p] = m["by"]
    for f in files:
        f["zone"] = zone_of.get(f["path"], "system")
        f["by"] = last_by.get(f["path"], {"kind": "outside"})
    for m in moments: m["files"] = len(m["files"])
    print(json.dumps({"ok": True, "head": head,
                      "since": {"version": since["version"], "sha": since["sha"]},
                      "moments": moments, "files": files[:CAP_FILES],
                      "truncated": {"moments": truncated, "files": len(files) > CAP_FILES},
                      "sealed": sealed}))
else:
    # history: every commit from HEAD back to v1, with a backup row placed above the commit its
    # tag points at. A backup's file count is what changed since the previous backup.
    by_sha = {}
    for r in rels.values(): by_sha.setdefault(r["sha"], []).append(r)
    ordered = sorted(rels.values(), key=lambda r: r["version"])
    prev_of = {r["version"]: (ordered[i - 1]["sha"] if i else None) for i, r in enumerate(ordered)}
    rows = []
    walked, truncated, skipped = commits("HEAD", keep=frozenset(by_sha), housekeeping_rows=True)
    for c in walked:
        for r in sorted(by_sha.get(c["sha"], []), key=lambda r: -r["version"]):
            rows.append({"kind": "backup", "version": r["version"], "sha": r["sha"], "title": r["title"],
                         "notes": r["notes"], "at": r["at"] or c["at"], "by": r["by"],
                         # ADR 0024 (absent on a host without lib/backup_points.py: tracy-web reads
                         # that as an older host).
                         **{k: r[k] for k in ("database", "auto") if k in r},
                         "files": len(files_between(prev_of[r["version"]], r["sha"])) if prev_of[r["version"]] else tree_files(r["sha"])})
        if rels and c["sha"] == rels[min(rels)]["sha"]:
            break                       # v1 is the floor; the baseline commit itself is not a moment
        c["files"] = len(c["files"])
        rows.append(c)
    print(json.dumps({"ok": True, "head": head,
                      "latest": {"version": latest, "sha": rels[latest]["sha"]} if latest else None,
                      "rows": rows, "truncated": truncated, "hidden": skipped, "sealed": sealed}))
PYEOF
}

changes() { read_op changes; }
history() { read_op history; }

# One moment, read closely: which files it touched and how many lines. Against its own parent,
# not the baseline — "what did this moment do", not "how does this file differ from the origin".
commit_files() {
  require_repo
  require_sha
  local platform manifest=""
  platform="$(tracy_webroot_platform "$WEBROOT")"
  [[ -f "$STACK/core-manifest.json" ]] && manifest="$STACK/core-manifest.json"
  python3 - "$REPO" "$WEBROOT" "$SHA" "$platform" "$manifest" "$LIB_DIR/webroot-zones.cjs" <<'PYEOF'
import json, subprocess, sys, tempfile
repo, webroot, sha, platform, manifest, zones_cli = sys.argv[1:7]
def git(*args):
    return subprocess.run(["git", "-c", "core.quotePath=false", "--git-dir", repo, "--work-tree", webroot, *args],
                          capture_output=True, text=True, check=True).stdout
def zones(paths):
    """The same classifier `changes` uses, so a file sits in one zone whichever list shows it."""
    if not paths: return {}
    args = ["node", zones_cli] + (["--manifest", manifest] if manifest else []) + [platform] + [f"webroot/{p}" for p in paths]
    try:
        out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, OSError):
        return {}
    return {path[len("webroot/"):]: zone for zone, _, path in (l.partition("\t") for l in out.splitlines()) if path}
def internal(paths):
    """The paths the exclude list names TODAY — the same test as `internal()` in read_op (info/exclude
    alone, on an empty work tree, so a customer's own .gitignore hides nothing)."""
    paths = sorted({p for p in paths if p})
    if not paths: return set()
    with tempfile.TemporaryDirectory() as empty:
        r = subprocess.run(["git", "--git-dir", repo, "--work-tree", empty, "check-ignore", "--no-index", "-z", "--stdin"],
                           input="\0".join(paths) + "\0", capture_output=True, text=True)
    return {p for p in r.stdout.split("\0") if p}
status = {}
for line in git("show", "--pretty=", "--name-status", sha).splitlines():
    if not line:
        continue
    code, path = line.split("\t", 1)
    path = path.split("\t")[-1]
    status[path] = {"A": "added", "D": "deleted"}.get(code[0], "modified")
files = []
for line in git("show", "--pretty=", "--numstat", sha).splitlines():
    if not line:
        continue
    added, deleted, path = line.split("\t", 2)
    path = path.split("\t")[-1]
    files.append({"path": path, "status": status.get(path, "modified"),
                  "additions": None if added == "-" else int(added),
                  "deletions": None if deleted == "-" else int(deleted)})
# 500 files is the ceiling: a moment touching more is a webroot rebuild, and nobody reads that
# list in a panel.
zone_of = zones([f["path"] for f in files[:500]])
# A moment made before a path joined the exclude list still holds it (Git is never rewritten,
# invariant 12): a CMS cache in an old chat moment (Q4, scjo1002 c0a061d4: two T4 optimizer files
# beside the real edit). Each such file says so, and the tab folds them into one quiet line instead
# of listing them as Tracy's work. `history` already leaves them out of the moment's count.
skip = internal(f["path"] for f in files[:500])
for f in files[:500]:
    f["zone"] = zone_of.get(f["path"], "system")
    if f["path"] in skip:
        f["excluded"] = True
# `total`: every file the commit touched — the same list `restore_undo` walks (excluded files
# included), so an undo dialog counts what the undo will really revert, past the 500 shown.
# `author`/`subject`: the RAW author email and subject (never `title_of`), so tracy-web can tell a
# real restore commit (fleet@ + "restore: …", contract D2) from a chat moment titled the same way.
# They are compared against a shape, never shown as text. `parent`: the first parent, or null.
meta = git("log", "-1", "--format=%ae%x00%s%x00%P", sha).rstrip("\n").split("\0")
author, subject, parents = (meta + ["", "", ""])[:3]
print(json.dumps({"ok": True, "sha": git("rev-parse", sha).strip(), "files": files[:500],
                  "truncated": len(files) > 500, "total": len(files),
                  "author": author, "subject": subject,
                  "parent": (parents.split() or [None])[0]}))
PYEOF
}

# ── reading one file's bytes ─────────────────────────────────────────────────────────────────
# `file-diff` and `file-show` hand out a file's BYTES, and every seat on a site may ask — so a
# configuration file (wp-config.php, configuration.php, .env, …: lib/webroot-sensitive.sh) is
# refused here, not only at tracy-web's door, and a caller reaching this job directly gets the same
# answer (plan todo-site-changes Q1, invariant 10). Each refusal is one JSON line on stdout and a
# non-zero exit, so nothing that reads stdout as a diff renders it as one:
#   exit 2  {"ok":false,"code":"INVALID_PATH"}          leaves the webroot, or names a folder
#   exit 3  {"ok":false,"code":"CONFIG_FILE_BLOCKED",…} a configuration file
#   exit 3  {"ok":false,"code":"SYMLINK_NOT_FOLLOWED"}  a symlink on the way (file-show worktree)
# git runs with literal pathspecs here: `--path 'wp-config.ph?'` or `:(glob)**/…` names no file.
refuse_read() {
  case "$1" in
    INVALID_PATH) echo '{"ok":false,"code":"INVALID_PATH"}'; exit 2 ;;
    CONFIG_FILE_BLOCKED)
      echo '{"ok":false,"code":"CONFIG_FILE_BLOCKED","blocked":true,"reason":"configuration-file"}'
      exit 3 ;;
    *) echo "{\"ok\":false,\"code\":\"$1\"}"; exit 3 ;;
  esac
}

guard_read_path() {
  [[ -n "$FILE_PATH" ]] || { echo "need --path" >&2; exit 2; }
  case "/$FILE_PATH/" in
    //* | */../* | */./* | *//*) refuse_read INVALID_PATH ;;
  esac
  if tracy_webroot_path_sensitive "$FILE_PATH"; then refuse_read CONFIG_FILE_BLOCKED; fi
}

file_diff() {
  require_repo
  guard_read_path
  # Without --sha: baseline → today's worktree. With --sha: what THAT moment did to the file,
  # SHA^ → SHA (plan §1: a moment's row opens its own diff, not today's). A root commit has no
  # parent; the empty tree stands in for it. Same refusals either way.
  local -a range=("$BASELINE_TAG")
  if [[ -n "$SHA" ]]; then
    require_sha
    if g rev-parse --verify --quiet "${SHA}^" >/dev/null; then
      range=("${SHA}^" "$SHA")
    else
      range=("$(g hash-object -t tree /dev/null)" "$SHA")
    fi
  fi
  # What the pathspec actually names: exactly this one file, or nothing (a file the baseline and
  # the worktree agree on). Anything wider — a folder — is not a file's diff.
  local name
  while IFS= read -r -d '' name; do
    [[ "$name" == "$FILE_PATH" ]] || refuse_read INVALID_PATH
    if tracy_webroot_path_sensitive "$name"; then refuse_read CONFIG_FILE_BLOCKED; fi
  done < <(GIT_LITERAL_PATHSPECS=1 g diff --name-only -z "${range[@]}" -- "$FILE_PATH")
  GIT_LITERAL_PATHSPECS=1 g diff "${range[@]}" -- "$FILE_PATH" | head -c 262144 || true
}

file_show() {
  require_repo
  guard_read_path
  case "$REF" in
    baseline)
      # A tree (a folder) is not a file to show.
      if [[ "$(g cat-file -t "$BASELINE_TAG:$FILE_PATH" 2>/dev/null)" == "tree" ]]; then
        refuse_read INVALID_PATH
      fi
      { g show "$BASELINE_TAG:$FILE_PATH" 2>/dev/null || true; } | head -c 1048576 || true ;;
    worktree)
      # Never through a symlink, at any step: `notes.txt -> wp-config.php` or a folder linked to
      # `/` would hand out what the name check above never saw.
      local at="$WEBROOT" part
      local -a parts
      IFS='/' read -r -a parts <<<"$FILE_PATH"
      for part in "${parts[@]}"; do
        at="$at/$part"
        [[ -L "$at" ]] && refuse_read SYMLINK_NOT_FOLLOWED
      done
      [[ -d "$at" ]] && refuse_read INVALID_PATH
      head -c 1048576 "$at" 2>/dev/null || true ;;
    *) echo "unknown ref: $REF" >&2; exit 2 ;;
  esac
  # One side missing (a file just added / just deleted) is an empty answer, not an error.
  true
}

# Two ways back, and the difference between them is RISK, not taste:
#   undo   reverts exactly the files that moment touched; a photo uploaded since is left alone.
#   reset  brings the whole tree to that moment; anything committed after it DISAPPEARS from
#          disk, `images/` included, while the database still points at it.
# Both append a new commit; neither rewrites history.
#
# reset SEALS pending edits first (`seal_outside`, the same step every read and every backup
# takes): an edit that is in no commit yet is otherwise overwritten by the checkout — gone from
# disk with no row anywhere to restore it from.
#
# undo is narrower and refuses rather than overwrites (plan todo-site-changes Q1, invariant 11):
#   - only a moment an agent turn made can be undone. An outside moment (admin, SSH, an update,
#     Tracy's own deploy) is something Tracy cannot judge — putting a core or plugin file back
#     while the database already moved on breaks the site — and neither a restore nor the
#     baseline is a turn. Answer: {"ok":false,"code":"NOT_UNDOABLE"}.
#   - EVERY file of the moment must still be exactly what the moment left (present or absent,
#     same blob, same mode) BEFORE anything is written. One file that moved on since — a later
#     turn, an admin edit, a pending edit not sealed yet — and the undo writes nothing, seals
#     nothing, commits nothing: {"ok":false,"code":"CONFLICT","files":[…]}.
# The git lock does not stop an SSH write landing between the check and the checkout; that window
# is a declared limit, not a compare-and-swap.
# Both refusals exit 0: they are answers the door turns into a 409, not a job that failed.
require_sha() {
  [[ -n "$SHA" ]] || { echo "need --sha" >&2; exit 2; }
  g cat-file -e "${SHA}^{commit}" 2>/dev/null || { echo "no such commit: $SHA" >&2; exit 1; }
}

# 0 when the moment is one an agent turn made: an agent author (fleet@ is the pre-04/09 identity
# of every commit, the reader's `who()` says the same), a parent to go back to, and not one of the
# machine's own housekeeping commits (a restore, the baseline).
undoable() {
  local email subject
  email="$(g log -1 --format=%ae "$SHA")"
  subject="$(g log -1 --format=%s "$SHA")"
  [[ "$email" == "$AGENT_EMAIL" || "$email" == "fleet@tracy.ai" ]] || return 1
  g rev-parse --verify --quiet "${SHA}^" >/dev/null || return 1
  case "$subject" in
    restore:* | "chore: webroot baseline" | housekeeping*) return 1 ;;
  esac
  return 0
}

# The files of the moment that no longer hold what the moment left, as one JSON list on stdout. Compared against the moment's own tree, NOT HEAD and not the index: the worktree
# is what the checkout would overwrite, sealed or not. Present vs absent, blob, and mode (exec bit
# and symlink), the three things a checkout would change.
moved_since() {
  python3 - "$REPO" "$WEBROOT" "$SHA" <<'PYEOF'
import hashlib, json, os, stat, subprocess, sys
repo, webroot, sha = sys.argv[1:4]
def git(*args):
    return subprocess.run(["git", "--literal-pathspecs", "--git-dir", repo, "--work-tree", webroot, *args],
                          capture_output=True, check=True).stdout
algo = git("rev-parse", "--show-object-format").decode().strip() or "sha1"
filemode = git("config", "--type=bool", "--default=true", "core.filemode").decode().strip() == "true"
paths = [p for p in git("diff-tree", "--no-commit-id", "-r", "-z", "--name-only", sha).decode("utf-8", "surrogateescape").split("\0") if p]
expected = {}
for entry in git("ls-tree", "-z", sha, "--", *paths).decode("utf-8", "surrogateescape").split("\0") if paths else []:
    if not entry: continue
    meta, path = entry.split("\t", 1)
    mode, _type, blob = meta.split(" ")
    expected[path] = (mode, blob)
def blob_id(data):
    h = hashlib.new(algo)
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()
moved = []
for path in paths:
    full = os.path.join(webroot, path)
    try:
        st = os.lstat(full)
    except FileNotFoundError:
        st = None
    want = expected.get(path)
    if want is None:
        if st is not None: moved.append(path)        # the moment deleted it; something brought it back
        continue
    mode, blob = want
    if mode == "160000": continue                    # a gitlink holds no bytes of ours to compare
    if st is None:
        moved.append(path); continue
    if stat.S_ISLNK(st.st_mode):
        have_mode, data = "120000", os.readlink(full).encode("utf-8", "surrogateescape")
    elif stat.S_ISREG(st.st_mode):
        have_mode = "100755" if (st.st_mode & stat.S_IXUSR) else "100644"
        with open(full, "rb") as fh: data = fh.read()
    else:
        moved.append(path); continue                 # a directory where the moment left a file
    if not filemode and have_mode != "120000" and mode != "120000": have_mode = mode
    if have_mode != mode or blob_id(data) != blob:
        moved.append(path)
print(json.dumps(sorted(moved)))
PYEOF
}

restore_undo() {
  require_repo
  require_sha
  if ! undoable; then
    echo '{"ok":false,"code":"NOT_UNDOABLE"}'
    return
  fi
  local moved
  moved="$(moved_since)"
  if [[ "$moved" != "[]" ]]; then
    echo "{\"ok\":false,\"code\":\"CONFLICT\",\"files\":${moved}}"
    return
  fi
  seal_outside
  local short subject count
  short="$(g rev-parse --short "$SHA")"
  subject="$(g log -1 --format=%s "$SHA")"
  count=0
  # `-z`: a customer's file name may carry spaces, and an undo that misreads a name undoes
  # another file.
  while IFS= read -r -d '' rel; do
    [[ -n "$rel" ]] || continue
    if g cat-file -e "${SHA}^:${rel}" 2>/dev/null; then
      g checkout "${SHA}^" -- "$rel"
    else
      # That moment CREATED this file, so undoing it is removing it.
      rm -f "$WEBROOT/$rel"
      g rm --quiet --cached --ignore-unmatch -- "$rel" >/dev/null 2>&1 || true
    fi
    count=$((count + 1))
  done < <(g show --pretty= --name-only -z "$SHA")
  [[ "$count" -gt 0 ]] || { echo "{\"ok\":true,\"files\":0,\"head\":\"$(g rev-parse HEAD)\"}"; return; }
  # No `add` here: `checkout <sha>^ -- path` and `rm --cached` already set the index for each
  # file, and a wider `add` would drag in pending edits the undo never asked about.
  g commit --quiet -m "restore: undo ${short} (${subject})" || true
  echo "{\"ok\":true,\"files\":${count},\"head\":\"$(g rev-parse HEAD)\"}"
}

# The preflight of undoing SEVERAL moments in a row, newest first (`--shas A,B,C`: A is undone
# first) — what tracy-web's "undo a chat turn" door asks before it writes anything (plan
# tasks/undo-change, contract FILES_CHANGED_AFTER). Read-only: no lock, no seal, no commit.
#
# `restore_undo` checks ONE moment against the worktree (`moved_since`). Checking each moment of a
# run against the worktree alone would be wrong both ways: a later moment of the run that touched the
# same file makes the earlier one look moved, though undoing the later one first puts that file
# back. So this walks the run in order on a VIRTUAL tree: the worktree, with every file an earlier
# undo of the run would write set to what that undo writes (the moment's parent's entry, or absent).
# Each moment is then held to the same rule `restore_undo` holds it to — undoable (`undoable`), and
# every file still exactly what the moment left (present or absent, blob, mode).
#
# The walk stops at the first moment that would be refused: `conflict` names it, with its moved
# files or `NOT_UNDOABLE`; moments after it are `checked: false`. `zones` and `total` are given for
# every moment, checked or not, with the classifier `commit` uses.
undo_check() {
  require_repo
  [[ -n "$SHAS" ]] || { echo "need --shas" >&2; exit 2; }
  local one platform manifest=""
  IFS=',' read -r -a wanted <<<"$SHAS"
  [[ ${#wanted[@]} -le 200 ]] || { echo "refused --shas: at most 200" >&2; exit 2; }
  for one in "${wanted[@]}"; do
    [[ "$one" =~ ^[0-9a-f]{7,64}$ ]] || { echo "refused --shas" >&2; exit 2; }
    g cat-file -e "${one}^{commit}" 2>/dev/null || { echo "no such commit: $one" >&2; exit 1; }
  done
  platform="$(tracy_webroot_platform "$WEBROOT")"
  [[ -f "$STACK/core-manifest.json" ]] && manifest="$STACK/core-manifest.json"
  python3 - "$REPO" "$WEBROOT" "$SHAS" "$platform" "$manifest" "$LIB_DIR/webroot-zones.cjs" "$AGENT_EMAIL" <<'PYEOF'
import hashlib, json, os, stat, subprocess, sys
repo, webroot, shas, platform, manifest, zones_cli, agent_email = sys.argv[1:8]
def git(*args):
    return subprocess.run(["git", "--literal-pathspecs", "--git-dir", repo, "--work-tree", webroot, *args],
                          capture_output=True, check=True).stdout
def text(*args):
    return git(*args).decode("utf-8", "surrogateescape")
algo = text("rev-parse", "--show-object-format").strip() or "sha1"
filemode = text("config", "--type=bool", "--default=true", "core.filemode").strip() == "true"
def entries(rev, paths):
    """`{path: (mode, blob)}` of `rev` for `paths`; a path absent there is not a key."""
    out = {}
    if not paths: return out
    for entry in text("ls-tree", "-z", rev, "--", *paths).split("\0"):
        if not entry: continue
        meta, path = entry.split("\t", 1)
        mode, _type, blob = meta.split(" ")
        out[path] = (mode, blob)
    return out
def blob_id(data):
    h = hashlib.new(algo)
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()
def on_disk(path):
    """What the worktree holds at `path`: (mode, blob), None when absent, "other" for a directory."""
    full = os.path.join(webroot, path)
    try:
        st = os.lstat(full)
    except FileNotFoundError:
        return None
    if stat.S_ISLNK(st.st_mode):
        return ("120000", blob_id(os.readlink(full).encode("utf-8", "surrogateescape")))
    if stat.S_ISREG(st.st_mode):
        with open(full, "rb") as fh: data = fh.read()
        return ("100755" if (st.st_mode & stat.S_IXUSR) else "100644", blob_id(data))
    return "other"
def same(want, have):
    """`moved_since`'s comparison: absent vs present, mode (exec bit, symlink), blob."""
    if want is None: return have is None
    if have is None or have == "other": return False
    mode, blob = want
    have_mode, have_blob = have
    if not filemode and have_mode != "120000" and mode != "120000": have_mode = mode
    return have_mode == mode and have_blob == blob
def undoable(sha):
    """`undoable` of webroot-git.sh: an agent author, a parent, not a restore/baseline/housekeeping."""
    email, subject = (text("log", "-1", "--format=%ae%x00%s", sha).rstrip("\n").split("\0") + ["", ""])[:2]
    if email not in (agent_email, "fleet@tracy.ai"): return False
    if subprocess.run(["git", "--git-dir", repo, "rev-parse", "--verify", "--quiet", f"{sha}^"],
                      capture_output=True).returncode != 0: return False
    return not (subject.startswith("restore:") or subject == "chore: webroot baseline" or subject.startswith("housekeeping"))
def zones(paths):
    if not paths: return {}
    args = ["node", zones_cli] + (["--manifest", manifest] if manifest else []) + [platform] + [f"webroot/{p}" for p in paths]
    try:
        out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, OSError):
        return {}
    return {path[len("webroot/"):]: zone for zone, _, path in (l.partition("\t") for l in out.splitlines()) if path}
virtual = {}
commits, conflict = [], None
for sha in shas.split(","):
    full = text("rev-parse", sha).strip()
    paths = [p for p in text("diff-tree", "--no-commit-id", "-r", "-z", "--name-only", full).split("\0") if p]
    commits.append({"sha": full, "paths": paths})
for c in commits:
    c["total"] = len(c["paths"])
    if conflict is not None:
        c["checked"] = False
        continue
    c["checked"] = True
    if not undoable(c["sha"]):
        conflict = {"sha": c["sha"], "code": "NOT_UNDOABLE", "files": []}
        c["undoable"] = False
        continue
    c["undoable"] = True
    left = entries(c["sha"], c["paths"])
    moved = []
    for path in c["paths"]:
        want = left.get(path)
        if want is not None and want[0] == "160000": continue   # a gitlink holds no bytes of ours
        have = virtual[path] if path in virtual else on_disk(path)
        if not same(want, have): moved.append(path)
    if moved:
        conflict = {"sha": c["sha"], "code": "CONFLICT", "files": sorted(moved)}
        continue
    before = entries(f"{c['sha']}^", c["paths"])
    for path in c["paths"]:
        virtual[path] = before.get(path)
zone_of = zones(sorted({p for c in commits for p in c["paths"][:500]}))
for c in commits:
    counted = {}
    for path in c["paths"][:500]:
        zone = zone_of.get(path, "system")
        counted[zone] = counted.get(zone, 0) + 1
    c["zones"] = counted
    del c["paths"]
print(json.dumps({"ok": True, "commits": commits, "conflict": conflict}))
PYEOF
}

restore_reset() {
  require_repo
  require_sha
  seal_outside
  local short count written="$REPO/restore-written"
  short="$(g rev-parse --short "$SHA")"
  # What the reset writes, and the folders it makes for it: given to the webroot's owner after, as
  # webroot-push.sh gives its batch — this runs as root on a host (#1562).
  g diff --no-renames --name-only -z "$SHA" > "$written"
  count="$(tr -cd '\0' < "$written" | wc -c | tr -d ' ')"
  # The webroot already holds that moment (a sync whose result kept every file of the copy): the
  # reset and the add would each walk 40,000 files to change none (3.7 s on the stand, 22/10/2026).
  if [[ "$count" != 0 ]]; then
    tracy_webroot_new_dirs "$WEBROOT" < "$written" > "$written.dirs"
    "${GENTLE[@]}" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" read-tree -u --reset "$SHA"
    cat "$written" "$written.dirs" | tracy_webroot_own "$WEBROOT"
    g add -A -f
    # `-f` takes in what info/exclude names too (Tracy's own files, junk): out again, as every add does.
    tracy_unstage_webroot_junk "$REPO" "$WEBROOT"
  fi
  rm -f "$written" "$written.dirs"
  g commit --quiet -m "restore: back to ${short}" || true
  echo "{\"ok\":true,\"files\":${count},\"head\":\"$(g rev-parse HEAD)\"}"
}

case "$OP" in
  # The same words provision.sh's stage printed before the wait, so the step reads the build again.
  ensure) HEAVY_RESUME_STAGE="building the webroot baseline (ADR 0073)" run_heavy ensure ;;
  changes) locked changes ;;
  history) locked history ;;
  moment) locked moment ;;
  seal-outside) locked seal_outside_op ;;
  turn-moments) turn_moments ;;
  deploy-prepare) locked deploy_prepare ;;
  deploy-commit) locked deploy_commit ;;
  commit) commit_files ;;
  file-diff) file_diff ;;
  file-show) file_show ;;
  restore-undo) locked restore_undo ;;
  restore-reset) locked run_heavy restore_reset ;;
  undo-check) undo_check ;;
  *) echo "unknown op: $OP" >&2; exit 2 ;;
esac
