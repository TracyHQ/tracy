#!/usr/bin/env bash
#
# migrate-site-to-host-dsh — move ONE site off its own lane and onto the dsh this host runs.
#
#   migrate-site-to-host-dsh.sh <label> [--dry-run] [--no-stop-lane] [--lane N] [--lane-home P] [--web N]
#   migrate-site-to-host-dsh.sh <label> --adopt-sessions-only [--dry-run]
#
# ## The shape: PREFLIGHT EVERYTHING, then act, under a trap
#
# Every question that can refuse is asked BEFORE anything on disk moves — including the one that
# used to refuse in the middle: the compose file is rendered STRICT into a temporary shadow of the
# site directory during preflight, so an unlisted web image stops the run while the site is still
# whole. After preflight there is one ordered sequence, and a trap unwinds it:
#
#   preflight  site dir · tracy-dsh up · lane container AND ITS REAL /desk-home · platform ·
#              compose rendered strict to a temp file · both shapes of the site folder examined
#   1. docker stop <lane>            sessions quiesce BEFORE they are copied
#   2. site folder up one level      resumable: a marker file survives a crash mid-move
#   3. chown -R to the dsh's uid     the agent has to WRITE in there, not only read
#   4. mv the rendered compose in    the old one is kept as the rollback target
#   5. docker compose up -d --no-deps web
#   6. attach-site.sh                the folder becomes /site/<label> inside tracy-dsh
#   7. two WRITE probes              inside the web container, and inside tracy-dsh
#   8. copy sessions + storages      from the lane home read in preflight
#   9. print JSON and the two KV commands
#
# 🔒 THE WINDOW. Step 1 stops the lane while `host-dsh:<label>` is still off, so between step 1 and
# the moment somebody runs the printed `wrangler kv key put`, seats at this site reach a hostname
# whose container is stopped — Cloudflare 530. It is the smaller of two bad choices: copying session
# logs out of a RUNNING dsh yields a torn final frame, and the conversation that tears is the newest
# one, the one the customer opens first after the move. Keep the window short: have the wrangler
# shell open before starting. `--no-stop-lane` trades it back and says so.
#
# ## Idempotent, resumable, dry-runnable
#
# Re-running is safe: the level move leaves a marker so an interrupted move CONTINUES instead of
# refusing, the compose backup is taken once (the first one is the pre-migration one, and it is the
# rollback target), attach-site is idempotent by construction, and a session directory already
# carried over is not carried again. `--dry-run` prints every mutating command and still does the
# whole read-only preflight, including the strict render — so a dry run is a real preflight.
#
# ## SESSIONS — what is safe to copy, and what is not
#
# Measured in vendor/tracy/deepseek-harness, not assumed:
#
#   * A session log lives at `<home>/sessions/<projectKey(cwd)>/<sessionId>/…jsonl.zstd`, and
#     `projectKey` (session-persistence-jsonl/src/format.ts) turns `/site/<label>` into
#     `--site-<label>--`. One directory per label, so two labels never share one — and session ids
#     are uuids, so nothing collides inside it either. That directory is safe to merge into the
#     host dsh's one sessions root.
#   * Every OTHER project directory in a lane's sessions root is NOT safe: a lane whose agent once
#     stood in `/var/www/html` or `/work/<label>` wrote `--var-www-html--`, and that same name is
#     written by every other lane. Merging those would put two customers' conversations in one
#     directory. They are copied to a staging directory and left there.
#   * Copying the files is not enough to make the history VISIBLE. `WorkspaceEntity.sessionIds`
#     (workspace/src/entity.ts) filters the record's own stored list, `workspace.create` writes
#     `sessionIds: []` (index.ts, createCanonical), and the seat door only creates a workspace for
#     a grant that carries `home` (dsh-passwords/src/gateway.ts, seat-home.ts) — a grant that
#     carries `folders` creates nothing. So a copied session shows up only when some workspace
#     record lists it.
#   * The one merge that is safe from a script is the merge dsh does itself. With
#     `global.initialized === false` in `storages/workspace.json`, `WorkspaceRegistry` re-runs
#     `bootstrap()` at boot: it groups every stored session header by its canonical cwd and either
#     extends the workspace record that already owns that path or creates one for it. It respects
#     existing records and the one-owner accounting invariant, which a script editing the table by
#     hand would have to re-implement.
#   * That flip has to happen while the container is STOPPED. `storages/workspace.json` is written
#     by the storage-json `single` layout, which keeps MEMORY authoritative (storage-json/README.md)
#     — a file edited under a running dsh is overwritten wholesale at its next write, silently.
#
# `--adopt-sessions-only` is therefore its OWN run, not a flag on the migration: it stops the host
# dsh, flips the file, starts it, and waits until the container is actually serving before it says
# so. Run it ONCE at the end of a batch — it restarts the dsh every site on the host is using.
#
# ## Environment
#
#   TRACY_ROOT            /srv/tracy         where the sites live
#   TRACY_SITES_ROOT      /srv/tracy-sites   what the host dsh has bind-mounted at /site
#   TRACY_HOST_DSH        tracy-dsh          the host's dsh container
#   TRACY_HOST_DSH_HOME   $TRACY_ROOT/host-dsh/home
#   TRACY_HOST_DSH_OWNER  read from the container, else 33:33
#   TRACY_DOCKER          docker             the docker CLI (a test hands it a stub)
#   TRACY_CHOWN           chown              likewise, so a test can watch the call
#
# The roots are overridable so this is testable off a fleet host; they default to the real paths so
# nothing on the host has to be told anything.

# ── the pieces, sourceable ─────────────────────────────────────────────────────────────────────
#
# Same shape as render-compose.sh: functions here, `main` at the bottom, guarded — so a test can
# source this file and drive the level fix or the session copy on a fake tree without docker.

say() { echo "migrate: $*"; }
warn() { echo "migrate: !! $*" >&2; }
die() { echo "migrate: $*" >&2; exit 1; }

