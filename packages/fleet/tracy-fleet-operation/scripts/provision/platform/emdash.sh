# EmDash-specific half of a provision. Sourced by provision.sh; see platform/README.md.
#
# Unlike the PHP platforms this one does not RESTORE a captured site — it INSTALLS a fresh
# one. The image carries the whole application (EmDash blog template built standalone, Node 22,
# port 4321) and the database is a SQLite file inside the site dir, so there is no archive to
# fetch and no MariaDB to stand up. Content, schema and uploads live in ./data and ./uploads
# bind mounts; the container is disposable, the site dir is the site.
# The newest EmDash image PRESENT on this host, not a hard-coded constant.
#
# 🔒 `tracy/emdash:0.34.0` was hard-coded here until 29/08, and it broke in the worst way once the
# fleet had a second host: the new host did not have that image, `docker compose up` asked Docker
# Hub, and Hub answered "repository does not exist" — an EmDash site could not be built, with an
# error about the registry rather than saying nobody had built the image on this machine. Measured
# on the new host the same day.
#
# No build here: the monorepo needs ~15 GB of scratch and several minutes, and a provision that
# fails halfway on a full disk is worse than one that refuses at once. `emdash/build-image.sh` builds
# the image; this only picks one — and refuses loudly, with the exact command to run, when there is
# none.
_emdash_local_image() {
  docker images --format '{{.Repository}}:{{.Tag}}' 'tracy/emdash' 2>/dev/null \
    | grep -vE ':(latest|<none>)$' | sed 's|^tracy/emdash:||' | sort -V | tail -1
}
# 🔒 AN IMAGE REFERENCE ARRIVES FROM OFF THIS HOST, SO IT IS CHECKED HERE.
# The harness binds an image to each design system and provision is handed the reference
# (`--image`); this is the one value in a provision that ends up as an argument to a container
# runtime, so a foreign registry in it is someone else's code running as this host. Only Tracy's
# own namespace is accepted, and the refusal names what was asked for — a provision that stops
# here costs one message, while one that pulls is not recoverable by reading a log.
# 🔒 A QUICKSTART DECIDES THE IMAGE, AND IT IS NOT AN UPSTREAM ONE.
#
# Without a quickstart this platform installs a bare EmDash from whatever `tracy/emdash:<ver>` this
# host has built, and `platform_post_up` runs the CMS's own setup wizard. With one, the site starts
# as a finished Tracy template: the release's packed source is built into `tracy/<template>-emdash:
# <version>` HERE (no registry — ADR 0014) and the scrubbed state is restored beside it, so the
# first request already answers with the template's own content in every language it ships.
#
# The two parts are fetched by `quickstart.py`, which refuses anything whose sha256 is not pinned in
# `quickstarts.json` BEFORE the network — the catalog is the only thing that says which bytes are
# this template, and a download that verified afterwards would have already written them.
if [ -n "${QUICKSTART:-}" ]; then
  # shellcheck source=../emdash/quickstart-restore.sh
  . "$HERE/emdash/quickstart-restore.sh"
  _q_template="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field template.id 2>/dev/null || true)"
  _q_version="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field version)"     || { echo "!! quickstart $QUICKSTART names no version" >&2; exit 1; }
  [ -n "$_q_template" ] || { echo "!! quickstart $QUICKSTART declares no template" >&2; exit 1; }
  WEB_IMAGE="tracy/$_q_template-emdash:$_q_version"
  mkdir -p "$SITE_DIR/work"
  # The tag carries the template's own version, so an image that is already here IS this template:
  # nothing to fetch and nothing to build. A re-provision of a correct site must not spend 4 MB and
  # several minutes rebuilding it — and calling the build with no zip beside it is what broke the
  # second run on 15/09.
  if docker image inspect "$WEB_IMAGE" >/dev/null 2>&1; then
    echo "==> image $WEB_IMAGE is on this host — not fetching the template again"
  else
    echo "==> fetching the packed template of $QUICKSTART"
    python3 "$HERE/quickstart.py" --id "$QUICKSTART" --part source --out "$SITE_DIR/work/quickstart.zip"       || { echo "!! could not fetch the quickstart source" >&2; exit 1; }
    emdash_build_image "$SITE_DIR/work/quickstart.zip" "$WEB_IMAGE" "$SITE_DIR"     || { echo "!! could not build $WEB_IMAGE" >&2; exit 1; }
    rm -f "$SITE_DIR/work/quickstart.zip"
  fi
  if [ ! -f "$SITE_DIR/data/data.db" ]; then
    echo "==> fetching the state snapshot of $QUICKSTART"
    python3 "$HERE/quickstart.py" --id "$QUICKSTART" --part state --out "$SITE_DIR/work/state.tar.gz"       || { echo "!! could not fetch the quickstart state" >&2; exit 1; }
    emdash_restore_state "$SITE_DIR/work/state.tar.gz" "$SITE_DIR"       || { echo "!! could not restore the quickstart state" >&2; exit 1; }
    rm -f "$SITE_DIR/work/state.tar.gz"
    # A database copied from the quickstart is a NEW site: its Content API identity is forked, not
    # inherited from whatever site the snapshot was captured on (platform_post_up).
    _EMDASH_STATE_RESTORED=1
  fi
  # The agent's tools on the template's own image (quickstart-restore.sh says why): without them
  # its page.look and page.text have no browser to run in this container.
  emdash_tools_image "$WEB_IMAGE"
  WEB_IMAGE="$EMDASH_TOOLS_IMAGE"
  echo "==> EmDash image (quickstart $QUICKSTART): $WEB_IMAGE"
