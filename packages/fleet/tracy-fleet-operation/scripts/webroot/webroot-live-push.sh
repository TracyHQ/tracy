#!/usr/bin/env bash
# webroot-live-push.sh — "Sync to live" phase 1 for an imported site (plan tasks/ke-hoach-sync-to-live.md,
# job contract webroot/LIVE-PUSH-CONTRACT.md): what Tracy changed on the copy goes back to the
# customer's live site, through the content writes the Claude Cowork engine on the live site already
# ships — never a row written raw. Phase 2: files through `media.upload`/`media.delete` (Joomla `images/`
# and `media/`, a WordPress picture the Media Library has), each checked by its bytes; settings through
# their doors (`site.identity`, `template.siteSettings`, a template style, options, theme mods, Additional
# CSS); a PHP file only after a lint on the live site's PHP and its own OK. A template's or theme's own
# files (Joomla `templates/<tpl>/`, `media/templates/site/<tpl>/`; WordPress the active theme and its
# parent) through the engine's template door (`template.files.write`, batched, compare-and-set,
# undone by `template.files.undo`) when the live engine has it switched on. The rest is named.
#
#   --op preview --preview-id P
#       Sync from live first (webroot-sync.sh --op sync: the base becomes the live site as it is now);
#       a sync held for a person stops here (SYNC_NEEDS_ATTENTION). Then, under the site's lock, the
#       changeset (lib/live_push.py): copy − base, kind by kind, in the live site's numbers and
#       address, with what cannot be pushed named. Kept in <private>/push/previews/P/.
#   --op apply --preview-id P --push-id U [--confirm-deletes] [--confirm-php] [--settle-later]
#       Refuses PREVIEW_STALE when the copy, the base or the id map moved since the preview. Then each
#       item on the live site (lib/live-write.mjs): written only where the live site still holds the
#       base's value, else a conflict; at most 200 items; deletes only when confirmed. What the live
#       site held before each write stays in <private>/push/U/before.json (0600). The numbers the live
#       site gave new records join `sync/id-map.json`, the places written join `sync/pushed.json`
#       (the next merge takes them as base: lib/live_sync.py `seed_pushed`), and Sync from live runs
#       again so the base is the live site with the push in it.
#   --op undo --push-id U [--settle-later]
#       Each written item back to what it was before — only where the live site still holds what the
#       push left; then Sync from live. The copy keeps Tracy's change.
#
# The live site's door and token: env TRACY_SYNC_ENDPOINT, TRACY_SYNC_TOKEN (as webroot-sync.sh),
# never in argv. The last stdout line is the answer. Joomla and WordPress; EmDash has no import.
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
# shellcheck source=../lib/site-backup.sh
. "$LIB_DIR/site-backup.sh"

LABEL="" OP="" PREVIEW_ID="" PUSH_ID="" CONFIRM_DELETES=0 CONFIRM_PHP=0 SETTLE_LATER=0 BY_NAME="" BY_EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --op) OP="$2"; shift 2 ;;
    --preview-id) PREVIEW_ID="$2"; shift 2 ;;
    --push-id) PUSH_ID="$2"; shift 2 ;;
    --confirm-deletes) CONFIRM_DELETES=1; shift ;;
    --confirm-php) CONFIRM_PHP=1; shift ;;
    --settle-later) SETTLE_LATER=1; shift ;;
    --by-name) BY_NAME="$2"; shift 2 ;;
    --by-email) BY_EMAIL="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$LABEL" && -n "$OP" ]] || { echo "need --label and --op" >&2; exit 2; }
tracy_require_label "$LABEL"
for id in "$PREVIEW_ID" "$PUSH_ID"; do
  [[ -z "$id" || "$id" =~ ^[a-f0-9-]{8,64}$ ]] || { echo "refused id" >&2; exit 2; }
done

STACK="$(tracy_private_dir "$LABEL")"
WEBROOT="$(tracy_webroot_dir "$LABEL")"
REPO="$(tracy_repo_dir "$LABEL")"
[[ -d "$WEBROOT" ]] || { echo "no webroot at $WEBROOT" >&2; exit 1; }

