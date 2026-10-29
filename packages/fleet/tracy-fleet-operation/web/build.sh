#!/usr/bin/env bash
#
# build — the web images every line of IMAGE_TAGS names, on the host that will run them.
#
#   bash web/build.sh              # build what is missing
#   FORCE=1 bash web/build.sh      # build again even when the tag is already there
#   bash web/build.sh joomla       # one platform
#   DEFAULTS_ONLY=1 bash web/build.sh   # only the images a NEW site gets (the `<platform>=` lines)
#   bash web/build.sh --line joomla:5-apache   # exactly ONE `<platform>:<tag>` line, nothing else
#
# `--line` is what a provision runs when the image its new site needs is missing on this host
# (scripts/lib/web-image.sh `tracy_web_image_build`), and what move-off-upstream-image.sh runs before
# it moves a running site: one line is one image, ~5 minutes, where the whole file is twelve. It
# skips the default-line check and the EmDash loop, and exits 2 when IMAGE_TAGS has no such line.
#
# ON THE HOST, not on a laptop, and not in CI for now: the images are pulled from Docker Hub bases
# and layered on, so they exist where they are built and nowhere else. A NEW site whose line is not
# built here gets it built on the spot by its provision (`--line`), and stays on the upstream base
# only when that build fails, loudly; a site already running is refused outright
# (scripts/lib/web-image.sh). So this still runs before the scripts that read IMAGE_TAGS reach a
# host, not after: a provision should find its image, not spend five minutes building it.
#
# ONE FAILURE DOES NOT STOP THE REST. An upstream tag Docker Hub has dropped fails its own build
# and nothing else; the list of failures is printed at the end and the exit code carries it. A tag
# that can no longer be built has to leave IMAGE_TAGS too — a line nobody can build is a promise
# the resolver keeps making.
#
# EmDash is built from whatever tracy/emdash images are already here, one web image per version,
# because its version is a fact about this host rather than a constant in the repo.
#
# 🔒 `-e` IS LEFT OUT ON PURPOSE, and that is the whole design above: with it, the first failed
# build would end the run and the remaining images would be silently not built. Every failure is
# collected in FAILED instead, and the exit code at the bottom carries them. So a command whose
# failure is EXPECTED still needs its own `|| true` here — nothing else is catching it.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TAGS="$HERE/IMAGE_TAGS"
ONLY=""; LINE=""
case "${1:-}" in
  --line)
    LINE="${2:-}"
    case "$LINE" in
      *:*) ;;
      *) echo "--line takes one <platform>:<upstream tag> key of IMAGE_TAGS (joomla:5-apache), got: ${LINE:-nothing}" >&2; exit 2 ;;
    esac
    ;;
  *) ONLY="${1:-}" ;;
esac
[ -f "$TAGS" ] || { echo "no IMAGE_TAGS beside this script" >&2; exit 1; }

FAILED=""

# Files every image takes from THIS directory through the named build context `tracy-web-files`
# (`COPY --from=tracy-web-files …` in the Dockerfiles). With the Dockerfile itself they are the
# image's inputs, and their hash is stamped on the image as a label.
WEB_FILES="tracy-sendmail tracy-sendmail.ini"

# The main build context. Joomla's Dockerfile copies the T4 skill from `vendor/`, so it needs the
# repo root — the reason `bash web/build.sh joomla` died on `"/vendor/joomla/joomlart-t4-skill":
# not found` from 13/09 (tasks/nhat-ky-main.md). The other two copy nothing from the main context,
# and keep this directory: a repo-root context ships far more to the daemon for nothing.
#
# Two layouts carry that tree, tried in this order: a repo checkout (`web/` four levels below the
# root) and a fleet host's tracy-host image, which copies it to `$TRACY_FLEET_DIR/vendor/joomla/`
# beside `web/` (apps/tracy-host/Dockerfile). Before the second one, every Joomla line failed here
# on a host, so a provision that needed a missing Joomla image could never build it.
context_for() { # platform
  local repo
  case "$1" in
    joomla)
      for repo in "$HERE/../../../.." "$HERE/.."; do
        if [ -d "$repo/vendor/joomla/joomlart-t4-skill" ]; then
          (cd "$repo" && pwd)
          return 0
        fi
      done
      echo "!! joomla needs a checkout of the repo (vendor/joomla/joomlart-t4-skill beside packages/), or a tracy-host image that carries that tree beside web/ — run this from one" >&2
      return 1
      ;;
    *) printf '%s\n' "$HERE" ;;
  esac
}

# sha256 of the Dockerfile and every file above, in a fixed order. Not the vendor tree Joomla
# copies: that one moves by subtree pull with its own pin, and a tag bump is the rule for it.
inputs_hash() { # dockerfile
  local f input_files="$WEB_FILES"
  case "$1" in
    */emdash.Dockerfile) input_files="$input_files emdash-conditional-core.tar.gz emdash-conditional-core.json emdash-conditional-core.LICENSE install-emdash-receiver.mjs" ;;
  esac
  { cat "$1"; for f in $input_files; do printf '\n--- %s\n' "$f"; cat "$HERE/$f"; done; } \
    | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-64
}