# Print instead of run when --dry-run is on. Mutations only: a read-only probe runs either way, so
# that a dry run on the host is a real preflight rather than a rehearsal of one.
#
# `%q` per argument, so a printed line with a space or a quote in it can be pasted back and mean
# the same thing.
run() {
  if [ "${DRY:-0}" = 1 ]; then
    printf '  DRY'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

# What a site label may be. Same case as attach-site.sh, character list AND the names that pass
# every character test while meaning something else in a path.
tracy_label_ok() {
  case "$1" in
    .|..|.*|*/*|*[!A-Za-z0-9._-]*|'') return 1 ;;
  esac
  return 0
}

# `true` / `false` / empty when there is no such container. Never fails the script: whether a
# container exists is a question, and the answer "no" is an answer.
container_state() {
  "${DOCKER:-docker}" inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true
}

# Count directory entries WITHOUT counting lines: a filename may contain a newline, and the count
# here decides between moving a customer's site folder and refusing to.
count_entries() {
  local dir="$1"
  shift
  find "$dir" -mindepth 1 -maxdepth 1 "$@" -exec printf . \; | wc -c | tr -d ' '
}

# Which uid the host dsh runs as, asked of the container. `host-dsh-init.sh` owns its /desk-home
# 33:33 and the site's web container calls the same uid `www-data` — one identity, two names — but
# reading it beats writing 33 in two places and finding out later that only one of them moved.
# Run `id` from the host dsh's own image, which is where its user names are defined.
# probe_image_id <image> <flag> [name]
probe_image_id() {
  if [ -n "${3:-}" ]; then
    "${DOCKER:-docker}" run --rm --entrypoint id "$1" "$2" "$3" 2>/dev/null | tr -dc '0-9' || true
  else
    "${DOCKER:-docker}" run --rm --entrypoint id "$1" "$2" 2>/dev/null | tr -dc '0-9' || true
  fi
}

# 🔒 A NUMBER, NEVER A NAME. `chown www-data` resolves the name in the HOST's passwd file, while the
# process that has to write these files resolves it in the CONTAINER's — two tables that agree on
# Debian by luck, not by rule. Three ways to a number, in order of how directly they ask:
#
#   1. the running process itself (`docker exec … id -u`)
#   2. `Config.User`, but only when it is already numeric
#   3. `id` run from the container's own image, which is where its names are defined
#
# and a refusal when none of them answers. Handing `chown` a name it might resolve differently is
# the failure this whole function exists to avoid, so it is not a fallback.
#
# 🔒 THE ANSWER IS CACHED IN `HOST_DSH_OWNER_RESOLVED`, and the adopt path fills it BEFORE it stops
# the container. Route 1 is the only one that asks the process, and it is unavailable to a stopped
# container — so an adopt that resolved lazily would take route 2 or 3 every time, at exactly the
# step whose blast radius is the registry every migrated site shares.
host_dsh_owner() {
  local declared uid gid image
  [ -n "${HOST_DSH_OWNER_RESOLVED:-}" ] && { printf '%s\n' "$HOST_DSH_OWNER_RESOLVED"; return 0; }
  [ -n "${TRACY_HOST_DSH_OWNER:-}" ] && { printf '%s\n' "$TRACY_HOST_DSH_OWNER"; return 0; }

  uid="$("${DOCKER:-docker}" exec "${HOST_DSH:-tracy-dsh}" id -u 2>/dev/null | tr -dc '0-9' || true)"
  gid="$("${DOCKER:-docker}" exec "${HOST_DSH:-tracy-dsh}" id -g 2>/dev/null | tr -dc '0-9' || true)"
  if [ -n "$uid" ] && [ -n "$gid" ]; then printf '%s:%s\n' "$uid" "$gid"; return 0; fi

  declared="$("${DOCKER:-docker}" inspect -f '{{.Config.User}}' "${HOST_DSH:-tracy-dsh}" 2>/dev/null || true)"
  case "$declared" in
    '') ;;
    *[!0-9:]*) ;;
    *:*) printf '%s\n' "$declared"; return 0 ;;
    *) printf '%s:%s\n' "$declared" "$declared"; return 0 ;;
  esac

  # Either the container names its user, or it declares nothing and the image's own default
  # applies. Both are questions only the image can answer.
  image="$("${DOCKER:-docker}" inspect -f '{{.Config.Image}}' "${HOST_DSH:-tracy-dsh}" 2>/dev/null || true)"
  if [ -n "$image" ]; then
    uid="$(probe_image_id "$image" -u "$declared")"
    gid="$(probe_image_id "$image" -g "$declared")"
    if [ -n "$uid" ] && [ -n "$gid" ]; then
      echo "== resolved ${declared:-the image default user} to $uid:$gid through $image (the container could not be entered)" >&2
      printf '%s:%s\n' "$uid" "$gid"
      return 0
    fi
  fi

  echo "!! cannot tell which uid ${HOST_DSH:-tracy-dsh} runs as: it could not be entered, Config.User is '${declared:-empty}', and its image answered nothing." >&2
  echo "   Refusing rather than chowning to a name this host would resolve in its own passwd file." >&2
  echo "   Pass it: TRACY_HOST_DSH_OWNER=<uid>:<gid> $0 …" >&2
  return 1
}

# Is a container really up? State AND health, never an exit code.
#
# 🔒 `docker start` RETURNS WHEN THE CONTAINER EXISTS, and `docker compose up -d` returns when it
# has asked. A container that dies a second later answers both of them successfully — which is the
# shape `rollback-site-from-host-dsh.sh` already refuses, and the shape an unwind nobody is watching
# must refuse too.
#
# The budget outlives the container's own `start_period` (180s in dsh/host-dsh.yml, "on a cold host
# that is minutes, not seconds"): a wait that expires before the healthcheck is even consulted is a
# wait that reports a healthy container as broken, or worse falls back to a weaker test.
container_ready() {
  local name="$1" budget="${2:-${TRACY_DSH_WAIT_SECONDS:-240}}" waited=0 state health
  while :; do
    state="$(container_state "$name")"
    health="$("${DOCKER:-docker}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$name" 2>/dev/null || true)"
    if [ "$state" = true ] && { [ -z "$health" ] || [ "$health" = healthy ]; } \
      && "${DOCKER:-docker}" exec "$name" true >/dev/null 2>&1; then
      return 0
    fi
    [ "$waited" -ge "$budget" ] && return 1
    sleep 2
    waited=$((waited + 2))
  done
}

# Where a lane keeps its /desk-home ON THE HOST — asked of the container, never assumed.
#
# 🔒 `<site>/dsh-home` IS NOT A RULE. `tracyai-dsh-alpha` — the lane of tracy.ai, the one site in
# the migration order that holds real seats — keeps its home at `<site>/dsh-home-alpha`. A guessed
# path finds no sessions directory, and "this lane has no conversations" and "I did not find this
# lane's conversations" are the same sentence to a script that guesses.
lane_desk_home() {
  "${DOCKER:-docker}" inspect "$1" \
    --format '{{range .Mounts}}{{if eq .Destination "/desk-home"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true
}

# ── step 2: the site folder's level, resumably ─────────────────────────────────────────────────
#
# A lane-era site keeps its site folder ONE LEVEL DEEPER than the new shape does. `create-lane.sh`
# mounted `$SITE_DIR/site/<label>` at `/site/<label>`; `attach-site.sh` binds `$SITE_DIR/site`
# itself. Attach a site that has not been levelled and the agent finds `/site/<label>/<label>` —
# it stands in a directory holding one directory, and describes the site as empty. No error.
#
# Refuses when both shapes hold content, because then only a person knows which one is the site —
# UNLESS the marker says the half-moved state is this script's own doing, in which case it finishes
# the move it started. An interrupted run must not leave a state only a person can unpick.
tracy_migrate_site_folder_level() {
  local outer="$SITE_DIR/site" inner="$SITE_DIR/site/$LABEL"
  local marker="$SITE_DIR/.site-level-migrating"
  if [ ! -d "$outer" ]; then
    warn "$outer does not exist — this site has no site folder yet (provision.sh stage 6e builds one)"
    return 0
  fi
  if [ ! -d "$inner" ]; then
    if [ -f "$marker" ]; then
      say "an earlier run finished the move — clearing $marker"
      run rm -f "$marker"
    else
      say "site folder is already at $outer"
    fi
    return 0
  fi

  local beside inside resuming=0
  beside="$(count_entries "$outer" ! -name "$LABEL")"
  inside="$(count_entries "$inner")"

  if [ -f "$marker" ]; then
    resuming=1
    say "resuming the interrupted move marked by $marker ($inside left inside)"
  elif [ "$beside" != 0 ] && [ "$inside" != 0 ]; then
    die "both shapes hold content: $outer has $beside entries beside $LABEL/, and $inner has $inside.
    Which of the two is the site is not something this can tell, and picking wrong overwrites a
    customer's files. Look at them, keep one, then run this again."
  fi

  if [ "$inside" = 0 ]; then
    say "$inner is empty — removing the extra level"
    run rmdir "$inner"
    run rm -f "$marker"
    return 0
  fi

  if [ "$resuming" = 0 ]; then
    # `.webroot` is excluded: inside the lane container it is the webroot's mount point, and on a
    # host where the lane is stopped it is an empty directory — but excluding it means this backup
    # can never accidentally become a second copy of a customer's whole site.
    #
    # 0600 because it sits beside a 0600 `.env` and holds the same site's working files.
    FOLDER_BACKUP="$SITE_DIR/site.pre-host-dsh.$STAMP.tgz"
    say "backing the site folder up to $FOLDER_BACKUP (without .webroot)"
    run tar czf "$FOLDER_BACKUP" --exclude .webroot -C "$outer" .
    run chmod 600 "$FOLDER_BACKUP"
    # The marker is written BEFORE the first mv, so a crash between two entries is recognisable.
    run touch "$marker"
  fi

  local entry base
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    base="${entry##*/}"
    [ -e "$outer/$base" ] && die "cannot lift $entry: $outer/$base already exists"
    run mv "$entry" "$outer/"
  done < <(find "$inner" -mindepth 1 -maxdepth 1)

  run rmdir "$inner"
  run rm -f "$marker"
  LEVELLED=1
  say "site folder lifted one level: $outer"
}

