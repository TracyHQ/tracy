#!/usr/bin/env bash
#
# A site's database half of a backup (ADR 0024): dump it beside the site, prove it later, put it back.
#
# Sourced by webroot/webroot-backup.sh, never executed. Needs LABEL and STACK (the site's private
# dir, `tracy_private_dir`) set by the caller.
#
#   WordPress / Joomla   `mariadb-dump --single-transaction` run in the site's own `db` container
#                        through `docker compose exec -T db` (the socket tracy-host holds; the agent's
#                        dsh never reaches `<label>-db-1`), gzip → backups/v<N>.mysql.gz
#   EmDash               SQLite online backup API on data/data.db (never the raw file: the WAL is
#                        open) → backups/v<N>.sqlite.gz, plus uploads/ → backups/v<N>.uploads.tar.gz.
#                        Template code (the `<label>_app` volume) is NOT in it — said, not hidden.
#
# Where: `<private dir>/backups/`, 0700, files 0600 — outside the webroot (Apache cannot serve it),
# next to the webroot repo the tag lives in, and removed with the site by teardown.sh (`rm -rf` of
# the private dir). Same disk as the site: this is a restore point, not protection against losing
# the machine (ADR 0024 sub-decision 3).
#
# What proves a point holds a database is the TAG, not the software version: the tag message ends
# with trailers written by this host only —
#
#   Tracy-Database: sha256:<hex> size:<bytes> kind:<mysql|sqlite> tables:<n>
#   Tracy-Uploads: sha256:<hex> size:<bytes>          (EmDash)
#   Tracy-Backup: pre-restore                          (the automatic "Before restore" point)
#
# and the file it names must still be there with that hash. Nothing here prints a dump's bytes: logs
# carry sizes and hashes only.

: "${TRACY_BACKUP_KEEP:=20}"          # dumps of points a person made
: "${TRACY_BACKUP_KEEP_AUTO:=5}"      # dumps of automatic points (Before restore, Sync from live)
: "${TRACY_BACKUP_TRASH_HOURS:=24}"   # how long the tables/files a restore replaced are kept
: "${TRACY_SNAP_KEEP_DAYS:=7}"        # how long a `db.snapshot` tag stays in the copy's database
: "${TRACY_SNAP_KEEP_NEWEST:=1}"      # the newest tags kept whatever their age (lib/copy_snapshots.py)

tracy_backup_dir() { printf '%s/backups' "$STACK"; }

# `KEY=value` from the site's .env, or empty.
_tracy_env_value() {
  sed -n "s/^$1=//p" "$STACK/.env" 2>/dev/null | sed -n 1p | sed -e 's/^"//' -e 's/"$//'
}

# Which CMS the stack is, as provision wrote it down; the webroot as a fallback for old sites.
tracy_backup_platform() {
  local platform
  platform="$(_tracy_env_value PLATFORM)"
  if [ -z "$platform" ] && [ -n "${WEBROOT:-}" ]; then platform="$(tracy_webroot_platform "$WEBROOT")"; fi
  printf '%s' "$platform"
}

# `mysql`, `sqlite`, or `none` (nothing this host knows how to back up).
tracy_backup_kind() {
  case "$(tracy_backup_platform)" in
    wordpress|joomla) [ -n "$(_tracy_env_value DB_PASSWORD)" ] && { echo mysql; return; } ;;
    emdash) [ -f "$STACK/data/data.db" ] && { echo sqlite; return; } ;;
  esac
  echo none
}

tracy_backup_db_name() {
  case "$(tracy_backup_platform)" in
    wordpress) echo wordpress ;;
    joomla) echo joomla ;;
  esac
}

# One command in the site's database container. The password travels in the container's
# environment (MYSQL_PWD), never in an argv anybody can read with `ps`.
tracy_db_exec() {
  ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db "$@" )
}