g() { git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" "$@"; }

SYNC_DIR="$STACK/sync"
LIVE_REF="refs/tracy/live"
LIVE_BASE_DUMP="$SYNC_DIR/live-base.sql.gz"
ID_MAP="$SYNC_DIR/id-map.json"
PUSHED="$SYNC_DIR/pushed.json"
PUSH_ROOT="$STACK/push"
PREVIEW_DIR="$PUSH_ROOT/previews/$PREVIEW_ID"
PUSH_DIR="$PUSH_ROOT/$PUSH_ID"
# How long a preview may be applied, and how long a push can be taken back.
PREVIEW_MINUTES=1440
PUSH_DAYS=30
LIMIT="${TRACY_PUSH_LIMIT:-200}"

answer_refusal() { # code [detail]
  python3 -c 'import json,sys; print(json.dumps({"ok": False, "code": sys.argv[1], **({"detail": sys.argv[2]} if len(sys.argv) > 2 and sys.argv[2] else {})}))' "$@"
}
step() { echo "==> [${SECONDS}s] $*" >&2; }
json_get() { # file key → the value at key ('' when none)
  python3 -c 'import json,sys
try: v = json.load(open(sys.argv[1])).get(sys.argv[2])
except Exception: v = None
print("" if v is None else (json.dumps(v) if isinstance(v, (dict, list, bool)) else v))' "$1" "$2"
}

# ── locks (webroot-sync.sh's own, the same files) ────────────────────────────────────────────
HEAVY_LOCK="${TRACY_HEAVY_LOCK:-/var/lock/tracy-webroot-heavy.lock}"
run_heavy() {
  if [[ -n "${TRACY_HEAVY_LOCK_HELD:-}" ]] || ! command -v flock >/dev/null 2>&1; then "$@"; return; fi
  if ! heavy_try "$HEAVY_LOCK"; then
    step "waiting for another site's heavy webroot job (the machine's heavy jobs are full)"
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
DB="" PREFIX="" CHARSET="utf8mb4" COLLATION="utf8mb4_unicode_ci" SCHEMA_BASE=""
db_names() {
  DB="$(tracy_backup_db_name)"
  SCHEMA_BASE="${DB}_tracy_push_base"
  if [[ "$(tracy_backup_platform)" == wordpress ]]; then
    PREFIX="$(tracy_db_exec mariadb -uroot -N -B -e "SELECT SUBSTRING(table_name, 1, CHAR_LENGTH(table_name) - 7)
      FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE' AND table_name LIKE '%options'
      ORDER BY CHAR_LENGTH(table_name) LIMIT 1" 2>/dev/null | grep -E '^[A-Za-z0-9_]+$' | head -1 || true)"
  else
    PREFIX="$(grep -oE "dbprefix['\"]? *= *['\"][a-zA-Z0-9_]+" "$WEBROOT/configuration.php" 2>/dev/null \
      | grep -oE "[a-zA-Z0-9_]+$" || true)"
  fi
  local c k
  read -r c k < <(tracy_db_exec mariadb -uroot -N -B -e \
    "SELECT default_character_set_name, default_collation_name FROM information_schema.schemata WHERE schema_name='$DB'") || true
  [[ "${c:-}" =~ ^[a-z0-9_]+$ ]] && CHARSET="$c"
  [[ "${k:-}" =~ ^[a-z0-9_]+$ ]] && COLLATION="$k"
}
sql_client() {
  python3 -c 'import json,sys; print(json.dumps(["docker", "compose", "exec", "-T", "-e", "MYSQL_PWD=" + sys.argv[1], "db", "mariadb", "-uroot"]))' \
    "$(_tracy_env_value DB_PASSWORD)"
}
sync_engine() { ( cd "$STACK" && TRACY_SYNC_SQL="$(sql_client)" python3 "$LIB_DIR/live_sync.py" "$@" ); }
push_engine() { ( cd "$STACK" && TRACY_SYNC_SQL="$(sql_client)" python3 "$LIB_DIR/live_push.py" "$@" ); }
drop_scratch() { tracy_db_exec mariadb -uroot -e "DROP DATABASE IF EXISTS \`$SCHEMA_BASE\`" >/dev/null 2>&1 || true; }
# The copy's database by its substance (live_sync.py `checksums`: a visit to the copy moves no table).
# Fails (no output) when the database cannot be read: an empty answer must never compare equal.
copy_checksums() {
  local out
  out="$(sync_engine checksums --schema "$DB" --platform "$(tracy_backup_platform)" --prefix "$PREFIX")" || return 1
  [[ -n "$out" ]] || return 1
  printf '%s' "$out" | python3 -c 'import hashlib,sys; print(hashlib.sha1(sys.stdin.buffer.read()).hexdigest())'
}
file_sha() { python3 -c 'import hashlib,os,sys; p=sys.argv[1]; print(hashlib.sha1(open(p,"rb").read()).hexdigest() if os.path.exists(p) else "-")' "$1"; }

check_site() {
  [[ -d "$REPO" ]] && g rev-parse --verify HEAD >/dev/null 2>&1 || { answer_refusal NO_HISTORY; return 1; }
  local platform
  platform="$(tracy_backup_platform)"
  [[ "$platform" == joomla || "$platform" == wordpress ]] || { answer_refusal PUSH_UNSUPPORTED_PLATFORM "$platform"; return 1; }
  [[ -n "${TRACY_SYNC_ENDPOINT:-}" && -n "${TRACY_SYNC_TOKEN:-}" ]] || { answer_refusal NO_LIVE_DOOR; return 1; }
}

# Sync from live into <dir> (webroot-sync.sh takes its own locks, and reads the live site outside
# them); its answer in <dir>.json.
forward_sync() { # dir
  mkdir -p "$1"
  chmod 700 "$1"
  local started=$SECONDS
  step "Sync from live: reading the live site"
  bash "$HERE/webroot-sync.sh" --label "$LABEL" --op sync --dir "$1" \
    ${BY_EMAIL:+--by-email "$BY_EMAIL" --by-name "${BY_NAME:-$BY_EMAIL}"} | tail -1 > "$1.json" || true
  [[ -s "$1.json" ]] || echo '{"ok":false,"code":"SYNC_FAILED"}' > "$1.json"
  # The sync's own answer, as a Sync from live job answers it, with how long it took here.
  python3 - "$1.json" "$(( SECONDS - started ))" <<'PYEOF' || true
import json, sys
path, seconds = sys.argv[1], int(sys.argv[2])
a = json.load(open(path))
a["timing"] = {**(a.get("timing") if isinstance(a.get("timing"), dict) else {}), "seconds": seconds}
json.dump(a, open(path, "w"), ensure_ascii=False)
PYEOF
  step "Sync from live: $(json_get "$1.json" state)$(json_get "$1.json" code)"
}

# An engine's refusal (live-write.mjs) as this job's answer, its codes the contract's; on
# LIVE_PHP_TOO_OLD the site's PHP and the engine's minimum go along.
engine_refusal() { # answer
  python3 -c 'import json,sys
a = json.loads(sys.argv[1] or "{}")
code = a.get("code") or "WRITE_FAILED"
print(json.dumps({"ok": False, "code": code, **({"detail": a["detail"]} if a.get("detail") else {}),
                 **({"php": a.get("php"), "min": a.get("min")} if code == "LIVE_PHP_TOO_OLD" else {})}))' "$1"
}

# ── preview ──────────────────────────────────────────────────────────────────────────────────
preview() {
  [[ -n "$PREVIEW_ID" ]] || { echo "need --preview-id" >&2; exit 2; }
  check_site || return 0
  ( umask 077; mkdir -p "$PREVIEW_DIR" )
  step "stage: syncing"
  forward_sync "$PREVIEW_DIR/sync"
  # A first sync whose live site did not move since the import (its fingerprint, tracy-host wrote it
  # beside the run) answers "nothing new" without a read to keep as the base: read it whole once.
  if [[ "$(json_get "$PREVIEW_DIR/sync.json" state)" == applied && -n "$(json_get "$PREVIEW_DIR/sync.json" unchanged)" \
        && ! -f "$LIVE_BASE_DUMP" ]]; then
    step "no read of the live site kept yet: reading it whole"
    rm -f "$PREVIEW_DIR/sync/base-fingerprint.json"
    forward_sync "$PREVIEW_DIR/sync"
  fi
  local state ok
  state="$(json_get "$PREVIEW_DIR/sync.json" state)"
  ok="$(json_get "$PREVIEW_DIR/sync.json" ok)"
  if [[ "$state" == needs_attention || "$state" == needs_resolution ]]; then
    python3 -c 'import json,sys; print(json.dumps({"ok": False, "code": "SYNC_NEEDS_ATTENTION", "sync": json.load(open(sys.argv[1]))}, ensure_ascii=False))' "$PREVIEW_DIR/sync.json"
    return 0
  fi
  if [[ "$ok" != true || "$state" != applied ]]; then
    python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); print(json.dumps({"ok": False, "code": s.get("code") if s.get("code") in ("LIVE_BLOCKED", "LIVE_PASSWORD_PROTECTED", "LIVE_PHP_TOO_OLD", "LIVE_RATE_LIMITED", "TOKEN_REFUSED") else "SYNC_FAILED", "sync": s}, ensure_ascii=False))' "$PREVIEW_DIR/sync.json"
    return 0
  fi
  rm -rf "$PREVIEW_DIR/sync"
  # The live engine: its version and PHP, and its template door (switches, limits, roots).
  node "$LIB_DIR/live-write.mjs" info 2>/dev/null | tail -1 > "$PREVIEW_DIR/engine.json" || true
  step "stage: comparing"
  local answer
  answer="$(run_heavy webroot_locked changeset | tail -1)"
  case "$(python3 -c 'import json,sys
try: a = json.loads(sys.argv[1])
except ValueError: a = None
print("none" if not isinstance(a, dict) else a.get("ok"))' "$answer")" in
    True) ;;
    # Stopped with no answer of its own (killed, out of memory): said, never an empty line.
    none) answer_refusal CHANGESET_FAILED "the changeset stopped with no answer"; return 0 ;;
    *) printf '%s\n' "$answer"; return 0 ;;
  esac
  # A PHP file is offered only once it passes a lint on the live site's own PHP (engine `info`).
  if [[ "$(json_get "$PREVIEW_DIR/changeset.json" hasPhp)" == true ]]; then
    step "linting PHP files for the live site's PHP $(json_get "$PREVIEW_DIR/engine.json" php)"
    push_engine lint --changeset "$PREVIEW_DIR/changeset.json" --repo "$REPO" \
      --php "$(json_get "$PREVIEW_DIR/engine.json" php)" >&2 || true
  fi
  push_engine answer --changeset "$PREVIEW_DIR/changeset.json" --preview-id "$PREVIEW_ID" \
    --sync "$PREVIEW_DIR/sync.json" --engine "$PREVIEW_DIR/engine.json"
}