# ── step 3: who owns the site folder ───────────────────────────────────────────────────────────
#
# 🔒 THE AGENT HAS TO WRITE IN THERE. A lane-era site folder was built by `ensure-site-folder.mjs`
# running as root and served by a dsh running as uid 0, so it is root-owned. The host dsh runs as
# uid 33 and the agent's bash is `docker exec -u www-data` — the same uid under its other name. Root
# ownership READS fine, which is exactly why this is easy to miss: the agent summarises the site
# perfectly and then the first file it writes dies with EACCES, and the person sees a broken tool
# rather than a permission. `provision.sh` does this for a new site; a migration owes it too.
#
# Group read/traverse is added, never removed: something else on the host may already depend on it.
tracy_migrate_chown_site_folder() {
  local owner
  [ -d "$SITE_DIR/site" ] || return 0
  owner="$(host_dsh_owner)" || die "cannot own $SITE_DIR/site without knowing the uid — see above"
  say "giving $SITE_DIR/site to $owner (the uid the host dsh and www-data share)"
  run "${CHOWN:-chown}" -R "$owner" "$SITE_DIR/site" \
    || warn "could not chown $SITE_DIR/site to $owner — run this as root on the host, or the agent reads the site and cannot write to it"
  run chmod -R g+rX "$SITE_DIR/site" || true
}