# 🔒 THE INPUT LABEL IS HOW A CHANGED SHIM STOPS BEING SILENTLY STALE. Before it, "the tag exists"
# was the only question, so an edit to a file an image copies — with the tag left alone — built
# nothing on any host that already had the tag, and said "already built".
#
#   IMAGE_TAGS image, label matches      already built
#   IMAGE_TAGS image, label differs      REFUSED: the inputs changed and the tag did not. A tag a site
#                                        was provisioned with must mean one image (README 🔒), so the
#                                        fix is a new tag line, never a rebuild over the old one
#   IMAGE_TAGS image, no label           already built (made before labels existed; old tags only)
#   emdash image, label missing/differs  rebuilt: its tag is the EmDash version, a fact about the
#                                        host that carries no revision to bump
build_one() { # dockerfile base image [rebuild-when-stale]
  local dockerfile="$1" base="$2" image="$3" stale_rebuilds="${4:-}" platform context want have
  platform="$(basename "$dockerfile" .Dockerfile)"
  want="$(inputs_hash "$dockerfile")"
  if [ -z "${FORCE:-}" ] && docker image inspect "$image" >/dev/null 2>&1; then
    have="$(docker image inspect --format '{{ index .Config.Labels "tracy.web.inputs" }}' "$image" 2>/dev/null || true)"
    case "$have" in "<no value>") have="" ;; esac
    if [ "$have" = "$want" ]; then
      echo "==> $image already built"
      return 0
    elif [ -n "$stale_rebuilds" ]; then
      echo "==> $image was built from other inputs — rebuilding"
    elif [ -z "$have" ]; then
      echo "==> $image already built (before input labels)"
      return 0
    else
      echo "!! $image exists but was built from other inputs — add a new tag line in IMAGE_TAGS" >&2
      FAILED="$FAILED $image"
      return 1
    fi
  fi
  echo "==> $image  (from $base)"
  if ! context="$(context_for "$platform")"; then
    FAILED="$FAILED $image"
    return 1
  fi
  # 🔒 A DOCKER HUB BASE IS PULLED, NEVER TAKEN FROM THE HOST'S CACHE. A tag line exists to carry one
  # upstream release (20261027-r1 = the 21 October PHP security releases), and a host that already
  # has the base cached — every host whose sites run `joomla:5-apache` bare, which are exactly the
  # hosts a provision or move-off-upstream-image.sh builds a missing line on — would otherwise layer
  # the new tag on the OLD base. Measured 29/10/2026 on the local stand: a cached `joomla:5-apache`
  # from 29/09 gave `tracy/web-joomla:5-apache-20261027-r1` PHP 8.3.35, not the patched 8.3.36.
  # EmDash's base is `tracy/emdash:<version>`, built on this host and in no registry: never pulled.
  local pull=--pull
  [ "$platform" != emdash ] || pull=""
  if ! docker build ${pull:+"$pull"} -f "$dockerfile" --build-arg BASE="$base" \
         --build-context tracy-web-files="$HERE" \
         --label tracy.web.inputs="$want" \
         -t "$image" "$context"; then
    echo "!! $image failed to build from $base" >&2
    FAILED="$FAILED $image"
    return 1
  fi
}

# Every image a `<platform>:<tag>` line names — used to check that each default line points at one
# of them. A default line naming an image no base line builds is an image nobody ever builds, and
# the only symptom is a new site whose compose names something that does not exist. Today the two
# default lines repeat two base lines, and nothing but this check keeps that true.
built_from_base_lines() {
  awk -F= '/^[^#]/ && index($1, ":") { print $2 }' "$TAGS"
}

# The images the default lines name. DEFAULTS_ONLY=1 builds just these: every PHP line is ~5 min
# and ~2.5 GB, which a server pays once but a dev machine (deploy/scripts/check-local.sh) should
# not pay for bases its sites never use. A site on another base still falls back as the header says.
named_by_default_lines() {
  awk -F= '/^[^#]/ && !index($1, ":") { print $2 }' "$TAGS"
}

FOUND=""
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"; image="${line#*=}"
  platform="${key%%:*}"
  [ -z "$ONLY" ] || [ "$ONLY" = "$platform" ] || continue
  [ -z "$LINE" ] || [ "$LINE" = "$key" ] || continue
  FOUND=1

  case "$key" in
    *:*) ;;
    *)
      # A default line: nothing to build here, but it must name an image a base line builds.
      if ! built_from_base_lines | grep -xF "$image" >/dev/null; then
        echo "!! $key names $image, which no <platform>:<tag> line builds — add that line" >&2
        FAILED="$FAILED $image"
      fi
      continue
      ;;
  esac

  if [ -z "$LINE" ] && [ -n "${DEFAULTS_ONLY:-}" ] && ! named_by_default_lines | grep -xF "$image" >/dev/null; then
    continue
  fi
  [ -f "$HERE/$platform.Dockerfile" ] || { echo "!! no $platform.Dockerfile for $key" >&2; exit 1; }
  build_one "$HERE/$platform.Dockerfile" "$key" "$image"
done < "$TAGS"

if [ -n "$LINE" ] && [ -z "$FOUND" ]; then
  echo "!! IMAGE_TAGS has no line for $LINE — nothing to build (a base with no line stays on its upstream image)" >&2
  exit 2
fi

if [ -z "$LINE" ] && { [ -z "$ONLY" ] || [ "$ONLY" = emdash ]; }; then
  # `|| true` because a host with no tracy/emdash image at all makes `grep` exit 1, and with
  # `pipefail` that is the substitution's status. Harmless while `-e` is off — and a trap the day
  # somebody restores it, which is exactly when nobody is looking at the emdash loop.
  for base in $(docker images --format '{{.Repository}}:{{.Tag}}' 'tracy/emdash' 2>/dev/null \
                  | grep -vE ':(latest|<none>)$' || true); do
    build_one "$HERE/emdash.Dockerfile" "$base" "tracy/web-emdash:${base#tracy/emdash:}" rebuild-when-stale
  done
fi

if [ -n "$FAILED" ]; then
  echo "!! not built:$FAILED" >&2
  exit 1
fi
echo "==> done"