# Under the site's lock: the copy sealed, the base loaded, copy − base. D/preview.json keeps what
# `apply` checks: the copy's commit and database, the base, the id map.
changeset() {
  db_names
  [[ -n "$PREFIX" ]] || { answer_refusal NO_TABLE_PREFIX; return; }
  [[ -f "$LIVE_BASE_DUMP" ]] && g rev-parse --verify --quiet "$LIVE_REF^{commit}" >/dev/null \
    || { answer_refusal NO_BASE "no read of the live site in place"; return; }
  step "the copy: sealing its files"
  TRACY_WEBROOT_LOCK_HELD=1 bash "$HERE/webroot-git.sh" --label "$LABEL" --op seal-outside >&2
  step "the base: loading the live site's last read"
  drop_scratch
  trap drop_scratch EXIT
  # Every step checked by hand: this runs inside a command substitution, where bash turns `set -e`
  # off — and a base the server refused or loaded half would make the live site's records look new.
  if ! tracy_db_exec mariadb -uroot -e "CREATE DATABASE \`$SCHEMA_BASE\` CHARACTER SET $CHARSET COLLATE $COLLATION" \
     || ! tracy_db_load_dump "$SCHEMA_BASE" "$LIVE_BASE_DUMP" "$PREVIEW_DIR/load-base" \
     || ! tracy_db_drop_triggers "$SCHEMA_BASE" >&2 \
     || ! sync_engine normalise --schema "$SCHEMA_BASE" --platform "$(tracy_backup_platform)" --prefix "$PREFIX" >&2; then
    drop_scratch; trap - EXIT
    answer_refusal SCRATCH_DB_FAILED "the database server refused the scratch copy of the live site's read (is its disk full or read-only?)"
    return
  fi
  local try before after commit
  for try in 1 2 3; do
    commit="$(g rev-parse HEAD)"
    if ! before="$(copy_checksums)"; then
      drop_scratch; trap - EXIT
      answer_refusal SCRATCH_DB_FAILED "the copy's database could not be read"
      return
    fi
    step "the changeset: copy against the live site's last read"
    if ! push_engine changeset --base-schema "$SCHEMA_BASE" --copy-schema "$DB" --platform "$(tracy_backup_platform)" \
        --prefix "$PREFIX" --id-map "$ID_MAP" --repo "$REPO" --base-rev "$LIVE_REF" --copy-rev "$commit" \
        --kept "$SYNC_DIR/kept.json" --engine "$PREVIEW_DIR/engine.json" \
        > "$PREVIEW_DIR/changeset.json.tmp"; then
      drop_scratch; trap - EXIT
      tail -1 "$PREVIEW_DIR/changeset.json.tmp"
      rm -f "$PREVIEW_DIR/changeset.json.tmp"
      return
    fi
    after="$(copy_checksums)" || after=""
    [[ "$before" != "$after" ]] || break
    step "the copy's database changed while it was read (try $try); reading again"
    before=""
  done
  drop_scratch
  trap - EXIT
  [[ -n "$before" ]] || { rm -f "$PREVIEW_DIR/changeset.json.tmp"; answer_refusal COPY_BUSY "the copy's database kept changing"; return; }
  chmod 600 "$PREVIEW_DIR/changeset.json.tmp"
  mv "$PREVIEW_DIR/changeset.json.tmp" "$PREVIEW_DIR/changeset.json"
  python3 - "$PREVIEW_DIR/preview.json" "$commit" "$before" "$(file_sha "$LIVE_BASE_DUMP")" "$(file_sha "$ID_MAP")" \
    "$(tracy_backup_platform)" "$PREVIEW_ID" <<'PYEOF'
import json, os, sys, time
out, commit, db, base, id_map, platform, preview = sys.argv[1:8]
json.dump({"previewId": preview, "platform": platform, "copyCommit": commit, "copyDb": db, "base": base,
           "idMap": id_map, "at": int(time.time())}, open(out, "w"))
os.chmod(out, 0o600)
PYEOF
  echo '{"ok":true}'
}