# tracy_db_load_dump <schema> <dump.gz> <work dir> [skip file]: a live read (live-pull.mjs's dump) into
# an empty <schema>, its tables shared out by size among TRACY_LOAD_STREAMS (4) loads side by side
# (lib/dump_sections.py split, each table's part in a file of its own under <work dir>), the tables
# named in <skip file> left out. One load as before for a dump that cannot load that way (views,
# routines, LOCK TABLES). A WordPress live read took 9–10 s to load in one stream (dev, 27/10/2026).
tracy_db_load_dump() {
  local schema="$1" dump="$2" work="$3" skip="${4:-}" plan said=0 group failed=0 pid
  local pids=()
  rm -rf "$work"
  mkdir -p "$work"
  plan="$(gzip -dc "$dump" | python3 "$LIB_DIR/dump_sections.py" split --streams "${TRACY_LOAD_STREAMS:-4}"             --out "$work" ${skip:+--skip "$skip"})" || said=$?
  if [[ "$said" == 0 ]]; then
    while IFS= read -r group; do
      [[ -n "$group" ]] || continue
      # The paths are this function's own (digits under <work dir>): split on spaces on purpose.
      # shellcheck disable=SC2086
      ( cat $group | tracy_db_exec mariadb -uroot --max-allowed-packet=256M \
          --init-command="SET FOREIGN_KEY_CHECKS=0" "$schema" ) & pids+=("$!")
    done <<< "$plan"
    for pid in ${pids[@]+"${pids[@]}"}; do wait "$pid" || failed=1; done
    rm -rf "$work"
    return "$failed"
  fi
  rm -rf "$work"
  [[ "$said" == 3 ]] || return 1
  if [[ -s "$skip" ]]; then
    gzip -dc "$dump" | python3 "$LIB_DIR/dump_sections.py" cut --skip "$skip" \
      | tracy_db_exec mariadb -uroot --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$schema"
  else
    gzip -dc "$dump" | tracy_db_exec mariadb -uroot --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$schema"
  fi
}

# Base tables of a schema, one per line — the copies `db.snapshot` keeps (`_tracy_snap_*`) left out:
# they are copies, and dumping them doubles the dump.
tracy_db_tables() {
  tracy_db_exec mariadb -uroot -N -B -e \
    "SELECT table_name FROM information_schema.tables WHERE table_schema='$1' AND table_type='BASE TABLE' AND table_name NOT LIKE '\\_tracy\\_snap\\_%' ORDER BY table_name"
}

# ── triggers ────────────────────────────────────────────────────────────────────────────────
# MariaDB refuses to RENAME a table that has triggers into another schema ("ERROR 1435 Trigger in
# wrong schema" — QA-I10, 02/10: a Joomla extension's triggers made every Restore everything of
# that site fail at the swap). So the swap moves tables bare: the triggers of both schemas are
# written out as loadable SQL first, dropped, the tables renamed, and the right set loaded back.

# The triggers of schema $1 as SQL `mariadb` can load (DELIMITER, DEFINER and sql_mode kept).
tracy_db_triggers_sql() {
  ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db \
      mariadb-dump -uroot --skip-opt --no-data --no-create-info --no-create-db --triggers --skip-comments "$1" )
}

# Drop every trigger of schema $1.
tracy_db_drop_triggers() {
  local names sql="" t
  names="$(tracy_db_exec mariadb -uroot -N -B -e \
    "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema='$1'")" || return 1
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    sql="$sql DROP TRIGGER \`$1\`.\`$t\`;"
  done <<< "$names"
  [ -z "$sql" ] || tracy_db_exec mariadb -uroot -e "$sql"
}

# The triggers of the tables named after schema $1 (none named: none), as tracy_db_triggers_sql.
tracy_db_triggers_sql_of() {
  local schema="$1"; shift
  [ "$#" -gt 0 ] || return 0
  ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db \
      mariadb-dump -uroot --skip-opt --no-data --no-create-info --no-create-db --triggers --skip-comments "$schema" "$@" )
}

