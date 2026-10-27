#!/usr/bin/env bash
# webroot-backup.sh — a site's backups (ADR 0024): a named, numbered restore point of its files AND
# its database, and the way back to one.
#
# A backup changes nothing on the live site. It is an annotated tag on the site's webroot history
# (`webroot-baseline.git` on this host: every write the agent made, every edit sealed as "outside
# Tracy"), plus a dump of the site's database beside it (`lib/site-backup.sh`). Nothing leaves the
# host: the site's GitHub repo is the hourly sync's (`tools/push-site-folder.sh`), not this script's.
#
# Ops:
#   --op create --title "..." [--notes-file F] [--by-name N --by-email E] [--auto pre-restore]
#       Optional --include-large snapshots regular webroot files over 50 MiB under the same locks.
#       Dump → seal → tag. The tag is annotated: its message is the title, its body the notes, its
#       TAGGER the person who pressed Create a backup (04/09: the one row a person writes, and it
#       carries their face). The dump goes first and its `Tracy-Database:` trailers ride on the tag;
#       a dump that fails does not stop the backup — it stands as a file backup and the answer says
#       why (`database: null`, `databaseError`).
#   --op create-from --commit C --schema S --title "..." [--by-name N --by-email E]
#       A point that holds something the site does not hold yet: commit C (already in the history,
#       not on HEAD) and a dump of schema S, a scratch schema beside the site's own. Nothing is
#       sealed. "Sync from live" (webroot-sync.sh) makes its result one of these, and Restore
#       everything to it puts the result in place — with the Before-restore point as the way back.
#       Tagged `Tracy-Backup: sync`, kept under the automatic points' retention.
#   --op list
#       JSON: the backups this host holds, newest first, each with `database` (ADR 0024 sub-decision
#       1: what THIS point can restore, proven from its tag and its dump file).
#   --op initial-backup
#       Provision only: dump the database of a site that was just built and put the trailer on its
#       v1 tag, so the first point is a full "Initial backup". A site that already has a second
#       point, or whose v1 already carries a database, is left alone.
#   --op restore-everything --version N [--sha S] [--by-name N --by-email E]
#       Files AND database back to backup vN (ADR 0024 sub-decision 2). Takes a "Before restore"
#       backup first, refuses a point whose database is not `full`, and rolls back to the state it
#       found when a step fails. Every step is reported.
#   --op export --version N [--max-bytes B]      (upload address: env TRACY_EXPORT_UPLOAD_URL)
#                                                (install code, WordPress/Joomla: env TRACY_EXPORT_INSTALL_CODE;
#                                                 only its hash goes in the package, never a log)
#       Backup vN as the zip its owner downloads (plan todo-backup-export): packed under the
#       site's lock and the heavy lock from the point's own tag and verified dump, then — locks
#       released — PUT to the presigned address tracy-web signed. The address arrives in the
#       environment and reaches curl on stdin, never on a command line `ps` can read, and is
#       never printed. Refusals (no such point, no verified dump, a config this cannot rewrite,
#       too large, upload refused) are answers, exit 0.
#
# The number is THIS HOST's to choose (highest + 1), never the caller's: the tags live here, so this
# is the only place that knows for sure which number is free.
#
# `pipefail`: a failed step in a pipe must fail the run, not return the status of the last command
# in it.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="${TRACY_LIB_DIR:-$HERE/../lib}"
# shellcheck source=../lib/roots.sh
. "$LIB_DIR/roots.sh"
# shellcheck source=../lib/webroot-repo-git.sh
. "$LIB_DIR/webroot-repo-git.sh"
# shellcheck source=../lib/webroot-platform.sh
. "$LIB_DIR/webroot-platform.sh"
# shellcheck source=../lib/webroot-excludes.sh
. "$LIB_DIR/webroot-excludes.sh"
# shellcheck source=../lib/site-backup.sh
. "$LIB_DIR/site-backup.sh"

LABEL="" OP="" TITLE="" NOTES_FILE="" BY_NAME="" BY_EMAIL="" AUTO="" VERSION="" SHA="" MAX_BYTES="" INCLUDE_LARGE=0
COMMIT="" SCHEMA="" ONLY_TABLES="" SEALED=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --op) OP="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --notes-file) NOTES_FILE="$2"; shift 2 ;;
    --by-name) BY_NAME="$2"; shift 2 ;;
    --by-email) BY_EMAIL="$2"; shift 2 ;;
    # `pre-restore`: the automatic Before-restore point, kept under its own retention.
    --auto) AUTO="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    # restore-everything: the commit the caller saw the point on; a different one is refused.
    --sha) SHA="$2"; shift 2 ;;
    # export: the package's ceiling in bytes (default 1 GiB, plan decision 6).
    --max-bytes) MAX_BYTES="$2"; shift 2 ;;
    # Capture the large-file sidecar with the backup; export later reads this exact snapshot.
    --include-large) INCLUDE_LARGE=1; shift ;;
    # create-from: the commit to tag and the schema to dump.
    --commit) COMMIT="$2"; shift 2 ;;
    --schema) SCHEMA="$2"; shift 2 ;;
    # restore-everything, for a Sync from live only: a file naming, one per line, the tables that
    # differ between the point and the site. Only those are loaded and swapped (and their triggers);
    # every other table is the point's already and stays where it is.
    --only-tables) ONLY_TABLES="$2"; shift 2 ;;
    # create --auto pre-restore, under a sync's restore: the caller sealed the webroot moments ago,
    # under the locks it still holds — the 40,000-file walk is not made a second time.
    --sealed) SEALED=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$LABEL" && -n "$OP" ]] || { echo "need --label and --op" >&2; exit 2; }
tracy_require_label "$LABEL"

# STACK stays the private root. `TRACY_SRV` — honoured by lib/roots.sh — is the old name of it:
# the test suite builds a throwaway stack under a temp dir.
STACK="$(tracy_private_dir "$LABEL")"
WEBROOT="$(tracy_webroot_dir "$LABEL")"
REPO_DIR="$(tracy_repo_dir "$LABEL")"
[[ -d "$WEBROOT" ]] || { echo "no webroot at $WEBROOT" >&2; exit 1; }
[[ -z "$AUTO" || "$AUTO" == pre-restore ]] || { echo "refused --auto" >&2; exit 2; }
[[ -z "$VERSION" || "$VERSION" =~ ^[1-9][0-9]{0,5}$ ]] || { echo "refused --version" >&2; exit 2; }
[[ -z "$SHA" || "$SHA" =~ ^[0-9a-f]{7,64}$ ]] || { echo "refused --sha" >&2; exit 2; }
[[ -z "$MAX_BYTES" || "$MAX_BYTES" =~ ^[1-9][0-9]{0,12}$ ]] || { echo "refused --max-bytes" >&2; exit 2; }
[[ -z "$COMMIT" || "$COMMIT" =~ ^[0-9a-f]{40,64}$ ]] || { echo "refused --commit" >&2; exit 2; }
[[ -z "$SCHEMA" || "$SCHEMA" =~ ^[A-Za-z0-9_]{1,64}$ ]] || { echo "refused --schema" >&2; exit 2; }
[[ "$SEALED" == 0 || ( "$OP" == create && "$AUTO" == pre-restore ) ]] || { echo "refused --sealed" >&2; exit 2; }
if [[ -n "$ONLY_TABLES" ]]; then
  [[ "$OP" == restore-everything && -f "$ONLY_TABLES" ]] || { echo "refused --only-tables" >&2; exit 2; }
  # Names as information_schema gives them: they go into SQL and dump arguments.
  ! grep -qvE '^[A-Za-z0-9_$]{1,64}$' <(grep . "$ONLY_TABLES") || { echo "refused --only-tables" >&2; exit 2; }