elif [ -n "${TRACY_EMDASH_IMAGE:-}" ]; then
  case "$TRACY_EMDASH_IMAGE" in
    tracy/*:*) : ;;
    *)
      echo "!! refused image \"$TRACY_EMDASH_IMAGE\": only tracy/<name>:<tag> is accepted here." >&2
      exit 1
      ;;
  esac
  WEB_IMAGE="$TRACY_EMDASH_IMAGE"
  echo "==> image the harness pinned to this design system: $WEB_IMAGE"
else
  # `|| true`: the pipeline in _emdash_local_image ends in grep, which exits 1 when this host has
  # no tracy/emdash image at all — and under go-live.sh's `set -euo pipefail` a failing command
  # substitution in an assignment ends the script with no message. That silent exit, right after
  # "mail egress: OPEN", was every EmDash go-live on dev (16/09).
  _emdash_ver="$(_emdash_local_image || true)"
  # go-live.sh sources this file too, for a site that already runs, with neither QUICKSTART nor
  # TRACY_EMDASH_IMAGE in its env. Such a site's image is the one in its compose — a quickstart's
  # (ADR 0017) or the one the harness chose — and a host with no tracy/emdash:* build is not a
  # reason to exit before the caller did what it came for. Measured 16/09 on dev: every EmDash
  # demo's go-live died right here, "no tracy/emdash image on this host yet", after the mail
  # egress rule had already been opened.
  _emdash_site_image=""
  for _emdash_compose in "$SITE_DIR/docker-compose.yml" "$SITE_DIR/compose.yml"; do
    [ -f "$_emdash_compose" ] || continue
    _emdash_site_image="$(sed -n 's/^[[:space:]]*image:[[:space:]]*//p' "$_emdash_compose" | sed -n 1p)"
    [ -n "$_emdash_site_image" ] && break
  done
  if [ -n "$_emdash_ver" ]; then
    WEB_IMAGE="tracy/emdash:$_emdash_ver"
  elif [ -n "$_emdash_site_image" ]; then
    WEB_IMAGE="$_emdash_site_image"
    _emdash_from_site=1
    echo "==> EmDash image this site is already running (compose): $WEB_IMAGE"
  else
    echo "!! no tracy/emdash image on this host yet." >&2
    echo "   build the latest upstream version:  bash $TRACY_FLEET_DIR/provision/emdash/build-image.sh" >&2
    exit 1
  fi
fi
# Since Plan 3 this container is also the agent's shell (`docker exec` from the host's dsh), so the
# image must have git/rg/less/jq. `web/emdash.Dockerfile` layers them onto the EmDash image of the
# same version; the function below takes that build when it exists, and SHOUTS when it does not —
# the site is still built, its agent just cannot grep.
# A running site's own image (above) is not a tracy/emdash tag and is not moved.
if [ -z "${QUICKSTART:-}" ] && [ -z "${_emdash_from_site:-}" ]; then
  WEB_IMAGE="$(tracy_emdash_web_image "$WEB_IMAGE")"
  echo "==> EmDash image: $WEB_IMAGE"
fi
DB_NAME=""
DB_SQL_MODE=""
PLATFORM_NEEDS_WEBROOT=0
PLATFORM_NEEDS_DB=0

# ── the site's agent PAT: one protected home, off every agent-writable path (#155) ──────────────
#
# The token EmDash's resident agent authenticates with is a root-owned 0600 regular file at
# $SITE_DIR/tracy-agent.token — under the PRIVATE root ($TRACY_PRIVATE_ROOT/<label>), which is
# mounted into NEITHER dsh nor the container. render-compose bind-mounts it READ-ONLY into the web
# container at /run/tracy-agent.token, OUTSIDE /app and /app/data (the agent-writable volumes), so
# the container's own www-data agent shell can neither read it nor replace it; only a root
# `docker exec` — the site-tools MCP transport — reads it. Both provision branches (generic mint and
# tracy-business bootstrap) converge on THIS file, so the reader has one contract to satisfy.
#
# 🔒 The value is validated but NEVER printed: the provision log reaches the desk.
_emdash_agent_token_file() { printf '%s' "$SITE_DIR/tracy-agent.token"; }

# 🔒 EVERY STEP OF TOKEN CUSTODY PROPAGATES ITS OWN FAILURE, because these helpers are called as
# `if _emdash_store_agent_token …; then` and from `platform_compose`, and a function invoked in an
# `if`/`!`/`||` condition runs with errexit DISABLED throughout its body. Under that rule a failed
# `printf > "$f"` followed by a succeeding `chmod` used to return SUCCESS — reproduced against these
# very helpers with a DIRECTORY at the destination. So nothing here leans on `set -e`: each write,
# permission and validation step is checked with `… || return 1`, and no step is `|| true`'d away.

# Fail closed on a token PATH that is not a plain, root-ownable regular file, BEFORE anything writes
# through it. A symlink would redirect the write (and, if followed, could plant the PAT under an
# agent-writable path that can then read it); a directory is the "compose came up before the file
# existed" case. Checked with -L FIRST, because -d/-e/-f follow the link.
_emdash_guard_token_path() {
  local f="$1"
  if [ -L "$f" ]; then
    echo "!! $f is a symlink — refusing to write the agent token through it" >&2
    return 1
  fi
  if [ -d "$f" ]; then
    echo "!! $f is a directory (a compose brought up before the file existed) — remove it and re-provision" >&2
    return 1
  fi
  if [ -e "$f" ] && [ ! -f "$f" ]; then
    echo "!! $f is not a regular file — refusing to write the agent token through it" >&2
    return 1
  fi
}

# Establish AND verify the protected permissions and OWNERSHIP, failing closed on each step. Root
# ownership is the whole guard — a token under an agent-writable owner is not acceptable, and
# provision has NO root guard, so a run as any non-root uid (uid 33 IS www-data, the agent's own
# seat) must not be allowed to leave the file under that uid. There is therefore NO "skip chown when
# not root" branch: `chown 0:0` is always attempted, and a failure FAILS the helper — a non-root
# real run cannot chown to uid 0 and so fails closed here, exactly as intended. The end state is then
# READ BACK with stat (uid 0, mode 0600, regular non-symlink), because a command that returned 0 is
# not proof of the resulting owner/mode. Flow tests shadow chown/stat to exercise orchestration; the
# real root:0600 custody, and that www-data/nobody cannot read or replace it, is proven on Linux by
# the exec fixture in this package.
_emdash_secure_token_perms() {
  local f="$1" uid mode
  chmod 600 "$f" || { echo "!! could not chmod 600 the agent token file" >&2; return 1; }
  chown 0:0 "$f" || { echo "!! could not chown the agent token file to root:root" >&2; return 1; }
  uid="$(stat -c '%u' "$f" 2>/dev/null || stat -f '%u' "$f" 2>/dev/null)" \
    || { echo "!! could not read back the agent token file owner" >&2; return 1; }
  mode="$(stat -c '%a' "$f" 2>/dev/null || stat -f '%Lp' "$f" 2>/dev/null)" \
    || { echo "!! could not read back the agent token file mode" >&2; return 1; }
  [ "$uid" = 0 ] || { echo "!! the agent token file is not owned by root (uid ${uid:-?}) after securing it" >&2; return 1; }
  [ "$mode" = 600 ] || { echo "!! the agent token file mode is ${mode:-?} not 600 after securing it" >&2; return 1; }
  # A regular file, not a symlink — catches a target whose shape changed between the guard and here.
  [ -f "$f" ] && [ ! -L "$f" ] || { echo "!! the agent token file is not a regular file after securing it" >&2; return 1; }
}