# Drop the triggers of the tables named after schema $1, and only theirs.
tracy_db_drop_triggers_of() {
  local schema="$1" names sql="" t list=""
  shift
  [ "$#" -gt 0 ] || return 0
  for t in "$@"; do list="$list${list:+,}'$t'"; done
  names="$(tracy_db_exec mariadb -uroot -N -B -e \
    "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema='$schema' AND event_object_table IN ($list)")" || return 1
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    sql="$sql DROP TRIGGER \`$schema\`.\`$t\`;"
  done <<< "$names"
  [ -z "$sql" ] || tracy_db_exec mariadb -uroot -e "$sql"
}

# Load trigger SQL (file $2) into schema $1.
tracy_db_load_triggers() {
  tracy_db_exec mariadb -uroot "$1" < "$2"
}

_TRACY_BACKUP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# SQLite work on an EmDash database: `backup <src> <dst>` or `check <file>`, the table count as the
# last line of stdout (lib/sqlite-tool.mjs). node:sqlite first: the host's python3 may link an
# SQLite older than the one EmDash writes with, and then cannot even parse the site's schema
# (QA-I01, 02/10: Debian's 3.40 against EmDash's 3.53 — every EmDash Initial backup stood without
# its database). python3 only where this node has no node:sqlite backup.
_tracy_sqlite() {
  if node --no-warnings -e 'process.exit(typeof require("node:sqlite").backup === "function" ? 0 : 1)' 2>/dev/null; then
    node --no-warnings "$_TRACY_BACKUP_LIB/sqlite-tool.mjs" "$@"
    return
  fi
  python3 - "$@" <<'PYEOF'
import sqlite3, sys
op, *args = sys.argv[1:]
def check(path):
    c = sqlite3.connect(path)
    ok = c.execute("pragma integrity_check").fetchone()[0]
    if ok != "ok":
        raise SystemExit(f"integrity_check: {ok}")
    n = c.execute("select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'").fetchone()[0]
    c.close()
    return n
if op == "backup":
    # The online backup API: a consistent copy while EmDash keeps writing (WAL included), never
    # the raw file.
    s = sqlite3.connect(f"file:{args[0]}?mode=ro", uri=True, timeout=30)
    d = sqlite3.connect(args[1])
    s.backup(d)
    s.close()
    d.close()
    print(check(args[1]))
elif op == "check":
    print(check(args[0]))
else:
    raise SystemExit("usage: backup <src> <dst> | check <file>")
PYEOF
}

_tracy_sha256() { python3 -c 'import hashlib,sys; h=hashlib.sha256(); f=open(sys.argv[1],"rb"); [h.update(b) for b in iter(lambda: f.read(1<<20), b"")]; print(h.hexdigest())' "$1"; }
_tracy_size() { python3 -c 'import os,sys; print(os.path.getsize(sys.argv[1]))' "$1"; }

# ── dump ─────────────────────────────────────────────────────────────────────────────────────
# tracy_backup_dump <version>
# Writes the version's files and sets BK_TRAILERS (the lines for the tag) and BK_JSON (what the job
# answers). Returns non-zero with BK_ERROR set when the database could not be dumped; nothing half
# written is left behind. BK_KIND=none (no database on this stack) is success with no trailer.
BK_TRAILERS="" BK_JSON="null" BK_ERROR="" BK_KIND=""
tracy_backup_dump() {
  local version="$1" dir kind
  BK_TRAILERS="" BK_JSON="null" BK_ERROR=""
  kind="$(tracy_backup_kind)"
  BK_KIND="$kind"
  [ "$kind" != none ] || return 0
  dir="$(tracy_backup_dir)"
  ( umask 077; mkdir -p "$dir" ) && chmod 700 "$dir" || { BK_ERROR="cannot create $dir"; return 1; }
  if [ "$kind" = mysql ]; then _tracy_dump_mysql "$version" "$dir"; else _tracy_dump_sqlite "$version" "$dir"; fi
}