# ── apply ────────────────────────────────────────────────────────────────────────────────────
apply() {
  [[ -n "$PREVIEW_ID" && -n "$PUSH_ID" ]] || { echo "need --preview-id and --push-id" >&2; exit 2; }
  # Done already: the same answer again.
  if [[ -f "$PUSH_DIR/result.json" ]]; then
    if [[ "$(json_get "$PUSH_DIR/push.json" previewId)" == "$PREVIEW_ID" ]]; then
      python3 -c 'import json,sys; a = json.load(open(sys.argv[1])); a["repeated"] = True; print(json.dumps(a, ensure_ascii=False))' "$PUSH_DIR/result.json"
    else
      answer_refusal PUSH_ID_TAKEN
    fi
    return 0
  fi
  if [[ -f "$PUSH_DIR/push.json" && "$(json_get "$PUSH_DIR/push.json" previewId)" != "$PREVIEW_ID" ]]; then
    answer_refusal PUSH_ID_TAKEN; return 0
  fi
  check_site || return 0
  if [[ ! -f "$PUSH_DIR/written.json" ]]; then
    # The writes not made yet (or cut off): the preview must still be what the copy and the base are.
    [[ -f "$PREVIEW_DIR/changeset.json" && -f "$PREVIEW_DIR/preview.json" ]] || { answer_refusal NOT_PREVIEWED; return 0; }
    local stale
    stale="$(webroot_locked preview_stale | tail -1)"
    if [[ -n "$stale" && ! -f "$PUSH_DIR/journal.jsonl" ]]; then answer_refusal PREVIEW_STALE "$stale"; return 0; fi
    ( umask 077; mkdir -p "$PUSH_DIR" )
    if [[ ! -f "$PUSH_DIR/push.json" ]]; then
      cp "$PREVIEW_DIR/changeset.json" "$PUSH_DIR/changeset.json"
      python3 - "$PUSH_DIR/push.json" "$PUSH_ID" "$PREVIEW_ID" "$(tracy_backup_platform)" "$BY_EMAIL" <<'PYEOF'
import json, os, sys, time
out, push, preview, platform, by = sys.argv[1:6]
json.dump({"pushId": push, "previewId": preview, "platform": platform, "by": by or None, "at": int(time.time())},
          open(out, "w"))
os.chmod(out, 0o600)
PYEOF
    fi
    step "stage: writing"
    local said
    said="$(node "$LIB_DIR/live-write.mjs" apply "$PUSH_DIR" "$PUSH_DIR" --limit "$LIMIT" --webroot "$WEBROOT" \
              $([[ "$CONFIRM_DELETES" == 1 ]] && echo --confirm-deletes) \
              $([[ "$CONFIRM_PHP" == 1 ]] && echo --confirm-php) | tail -1)"
    if [[ "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1] or "{}").get("ok"))' "$said")" != True ]]; then
      if [[ ! -f "$PUSH_DIR/written.json" ]]; then engine_refusal "$said"; return 0; fi
    fi
  fi
  local written
  written="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["written"]))' "$PUSH_DIR/written.json")"
  if [[ "$written" -gt 0 && ! -f "$PUSH_DIR/recorded" ]]; then
    db_names
    webroot_locked push_engine record --changeset "$PUSH_DIR/changeset.json" --result "$PUSH_DIR/written.json" \
      --id-map "$ID_MAP" --pushed "$PUSHED" >&2
    touch "$PUSH_DIR/recorded"
  fi
  settle_after "$written"
  rm -rf "$PUSH_DIR/sync"
  finish "$PUSH_DIR/written.json" "$PUSH_DIR/result.json"
  rm -rf "$PREVIEW_DIR"
  cat "$PUSH_DIR/result.json"; echo
}

