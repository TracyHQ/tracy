#!/usr/bin/env bash
#
# build — the web images every line of IMAGE_TAGS names, on the host that will run them.
#
#   bash web/build.sh              # build what is missing
#   FORCE=1 bash web/build.sh      # build again even when the tag is already there
#   bash web/build.sh joomla       # one platform
#   DEFAULTS_ONLY=1 bash web/build.sh   # only the images a NEW site gets (the `<platform>=` lines)
#
# ON THE HOST, not on a laptop, and not in CI for now: the images are pulled from Docker Hub bases
# and layered on, so they exist where they are built and nowhere else. A site whose compose names
# an image this host has not built either stays on the upstream base (a new site, warned) or is
# refused outright (a site already running — scripts/lib/web-image.sh). So this runs before the
# scripts that read IMAGE_TAGS reach a host, not after.
#
# ONE FAILURE DOES NOT STOP THE REST. An upstream tag Docker Hub has dropped fails its own build
# and nothing else; the list of failures is printed at the end and the exit code carries it. A tag
# that can no longer be built has to leave IMAGE_TAGS too — a line nobody can build is a promise
# the resolver keeps making.
#
# EmDash is built from whatever tracy/emdash images are already here, one web image per version,
# because its version is a fact about this host rather than a constant in the repo.
#
# JOOMLA needs the T4 skill tree (vendor/joomla/joomlart-t4-skill, ~66 MB) in its build context, and
# finds it in one of two places: a checkout of the repo (this script is four levels below its root, the
# way CI and the master run it), or /opt/tracy-fleet/vendor/joomla/joomlart-t4-skill beside this web/
# directory (a host with no checkout: the tracy-host image carries the tree and sync-fleet-files.sh puts
# it there). In neither place, the Joomla images fail with a line naming both paths; WordPress and
# EmDash do not need the tree and build as before.
#
# 🔒 `-e` IS LEFT OUT ON PURPOSE, and that is the whole design above: with it, the first failed
# build would end the run and the remaining images would be silently not built. Every failure is
# collected in FAILED instead, and the exit code at the bottom carries them. So a command whose
# failure is EXPECTED still needs its own `|| true` here — nothing else is catching it.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TAGS="$HERE/IMAGE_TAGS"
ONLY="${1:-}"
[ -f "$TAGS" ] || { echo "no IMAGE_TAGS beside this script" >&2; exit 1; }

FAILED=""

# Files every image takes from THIS directory through the named build context `tracy-web-files`
# (`COPY --from=tracy-web-files …` in the Dockerfiles). With the Dockerfile itself they are the
# image's inputs, and their hash is stamped on the image as a label.
WEB_FILES="tracy-sendmail tracy-sendmail.ini"

# The main build context. Joomla's Dockerfile copies the T4 skill from `vendor/` (`COPY
# vendor/joomla/joomlart-t4-skill /opt/tracy/joomlart-t4`), so its context must hold that path — the
# reason `bash web/build.sh joomla` died on `"/vendor/joomla/joomlart-t4-skill": not found` from 13/09
# (tasks/nhat-ky-main.md). The other two copy nothing from the main context, and keep this directory:
# a repo-root context ships far more to the daemon for nothing.
#
# Joomla's context is the repo root when there is a checkout (as ever). With no checkout — a shard —
# it is a temporary directory holding a copy of the skill tree at the same relative path, made once
# per run and removed on exit.
#
# 🔒 joomla.Dockerfile ITSELF IS NOT CHANGED FOR THIS, and must not be edited to take the tree some
# other way (a named build context, say): its bytes are part of the `tracy.web.inputs` stamp of every
# Joomla image, so any edit — a comment included — makes this script REFUSE every Joomla image a host
# has already built ("exists but was built from other inputs") until IMAGE_TAGS names new tags.
SKILL_REL="vendor/joomla/joomlart-t4-skill"
STAGED_CTX=""

cleanup() { if [ -n "$STAGED_CTX" ]; then rm -rf "$STAGED_CTX"; fi; }
trap cleanup EXIT

# stage_skill <skill dir>: STAGED_CTX = a temporary context with that tree at $SKILL_REL (once per run).
stage_skill() {
  [ -z "$STAGED_CTX" ] || return 0
  if ! STAGED_CTX="$(mktemp -d "${TMPDIR:-/tmp}/web-build-ctx.XXXXXX")"; then
    STAGED_CTX=""
    echo "!! cannot make a temporary build context for $1 (mktemp failed)" >&2
    return 1
  fi
  if ! mkdir -p "$STAGED_CTX/$(dirname "$SKILL_REL")" || ! cp -Rp "$1" "$STAGED_CTX/$SKILL_REL"; then
    rm -rf "$STAGED_CTX"
    STAGED_CTX=""
    echo "!! cannot copy $1 into a temporary build context" >&2
    return 1
  fi
}

# set_context <platform>: sets CONTEXT, or says why it cannot and returns 1. Not printed through
# $(…): that subshell would lose STAGED_CTX, and every Joomla image would copy the tree again.
set_context() {
  local repo checkout installed
  CONTEXT="$HERE"
  [ "$1" = joomla ] || return 0
  repo="$(cd "$HERE/../../../.." 2>/dev/null && pwd)"
  checkout="${repo%/}/$SKILL_REL"
  installed="$(cd "$HERE/.." && pwd)/$SKILL_REL"
  if [ -n "$repo" ] && [ -d "$checkout" ]; then
    CONTEXT="$repo"
  elif [ -d "$installed" ]; then
    stage_skill "$installed" || return 1
    CONTEXT="$STAGED_CTX"
  else
    echo "!! joomla needs the T4 skill tree and found it in neither place: $checkout (a checkout of the repo) or $installed (a host that has the tracy-host image's files: sync-fleet-files.sh puts it there)" >&2
    return 1
  fi
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
  local dockerfile="$1" base="$2" image="$3" stale_rebuilds="${4:-}" platform want have
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
  if ! set_context "$platform"; then
    FAILED="$FAILED $image"
    return 1
  fi
  if ! docker build -f "$dockerfile" --build-arg BASE="$base" \
         --build-context tracy-web-files="$HERE" \
         --label tracy.web.inputs="$want" \
         -t "$image" "$CONTEXT"; then
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

while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"; image="${line#*=}"
  platform="${key%%:*}"
  [ -z "$ONLY" ] || [ "$ONLY" = "$platform" ] || continue

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

  if [ -n "${DEFAULTS_ONLY:-}" ] && ! named_by_default_lines | grep -xF "$image" >/dev/null; then
    continue
  fi
  [ -f "$HERE/$platform.Dockerfile" ] || { echo "!! no $platform.Dockerfile for $key" >&2; exit 1; }
  build_one "$HERE/$platform.Dockerfile" "$key" "$image"
done < "$TAGS"

if [ -z "$ONLY" ] || [ "$ONLY" = emdash ]; then
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