# Create the token file as an empty root-owned 0600 REGULAR file if it is not already present, BEFORE
# `docker compose up` mounts it. Without this, Docker would create a DIRECTORY at the bind source and
# the read-only file mount would be a folder. Never clobbers an already-minted token: an existing
# regular file keeps its bytes AND its inode (the bind mount holds that inode), and only its
# permissions/owner are re-asserted.
_emdash_prepare_token_file() {
  local f; f="$(_emdash_agent_token_file)"
  _emdash_guard_token_path "$f" || return 1
  if [ ! -e "$f" ]; then
    # umask 077 so the file is never briefly group/other-readable between create and chmod.
    ( umask 077; : > "$f" ) || { echo "!! could not create the agent token file" >&2; return 1; }
  fi
  _emdash_secure_token_perms "$f" || return 1
}

# Store a validated PAT into the file IN PLACE. The file is PREPARED AND SECURED BEFORE the token
# bytes land: a missing file is created 0600 under umask 077 (never briefly world-readable) and a
# bad-shape/owner destination is rejected or re-secured FIRST, so a secret is never written through a
# world-readable inode, a symlink, or a directory. An existing protected file keeps its inode (`>`
# truncates in place), so the read-only bind mount stays valid without a recreate. After the write
# the owner/mode/regular end state is re-asserted and VERIFIED (not assumed). Returns nonzero —
# without printing the value or any raw source — when the argument is not the minted shape the reader
# accepts (the same `^ec_pat_[A-Za-z0-9_-]{16,}$` the in-container MCP script enforces), or when any
# prepare/write/permission/verification step fails.
_emdash_store_agent_token() {
  local tok="$1" f; f="$(_emdash_agent_token_file)"
  [[ "$tok" =~ ^ec_pat_[A-Za-z0-9_-]{16,}$ ]] || return 1
  _emdash_prepare_token_file || return 1
  printf '%s\n' "$tok" > "$f" || { echo "!! could not write the agent token file" >&2; return 1; }
  _emdash_secure_token_perms "$f" || return 1
}

# ── the Content API relay PAT: read-only, generated here, never inside the container ────────────
#
# An image built with the Content API scalar reader (label `io.tracy.content-api.scalars=1`, the
# template Dockerfiles' build arg — Business, Base, SaaS) answers `POST /content.json` for Tracy's relay. The relay reads
# with its OWN token, scope `content:read` only — never the agent's admin PAT. The raw token is
# generated on the host into $SITE_DIR/tracy-content.token (root 0600, same custody helpers as the
# agent token, and NOT mounted into the container). The site gets only digests: the base64url
# SHA-256 EmDash stores (register-content-token.cjs), and the hex SHA-256 the reader checks relay
# authority against, in /app/tracy-content-relay.sha256 — root-owned inside the root-owned /app, so
# the site user and its agent shell cannot swap it. Not an env line: the compose file is an exact
# form the agent-token custody matchers prove (render-compose.test.mjs), and a new key there would
# turn every new site's custody unknown. tracy-host hands the raw token to tracy-web through
# `/_host/content-token`. Kept across re-provisions, like the encryption key.
_emdash_content_token_file() { printf '%s' "$SITE_DIR/tracy-content.token"; }
_emdash_content_api_image() {
  [ "$(docker image inspect "$WEB_IMAGE" --format '{{ index .Config.Labels "io.tracy.content-api.scalars" }}' 2>/dev/null)" = 1 ]
}
_emdash_prepare_content_token() {
  local f tok
  f="$(_emdash_content_token_file)"
  _emdash_guard_token_path "$f" || return 1
  tok="$(cat "$f" 2>/dev/null || true)"
  if ! [[ "$tok" =~ ^ec_pat_[A-Za-z0-9_-]{43}$ ]]; then
    tok="ec_pat_$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"
    ( umask 077; printf '%s\n' "$tok" > "$f" ) || { echo "!! could not write the content token file" >&2; return 1; }
  fi
  _emdash_secure_token_perms "$f" || return 1
}
# SHA-256 of stdin as hex (the reader's relay check) or unpadded base64url (what EmDash stores).
_emdash_digest() {
  python3 -c 'import sys,hashlib,base64
d=hashlib.sha256(sys.stdin.buffer.read()).digest()
print(d.hex() if sys.argv[1]=="hex" else base64.urlsafe_b64encode(d).decode().rstrip("="))' "$1"
}
# Register the relay PAT's hash in the site's database and give the site its Content API identity.
# A database restored from the quickstart in this run forks (new seed and epoch: a new site, not
# the snapshot's); any other run only initialises, which never rotates an identity already there.
# Both also stamp repeater row identity (`_rowId`, option A: a new row gets a new id, nothing is
# refused), so `personalize --revert` keeps working; there is no separate migrate step.
_emdash_content_api_post_up() {
  local tok hash web="${LABEL}-web-1"
  tok="$(cat "$(_emdash_content_token_file)")" || return 1
  hash="$(printf '%s' "$tok" | _emdash_digest base64url)" || return 1
  docker cp "$HERE/emdash/register-content-token.cjs" "$web:/app/tracy-content-token.cjs" 2>/dev/null \
    || docker cp "$TRACY_FLEET_DIR/provision/emdash/register-content-token.cjs" "$web:/app/tracy-content-token.cjs" \
    || { echo "!! could not copy the content token helper into the container" >&2; return 1; }
  if ! docker exec -u www-data -w /app -e TRACY_CONTENT_TOKEN_HASH="$hash" -e TRACY_CONTENT_TOKEN_PREFIX="${tok:0:11}" \
      "$web" node tracy-content-token.cjs >/dev/null 2>&1; then
    docker exec -u 0 "$web" rm -f /app/tracy-content-token.cjs >/dev/null 2>&1 || true
    echo "!! could not register the Content API token — refusing to mark this site ready" >&2
    return 1
  fi
  docker exec -u 0 "$web" rm -f /app/tracy-content-token.cjs >/dev/null 2>&1 || true
  # The digest the reader trusts relay authority for: over stdin, never argv; root-owned 0644.
  if ! printf '%s' "$tok" | _emdash_digest hex | docker exec -i -u 0 -w /app "$web" sh -c \
      'umask 022; cat > tracy-content-relay.sha256 && chown 0:0 tracy-content-relay.sha256 && chmod 644 tracy-content-relay.sha256'; then
    echo "!! could not record the Content API relay digest — refusing to mark this site ready" >&2
    return 1
  fi
  # /app is the site user's: site.rebuild and `pnpm install` run as www-data and stop on EACCES at
  # the first file someone else owns (24/10/2026: an image layer left 2,421 such files). The
  # digest above is the one file that is root's on purpose. A warning, not a failure: the site
  # serves either way, and the fix belongs in the image (web/install-emdash-receiver.mjs).
  local foreign
  foreign="$(docker exec -u 0 "$web" find /app -xdev ! -user www-data ! -path /app/tracy-content-relay.sha256 2>/dev/null | wc -l | tr -d ' ')"
  [ "${foreign:-0}" = 0 ] \
    || echo "!! warning: $foreign files under /app are not owned by www-data — rebuilds and package installs will fail" >&2
  local identity=(init /app/data/data.db)
  [ -n "${_EMDASH_STATE_RESTORED:-}" ] && identity=(fork /app/data/data.db "$(python3 -c 'import uuid; print(uuid.uuid4())')")
  if ! docker exec -u www-data -w /app "$web" node tools/content-api/identity-sqlite.mjs "${identity[@]}" >/dev/null 2>&1; then
    echo "!! could not ${identity[0]} the Content API identity — refusing to mark this site ready" >&2
    return 1
  fi
  echo "    Content API: read-only relay token registered, identity ${identity[0]}"
}

