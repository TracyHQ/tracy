#!/usr/bin/env bash
#
# move-off-upstream-image — put ONE site that sits on a bare upstream web image (`joomla:5-apache`,
# `wordpress:php8.3-apache`, …) onto the Tracy image built FROM THAT SAME BASE.
#
#   move-off-upstream-image.sh --list [--root DIR]                    # which sites, and where to
#   move-off-upstream-image.sh --label <label> [--root DIR]           # dry run: what it would do
#   move-off-upstream-image.sh --label <label> [--root DIR] --apply [--no-start]
#
# WHY. The visual check of a customer's edit draws the page with a browser inside the site's own web
# container, and the upstream image has neither chromium nor node: every capture on such a site
# answers NO_BROWSER and falls back to dsh's own browser with page scripts off. Its agent has no git,
# rg or jq either. A new site no longer lands there while its IMAGE_TAGS line exists (provision builds
# the line on the spot, lib/web-image.sh); this moves the ones that already did.
#
# 🔒 SAME BASE = SAME PHP. The target is the IMAGE_TAGS line keyed by the site's EXACT base tag —
# never the platform's default line, never another PHP (the rule at the top of IMAGE_TAGS). A base
# with no line, or one the resolver refuses (PHP 8.1, Joomla's unpatched 8.2 aliases), has no target:
# the site stays where it is, and its visual check keeps the host-browser fallback. Moving PHP is
# set-php.sh's job, with its own evidence, not this script's.
#
# ## What --apply does, every check before the first write
#
#   1. the target image: built on this host when it is missing (web/build.sh --line <base>), then
#      run once to prove chromium and node are on PATH for www-data — a refusal here changes nothing
#   2. the compose file: kept beside it as .docker-compose.yml.before-tracy-image, then ONLY the web
#      service's image line changes (set-web-image.sh --no-start); the database, its volume, the
#      webroot and every other line are untouched
#   3. a site whose web container is running: only web is recreated (`up -d --no-deps web`), then
#      measured in the running container — chromium and node as www-data, and the home page answering
#      2xx/3xx when it did before. Any failure puts the previous compose back and brings the old
#      container up again.
#      A site that is not running is written and NOT started: whoever stopped it decides when it
#      comes back (`docker compose up -d` in its directory).
#
# ## Safe to run twice
#
# A site already on a Tracy image is "nothing to move", and exits 0 without touching anything.
#
# One label per run, on purpose: each move recreates a customer's container. `--list` names the
# candidates; the person running this picks them one at a time.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/web-image.sh
. "$HERE/../lib/web-image.sh"

USAGE="use: move-off-upstream-image.sh --list | --label <label> [--apply] [--no-start]  [--root DIR]"
LABEL=""; ROOT="$TRACY_PRIVATE_ROOT"; APPLY=""; NO_START=""; LIST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) [ $# -ge 2 ] || { echo "--label needs a value" >&2; exit 2; }; LABEL="$2"; shift 2 ;;
    --root)  [ $# -ge 2 ] || { echo "--root needs a value" >&2; exit 2; }; ROOT="$2"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --no-start) NO_START=1; shift ;;
    --list) LIST=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -n "$LIST" ]; then
  [ -z "$LABEL" ] && [ -z "$APPLY" ] && [ -z "$NO_START" ] || { echo "--list takes no --label, --apply or --no-start" >&2; exit 2; }
else
  [ -n "$LABEL" ] || { echo "$USAGE" >&2; exit 2; }
  tracy_require_label "$LABEL"
fi

# The web service's image as the compose file names it: the first `image:` that is not the database's
# (the same reading enable-site-mail.sh and set-web-image.sh use, so the three agree on "the web line").
web_image_of() { # compose file
  sed -n 's/^ *image: *//p' "$1" | grep -v '^mariadb' | head -1 | tr -d "\"'" || true
}

# The Tracy image for a bare upstream base, by the base's own IMAGE_TAGS line, or non-zero with the
# reason on stdout. Asked with the resolver's own pieces (exact-match lookup and PHP refusal), so this
# can never answer differently from what a provision of that base gets.
target_for() { # upstream base
  local base="$1" want
  if ! _tracy_web_image_require_supported_php "$base" 2>/dev/null; then
    echo "unpatched PHP, refused for every site"; return 1
  fi
  if ! want="$(tracy_web_image_line "$base")"; then
    echo "web/IMAGE_TAGS has no line for $base"; return 1
  fi
  if ! _tracy_web_image_require_supported_php "$want" 2>/dev/null; then
    echo "its line names an unpatched PHP image ($want)"; return 1
  fi
  printf '%s\n' "$want"
}