# The Sync from live after the writes (the live site's new values become the base, and what the push
# made is not read back as the customer's): here, or `later` — tracy-web starts it as an ordinary sync
# the moment the answer is in, the site's write lease handed over to it, so the Owner is not kept
# waiting on it (`--settle-later`). None when nothing was written.
settle_after() { # count written or restored
  if [[ "$1" -eq 0 ]]; then echo '{"ok":true,"state":"skipped"}' > "$PUSH_DIR/sync.json"; return; fi
  if [[ "$SETTLE_LATER" == 1 ]]; then echo '{"ok":true,"state":"later"}' > "$PUSH_DIR/sync.json"; return; fi
  step "stage: settling"
  forward_sync "$PUSH_DIR/sync"
}

# What moved since the preview, or nothing: the copy's files, its database, the base, the id map.
preview_stale() {
  db_names
  TRACY_WEBROOT_LOCK_HELD=1 bash "$HERE/webroot-git.sh" --label "$LABEL" --op seal-outside >&2
  local p="$PREVIEW_DIR/preview.json"
  if [[ "$(g rev-parse HEAD)" != "$(json_get "$p" copyCommit)" ]]; then echo files; return; fi
  local db
  db="$(copy_checksums)" || db="unreadable"
  if [[ "$db" != "$(json_get "$p" copyDb)" ]]; then echo database; return; fi
  if [[ "$(file_sha "$LIVE_BASE_DUMP")" != "$(json_get "$p" base)" || "$(file_sha "$ID_MAP")" != "$(json_get "$p" idMap)" ]]; then
    echo base; return
  fi
  echo ""
}