platform_compose() {
  # Per site, generated ONCE, then kept — same rule as DB_PASSWORD and for the same reason:
  # the key encrypts secrets already sitting in data/data.db, so a fresh key on re-provision
  # would orphan them. Format the runtime validates: emdash_enc_v1_ + 32 bytes base64url.
  if ! grep -qs '^EMDASH_ENCRYPTION_KEY=' "$SITE_DIR/.env"; then
    local key_body
    key_body="$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"
    echo "EMDASH_ENCRYPTION_KEY=emdash_enc_v1_$key_body" >> "$SITE_DIR/.env"
  fi

  # The public address EmDash builds every absolute URL against — media files, canonical,
  # Open Graph. Behind the tunnel the request reaches the container as http://127.0.0.1:PORT,
  # so without this EmDash bakes the loopback origin into media URLs and every image 404s in
  # the browser (seen 23/08). Env, top precedence in getPublicOrigin. Rewritten each provision.
  sed -i '/^EMDASH_SITE_URL=/d' "$SITE_DIR/.env"
  echo "EMDASH_SITE_URL=$SITE_URL" >> "$SITE_DIR/.env"

  # Who may frame this site. `FRAME_ANCESTORS` reaches here from provision.sh's --frame-ancestors,
  # which the demo road passes explicitly. Rewritten each provision so a redeploy tracks the current
  # preview origin, same as EMDASH_SITE_URL above.
  #
  # 🔒 A CUSTOMER SITE GETS THE SAME POLICY THE OTHER TWO PLATFORMS ALREADY HAVE — changed 19/09/2026.
  # Until then this was DEMO-ONLY and a customer EmDash site could not be framed at all, so Tracy's
  # preview showed an empty pane for it while a WordPress or Joomla site of the same age showed the
  # site. That asymmetry was never a policy: WordPress and Joomla sit behind Apache, and
  # `scripts/lib/site-apache-conf.sh` writes this exact header for EVERY site it configures. EmDash
  # runs Astro with no Apache in front, so it needs its own copy of the same line — and only the
  # demo road ever wrote one.
  #
  # ⚠ THE VALUE IS COPIED FROM THAT FILE ON PURPOSE, not widened. Scoped to Tracy's own origins —
  # `'self'`, the fleet zone, loopback, and this deployment's origin — so a customer EmDash site
  # becomes exactly as framable as the WordPress site beside it, and no more. Keeping the two
  # strings in step is the price of EmDash not being behind Apache; a grep for `frame-ancestors`
  # finds both.
  local frame="${FRAME_ANCESTORS:-}"
  # The demo road passes this deployment's own origin alone; it gets the full managed policy too, so
  # a demo is framable from every Tracy surface (the zone apex serves the public Templates pages).
  if [ -z "$frame" ] || [ "$frame" = "${TRACY_ORIGIN:-}" ]; then
    frame="$(tracy_frame_ancestors)" || return 1
  fi
  sed -i '/^TRACY_FRAME_ANCESTORS=/d' "$SITE_DIR/.env"
  # 🔒 QUOTED, AND THE WHOLE POLICY DIES WITHOUT IT. The value BEGINS with `'self'` and carries
  # spaces, and compose reads this file with a dotenv parser: written bare, it sees a single-quoted
  # value, takes `self`, and DISCARDS every origin after the closing quote. The container then
  # holds `TRACY_FRAME_ANCESTORS=self`, the middleware renders `frame-ancestors 'self' self`, and
  # Tracy's own origin is not in the list — so the preview pane shows "refused to connect" while
  # `curl` fetches the same URL with 200, because a refusal to FRAME is not a refusal to serve.
  #
  # Measured 22/09/2026 on `site-g5dm6x`: header `frame-ancestors 'self' self`, beside a WordPress
  # site of the same age carrying the full list. The comment above says this line exists to end
  # exactly that asymmetry; unquoted, it recreated it in a shape no grep for `frame-ancestors`
  # would find, because the string in this file was right all along.
  #
  # Double quotes, because the value's own quotes are single ones.
  echo "TRACY_FRAME_ANCESTORS=\"$frame\"" >> "$SITE_DIR/.env"
  if [ "$frame" = "${TRACY_ORIGIN:-}" ] || [ "$frame" = "$(tracy_frame_ancestors)" ]; then
    tracy_record_frame_policy "$SITE_DIR" "$frame"
  fi

  mkdir -p "$SITE_DIR"/{data,uploads}

  # The agent token file must exist as a root-owned 0600 regular file BEFORE the rendered compose is
  # brought up, or its read-only bind mount (render-compose) would make Docker create a directory
  # (#155). Empty until platform_post_up mints into it — the reader fails closed on an empty file.
  # `|| return 1` explicitly: platform_compose could yet be called from an errexit-disabled context,
  # and a compose brought up over an unprepared (or wrong-shape) token file is the failure #155 is
  # about — Docker would materialise a directory at the bind source.
  _emdash_prepare_token_file || return 1
  if _emdash_content_api_image; then _emdash_prepare_content_token || return 1; fi

  # The compose template lives in provision/render-compose.sh — one file writes every compose of the
  # fleet, so the two site-folder mounts cannot be in three templates and missing from a fourth.
  COMPOSE_FLAVOR=fresh tracy_render_compose
}

