#!/usr/bin/env bash
#
# enable-site-mail — give ONE site that already exists the mail path new sites are provisioned with.
#
#   enable-site-mail.sh --label <label> [--root DIR] [--no-start]
#
# A site provisioned before 23/09/2026 has three gaps, and all three must close for its mail() to
# reach tracy-web (web/tracy-sendmail, tasks/todo-mail-site-khach.md):
#
#   1. no TRACY_MAIL_TOKEN in its .env              -> written here (lib/site-mail-token.sh)
#   2. no TRACY_MAIL_* on its web service           -> compose re-rendered by render-compose.sh
#   3. a web image with no shim and no sendmail_path -> moved to the IMAGE_TAGS line for the SAME
#                                                      base (same PHP), which carries it
#
# Then only the web container is recreated (`up -d --no-deps web`): the database, its volume and
# the webroot are not touched. Mail stays governed by go-live exactly as before — a draft site is
# still fenced at the network and refused by tracy-web; this only builds the road.
#
# ## Safe to run twice
#
# Every step checks before it writes: a token already right is left alone (a WRONG one — the host
# secret rotated, the site moved host — is replaced), a compose that re-renders to the same bytes is
# the same file, and `up -d` on an unchanged service recreates nothing.
#
# ## What it refuses
#
#   * an unknown argument, or a label that is not a plain name (same rule as attach-site.sh)
#   * a site with no .env or no compose file (nothing to re-render from; provision it instead)
#   * a target image that is not built on this host, or was built without the shim — checked BEFORE
#     anything is written, so a refusal leaves the site exactly as it was. Build first:
#     bash /opt/tracy-fleet/web/build.sh
#   * no HOST_SECRET (environment, or /etc/tracy/hooks.env)
#   * an EmDash site whose agent-token custody is not already the protected read-only bind (#155):
#     the re-render always writes that bind, so a site without it — or with a host token that is not
#     one root-owned 0600 regular file holding one well-formed token, or no running container proven
#     to read that same token — is refused before anything is written, --no-start included. Migrate it first (emdash/README.md).
#
# The compose file it replaces is kept beside it as .docker-compose.yml.before-site-mail, and put
# back (and the old container brought up again) if the recreate fails.
#
# The token is never printed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/site-mail-token.sh
. "$HERE/../lib/site-mail-token.sh"
# shellcheck source=../lib/web-image.sh
. "$HERE/../lib/web-image.sh"

LABEL=""; ROOT="$TRACY_PRIVATE_ROOT"; NO_START=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) [ $# -ge 2 ] || { echo "--label needs a value" >&2; exit 2; }; LABEL="$2"; shift 2 ;;
    --root)  [ $# -ge 2 ] || { echo "--root needs a value" >&2; exit 2; }; ROOT="$2"; shift 2 ;;
    --no-start) NO_START=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] || { echo "use: enable-site-mail.sh --label <label> [--root DIR] [--no-start]" >&2; exit 2; }
case "$LABEL" in
  .|..|.*|*/*|*[!A-Za-z0-9._-]*) echo "not a site label: $LABEL" >&2; exit 2 ;;
esac

SITE_DIR="$ROOT/$LABEL"
ENV_FILE="$SITE_DIR/.env"
COMPOSE="$SITE_DIR/docker-compose.yml"
[ -f "$ENV_FILE" ] || { echo "no .env at $ENV_FILE — not a provisioned site" >&2; exit 1; }
[ -f "$COMPOSE" ] || { echo "no compose file at $COMPOSE — not a provisioned site" >&2; exit 1; }

echo "==> $LABEL: enabling site mail"

# ── 1. which image, decided and checked before anything is written ─────────────────────────────
#
# A tracy/web-<php platform> tag names its base inside it: `tracy/web-joomla:5-apache-20260913-r1`
# was built from `joomla:5-apache`. The IMAGE_TAGS line for that base is the image with the shim
# and the SAME PHP. An upstream base resolves through the same file. EmDash keeps its tag (build.sh
# rebuilds a stale tracy/web-emdash in place, since its tag is the EmDash version).
CURRENT="$(sed -n 's/^ *image: *//p' "$COMPOSE" | grep -v '^mariadb' | head -1 || true)"
[ -n "$CURRENT" ] || { echo "no web image in $COMPOSE" >&2; exit 1; }
export TRACY_WEB_IMAGE_STRICT=1
EMDASH=""
case "$CURRENT" in
  tracy/web-joomla:*|tracy/web-wordpress:*)
    platform="${CURRENT#tracy/web-}"; platform="${platform%%:*}"
    base_tag="$(printf '%s' "${CURRENT#*:}" | sed -E 's/-[0-9]{8}-r[0-9]+$//')"
    IMAGE="$(tracy_web_image "$platform" "$platform:$base_tag")"
    ;;
  joomla:*|wordpress:*)
    IMAGE="$(tracy_web_image "${CURRENT%%:*}" "$CURRENT")"
    ;;
  tracy/web-emdash:*|tracy/emdash:*)
    IMAGE="$(tracy_emdash_web_image "$CURRENT")"
    EMDASH=1
    ;;
  *) echo "$CURRENT is not an image this script knows how to move — refusing" >&2; exit 1 ;;