# The engine's account of the writes, with the push's names and the sync after it: the answer.
finish() { # engine answer file, answer file
  python3 - "$1" "$PUSH_DIR/sync.json" "$PUSH_DIR/push.json" "$2" <<'PYEOF'
import json, os, sys
said, sync_path, push_path, out = sys.argv[1:5]
a = json.load(open(said))
sync = json.load(open(sync_path)) if os.path.exists(sync_path) else {}
push = json.load(open(push_path))
a.pop("created", None)
# The sync after the writes, its whole answer (tracy-web records it as a Sync from live of its own);
# none when nothing was written (`state: skipped`).
answer = {"ok": True, **a, "pushId": push["pushId"], "previewId": push["previewId"], "sync": sync}
json.dump(answer, open(out, "w"), ensure_ascii=False)
os.chmod(out, 0o600)
PYEOF
}

# ── undo ─────────────────────────────────────────────────────────────────────────────────────
undo() {
  [[ -n "$PUSH_ID" ]] || { echo "need --push-id" >&2; exit 2; }
  [[ -f "$PUSH_DIR/written.json" && -f "$PUSH_DIR/before.json" ]] || { answer_refusal NOT_PUSHED; return 0; }
  if [[ -f "$PUSH_DIR/undone.json" ]]; then
    python3 -c 'import json,sys; a = json.load(open(sys.argv[1])); a["repeated"] = True; print(json.dumps(a, ensure_ascii=False))' "$PUSH_DIR/undone.json"
    return 0
  fi
  check_site || return 0
  if [[ ! -f "$PUSH_DIR/restored.json" ]]; then
    step "stage: undoing"
    local said
    said="$(node "$LIB_DIR/live-write.mjs" undo "$PUSH_DIR" | tail -1)"
    if [[ "$(python3 -c 'import json,sys; print(json.loads(sys.argv[1] or "{}").get("ok"))' "$said")" != True ]]; then
      engine_refusal "$said"; return 0
    fi
  fi
  local restored
  restored="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["restored"]))' "$PUSH_DIR/restored.json")"
  if [[ "$restored" -gt 0 && ! -f "$PUSH_DIR/undo-recorded" ]]; then
    db_names
    webroot_locked push_engine record --changeset "$PUSH_DIR/changeset.json" --result "$PUSH_DIR/restored.json" \
      --id-map "$ID_MAP" --pushed "$PUSHED" --undo >&2
    touch "$PUSH_DIR/undo-recorded"
  fi
  settle_after "$restored"
  rm -rf "$PUSH_DIR/sync"
  finish "$PUSH_DIR/restored.json" "$PUSH_DIR/undone.json"
  cat "$PUSH_DIR/undone.json"; echo
}