# The PHP platforms rewrite a config file to tell the site its new address. EmDash learns its
# address from the request itself (Astro SSR behind the tunnel), so there is nothing to write.
platform_configure() {
  :
}

# Runs after `docker compose up` (provision.sh stage 6c, unconditional). Until the first-run
# setup completes, EmDash answers every public page with 302 → /_emdash/admin/setup — a guest
# opening the brand-new site would land in a wizard instead of the blog. So the provision
# finishes the setup itself: title = the name the person picked, seed content in. The admin
# account stays unmade on purpose: EmDash resumes its wizard at exactly that step, so the first
# person opening the admin sets their passkey and becomes Admin. The setup API refuses once
# set up, and on a re-provision that refusal is the right answer.
#
# The Content API relay is a SEPARATE step keyed on the image label `io.tracy.content-api.scalars`,
# never on the template id: Base and SaaS images carry the label but take the first-run path below,
# and until 29/09/2026 only the tracy-business branch registered the relay, so every labelled Base
# or SaaS site answered the relay 401 CONTENT_UNAUTHENTICATED (quickstart smoke H1). An image
# without the label keeps the first-run path exactly as it was.
#
# Mail is the third step (#803), after setup and token custody and on BOTH branches: see
# `_emdash_configure_mail`.
platform_post_up() (
  # provision.sh holds FD 8's per-label flock until this entire hook returns. A second provision
  # cannot mistake our temporary connection for a preexisting connection and outlive its owner.
  # Subshell-scoped rather than local: Bash 3 unwinds function locals before EXIT on a signal.
  _emdash_borrowed_host="" _emdash_borrowed_net="" _emdash_origin_network=""
  trap '_emdash_release_site_network "$?"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  _emdash_prepare_site_network || return 1
  _emdash_setup_site || return 1
  _emdash_configure_mail || return 1
  _emdash_quiet_forms || return 1
  if _emdash_content_api_image; then _emdash_content_api_post_up || return 1; fi
)

# The fleet reaches published loopback ports. A bridged local tracy-host needs a temporary
# endpoint on an isolated site's network; the SITE never joins the shared control-plane network.
# The helper's PAT stays on the host and is sent only to the inspected web-container address.
_emdash_prepare_site_network() {
  [ -f "$SITE_DIR/network-isolated" ] || return 0
  curl -s -m 3 -o /dev/null "http://127.0.0.1:${HOST_PORT}/" >/dev/null 2>&1 && return 0
  local host="${HOSTNAME:-}" stack="${TRACY_SITE_NETWORK:-tracy_tracy}" identity id service running networks ip
  local net="${LABEL}_default"
  if ! [[ "$host" =~ ^[a-f0-9]{12,64}$ ]]; then
    echo "!! cannot identify this bridged tracy-host — refusing isolated site setup" >&2
    return 1
  fi
  identity=$(docker inspect --format '{{.Id}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Running}}|{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$host") || return 1
  IFS='|' read -r id service running networks <<< "$identity"
  if ! [[ "$id" =~ ^[a-f0-9]{12,64}$ ]] || [[ "$id" != "$host"* ]] || [ "$service" != tracy-host ] || [ "$running" != true ]; then
    echo "!! this container is not the running tracy-host — refusing isolated site setup" >&2
    return 1
  fi
  case " $networks " in *" $stack "*) ;; *) echo "!! tracy-host is not on this stack's network — refusing isolated site setup" >&2; return 1 ;; esac
  # Check the exact site's membership before joining, and again when resolving its address.
  ip=$(docker inspect --format "{{with index .NetworkSettings.Networks \"$net\"}}{{.IPAddress}}{{end}}" "${LABEL}-web-1") || return 1
  if ! [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    echo "!! isolated site's web container is not on $net — refusing setup" >&2
    return 1
  fi
  _emdash_origin_network="$net"
  case " $networks " in
    *" $net "*) ;;
    *)
      # Record intent before the blocking command: a signal after connect must still clean up.
      _emdash_borrowed_host="$host" _emdash_borrowed_net="$net"
      docker network connect "$net" "$host" || return 1
      ;;
  esac
  curl -s -m 5 -o /dev/null "http://$ip:4321/" >/dev/null 2>&1 || {
    echo "!! isolated site does not answer from tracy-host — refusing setup" >&2
    return 1
  }
}