is_built() { docker image inspect "$1" >/dev/null 2>&1; }

# ── --list ─────────────────────────────────────────────────────────────────────────────────────────
if [ -n "$LIST" ]; then
  [ -d "$ROOT" ] || { echo "no sites root at $ROOT" >&2; exit 1; }
  echo "==> sites under $ROOT whose web service runs a bare upstream image"
  moves=0; stays=0
  for dir in "$ROOT"/*/; do
    label="$(basename "$dir")"
    compose="$dir/docker-compose.yml"
    [ -f "$compose" ] || continue
    current="$(web_image_of "$compose")"
    case "$current" in joomla:*|wordpress:*) ;; *) continue ;; esac
    state="$(docker inspect --format '{{.State.Status}}' "$label-web-1" 2>/dev/null || true)"
    [ -n "$state" ] || state="no container"
    if answer="$(target_for "$current")"; then
      if is_built "$answer"; then built="built"; else built="not built yet: --apply builds it"; fi
      printf '    %s  %s  -> %s  (%s; web %s)\n' "$label" "$current" "$answer" "$built" "$state"
      moves=$((moves + 1))
    else
      printf '    %s  %s  no line: stays, host-browser fallback (%s; web %s)\n' "$label" "$current" "$answer" "$state"
      stays=$((stays + 1))
    fi
  done
  echo "==> $moves to move, $stays stay. One at a time: move-off-upstream-image.sh --label <label> [--apply]"
  exit 0
fi

# ── one site ───────────────────────────────────────────────────────────────────────────────────────
SITE_DIR="$ROOT/$LABEL"
COMPOSE="$SITE_DIR/docker-compose.yml"
[ -f "$SITE_DIR/.env" ] || { echo "no .env at $SITE_DIR/.env — not a provisioned site" >&2; exit 1; }
[ -f "$COMPOSE" ] || { echo "no compose file at $COMPOSE — not a provisioned site" >&2; exit 1; }

CURRENT="$(web_image_of "$COMPOSE")"
[ -n "$CURRENT" ] || { echo "no web image in $COMPOSE" >&2; exit 1; }
case "$CURRENT" in
  joomla:*|wordpress:*) ;;
  *) echo "==> $LABEL runs $CURRENT, not a bare joomla/wordpress image — nothing to move"; exit 0 ;;
esac
if ! TARGET="$(target_for "$CURRENT")"; then
  echo "==> $LABEL: $CURRENT — no line: stays, host-browser fallback ($TARGET)"
  exit 1
fi

# Running is asked of compose, from the site's own directory, as enable-site-mail.sh does: a failed
# `compose ps` is not "not running", so it stops the run rather than skipping the recreate.
if ! web_ps="$(cd "$SITE_DIR" && docker compose ps -q web 2>/dev/null)"; then
  echo "!! could not ask docker compose for the web container of $LABEL — nothing changed" >&2
  exit 1
fi
RUNNING=""; [ -z "$(printf '%s' "$web_ps" | sed -n 1p)" ] || RUNNING=1

echo "==> $LABEL: $CURRENT -> $TARGET (the line for the same base: same PHP)"
if is_built "$TARGET"; then echo "    image: built on this host"; BUILT=1; else echo "    image: not built on this host"; BUILT=""; fi
if [ -n "$RUNNING" ]; then echo "    web container: running"; else echo "    web container: not running"; fi

if [ -z "$APPLY" ]; then
  [ -n "$BUILT" ] || echo "    --apply builds it first: bash $(tracy_web_dir 2>/dev/null || echo web)/build.sh --line $CURRENT"
  if [ -n "$RUNNING" ] && [ -z "$NO_START" ]; then
    echo "    --apply recreates web only, then checks chromium, node and the home page (and puts it back if any fails)"
  else
    echo "    --apply writes the compose file and starts nothing"
  fi
  echo "==> dry run: nothing changed. Run again with --apply to move $LABEL."
  exit 0
fi

# ── 1. the target image, built and proven before anything is written ─────────────────────────────
if [ -z "$BUILT" ]; then
  tracy_web_image_build "$CURRENT" "$TARGET" || {
    echo "!! $TARGET could not be built on this host — nothing changed" >&2
    exit 1
  }
fi
# Proven by running it, as the user the visual check runs as: a tag name says nothing about what is
# on PATH inside it.
if ! docker run --rm -u www-data --entrypoint sh "$TARGET" -c 'command -v chromium >/dev/null && command -v node >/dev/null' >/dev/null 2>&1; then
  echo "!! $TARGET has no chromium or no node on PATH for www-data — nothing changed" >&2
  exit 1
fi
echo "    image: chromium and node on PATH for www-data"

# The home page's status, asked of PHP inside the web container: both images carry PHP, and the
# upstream one may have no curl. 000 when there is no answer at all.
HOME_STATUS_PHP='$c = stream_context_create(["http" => ["ignore_errors" => true, "follow_location" => 0, "timeout" => 20]]); @file_get_contents("http://127.0.0.1/", false, $c); $h = function_exists("http_get_last_response_headers") ? (http_get_last_response_headers() ?? []) : ($http_response_header ?? []); echo preg_match("#^HTTP/\\S+ (\\d{3})#", $h[0] ?? "", $m) ? $m[1] : "000";'
home_status() {
  local s
  s="$(cd "$SITE_DIR" && docker compose exec -T web php -r "$HOME_STATUS_PHP" 2>/dev/null)" || s=""
  case "$s" in [0-9][0-9][0-9]) printf '%s\n' "$s" ;; *) printf '000\n' ;; esac
}
answers() { case "$1" in 2??|3??) return 0 ;; esac; return 1; }

BEFORE=""
if [ -n "$RUNNING" ] && [ -z "$NO_START" ]; then
  BEFORE="$(home_status)"
  echo "    home page before: $BEFORE"
fi

# ── 2. the compose file: the web image line, and nothing else ─────────────────────────────────────
BACKUP="$SITE_DIR/.docker-compose.yml.before-tracy-image"
cp -p "$COMPOSE" "$BACKUP"
bash "$HERE/set-web-image.sh" --label "$LABEL" --root "$ROOT" --image "$TARGET" --no-start >/dev/null
[ "$(web_image_of "$COMPOSE")" = "$TARGET" ] || {
  cp -p "$BACKUP" "$COMPOSE"
  echo "!! the compose file did not take the new image line — put back, nothing changed" >&2
  exit 1
}
echo "    compose: web image line changed (previous kept as $(basename "$BACKUP"))"

if [ -z "$RUNNING" ] || [ -n "$NO_START" ]; then
  why="the site was not running"; [ -z "$NO_START" ] || why="--no-start"
  echo "==> $LABEL: written, not started ($why). Start it with: cd $SITE_DIR && docker compose up -d"
  exit 0
fi

# ── 3. recreate web only, measure it, and put it back on any failure ──────────────────────────────
put_back() {
  echo "!! $1 — putting the previous compose back" >&2
  cp -p "$BACKUP" "$COMPOSE"
  (cd "$SITE_DIR" && docker compose up -d --no-deps web) >/dev/null 2>&1 \
    || echo "!! and the previous compose did not come up either — the site is down: look at $SITE_DIR" >&2
  exit 1
}

(cd "$SITE_DIR" && docker compose up -d --no-deps web) || put_back "could not start web on $TARGET"

WAIT="${TRACY_MOVE_WAIT_SECONDS:-60}"
tools=""; after="000"
for _ in $(seq 1 "$WAIT"); do
  if [ -z "$tools" ] && (cd "$SITE_DIR" && docker compose exec -T -u www-data web sh -c 'command -v chromium >/dev/null && command -v node >/dev/null') >/dev/null 2>&1; then
    tools=1
  fi
  after="$(home_status)"
  if [ -n "$tools" ] && { answers "$after" || ! answers "$BEFORE"; } && [ "$after" != 000 ]; then break; fi
  sleep 1
done
[ -n "$tools" ] || put_back "the recreated web container does not show chromium and node to www-data"
if answers "$BEFORE" && ! answers "$after"; then
  put_back "the home page answered $BEFORE before the move and $after after it"
fi
echo "==> $LABEL now runs $TARGET: chromium and node on PATH for www-data, home page $after (was $BEFORE)"