# ── step 8: the lane's chat history ────────────────────────────────────────────────────────────
#
# See "SESSIONS" at the top of this file for why only one project directory moves and why the
# files alone do not make the history visible.
tracy_migrate_sessions() {
  local lane_home="${LANE_HOME:-}"
  local host_home="${TRACY_HOST_DSH_HOME:-$ROOT/host-dsh/home}"
  local staging="$ROOT/host-dsh/migrated/$LABEL"
  local project="--site-$LABEL--"
  SESSIONS_COPIED=0

  if [ -z "$lane_home" ]; then
    warn "no lane home known for $LABEL — nothing to carry over. If this site HAS a lane, pass --lane-home <path>: a missing history and an unfound one must not look alike."
    return 0
  fi
  # A lane always has this directory: `create-lane.sh` makes sessions/ storages/ dsh-passwords-data/
  # before the container starts. Its absence means the home is not the one this lane uses.
  [ -d "$lane_home/sessions" ] || die "$lane_home has no sessions/ — that is not a lane home. Read it from the container (docker inspect $LANE) or pass --lane-home."

  # The staging copy first, and it holds EVERYTHING the lane's sessions root has, plus its
  # storages/. It is the audit trail for a migration that has to be argued about later, and the
  # only copy of the project directories that must not be merged.
  #
  # 0700: it holds conversations from more than one customer's lane over a batch, and nothing reads
  # it on its own.
  say "staging the lane's session tree under $staging"
  run mkdir -p "$staging/sessions"
  run chmod 700 "$ROOT/host-dsh/migrated" "$staging"
  run cp -a "$lane_home/sessions/." "$staging/sessions/"
  if [ -d "$lane_home/storages" ]; then
    run mkdir -p "$staging/storages"
    run cp -a "$lane_home/storages/." "$staging/storages/"
  fi

  if [ ! -d "$lane_home/sessions/$project" ]; then
    warn "the lane has no $project directory — its conversations ran under some other cwd, so none of them merge automatically. They are in $staging."
    return 0
  fi

  run mkdir -p "$host_home/sessions/$project"
  local dir id copied=0 skipped=0
  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    id="${dir##*/}"
    if [ -e "$host_home/sessions/$project/$id" ]; then
      skipped=$((skipped + 1))
      continue
    fi
    run cp -a "$dir" "$host_home/sessions/$project/$id"
    copied=$((copied + 1))
  done < <(find "$lane_home/sessions/$project" -mindepth 1 -maxdepth 1 -type d)
  SESSIONS_COPIED="$copied"
  say "sessions carried over: $copied new, $skipped already there"

  # Same ownership argument as the site folder, one directory over.
  if [ "$copied" != 0 ]; then
    run "${CHOWN:-chown}" -R "$(host_dsh_owner)" "$host_home/sessions/$project" \
      || warn "could not chown $host_home/sessions/$project — the carried-over conversations are read-only to dsh"
  fi

  local strays
  strays="$(find "$lane_home/sessions" -mindepth 1 -maxdepth 1 -type d ! -name "$project" -exec basename {} \; | tr '\n' ' ')"
  if [ -n "$strays" ]; then
    warn "left in staging, NOT merged (their project directory name is shared by every lane, so merging them would mix two customers' conversations): $strays"
  fi
}

# ── the unwind ─────────────────────────────────────────────────────────────────────────────────
#
# Everything after step 1 is undoable, and a failure in the middle must not leave a site serving
# from a half-written state while its lane is stopped. What cannot be undone automatically — a
# half-moved or fully-moved site folder — is NAMED, with the command that finishes the job.
# Put the site folder back where the LANE binds it. The reverse of the level move, and it runs
# before the lane is allowed to start again.
#
# `.webroot` stays where it is: that directory is where attach-site.sh's bind lands, and moving a
# mount point's dentry leaves the mount attached to a path nobody can name.
# The caller only ever runs this on an empty destination — but the forward move refuses a collision
# rather than letting `mv` nest one directory inside another, and a function that trusts its caller
# is one refactor away from doing exactly that with a customer's files.
tracy_migrate_unlevel() {
  local entry base
  run mkdir -p "$SITE_DIR/site/$LABEL"
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    base="${entry##*/}"
    case "$base" in
      "$LABEL"|.webroot) continue ;;
    esac
    if [ -e "$SITE_DIR/site/$LABEL/$base" ]; then
      warn "cannot put $base back: $SITE_DIR/site/$LABEL/$base already exists"
      return 1
    fi
    run mv "$entry" "$SITE_DIR/site/$LABEL/"
  done < <(find "$SITE_DIR/site" -mindepth 1 -maxdepth 1)
}

tracy_migrate_unwind() {
  local code=$?
  [ "$code" = 0 ] && return 0
  [ "${STAGE:-preflight}" = acting ] || return 0

  warn "failed during: ${STEP:-?} — unwinding"
  if [ "${COMPOSE_REPLACED:-0}" = 1 ] && [ -f "${BACKUP:-}" ]; then
    warn "restoring the pre-migration compose"
    run cp -a "$BACKUP" "$SITE_DIR/docker-compose.yml" || warn "could not restore $BACKUP by hand: cp $BACKUP $SITE_DIR/docker-compose.yml"
  fi
  if [ "${WEB_RECREATED:-0}" = 1 ] || [ "${COMPOSE_REPLACED:-0}" = 1 ]; then
    if [ "${DRY:-0}" = 1 ]; then
      printf '  DRY (cd %q && %q compose up -d --no-deps web)\n' "$SITE_DIR" "$DOCKER"
    else
      ( cd "$SITE_DIR" && "$DOCKER" compose up -d --no-deps web ) || true
      container_ready "$WEB" "${TRACY_WEB_WAIT_SECONDS:-60}" \
        || warn "the web container did NOT come back (state, not exit code) — look at it now: $DOCKER logs --tail 50 $WEB"
    fi
  fi

  # 🔒 THE FOLDER GOES BACK BEFORE THE LANE DOES. The lane binds $SITE_DIR/site/<label>, and Docker
  # CREATES a missing bind source as an empty root-owned directory — a lane started against a
  # levelled site hands its agent an empty folder, and the agent says fluently that the site has
  # nothing in it. Starting the lane is therefore conditional on the folder being back.
  local folder_ok=1
  if [ -f "$SITE_DIR/.site-level-migrating" ]; then
    folder_ok=0
    warn "THE SITE FOLDER MOVE IS HALF DONE ($SITE_DIR/.site-level-migrating) — this will not guess which half. Re-run this script to finish it (it resumes), or restore $SITE_DIR/site.pre-host-dsh.*.tgz."
  elif [ "${LEVELLED:-0}" = 1 ]; then
    warn "putting the site folder back one level down, where $LANE binds it"
    if tracy_migrate_unlevel; then
      LEVELLED=0
    else
      folder_ok=0
      warn "could not put the site folder back — do NOT start $LANE until you have: rollback-site-from-host-dsh.sh $LABEL"
    fi
  fi

  if [ "${LANE_STOPPED:-0}" = 1 ] && [ -n "${LANE:-}" ]; then
    if [ "$folder_ok" = 0 ]; then
      warn "NOT starting $LANE: its bind source $SITE_DIR/site/$LABEL is not the site folder, and Docker would create it empty. Fix the folder first, then: $DOCKER start $LANE"
    else
      warn "starting $LANE again — the site keeps serving from its lane"
      run "$DOCKER" start "$LANE" || true
      if [ "${DRY:-0}" != 1 ] && ! container_ready "$LANE" "${TRACY_LANE_WAIT_SECONDS:-60}"; then
        warn "the lane did NOT come back up (state, not exit code): $DOCKER logs --tail 50 $LANE"
      fi
    fi
  fi
}