_emdash_release_site_network() {
  local rc="$1"
  trap - EXIT
  if [ -n "$_emdash_borrowed_host" ]; then
    if ! docker network disconnect "$_emdash_borrowed_net" "$_emdash_borrowed_host"; then
      echo "!! could not release tracy-host's temporary site network connection" >&2
      [ "$rc" != 0 ] || rc=1
    fi
  fi
  exit "$rc"
}

# ── site mail: the relay path is configured and proven before the site is ready (#803) ──────────
#
# An EmDash site sends through the emdash-smtp plugin, whose `phpmail` provider spawns `sendmail` —
# the tracy-sendmail shim of web/emdash.Dockerfile, which posts the message to tracy-web. Until
# 03/10/2026 no step chose that provider, set a sender or selected the plugin for EmDash's exclusive
# `email:deliver` hook: a visitor's form submission was stored and confirmed, and nobody was mailed.
#
# Two halves, and a site is not ready unless both hold:
#   1. the RUNNING container can reach the relay: `sendmail` on PATH is the shim, executable by the
#      site's own user, and the three TRACY_MAIL_* variables are set for THIS label. A quickstart
#      whose tools layer could not be built (emdash_tools_image falls back to the plain image) or a
#      host with no site-mail token fails here, by name, instead of going live with a dead form;
#   2. emdash/configure-mail.mjs adds what the site's mail settings lack and reads them back.
#
# 🔒 The helper runs ON THE HOST from the fleet's own scripts, against the site's own address
# (`_emdash_site_origin`: its loopback port, or its docker-network IP on the macOS stack). It
# is never copied into /app: that tree is the agent's to write, and a file run from it with the
# site's admin PAT would be the agent's code holding the key. The PAT is read by the helper from the
# protected file — it is not an argument, not an env value and not in this log.
#
# A demo is not an exception. One pressed in /ops comes through provision.sh like a customer site
# (--frame-ancestors is the whole difference), so it has the tools layer and the relay variables and
# is held to the same proof. One put up by hand with emdash/deploy-quickstart.sh writes its own
# compose around the plain image and never reaches this function: that road has no mail path and
# says so itself. Nothing here guesses "demo" from a missing shim — on this road that is a defect.
#
# What is already set on the site (a provider, a sender, another mail plugin) is kept; the helper
# says which. No test message is sent: the relay refuses a draft site by design.
_emdash_configure_mail() {
  local web="${LABEL}-web-1" seen helper="" candidate
  echo "==> routing this site's mail through the Tracy relay"
  if ! seen=$(docker exec -u www-data "$web" sh -c '
      p=$(command -v sendmail) || { echo no-sendmail; exit 0; }
      [ -x "$p" ] && [ -x /usr/local/bin/tracy-sendmail ] || { echo no-shim; exit 0; }
      [ "$(readlink -f "$p")" = /usr/local/bin/tracy-sendmail ] || { echo foreign-sendmail; exit 0; }
      [ -n "${TRACY_MAIL_URL:-}" ] && [ -n "${TRACY_MAIL_LABEL:-}" ] && [ -n "${TRACY_MAIL_TOKEN:-}" ] \
        || { echo no-relay; exit 0; }
      printf "ok %s\n" "$TRACY_MAIL_LABEL"' 2>/dev/null); then
    echo "!! could not inspect the mail shim in $web (container/exec error) — refusing to mark this site ready" >&2
    return 1
  fi
  case "$seen" in
    "ok $LABEL") : ;;
    no-sendmail|no-shim|foreign-sendmail)
      echo "!! $WEB_IMAGE has no tracy-sendmail shim as its sendmail ($seen) — this site could not send mail; refusing to mark this site ready" >&2
      echo "   the shim comes with web/emdash.Dockerfile: bash $TRACY_FLEET_DIR/web/build.sh emdash, or look above for a failed tools-layer build" >&2
      return 1 ;;
    no-relay)
      echo "!! $web has no TRACY_MAIL_URL/LABEL/TOKEN — this site could not reach the mail relay; refusing to mark this site ready" >&2
      echo "   look above for \"no site-mail token\" (HOST_SECRET on this host)" >&2
      return 1 ;;
    *)
      echo "!! $web does not show the mail shim and relay variables of $LABEL — refusing to mark this site ready" >&2
      return 1 ;;
  esac
  for candidate in "$HERE/emdash/configure-mail.mjs" "$TRACY_FLEET_DIR/provision/emdash/configure-mail.mjs"; do
    if [ -f "$candidate" ] && [ ! -L "$candidate" ]; then helper="$candidate"; break; fi
  done
  if [ -z "$helper" ]; then
    echo "!! no emdash/configure-mail.mjs beside these scripts — mail not configured; refusing to mark this site ready" >&2
    return 1
  fi
  # The sender, used only when the site has none: TRACY_OWNER_EMAIL, the authenticated seat
  # (provision.sh --owner-email), else TRACY_MAIL_SENDER, the site's own relay address that tracy-web
  # names for a site nobody owns yet — a demo, a stock instance (--mail-sender, #827). With neither,
  # the helper refuses rather than invent an address. Its stderr is one line it wrote itself (no
  # response body, no token), so it is let through.
  local origin sender="${TRACY_OWNER_EMAIL:-${TRACY_MAIL_SENDER:-}}"
  origin="$(_emdash_site_origin "$web")" || return 1
  local args=(--origin "$origin" --token-file "$(_emdash_agent_token_file)")
  [ -n "$sender" ] && args+=(--sender "$sender")
  local out
  if ! out=$(node "$helper" "${args[@]}"); then
    echo "!! could not configure this site's mail — refusing to mark this site ready" >&2
    return 1
  fi
  echo "    ${out:-mail: configured}"
}

