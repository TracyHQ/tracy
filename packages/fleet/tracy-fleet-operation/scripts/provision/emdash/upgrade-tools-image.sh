#!/usr/bin/env bash
#
# upgrade-tools-image — move EmDash quickstart sites that still run the template's plain image onto
# the same image with the agent's tools (`<image>-tools`, emdash_tools_image in quickstart-restore.sh).
#
#   bash provision/emdash/upgrade-tools-image.sh                  # dry run: what it would do, per site
#   bash provision/emdash/upgrade-tools-image.sh --apply          # do it
#   bash provision/emdash/upgrade-tools-image.sh --label <l> ...  # one site only
#
# WHY. A quickstart site provisioned before PR #309 runs `tracy/<template>-emdash:<version>`, built
# from the template's own Dockerfile, which has no browser — and `page.look` / `page.text` run
# chromium INSIDE the site's web container (#154). New sites get the tools layer at provision; this
# gives it to the ones already running. Measured 24/09/2026: `spawn chromium ENOENT` on every one.
#
# WHERE. Where provision runs: inside tracy-host, which holds TRACY_PRIVATE_ROOT, the docker socket
# and the fleet scripts this sources. CI reaches it with `docker exec` into the one tracy-host
# container (build-app-images.yml, `upgrade-emdash-tools`, dev only).
#
# WHAT, per site, and only when every check holds — anything else is skipped, with the reason:
#   - `.env` says PLATFORM=emdash, and the compose names `tracy/<x>-emdash:<v>` without `-tools`
#     (a bare EmDash site already gets its tools from web/emdash.Dockerfile through
#     `tracy_emdash_web_image`, and is not this script's);
#   - the agent-token custody reads `protected` (#155) — the same matcher mint-agent-token.sh and
#     tracy-host's door use. A pre-#155 site is moved onto the read-only mount first
#     (emdash/migrate-token-mount.mjs); this script never touches a token;
#   - the site's web container runs, and its compose labels say it IS this site's container.
# Then: build the tools image, rewrite EXACTLY the one `image:` line (every other line stays byte
# for byte, so the custody form still matches — its image pattern accepts the new tag), recreate
# the web container, and prove it: it answers on loopback, root still reads the token mount, and
# chromium is on PATH for www-data. A failure after the rewrite puts the old compose back and brings
# the old image up again.
#
# OUTPUT. One line per site: `<selector> <state> <detail>`, the selector being the first 12 hex of
# sha256(label) — an Actions log is not the place for a raw label. Exit 1 when any site FAILED.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/roots.sh
. "$HERE/../../lib/roots.sh"
# shellcheck source=../../lib/web-image.sh
. "$HERE/../../lib/web-image.sh"
# shellcheck source=quickstart-restore.sh
. "$HERE/quickstart-restore.sh"

APPLY=0
ONLY=""
ROOT="${TRACY_PRIVATE_ROOT:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --label) ONLY="${2:?--label needs a value}"; shift 2 ;;
    --root) ROOT="${2:?--root needs a value}"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$ROOT" ] && [ -d "$ROOT" ] || { echo "no private root (TRACY_PRIVATE_ROOT or --root)" >&2; exit 2; }
ROOT="$(cd "$ROOT" && pwd)"

custody_fn="$(sed -n '/^token_mount_custody() {$/,/^}$/p' "$HERE/../mint-agent-token.sh")"
[ -n "$custody_fn" ] || { echo "token_mount_custody is missing from mint-agent-token.sh — nothing changed" >&2; exit 2; }
eval "$custody_fn"

selector() { printf '%s' "$1" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-12; }
report() { printf '%s %s %s\n' "$(selector "$1")" "$2" "$3"; }

# The web container answers, root reads the token mount, and www-data has a browser.
proven() { # label
  local c="$1-web-1" i
  for i in $(seq 1 60); do
    if docker exec "$c" node -e 'fetch("http://127.0.0.1:4321/").then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
      docker exec -u 0 "$c" sh -c 'test -s /run/tracy-agent.token' >/dev/null 2>&1 || return 1
      docker exec -u www-data "$c" sh -c 'command -v chromium' >/dev/null 2>&1 || return 1
      return 0
    fi
    sleep 2
  done
  return 1
}

FAILED=0
for dir in "$ROOT"/*/; do
  label="$(basename "$dir")"
  [ -z "$ONLY" ] || [ "$label" = "$ONLY" ] || continue
  site="$ROOT/$label"
  compose="$site/docker-compose.yml"
  [ -f "$compose" ] || continue
  grep -qx 'PLATFORM=emdash' "$site/.env" 2>/dev/null || continue

  # Exactly one image line, on the web service: that is the EmDash form render-compose.sh writes.
  images="$(grep -c '^    image: ' "$compose" || true)"
  [ "$images" = 1 ] || { report "$label" skipped "compose has $images image lines, not the one EmDash's form carries"; continue; }
  current="$(sed -n 's/^    image: //p' "$compose")"
  case "$current" in
    *-tools) report "$label" current "already on its tools image"; continue ;;
    tracy/emdash:*|tracy/web-emdash:*) report "$label" skipped "bare EmDash image — its tools come from web/emdash.Dockerfile"; continue ;;
    tracy/*-emdash:*) ;;
    *) report "$label" skipped "not a quickstart image"; continue ;;
  esac

  custody="$(token_mount_custody "$compose" "$site")"
  [ "$custody" = protected ] || { report "$label" skipped "token custody is $custody — move it onto the read-only mount first (emdash/migrate-token-mount.mjs)"; continue; }

  container="$label-web-1"
  labels="$(docker inspect "$container" --format '{{.State.Running}} {{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}} {{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
  [ "$labels" = "true $label web $site" ] || { report "$label" skipped "its web container is not running as this site's own"; continue; }

  if [ "$APPLY" != 1 ]; then
    report "$label" would-move "$current -> $current-tools"
    continue
  fi

  emdash_tools_image "$current" >/dev/null
  if [ "$EMDASH_TOOLS_IMAGE" != "$current-tools" ]; then
    report "$label" failed "the tools image could not be built; the site is unchanged"
    FAILED=1
    continue
  fi

  backup="$compose.pre-tools"
  cp -p "$compose" "$backup"
  tmp="$(mktemp "$compose.XXXXXX")"
  awk -v old="    image: $current" -v new="    image: $EMDASH_TOOLS_IMAGE" '$0 == old { print new; next } { print }' "$compose" > "$tmp"
  chmod --reference="$compose" "$tmp" 2>/dev/null || chmod 0644 "$tmp"
  mv "$tmp" "$compose"
  changed="$(diff "$backup" "$compose" | grep -c '^[<>]' || true)"
  if [ "$changed" != 2 ] || [ "$(token_mount_custody "$compose" "$site")" != protected ]; then
    mv "$backup" "$compose"
    report "$label" failed "the rewrite touched more than the image line; the compose is restored"
    FAILED=1
    continue
  fi

  if (cd "$site" && docker compose up -d --no-deps web >/dev/null 2>&1) && proven "$label"; then
    rm -f "$backup"
    report "$label" moved "$current -> $EMDASH_TOOLS_IMAGE"
  else
    mv "$backup" "$compose"
    (cd "$site" && docker compose up -d --no-deps web >/dev/null 2>&1) || true
    report "$label" failed "the new container did not prove itself; the old image is back"
    FAILED=1
  fi
done
exit "$FAILED"
