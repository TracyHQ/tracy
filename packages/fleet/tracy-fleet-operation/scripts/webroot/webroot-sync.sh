#!/usr/bin/env bash
# webroot-sync.sh — "Sync from live" for an imported site (plan tasks/ke-hoach-dong-bo-tu-live.md):
# what the customer changed on their live site since it was last read comes into the copy on this
# host, and what Tracy changed on the copy stays. The engine is lib/live_sync.py; this script hands it
# the three versions of the site and turns its result into a backup point that Restore everything
# puts in place, so the cutover, its checks, its rollback and its way back are the ones restores
# already have.
#
#   base    the live site as last read: `refs/tracy/live` + `<private>/sync/live-base.sql.gz` after
#           a first sync; before one, the raw import archive when the caller found it
#           (`D/base/webroot.tar` + `D/base/db.sql.gz`), else the site as built (`tracy-baseline` + v1)
#   ours    the copy: its webroot sealed and its database dumped, here, now
#   theirs  the live site as just read (`lib/live-pull.mjs`): `D/live/db.sql.gz` and the webroot —
#           `D/live/tree/` (the whole tree), or `D/live/changes/` + `D/live/deleted.json` (what changed
#           since the last read, laid over `refs/tracy/live`), or `D/live/webroot.tar` (a tar)
#
# A read of the live site is NORMALISED before it is compared — the same steps provision took on the
# copy (no `installation/`, the root .htaccess and its hardening block, the SEF plugin's domain), so a
# change provision made never reads as the live site taking it back.
#
# The read itself (lib/live-pull.mjs) happens first and OUTSIDE the locks — it waits on the customer's
# server for minutes, and the heavy lock is the whole machine's: when D holds no read yet and
# TRACY_SYNC_ENDPOINT + TRACY_SYNC_TOKEN are in the environment, `merge` and `sync` read the live site
# into D/live/ before they lock. TRACY_SYNC_BASE_WEBROOT_URL + TRACY_SYNC_BASE_DB_URL (signed GETs of
# the import archive) fill D/base/ the same way. The token never leaves the environment.
#
# Ops (the last stdout line is the answer):
#   --op merge --dir D [--decisions F] [--by-name N --by-email E]
#       Merges and answers a backup point holding the result (`state: ready`, `version`). Where both
#       sites changed one place differently, the copy's version stays (decided 20/10/2026: "on a
#       conflict, prefer Tracy's site"); each such place is listed under `kept`, so what the live
#       site changed and the copy did not take is said, not lost. A decisions file
#       (`{"<id>": "theirs"}`) still takes the live site's side for the ids it names. The copy is
#       not changed. D/merge.json keeps what `apply` checks.
#   --op apply --dir D [--by-name N --by-email E]
#       Refuses with COPY_CHANGED when the copy's files or database moved since `merge` (merge again).
#       Otherwise Restore everything to the point, then what the history cannot carry and what Joomla
#       must redo (`after`): the live site's files over 50 MiB the copy lacks, the nested sets the
#       merge took rows into, the content identity of new rows, the page cache. Then the live read
#       becomes the next sync's base.
#   --op sync --dir D [--decisions F] [--by-name N --by-email E]
#       merge, then apply at once when it is ready — the shortest window for the copy to move in
#       between; a copy that moved anyway is merged once more, then apply's refusal stands.
#
#   --op forget --dir D
#       The live site's data this host keeps between syncs — the last read's database dump and file
#       manifest, `refs/tracy/live`, every sync folder — deleted: tracy-web asks once a site has not
#       synced for its retention (`sites/live-sync.js` FORGET_AFTER_DAYS). The id map stays (numbers
#       only, and the copy's records keep them); the next sync starts from the import or the build.
#   --op copy-token --dir D        (token: env TRACY_COPY_COWORK_TOKEN)
#       A copy imported before copies got a token of their own still holds the live site's, which
#       its agent can read: writes the copy's own in its place, the same statement as provision.sh
#       step 4b. tracy-web runs it before the first sync of such a site.
#
# Joomla and WordPress (plan §4; WordPress's rules, address rewrite and wp-config.php merge are
# lib/live_sync_wordpress.py); EmDash has no import. Both ops hold the site's lock and the machine's
# heavy lock.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="${TRACY_LIB_DIR:-$HERE/../lib}"
# shellcheck source=../lib/roots.sh
. "$LIB_DIR/roots.sh"
# shellcheck source=../lib/heavy-slots.sh
. "$LIB_DIR/heavy-slots.sh"
# shellcheck source=../lib/webroot-repo-git.sh
. "$LIB_DIR/webroot-repo-git.sh"
# shellcheck source=../lib/webroot-platform.sh
. "$LIB_DIR/webroot-platform.sh"
# shellcheck source=../lib/webroot-excludes.sh
. "$LIB_DIR/webroot-excludes.sh"
# shellcheck source=../lib/webroot-htaccess.sh
. "$LIB_DIR/webroot-htaccess.sh"
# shellcheck source=../lib/site-backup.sh
. "$LIB_DIR/site-backup.sh"
# shellcheck source=../lib/webroot-skipped-dirs.sh
. "$LIB_DIR/webroot-skipped-dirs.sh"

LABEL="" OP="" DIR="" DECISIONS="" BY_NAME="" BY_EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --op) OP="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --decisions) DECISIONS="$2"; shift 2 ;;
    --by-name) BY_NAME="$2"; shift 2 ;;
    --by-email) BY_EMAIL="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$LABEL" && -n "$OP" && -n "$DIR" ]] || { echo "need --label, --op and --dir" >&2; exit 2; }
tracy_require_label "$LABEL"
[[ -d "$DIR" ]] || { echo "no sync folder at $DIR" >&2; exit 2; }
[[ -z "$DECISIONS" || -f "$DECISIONS" ]] || { echo "no decisions file at $DECISIONS" >&2; exit 2; }

STACK="$(tracy_private_dir "$LABEL")"
WEBROOT="$(tracy_webroot_dir "$LABEL")"
REPO="$(tracy_repo_dir "$LABEL")"
[[ -d "$WEBROOT" ]] || { echo "no webroot at $WEBROOT" >&2; exit 1; }