# ── site forms: they mail nobody (since 25/10/2026) ──────────────────────────────────────────────
#
# A template's forms ship the template's recipients (tracy-business: `sales@northgate-ind.ru` on all 80), so the
# mail path above would hand every message a visitor sends the business to the template's author.
# emdash/quiet-forms.mjs empties each form's recipients, its digest and its webhook, and reads them back; the
# submissions stay in the site for its owner. Same terms as configure-mail: on the host, the site's own address,
# the PAT from the protected file. A site without the forms plugin has nothing to quiet; any other failure
# refuses to mark the site ready, as a mail path that could not be proven does.
_emdash_quiet_forms() {
  local helper="" candidate web="${LABEL}-web-1"
  for candidate in "$HERE/emdash/quiet-forms.mjs" "$TRACY_FLEET_DIR/provision/emdash/quiet-forms.mjs"; do
    if [ -f "$candidate" ] && [ ! -L "$candidate" ]; then helper="$candidate"; break; fi
  done
  if [ -z "$helper" ]; then
    echo "!! no emdash/quiet-forms.mjs beside these scripts — forms not quieted; refusing to mark this site ready" >&2
    return 1
  fi
  local origin out
  origin="$(_emdash_site_origin "$web")" || return 1
  if ! out=$(node "$helper" --origin "$origin" --token-file "$(_emdash_agent_token_file)"); then
    echo "!! could not keep this site's forms from mailing the template's recipients — refusing to mark this site ready" >&2
    return 1
  fi
  echo "    ${out:-forms: quiet}"
}