# ── --adopt-sessions-only ──────────────────────────────────────────────────────────────────────
#
# Its own run, because the alternative — a flag on the migration — re-renders the compose file,
# recreates the web container, re-attaches and stops the lane again on a site that has already
# moved, and says none of it.
# The unwind for the adopt run. Between `docker stop` and a verified `docker start` there is a
# window in which EVERY migrated site on this host has no agent, and `restart: unless-stopped` does
# not rescue a container somebody stopped on purpose. So the one step whose blast radius is a whole
# machine gets the same treatment as the one whose radius is a site.
tracy_adopt_unwind() {
  local code=$?
  [ "$code" = 0 ] && return 0
  [ "${ADOPT_STAGE:-before}" = stopped ] || return 0

  warn "failed during: ${STEP:-?} — putting $HOST_DSH back"
  if [ -f "${ADOPT_BACKUP:-}" ]; then
    warn "restoring the registry from $ADOPT_BACKUP"
    run cp -a "$ADOPT_BACKUP" "$ADOPT_FILE" || warn "could NOT restore it: cp -a $ADOPT_BACKUP $ADOPT_FILE"
    run "${CHOWN:-chown}" "$(host_dsh_owner)" "$ADOPT_FILE" || true
  fi
  run "$DOCKER" start "$HOST_DSH" || true
  if [ "${DRY:-0}" != 1 ] && ! container_ready "$HOST_DSH"; then
    warn "$HOST_DSH IS NOT SERVING. Every migrated site on this host is without an agent. Now:"
    warn "  cp -a $ADOPT_BACKUP $ADOPT_FILE && $DOCKER restart $HOST_DSH && $DOCKER logs --tail 80 $HOST_DSH"
  else
    warn "$HOST_DSH is serving again, on the registry as it was"
  fi
}

tracy_adopt_sessions_main() {
  set -euo pipefail
  local host_home started
  host_home="${TRACY_HOST_DSH_HOME:-$ROOT/host-dsh/home}"
  ADOPT_FILE="$host_home/storages/workspace.json"
  ADOPT_BACKUP=""
  ADOPT_STAGE=before
  STEP="read the registry"

  if [ ! -f "$ADOPT_FILE" ]; then
    say "$ADOPT_FILE does not exist yet — the host dsh bootstraps its registry from the session files on its next start, so there is nothing to flip"
    return 0
  fi
  command -v node >/dev/null 2>&1 \
    || die "no node on this host — cannot read $ADOPT_FILE safely. Set \"initialized\": false in its \"global\" object by hand while $HOST_DSH is stopped."

  # 🔒 THE UID IS READ WHILE THE CONTAINER CAN STILL BE ASKED. Every chown below this line happens
  # with the dsh stopped — in the flip, and again in the unwind — and a stopped container answers no
  # `docker exec`. Resolved here, once, into the cache `host_dsh_owner` reads first.
  STEP="read the uid the host dsh runs as"
  HOST_DSH_OWNER_RESOLVED="$(host_dsh_owner)" \
    || die "not stopping $HOST_DSH: without the uid it runs as, the registry would be chowned to a guess"
  say "host dsh runs as $HOST_DSH_OWNER_RESOLVED (read before the stop — a stopped container answers no exec)"

  # Said BEFORE the stop, for the same reason the migration shouts about its 530 window: the person
  # running this has to know what they are taking down before it is down.
  say "⚠ $HOST_DSH is about to STOP. Every site already migrated to this host is without an agent"
  say "  until it is serving again — a cold start is minutes, not seconds (start_period 180s)."
  trap tracy_adopt_unwind EXIT

  STEP="stop the host dsh"
  say "stopping $HOST_DSH — the JSON store keeps memory authoritative, so a file edited under a running dsh is overwritten at its next write"
  run "$DOCKER" stop "$HOST_DSH"
  ADOPT_STAGE=stopped

  # 🔒 THE BACKUP IS TAKEN AFTER THE STOP, and that is the whole point of taking one. dsh writes
  # its final state on the way down; a copy taken while it was running is not the document this
  # flip is applied to, and restoring it would throw away whatever the shutdown wrote.
  STEP="back the registry up"
  ADOPT_BACKUP="$ADOPT_FILE.pre-adopt.$STAMP"
  say "backing the registry up to $ADOPT_BACKUP (after the stop: this is the document being edited)"
  run cp -a "$ADOPT_FILE" "$ADOPT_BACKUP"

  # 🔒 THE SHAPE IS VALIDATED BEFORE IT IS WRITTEN. `workspaceDomainState` (workspace/src/spec.ts)
  # requires `workspaceIds` and gives it no default, so `{"initialized": false}` alone is a document
  # the domain refuses to open — and the workspace domain is authoritative data, so that refusal is
  # a boot failure for the WHOLE host. A `global` that is null or missing gets a complete, valid
  # object; a `global` whose `workspaceIds` is not an array is rebuilt the same way, because
  # `bootstrap()` recomputes the order from the table anyway once `initialized` is false.
  STEP="flip initialized to false"
  # shellcheck disable=SC2016  # the file path is an argv entry, not an expansion in this program
  run node -e '
    const fs = require("node:fs")
    const file = process.argv[1]
    const doc = JSON.parse(fs.readFileSync(file, "utf8"))
    if (doc?.unit?.name !== "workspace") throw new Error(`${file} is not the workspace unit`)
    const previous = (doc.global && typeof doc.global === "object" && !Array.isArray(doc.global)) ? doc.global : {}
    const ids = Array.isArray(previous.workspaceIds) ? previous.workspaceIds : []
    const archived = Array.isArray(previous.archivedSessionIds) ? previous.archivedSessionIds : []
    if (!Array.isArray(previous.workspaceIds)) {
      console.log("migrate: global had no workspaceIds array — writing a complete one")
    }
    doc.global = { ...previous, initialized: false, workspaceIds: ids, archivedSessionIds: archived }
    const mode = fs.statSync(file).mode & 0o777
    const tmp = `${file}.migrate.tmp`
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n", { mode })
    fs.renameSync(tmp, file)
    console.log(`migrate: ${file} -> initialized: false (${ids.length} workspaces kept in order)`)
  ' "$ADOPT_FILE"
  run "${CHOWN:-chown}" "$(host_dsh_owner)" "$ADOPT_FILE" \
    || warn "could not chown $ADOPT_FILE — dsh cannot rewrite its own registry, and the next workspace change fails"

  # 🔒 RFC3339 WITH A ZONE. `docker logs --since` reads a stamp with no zone as the HOST's local
  # time: west of UTC the mark lands in the future and NOTHING matches — every run reads "up and
  # quiet" no matter what dsh said; east of UTC it reaches back before the restart and prints a
  # complaint from the previous boot as if it were this one.
  STEP="start the host dsh"
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  run "$DOCKER" start "$HOST_DSH"

  # 🔒 `docker start` RETURNS WHEN THE CONTAINER EXISTS, NOT WHEN dsh SERVES. If bootstrap throws —
  # and it is meant to, the workspace domain is authoritative data and boots fail-loud — the
  # container crash-loops and EVERY site on this host is down while this script prints success.
  if [ "${DRY:-0}" = 1 ]; then
    say "(dry run: would wait for $HOST_DSH to serve, then read its log for a bootstrap error)"
    ADOPT_STAGE=before
    return 0
  fi
  STEP="wait for the host dsh to serve"
  container_ready "$HOST_DSH" \
    || die "$HOST_DSH is not serving ${TRACY_DSH_WAIT_SECONDS:-240}s after the flip (state and healthcheck, not an exit code)."

  # The vocabulary a refusal actually uses, read from the source rather than guessed:
  #   `domain '<unit>': stored global does not match its schema`  storage-domain/src/index.ts:207
  #   `unit '<name>': file is not valid JSON` / malformed-medium  storage-json/src/format.ts:52-83
  #   `version-mismatch`                                          storage-json/src/format.ts:68
  #   `workspace domain is inconsistent: …`                       workspace/src/index.ts:509-543
  # The first three are exactly what a hand-edited registry produces, and none of them contained
  # the words the earlier pattern looked for.
  STEP="read the log"
  local complaints
  complaints="$("$DOCKER" logs --since "$started" "$HOST_DSH" 2>&1 \
    | grep -iE 'does not match its schema|malformed-medium|version-mismatch|not valid JSON|DomainError|StorageError|workspace domain is inconsistent|SessionPersistenceCorruption|cannot (open|read) .*workspace|FATAL|unhandled' || true)"
  if [ -n "$complaints" ]; then
    warn "$HOST_DSH said this after the flip:"
    printf '%s\n' "$complaints" >&2
    die "restore and restart: cp -a $ADOPT_BACKUP $ADOPT_FILE && $DOCKER restart $HOST_DSH"
  fi
  ADOPT_STAGE=before
  trap - EXIT
  say "$HOST_DSH is up and quiet — it re-grouped every stored session by its cwd"
  say "backup of the registry as it was: $ADOPT_BACKUP"
}