_tracy_dump_mysql() {
  local version="$1" dir="$2" db tmp tables=() ignore=() line n
  # TRACY_BACKUP_SCHEMA: a scratch schema beside the site's own (`webroot-backup.sh --op create-from`).
  db="${TRACY_BACKUP_SCHEMA:-$(tracy_backup_db_name)}"
  tmp="$dir/.v$version.mysql.gz.tmp"
  local all err
  # The names from stdout only: a line the docker CLI writes on stderr ("WARNING: Error loading config
  # file", where its config cannot be read) counted as a table, and every restore of the point then
  # refused ("the dump loaded 2 tables, the backup recorded 3"). Stderr is kept for the error.
  err="$(mktemp "/tmp/backup-tables-$LABEL.XXXXXX")"
  if ! all="$(tracy_db_exec mariadb -uroot -N -B -e \
      "SELECT table_name FROM information_schema.tables WHERE table_schema='$db' AND table_type='BASE TABLE'" 2>"$err")"; then
    BK_ERROR="database unreachable: $(tail -1 "$err" | cut -c1-160)"
    rm -f "$err"
    return 1
  fi
  rm -f "$err"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      _tracy_snap_*) ignore+=("--ignore-table=$db.$line") ;;
      *) tables+=("$line") ;;
    esac
  done <<< "$all"
  n="${#tables[@]}"
  [ "$n" -gt 0 ] || { BK_ERROR="database $db has no tables"; return 1; }
  local rc
  set +e
  if [ -n "${TRACY_BACKUP_SCHEMA:-}" ] && [ "${TRACY_DUMP_STREAMS:-4}" -gt 1 ] && [ "$n" -gt 1 ] \
      && _tracy_dump_parts "$db" "$tmp" "${TRACY_DUMP_STREAMS:-4}" "${tables[@]}"; then
    rc=0
  else
    # gzip -6 on the host's cores (lib/pgzip.py): one core of gzip was most of a dump's time.
    ( umask 077
      ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db \
          mariadb-dump -uroot --single-transaction --quick --routines --triggers --events \
            --max-allowed-packet=256M ${ignore[@]+"${ignore[@]}"} "$db" ) | python3 "$_TRACY_BACKUP_LIB/pgzip.py" -6 > "$tmp"
      rcs=("${PIPESTATUS[@]}")
      [ "${rcs[1]}" = 0 ] || exit 1
      exit "${rcs[0]}" )
    rc=$?
  fi
  set -e
  # One read of the file proves both: gunzip checks every byte against the CRC (what `gzip -t` did
  # on a read of its own), and the dump's last line says mariadb-dump got to its end.
  if [ "$rc" != 0 ] || ! (set -o pipefail; gzip -dc "$tmp" 2>/dev/null | tail -c 200 | grep 'Dump completed' >/dev/null); then
    rm -f "$tmp"
    BK_ERROR="mariadb-dump failed (exit $rc)"
    return 1
  fi
  mv "$tmp" "$dir/v$version.mysql.gz"
  chmod 600 "$dir/v$version.mysql.gz"
  _tracy_dump_record "$dir/v$version.mysql.gz" mysql "$n" ""
}

_tracy_dump_sqlite() {
  local version="$1" dir="$2" out n
  if ! out="$( ( umask 077; _tracy_sqlite backup "$STACK/data/data.db" "$dir/.v$version.sqlite.tmp" ) 2>&1)"; then
    rm -f "$dir/.v$version.sqlite.tmp" "$dir/.v$version.sqlite.tmp-wal" "$dir/.v$version.sqlite.tmp-shm"
    BK_ERROR="sqlite backup failed: $(printf '%s' "$out" | tail -1 | cut -c1-160)"
    return 1
  fi
  n="$(printf '%s' "$out" | tail -1)"
  ( umask 077; gzip -6 -c "$dir/.v$version.sqlite.tmp" > "$dir/.v$version.sqlite.gz.tmp" )
  rm -f "$dir/.v$version.sqlite.tmp" "$dir/.v$version.sqlite.tmp-wal" "$dir/.v$version.sqlite.tmp-shm"
  # Uploads: numeric owners kept, so a restore gives the files back to the container's own user.
  if ! ( umask 077; tar -czf "$dir/.v$version.uploads.tar.gz.tmp" --numeric-owner -C "$STACK" uploads ) 2>/dev/null; then
    rm -f "$dir/.v$version.sqlite.gz.tmp" "$dir/.v$version.uploads.tar.gz.tmp"
    BK_ERROR="uploads could not be packed"
    return 1
  fi
  mv "$dir/.v$version.sqlite.gz.tmp" "$dir/v$version.sqlite.gz"
  mv "$dir/.v$version.uploads.tar.gz.tmp" "$dir/v$version.uploads.tar.gz"
  chmod 600 "$dir/v$version.sqlite.gz" "$dir/v$version.uploads.tar.gz"
  _tracy_dump_record "$dir/v$version.sqlite.gz" sqlite "$n" "$dir/v$version.uploads.tar.gz"
}