g() { git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" "$@"; }
# The commits this script writes carry the fleet's identity, like the baseline's.
export GIT_AUTHOR_NAME="Tracy" GIT_AUTHOR_EMAIL="fleet@tracy.ai" GIT_COMMITTER_NAME="Tracy" GIT_COMMITTER_EMAIL="fleet@tracy.ai"

LIVE_REF="refs/tracy/live"
SYNC_DIR="$STACK/sync"
LIVE_BASE_DUMP="$SYNC_DIR/live-base.sql.gz"
# The live site's fingerprint (claude-cowork 0.24.51 `site.fingerprint`) taken before the last
# applied read: the next read asks for it first, and stops there when nothing moved.
LIVE_FINGERPRINT="$SYNC_DIR/live-fingerprint.json"
# The numbers earlier syncs gave the live site's records that clashed with the copy's (lib/live_sync.py
# `IdMap`): read by every merge, replaced only by an apply that put its merge in place.
ID_MAP="$SYNC_DIR/id-map.json"
# What "Sync to live" (webroot-live-push.sh) wrote on the live site since the base was read: the
# places the merge takes as base first (lib/live_sync.py `seed_pushed`), so a record the push made
# is not merged back as the live site's own. Read by every merge, gone once a sync put its read in place.
PUSHED="$SYNC_DIR/pushed.json"
# The places a sync kept as the copy's although the live site changed them too (`kept`), as names
# only — table, key, column, never a value: "Sync to live" never writes over them, since the live
# site's value there is the customer's own (lib/live_push.py `mark_kept`). Every applied sync adds its own.
KEPT="$SYNC_DIR/kept.json"

# The site's web container runs PHP the way provision runs it (platform/joomla.sh).
web_php() { # script [env…]
  local script="$1"; shift
  local envs=() e
  for e in "$@"; do envs+=(-e "$e"); done
  ( cd "$STACK" && docker compose exec -T ${envs[@]+"${envs[@]}"} web php ) < "$script"
}

answer_refusal() { # code [detail]
  python3 -c 'import json,sys; print(json.dumps({"ok": False, "code": sys.argv[1], **({"detail": sys.argv[2]} if len(sys.argv) > 2 and sys.argv[2] else {})}))' "$@"
}

# ── locks (the same files as webroot-git.sh and webroot-backup.sh) ──────────────────────────────
HEAVY_LOCK="${TRACY_HEAVY_LOCK:-/var/lock/tracy-webroot-heavy.lock}"
run_heavy() {
  if [[ -n "${TRACY_HEAVY_LOCK_HELD:-}" ]] || ! command -v flock >/dev/null 2>&1; then "$@"; return; fi
  if ! heavy_try "$HEAVY_LOCK"; then
    echo "==> [${SECONDS}s] waiting for another site's heavy webroot job (the machine's heavy jobs are full)" >&2
    heavy_wait "$HEAVY_LOCK" 1800 || { echo "another heavy webroot job is running; try again shortly" >&2; exit 1; }
  fi
  export TRACY_HEAVY_LOCK_HELD=1
  "$@"
}
webroot_locked() {
  if [[ -n "${TRACY_WEBROOT_LOCK_HELD:-}" ]] || ! command -v flock >/dev/null 2>&1 || [[ ! -d "$REPO" ]]; then
    "$@"
    return
  fi
  exec 7>"$REPO/tracy-webroot.lock"
  flock -w 120 7 || { echo "another webroot job holds this site; try again shortly" >&2; exit 1; }
  export TRACY_WEBROOT_LOCK_HELD=1
  "$@"
}

# ── the database ─────────────────────────────────────────────────────────────────────────────
DB="" PREFIX="" CHARSET="utf8mb4" COLLATION="utf8mb4_unicode_ci"
SCHEMA_BASE="" SCHEMA_OURS="" SCHEMA_LIVE="" SCHEMA_WORK=""
db_names() {
  DB="$(tracy_backup_db_name)"
  SCHEMA_BASE="${DB}_tracy_sync_base" SCHEMA_OURS="${DB}_tracy_sync_merged"
  SCHEMA_LIVE="${DB}_tracy_sync_live" SCHEMA_WORK="${DB}_tracy_sync_work"
  PREFIX="$(site_prefix)"
  local c k
  read -r c k < <(tracy_db_exec mariadb -uroot -N -B -e \
    "SELECT default_character_set_name, default_collation_name FROM information_schema.schemata WHERE schema_name='$DB'") || true
  [[ "${c:-}" =~ ^[a-z0-9_]+$ ]] && CHARSET="$c"
  [[ "${k:-}" =~ ^[a-z0-9_]+$ ]] && COLLATION="$k"
}

# The copy's own table prefix, read the way provision reads it: Joomla's configuration.php states it
# (platform/joomla.sh); a WordPress database is the truth (platform/wordpress.sh
# tracy_wp_table_prefix: the shortest table named `…options` — wp-config.php may compute it).
site_prefix() {
  if [[ "$(tracy_backup_platform)" == wordpress ]]; then
    tracy_db_exec mariadb -uroot -N -B -e "SELECT SUBSTRING(table_name, 1, CHAR_LENGTH(table_name) - 7)
      FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE' AND table_name LIKE '%options'
      ORDER BY CHAR_LENGTH(table_name) LIMIT 1" 2>/dev/null | grep -E '^[A-Za-z0-9_]+$' | head -1 || true
    return 0
  fi
  grep -oE "dbprefix['\"]? *= *['\"][a-zA-Z0-9_]+" "$WEBROOT/configuration.php" 2>/dev/null \
    | grep -oE "[a-zA-Z0-9_]+$" || true
}

drop_scratch() {
  tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$SCHEMA_BASE\`; DROP DATABASE IF EXISTS \`$SCHEMA_OURS\`;
    DROP DATABASE IF EXISTS \`$SCHEMA_LIVE\`; DROP DATABASE IF EXISTS \`$SCHEMA_WORK\`" >/dev/null 2>&1 || true
}

# load_schema <schema> <dump.gz> [tables to leave out]: a scratch schema holding the dump, bare of
# triggers (the merge's REPLACEs must not fire the site's own: Claude Cowork's identity triggers
# would renumber an article). Every step checked by hand: `merge` runs inside a command substitution
# (`sync_op`), where bash turns `set -e` off, and a CREATE DATABASE or a load the server refused (its
# disk full, read-only) went by unseen — the merge then met a schema that was never made ("Unknown
# database", 24/10/2026) or, worse, one half loaded: merged as if the live site had dropped the rest.
load_schema() {
  tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$1\`; CREATE DATABASE \`$1\` CHARACTER SET $CHARSET COLLATE $COLLATION" || return 1
  # Two loads each (the base and the live read load side by side): four connections in all.
  TRACY_LOAD_STREAMS="${TRACY_LOAD_STREAMS:-2}" tracy_db_load_dump "$1" "$2" "$DIR/load-$1" "${3:-}" || return 1
  tracy_db_drop_triggers "$1" >&2 || return 1
}

# same_tables <base dump.gz> <live dump.gz> <out>: the tables the two reads of the live site hold
# alike, row for row (lib/dump_sections.py), that the merge reads no further than comparing them
# whole (lib/live_sync.py `policy_tables`) — loaded into neither scratch schema, they are "same" in
# the merge as they would have been loaded. Nothing in <out> when it cannot say: everything loads.
same_tables() {
  local keep="$DIR/keep-tables.txt" a="$DIR/base.digest" b="$DIR/live.digest" pa pb
  : > "$3"
  python3 "$LIB_DIR/live_sync.py" keep-tables --platform "$(tracy_backup_platform)" --prefix "$PREFIX" > "$keep" || return 0
  # And every table a "Sync to live" wrote since the base was read: the merge seeds those into the
  # base first (lib/live_sync.py `seed_pushed`).
  if [[ -f "$PUSHED" ]]; then
    python3 -c 'import json,sys
for r in json.load(open(sys.argv[1])).get("records", []):
    if isinstance(r, dict) and isinstance(r.get("table"), str):
        print(sys.argv[2] + r["table"])' "$PUSHED" "$PREFIX" >> "$keep" || return 0
  fi
  ( gzip -dc "$1" | python3 "$LIB_DIR/dump_sections.py" digest > "$a" ) & pa=$!
  ( gzip -dc "$2" | python3 "$LIB_DIR/dump_sections.py" digest > "$b" ) & pb=$!
  if wait "$pa" && wait "$pb"; then
    python3 "$LIB_DIR/dump_sections.py" same "$a" "$b" --keep "$keep" > "$3" || : > "$3"
  else
    wait "$pb" 2>/dev/null || true
  fi
  rm -f "$a" "$b" "$keep"
}

# A WordPress read is rewritten from its own `home` to the copy's address (lib/live_sync_wordpress.py
# `prepare`): two reads alike stay alike only when both name the same `home`. When they do not, the
# tables left out are loaded into both after all.
same_home() {
  local t="\`${PREFIX}options\`" said
  # Byte for byte: the rewrite replaces bytes, and the column's collation calls `Shop` and `shop` equal.
  said="$(tracy_db_exec mariadb -uroot -N -B -e "SELECT
      (SELECT CAST(option_value AS BINARY) FROM \`$SCHEMA_BASE\`.$t WHERE option_name = 'home' LIMIT 1)
      <=> (SELECT CAST(option_value AS BINARY) FROM \`$SCHEMA_LIVE\`.$t WHERE option_name = 'home' LIMIT 1)" 2>/dev/null)" || return 1
  [[ "$said" == 1 ]]
}

# load_more <schema> <dump.gz> <tables>: the named tables of the dump into a loaded scratch schema.
load_more() {
  gzip -dc "$2" | python3 "$LIB_DIR/dump_sections.py" cut --only "$3" \
    | tracy_db_exec mariadb -uroot --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$1" || return 1
  tracy_db_drop_triggers "$1" >&2 || return 1
}

# Whether every schema named holds tables: the scratch schemas a merge works on, once loaded.
scratch_loaded() { # schema…
  local s n
  for s in "$@"; do
    n="$(tracy_db_exec mariadb -uroot -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$s'" 2>/dev/null)" || return 1
    [[ "${n:-0}" =~ ^[0-9]+$ && "$n" -gt 0 ]] || return 1
  done
}
SCRATCH_REFUSED="the scratch databases could not be made: the database server refused them (is its disk full or read-only?)"

# The JSON argv lib/live_sync.py runs SQL with — the same client tracy_db_exec uses, run from $STACK.
sql_client() {
  python3 -c 'import json,sys; print(json.dumps(["docker", "compose", "exec", "-T", "-e", "MYSQL_PWD=" + sys.argv[1], "db", "mariadb", "-uroot"]))' \
    "$(_tracy_env_value DB_PASSWORD)"
}
# TRACY_SYNC_T0: this run's start on the clock, so the engine's phases are timed steps like ours.
engine() { ( cd "$STACK" && TRACY_SYNC_T0="$(( $(date +%s) - SECONDS ))" TRACY_SYNC_SQL="$(sql_client)" python3 "$LIB_DIR/live_sync.py" "$@" ); }
# Why the engine stopped, as it answered in <file> (lib/live_sync.py `failure_line`: the exception's
# kind, its last line with no value of the site, where it stopped), as `: <why>` — or nothing.
engine_said() { # answer-file
  python3 -c 'import json, sys
for line in reversed(open(sys.argv[1], encoding="utf-8", errors="replace").read().splitlines()):
    try:
        said = json.loads(line)
    except ValueError:
        continue
    if isinstance(said, dict) and said.get("detail"):
        print(": " + str(said["detail"]))
    break' "$1" 2>/dev/null || true
}

# Every table's checksum in the site's database, one `table<TAB>checksum` per line: what `apply`
# compares to know the copy's database did not move since `merge` read it.
db_checksums() {
  # Of the tables' substance (lib/live_sync.py `checksums`): a visit to the copy while it syncs moves
  # its hit counters, sessions and scheduler logs, and CHECKSUM TABLE called that COPY_CHANGED.
  engine checksums --schema "$DB" --platform "$(tracy_backup_platform)" --prefix "$PREFIX"
}

# load_ours: the copy's database into its scratch schema (SCHEMA_OURS), consistent with itself (one
# transaction) and proved still so after — the checksums before and after must match, and the copy
# must hold the very tables that were read, or something wrote in between. Streamed from the dump
# straight into the schema: written to a file and loaded from it later, it was compressed and read
# back for nothing (the file was the load's only reader). The copy's triggers are kept aside
# (D/ours-triggers.sql) and dropped from the schema. 0 loaded; 1 when the copy kept changing; 2 when
# its database could not be read or loaded — LOAD_OURS_WHY then says what the server said
# (`db_error_line`), or what was missing.
#
# A copy that is merely busy is read again, not a stop (24/10/2026, Joomla 5 on dev: a sync seconds
# after a chat turn stopped "could not be read into its scratch schema", the next one passed): the
# table list is read inside each try, and a try whose read failed because the copy moved under it —
# a table gone between the list and its dump (`Couldn't find table`, 1146: `db.purge` emptying the
# trash, a table an extension drops), one whose definition changed while the dump's transaction ran
# (1412: Smart Search's TRUNCATE of its token tables), a table that came — is the copy changing, as
# a checksum that moved is. Each try after the first waits a little longer (TRACY_SYNC_OURS_PAUSE
# seconds, then twice that) for the copy to settle.
OURS_CHECKSUMS="" LOAD_OURS_WHY="" OURS_STOP=""
load_ours() {
  local try said f err="$DIR/ours-said"
  LOAD_OURS_WHY=""
  for try in 1 2 3; do
    (( try == 1 )) || sleep "$(( (try - 1) * ${TRACY_SYNC_OURS_PAUSE:-2} ))"
    rm -rf "$err"; mkdir -p "$err"
    OURS_STOP="" said=0
    ours_try "$err" || said=$?
    # What the clients said stays in the job's log, after the try it belongs to.
    for f in "$err"/*; do [[ ! -s "$f" ]] || cat "$f" >&2; done
    case "$said" in
      0) rm -rf "$err" "$DIR/ours-shares"; return 0 ;;
      2)
        LOAD_OURS_WHY="$(db_error_line "$err"/*)"
        [[ -n "$LOAD_OURS_WHY" ]] || LOAD_OURS_WHY="$OURS_STOP"
        rm -rf "$err" "$DIR/ours-shares"
        return 2 ;;
    esac
    echo "==> [${SECONDS}s] the copy's database changed during its dump (try $try); dumping again" >&2
  done
  rm -rf "$err" "$DIR/ours-shares"
  return 1
}

# The copy's tables as load_ours reads them, `name<TAB>type<TAB>bytes` per line in name order —
# without the snapshots `db.snapshot` keeps in the database (`_tracy_snap_*`): copies, not tables of
# the site, which the merge never compares and the point never holds (lib/live_sync.py
# TRACY_COPY_TABLE, site-backup.sh) — dumped and loaded for nothing, twice the work for a
# whole-database one (#1649). Only the tables listed are dumped, so one made a moment later is not.
ours_tables() {
  tracy_db_exec mariadb -uroot -N -B -e "SELECT table_name, table_type, IFNULL(data_length, 0) FROM information_schema.tables
      WHERE table_schema='$DB' AND table_name NOT LIKE '\\_tracy\\_snap\\_%' ORDER BY table_name"
}

# Whether a try that failed met the copy moving under it (see load_ours): a definition that changed
# inside the dump's transaction (1412), or a table list that is no longer the one read.
ours_moved() { # err-dir listed
  grep -qsE '(Error|ERROR|error:) 1412\b|\(1412\)' "$1"/* && return 0
  local now
  now="$(ours_tables 2>/dev/null)" || return 1
  [[ "$(cut -f1 <<< "$now")" != "$(cut -f1 <<< "$2")" ]]
}

# One read of the copy into SCHEMA_OURS (load_ours): 0 loaded and consistent, 3 the copy moved
# (read again), 2 not read. Each client's stderr goes to a file of its own in <err-dir>, named in
# the order the steps run, so the first error line is the one that stopped it.
ours_try() { # err-dir
  local err="$1" listed now before after shares="$DIR/ours-shares" f i=0
  rm -rf "$shares"; mkdir -p "$shares"
  listed="$(ours_tables 2>"$err/1-list")" || { OURS_STOP="its tables could not be listed"; return 2; }
  if ! before="$(db_checksums 2>"$err/2-before")"; then
    ours_moved "$err" "$listed" && return 3
    OURS_STOP="its checksums could not be read"; return 2
  fi
  # The tables shared out by size among OURS_STREAMS dumps loaded side by side: one stream is one
  # client inserting row after row, and the server has more cores. Each dump is one transaction of
  # its own; what makes the copy one moment is the check after (the checksums before and after
  # match: nothing wrote while any of them read). A database with views, or tables not shared,
  # goes as one stream — every table it holds named all the same (a view's definition is written
  # after the tables it reads, which another stream may not have loaded yet).
  printf '%s\n' "$listed" | python3 -c 'import os, sys
out, k = sys.argv[1], int(sys.argv[2])
rows = [l.rstrip("\n").split("\t") for l in sys.stdin if l.strip()]
rows = [r for r in rows if len(r) == 3]
if any(r[1] != "BASE TABLE" for r in rows):
    k = 1
rows.sort(key=lambda r: -int(r[2]) if r[2].isdigit() else 0)
shares, weight = [[] for _ in range(max(1, min(k, len(rows))))], [0] * max(1, min(k, len(rows)))
for name, _, size in rows:
    i = weight.index(min(weight))
    shares[i].append(name)
    weight[i] += (int(size) if size.isdigit() else 0) + 1
for i, names in enumerate(shares):
    if names:
        open(os.path.join(out, str(i)), "w").write("".join(n + "\n" for n in names))' "$shares" "${OURS_STREAMS:-4}" \
    || { OURS_STOP="its tables could not be shared out"; return 2; }
  tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$SCHEMA_OURS\`; CREATE DATABASE \`$SCHEMA_OURS\` CHARACTER SET $CHARSET COLLATE $COLLATION" \
    2>"$err/3-create" || { OURS_STOP="its scratch schema could not be made"; return 2; }
  local pids=() pid failed=0 names one
  # 🔒 `--skip-add-locks`: the streams load side by side, so a table holding a foreign key can be
  # created by one stream while another has its parent under LOCK TABLES — and the parent's next
  # INSERT fails on a table it did not lock ("ERROR 1100 … was not locked with LOCK TABLES": every
  # sync of a site with AcyMailing could stop on it, dev, 26/10/2026). The locks only speed MyISAM.
  for f in "$shares"/*; do
    [[ -f "$f" ]] || continue
    names=()
    while IFS= read -r one; do names+=("$one"); done < "$f"
    ( ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db \
          mariadb-dump -uroot --single-transaction --quick --skip-add-locks --triggers --max-allowed-packet=256M "$DB" "${names[@]}" ) 2>"$err/4-dump-$i" \
        | tracy_db_exec mariadb -uroot --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$SCHEMA_OURS" 2>"$err/4-load-$i" ) & pids+=("$!")
    i=$((i + 1))
  done
  for pid in ${pids[@]+"${pids[@]}"}; do wait "$pid" || failed=1; done
  if [[ "$failed" != 0 ]]; then
    ours_moved "$err" "$listed" && return 3
    OURS_STOP="its dump or its load stopped"; return 2
  fi
  if ! after="$(db_checksums 2>"$err/5-after")"; then
    ours_moved "$err" "$listed" && return 3
    OURS_STOP="its checksums could not be read"; return 2
  fi
  now="$(ours_tables 2>"$err/6-list")" || { OURS_STOP="its tables could not be listed"; return 2; }
  # A table that came or went since the list: the scratch schema is not the copy of one moment.
  [[ "$(cut -f1 <<< "$now")" == "$(cut -f1 <<< "$listed")" ]] || return 3
  scratch_loaded "$SCHEMA_OURS" 2>"$err/7-loaded" || { OURS_STOP="its scratch schema holds no table"; return 2; }
  [[ "$before" == "$after" ]] || return 3
  OURS_CHECKSUMS="$after"
  rm -rf "$shares"
  tracy_db_triggers_sql "$SCHEMA_OURS" > "$DIR/ours-triggers.sql" 2>"$err/8-triggers" \
    || { OURS_STOP="its triggers could not be read"; return 2; }
  tracy_db_drop_triggers "$SCHEMA_OURS" >&2 2>>"$err/8-triggers" || { OURS_STOP="its triggers could not be dropped"; return 2; }
  return 0
}

# db_error_line <file…>: the first line the database's clients wrote to stderr that names an error
# (one with an error code first), as one line with no value of the site — a server's message quotes
# the row or the name it is about (`Duplicate entry '…' for key …`), so it is cut at its first quote
# as lib/live_sync.py `failure_line` cuts the engine's, and the error's code, when the cut took it,
# is put after it. The docker client's own warnings are not the database's word; nothing when no
# line names an error.
db_error_line() { # file…
  python3 - "$@" <<'PYEOF' 2>/dev/null || true
import re, sys
lines = []
for path in sys.argv[1:]:
    try:
        lines += open(path, encoding="utf-8", errors="replace").read().splitlines()
    except OSError:
        pass
lines = [re.sub(r"^==> \[\d+s\] ", "", l.strip()) for l in lines]
lines = [l for l in lines if l and not l.startswith("WARNING") and re.search(r"(?i)error|couldn't|stopped:", l)]
CODE = re.compile(r"(?:ERROR|Error|error:)\s+(\d{4})\b|\((\d{4})\)")
for line in [l for l in lines if CODE.search(l)] + lines:
    found = CODE.search(line)
    code = found and (found.group(1) or found.group(2))
    quote = re.search(r"(?<![A-Za-z])'|[\"`]", line)
    said = line[:quote.start()] + "'…'" if quote else line
    if code and code not in said:
        said += f" ({code})"
    print(said[:200])
    break
PYEOF
}

# ── the files ────────────────────────────────────────────────────────────────────────────────
# tree_of_archive <webroot.tar> <scratch name>: the tree object of a read of the live site, normalised
# and staged under the repo's own exclusions through an index of its own (the copy's index, worktree
# and exclusions are left as they were).
tree_of_archive() {
  local tar="$1" work="$DIR/tree-$2" index="$DIR/index-$2" tree
  rm -rf "$work" "$index"
  mkdir -p "$work"
  if [[ -d "$tar" ]]; then
    # Already a tree (live-pull's `tree/`, or a last read with its changes laid over): moved, not copied.
    rmdir "$work" && mv "$tar" "$work"
  else
    tar -xmf "$tar" -C "$work"
  fi
  [[ "$2" != live ]] || keep_large_files "$work"
  rm -rf "$work/installation"
  normalise_htaccess "$work"
  tracy_write_webroot_exclude "$REPO" "$work"
  (
    export GIT_INDEX_FILE="$index"
    git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$work" add -A -f
    tracy_unstage_webroot_junk "$REPO" "$work" >&2
  )
  tree="$(GIT_INDEX_FILE="$index" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" write-tree)"
  tracy_write_webroot_exclude "$REPO" "$WEBROOT"
  rm -rf "$work" "$index"
  printf '%s' "$tree"
}

# normalise_htaccess <tree>: the root .htaccess of a read as provision left the copy's: a WordPress
# site's force-HTTPS redirect commented out first (platform/wordpress.sh platform_configure), then
# the hardening block every clone gets.
normalise_htaccess() {
  if [[ "$(tracy_backup_platform)" == wordpress ]]; then tracy_neutralize_https_redirect "$1/.htaccess" >&2; fi
  tracy_ensure_webroot_htaccess "$1" >&2
}

# tree_of_changes: the tree of an incremental read (live-pull's `changes/` + `deleted.json`) without
# unpacking the last read: its tree read into an index of its own, this read's deletions taken out,
# and its changed files staged over it under tree_of_archive's own normalisation — the last read had
# it already. Unpacking the last read to lay a handful of files over it took 143 s of a 340 s sync
# on a 42 000-file site (22/10/2026).
tree_of_changes() { # [the read the changes are laid over: the last read by default]
  local changes="$DIR/live/changes" index="$DIR/index-live" tree over="${1:-$LIVE_REF}"
  rm -f "$index"
  mkdir -p "$changes"
  rm -rf "$changes/installation"
  # The root .htaccess is hardened as provision hardens the copy's — only when this read brought one.
  if [[ -f "$changes/.htaccess" ]]; then normalise_htaccess "$changes"; fi
  keep_large_files "$changes"
  tracy_write_webroot_exclude "$REPO" "$changes"
  (
    export GIT_INDEX_FILE="$index"
    local git_c=(git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$changes")
    "${git_c[@]}" read-tree "$over^{tree}"
    if python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])) else 1)' "$DIR/live/deleted.json"; then
      python3 -c 'import json,sys; sys.stdout.write("\0".join(json.load(open(sys.argv[1]))))' "$DIR/live/deleted.json" \
        | GIT_LITERAL_PATHSPECS=1 "${git_c[@]}" rm -r --cached --quiet --ignore-unmatch --pathspec-from-file=- --pathspec-file-nul
    fi
    # --ignore-removal: a file of the last read that is not among the changes stays as it was.
    "${git_c[@]}" add -f --ignore-removal -- .
    tracy_unstage_webroot_junk "$REPO" "$changes" >&2
  )
  tree="$(GIT_INDEX_FILE="$index" git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" write-tree)"
  tracy_write_webroot_exclude "$REPO" "$WEBROOT"
  rm -f "$index"
  printf '%s' "$tree"
}

# The live site's files over 50 MiB never enter the history (lib/webroot-excludes.sh), so the merge
# cannot see them. One the copy does not have is kept for `apply` to put in place; one the copy has
# with other bytes is named and left alone — with no base to compare, neither side can be called the
# change. D/large.json: {"copy": [paths], "differ": [paths]}.
keep_large_files() {
  python3 - "$1" "$WEBROOT" "$DIR/large" "$DIR/large.json" <<'PYEOF'
import filecmp, json, os, shutil, sys
tree, webroot, keep, out = sys.argv[1:5]
copy, differ = [], []
for base, dirs, files in os.walk(tree):
    for name in files:
        path = os.path.join(base, name)
        if os.path.islink(path) or os.path.getsize(path) <= 50 * 1024 * 1024:
            continue
        rel = os.path.relpath(path, tree)
        mine = os.path.join(webroot, rel)
        if not os.path.exists(mine):
            os.makedirs(os.path.dirname(os.path.join(keep, rel)), exist_ok=True)
            shutil.move(path, os.path.join(keep, rel))
            copy.append(rel)
        elif not filecmp.cmp(path, mine, shallow=False):
            differ.append(rel)
json.dump({"copy": sorted(copy), "differ": sorted(differ)}, open(out, "w"))
PYEOF
}

# Room for the work: the live webroot unpacked once, three scratch schemas and a point's dump. The
# compressed reads stand in for what they unpack to, at a margin, rather than unpacking to find out.
enough_disk() {
  # Both numbers in Python: mawk prints a byte count past 2^31 as 3.2e+10, which `-ge` cannot read
  # (every sync on a 32 GB-free stand was refused, 20/10/2026).
  python3 - "$DIR/live" "$DIR" <<'PYEOF'
import os, sys
def size(p):
    if os.path.isfile(p):
        return os.path.getsize(p)
    return sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(p) for f in fs if os.path.isfile(os.path.join(d, f))) if os.path.isdir(p) else 0
live = sys.argv[1]
web = max(size(live + "/tree"), size(live + "/webroot.tar"), size(live + "/changes"))
need = int(web * 1.2 + size(live + "/db.sql.gz") * 30 + (1 << 30))
st = os.statvfs(sys.argv[2])
free = st.f_bavail * st.f_frsize
if free < need:
    print(need, free)
    sys.exit(1)
PYEOF
}

# The webroot of this read as a tree on disk: the whole tree, the last read with this read's changes
# laid over it, or the tar — whichever the read left.
live_tree() {
  if [[ -d "$DIR/live/tree" ]]; then printf '%s' "$DIR/live/tree"; return; fi
  if [[ -f "$DIR/live/deleted.json" ]]; then
    local over="$DIR/live/over"
    rm -rf "$over"; mkdir -p "$over"
    g archive "$LIVE_REF" | tar -xmf - -C "$over"
    [[ -d "$DIR/live/changes" ]] && cp -a "$DIR/live/changes/." "$over/"
    python3 - "$over" "$DIR/live/deleted.json" <<'PYEOF'
import json, os, sys
root = os.path.realpath(sys.argv[1])
for rel in json.load(open(sys.argv[2])):
    path = os.path.realpath(os.path.join(root, rel))
    if path.startswith(root + os.sep) and os.path.isfile(path):
        os.remove(path)
PYEOF
    printf '%s' "$over"
    return
  fi
  printf '%s' "$DIR/live/webroot.tar"
}

has_live_read() {
  [[ -f "$DIR/live/db.sql.gz" ]] && { [[ -d "$DIR/live/tree" ]] || [[ -f "$DIR/live/deleted.json" ]] || [[ -f "$DIR/live/webroot.tar" ]] || [[ -f "$DIR/live/files-unchanged.json" ]] || [[ -n "$(theirs_of_last_merge)" ]]; }
}

# The live read's commit an earlier merge of this run made (D/merge.json `theirsCommit`), when it is
# still in the history: a merge again after COPY_CHANGED takes it as it is. Its tree was moved into
# the history by that merge (tree_of_archive), so asking for the read again answered NO_LIVE_READ.
theirs_of_last_merge() {
  [[ -f "$DIR/merge.json" ]] || return 0
  local sha
  sha="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("theirsCommit") or "")' "$DIR/merge.json" 2>/dev/null)"
  [[ -n "$sha" ]] && g cat-file -e "$sha^{commit}" 2>/dev/null && printf '%s' "$sha"
  return 0
}

commit_tree() { # tree message [parent]
  if [[ -n "${3:-}" ]]; then g commit-tree "$1" -p "$3" -m "$2"; else g commit-tree "$1" -m "$2"; fi
}

# ── merge ────────────────────────────────────────────────────────────────────────────────────
# load_reads <base dump> <base kind> <platform>: the two reads of the live site into scratch schemas
# (SCHEMA_BASE, SCHEMA_LIVE), normalised, as `merge` runs it in the background beside the copy's dump.
# A table both reads hold alike loads into neither (`same_tables`). It answers with its status only
# (its lines go to stderr like every step's): 0 loaded, 1 a load the server refused, 2 the base and
# 3 the live read not normalised.
load_reads() {
  local base_dump="$1" base_kind="$2" platform="$3"
  local alike="$DIR/same-tables.txt"
  same_tables "$base_dump" "$DIR/live/db.sql.gz" "$alike"
  if [[ -s "$alike" ]]; then
    echo "==> [${SECONDS}s] the live read: $(grep -c . "$alike") table(s) as the base holds them, loaded into neither" >&2
  fi
  # The two loads share nothing: side by side, as the server allows (9 s one after the other on
  # the stand, 22/10/2026). Each one's failure still stops the sync, once both have ended.
  local loads=() load failed=0
  load_schema "$SCHEMA_BASE" "$base_dump" "$alike" & loads+=("$!")
  load_schema "$SCHEMA_LIVE" "$DIR/live/db.sql.gz" "$alike" & loads+=("$!")
  for load in "${loads[@]}"; do wait "$load" || failed=1; done
  if [[ "$failed" == 0 && -s "$alike" && "$platform" == wordpress ]] && ! same_home; then
    echo "==> [${SECONDS}s] the live site's address moved between its reads: loading every table" >&2
    load_more "$SCHEMA_BASE" "$base_dump" "$alike" & loads=("$!")
    load_more "$SCHEMA_LIVE" "$DIR/live/db.sql.gz" "$alike" & loads+=("$!")
    for load in "${loads[@]}"; do wait "$load" || failed=1; done
  fi
  if [[ "$failed" != 0 ]] || ! scratch_loaded "$SCHEMA_BASE" "$SCHEMA_LIVE"; then return 1; fi
  if [[ "$base_kind" != built ]] && ! engine normalise --schema "$SCHEMA_BASE" --platform "$platform" --prefix "$PREFIX" >&2; then
    return 2
  fi
  engine normalise --schema "$SCHEMA_LIVE" --platform "$platform" --prefix "$PREFIX" >&2 || return 3
}

merge() {
  [[ -d "$REPO" ]] && g rev-parse --verify HEAD >/dev/null 2>&1 || { answer_refusal NO_HISTORY; return; }
  local platform
  platform="$(tracy_backup_platform)"
  [[ "$platform" == joomla || "$platform" == wordpress ]] || { answer_refusal SYNC_UNSUPPORTED_PLATFORM "$platform"; return; }
  has_live_read || { answer_refusal NO_LIVE_READ; return; }
  db_names
  [[ -n "$PREFIX" ]] || { answer_refusal NO_TABLE_PREFIX; return; }
  local short
  if ! short="$(enough_disk)"; then answer_refusal NO_DISK_SPACE "need ${short% *} bytes, ${short#* } free"; return; fi
  local stamp
  stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local previous="" theirs_commit
  previous="$(g rev-parse --verify --quiet "$LIVE_REF^{commit}" || true)"
  # 1. ours: the copy sealed (whatever was edited outside Tracy is in the history) and dumped.
  echo "==> [${SECONDS}s] the copy: sealing its files" >&2
  TRACY_WEBROOT_LOCK_HELD=1 bash "$HERE/webroot-git.sh" --label "$LABEL" --op seal-outside >&2
  local ours_commit
  ours_commit="$(g rev-parse HEAD)"
  # 3. base.
  local base_commit base_dump base_kind
  if [[ -n "$previous" && -f "$LIVE_BASE_DUMP" ]]; then
    base_commit="$previous" base_dump="$LIVE_BASE_DUMP" base_kind=last-sync
  elif [[ -f "$DIR/base/webroot.tar" && -f "$DIR/base/db.sql.gz" ]]; then
    base_commit="$(commit_tree "$(tree_of_archive "$DIR/base/webroot.tar" base)" "live: read at import")"
    base_dump="$DIR/base/db.sql.gz" base_kind=import
  elif g rev-parse --verify --quiet "refs/tags/tracy-baseline^{commit}" >/dev/null \
       && [[ -f "$(tracy_backup_dir)/v1.mysql.gz" ]]; then
    base_commit="$(g rev-parse "tracy-baseline^{commit}")" base_dump="$(tracy_backup_dir)/v1.mysql.gz" base_kind=built
  else
    answer_refusal NO_BASE "neither a last sync, an import archive nor an Initial backup with its database"
    return
  fi
  echo "==> [${SECONDS}s] base: $base_kind ($base_commit)" >&2

  # The two reads of the live site load into their scratch schemas beside the copy's dump: they share
  # nothing with it (a WordPress sync spent 10 s dumping the copy, then 9 s loading the reads, one after
  # the other; dev, 2026-10-27). `load_reads` prints no answer of its own: its status says how it ended.
  echo "==> [${SECONDS}s] the live read and its base: loading beside the copy's dump" >&2
  drop_scratch
  trap drop_scratch EXIT
  local reads
  load_reads "$base_dump" "$base_kind" "$platform" & reads=$!
  echo "==> [${SECONDS}s] the copy: dumping its database" >&2
  local loaded=0
  load_ours || loaded=$?
  if [[ "$loaded" != 0 ]]; then wait "$reads" 2>/dev/null || true; fi
  if [[ "$loaded" == 1 ]]; then answer_refusal COPY_BUSY "the copy's database kept changing"; return; fi
  if [[ "$loaded" != 0 ]]; then
    drop_scratch
    trap - EXIT
    # Why, as the server said it (load_ours LOAD_OURS_WHY): a disk full or read-only was only ever
    # one guess, and the stop on dev it once named was the copy moving under the read (24/10/2026).
    answer_refusal MERGE_FAILED "the copy's database could not be read into its scratch schema: ${LOAD_OURS_WHY:-the database server refused it}"
    return
  fi
  printf '%s\n' "$OURS_CHECKSUMS" > "$DIR/ours.checksums"
  # The copy's database as dumped, table by table, before the merge writes into it: a merge that
  # leaves every table and file as it was has nothing to put in place (`took_nothing`). Read beside
  # the file merge, which does not touch the database; waited for before the database merge.
  local loaded_sums
  rm -f "$DIR/ours-loaded.checksums"
  schema_checksums "$SCHEMA_OURS" > "$DIR/ours-loaded.checksums.tmp" & loaded_sums=$!

  # 2. theirs: the read of the live site, as a commit whose parent is the last read (if any).
  # A first read laid over the copy as built (`first_read_manifest`) names that commit in D/live-over.
  local over="$previous"
  [[ -n "$over" || ! -f "$DIR/live-over" ]] || over="$(g rev-parse --verify --quiet "$(cat "$DIR/live-over")^{commit}" || true)"
  if [[ -f "$DIR/live/deleted.json" && -z "$over" ]]; then wait "$reads" 2>/dev/null || true; answer_refusal NO_LIVE_READ "changes without a last read"; return; fi
  echo "==> [${SECONDS}s] the live read: its files as a tree" >&2
  local theirs_tree
  theirs_commit="$(theirs_of_last_merge)"
  if [[ -z "$theirs_commit" ]]; then
    # The live files did not move since the fingerprint compared with (live-pull's files-unchanged):
    # they are the last read's, or — no sync applied yet — the import's, which the copy was built from.
    if [[ -f "$DIR/live/files-unchanged.json" ]]; then
      if [[ -n "$previous" ]]; then theirs_tree="$(g rev-parse "$previous^{tree}")"
      else theirs_tree="$(g rev-parse "refs/tags/tracy-baseline^{tree}")"; fi
    elif [[ -f "$DIR/live/deleted.json" ]]; then theirs_tree="$(tree_of_changes "$over")"
    else theirs_tree="$(tree_of_archive "$(live_tree)" live)"; fi
    theirs_commit="$(commit_tree "$theirs_tree" "live: read $stamp" "$previous")"
  fi

  # 4. files.
  # An engine that stops answers in words, last: the job's reader takes the last JSON line it sees,
  # and a traceback leaves the normaliser's `{"ok": true, …}` as that line (20/10/2026).
  # A file "Sync to live" sent: the live site's version of it is the push's own (lib/live_sync.py merge_files).
  local PUSHED_FILES_ARG=()
  [[ ! -f "$PUSHED" ]] || PUSHED_FILES_ARG=(--pushed "$PUSHED")
  if ! engine files --repo "$REPO" --base "$base_commit" --ours "$ours_commit" --theirs "$theirs_commit" \
    --platform "$platform" --prefer ours ${DECISIONS:+--decisions "$DECISIONS"} \
    ${PUSHED_FILES_ARG[@]+"${PUSHED_FILES_ARG[@]}"} > "$DIR/files.json"; then
    wait "$reads" 2>/dev/null || true
    answer_refusal MERGE_FAILED "the file merge stopped$(engine_said "$DIR/files.json")"; return
  fi

  # 5. database: the reads' loads (started beside the copy's dump) waited for; then the merge.
  local said_reads=0
  wait "$reads" || said_reads=$?
  case "$said_reads" in
    0) ;;
    2) answer_refusal MERGE_FAILED "the base could not be normalised"; return ;;
    3) answer_refusal MERGE_FAILED "the live read could not be normalised"; return ;;
    *)
      echo "loading the three databases failed" >&2
      drop_scratch
      trap - EXIT
      answer_refusal MERGE_FAILED "$SCRATCH_REFUSED"
      return ;;
  esac
  if ! scratch_loaded "$SCHEMA_OURS"; then
    drop_scratch
    trap - EXIT
    answer_refusal MERGE_FAILED "$SCRATCH_REFUSED"
    return
  fi
  if wait "$loaded_sums" && [[ -s "$DIR/ours-loaded.checksums.tmp" ]]; then
    mv "$DIR/ours-loaded.checksums.tmp" "$DIR/ours-loaded.checksums"
  else
    rm -f "$DIR/ours-loaded.checksums.tmp"
  fi
  echo "==> [${SECONDS}s] merging the databases" >&2
  local PUSHED_ARG=()
  [[ ! -f "$PUSHED" ]] || PUSHED_ARG=(--pushed "$PUSHED")
  if ! engine db --base-schema "$SCHEMA_BASE" --ours-schema "$SCHEMA_OURS" --theirs-schema "$SCHEMA_LIVE" \
    --work-schema "$SCHEMA_WORK" --platform "$platform" --prefix "$PREFIX" --prefer ours --id-map "$ID_MAP" \
    ${PUSHED_ARG[@]+"${PUSHED_ARG[@]}"} ${DECISIONS:+--decisions "$DECISIONS"} > "$DIR/db.json"; then
    answer_refusal MERGE_FAILED "the database merge stopped$(engine_said "$DIR/db.json")"; return
  fi

  finish_merge "$ours_commit" "$theirs_commit" "$base_kind" "$stamp"
}

# 6. conflicts, or the result as a backup point — of the merge just made, or of the one a held sync
# kept (`resume_held`): the merged database is in SCHEMA_OURS, its triggers aside, and the merge's
# answers in D/files.json and D/db.json.
finish_merge() { # ours_commit theirs_commit base_kind stamp
  local ours_commit="$1" theirs_commit="$2" base_kind="$3" stamp="$4"
  local conflicts
  # Held (lib/live_sync.py `prefer_ours`): new records of the live site the merge cannot keep beside
  # the copy's. Nothing is made until a person says to go on without them (TRACY_SYNC_ALLOW_HELD=1).
  conflicts="$(python3 -c 'import json,sys
f, d = (json.load(open(p)) for p in sys.argv[1:3])
held = 0 if sys.argv[3] == "1" else len(d.get("held", []))
print(len(f["conflicts"]) + len(d["conflicts"]) + held)' "$DIR/files.json" "$DIR/db.json" "${TRACY_SYNC_ALLOW_HELD:-0}")"
  local version="" point="null" merged_commit="" nothing=""
  if [[ "$conflicts" == 0 ]] && took_nothing "$ours_commit"; then
    # The copy already holds everything the live read brings: no point, no Restore everything. Made
    # anyway, each press on a WordPress site whose cron moved two tables added a "Synced from live"
    # backup and put back the copy's own rows as they were at the dump (dev, 26/10/2026).
    echo "==> [${SECONDS}s] the merge leaves the copy as it is: nothing to put in place" >&2
    nothing=1
  elif [[ "$conflicts" == 0 ]]; then
    echo "==> [${SECONDS}s] making the backup point of the result" >&2
    tracy_db_load_triggers "$SCHEMA_OURS" "$DIR/ours-triggers.sql" >&2
    # The point's database as it will be put in place: what a cut-off apply is recognised by. Read
    # while the point is dumped: both only read the schema, and nothing writes it any more.
    local sums
    schema_checksums "$SCHEMA_OURS" > "$DIR/point.checksums" & sums=$!
    local tree
    tree="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tree"])' "$DIR/files.json")"
    merged_commit="$(commit_tree "$tree" "sync: from live, read $stamp" "$ours_commit")"
    point="$(bash "$HERE/webroot-backup.sh" --label "$LABEL" --op create-from --commit "$merged_commit" \
              --schema "$SCHEMA_OURS" --title "Synced from live ($stamp)" \
              ${BY_EMAIL:+--by-email "$BY_EMAIL" --by-name "${BY_NAME:-$BY_EMAIL}"} | tail -1)"
    wait "$sums" || true
    version="$(python3 -c 'import json,sys; p=json.loads(sys.argv[1]); print(p["version"] if p.get("ok") else "")' "$point")"
    [[ -n "$version" ]] || { answer_refusal POINT_FAILED "$point"; return; }
  elif python3 -c 'import json,sys
f, d = (json.load(open(p)) for p in sys.argv[1:3])
sys.exit(0 if not f["conflicts"] and not d["conflicts"] and d.get("held") else 1)' "$DIR/files.json" "$DIR/db.json" \
       && [[ "$OP" == sync ]]; then
    keep_held "$ours_commit" "$theirs_commit" "$base_kind" "$stamp"
  fi
  drop_scratch
  trap - EXIT

  local recovered=""
  [[ ! -f "$DIR/recovered" ]] || recovered="$(cat "$DIR/recovered")"
  TRACY_SYNC_REUSED="$REUSED" python3 - "$DIR" "$ours_commit" "$theirs_commit" "$base_kind" "$stamp" "$version" "$point" "$recovered" "$merged_commit" "$nothing" <<'PYEOF'
import json, os, sys
d, ours, theirs, base_kind, stamp, version, point, recovered, merged, nothing = sys.argv[1:11]
files = json.load(open(os.path.join(d, "files.json")))
db = json.load(open(os.path.join(d, "db.json")))
conflicts = files["conflicts"] + db["conflicts"]
large_path = os.path.join(d, "large.json")
large = json.load(open(large_path)) if os.path.exists(large_path) else {"copy": [], "differ": []}
state = {"oursCommit": ours, "theirsCommit": theirs, "mergedCommit": merged or None, "baseKind": base_kind, "liveReadAt": stamp,
         "version": int(version) if version else None, "rebuild": db["rebuild"], "largeFiles": large}
json.dump(state, open(os.path.join(d, "merge.json"), "w"))
held = db.get("held", [])
print(json.dumps({"ok": True, "state": "nothing" if nothing else "ready" if version else ("needs_attention" if held else "needs_resolution"), **state,
                  "conflicts": conflicts, "held": held, "kept": files.get("kept", []) + db.get("kept", []),
                  "renumbered": db.get("renumbered", []),
                  # The live site's rows the merge left out without a clash (a log row both sites
                  # wrote under one number), named: `database.skipped` alone named nothing (#1648).
                  "skipped": db.get("skipped", []),
                  "files": files["counts"], "database": db["counts"],
                  "tables": db["tables"], "point": json.loads(point),
                  # A sync a restart cut off, settled before this one (`recover_apply`).
                  **({"recovered": recovered} if recovered else {}),
                  # A Sync anyway that took the held sync's read (and merge): `resume_held`.
                  **({"reused": os.environ["TRACY_SYNC_REUSED"]} if os.environ.get("TRACY_SYNC_REUSED") else {})},
                 ensure_ascii=False))
PYEOF
}

# Whether the merge in SCHEMA_OURS and D/files.json leaves the copy exactly as it was dumped: the
# merged tree is the copy's, every table's checksum is the one it had before the merge wrote into
# it (`merge`, D/ours-loaded.checksums), and no live file over 50 MiB waits to be copied in.
took_nothing() { # ours_commit
  [[ -s "$DIR/ours-loaded.checksums" ]] || return 1
  python3 -c 'import json,os,sys
f = json.load(open(os.path.join(sys.argv[1], "files.json")))
p = os.path.join(sys.argv[1], "large.json")
large = json.load(open(p)) if os.path.exists(p) else {}
sys.exit(0 if f.get("tree") and not large.get("copy") else 1)' "$DIR" || return 1
  [[ "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tree"])' "$DIR/files.json")" == "$(g rev-parse "$1^{tree}")" ]] || return 1
  [[ "$(schema_checksums "$SCHEMA_OURS")" == "$(cat "$DIR/ours-loaded.checksums")" ]]
}

# ── Sync anyway: the read and the merge a held sync kept (#1649) ─────────────────────────────
# A sync held for a person (new live records the merge cannot keep beside the copy's) used to keep
# nothing: the person's "Sync anyway" read the live site and merged everything again — 29 minutes
# on a 290 MB site, for the answer the held sync had already worked out. It now keeps its read and
# its merged database (D/merged.sql.gz, D/held.json) in its run folder, and the Sync anyway that
# names it (TRACY_SYNC_RESUME_DIR, tracy-host) takes them, on evidence only:
#   the live site     its fingerprint asked again (live-pull's check, nothing read) is the one the
#                     held read took first → the read is taken; else the live site is read again
#   the copy, the base  its history and database checksums as the held merge read them, the last
#                     sync's read and id map as it merged against them → the merge is taken: the
#                     backup point is made from it at once; else merged again, on the read taken
# The held run lives as long as any run folder (a day, `sweep_runs`) and goes with the Sync anyway
# that names it, whether it took it or not.
RESUME_DIR="${TRACY_SYNC_RESUME_DIR:-}"
REUSED=""

# What finish_merge keeps of a held merge: the merged database (its triggers already aside) and what
# a Sync anyway checks before it takes it.
keep_held() { # ours_commit theirs_commit base_kind stamp
  echo "==> [${SECONDS}s] keeping the read and the merge for Sync anyway" >&2
  if ! ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db \
           mariadb-dump -uroot --skip-triggers --max-allowed-packet=256M "$SCHEMA_OURS" ) | gzip -1 > "$DIR/merged.sql.gz.tmp"; then
    rm -f "$DIR/merged.sql.gz.tmp"
    return 0
  fi
  mv "$DIR/merged.sql.gz.tmp" "$DIR/merged.sql.gz"
  python3 - "$DIR/held.json" "$1" "$2" "$3" "$4" "$(g rev-parse --verify --quiet "$LIVE_REF^{commit}" || true)" "$ID_MAP" <<'PYEOF'
import hashlib, json, os, sys
out, ours, theirs, base_kind, stamp, live_ref, id_map = sys.argv[1:8]
json.dump({"oursCommit": ours, "theirsCommit": theirs, "baseKind": base_kind, "liveReadAt": stamp, "liveRef": live_ref,
           "idMap": hashlib.sha1(open(id_map, "rb").read()).hexdigest() if os.path.exists(id_map) else ""},
          open(out, "w"))
PYEOF
}

# What a held run keeps for a Sync anyway (the rest goes as `tidy` takes it).
tidy_held() { rm -rf "$DIR/base" "$DIR/ours.sql.gz" "$DIR"/tree-* "$DIR"/index-* "$DIR/check"; }

# Before the live site is read, without a lock: the held sync's run, when it is a whole one of this
# site's, is asked about the live site; its read becomes this run's when the live site did not move.
# The held run goes either way.
take_held_read() {
  [[ -n "$RESUME_DIR" && "${TRACY_SYNC_ALLOW_HELD:-0}" == 1 ]] || return 0
  local runs held
  runs="$(dirname "$DIR")"
  [[ "$(basename "$runs")" == runs && -d "$RESUME_DIR" && "$(cd "$RESUME_DIR/.." && pwd -P)" == "$(cd "$runs" && pwd -P)" ]] || return 0
  held="$(cd "$RESUME_DIR" && pwd -P)"
  [[ "$held" != "$(cd "$DIR" && pwd -P)" ]] || return 0
  local check=""
  if [[ -f "$held/held.json" && -f "$held/merged.sql.gz" && -f "$held/merge.json" && -f "$held/live/db.sql.gz" \
        && -f "$held/live/fingerprint.json" && -n "${TRACY_SYNC_ENDPOINT:-}" ]]; then
    echo "==> [${SECONDS}s] the held sync's read: asking the live site whether it moved since" >&2
    check="$(TRACY_SYNC_CHECK_ONLY=1 TRACY_SYNC_FINGERPRINT_IN="$held/live/fingerprint.json" TRACY_SYNC_MANIFEST_IN="" \
               TRACY_SYNC_DB_BASE="" node "$LIB_DIR/live-pull.mjs" "$DIR/check" | tail -1)" || check=""
    rm -rf "$DIR/check"
  fi
  if python3 -c 'import json,sys; sys.exit(0 if json.loads(sys.argv[1] or "{}").get("unchanged") == "fingerprint" else 1)' "$check" 2>/dev/null; then
    local entry
    for entry in "$held"/* "$held"/.[!.]*; do
      [[ -e "$entry" ]] || continue
      # What tracy-host wrote for this run stays this run's.
      case "$(basename "$entry")" in decisions.json|base-fingerprint.json) continue ;; esac
      mv "$entry" "$DIR/"
    done
    REUSED=read
  else
    echo "==> [${SECONDS}s] the live site moved since the held sync, or cannot say: reading it again" >&2
  fi
  rm -rf "$held"
}

# Under the locks, before a merge: the held merge, when nothing it merged moved since — the copy
# (sealed, then its history and database checksums), the last sync's read and its id map. Its
# database is loaded back and finish_merge makes the point at once. Prints nothing when it cannot,
# and the caller merges again (on the read taken).
resume_held() {
  [[ "$REUSED" == read && -f "$DIR/held.json" && -f "$DIR/merged.sql.gz" ]] || return 0
  db_names
  local ours theirs base_kind stamp live_ref id_map
  read -r ours theirs base_kind stamp live_ref id_map < <(python3 -c 'import json,sys
h = json.load(open(sys.argv[1]))
print(h["oursCommit"], h["theirsCommit"], h["baseKind"], h["liveReadAt"], h.get("liveRef") or "-", h.get("idMap") or "-")' "$DIR/held.json")
  echo "==> [${SECONDS}s] the held sync's merge: checking the copy did not move since" >&2
  TRACY_WEBROOT_LOCK_HELD=1 bash "$HERE/webroot-git.sh" --label "$LABEL" --op seal-outside >&2
  local why=""
  if [[ "$(g rev-parse HEAD)" != "$ours" ]]; then why="its files"
  elif [[ "$(db_checksums)" != "$(cat "$DIR/ours.checksums" 2>/dev/null)" ]]; then why="its database"
  elif [[ "$(g rev-parse --verify --quiet "$LIVE_REF^{commit}" || echo -)" != "$live_ref" ]]; then why="the last sync's read"
  elif [[ "$(python3 -c 'import hashlib,os,sys; p=sys.argv[1]; print(hashlib.sha1(open(p,"rb").read()).hexdigest() if os.path.exists(p) else "-")' "$ID_MAP")" != "$id_map" ]]; then why="the id map"
  elif ! g cat-file -e "$theirs^{commit}" 2>/dev/null \
       || ! g cat-file -e "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tree"])' "$DIR/files.json")^{tree}" 2>/dev/null; then
    why="the history"
  fi
  if [[ -n "$why" ]]; then
    echo "==> [${SECONDS}s] the copy moved since the held sync ($why): merging again on its read" >&2
    return 0
  fi
  drop_scratch
  trap drop_scratch EXIT
  # Checked by hand, as `load_schema`: a held merge that cannot be loaded back is merged again.
  if ! tracy_db_exec mariadb -uroot -e "CREATE DATABASE \`$SCHEMA_OURS\` CHARACTER SET $CHARSET COLLATE $COLLATION" \
     || ! gzip -dc "$DIR/merged.sql.gz" | tracy_db_exec mariadb -uroot --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$SCHEMA_OURS" \
     || ! scratch_loaded "$SCHEMA_OURS"; then
    echo "==> [${SECONDS}s] the held sync's merge could not be loaded back: merging again on its read" >&2
    drop_scratch
    trap - EXIT
    return 0
  fi
  REUSED=read-and-merge
  finish_merge "$ours" "$theirs" "$base_kind" "$stamp"
}

# ── apply ────────────────────────────────────────────────────────────────────────────────────
apply() {
  [[ -f "$DIR/merge.json" ]] || { answer_refusal NOT_MERGED; return; }
  db_names
  local ours_commit theirs_commit version rebuild merged_commit
  read -r ours_commit theirs_commit version rebuild merged_commit < <(python3 -c 'import json,sys
m = json.load(open(sys.argv[1]))
pre = sys.argv[2]
names = ",".join(t[len(pre):] if t.startswith(pre) else t for t in m.get("rebuild", []))
print(m["oursCommit"], m["theirsCommit"], m["version"] or "-", names or "-", m.get("mergedCommit") or "-")' "$DIR/merge.json" "$PREFIX")
  [[ "$version" != - ]] || { answer_refusal NOT_READY "the merge left conflicts"; return; }

  # The copy must be what `merge` read: nothing sealed since (files) and the same checksums (database).
  # The database's two readings — its substance, and every table's checksum that marks the apply
  # (`mark_applying`) — are taken while the files are sealed: neither writes, and one after the
  # other they were most of the wait before the restore.
  local subst="$DIR/apply-substance" sums="$DIR/apply-sums" ps pc
  db_checksums > "$subst" & ps=$!
  schema_checksums "$DB" > "$sums" & pc=$!
  TRACY_WEBROOT_LOCK_HELD=1 bash "$HERE/webroot-git.sh" --label "$LABEL" --op seal-outside >&2
  local subst_ok=1
  wait "$ps" || subst_ok=0
  wait "$pc" || true
  APPLY_OURS_DB="$(cat "$sums")"
  rm -f "$sums"
  if [[ "$(g rev-parse HEAD)" != "$ours_commit" ]]; then rm -f "$subst"; answer_refusal COPY_CHANGED files; return; fi
  if [[ "$subst_ok" != 1 || "$(cat "$subst")" != "$(cat "$DIR/ours.checksums")" ]]; then
    rm -f "$subst"; answer_refusal COPY_CHANGED database; return
  fi
  rm -f "$subst"

  local restored ok after="{}"
  [[ "$merged_commit" != - && -f "$DIR/point.checksums" ]] || { answer_refusal NOT_MERGED "merged by an older script: merge again"; return; }
  mark_applying restoring "$version" "$ours_commit" "$theirs_commit" "$rebuild" "$merged_commit"
  test_kill_at restoring
  # Only the tables whose checksum differs between the point and the copy are loaded and swapped:
  # the others are the point's already (David 23/10/2026: a sync that changed a handful of tables
  # loaded and swapped all 93). The session table is in neither list, so a person signed in to the
  # copy stays signed in. Without both lists, the whole point, as before.
  local only=()
  if python3 - "$APPLYING" "$DIR/point.checksums" > "$DIR/only-tables.txt" <<'PYEOF'
import json, sys
parse = lambda text: dict(l.split("\t", 1) for l in text.splitlines() if "\t" in l)
ours = parse(json.load(open(sys.argv[1])).get("oursDb", ""))
point = parse(open(sys.argv[2]).read())
if not ours or not point:
    sys.exit(1)
print("\n".join(sorted(t for t in set(ours) | set(point) if ours.get(t) != point.get(t))))
PYEOF
  then
    only=(--only-tables "$DIR/only-tables.txt")
    echo "==> [${SECONDS}s] $(grep -c . "$DIR/only-tables.txt" || true) table(s) differ from the point" >&2
  fi
  echo "==> [${SECONDS}s] putting the result in place (Restore everything to v$version)" >&2
  restored="$(bash "$HERE/webroot-backup.sh" --label "$LABEL" --op restore-everything --version "$version" ${only[@]+"${only[@]}"} \
               ${BY_EMAIL:+--by-email "$BY_EMAIL" --by-name "${BY_NAME:-$BY_EMAIL}"} | tail -1)"
  ok="$(python3 -c 'import json,sys; print("1" if json.loads(sys.argv[1]).get("ok") else "")' "$restored")"
  if [[ -n "$ok" ]]; then
    test_kill_at restored
    # In place: from here a cut-off run is finished by the next one, never undone.
    mark_applying finishing "$version" "$ours_commit" "$theirs_commit" "$rebuild" "$merged_commit"
    test_kill_at finishing
    remember_read "$theirs_commit"
    echo "==> [${SECONDS}s] restored; what Joomla must redo" >&2
    after="$(after_apply "$rebuild")"
    test_kill_at after
  fi
  # Done, or refused by Restore everything with the copy put back as it was: nothing to recover.
  rm -f "$APPLYING"
  python3 -c 'import json,sys
r = json.loads(sys.argv[1])
print(json.dumps({"ok": bool(r.get("ok")), "version": int(sys.argv[2]), "restore": r, "after": json.loads(sys.argv[3])}))' \
    "$restored" "$version" "$after"
}

# The read a sync put in place becomes the next one's base: its commit, the database it read, the
# numbers the merge gave, the files' sha1s and the fingerprint (from $DIR, the run that read it).
remember_read() { # theirs_commit
  g update-ref "$LIVE_REF" "$1"
  ( umask 077; mkdir -p "$SYNC_DIR" )
  python3 -c 'import json,sys; json.dump(json.load(open(sys.argv[1])).get("idMap", {}), open(sys.argv[2], "w"))' \
    "$DIR/db.json" "$ID_MAP.tmp" && chmod 600 "$ID_MAP.tmp" && mv "$ID_MAP.tmp" "$ID_MAP"
  cp "$DIR/live/db.sql.gz" "$LIVE_BASE_DUMP.tmp" && chmod 600 "$LIVE_BASE_DUMP.tmp" && mv "$LIVE_BASE_DUMP.tmp" "$LIVE_BASE_DUMP"
  # Where each table's gzip member lies in it (live-pull.mjs `writeDump`): the next read takes an
  # unmoved table's bytes as they are. And each big table's range checksums (`writeRanges`): the next
  # read of a moved one asks only for the ranges that moved. A read written without one leaves none.
  local beside
  for beside in index.json ranges.json; do
    if [[ -f "$DIR/live/db.sql.gz.$beside" ]]; then
      cp "$DIR/live/db.sql.gz.$beside" "$LIVE_BASE_DUMP.$beside.tmp" && chmod 600 "$LIVE_BASE_DUMP.$beside.tmp" \
        && mv "$LIVE_BASE_DUMP.$beside.tmp" "$LIVE_BASE_DUMP.$beside"
    else
      rm -f "$LIVE_BASE_DUMP.$beside"
    fi
  done
  # The read in place holds what a push wrote: the next base needs no word about it.
  rm -f "$PUSHED"
  remember_kept
  # The files' sha1s as this read found them: the next read takes only what moved since.
  if [[ -f "$DIR/live/manifest.json" ]]; then
    cp "$DIR/live/manifest.json" "$SYNC_DIR/live-manifest.json.tmp" && chmod 600 "$SYNC_DIR/live-manifest.json.tmp" \
      && mv "$SYNC_DIR/live-manifest.json.tmp" "$SYNC_DIR/live-manifest.json"
  elif [[ -f "$DIR/live/files-unchanged.json" ]]; then
    # The files were not read: the last read's manifest still describes them. With none yet (no
    # sync since the import read a file), the listing this read took names them by the blobs of
    # the tree it merged as the live site's (lib/live_sync.py `stat-manifest`).
    if [[ ! -f "$SYNC_DIR/live-manifest.json" && -f "$DIR/live/stat.json" ]]; then
      python3 "$LIB_DIR/live_sync.py" stat-manifest --repo "$REPO" --rev "$1" --stat "$DIR/live/stat.json" \
        > "$SYNC_DIR/live-manifest.json.tmp" && chmod 600 "$SYNC_DIR/live-manifest.json.tmp" \
        && mv "$SYNC_DIR/live-manifest.json.tmp" "$SYNC_DIR/live-manifest.json"
    fi
  else
    rm -f "$SYNC_DIR/live-manifest.json"
  fi
  keep_fingerprint
}


# The places this run's merge kept (D/db.json `kept`) join the ones kept before, by name only.
# The file merge's (D/files.json) too: a file, or a setting of the configuration file, both sides
# changed — "Sync to live" never sends the copy's there (lib/live_push.py `mark_kept`).
remember_kept() {
  [[ -f "$DIR/db.json" || -f "$DIR/files.json" ]] || return 0
  python3 - "$DIR/db.json" "$KEPT" "$DIR/files.json" <<'PYEOF' || true
import json, os, sys
said, out, files = sys.argv[1:4]
kept = json.load(open(out)) if os.path.exists(out) else []
seen = {k.get("id") for k in kept}
for path in (said, files):
    if not os.path.exists(path):
        continue
    for k in json.load(open(path)).get("kept", []) or []:
        if k.get("id") in seen:
            continue
        if k.get("kind") in ("column", "row"):
            kept.append({n: k[n] for n in ("id", "kind", "table", "column", "key", "reason") if n in k})
        elif k.get("kind") in ("file", "setting"):
            # Names only, never a value: a setting's three values stay out of the file.
            kept.append({n: k[n] for n in ("id", "kind", "path", "setting", "reason") if n in k})
        else:
            continue
        seen.add(k.get("id"))
tmp = out + ".tmp"
json.dump(kept[-5000:], open(tmp, "w"), ensure_ascii=False)
os.chmod(tmp, 0o600)
os.replace(tmp, out)
PYEOF
}

# ── an apply a restart cut off (#1563) ───────────────────────────────────────────────────────
# This script runs as a child of tracy-host, and a deploy that replaces tracy-host kills it wherever
# it is. Before `apply` that leaves nothing on the copy: the merge works on scratch schemas (dropped
# by the next merge) and in its own run folder, and the locks are flocks that die with it. From
# Restore everything on, it can leave the copy half done — its files put in place and its database
# not — or done with the next sync's base still the read before (the next merge would then meet the
# customer's renumbered records again and copy them twice).
#
# APPLYING marks that stretch with what the apply set out to do: the copy's commit and database as
# the merge read them, and the point's commit and database it was putting in place. The next merge,
# apply or sync settles it FIRST — under the locks, before the run folders are swept, before the
# live site is read — and only on evidence:
#   restoring   Nothing of the point reached the copy → the marker goes, the copy is left as it is
#               (whatever was done on it since stays). The point's files and/or database reached it
#               and NOTHING else changed it → back to the "Before restore" point Restore everything
#               made first: the copy as the sync found it, the base as it was. Anything else changed
#               it since (an agent's edit, a push, a commit) → nothing is written: the owner is told
#               the earlier sync was cut off and that "Before restore" is in Backups
#               (APPLY_INTERRUPTED_KEPT), once.
#   finishing   The point is in place: what the run did not get to — the base, then what Joomla must
#               redo — is done from the run's folder (large files only where the copy still has none).
# Never a sync run again: the owner presses Sync, and that press starts from a whole copy.
APPLYING="$SYNC_DIR/applying.json"

# Every table's checksum in `schema`, one `table<TAB>checksum` per line, sorted, without the schema's
# name (a point's scratch schema and the site's compare). The session table is left out: a visit to
# the copy writes it, and it says nothing about what a sync put there.
schema_checksums() { # schema
  local tables listing
  tables="$(tracy_db_tables "$1")"
  listing="$(printf '%s\n' "$tables" | sed -n "s/.*/\`$1\`.\`&\`/p" | paste -sd, -)"
  [[ -n "$listing" ]] || return 0
  tracy_db_exec mariadb -uroot -N -B -e "CHECKSUM TABLE $listing" | python3 -c 'import sys
rows = sorted(l.rstrip("\n").split("\t", 1)[0].split(".", 1)[-1] + "\t" + l.rstrip("\n").split("\t", 1)[1]
              for l in sys.stdin if "\t" in l)
print("\n".join(r for r in rows if not r.split("\t")[0].endswith("session")))'
}

APPLY_OURS_DB=""
mark_applying() { # stage version ours theirs rebuild merged
  ( umask 077; mkdir -p "$SYNC_DIR" )
  local ours_db=""
  # `apply` read it already, beside the seal.
  if [[ "$1" == restoring ]]; then ours_db="${APPLY_OURS_DB:-$(schema_checksums "$DB")}"; fi
  python3 - "$APPLYING.tmp" "$DIR" "$ours_db" "$@" <<'PYEOF'
import json, os, sys, time
out, run, ours_db, stage, version, ours, theirs, rebuild, merged = sys.argv[1:10]
old = json.load(open(out[:-4])) if stage != "restoring" and os.path.exists(out[:-4]) else {}
point = os.path.join(run, "point.checksums")
json.dump({**old, "stage": stage, "dir": run, "version": int(version), "oursCommit": ours, "theirsCommit": theirs,
           "mergedCommit": merged, "rebuild": rebuild,
           "oursDb": old.get("oursDb", ours_db), "pointDb": open(point).read().strip(),
           "startedAt": old.get("startedAt", int(time.time()))}, open(out, "w"))
PYEOF
  mv "$APPLYING.tmp" "$APPLYING"
}

# The test suite's way to stop this run where a restart could (TRACY_TEST_KILL_AT=<point>), as
# webroot-backup.sh's TRACY_TEST_FAIL_AFTER_SWAP: the whole process group, as a container stop does,
# so no trap or cleanup runs.
test_kill_at() { [[ "${TRACY_TEST_KILL_AT:-}" != "$1" ]] || kill -KILL 0; }

# The "Before restore" point Restore everything made for the restore to `version`: the newest one
# above it. Empty when the restore never got that far.
before_restore_point() { # version
  bash "$HERE/webroot-backup.sh" --label "$LABEL" --op list | tail -1 | python3 -c 'import json,sys
v = int(sys.argv[1])
found = [p["version"] for p in json.load(sys.stdin).get("backups", [])
         if p.get("version", 0) > v and p.get("title") == f"Before restore to Backup {v}"]
print(max(found) if found else "")' "$1"
}

# Whether the database was swapped since `epoch`: a swap moves the live tables into
# `<db>_tracy_trash_<epoch>` (webroot-backup.sh restore_mysql).
swapped_since() { # epoch
  tracy_db_exec mariadb -uroot -N -B -e "SELECT schema_name FROM information_schema.schemata" \
    | python3 -c 'import sys
trash, since = sys.argv[1] + "_tracy_trash_", int(sys.argv[2])
stamps = [l.strip()[len(trash):] for l in sys.stdin if l.startswith(trash)]
sys.exit(0 if any(t.isdigit() and int(t) >= since for t in stamps) else 1)' "$DB" "$1"
}

# What the cut-off restore left in the files, read without writing anything (no seal):
#   ours      the copy's commit, nothing changed on the worktree
#   edited    the copy's commit, and changes none of which is the point's: someone else's, not the sync's
#   partial   the copy's commit, and changes every one of which is the point's (the reset cut mid-write)
#   target    one commit on top of the copy's holding the point's tree (the reset ran to its end), clean
#   foreign   anything else: the point's writes mixed with others', or more commits
files_state() { # ours merged
  local head
  # The exclusions as a seal writes them (the repo's info/exclude only): a large file the sync
  # copied is no one's edit.
  tracy_write_webroot_exclude "$REPO" "$WEBROOT" >&2
  head="$(g rev-parse HEAD)"
  if [[ "$head" != "$1" ]]; then
    if [[ "$(g rev-parse "$head^" 2>/dev/null)" == "$1" && "$(g rev-parse "$head^{tree}")" == "$(g rev-parse "$2^{tree}")" \
          && -z "$(g --no-optional-locks status --porcelain --untracked-files=all)" ]]; then
      echo target
    else
      echo foreign
    fi
    return
  fi
  local entry path mine theirs point=0 other=0
  while IFS= read -r -d '' entry; do
    path="${entry:3}"
    if [[ -e "$WEBROOT/$path" || -L "$WEBROOT/$path" ]]; then mine="$(g hash-object --no-filters -- "$WEBROOT/$path" 2>/dev/null || echo -)"; else mine=none; fi
    theirs="$(g rev-parse -q --verify "$2:$path" 2>/dev/null || echo none)"
    if [[ "$mine" == "$theirs" ]]; then point=$((point + 1)); else other=$((other + 1)); fi
  done < <(g --no-optional-locks status --porcelain -z --untracked-files=all --no-renames)
  if (( point == 0 && other == 0 )); then echo ours
  elif (( point == 0 )); then echo edited
  elif (( other == 0 )); then echo partial
  else echo foreign; fi
}

# Settle a cut-off apply (see the head of this section). Silent when it settled it — `$DIR/recovered`
# says how, for the merge's answer; one JSON line on stdout when it stopped instead.
recover_apply() {
  [[ -f "$APPLYING" ]] || return 0
  local stage run version ours theirs rebuild merged started
  read -r stage run version ours theirs rebuild merged started < <(python3 -c 'import json,sys
a = json.load(open(sys.argv[1]))
print(a["stage"], a["dir"], a["version"], a["oursCommit"], a["theirsCommit"], a.get("rebuild") or "-",
      a.get("mergedCommit") or "-", a["startedAt"])' "$APPLYING")
  db_names
  local how
  if [[ "$stage" == finishing ]]; then
    echo "==> [${SECONDS}s] the last sync was cut off once in place: finishing it from its run" >&2
    if [[ ! -f "$run/db.json" || ! -f "$run/live/db.sql.gz" ]]; then
      answer_refusal APPLY_RECOVERY_FAILED "the cut-off sync's run folder is gone"; return 1
    fi
    # The base is the host's, not the copy's: kept whatever the copy did since.
    ( DIR="$run"; remember_read "$theirs" )
    # What is left touches the copy: only when nothing changed it since the point was put in place —
    # its files the point's (one restore commit on the copy's, or the same tree for a database-only
    # sync), nothing on the worktree, its database the point's.
    local files db point_db
    files="$(files_state "$ours" "$merged")"
    db="$(schema_checksums "$DB")"
    point_db="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pointDb", ""))' "$APPLYING")"
    local seen
    seen="files $files, database $([[ "$db" == "$point_db" ]] && echo "the point's" || echo moved)"
    echo "==> [${SECONDS}s] $seen" >&2
    if ! { [[ "$files" == target || ( "$files" == ours && "$(g rev-parse "$ours^{tree}")" == "$(g rev-parse "$merged^{tree}")" ) ]] \
           && [[ -n "$point_db" && "$db" == "$point_db" ]]; }; then
      mv "$APPLYING" "$SYNC_DIR/applying.kept-$(date +%s).json"
      answer_refusal APPLY_INTERRUPTED_KEPT "Before restore to Backup $version ($seen)"; return 1
    fi
    ( DIR="$run"; after_apply "$rebuild" >/dev/null )
    how=finished
  else
    local files db swapped=0 point_db ours_db
    files="$(files_state "$ours" "$merged")"
    swapped_since "$started" && swapped=1
    ours_db="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("oursDb", ""))' "$APPLYING")"
    point_db="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pointDb", ""))' "$APPLYING")"
    db="$(schema_checksums "$DB")"
    echo "==> [${SECONDS}s] the last sync was cut off while it was put in place: files $files, database swapped $swapped" >&2
    if [[ "$files" =~ ^(ours|edited)$ && "$swapped" == 0 ]]; then
      # Nothing of the point reached the copy: Restore everything stopped before its files.
      how=untouched
    elif [[ "$files" =~ ^(ours|partial|target)$ && -n "$ours_db" && -n "$point_db" ]] \
         && { [[ "$swapped" == 1 && "$db" == "$point_db" ]] || [[ "$swapped" == 0 && "$db" == "$ours_db" ]]; }; then
      local before back
      before="$(before_restore_point "$version")"
      [[ -n "$before" ]] || { answer_refusal APPLY_RECOVERY_FAILED "no Before restore point"; return 1; }
      echo "==> [${SECONDS}s] only the sync wrote there: the copy back to Backup $before" >&2
      # A reset cut mid-write left git's index lock behind: this run's, the marker says so.
      if [[ "$files" == partial && -f "$REPO/index.lock" ]] \
         && [[ "$(python3 -c 'import os,sys; print(int(os.stat(sys.argv[1]).st_mtime >= int(sys.argv[2])))' "$REPO/index.lock" "$started")" == 1 ]]; then
        rm -f "$REPO/index.lock"
      fi
      back="$(bash "$HERE/webroot-backup.sh" --label "$LABEL" --op restore-everything --version "$before" \
                ${BY_EMAIL:+--by-email "$BY_EMAIL" --by-name "${BY_NAME:-$BY_EMAIL}"} | tail -1)"
      if ! python3 -c 'import json,sys; sys.exit(0 if json.loads(sys.argv[1]).get("ok") else 1)' "$back"; then
        answer_refusal APPLY_RECOVERY_FAILED "$back"; return 1
      fi
      how=rolled-back
    else
      # The copy changed after the cut as well: nothing is written. Said once — the marker is kept
      # aside, not in the way of the next press.
      mv "$APPLYING" "$SYNC_DIR/applying.kept-$(date +%s).json"
      answer_refusal APPLY_INTERRUPTED_KEPT "Before restore to Backup $version"; return 1
    fi
  fi
  rm -f "$APPLYING"
  printf '%s' "$how" > "$DIR/recovered"
  # The cut-off run's read of the live site goes now, not a day later (`tidy`).
  if [[ "$(basename "$(dirname "$run")")" == runs && "$run" != "$DIR" ]]; then rm -rf "$run"; fi
}

# Before anything else of a merge, apply or sync: a cut-off apply settled under the locks, which are
# let go again before the live site is read (a subshell). 1 when it stopped, its answer printed.
recover_first() {
  [[ -f "$APPLYING" ]] || return 0
  local said
  said="$( (run_heavy webroot_locked recover_apply) | tail -1)"
  if [[ -n "$said" ]]; then printf '%s\n' "$said"; return 1; fi
}

# What the merged point cannot carry, done once it is in place. Each step says how it went and none
# undoes the sync: the site works without them, it only reads less right (a menu tree Joomla has not
# rebuilt, a new article the agent cannot address yet, a cached page).
after_apply() { # rebuild names, or "-"
  local large=0 out said rebuild_said="none" cache_said="skipped" identity_said="skipped"
  if [[ -d "$DIR/large" ]]; then
    # Each file once: `large.done` names every one already put in place, written right after its
    # copy — a run a restart cut off is finished from here, and what it had copied and someone
    # deleted or changed since stays so. Never over a file the copy has: the merge kept only those it
    # lacked (`keep_large_files`), so one there now was put there by someone since.
    touch "$DIR/large.done"
    python3 - "$DIR/large" "$DIR/large.done" "$WEBROOT" > "$DIR/large.list" <<'PYEOF'
import os, sys
large, done, webroot = sys.argv[1:4]
copied = set(open(done, "rb").read().split(b"\0"))
for base, _, files in os.walk(large):
    for name in files:
        rel = os.path.relpath(os.path.join(base, name), large)
        if os.fsencode(rel) in copied or os.path.lexists(os.path.join(webroot, rel)):
            continue
        sys.stdout.buffer.write(os.fsencode(rel) + b"\0")
PYEOF
    tracy_webroot_new_dirs "$WEBROOT" < "$DIR/large.list" > "$DIR/large.dirs"
    while IFS= read -r -d '' f; do
      mkdir -p "$WEBROOT/$(dirname "$f")"; cp -p "$DIR/large/$f" "$WEBROOT/$f"
      printf '%s\0' "$f" >> "$DIR/large.done"
      test_kill_at large-copied
    done < "$DIR/large.list"
    # The read's files are root's: given to the webroot's owner, with the folders made for them.
    cat "$DIR/large.list" "$DIR/large.dirs" | tracy_webroot_own "$WEBROOT"
    large="$(tr -cd '\0' < "$DIR/large.list" | wc -c | tr -d ' ')"
    rm -f "$DIR/large.list" "$DIR/large.dirs"
  fi
  # An extension the live site installed since the last read comes without the folder its walker
  # skipped (Akeeba's output folder, #1650): made here, and given to the webroot's owner.
  tracy_webroot_restore_skipped_dirs "$WEBROOT" | tracy_webroot_own "$WEBROOT"
  local platform after_php
  platform="$(tracy_backup_platform)"
  # WordPress's one script does both halves: its counters and caches, then the content uids
  # (sync-wordpress-after.php); Joomla's are two.
  after_php="$HERE/sync-$platform-after.php"
  if out="$(web_php "$after_php" "TRACY_SYNC_REBUILD=${1#-}" 2>&1)"; then
    said="$(printf '%s\n' "$out" | sed -n 's/^TRACY_RESULT \(rebuild=.*\)$/\1/p' | tail -1)"
    rebuild_said="$(printf '%s' "$said" | sed -n 's/.*rebuild=\([^ ]*\).*/\1/p')"
    cache_said="$(printf '%s' "$said" | sed -n 's/.*cache=\([^ ]*\).*/\1/p')"
  else
    rebuild_said="failed" cache_said="failed"
    printf '%s\n' "$out" >&2
  fi
  if [[ "$platform" == wordpress ]]; then
    identity_said="$(printf '%s\n' "$out" | sed -n 's/^TRACY_RESULT content_reader=\([a-z]*\).*/\1/p' | tail -1)"
  elif out="$(web_php "$HERE/../provision/joomla-content-identity.php" 2>&1)"; then
    identity_said="$(printf '%s\n' "$out" | sed -n 's/^TRACY_RESULT content_reader=\([a-z]*\).*/\1/p' | tail -1)"
  else
    identity_said="failed"
    printf '%s\n' "$out" >&2
  fi
  python3 -c 'import json,sys
large, rebuild, cache, identity = sys.argv[1:5]
print(json.dumps({"largeFilesCopied": int(large), "rebuild": rebuild or "none", "cache": cache or "unknown",
                  "contentIdentity": identity or "unknown"}))' "$large" "$rebuild_said" "$cache_said" "$identity_said"
}

# merge, then apply at once; a copy that moved in between is merged once more.
sync_op() {
  local merged applied state code try
  for try in 1 2; do
    merged=""
    # A Sync anyway that took a held sync's read: its merge too, when nothing it merged moved.
    [[ "$try" != 1 ]] || merged="$(resume_held | tail -1)"
    [[ -n "$merged" ]] || merged="$(merge | tail -1)"
    state="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("state", ""))' "$merged")"
    if [[ "$state" == nothing ]]; then
      # Nothing to put in place: the read becomes the next sync's base, as an applied one's does, and
      # the answer is the live site's "nothing new" — the copy did not change (no last-write stamp).
      remember_read "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["theirsCommit"])' "$merged")"
      python3 -c 'import json,sys
m = json.loads(sys.argv[1])
print(json.dumps({**m, "state": "applied", "unchanged": "merge"}, ensure_ascii=False))' "$merged"
      return
    fi
    if [[ "$state" != ready ]]; then printf '%s\n' "$merged"; return; fi
    applied="$(apply | tail -1)"
    code="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("code", ""))' "$applied")"
    [[ "$code" == COPY_CHANGED && "$try" == 1 ]] || break
    echo "==> [${SECONDS}s] the copy moved between merge and apply; merging again" >&2
  done
  python3 -c 'import json,sys
m, a = json.loads(sys.argv[1]), json.loads(sys.argv[2])
print(json.dumps({**m, "state": "applied" if a.get("ok") else m["state"], "apply": a}, ensure_ascii=False))' "$merged" "$applied"
}

copy_token() {
  db_names
  local token="${TRACY_COPY_COWORK_TOKEN:-}" rows
  # The length apart from the pattern: a bound over 255 is past RE_DUP_MAX of BSD regex (macOS),
  # where `{20,512}` matched nothing at all.
  [[ ${#token} -ge 20 && ${#token} -le 512 && "$token" =~ ^[A-Za-z0-9_.-]+$ ]] || { answer_refusal REFUSED_TOKEN; return; }
  [[ -n "$PREFIX" ]] || { answer_refusal NO_TABLE_PREFIX; return; }
  # The same statements as provision.sh step 4b, per platform.
  local statement
  if [[ "$(tracy_backup_platform)" == wordpress ]]; then
    statement="UPDATE \`${PREFIX}options\` SET option_value='$token' WHERE option_name='claude_cowork_token'; SELECT ROW_COUNT();"
  else
    statement="UPDATE \`${PREFIX}extensions\` SET params = JSON_SET(IF(JSON_VALID(params), params, '{}'), '\$.token', '$token') WHERE element='com_claudecowork'; SELECT ROW_COUNT();"
  fi
  rows="$(tracy_db_exec mariadb -uroot -N -B "$DB" -e "$statement" | tail -1)"
  if [[ "${rows:-0}" -ge 1 ]] 2>/dev/null; then echo '{"ok":true}'; else answer_refusal NO_COMPONENT_ROW; fi
}

forget() {
  rm -f "$LIVE_BASE_DUMP" "$LIVE_BASE_DUMP.index.json" "$LIVE_BASE_DUMP.ranges.json" "$SYNC_DIR/live-manifest.json" "$LIVE_FINGERPRINT" "$KEPT"
  g update-ref -d "$LIVE_REF" 2>/dev/null || true
  # Every run's folder but this job's own; a sync that began meanwhile reads before it locks, and
  # its folder is newer than a day — the sweep's age (`sweep_runs`) is what leaves it.
  local run
  for run in "$SYNC_DIR/runs"/*; do
    [[ -d "$run" && "$(cd "$run" && pwd -P)" != "$(cd "$DIR" && pwd -P)" && -n "$(find "$run" -maxdepth 0 -mmin +60)" ]] && rm -rf "$run"
  done
  echo '{"ok":true,"forgotten":true}'
}

# The live site's read and the import archive, before any lock (see the head of this file).
read_live() {
  if ! has_live_read && [[ -n "${TRACY_SYNC_ENDPOINT:-}" ]]; then
    local pulled manifest="" fingerprint="" base_dump=""
    echo "==> [${SECONDS}s] reading the live site" >&2
    # Only what moved since the last read, when there is one to lay it over — and nothing at all
    # when the live site's fingerprint, or the read itself, shows it did not move since.
    # The fingerprint and the database of the last applied read stand on their own: a sync that found
    # no file moved keeps no manifest, and the read after it once lost both and took the whole site
    # again (436 s on the customer's site, 22/10/2026).
    if g rev-parse --verify --quiet "$LIVE_REF^{commit}" >/dev/null; then
      [[ -f "$SYNC_DIR/live-manifest.json" ]] && manifest="$SYNC_DIR/live-manifest.json"
      [[ -f "$LIVE_FINGERPRINT" ]] && fingerprint="$LIVE_FINGERPRINT"
      [[ -f "$LIVE_BASE_DUMP" ]] && base_dump="$LIVE_BASE_DUMP"
    elif [[ -f "$DIR/base-fingerprint.json" ]]; then
      # No sync applied yet: the fingerprint the import took (tracy-host writes it beside the run, from
      # tracy-web's record of the import). A first sync of a live site that did not move stops here.
      fingerprint="$DIR/base-fingerprint.json"
    fi
    if [[ -z "$manifest" ]] && first_read_manifest; then manifest="$DIR/first-manifest.json"; fi
    # WordPress rewrites its transients, WP-Cron, sessions and auto-drafts on every visit: rows the
    # comparison of two reads leaves out (lib/live_sync_wordpress.py `volatile_rows`), with the
    # column that names a row (`row-names`: a read that kept changing says which rows). On both
    # platforms, the tables the merge never takes (lib/live_sync.py `never-taken`: Tracy's own, the
    # ignored ones, under the copy's own table prefix): kept from the last read, never read again.
    local volatile_rows='{}' row_names='{}' ignored_tables='{}'
    [[ -n "$DB" ]] || DB="$(tracy_backup_db_name)"
    ignored_tables="$(python3 "$LIB_DIR/live_sync.py" never-taken --platform "$(tracy_backup_platform)" --prefix "$(site_prefix)")" \
      || ignored_tables='{}'
    if [[ "$(tracy_backup_platform)" == wordpress ]]; then
      volatile_rows="$(python3 "$LIB_DIR/live_sync_wordpress.py" volatile-rows)"
      row_names="$(python3 "$LIB_DIR/live_sync_wordpress.py" row-names)"
    fi
    pulled="$(TRACY_SYNC_MANIFEST_IN="$manifest" TRACY_SYNC_FINGERPRINT_IN="$fingerprint" TRACY_SYNC_DB_BASE="$base_dump" \
      TRACY_SYNC_VOLATILE_ROWS="$volatile_rows" TRACY_SYNC_ROW_NAMES="$row_names" TRACY_SYNC_IGNORED_TABLES="$ignored_tables" \
      node "$LIB_DIR/live-pull.mjs" "$DIR" | tail -1)"
    if ! python3 -c 'import json,sys; sys.exit(0 if json.loads(sys.argv[1]).get("ok") else 1)' "$pulled"; then
      rm -rf "$DIR/live"
      # A live site that kept changing while it was read was reached and read: it is not a door that
      # failed, and the owner is told to try again when it is quiet (#1564). Every other end of the
      # read is LIVE_READ_FAILED; the read's own answer goes along under `read`.
      # What kept changing in the job's output too (live-pull's `moved`: tables, row names, file
      # paths — never a value): the dialog and support see which part of the live site moved.
      python3 -c 'import json,sys
a = json.loads(sys.argv[1])
if a.get("code") == "LIVE_BUSY": print("!! the live site kept changing: " + str(a.get("detail") or "")[:300], file=sys.stderr)
print(json.dumps({"ok": False, "code": "LIVE_BUSY" if a.get("code") == "LIVE_BUSY" else "LIVE_READ_FAILED", "read": a}))' "$pulled"
      return 1
    fi
    printf '%s\n' "$pulled" > "$DIR/live-read.json"
    # The read's end and its own timing in the job's output as they happen (tracy-host keeps both as
    # the sync's progress, tracy-web `timingOf`): the answer above goes to a file, and a slow read was
    # not told from a slow merge (#1649). Only the timing: the read's answer holds no value of the site.
    python3 -c 'import json,sys
r = json.loads(sys.argv[1])
print(json.dumps({"ok": True, "liveReadAt": r.get("liveReadAt"), **{k: r[k] for k in ("mode", "unchanged", "seconds", "timing") if k in r}}))' "$pulled" >&2
    echo "==> [${SECONDS}s] the live site read" >&2
    # The read took only what differs from the copy as built: its changes are laid over that commit.
    if [[ "$manifest" == "$DIR/first-manifest.json" && -f "$DIR/live/deleted.json" ]]; then
      g rev-parse "refs/tags/tracy-baseline^{commit}" > "$DIR/live-over"
    fi
    rm -f "$DIR/first-manifest.json"
  fi
  if [[ ! -f "$DIR/base/db.sql.gz" && -n "${TRACY_SYNC_BASE_WEBROOT_URL:-}" && -n "${TRACY_SYNC_BASE_DB_URL:-}" ]]; then
    ( umask 077; mkdir -p "$DIR/base" )
    # Addresses on stdin, never argv (`ps`): curl's --config reads them from there.
    if ! printf 'url = "%s"\noutput = "%s"\n' "$TRACY_SYNC_BASE_WEBROOT_URL" "$DIR/base/webroot.tar" | curl -fsS --config - \
       || ! printf 'url = "%s"\noutput = "%s"\n' "$TRACY_SYNC_BASE_DB_URL" "$DIR/base/db.sql.gz" | curl -fsS --config -; then
      # Without the import archive the base falls back to the site as built; not a failure.
      echo "!! the import archive could not be fetched — the site as built is the base" >&2
      rm -rf "$DIR/base"
    fi
  fi
}

# A first read of a WordPress live site (no sync applied yet): the files of the copy as built
# (`tracy-baseline`, and the large files beside it in the webroot) as a manifest of their sha1s, so
# the read takes only the files that differ from the import, one by one — the Claude Cowork engine
# for WordPress packs no part inline (claude-cowork `files.pack` wants a signed URL), which a whole
# first read of the tree needs. D/first-manifest.json; 1 when there is none to make.
first_read_manifest() {
  [[ "$(tracy_backup_platform)" == wordpress ]] || return 1
  g rev-parse --verify --quiet "refs/tags/tracy-baseline^{commit}" >/dev/null || return 1
  python3 "$LIB_DIR/live_sync_wordpress.py" first-manifest --repo "$REPO" --rev "refs/tags/tracy-baseline" \
    --webroot "$WEBROOT" > "$DIR/first-manifest.json.tmp" || { rm -f "$DIR/first-manifest.json.tmp"; return 1; }
  chmod 600 "$DIR/first-manifest.json.tmp" && mv "$DIR/first-manifest.json.tmp" "$DIR/first-manifest.json"
}

# The fingerprint this read took first becomes the one the next read compares with; a read without
# one (an older engine) leaves none, so the next read never stops on a stale one.
keep_fingerprint() {
  if [[ -f "$DIR/live/fingerprint.json" ]]; then
    ( umask 077; mkdir -p "$SYNC_DIR" )
    cp "$DIR/live/fingerprint.json" "$LIVE_FINGERPRINT.tmp" && chmod 600 "$LIVE_FINGERPRINT.tmp" \
      && mv "$LIVE_FINGERPRINT.tmp" "$LIVE_FINGERPRINT"
  else
    rm -f "$LIVE_FINGERPRINT"
  fi
}

# The live site did not move since the last applied read (live-pull's `unchanged`): the copy already
# holds everything it has, so there is nothing to merge and nothing to put in place — answered as an
# applied sync that brought nothing, without a lock, a backup point or a restore. The kept fingerprint
# stays the one of the last applied read: it is that read's tables the next read reuses, and a noise
# table (a log) that moved since is read then.
answer_unchanged() {
  python3 - "$DIR/live-read.json" <<'PYEOF'
import json, sys
read = json.load(open(sys.argv[1]))
print(json.dumps({"ok": True, "state": "applied", "unchanged": read.get("unchanged"),
                  "liveReadAt": read.get("liveReadAt"), "read": read,
                  "conflicts": [], "held": [], "kept": [], "renumbered": [],
                  "files": {"fromTheirs": 0, "merged": 0, "tracyOwned": 0},
                  "database": {"tablesFromTheirs": 0, "rowsFromTheirs": 0, "rowsDeleted": 0, "rowsMerged": 0}}))
PYEOF
}
live_unchanged() {
  [[ -f "$DIR/live-read.json" ]] && python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("unchanged") else 1)' "$DIR/live-read.json"
}

# What a finished sync leaves behind: the answers, not the site's bytes. The live read is the
# customer's whole database (users, orders): once applied, its one kept copy is the next base;
# otherwise none (a refused sync used to keep a 564 MB read with the database for a day, 20/10/2026).
tidy() { rm -rf "$DIR/live" "$DIR/large" "$DIR/base" "$DIR"/load-* "$DIR/ours.sql.gz" "$DIR/ours-triggers.sql" "$DIR/ours-shares" "$DIR"/tree-* "$DIR"/index-* "$DIR/merged.sql.gz" "$DIR/held.json"; }

# The folders of syncs older than a day — failed, abandoned, or never applied — hold the same
# reads; none is merged again after that long (the live site has moved on). Swept at every start.
sweep_runs() {
  local runs
  runs="$(dirname "$DIR")"
  [[ "$(basename "$runs")" == runs ]] || return 0
  # Never the run a cut-off apply still needs (`recover_first` left its marker: it said why).
  local pending=""
  [[ ! -f "$APPLYING" ]] || pending="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("dir", ""))' "$APPLYING" 2>/dev/null || true)"
  find "$runs" -mindepth 1 -maxdepth 1 -type d -mmin +1440 ! -path "$DIR" ${pending:+! -path "$pending"} -exec rm -rf {} + 2>/dev/null || true
}

case "$OP" in merge|apply|sync) recover_first || exit 0 ;; esac
sweep_runs
case "$OP" in
  merge)
    read_live || exit 0
    if live_unchanged; then answer_unchanged; tidy; exit 0; fi
    answer="$(run_heavy webroot_locked merge | tail -1)"
    # Only a ready merge is applied from this folder; any other end keeps none of the live read.
    [[ "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("state", ""))' "$answer")" == ready ]] || tidy
    printf '%s\n' "$answer" ;;
  apply) run_heavy webroot_locked apply ;;
  copy-token) webroot_locked copy_token ;;
  forget) webroot_locked forget ;;
  sync)
    take_held_read
    read_live || exit 0
    if live_unchanged; then answer_unchanged; tidy; exit 0; fi
    answer="$(run_heavy webroot_locked sync_op | tail -1)"
    # Whatever the end — applied, refused, failed — the live read goes: a press after a failed sync
    # reads the live site again. A held one keeps its read and merge for the Sync anyway that names
    # it (`keep_held`); any other press finds them swept within a day.
    if [[ -f "$DIR/held.json" ]] && [[ "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("state", ""))' "$answer")" == needs_attention ]]; then
      tidy_held
    else
      tidy
    fi
    printf '%s\n' "$answer" ;;
  *) echo "unknown op: $OP" >&2; exit 2 ;;
esac