esac
[ -n "$IMAGE" ] || { echo "no web image for $LABEL" >&2; exit 1; }

# The label every web Dockerfile stamps next to the shim. Checked here and not trusted from the tag
# name: a tag built before the shim existed looks exactly like one built after.
if [ "${TRACY_WEB_IMAGE_CHECK:-1}" = 1 ]; then
  has_mail="$(docker image inspect --format '{{ index .Config.Labels "tracy.site-mail" }}' "$IMAGE" 2>/dev/null || true)"
  case "$has_mail" in
    v1) ;;
    *)
      echo "!! $IMAGE has no site-mail shim (label tracy.site-mail missing) — nothing changed." >&2
      echo "   build it first: bash ${TRACY_FLEET_DIR}/web/build.sh" >&2
      exit 1
      ;;
  esac
fi
echo "    image: $CURRENT -> $IMAGE"

# ── 1b. EmDash: the agent-token custody the re-render will write, proven before anything is ─────
#
# 🔒 render-compose.sh's `tracy_compose_emdash` ALWAYS writes the read-only token bind (#155), so
# re-rendering an EmDash site is installing that bind. On a pre-#155 site that is the token-mount
# migration done without its checks: with no host token the recreate binds a path that is not a
# file, and with an unverified one it skips the authentication `emdash/migrate-token-mount.mjs`
# does first. And recreating a protected site rebinds the host file's CURRENT inode, so a container
# still reading a replaced (stale) inode would switch credentials mid-flight. So this script only
# moves a site that is already where the migration leaves it:
#   * its compose is, line for line, a protected form — the SAME matcher mint-agent-token.sh and
#     tracy-host's door use (`token_mount_custody`, loaded from that script so there is one copy);
#   * its host token is one non-empty, root-owned 0600 regular file (not a link, one hard link);
#   * that token is one value the reader accepts (trimmed, `ec_pat_…` shape), and a running web
#     container reads that same value at /run/tracy-agent.token — proven with --no-start too, and a
#     failed `docker compose ps` or no running container refuses (the token is never printed).
# Anything else refuses here, with nothing written.
if [ -n "$EMDASH" ]; then
  custody_fn="$(sed -n '/^token_mount_custody() {$/,/^}$/p' "$HERE/mint-agent-token.sh")"
  [ -n "$custody_fn" ] || { echo "!! token_mount_custody is missing from mint-agent-token.sh — nothing changed." >&2; exit 1; }
  eval "$custody_fn"
  case "$SITE_DIR" in /*) SITE_ABS="$SITE_DIR" ;; *) SITE_ABS="$PWD/$SITE_DIR" ;; esac
  SITE_ABS="$(printf '%s' "$SITE_ABS" | tr -s /)"
  custody="$(token_mount_custody "$COMPOSE" "$SITE_ABS")"
  case "$custody" in
    protected) ;;
    none)
      echo "!! $LABEL has no read-only agent-token mount yet (pre-#155) — nothing changed." >&2
      echo "   move it onto the mount first (emdash/migrate-token-mount.mjs, emdash/README.md), then run this again" >&2
      exit 1
      ;;
    *)
      echo "!! the agent-token custody of $LABEL cannot be proven from $COMPOSE (not a form the fleet writes) — nothing changed." >&2
      echo "   see emdash/README.md before re-rendering it" >&2
      exit 1
      ;;
  esac
  TOKEN_FILE="$SITE_DIR/tracy-agent.token"
  OWNER_UID="${TRACY_TOKEN_OWNER_UID:-0}"
  case "$OWNER_UID" in '' | *[!0-9]*) OWNER_UID=0 ;; esac
  if [ -L "$TOKEN_FILE" ] || [ ! -f "$TOKEN_FILE" ] || [ ! -s "$TOKEN_FILE" ] ||
    [ -z "$(find "$TOKEN_FILE" -maxdepth 0 -links 1 -user "$OWNER_UID" -perm 0600 2>/dev/null)" ]; then
    echo "!! $TOKEN_FILE is not one non-empty root-owned 0600 regular file — nothing changed." >&2
    echo "   that is the staged recovery's job (emdash/README.md), not this script's" >&2
    exit 1
  fi
  # Compared as values with the reader's semantics: `readFileSync(…).trim()` then the PAT shape
  # (`^ec_pat_[A-Za-z0-9_-]{16,}$`, emdash/migrate-token-mount.mjs). Only leading and trailing
  # whitespace is dropped — never inner whitespace, which the reader rejects — and a NUL byte (which a
  # shell variable cannot hold) is refused rather than silently dropped.
  token_value() {
    local LC_ALL=C v
    if IFS= read -r -d '' v; then return 1; fi
    v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
    printf '%s' "$v"
  }
  token_shape_ok() { local LC_ALL=C; [[ "$1" =~ ^ec_pat_[A-Za-z0-9_-]{16,}$ ]]; }
  host_token="$(token_value < "$TOKEN_FILE")" || host_token=""
  if ! token_shape_ok "$host_token"; then
    echo "!! $TOKEN_FILE does not hold one agent token the reader accepts — nothing changed." >&2
    echo "   that is the staged recovery's job (emdash/README.md), not this script's" >&2
    exit 1
  fi
  # The running reader is proven even with --no-start: the files written here are what the next
  # recreate binds, so an unproven container is refused now, not left for whoever starts it. A failed
  # `compose ps` is not "no container", and no running container is nothing proven either.
  if ! web_ps="$(cd "$SITE_DIR" && docker compose ps -q web 2>/dev/null)"; then
    echo "!! could not ask docker compose for the web container of $LABEL — nothing changed." >&2
    exit 1
  fi
  web_cid="$(printf '%s\n' "$web_ps" | sed -n 1p)"
  if [ -z "$web_cid" ]; then
    echo "!! $LABEL has no running web container to prove the agent token against — nothing changed." >&2
    echo "   start it on its current compose first, then run this again" >&2
    exit 1
  fi
  mounted_token="$(docker exec -u 0 "$web_cid" cat /run/tracy-agent.token 2>/dev/null | token_value)" || mounted_token=""
  if [ "$mounted_token" != "$host_token" ]; then
    echo "!! the running web container of $LABEL does not read the host token at /run/tracy-agent.token (stale inode, or no mount) — nothing changed." >&2
    echo "   recreating it would switch the agent's credential; run emdash/migrate-token-mount.mjs dry first (emdash/README.md)" >&2
    exit 1
  fi
  unset host_token mounted_token
  echo "    agent token: protected read-only mount, host token verified"
fi

# ── 2. the token, in the site's .env ────────────────────────────────────────────────────────────
TOKEN="$(tracy_site_mail_token "$LABEL")" || exit 1
have="$(sed -n 's/^TRACY_MAIL_TOKEN=//p' "$ENV_FILE" | sed -n 1p)"
if [ "$have" = "$TOKEN" ]; then
  echo "    token: already in .env"
else
  # Rewritten beside the file and renamed over it, mode 600 before it holds the secret: the same
  # .env carries the database password, and a half-written one is a site compose cannot start.
  tmp="$ENV_FILE.site-mail.new"
  { grep -v '^TRACY_MAIL_TOKEN=' "$ENV_FILE" || true; } > "$tmp"
  chmod 600 "$tmp"
  printf 'TRACY_MAIL_TOKEN=%s\n' "$TOKEN" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  if [ -n "$have" ]; then echo "    token: replaced (it no longer matched this host's secret)"; else echo "    token: written to .env"; fi
fi

# ── 3. the compose file ─────────────────────────────────────────────────────────────────────────
BACKUP="$SITE_DIR/.docker-compose.yml.before-site-mail"
cp -p "$COMPOSE" "$BACKUP"
bash "$HERE/render-compose.sh" "$LABEL" --root "$ROOT" --image "$IMAGE"
if cmp -s "$BACKUP" "$COMPOSE"; then
  echo "    compose: unchanged"
else
  echo "    compose: re-rendered (previous kept as $(basename "$BACKUP"))"
fi

if [ -n "$NO_START" ]; then
  echo "==> $LABEL: written, not started (--no-start)"
  exit 0
fi

# ── 4. recreate the web container, and only it ──────────────────────────────────────────────────
if ! ( cd "$SITE_DIR" && docker compose up -d --no-deps web ); then
  echo "!! could not start web on the new compose — putting the previous one back" >&2
  cp -p "$BACKUP" "$COMPOSE"
  ( cd "$SITE_DIR" && docker compose up -d --no-deps web ) \
    || echo "!! and the previous compose did not come up either — the site is down: look at $SITE_DIR" >&2
  exit 1
fi

# Measured in the running container, not read from the file: the file is what was asked for.
seen="$( (cd "$SITE_DIR" && docker compose exec -T web sh -c \
  'test -x /usr/local/bin/tracy-sendmail && [ -n "$TRACY_MAIL_TOKEN" ] && printf "%s" "$TRACY_MAIL_LABEL"') 2>/dev/null || true)"
if [ "$seen" = "$LABEL" ]; then
  echo "==> $LABEL: site mail enabled (shim present, token and label in the container)"
else
  echo "!! $LABEL: web is up but the container does not show the shim, token and label — check $COMPOSE" >&2
  exit 1
fi