# Previews older than a day and pushes older than PUSH_DAYS go at every start: they hold the
# customer's content (the changeset's values, what the live site held before a write).
sweep() {
  [[ -d "$PUSH_ROOT" ]] || return 0
  find "$PUSH_ROOT/previews" -mindepth 1 -maxdepth 1 -type d -mmin "+$PREVIEW_MINUTES" ! -path "$PREVIEW_DIR" \
    -exec rm -rf {} + 2>/dev/null || true
  find "$PUSH_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name previews -mtime "+$PUSH_DAYS" ! -path "$PUSH_DIR" \
    -exec rm -rf {} + 2>/dev/null || true
}

# Why a phase stopped, in its progress too (`==> [Ns] <stage> stopped: CODE: why`): the answer's code
# and its `detail` (lib/live_sync.py `failure_line`: the exception's kind and last line, cut at the first
# quote — no value of the site), or the inner sync's when the stop was the Sync from live's.
said_stop() { # answer
  local why
  why="$(python3 -c 'import json,sys
try: a = json.loads(sys.argv[1])
except ValueError: a = None
if isinstance(a, dict) and a.get("ok") is False:
    s = a.get("sync") if isinstance(a.get("sync"), dict) else {}
    detail = a.get("detail") or (": ".join(str(x) for x in (s.get("code"), s.get("detail")) if x) if s.get("ok") is False else "")
    print(str(a.get("code") or "FAILED") + (": " + str(detail) if detail else ""))' "$1" 2>/dev/null)" || true
  [[ -z "$why" ]] || step "$OP stopped: ${why:0:400}"
}

( umask 077; mkdir -p "$PUSH_ROOT/previews" )
sweep
case "$OP" in
  preview|apply|undo) ;;
  *) echo "unknown op: $OP" >&2; exit 2 ;;
esac
SAID="$("$OP")"
printf '%s\n' "$SAID"
said_stop "$(printf '%s\n' "$SAID" | tail -1)"