# The address HOST-side setup and mail helpers dial this site by — and so where the site's PAT goes.
#
# Two stacks, as in `site_answers` of platform/wordpress.sh: host-networked on a fleet host the
# site's published loopback port answers; on the macOS stack (deploy/compose.macos.yml: tracy-host
# on a bridge) 127.0.0.1 is tracy-host's OWN loopback, where no site listens, and the site is
# reached over the shared docker network instead. Loopback is asked first, with no credential.
#
# 🔒 The second road is the web container's IP as `docker inspect` of THIS container reports it on
# the network selected for this hook — not a DNS name: the daemon's record decides where the PAT goes, a lookup
# does not. Anything but one dotted quad is refused here, and the helper refuses a public address.
_emdash_site_origin() {
  local web="$1" net="${_emdash_origin_network:-${TRACY_SITE_NETWORK:-tracy_tracy}}" ip
  # stdout is this function's answer: nothing the probe prints may reach it.
  if [ -z "${_emdash_origin_network:-}" ] && curl -s -m 3 -o /dev/null "http://127.0.0.1:${HOST_PORT}/" >/dev/null 2>&1; then
    printf 'http://127.0.0.1:%s' "$HOST_PORT"
    return 0
  fi
  if ! ip=$(docker inspect --format "{{with index .NetworkSettings.Networks \"$net\"}}{{.IPAddress}}{{end}}" "$web" 2>/dev/null); then
    echo "!! $web answers on no loopback port and docker could not report its address — mail not configured; refusing to mark this site ready" >&2
    return 1
  fi
  if ! [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    echo "!! $web answers on no loopback port and has no address on the $net network — mail not configured; refusing to mark this site ready" >&2
    return 1
  fi
  printf 'http://%s:4321' "$ip"
}

_emdash_setup_site() {
  # A complete template supplies its own editor-safe schema/content/media/form bootstrap.
  # Keep the legacy EmDash setup path unchanged for images without this template identity.
  local template_id
  template_id="$(docker image inspect "$WEB_IMAGE" --format '{{ index .Config.Labels "io.tracy.template.id" }}')" || return 1
  if [ "$template_id" = tracy-business ]; then
    echo "==> installing Tracy Business content, media and forms"
    # 🔒 bootstrap-site.sh echoes RAW mint output on failure (its own line 51), which can carry a
    # malformed or partial PAT; its stdout AND stderr are captured to /dev/null here and only a
    # generic failure line reaches the job log, which reaches the desk. No token/raw output is ever
    # placed in a command argument or the model-visible log.
    #
    # The exit code is kept rather than swallowed: an exec cut by its container stopping prints
    # nothing, and the container's state is the only witness (lib/site-exec.sh). That helper reports
    # the exec's exit code and the container's state and log — never this exec's own output.
    local rc=0
    docker exec -w /app \
      -e TRACY_OWNER_EMAIL="${TRACY_OWNER_EMAIL:-}" \
      -e TRACY_OWNER_NAME="${TRACY_OWNER_NAME:-}" \
      "${LABEL}-web-1" bash tools/bootstrap-site.sh http://127.0.0.1:4321 /app/data >/dev/null 2>&1 || rc=$?
    if [ "$rc" -ne 0 ]; then
      tracy_explain_exec_failure "${LABEL}-web-1" "$rc"
      echo "!! Tracy Business bootstrap failed — refusing to mark this site ready" >&2
      return 1
    fi
    # bootstrap-site.sh writes the PAT to /app/data/tracy-agent.token — inside an AGENT-WRITABLE bind
    # (#155). Collect it into the site's protected private file, validate its shape, then delete the
    # /app/data copy so the agent's own www-data shell is left no readable PAT in the container.
    #
    # 🔒 Read with an EXPLICIT `-u 0` (not "the default exec user", which an image could have set to
    # www-data) through a FIXED Node one-liner that opens the fixed path with O_NOFOLLOW and fstats
    # it as a regular file. A shell `[ -L ]; cat` is TOCTOU — www-data owns this dir and could swap
    # the file for a symlink between the check and the read; O_NOFOLLOW refuses to open a symlinked
    # final component atomically, and the fstat is on the same descriptor that was opened. The token
    # is read from the file to stdout only; it is never an argv or env value.
    local biz_tok
    if ! biz_tok=$(docker exec -u 0 "${LABEL}-web-1" node -e '
        const fs = require("fs");
        let fd;
        try { fd = fs.openSync("/app/data/tracy-agent.token", fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
        catch (e) { process.stderr.write("legacy agent token missing or a symlink\n"); process.exit(3); }
        const st = fs.fstatSync(fd);
        if (!st.isFile()) { process.stderr.write("legacy agent token is not a regular file\n"); process.exit(4); }
        process.stdout.write(fs.readFileSync(fd));' 2>/dev/null); then
      echo "!! Tracy Business bootstrap left no readable regular agent token — refusing to mark this site ready" >&2
      return 1
    fi
    if ! _emdash_store_agent_token "$biz_tok"; then
      echo "!! Tracy Business bootstrap left no valid agent token — refusing to mark this site ready" >&2
      return 1
    fi
    # 🔒 Cleanup is REQUIRED, not best-effort: a swallowed rm failure would leave an agent-readable
    # PAT copy in /app/data while this claims success. Remove as root, then verify in ONE explicit
    # root exec that the path is BOTH absent AND not a (dangling) symlink — a bare `test -e` calls a
    # dangling symlink "gone" and reads any docker/exec error as "gone" too. The exec must succeed
    # AND print `absent`; a missing container or proxy error is NOT "ready".
    if ! docker exec -u 0 "${LABEL}-web-1" rm -f /app/data/tracy-agent.token; then
      echo "!! could not remove the legacy in-container agent token copy — refusing to mark this site ready" >&2
      return 1
    fi
    local legacy_state
    if ! legacy_state=$(docker exec -u 0 "${LABEL}-web-1" sh -c '
        f=/app/data/tracy-agent.token
        if [ -e "$f" ] || [ -L "$f" ]; then echo present; else echo absent; fi' 2>/dev/null); then
      echo "!! could not verify legacy in-container agent token removal (container/exec error) — refusing to mark this site ready" >&2
      return 1
    fi
    if [ "$legacy_state" != absent ]; then
      echo "!! legacy in-container agent token still present after cleanup — refusing to mark this site ready" >&2
      return 1
    fi
    # Documentation travels with the installed site, without copying its private database.
    local handoff="${TRACY_SITES_ROOT:?}/$LABEL/template"
    mkdir -p "$handoff"
    docker cp "${LABEL}-web-1:/app/AGENTS.md" "$handoff/AGENTS.md" || return 1
    docker cp "${LABEL}-web-1:/app/docs" "$handoff/" || return 1
    docker cp "${LABEL}-web-1:/app/artifact.json" "$handoff/artifact.json" || return 1
    echo "==> Tracy Business ready; application source is /app inside the site container"
    return 0
  fi
  echo "==> completing the EmDash first-run setup"
  local answer="" origin
  origin="$(_emdash_site_origin "${LABEL}-web-1")" || return 1
  # EmDash 1.0 seeds within a per-request budget: `seedComplete:false` means post again (items
  # already created are skipped). An empty answer means the site is not up yet.
  for _ in $(seq 1 200); do
    answer=$(curl -s -m 60 -X POST "$origin/_emdash/api/setup" \
      -H 'content-type: application/json' \
      -d "{\"title\":\"$LABEL\",\"includeContent\":true}" 2>/dev/null || true)
    case "$answer" in
      '') sleep 2 ;;
      *'"seedComplete":false'*) : ;;
      *) break ;;
    esac
  done
  case "$answer" in
    *'"setupComplete":true'*) echo "    setup complete — the site serves guests" ;;
    *) echo "!! EmDash setup not completed: ${answer:0:160}" >&2 ;;
  esac

  # Seed the two admins and mint the resident agent's token, all with no browser (see the script).
  # The agent PAT is the site's write key: the person edits by chat, and the agent drives EmDash
  # over MCP with this. Stored to the site's protected private file (see the custody helpers above);
  # never printed to the job log, which reaches the desk. TRACY_OWNER_EMAIL is the authenticated
  # seat, injected by the relay.
  echo "==> seeding admins and minting the agent token"
  # cp failure propagates: a mint that runs against a container with no mint helper in it is a mint
  # that cannot succeed, and swallowing this leaves the failure to surface later as an in-container
  # NO_TOKEN. Try the working-copy path first, then the installed one, then fail.
  docker cp "$HERE/emdash/mint-agent-admin.cjs" "${LABEL}-web-1:/app/tracy-mint.cjs" 2>/dev/null \
    || docker cp "$TRACY_FLEET_DIR/provision/emdash/mint-agent-admin.cjs" "${LABEL}-web-1:/app/tracy-mint.cjs" \
    || { echo "!! could not copy the mint helper into the container — refusing to mark this EmDash site ready" >&2; return 1; }
  # 🔒 A NONZERO MINT EXIT FAILS, even when its stdout looks like a token. The old
  # `minted=$(… || true)` accepted a token-shaped line printed by a process that then crashed;
  # `minted=$(…) || mint_rc=$?` keeps the command's own exit status (a bare `local minted=$(…)`
  # would mask it behind `local`'s own success). stderr is dropped, not logged: it can carry a partial secret
  # or an internal stack, and the job log reaches the desk.
  # The helper is removed whatever the mint did: left in /app it is a root-owned file in the site's
  # own tree, one more thing www-data cannot replace.
  local minted mint_rc=0
  minted=$(docker exec -w /app \
    -e TRACY_OWNER_EMAIL="${TRACY_OWNER_EMAIL:-}" -e TRACY_OWNER_NAME="${TRACY_OWNER_NAME:-}" \
    "${LABEL}-web-1" node tracy-mint.cjs 2>/dev/null) || mint_rc=$?
  docker exec -u 0 "${LABEL}-web-1" rm -f /app/tracy-mint.cjs >/dev/null 2>&1 || true
  if [ "$mint_rc" != 0 ]; then
    echo "!! agent token mint exited nonzero — refusing to mark this EmDash site ready" >&2
    return 1
  fi
  case "$minted" in
    TRACY_EMDASH_PAT=ec_pat_*)
      if _emdash_store_agent_token "${minted#TRACY_EMDASH_PAT=}"; then
        echo "    agent admin ready, token saved to the site's private key file"
      else
        # Minted, but not the shape the reader accepts — a half-written or wrong-format value would
        # only surface later as an in-container NO_TOKEN. Fail now.
        echo "!! agent token minted but not the expected shape — refusing to mark this site ready" >&2
        return 1
      fi
      ;;
    *)
      # 🔒 A FAILED REQUIRED MINT FAILS THE PROVISION. Until now this only echoed a warning and
      # returned 0, so provision reported the site READY with no agent token — and the customer's
      # first chat edit met NO_TOKEN. The raw mint output is NOT logged: it can carry a partial
      # secret or an internal stack, and the log reaches the desk.
      echo "!! agent token not minted — refusing to mark this EmDash site ready" >&2
      return 1
      ;;
  esac
}