# ── main ───────────────────────────────────────────────────────────────────────────────────────

tracy_migrate_main() {
  set -euo pipefail

  LABEL=""
  DRY=0
  STOP_LANE=1
  ADOPT_ONLY=0
  LANE=""
  LANE_HOME=""
  WEB=""
  STAGE=preflight
  STEP=""
  HOST_DSH_OWNER_RESOLVED="${HOST_DSH_OWNER_RESOLVED:-}"
  LEVELLED=0
  LANE_STOPPED=0
  COMPOSE_REPLACED=0
  WEB_RECREATED=0
  FOLDER_BACKUP=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) DRY=1; shift ;;
      --no-stop-lane) STOP_LANE=0; shift ;;
      # Both spellings, one meaning: it is a standalone run, never a step of the migration.
      --adopt-sessions-only|--adopt-sessions) ADOPT_ONLY=1; shift ;;
      --lane) [ $# -ge 2 ] || die "--lane needs a container name"; LANE="$2"; shift 2 ;;
      --lane-home) [ $# -ge 2 ] || die "--lane-home needs a path"; LANE_HOME="$2"; shift 2 ;;
      --web) [ $# -ge 2 ] || die "--web needs a container name"; WEB="$2"; shift 2 ;;
      -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
      -*) echo "unknown argument: $1" >&2; return 2 ;;
      *) LABEL="$1"; shift ;;
    esac
  done
  [ -n "$LABEL" ] || { echo "use: migrate-site-to-host-dsh.sh <label> [--dry-run] [--no-stop-lane] [--lane N] [--lane-home P] [--web N]" >&2; return 2; }
  tracy_label_ok "$LABEL" || die "unusable label: $LABEL"

  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT="${TRACY_ROOT:-/srv/tracy}"
  SITES="${TRACY_SITES_ROOT:-/srv/tracy-sites}"
  DOCKER="${TRACY_DOCKER:-docker}"
  # Overridable so a test can watch the call: it is the one mutation with no output of its own.
  CHOWN="${TRACY_CHOWN:-chown}"
  HOST_DSH="${TRACY_HOST_DSH:-tracy-dsh}"
  SITE_DIR="$ROOT/$LABEL"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  # attach-site.sh and render-compose.sh read these; a test run must not reach /srv.
  export TRACY_ROOT="$ROOT" TRACY_SITES_ROOT="$SITES"
  [ "$DRY" = 1 ] && say "DRY RUN — mutating commands are printed, not run"

  if [ "$ADOPT_ONLY" = 1 ]; then
    tracy_adopt_sessions_main
    return 0
  fi

  [ -n "$LANE" ] || LANE="$LABEL-dsh"
  [ -n "$WEB" ] || WEB="$LABEL-web-1"

  # ── PREFLIGHT: everything that can refuse, before anything moves ──
  STEP="preflight"
  [ -d "$SITE_DIR" ] || die "no site directory at $SITE_DIR"
  [ -f "$SITE_DIR/docker-compose.yml" ] || die "$SITE_DIR has no docker-compose.yml — this is not a site this script can move"
  [ -x "$HERE/render-compose.sh" ] || die "missing $HERE/render-compose.sh"
  [ -x "$HERE/attach-site.sh" ] || die "missing $HERE/attach-site.sh"

  local host_state lane_state
  host_state="$(container_state "$HOST_DSH")"
  if [ "$host_state" != true ]; then
    if [ "$DRY" = 1 ]; then
      warn "$HOST_DSH is not running (state: ${host_state:-absent}) — a real run would stop here"
    else
      die "$HOST_DSH is not running (state: ${host_state:-absent}) — bring the host dsh up first (dsh/host-dsh.yml)"
    fi
  fi

  # Read while the container is up, and reused by every chown below — including the ones the unwind
  # runs after something has gone wrong.
  if [ "$host_state" = true ]; then
    HOST_DSH_OWNER_RESOLVED="$(host_dsh_owner)" || die "cannot tell which uid $HOST_DSH runs as — see above"
    say "host dsh runs as $HOST_DSH_OWNER_RESOLVED"
  fi

  lane_state="$(container_state "$LANE")"
  if [ -z "$lane_state" ]; then
    warn "no container named $LANE — this site has no lane to stop (pass --lane <name> if it is called something else)"
    LANE=""
  else
    say "lane: $LANE (running: $lane_state)"
    if [ -z "$LANE_HOME" ]; then
      LANE_HOME="$(lane_desk_home "$LANE")"
      [ -n "$LANE_HOME" ] \
        || die "cannot read the /desk-home mount of $LANE. Its conversations live there and this will not guess a path — pass --lane-home <path>."
      say "lane home: $LANE_HOME (read from the container)"
    fi
    [ -d "$LANE_HOME" ] || die "$LANE_HOME does not exist on this host — that is not where $LANE keeps /desk-home"
  fi

  # Platform, from `.env` when it is written there and measured from the site when it is not.
  PLATFORM="$(sed -n 's/^PLATFORM=//p' "$SITE_DIR/.env" 2>/dev/null | head -1 || true)"
  local platform_from_env=1
  if [ -z "$PLATFORM" ]; then
    platform_from_env=0
    # A separate process rather than a sourced subshell: render-compose.sh declares names of its own
    # (LABEL, SITE_DIR, DB_NAME) and this only wants one answer out of it.
    PLATFORM="$(
      PLATFORM='' SITE_DIR="$SITE_DIR" bash -c \
        '. "$1"; tracy_read_existing_compose; tracy_detect_platform' _ "$HERE/render-compose.sh"
    )" || die "cannot tell which platform $LABEL is — write PLATFORM=<joomla|wordpress|emdash> into $SITE_DIR/.env and run again"
  fi
  say "platform: $PLATFORM ($([ "$platform_from_env" = 1 ] && echo 'from .env' || echo measured))"

  # 🔒 THE COMPOSE FILE IS RENDERED NOW, INTO A SHADOW OF THE SITE DIRECTORY. Rendering is the step
  # that refuses when this site's base image has no line in web/IMAGE_TAGS, and it used to refuse
  # AFTER the site folder had already been moved — a clean-looking refusal that had already blinded
  # a running lane's agent. The shadow holds copies of the only two files the renderer reads.
  SHADOW="$(mktemp -d "${TMPDIR:-/tmp}/tracy-hostdsh-shadow-XXXXXX")"
  # shellcheck disable=SC2064  # $SHADOW is expanded now on purpose: the trap must name this path
  trap "rm -rf '$SHADOW'" EXIT
  mkdir -p "$SHADOW/$LABEL"
  chmod 700 "$SHADOW" "$SHADOW/$LABEL"
  cp -a "$SITE_DIR/docker-compose.yml" "$SHADOW/$LABEL/docker-compose.yml"
  [ -f "$SITE_DIR/.env" ] && cp -a "$SITE_DIR/.env" "$SHADOW/$LABEL/.env"
  RENDERED="$SHADOW/$LABEL/docker-compose.yml"
  TRACY_ROOT="$SHADOW" "$HERE/render-compose.sh" "$LABEL" --root "$SHADOW" --platform "$PLATFORM" \
    || die "the compose file for $LABEL cannot be rendered — nothing has been touched. Fix that first (an unlisted base image is the usual reason: bash /opt/tracy-fleet/web/build.sh)"
  WEB_IMAGE="$(sed -n 's/^ *image: *//p' "$RENDERED" | grep -v '^mariadb' | head -1 || true)"
  say "rendered ahead of time: $WEB_IMAGE"

  # The site folder: examined, not touched. The refusal that needs a person happens here.
  if [ -d "$SITE_DIR/site/$LABEL" ] && [ ! -f "$SITE_DIR/.site-level-migrating" ]; then
    local beside inside
    beside="$(count_entries "$SITE_DIR/site" ! -name "$LABEL")"
    inside="$(count_entries "$SITE_DIR/site/$LABEL")"
    [ "$beside" != 0 ] && [ "$inside" != 0 ] \
      && die "both shapes of the site folder hold content ($beside beside $LABEL/, $inside inside). Nothing has been touched. Look at them, keep one, then run this again."
  fi

  say "preflight passed — acting now"

  # ── ACTING: from here a failure unwinds ──
  STAGE=acting
  trap 'tracy_migrate_unwind; rm -rf "$SHADOW"' EXIT

  # 1. Stop the lane FIRST: session logs copied out of a running dsh have a torn final frame, and
  #    the conversation that tears is the newest one.
  STEP="stop the lane"
  if [ "$STOP_LANE" = 1 ] && [ -n "$LANE" ]; then
    say "stopping $LANE so its session logs are quiet before they are copied"
    say "⚠ from now until the KV flag is set, seats at this site reach a stopped container (530). Keep it short."
    run "$DOCKER" stop "$LANE"
    LANE_STOPPED=1
  elif [ -n "$LANE" ]; then
    warn "--no-stop-lane: the lane keeps running, so the NEWEST conversation may be copied mid-write and fail to open on the host dsh"
  fi

  # 2-3. the two things on disk that predate Plan 3
  STEP="level the site folder"
  tracy_migrate_site_folder_level
  STEP="own the site folder"
  tracy_migrate_chown_site_folder

  if [ "$platform_from_env" = 0 ]; then
    STEP="write PLATFORM into .env"
    if [ "$DRY" = 1 ]; then
      printf '  DRY printf %q >> %q\n' "PLATFORM=$PLATFORM\\n" "$SITE_DIR/.env"
    else
      printf 'PLATFORM=%s\n' "$PLATFORM" >> "$SITE_DIR/.env"
    fi
  fi

  # 4. back the compose file up ONCE, then move the file rendered in preflight into place.
  STEP="swap the compose file"
  local existing
  existing="$(find "$SITE_DIR" -maxdepth 1 -name 'docker-compose.yml.pre-host-dsh.*' | sort)"
  existing="${existing%%$'\n'*}"
  if [ -n "$existing" ]; then
    say "keeping the pre-migration compose backup already taken: $existing"
    BACKUP="$existing"
  else
    BACKUP="$SITE_DIR/docker-compose.yml.pre-host-dsh.$STAMP"
    run cp -a "$SITE_DIR/docker-compose.yml" "$BACKUP"
    say "compose backed up to $BACKUP"
  fi
  # 🔒 STAGED, FLAGGED, THEN RENAMED. `cp` truncates the destination before it writes, so a failure
  # inside that one command leaves half a compose file that the unwind would not know to restore —
  # the very hazard render-compose.sh writes tmp+rename to avoid, re-introduced by the command that
  # copies its result into place. The flag goes up before the rename, so any outcome unwinds.
  run cp -a "$RENDERED" "$SITE_DIR/.docker-compose.yml.host-dsh"
  COMPOSE_REPLACED=1
  run mv "$SITE_DIR/.docker-compose.yml.host-dsh" "$SITE_DIR/docker-compose.yml"

  # 5. recreate the web container. `--no-deps` so the database is genuinely untouched: every shape
  #    declares `depends_on: [db]`, and without this compose would notice that the re-rendered `db`
  #    service differs (--max-allowed-packet) and restart a customer's database as a side effect.
  STEP="recreate the web container"
  say "recreating the web container — the site is down for the seconds this takes; db is left alone (--no-deps)"
  if [ "$DRY" = 1 ]; then
    printf '  DRY (cd %q && %q compose up -d --no-deps web)\n' "$SITE_DIR" "$DOCKER"
  else
    ( cd "$SITE_DIR" && "$DOCKER" compose up -d --no-deps web )
  fi
  WEB_RECREATED=1

  # 6. show the site to the host dsh
  STEP="attach the site"
  run "$HERE/attach-site.sh" "$LABEL"

  # 7. two WRITE probes. A read-only probe answers the wrong question: the migration's whole point
  #    is an agent that can work in /site/<label>, and reading was never in doubt.
  STEP="probe from inside the web container"
  local probe='test -f AGENTS.md && command -v rg git >/dev/null'
  [ "$PLATFORM" = wordpress ] && probe="$probe && command -v wp >/dev/null"
  probe="$probe && t=\".tracy-write-probe.\$\$\" && touch \"\$t\" && rm -f \"\$t\""
  if [ "$DRY" = 1 ]; then
    printf '  DRY %q exec -u www-data -w /site/%s %q bash -c %q\n' "$DOCKER" "$LABEL" "$WEB" "$probe"
  elif "$DOCKER" exec -u www-data -w "/site/$LABEL" "$WEB" bash -c "$probe" >/dev/null 2>&1; then
    say "web container: /site/$LABEL has AGENTS.md, the agent's tools, and is WRITABLE by www-data"
  elif [ "$PLATFORM" = emdash ]; then
    # The emdash image is a Node container, not php-apache: it may carry neither bash nor www-data,
    # and that is a fact about the image rather than a failed migration.
    warn "the probe did not run in $WEB (emdash image) — check by hand: $DOCKER exec -w /site/$LABEL $WEB sh -c 'ls AGENTS.md && touch .p && rm .p'"
  else
    die "$WEB cannot work in /site/$LABEL (missing file, missing tool, or no write permission). Look at: $DOCKER exec -u www-data -w /site/$LABEL $WEB bash -c '$probe'"
  fi

  STEP="probe from inside the host dsh"
  local attached=false
  local dsh_probe="cd /site/$LABEL && t=.tracy-dsh-write-probe.\$\$ && touch \$t && rm -f \$t"
  if [ "$DRY" = 1 ]; then
    printf '  DRY %q exec %q sh -c %q\n' "$DOCKER" "$HOST_DSH" "$dsh_probe"
    attached=unknown
  elif "$DOCKER" exec "$HOST_DSH" sh -c "$dsh_probe" >/dev/null 2>&1; then
    attached=true
    say "host dsh: /site/$LABEL is there and WRITABLE by the user dsh runs as"
  else
    die "$HOST_DSH cannot write in /site/$LABEL. Either the bind did not propagate (is /srv/tracy-sites rshared? see attach-site.sh) or the folder is owned by somebody else (step 3)."
  fi

  # 8. chat history — after the lane was stopped, so nothing is being written while it is read.
  STEP="carry the conversations over"
  tracy_migrate_sessions

  STAGE=finished
  trap 'rm -rf "$SHADOW"' EXIT

  # 9. the answer
  printf '{"label":"%s","platform":"%s","webImage":"%s","attached":%s,"sessionsCopied":%s,"laneStopped":%s}\n' \
    "$LABEL" "$PLATFORM" "$WEB_IMAGE" \
    "$([ "$attached" = unknown ] && echo null || echo "$attached")" \
    "${SESSIONS_COPIED:-0}" \
    "$([ "$LANE_STOPPED" = 1 ] && [ "$DRY" != 1 ] && echo true || echo false)"

  say ""
  say "NOW, from a machine with wrangler — the site is dark until this is done. TWO keys:"
  say "  cd workers/cowork-web"
  say "  npx wrangler kv key put --binding=FLEET_SITES \"host-dsh:$LABEL\" on --remote"
  say "  npx wrangler kv key put --binding=FLEET_SITES \"attached:$LABEL\" on --remote"
  say ""
  # `attached:` is normally written by seat-registry when IT calls /site-attach. A migration runs
  # attach-site.sh straight from the host, so nobody writes that row — and `laneUp` asks for it
  # before it will say an agent is ready.
  say "the second one because this migration attached the site from the host, not through"
  say "seat-registry — and laneUp asks for it before it will call the agent ready."
  if [ "${SESSIONS_COPIED:-0}" != 0 ]; then
    say ""
    say "the carried-over conversations appear after the adopt step. ONCE per batch, not per site:"
    say "  $0 <any label> --adopt-sessions-only"
  fi
  say "rollback: rollback-site-from-host-dsh.sh $LABEL   (and delete both keys)"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  tracy_migrate_main "$@"
fi