# _tracy_dump_parts <schema> <out.gz> <streams> <table…>: a scratch schema nobody writes (a sync's
# result, `webroot-backup.sh --op create-from`) dumped in parts side by side — its tables shared out
# by size among <streams> mariadb-dumps, then its routines and events alone — each part a gzip member
# of <out.gz>, in that order. One mariadb-dump of a WordPress result took 9–13 s of every sync, the
# database's other core idle (dev, 28/10/2026). Each part is a whole mariadb-dump of its own (its
# head sets FOREIGN_KEY_CHECKS=0 and its tail puts it back), so the file loads in one stream as the
# one dump did, and `dump_tables.py` cuts it part after part. Not for a schema a site writes: each
# part is a transaction of its own. 1 (nothing written) when the schema holds a view or a part did
# not end as mariadb-dump ends; the caller then dumps it the one way.
_tracy_dump_parts() {
  local db="$1" out="$2" k="$3" sizes shares i f names one failed=0 pids=() pid
  shift 3
  [ "$(tracy_db_exec mariadb -uroot -N -B -e \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$db' AND table_type<>'BASE TABLE'" 2>/dev/null)" = 0 ] || return 1
  sizes="$(tracy_db_exec mariadb -uroot -N -B -e \
      "SELECT table_name, IFNULL(data_length, 0) FROM information_schema.tables WHERE table_schema='$db' AND table_type='BASE TABLE'" 2>/dev/null)" || return 1
  shares="$(mktemp -d "/tmp/backup-parts-$LABEL.XXXXXX")"
  printf '%s\n' "$@" | python3 -c 'import os, sys
out, k, sizes = sys.argv[1], int(sys.argv[2]), {}
for line in sys.argv[3].splitlines():
    name, _, size = line.partition("\t")
    sizes[name] = int(size) if size.isdigit() else 0
names = [l.rstrip("\n") for l in sys.stdin if l.strip()]
names.sort(key=lambda t: -sizes.get(t, 0))
k = max(1, min(k, len(names)))
shares, weight = [[] for _ in range(k)], [0] * k
for name in names:
    i = weight.index(min(weight))
    shares[i].append(name)
    weight[i] += sizes.get(name, 0) + 1
for i, share in enumerate(shares):
    open(os.path.join(out, str(i)), "w").write("".join(n + "\n" for n in share))' "$shares" "$k" "$sizes" || { rm -rf "$shares"; return 1; }
  i=0
  for f in "$shares"/[0-9]*; do
    names=()
    while IFS= read -r one; do names+=("$one"); done < "$f"
    ( set -o pipefail; umask 077
      ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db \
          mariadb-dump -uroot --single-transaction --quick --triggers --skip-routines --skip-events \
            --max-allowed-packet=256M "$db" "${names[@]}" ) | gzip -6 > "$shares/part-$i.gz" ) & pids+=("$!")
    i=$((i + 1))
  done
  ( set -o pipefail; umask 077
    ( cd "$STACK" && docker compose exec -T -e MYSQL_PWD="$(_tracy_env_value DB_PASSWORD)" db \
        mariadb-dump -uroot --no-data --no-create-info --skip-triggers --routines --events "$db" ) \
      | gzip -6 > "$shares/part-z.gz" ) & pids+=("$!")
  for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
  # Every part read back whole (gunzip checks each byte) and ending as mariadb-dump ends.
  for f in "$shares"/part-*.gz; do
    [ "$failed" = 0 ] || break
    (set -o pipefail; gzip -dc "$f" 2>/dev/null | tail -c 200 | grep 'Dump completed' >/dev/null) || failed=1
  done
  if [ "$failed" = 0 ]; then
    local parts=() j
    for ((j = 0; j < i; j++)); do parts+=("$shares/part-$j.gz"); done
    ( umask 077; cat "${parts[@]}" "$shares/part-z.gz" > "$out" ) || failed=1
  fi
  rm -rf "$shares"
  [ "$failed" = 0 ] || { rm -f "$out"; return 1; }
}