fi

g() { git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO_DIR" --work-tree="$WEBROOT" "$@"; }

# 🔒 THE PREFIX KEEPS ITS OLD NAME. Backups were first numbered as "releases", and every site's
# points are tags under `tracy-release/`: the number of the next point is counted under this prefix
# (`next_version`), each database dump is named after that number (`backups/v<N>.*`), and
# webroot-git.sh tags v1 on the baseline when the prefix holds nothing. A new prefix without a
# migration of every site's tags would number again from v1 and OVERWRITE `backups/v2.*`… of the
# existing points, losing their databases (ADR 0024, amendment 2). So the code says backup, and the
# data keeps the name it was written under — the same value as webroot-git.sh's.
BACKUP_TAG_PREFIX="tracy-release"

require_repo() {
  if [[ -d "$REPO_DIR" ]] && g rev-parse --verify HEAD >/dev/null 2>&1; then return 0; fi
  # BUG-DEV-2 (02/10, dev): with TRACY_PRIVATE_ROOT unset the scripts fell back to /srv/tracy,
  # which existed but held no site — and a deploy copied without recording anything, silently.
  # Name the root it looked in, so a wrong root reads as one.
  if [[ -d "$TRACY_PRIVATE_ROOT" && ! -d "$STACK" ]]; then
    echo "!! $TRACY_PRIVATE_ROOT exists but holds no '$LABEL' — is TRACY_PRIVATE_ROOT right on this host?" >&2
  elif [[ -d "$STACK" && ! -d "$REPO_DIR" ]]; then
    echo "!! $STACK has no webroot-baseline.git — this site's history was never built here" >&2
  fi
  echo "webroot repo not built yet: run webroot-ensure first" >&2
  exit 1
}

# Heavy work yields the disk to the customers' sites, never the CPU: it holds the machine-wide heavy
# lock, and a holder at nice 19 starves every job waiting on that lock (webroot-git.sh, "NEVER
# `nice` WORK THAT HOLDS THE HEAVY LOCK").
GENTLE=(env)   # a no-op prefix: an empty array trips `set -u` in the macOS test host's bash 3.2
command -v ionice >/dev/null 2>&1 && GENTLE+=(ionice -c3)
HEAVY_LOCK="${TRACY_HEAVY_LOCK:-/var/lock/tracy-webroot-heavy.lock}"

# ── the number ───────────────────────────────────────────────────────────────────────────────
# v1, v2, v3… one up each time, not semver: three numbers promise compatibility to something with
# an API, and a website has no API to promise anything about.
next_version() {
  local highest=0 n
  while IFS= read -r tag; do
    [[ -n "$tag" ]] || continue
    n="${tag#refs/tags/$BACKUP_TAG_PREFIX/v}"
    [[ "$n" =~ ^[0-9]+$ ]] || continue
    if (( n > highest )); then highest="$n"; fi
  done < <(g for-each-ref --format='%(refname)' "refs/tags/$BACKUP_TAG_PREFIX/*" 2>/dev/null || true)
  echo $(( highest + 1 ))
}

list_backups() {
  require_repo
  python3 "$LIB_DIR/backup_points.py" list "$REPO_DIR" "$BACKUP_TAG_PREFIX" "$(tracy_backup_dir)"
}

# ── the seal ─────────────────────────────────────────────────────────────────────────────────
# Edits made in the site's admin, an extension updating itself, a patch run at night: they sit on
# the worktree and nobody has written them into the history yet. A tag on a state WITHOUT them
# would make a restore to this backup silently erase the customer's work.
#
# This is the one step that cannot be done again after the tag, so it runs first, always.
seal_worktree() {
  # Rewrite the exclude list BEFORE adding, not only when the baseline was built.
  #
  # 🔒 26/08, tracy.ai: its `info/exclude` was still the first six-line version, missing everything
  # decided since — `ensure` writes that file at build time, and a site with a baseline never calls
  # `ensure` again. Meanwhile `wp-content/themes/tracy/node_modules` (33 MB, 511 files) sat
  # untracked, waiting for this very seal to swallow it. Written here, an old site heals itself on
  # its first backup, without rebuilding the baseline (a walk of the whole webroot).
  tracy_write_webroot_exclude "$REPO_DIR" "$WEBROOT"
  "${GENTLE[@]}" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO_DIR" --work-tree="$WEBROOT" add -A -f
  # `-f` above skips the customer's .gitignore — and our own rules with it. This takes them back.
  tracy_unstage_webroot_junk "$REPO_DIR" "$WEBROOT"
  if g diff --cached --quiet; then
    echo "==> nothing to seal — the worktree is already in the history" >&2
    return 0
  fi
  local files
  files="$(g diff --cached --name-only | wc -l | tr -d ' ')"
  # "outside Tracy" stands in the subject itself: Site changes lists these on their own, never as
  # the agent's work, and never guesses who made them.
  g commit --quiet --author="On the site <outside@tracy.ai>" \
    -m "outside Tracy: changes made to the site outside Tracy"
  echo "==> sealed $files file(s) at $(g rev-parse --short HEAD)" >&2
}

create_backup() {
  require_repo
  [[ -n "$TITLE" ]] || { echo "need --title" >&2; exit 2; }

  local version tag
  version="$(next_version)"
  tag="$BACKUP_TAG_PREFIX/v$version"

  # The database first, then the seal and the tag (ADR 0024): the dump is consistent inside the
  # database; between it and the files there is under a second, and nothing pretends otherwise.
  local db_json="null" db_error=""
  if tracy_backup_dump "$version"; then
    db_json="$BK_JSON"
  else
    db_error="$BK_ERROR"
    echo "!! database not backed up ($db_error) — this point is a file backup only" >&2
  fi
  [[ "$SEALED" == 1 ]] || seal_worktree
  # Annotated, not lightweight: the title a person gives must live ON the tag. 🔒 Measured 26/08 on
  # tracy.ai — with a plain `git tag`, `for-each-ref %(subject)` falls back to the COMMIT's subject,
  # and the list read "v1 — outside Tracy: changes made to the site outside Tracy".
  local message
  message="$(mktemp "/tmp/backup-msg-$LABEL.XXXXXX")"
  {
    printf '%s\n' "$TITLE"
    # A note line shaped like our trailers is dropped: only this host writes those.
    if [[ -n "$NOTES_FILE" && -f "$NOTES_FILE" ]]; then printf '\n'; grep -Ev '^Tracy-(Database|Uploads|Backup):' "$NOTES_FILE" || true; fi
    if [[ -n "$BK_TRAILERS" || -n "$AUTO" ]]; then
      printf '\n'
      [[ -z "$BK_TRAILERS" ]] || printf '%s\n' "$BK_TRAILERS"
      [[ -z "$AUTO" ]] || printf 'Tracy-Backup: %s\n' "$AUTO"
    fi
  } > "$message"
  # The tagger is the person; the machine only holds the pen. Default stays the repo identity.
  if [[ -n "$BY_EMAIL" ]]; then
    GIT_COMMITTER_NAME="${BY_NAME:-$BY_EMAIL}" GIT_COMMITTER_EMAIL="$BY_EMAIL" g tag -a "$tag" -F "$message"
  else
    g tag -a "$tag" -F "$message"
  fi
  rm -f "$message"
  local fleet_sha
  fleet_sha="$(g rev-parse HEAD)"
  echo "==> $tag → $fleet_sha" >&2
  if [[ "$(tracy_backup_platform)" == emdash ]]; then
    snapshot_emdash_app_for_backup "$version"
  elif [[ "$INCLUDE_LARGE" == 1 ]]; then
    snapshot_large_files "$version"
  fi
  tracy_backup_prune "$REPO_DIR" "$BACKUP_TAG_PREFIX"

  python3 -c 'import json, sys
version, tag, fleet_sha, title, db, db_error, auto = sys.argv[1:8]
print(json.dumps({"ok": True, "version": int(version), "title": title, "fleetTag": tag, "fleetSha": fleet_sha,
                  "database": json.loads(db), "databaseError": db_error or None, **({"auto": auto} if auto else {})}))' \
    "$version" "$tag" "$fleet_sha" "$TITLE" "$db_json" "$db_error" "$AUTO"
}

create_from() {
  require_repo
  [[ -n "$TITLE" && -n "$COMMIT" && -n "$SCHEMA" ]] || { echo "need --title, --commit and --schema" >&2; exit 2; }
  [[ "$(tracy_backup_kind)" == mysql ]] || { echo '{"ok":false,"code":"BACKUP_KIND_MISMATCH"}'; return; }
  [[ "$(g cat-file -t "$COMMIT" 2>/dev/null)" == commit ]] || { echo '{"ok":false,"code":"NO_SUCH_COMMIT"}'; return; }
  local version tag message
  version="$(next_version)"
  tag="$BACKUP_TAG_PREFIX/v$version"
  if ! TRACY_BACKUP_SCHEMA="$SCHEMA" tracy_backup_dump "$version"; then
    python3 -c 'import json,sys; print(json.dumps({"ok": False, "code": "DUMP_FAILED", "error": sys.argv[1]}))' "$BK_ERROR"
    return
  fi
  message="$(mktemp "/tmp/backup-msg-$LABEL.XXXXXX")"
  printf '%s\n\n%s\nTracy-Backup: sync\n' "$TITLE" "$BK_TRAILERS" > "$message"
  if [[ -n "$BY_EMAIL" ]]; then
    GIT_COMMITTER_NAME="${BY_NAME:-$BY_EMAIL}" GIT_COMMITTER_EMAIL="$BY_EMAIL" g tag -a "$tag" -F "$message" "$COMMIT"
  else
    g tag -a "$tag" -F "$message" "$COMMIT"
  fi
  rm -f "$message"
  echo "==> $tag → $COMMIT (from schema $SCHEMA)" >&2
  tracy_backup_prune "$REPO_DIR" "$BACKUP_TAG_PREFIX"
  python3 -c 'import json, sys
version, tag, sha, title, db = sys.argv[1:6]
print(json.dumps({"ok": True, "version": int(version), "title": title, "fleetTag": tag, "fleetSha": sha,
                  "database": json.loads(db), "auto": "sync"}))' "$version" "$tag" "$COMMIT" "$TITLE" "$BK_JSON"
}

snapshot_emdash_app() { # version — keep app code paired with the SQLite and uploads snapshot
  (
    local version="$1" container stage archive
    container="$(cd "$STACK" && docker compose ps -q web)"
    [[ -n "$container" ]] || { echo "EmDash app container is not running" >&2; return 1; }
    stage="$(umask 077; mktemp -d "$STACK/.app-export.XXXXXX")"
    archive="$(umask 077; mktemp "$(tracy_backup_dir)/.v${version}.app.XXXXXX")"
    trap 'rm -rf "$stage"; rm -f "$archive"' EXIT
    docker cp "$container:/app/." "$stage" >/dev/null
    rm -rf "$stage/data" "$stage/uploads" "$stage/node_modules" "$stage/.tracy-backup" "$stage/.git" "$stage/.env"
    tar -C "$stage" -cf "$archive" .
    chmod 600 "$archive"
    mv -f "$archive" "$(tracy_backup_dir)/v${version}.app.tar"
  )
}

snapshot_emdash_app_for_backup() { # version — required for exports, best-effort for other backups
  local version="$1" app_container
  if [[ "$INCLUDE_LARGE" == 1 ]]; then
    snapshot_emdash_app "$version"
    return
  fi
  app_container="$(cd "$STACK" && docker compose ps -q web 2>/dev/null || true)"
  [[ -n "$app_container" ]] || return 0
  if ! snapshot_emdash_app "$version" 2>/dev/null; then
    rm -f "$(tracy_backup_dir)/v${version}.app.tar"
  fi
}

snapshot_large_files() { # version — capture excluded files while the backup holds both locks
  python3 - "$WEBROOT" "$(tracy_backup_dir)/v$1.large.tar.gz" "$((50 * 1024 * 1024))" <<'PYEOF'
import os, sys, tarfile, tempfile
root, destination, threshold = sys.argv[1], sys.argv[2], int(sys.argv[3])
fd, temporary = tempfile.mkstemp(prefix='.large-', dir=os.path.dirname(destination))
os.close(fd)
try:
    with tarfile.open(temporary, 'w:gz') as archive:
        for base, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = [name for name in dirs if not os.path.islink(os.path.join(base, name))]
            for name in files:
                path = os.path.join(base, name)
                try:
                    info = os.lstat(path)
                except OSError:
                    continue
                if not os.path.isfile(path) or os.path.islink(path) or info.st_size <= threshold:
                    continue
                archive.add(path, arcname=os.path.relpath(path, root).replace(os.sep, '/'), recursive=False)
    os.chmod(temporary, 0o600)
    os.replace(temporary, destination)
except Exception:
    try: os.unlink(temporary)
    except OSError: pass
    raise
PYEOF
}

run_heavy() {
  # `flock` is util-linux; the test host (macOS) has none, and there nothing else contends.
  # TRACY_HEAVY_LOCK_HELD: a parent of this run (restore-everything) already holds it — taking it
  # again from a second open of the file would wait on ourselves.
  if [[ -n "${TRACY_HEAVY_LOCK_HELD:-}" ]] || ! command -v flock >/dev/null 2>&1; then "$@"; return; fi
  exec 9>"$HEAVY_LOCK"
  # A queue must look like a queue (webroot-git.sh's run_heavy says why): provision's Initial backup
  # follows a silent `mark`, so without this line a job queued here kept showing the step before it.
  if ! flock -n 9; then
    echo "==> waiting for another site's webroot baseline (one at a time per machine)" >&2
    if ! flock -w 1800 9; then
      echo "another heavy webroot job is running; try again shortly" >&2
      exit 1
    fi
    [[ -n "${HEAVY_RESUME_STAGE:-}" ]] && echo "==> ${HEAVY_RESUME_STAGE}" >&2
  fi
  export TRACY_HEAVY_LOCK_HELD=1
  "$@"
}

# The site's webroot lock — the file webroot-git.sh and the deploy resync lock — so no moment
# commits halfway through a backup's seal or a restore. fd 7: 9 is the heavy one.
webroot_locked() {
  if [[ -n "${TRACY_WEBROOT_LOCK_HELD:-}" ]] || ! command -v flock >/dev/null 2>&1 || [[ ! -d "$REPO_DIR" ]]; then
    "$@"
    return
  fi
  exec 7>"$REPO_DIR/tracy-webroot.lock"
  if ! flock -w 120 7; then
    echo "another webroot job holds this site; try again shortly" >&2
    exit 1
  fi
  export TRACY_WEBROOT_LOCK_HELD=1
  "$@"
}

# ── the Initial backup (ADR 0024 sub-decision 5) ─────────────────────────────────────────────
# Provision calls this right after the site is built: the cheapest moment there is (a site that
# nobody has touched yet), and the only moment v1 can truthfully say "site as built". A site that
# already has a later point, or whose v1 already carries a database, is NOT given one: a dump taken
# today and pinned to v1 would lie about the mark.
initial_backup() {
  if ! { [[ -d "$REPO_DIR" ]] && g rev-parse --verify HEAD >/dev/null 2>&1; }; then
    # EmDash's road never built the webroot repo at provision; the Initial backup needs its v1.
    bash "$HERE/webroot-git.sh" --label "$LABEL" --op ensure 1>&2
  fi
  require_repo
  local tags v1="$BACKUP_TAG_PREFIX/v1"
  tags="$(g for-each-ref --format='%(refname:short)' "refs/tags/$BACKUP_TAG_PREFIX/*")"
  if ! g rev-parse --verify --quiet "refs/tags/$v1" >/dev/null; then
    echo '{"ok":true,"initial":false,"reason":"no v1"}'; return
  fi
  if [[ "$(printf '%s\n' "$tags" | grep -c .)" -gt 1 ]]; then
    echo '{"ok":true,"initial":false,"reason":"later backups exist"}'; return
  fi
  local contents
  contents="$(g tag -l --format='%(contents)' "$v1")"
  # A here-string, not `printf | grep -q`: under pipefail grep quitting on its match can SIGPIPE the
  # writer of the lines after it (status 141), and the check then reads "no database yet".
  if grep -q '^Tracy-Database: ' <<<"$contents"; then
    echo '{"ok":true,"initial":true,"already":true}'; return
  fi
  if ! tracy_backup_dump 1; then
    echo "!! Initial backup has no database ($BK_ERROR) — v1 stays a file backup" >&2
    python3 -c 'import json,sys; print(json.dumps({"ok": True, "initial": True, "database": None, "databaseError": sys.argv[1]}))' "$BK_ERROR"
    return
  fi
  if [[ -z "$BK_TRAILERS" ]]; then
    echo '{"ok":true,"initial":true,"database":null}'; return
  fi
  if [[ "$(tracy_backup_platform)" == emdash ]]; then snapshot_emdash_app_for_backup 1; fi
  local message target
  message="$(mktemp "/tmp/backup-msg-$LABEL.XXXXXX")"
  { printf '%s\n\n%s\n' "$(printf '%s' "$contents" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')" "$BK_TRAILERS"; } > "$message"
  target="$(g rev-parse "$v1^{commit}")"
  # Same tagger as ensure_initial_backup (the agent), same target: only the message gains the trailer.
  GIT_COMMITTER_NAME="Agent" GIT_COMMITTER_EMAIL="agent@tracy.ai" g tag -f -a "$v1" -F "$message" "$target" >/dev/null
  rm -f "$message"
  python3 -c 'import json,sys; print(json.dumps({"ok": True, "initial": True, "version": 1, "database": json.loads(sys.argv[1])}))' "$BK_JSON"
}

# ── Restore everything (ADR 0024 sub-decision 2) ─────────────────────────────────────────────
# Files AND database back to one point. The order is chosen so that every step before the last
# swap can be undone by not doing the next one:
#
#   1. verify           the point's dump(s) still hash to what its tag says (and, with --sha, the
#                       point is still on the commit the caller saw)
#   2. before-restore   a full backup of what is there now ("Before restore to Backup N"), by the
#                       person who pressed: the way back from this very action
#   3. load             WordPress/Joomla: into a scratch schema `<db>_tracy_restore`, then count
#                       its tables against the trailer. EmDash: unpack beside the live files and
#                       run integrity_check. The live site is untouched so far.
#   4. files            WordPress/Joomla: `restore-reset` of the webroot to the point (the Restore
#                       files road). EmDash has no file history: skipped.
#   5. swap             WordPress/Joomla: ONE `RENAME TABLE` moving every live table into
#                       `<db>_tracy_trash_<epoch>` and every restored one into place — all or nothing
#                       in MariaDB, so a failure leaves the old database whole. EmDash: stop web,
#                       move data.db (+ -wal/-shm) and uploads/ aside, put the restored ones in, start.
#   6. check            the live tables / the live data.db count what the point counted.
#
# A failure rolls back what was done (files reset to the Before-restore point, tables or files
# moved back) and the answer names the step and whether the rollback held. What the restore
# replaced stays aside for TRACY_BACKUP_TRASH_HOURS and is dropped by a later backup's prune.
# Refusals (no such point, a database that is not `full`, no Before-restore) are answers, exit 0.
STEPS=()
STEP_T0=""
# Each step with the milliseconds since the previous one ended (ADR 0024 asks for the job's 120 s
# ceiling to be measured, not assumed).
_now_ms() { python3 -c 'import time; print(int(time.time() * 1000))'; }
step() {
  local now ms
  now="$(_now_ms)"
  ms=$(( now - ${STEP_T0:-$now} ))
  STEP_T0="$now"
  STEPS+=("$1:$2:$ms")
  echo "==> restore everything: $1 $2 (${ms} ms)" >&2
}

restore_answer() { # ok code failed_step rolled_back error
  python3 - "$@" "$VERSION" "${TARGET_SHA:-}" "${BEFORE_JSON:-null}" "${BK_KIND:-}" "${RESTORE_TABLES:-}" "${RESTORE_FILES:-}" "$(g rev-parse HEAD 2>/dev/null)" "${TARGET_DB_SHA:-}" "${STEPS[@]+"${STEPS[@]}"}" <<'PYEOF'
import json, sys
ok, code, failed, rolled, error, version, sha, before, kind, tables, files, head, db_sha, *steps = sys.argv[1:]
out = {"ok": ok == "1", "version": int(version), "sha": sha or None,
       "beforeRestore": json.loads(before), "kind": kind or None,
       "steps": [dict(zip(("step", "state", "ms"), s.split(":", 2))) for s in steps]}
for s in out["steps"]:
    s["ms"] = int(s["ms"])
if ok == "1":
    # `database.sha256` is the hash of the dump that was LOADED — the point's own, which tracy-web
    # compares with what it showed when the person pressed — never the Before-restore dump's.
    out.update({"head": head or None, "tables": int(tables) if tables else None,
                "files": int(files) if files.isdigit() else 0,
                "database": {"restored": True, "sha256": db_sha}})
else:
    out.update({"code": code, "failedStep": failed or None,
                "rolledBack": None if rolled == "" else rolled == "1", "error": error or None})
print(json.dumps(out))
PYEOF
}

restore_everything() {
  require_repo
  [[ -n "$VERSION" ]] || { echo "need --version" >&2; exit 2; }
  STEP_T0="$(_now_ms)"
  local point state kind tables
  point="$(python3 "$LIB_DIR/backup_points.py" point "$REPO_DIR" "$BACKUP_TAG_PREFIX" "$(tracy_backup_dir)" "$VERSION")"
  if [[ "$point" == null ]]; then
    echo "{\"ok\":false,\"code\":\"NO_SUCH_BACKUP\",\"version\":$VERSION}"; return
  fi
  read -r state kind tables TARGET_SHA TARGET_DB_SHA < <(python3 -c 'import json,sys
p=json.loads(sys.argv[1]); d=p["database"] or {}; f=p["facts"]
print("full" if d.get("ok") else "not", f["kind"] or "-", f["tables"] if f["tables"] is not None else "-", p["sha"], d.get("sha256") or "-")' "$point")
  BK_KIND="$kind"
  if [[ -n "$SHA" && "$TARGET_SHA" != "$SHA"* ]]; then
    echo "{\"ok\":false,\"code\":\"BACKUP_SHA_MISMATCH\",\"version\":$VERSION}"; return
  fi
  if [[ "$state" != full ]]; then
    python3 -c 'import json,sys; p=json.loads(sys.argv[1]); print(json.dumps({"ok": False, "code": "BACKUP_NOT_FULL", "version": p["version"], "database": p["database"]}))' "$point"
    return
  fi
  if [[ "$kind" != "$(tracy_backup_kind)" ]]; then
    echo "{\"ok\":false,\"code\":\"BACKUP_KIND_MISMATCH\",\"version\":$VERSION}"; return
  fi
  # 1. verify — the point's dump(s) hash to its tag (read just above, right before use).
  step verify done
  # A sync's restore (--only-tables): the tables it changed load into the scratch schema while the
  # Before-restore backup is made — the load touches nothing of the site, and the swap still waits
  # for both.
  [[ -z "$ONLY_TABLES" || "$kind" != mysql ]] || only_load_start

  # 2. before-restore — a child run of `create`, under the locks this run already holds.
  local before_out before_state
  if ! before_out="$(bash "$0" --label "$LABEL" --op create --title "Before restore to Backup $VERSION" --auto pre-restore \
        ${ONLY_TABLES:+--sealed} \
        ${BY_EMAIL:+--by-email "$BY_EMAIL" --by-name "${BY_NAME:-$BY_EMAIL}"} | tail -1)"; then
    only_load_abandon
    step before-restore failed
    restore_answer 0 BEFORE_RESTORE_FAILED before-restore "" "the Before-restore backup could not be made"; return
  fi
  BEFORE_JSON="$(python3 -c 'import json,sys; b=json.loads(sys.argv[1]); print(json.dumps({"version": b["version"], "sha": b["fleetSha"], "database": b.get("database")}))' "$before_out")"
  before_state="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1])["database"]; print("full" if d and d.get("ok") else "none")' "$BEFORE_JSON")"
  if [[ "$before_state" != full ]]; then
    only_load_abandon
    step before-restore failed
    restore_answer 0 BEFORE_RESTORE_FAILED before-restore "" "the Before-restore backup holds no database: not restoring without a way back"; return
  fi
  step before-restore done
  BEFORE_SHA="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["sha"])' "$BEFORE_JSON")"

  RESTORE_TABLES="$tables"
  if [[ "$kind" == mysql ]]; then restore_mysql; else restore_sqlite; fi
}

# Put the webroot back to the Before-restore point (rollback of step 4).
files_back() {
  TRACY_WEBROOT_LOCK_HELD=1 bash "$HERE/webroot-git.sh" --label "$LABEL" --op restore-reset --sha "$BEFORE_SHA" >/dev/null 2>&1
}

# The scratch schema a restore loads the point into, and the one its swap moves the old tables to.
restore_schema_names() {
  RS_DB="$(tracy_backup_db_name)"
  RS_TMP="${RS_DB}_tracy_restore"
}

# A sync's restore: the point's dump cut to the tables named in --only-tables, loaded into the
# scratch schema in the background (lib/dump_tables.py). Its exit code and the number of tables it
# kept land in files beside it; `only_load_wait` collects them.
ONLY_PID="" ONLY_DIR=""
only_load_start() {
  local charset collation dump
  restore_schema_names
  dump="$(tracy_backup_dir)/v$VERSION.mysql.gz"
  read -r charset collation < <(tracy_db_exec mariadb -uroot -N -B -e \
    "SELECT default_character_set_name, default_collation_name FROM information_schema.schemata WHERE schema_name='$RS_DB'") || true
  [[ "$charset" =~ ^[a-z0-9_]+$ ]] || charset=utf8mb4
  [[ "$collation" =~ ^[a-z0-9_]+$ ]] || collation=utf8mb4_unicode_ci
  ONLY_DIR="$(mktemp -d "/tmp/restore-only-$LABEL.XXXXXX")"
  (
    set +e
    code=1
    if tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$RS_TMP\`; CREATE DATABASE \`$RS_TMP\` CHARACTER SET $charset COLLATE $collation" >&2; then
      gzip -dc "$dump" | python3 "$LIB_DIR/dump_tables.py" --tables "$ONLY_TABLES" --count "$ONLY_DIR/count" \
        | tracy_db_exec mariadb -uroot --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$RS_TMP" >&2
      rc=("${PIPESTATUS[@]}")
      code=0
      for c in "${rc[@]}"; do [[ "$c" == 0 ]] || code=1; done
    fi
    echo "$code" > "$ONLY_DIR/rc"
  ) &
  ONLY_PID=$!
}

# 0 when the cut loaded whole: every table it kept is in the scratch schema.
only_load_wait() {
  [[ -n "$ONLY_PID" ]] || return 1
  wait "$ONLY_PID" 2>/dev/null || true
  ONLY_PID=""
  local rc kept n
  rc="$(cat "$ONLY_DIR/rc" 2>/dev/null || echo 1)"
  kept="$(cat "$ONLY_DIR/count" 2>/dev/null || echo -1)"
  rm -rf "$ONLY_DIR"
  [[ "$rc" == 0 ]] || return 1
  n="$(tracy_db_tables "$RS_TMP" | grep -c . || true)"
  [[ "$n" == "$kept" ]]
}

# The background load is not wanted any more (the Before-restore backup failed): stopped and gone.
only_load_abandon() {
  [[ -n "$ONLY_PID" ]] || return 0
  only_load_wait || true
  tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$RS_TMP\`" >/dev/null 2>&1 || true
}

restore_mysql() {
  local db tmpdb trash ts dump charset collation n live restored
  db="$(tracy_backup_db_name)"
  tmpdb="${db}_tracy_restore"
  ts="$(date +%s)"
  trash="${db}_tracy_trash_${ts}"
  dump="$(tracy_backup_dir)/v$VERSION.mysql.gz"
  read -r charset collation < <(tracy_db_exec mariadb -uroot -N -B -e \
    "SELECT default_character_set_name, default_collation_name FROM information_schema.schemata WHERE schema_name='$db'") || true
  [[ "$charset" =~ ^[a-z0-9_]+$ ]] || charset=utf8mb4
  [[ "$collation" =~ ^[a-z0-9_]+$ ]] || collation=utf8mb4_unicode_ci
  # 3. load into the scratch schema: the whole point, or — a sync's restore — the tables it changed,
  # loaded already beside the Before-restore backup (`only_load_start`).
  if [[ -n "$ONLY_TABLES" ]]; then
    if ! only_load_wait; then
      tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`" >/dev/null 2>&1 || true
      step load failed
      restore_answer 0 RESTORE_FAILED load 1 "the changed tables did not load; nothing on the site was changed"; return
    fi
  elif ! tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`; CREATE DATABASE \`$tmpdb\` CHARACTER SET $charset COLLATE $collation" >&2 \
     || ! gzip -dc "$dump" | tracy_db_exec mariadb -uroot --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$tmpdb" >&2; then
    tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`" >/dev/null 2>&1 || true
    step load failed
    restore_answer 0 RESTORE_FAILED load 1 "the dump did not load; nothing on the site was changed"; return
  fi
  restored="$(tracy_db_tables "$tmpdb")"
  n="$(printf '%s\n' "$restored" | grep -c . || true)"
  # The whole point: as many tables as it recorded. A cut: counted by its load (`only_load_wait`);
  # the site's count is checked against the point's after the swap all the same.
  if [[ -z "$ONLY_TABLES" && "$n" != "$RESTORE_TABLES" ]]; then
    tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`" >/dev/null 2>&1 || true
    step load failed
    restore_answer 0 RESTORE_FAILED load 1 "the dump loaded $n tables, the backup recorded $RESTORE_TABLES; nothing on the site was changed"; return
  fi
  step load done
  # TRACY_TEST_KILL_AT: the test suite's way to stop a restore where a restart could — the whole
  # process group, as a container stop does (webroot-sync.sh recovers what that leaves).
  [[ "${TRACY_TEST_KILL_AT:-}" != restore-files ]] || kill -KILL 0

  # 4. files. A sync's restore whose point holds the very tree the copy is on (a sync that brought
  # no file): nothing to put back, and the copy was sealed by the sync moments ago — the reset's own
  # seal of every file is not made again.
  local reset
  if [[ -n "$ONLY_TABLES" && "$(g rev-parse "HEAD^{tree}")" == "$(g rev-parse "$TARGET_SHA^{tree}")" ]]; then
    RESTORE_FILES=0
    step files done
  elif ! reset="$(TRACY_WEBROOT_LOCK_HELD=1 bash "$HERE/webroot-git.sh" --label "$LABEL" --op restore-reset --sha "$TARGET_SHA" | tail -1)"; then
    files_back
    tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`" >/dev/null 2>&1 || true
    step files failed
    restore_answer 0 RESTORE_FAILED files 1 "the files could not be restored; they were put back as they were"; return
  else
    RESTORE_FILES="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("files", ""))' "$reset" 2>/dev/null || true)"
    step files done
  fi
  [[ "${TRACY_TEST_KILL_AT:-}" != restore-swap ]] || kill -KILL 0

  # 5. swap: one statement, all or nothing. A cut moves only the named tables of the site: the rest
  # are the point's already and keep their rows, triggers and sessions.
  live="$(tracy_db_tables "$db")"
  if [[ -n "$ONLY_TABLES" ]]; then
    live="$(printf '%s\n' "$live" | grep -Fxf <(grep . "$ONLY_TABLES") || true)"
  fi
  local sql
  sql="$(python3 - "$db" "$tmpdb" "$trash" "$live" "$restored" <<'PYEOF'
import sys
db, tmp, trash, live, restored = sys.argv[1:6]
q = lambda s: chr(96) + s.replace(chr(96), chr(96) * 2) + chr(96)
pairs = [f"{q(db)}.{q(t)} TO {q(trash)}.{q(t)}" for t in live.split() if t]
pairs += [f"{q(tmp)}.{q(t)} TO {q(db)}.{q(t)}" for t in restored.split() if t]
# A cut that changed nothing still leaves its trash schema: what a cut-off sync is recognised by.
print(f"CREATE DATABASE {q(trash)};" + (" RENAME TABLE " + ", ".join(pairs) + ";" if pairs else ""))
PYEOF
)"
  # Tables move bare (lib/site-backup.sh "triggers"): both schemas' triggers are kept as SQL, dropped,
  # and the restored set is loaded into the live schema once the tables are there. The live site
  # runs without triggers only for the milliseconds between the drop and the load.
  local trig live_trig new_trig triggers_ok=1
  trig="$(mktemp -d "/tmp/restore-triggers-$LABEL.XXXXXX")"
  live_trig="$trig/live.sql" new_trig="$trig/restored.sql"
  local moved=()
  local one
  if [[ -n "$ONLY_TABLES" ]]; then
    while IFS= read -r one; do [[ -z "$one" ]] || moved+=("$one"); done <<< "$live"
  fi
  # Dropping the site's triggers: all of them for a whole restore, only the moved tables' for a cut.
  drop_live_triggers() {
    if [[ -n "$ONLY_TABLES" ]]; then tracy_db_drop_triggers_of "$db" ${moved[@]+"${moved[@]}"}; else tracy_db_drop_triggers "$db"; fi
  }
  local live_trig_ok=1
  if [[ -n "$ONLY_TABLES" ]]; then
    tracy_db_triggers_sql_of "$db" ${moved[@]+"${moved[@]}"} > "$live_trig" || live_trig_ok=0
  else
    tracy_db_triggers_sql "$db" > "$live_trig" || live_trig_ok=0
  fi
  if [[ "$live_trig_ok" != 1 ]] || ! tracy_db_triggers_sql "$tmpdb" > "$new_trig" \
     || ! tracy_db_drop_triggers "$tmpdb" >&2; then
    rm -rf "$trig"
    files_back
    tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`" >/dev/null 2>&1 || true
    step swap failed
    restore_answer 0 RESTORE_FAILED swap 1 "the database triggers could not be read; the old database and files are in place"; return
  fi
  if ! drop_live_triggers >&2 || ! tracy_db_exec mariadb -uroot -e "$sql" >&2; then
    # Whatever was dropped comes back: the live tables never moved.
    local rolled=1
    drop_live_triggers >/dev/null 2>&1 || true
    tracy_db_load_triggers "$db" "$live_trig" >&2 || rolled=0
    rm -rf "$trig"
    files_back || rolled=0
    tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`; DROP DATABASE IF EXISTS \`$trash\`" >/dev/null 2>&1 || true
    step swap failed
    restore_answer 0 RESTORE_FAILED swap "$rolled" "the database swap was refused; the old database and files are in place"; return
  fi
  tracy_db_load_triggers "$db" "$new_trig" >&2 || triggers_ok=0
  step swap done

  # 6. check the live database. (TRACY_TEST_FAIL_AFTER_SWAP: the test suite's way to make this
  # check fail after a real swap, so the swap-back is exercised.)
  local now_live now_n
  now_live="$(tracy_db_tables "$db")"
  now_n="$(printf '%s\n' "$now_live" | grep -c . || true)"
  if [[ "$now_n" != "$RESTORE_TABLES" || "$triggers_ok" != 1 || -n "${TRACY_TEST_FAIL_AFTER_SWAP:-}" ]]; then
    local back failed="${db}_tracy_failed_${ts}"
    # A cut puts back only what it moved: the tables it brought in out, the site's own back in.
    local out_now="$now_live"
    [[ -z "$ONLY_TABLES" ]] || out_now="$restored"
    back="$(python3 - "$db" "$failed" "$trash" "$out_now" "$live" <<'PYEOF'
import sys
db, failed, trash, now_live, old = sys.argv[1:6]
q = lambda s: chr(96) + s.replace(chr(96), chr(96) * 2) + chr(96)
pairs = [f"{q(db)}.{q(t)} TO {q(failed)}.{q(t)}" for t in now_live.split() if t]
pairs += [f"{q(trash)}.{q(t)} TO {q(db)}.{q(t)}" for t in old.split() if t]
print(f"CREATE DATABASE {q(failed)}; RENAME TABLE " + ", ".join(pairs) + ";")
PYEOF
)"
    local rolled=0
    # Bare again before moving back (the restored triggers would refuse the rename), then the
    # triggers that were live before the restore.
    local in_now=()
    if [[ -n "$ONLY_TABLES" ]]; then
      while IFS= read -r one; do [[ -z "$one" ]] || in_now+=("$one"); done <<< "$restored"
    fi
    if { if [[ -n "$ONLY_TABLES" ]]; then tracy_db_drop_triggers_of "$db" ${in_now[@]+"${in_now[@]}"}; else tracy_db_drop_triggers "$db"; fi; } >&2 \
       && tracy_db_exec mariadb -uroot -e "$back" >&2 \
       && tracy_db_load_triggers "$db" "$live_trig" >&2 && files_back; then rolled=1; fi
    rm -rf "$trig"
    step check failed
    if [[ "$triggers_ok" != 1 ]]; then
      restore_answer 0 RESTORE_FAILED check "$rolled" "the restored database triggers did not load"; return
    fi
    restore_answer 0 RESTORE_FAILED check "$rolled" "the restored database did not check out ($now_n tables, expected $RESTORE_TABLES)"; return
  fi
  rm -rf "$trig"
  tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$tmpdb\`" >/dev/null 2>&1 || true
  step check done
  restore_answer 1 "" "" "" ""
}

restore_sqlite() {
  local dir ts stage n uploads_tar db_tar owner
  dir="$(tracy_backup_dir)"
  ts="$(date +%s)"
  stage="$STACK/.restore-$ts"
  rm -rf "$stage"; ( umask 077; mkdir -p "$stage" )
  # 3. load beside the live files.
  if ! gzip -dc "$dir/v$VERSION.sqlite.gz" > "$stage/data.db" \
     || ! n="$(_tracy_sqlite check "$stage/data.db" | tail -1)" || [[ "$n" != "$RESTORE_TABLES" ]] \
     || ! tar -xzf "$dir/v$VERSION.uploads.tar.gz" --numeric-owner -C "$stage"; then
    rm -rf "$stage"
    step load failed
    restore_answer 0 RESTORE_FAILED load 1 "the backup did not unpack and check out; nothing on the site was changed"; return
  fi
  step load done
  step files skipped
  # 5. swap: the site is stopped for the few seconds it takes (said in the dialog).
  local trash="$STACK/data.tracy-trash-$ts" moved_db=0 moved_up=0 rolled=1
  owner="$(python3 -c 'import os,sys; s=os.stat(sys.argv[1]); print(f"{s.st_uid}:{s.st_gid}")' "$STACK/data/data.db")"
  if ! ( cd "$STACK" && docker compose stop web ) >&2; then
    rm -rf "$stage"
    step swap failed
    restore_answer 0 RESTORE_FAILED swap 1 "the site could not be stopped; nothing was changed"; return
  fi
  mkdir -p "$trash"
  local f ok=1
  for f in data.db data.db-wal data.db-shm; do
    if [[ -e "$STACK/data/$f" ]]; then mv "$STACK/data/$f" "$trash/$f" || ok=0; fi
  done
  moved_db=1
  if [[ "$ok" == 1 ]] && mv "$stage/data.db" "$STACK/data/data.db"; then
    # The container's own user owned the file it replaces; give the restored one the same owner.
    chown "$owner" "$STACK/data/data.db" 2>/dev/null || true
    if mv "$STACK/uploads" "$STACK/uploads.tracy-trash-$ts"; then
      moved_up=1
      mv "$stage/uploads" "$STACK/uploads" || ok=0
    else
      ok=0
    fi
  else
    ok=0
  fi
  # 6. check before the site comes back.
  if [[ "$ok" == 1 ]]; then
    local now
    now="$(_tracy_sqlite check "$STACK/data/data.db" 2>/dev/null | tail -1 || echo x)"
    [[ "$now" == "$RESTORE_TABLES" && -z "${TRACY_TEST_FAIL_AFTER_SWAP:-}" ]] || ok=0
  fi
  if [[ "$ok" != 1 ]]; then
    # Put back exactly what was moved.
    if [[ "$moved_up" == 1 ]]; then
      rm -rf "$STACK/uploads"; mv "$STACK/uploads.tracy-trash-$ts" "$STACK/uploads" || rolled=0
    fi
    if [[ "$moved_db" == 1 ]]; then
      rm -f "$STACK/data/data.db"
      for f in data.db data.db-wal data.db-shm; do
        if [[ -e "$trash/$f" ]]; then mv "$trash/$f" "$STACK/data/$f" || rolled=0; fi
      done
    fi
    ( cd "$STACK" && docker compose start web ) >&2 || rolled=0
    rm -rf "$stage"
    step swap done
    step check failed
    restore_answer 0 RESTORE_FAILED check "$rolled" "the restored content did not check out; the site was put back as it was"; return
  fi
  if ! ( cd "$STACK" && docker compose start web ) >&2; then
    rm -rf "$stage"
    step swap done
    step check failed
    restore_answer 0 RESTORE_FAILED start 0 "the content was restored but the site did not start again"; return
  fi
  rm -rf "$stage"
  step swap done
  step check done
  restore_answer 1 "" "" "" ""
}

# ── Export (plan todo-backup-export) ──────────────────────────────────────────────────────────
# Packing reads the history and the dump, so it holds the same two locks a backup does: no seal
# moves the tag's repository and no restore swaps the dump while it is read. The upload can take
# up to half an hour and reads only the finished zip, so the locks are let go before it — a slow
# network must not keep every other site on the host from making a backup.
EXPORT_DIR=""
EXPORT_RESULT=""

export_refusal() { # code error
  python3 -c 'import json,sys; print(json.dumps({"ok": False, "code": sys.argv[1], "error": sys.argv[2], "version": int(sys.argv[3])}))' \
    "$1" "$2" "$VERSION" > "$EXPORT_RESULT"
}

pack_export() {
  require_repo
  local point state kind platform
  point="$(python3 "$LIB_DIR/backup_points.py" point "$REPO_DIR" "$BACKUP_TAG_PREFIX" "$(tracy_backup_dir)" "$VERSION")"
  if [[ "$point" == null ]]; then export_refusal NO_SUCH_BACKUP "there is no backup $VERSION"; return; fi
  printf '%s' "$point" > "$EXPORT_DIR/point.json"
  read -r state kind < <(python3 -c 'import json,sys
p=json.load(open(sys.argv[1])); d=p["database"] or {}
print("full" if d.get("ok") else "not", p["facts"]["kind"] or "-")' "$EXPORT_DIR/point.json")
  if [[ "$state" != full ]]; then export_refusal BACKUP_NOT_FULL "backup $VERSION holds no verified database"; return; fi
  platform="$(tracy_backup_platform)"
  if [[ "$platform" == emdash && "$kind" == sqlite ]]; then
    cp "$(tracy_backup_dir)/v$VERSION.sqlite.gz" "$EXPORT_DIR/db.sqlite.gz"
    cp "$(tracy_backup_dir)/v$VERSION.uploads.tar.gz" "$EXPORT_DIR/uploads.tar.gz"
    [[ -f "$(tracy_backup_dir)/v$VERSION.app.tar" ]] || {
      export_refusal APP_UNAVAILABLE "the EmDash app snapshot is not present on backup $VERSION"
      return
    }
    cp "$(tracy_backup_dir)/v$VERSION.app.tar" "$EXPORT_DIR/app.tar"
    # The app snapshot leaves `.env` out, so the README's old address comes from the stack's own.
    TRACY_EXPORT_SITE_URL="$(_tracy_env_value EMDASH_SITE_URL)" \
      "${GENTLE[@]}" python3 "$LIB_DIR/export-package.py" "$EXPORT_DIR" "$platform" "$LABEL" \
      "$EXPORT_DIR/point.json" "${MAX_BYTES:-1073741824}" | tail -1 > "$EXPORT_RESULT"
    return
  fi
  if [[ "$kind" != mysql || ( "$platform" != wordpress && "$platform" != joomla ) ]]; then
    export_refusal UNSUPPORTED_PLATFORM "a $platform backup cannot be downloaded yet"; return
  fi
  local commit
  commit="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha"])' "$EXPORT_DIR/point.json")"
  "${GENTLE[@]}" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO_DIR" archive --format=tar "$commit" > "$EXPORT_DIR/archive.tar"
  cp "$(tracy_backup_dir)/v$VERSION.mysql.gz" "$EXPORT_DIR/db.sql.gz"
  local -a package_args=("$EXPORT_DIR" "$platform" "$LABEL" "$EXPORT_DIR/point.json" "${MAX_BYTES:-1073741824}")
  [[ "$INCLUDE_LARGE" != 1 ]] || package_args+=("$(tracy_backup_dir)/v$VERSION.large.tar.gz")
  # The installer's code reaches the packer through its environment, as the EmDash address does above.
  TRACY_EXPORT_INSTALL_CODE="${TRACY_EXPORT_INSTALL_CODE:-}" \
    "${GENTLE[@]}" python3 "$LIB_DIR/export-package.py" "${package_args[@]}" | tail -1 > "$EXPORT_RESULT"
}

export_backup() {
  [[ -n "$VERSION" ]] || { echo "need --version" >&2; exit 2; }
  [[ -n "${TRACY_EXPORT_UPLOAD_URL:-}" ]] || { echo "need TRACY_EXPORT_UPLOAD_URL in the environment" >&2; exit 2; }
  require_repo
  # Beside the site's backups, not in /tmp: up to a GiB on the disk that already holds the dumps,
  # 0700, and removed by teardown with the private dir if this run is killed before its trap.
  EXPORT_DIR="$(umask 077; mktemp -d "$STACK/.export.XXXXXX")"
  trap 'rm -rf "${EXPORT_DIR:?}"' EXIT
  EXPORT_RESULT="$EXPORT_DIR/result.json"
  run_heavy webroot_locked pack_export >&2
  # Let both locks go before the upload (fds 7 and 9, opened by webroot_locked and run_heavy).
  exec 7>&- 9>&-
  unset TRACY_HEAVY_LOCK_HELD TRACY_WEBROOT_LOCK_HELD
  local result
  result="$(cat "$EXPORT_RESULT" 2>/dev/null || true)"
  if [[ -z "$result" ]]; then
    export_refusal PACK_FAILED "the backup could not be packed"
    result="$(cat "$EXPORT_RESULT")"
  fi
  if [[ "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("ok") is True)' "$result")" != True ]]; then
    printf '%s\n' "$result"; return
  fi
  local err status=0
  echo "==> export: uploading backup $VERSION ($(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["bytes"])' "$result") bytes)" >&2
  # The address goes to curl through its config on stdin: argv is world-readable in `ps`.
  err="$(printf 'url = "%s"\n' "$TRACY_EXPORT_UPLOAD_URL" \
    | curl --config - --fail --silent --show-error --upload-file "$EXPORT_DIR/package.zip" \
        --max-time 1800 --retry 3 --output /dev/null 2>&1)" || status=$?
  if [[ "$status" != 0 ]]; then
    # curl names the host at most; anything after a `?` is cut all the same.
    err="$(printf '%s' "$err" | sed -e 's/?[^[:space:]]*//g' | tail -1)"
    export_refusal UPLOAD_FAILED "the upload failed (curl $status): $err"
    cat "$EXPORT_RESULT"; return
  fi
  echo "==> export: backup $VERSION uploaded" >&2
  printf '%s\n' "$result"
}

case "$OP" in
  create) run_heavy webroot_locked create_backup ;;
  create-from) run_heavy webroot_locked create_from ;;
  list) list_backups ;;
  # The words of provision.sh's own (silent) mark, so the step reads the backup again after a wait.
  initial-backup) HEAVY_RESUME_STAGE="taking the Initial backup (ADR 0024)" run_heavy webroot_locked initial_backup ;;
  restore-everything) run_heavy webroot_locked restore_everything ;;
  export) export_backup ;;
  *) echo "unknown op: $OP" >&2; exit 2 ;;
esac