_tracy_dump_record() {
  local file="$1" kind="$2" tables="$3" uploads="$4" sha size usha="" usize=""
  sha="$(_tracy_sha256 "$file")"
  size="$(_tracy_size "$file")"
  BK_TRAILERS="Tracy-Database: sha256:$sha size:$size kind:$kind tables:$tables"
  if [ -n "$uploads" ]; then
    usha="$(_tracy_sha256 "$uploads")"
    usize="$(_tracy_size "$uploads")"
    BK_TRAILERS="$BK_TRAILERS"$'\n'"Tracy-Uploads: sha256:$usha size:$usize"
  fi
  BK_JSON="$(python3 -c 'import json,sys
k,sha,size=sys.argv[1:4]
print(json.dumps({"engine": {"mysql": "mariadb"}.get(k, k), "bytes": int(size), "sha256": sha, "ok": True}))' "$kind" "$sha" "$size")"
  echo "==> database backed up: $kind, $size bytes, $tables tables, sha256 ${sha:0:12}…" >&2
}

# ── retention ────────────────────────────────────────────────────────────────────────────────
# tracy_backup_prune <repo> <tag prefix>
# Keeps the newest TRACY_BACKUP_KEEP dumps of points a person made and TRACY_BACKUP_KEEP_AUTO of
# Before-restore points; v1 (the Initial backup) never expires. A pruned point keeps its tag and its
# files; its dump goes and a `.expired` marker says why, so it reads "database removed", not
# "corrupt". Also drops what a restore replaced, once older than TRACY_BACKUP_TRASH_HOURS.
tracy_backup_prune() {
  local repo="$1" prefix="$2" dir
  dir="$(tracy_backup_dir)"
  [ -d "$dir" ] || return 0
  python3 - "$repo" "$prefix" "$dir" "$TRACY_BACKUP_KEEP" "$TRACY_BACKUP_KEEP_AUTO" <<'PYEOF' || echo "!! backup retention did not run" >&2
import glob, os, re, subprocess, sys
repo, prefix, d, keep, keep_auto = sys.argv[1:6]
keep, keep_auto = int(keep), int(keep_auto)
names = subprocess.run(["git", "--git-dir", repo, "for-each-ref", "--format=%(refname:short)", f"refs/tags/{prefix}/*"],
                       capture_output=True, text=True, check=True).stdout.split()
files = os.listdir(d)
manual, auto = [], []
for name in names:
    m = re.search(r"/v(\d+)$", name)
    if not m: continue
    v = int(m.group(1))
    if v == 1: continue
    if not any(f.startswith(f"v{v}.") and not f.endswith(".expired") for f in files): continue
    contents = subprocess.run(["git", "--git-dir", repo, "tag", "-l", "--format=%(contents)", name],
                              capture_output=True, text=True, check=True).stdout
    (auto if re.search(r"^Tracy-Backup: (pre-restore|sync)$", contents, re.M) else manual).append(v)
gone = []
for group, n in ((manual, keep), (auto, keep_auto)):
    for v in sorted(group, reverse=True)[n:]:
        for f in glob.glob(os.path.join(d, f"v{v}.*")):
            if not f.endswith(".expired"): os.remove(f)
        open(os.path.join(d, f"v{v}.expired"), "w").close()
        gone.append(v)
if gone:
    print(f"==> backup retention: database dumps of v{', v'.join(map(str, sorted(gone)))} removed", file=sys.stderr)
PYEOF
  _tracy_trash_prune
  tracy_snap_sweep || true
}

# tracy_snap_sweep
# Drops the table snapshots `db.snapshot` left in the copy's OWN database (`_tracy_snap_<tag>__*`,
# #1649) once they have outlived their use — the rule, per tag and never part of one, is
# lib/copy_snapshots.py's: younger than TRACY_SNAP_KEEP_DAYS stays, the newest TRACY_SNAP_KEEP_NEWEST
# tags stay, an undatable name stays. Only ever through `tracy_db_exec`, i.e. this stack's own `db`
# container: the customer's live site is never reached from here. One `DROP TABLE` per batch of one
# tag. Says what it did on stderr; returns 1 when the database could not be read or a drop failed,
# and the caller decides whether that matters (the backup retention above does not let it).
tracy_snap_sweep() {
  [ "$(tracy_backup_kind)" = mysql ] || return 0
  local db names plan summary statement said failed=0
  db="$(tracy_backup_db_name)"
  if ! names="$(tracy_db_exec mariadb -uroot -N -B -e \
      "SELECT table_name FROM information_schema.tables WHERE table_schema='$db' AND table_type='BASE TABLE' AND table_name LIKE '\\_tracy\\_snap\\_%'" 2>/dev/null)"; then
    echo "!! table snapshots: the database could not be read; none swept" >&2
    return 1
  fi
  [ -n "$names" ] || return 0
  plan="$(printf '%s\n' "$names" | python3 "$_TRACY_BACKUP_LIB/copy_snapshots.py" plan --schema "$db" \
      --keep-days "$TRACY_SNAP_KEEP_DAYS" --keep-newest "$TRACY_SNAP_KEEP_NEWEST")" || {
    echo "!! table snapshots: no plan; none swept" >&2
    return 1
  }
  summary="$(printf '%s\n' "$plan" | tail -1)"
  while IFS= read -r statement; do
    [ -n "$statement" ] || continue
    # </dev/null: `docker compose exec -T` forwards stdin, and would eat the statements after this one.
    tracy_db_exec mariadb -uroot -e "$statement" </dev/null >/dev/null 2>&1 || failed=$((failed + 1))
  done < <(printf '%s\n' "$plan" | sed '$d')
  said="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("said", ""))' "$summary" 2>/dev/null || true)"
  if [ "$failed" -gt 0 ]; then said="${said:+$said; }$failed drop(s) failed"; fi
  [ -z "$said" ] || echo "==> table snapshots: $said" >&2
  [ "$failed" -eq 0 ]
}

_tracy_trash_prune() {
  local cutoff now
  now="$(date +%s)"
  cutoff=$(( now - TRACY_BACKUP_TRASH_HOURS * 3600 ))
  local entry ts
  for entry in "$STACK"/data.tracy-trash-* "$STACK"/uploads.tracy-trash-*; do
    [ -e "$entry" ] || continue
    ts="${entry##*-}"
    [[ "$ts" =~ ^[0-9]+$ ]] && (( ts < cutoff )) && rm -rf "$entry"
  done
  if [ "$(tracy_backup_kind)" = mysql ]; then
    local db schemas s
    db="$(tracy_backup_db_name)"
    schemas="$(tracy_db_exec mariadb -uroot -N -B -e \
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE '${db}\\_tracy\\_trash\\_%'" 2>/dev/null)" || return 0
    while IFS= read -r s; do
      [ -n "$s" ] || continue
      ts="${s##*_}"
      [[ "$ts" =~ ^[0-9]+$ ]] && (( ts < cutoff )) && tracy_db_exec mariadb -uroot -e "DROP DATABASE \`$s\`" >/dev/null 2>&1 || true
    done <<< "$schemas"
  fi
  return 0
}
