#!/usr/bin/env bash
#
# Which image a site's web container runs — one answer, read from web/IMAGE_TAGS.
#
# Sourced, never executed. provision writes the answer into the site's compose file
# (provision/render-compose.sh) and an upgrade hop moves it (provision/set-php.sh).
#
# WHY A LOOKUP AND NOT A CONSTANT. From Plan 3 the site's web container is also the agent's shell:
# one dsh per host execs into it. So the image is no longer "whatever supplies PHP" — it is the
# image that ALSO carries git, ripgrep, less, jq and the two users the exec names. Which built
# image answers for which upstream base is a fact about what has been built on the host, and that
# belongs in a file next to the Dockerfiles rather than spread across three platform scripts.
#
# 🔒 THE BASE TAG IS THE SITE'S PHP, AND THIS NEVER CHANGES IT.
#
# A base of `wordpress:php8.2-apache` may only ever become the image built FROM
# `wordpress:php8.2-apache`. There is no fallback to the platform's default line — that fallback
# existed for one day and it silently moved a site pinned to PHP 8.2 (because a commercial plugin
# is fatal on 8.3) onto 8.3, and a `joomla:php8.4-apache` site DOWN onto the Joomla 5 image. The
# compose file afterwards says nothing about the PHP it used to run. The default line answers
# exactly one question — "what does a NEW site of this platform get" — and is used only when there
# is no base to preserve.
#
# TWO STANCES, chosen by the caller, because the cost of refusing is not the same on both sides:
#
#   lenient (default)  a NEW site being provisioned. An unlisted base leaves the site on its own
#                      upstream base — same PHP, no agent tools — and says so with `!!`. A LISTED
#                      base whose image is not built here is built on the spot when the caller
#                      asks for it (TRACY_WEB_IMAGE_BUILD=1, which only provision.sh sets — see
#                      below); only when that build fails does the site stay on the upstream base,
#                      and then the provision output says so in a block nobody can miss. Refusing
#                      here would stop every provision on a host whose images are not built yet,
#                      which is a much larger failure than a degraded agent.
#   strict             a site that is already ALIVE: render-compose.sh run by hand, or set-php.sh.
#                      A person is sitting there running it, fourteen times in a row, and one `!!`
#                      in fourteen screens of output is a line nobody reads. Refuse, name the
#                      IMAGE_TAGS line that is missing, and leave the compose file untouched.
#                      TRACY_WEB_IMAGE_STRICT=1 asks for this. It never builds: the command it
#                      names is one line, and the person running it decides when to spend the time.
#
# 🔒 WHY A NEW SITE NO LONGER SETTLES FOR THE UPSTREAM IMAGE WHEN ITS LINE EXISTS (29/10/2026).
# The upstream image has no chromium and no node, and the visual check of a customer's edit draws
# the page with a browser INSIDE the site's web container (tracy-site-tools `browserArgv`). On prod1
# 7 customer turns answered NO_BROWSER, all on Joomla sites. The local stand reproduced the shape: an
# imported Joomla site on `joomla:5-apache` because its IMAGE_TAGS line was not built on that host,
# with one `!!` line in a provision log nobody reads as the only trace. A line in this file is a
# promise the image exists; when it does not, the provision that needs it builds it (web/build.sh
# --line <base>, ~5 minutes once per host and tag) instead of leaving the site behind. A site that
# already landed on an upstream image is moved by provision/move-off-upstream-image.sh.
#
# TRACY_WEB_IMAGE_BUILD=1 is a plain (not exported) shell variable provision.sh sets around sourcing
# its platform file. Not exported on purpose: go-live.sh, restore.sh and snapshot.sh source the same
# platform files and never use the image they resolve, so a 5-minute build there would be pure delay
# — and a provision's children must not inherit it either.

# The tags file, wherever this copy of the scripts is standing. Empty when there is none.
#
# Three places on purpose: the repo (`scripts/lib/` -> `../../web/`), the fleet host, where
# `deploy/fleet-receive.sh` lays the same directories out flat under $TRACY_FLEET_DIR
# (`lib/` -> `../web/`), and an override for anyone testing a different set.
tracy_image_tags_file() {
  local here candidate
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  for candidate in \
    "${TRACY_WEB_IMAGE_TAGS:-}" \
    "$here/../../web/IMAGE_TAGS" \
    "$here/../web/IMAGE_TAGS" \
    "${TRACY_FLEET_DIR:-/opt/tracy-fleet}/web/IMAGE_TAGS"
  do
    [ -n "$candidate" ] && [ -f "$candidate" ] && { printf '%s\n' "$candidate"; return 0; }
  done
  return 1
}

# The directory holding the web Dockerfiles and the files they copy, found the same three ways as
# the tags file above (repo, fleet host, override). Empty and non-zero when there is none.
tracy_web_dir() {
  local here candidate
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  for candidate in \
    "${TRACY_WEB_DIR:-}" \
    "$here/../../web" \
    "$here/../web" \
    "${TRACY_FLEET_DIR:-/opt/tracy-fleet}/web"
  do
    [ -n "$candidate" ] && [ -f "$candidate/emdash.Dockerfile" ] && { (cd "$candidate" && pwd); return 0; }
  done
  return 1
}

# tracy_web_image_line <key>
#
# The image IMAGE_TAGS names for exactly <key> (`joomla:5-apache`, or a bare `joomla` default line).
# Returns 1 when the file has no such line, 2 when there is no file at all.
#
# Exact match only. `awk index()` on the key as a literal: a tag carries dots, and a dot that
# matches any character is how `php8.2` would quietly answer for `php812`.
tracy_web_image_line() {
  local key="$1" tags want
  tags="$(tracy_image_tags_file)" || return 2
  want="$(awk -v k="$key=" 'index($0, k) == 1 { print substr($0, length(k) + 1); exit }' "$tags")"
  [ -n "$want" ] || return 1
  printf '%s\n' "$want"
}

# The `<platform>:<tag>` line that builds <image> — what web/build.sh --line takes. A default line
# (`joomla=…`) builds nothing itself; it names the image of one base line, and build.sh checks so.
_tracy_web_image_build_key() { # key image
  local tags
  case "$1" in *:*) printf '%s\n' "$1"; return 0 ;; esac
  tags="$(tracy_image_tags_file)" || return 1
  awk -F= -v img="$2" '/^[^#]/ && index($1, ":") && substr($0, length($1) + 2) == img { print $1; found = 1; exit } END { exit !found }' "$tags"
}

# Run web/build.sh --line <key>, every line of its output on stderr and indented.
#
# 🔒 NOTHING IT PRINTS MAY START WITH `==`. tracy-host runs provision.sh with stderr merged into
# stdout and shows the rest of any line starting `==` to the customer as the Build step
# (apps/tracy-host/src/provision.js `stepFromLine`), and build.sh says `==> <image>  (from <base>)`.
# Unprefixed, the customer would read a Docker tag as the step their site is on. Stderr, because this
# runs inside `WEB_IMAGE="$(…)"`: anything on stdout would become part of the image name.
_tracy_web_image_run_build() { # web-dir key
  local out
  bash "$1/build.sh" --line "$2" 2>&1 | while IFS= read -r out; do printf '   [web image] %s\n' "$out"; done >&2
  return "${PIPESTATUS[0]}"
}

# tracy_web_image_build <key> <image>
#
# Build the IMAGE_TAGS line that makes <image>, on this host, now, and succeed only when <image> is
# there afterwards (asked of docker, not of build.sh's exit code). Serialised on one host lock when
# `flock` is available: two provisions starting together on a host that lacks the image would
# otherwise both build it, and the second one waits and then finds it built.
tracy_web_image_build() {
  local key="$1" want="$2" web build_key lock
  if ! web="$(tracy_web_dir)" || [ ! -f "$web/build.sh" ]; then
    echo "!! no web/build.sh beside these scripts, so $want cannot be built here" >&2
    return 1
  fi
  if ! build_key="$(_tracy_web_image_build_key "$key" "$want")"; then
    echo "!! no <platform>:<tag> line of web/IMAGE_TAGS builds $want, so it cannot be built here" >&2
    return 1
  fi
  echo "   $want is not built on this host — building it now: bash $web/build.sh --line $build_key" >&2
  lock="${TRACY_WEB_IMAGE_BUILD_LOCK:-/var/lock/tracy-web-image-build.lock}"
  if command -v flock >/dev/null 2>&1 && { : >> "$lock"; } 2>/dev/null; then
    (
      flock 9
      docker image inspect "$want" >/dev/null 2>&1 || _tracy_web_image_run_build "$web" "$build_key"
    ) 9>> "$lock" || true
  else
    _tracy_web_image_run_build "$web" "$build_key" || true
  fi
  if docker image inspect "$want" >/dev/null 2>&1; then
    echo "   $want built — this site gets it" >&2
    return 0
  fi
  return 1
}

# The lenient answer when the on-the-spot build failed: the upstream base, said so that nobody can
# miss it in a provision log, with the two commands that fix it.
_tracy_web_image_loud_fallback() { # key image base
  local key="$1" want="$2" base="$3" fleet="${TRACY_FLEET_DIR:-/opt/tracy-fleet}" build_key
  build_key="$(_tracy_web_image_build_key "$key" "$want" 2>/dev/null)" || build_key="$key"
  {
    echo "!! ----------------------------------------------------------------------------------------"
    echo "!! $want COULD NOT BE BUILT on this host (the lines above say why)."
    echo "!! This NEW site runs the bare upstream image ${base:-<none>} instead: same PHP, but no"
    echo "!! chromium, node, git, rg or jq. The visual check falls back to dsh's own browser (page"
    echo "!! scripts off), and the agent's grep tool fails. Fix the build, then move the site:"
    echo "!!   bash $fleet/web/build.sh --line $build_key"
    echo "!!   bash $fleet/provision/move-off-upstream-image.sh --label ${LABEL:-<label>} --apply"
    echo "!! ----------------------------------------------------------------------------------------"
  } >&2
  [ -n "$base" ] || return 1
  printf '%s\n' "$base"
}

# Say it the same way in both stances, and let the stance decide whether it is fatal.
# _tracy_web_image_giveup <message> <fallback image> [IMAGE_TAGS key whose image is missing]
_tracy_web_image_giveup() {
  local message="$1" fallback="$2" key="${3:-}"
  if [ "${TRACY_WEB_IMAGE_STRICT:-0}" = 1 ]; then
    echo "!! $message" >&2
    echo "   this site is already running — refusing rather than moving it. Add the line to" >&2
    if [ -n "$key" ]; then
      echo "   web/IMAGE_TAGS if it is missing, and build it: bash ${TRACY_FLEET_DIR:-/opt/tracy-fleet}/web/build.sh --line $key" >&2
    else
      echo "   web/IMAGE_TAGS and build it: bash ${TRACY_FLEET_DIR:-/opt/tracy-fleet}/web/build.sh" >&2
    fi
    return 1
  fi
  echo "!! $message" >&2
  echo "   staying on ${fallback:-the upstream image}, whose agent has no git/rg/jq" >&2
  [ -n "$fallback" ] || return 1
  printf '%s\n' "$fallback"
}

# PHP 8.1 has no upstream security fix in the October 2026 release. This is a hard
# refusal in both stances: lenient fallback would provision the vulnerable upstream image.
# The two Joomla aliases below also remain on unpatched PHP 8.2.29 after a fresh pull;
# refuse them until upstream provides patched images, rather than silently changing PHP.
_tracy_web_image_require_supported_php() {
  case "$1" in
    joomla:4-apache|joomla:php8.2-apache|tracy/web-joomla:4-apache-*|tracy/web-joomla:php8.2-apache-*)
      echo "!! no patched upstream image is available for $1 (PHP 8.2.29 measured 27 October 2026)" >&2
      echo "   choose a compatible, patched PHP branch; no image was selected" >&2
      return 1
      ;;
    *:php8.1|*:php8.1-*|*:php8.1.*|*:php8.1@*)
      echo "!! PHP 8.1 is unsupported and has no current security patch: $1" >&2
      echo "   choose a supported, patched PHP branch (8.2 or later); no image was selected" >&2
      return 1
      ;;
  esac
  return 0
}

# tracy_web_image <platform> <image the site would otherwise run>
#
# Prints the image to use and returns 0, or prints nothing and returns non-zero when it has no
# answer it is allowed to give. The second argument is the site's CURRENT (or default upstream)
# image; pass it empty only for a site that has none yet.
tracy_web_image() {
  local platform="$1" base="${2:-}" key want rc

  _tracy_web_image_require_supported_php "$base" || return 1
  _tracy_web_image_require_supported_php "${TRACY_WEB_IMAGE:-}" || return 1

  # An explicit answer from the caller's environment ends it: this is how a person pins an image
  # for one run without editing a file that every site reads.
  if [ -n "${TRACY_WEB_IMAGE:-}" ]; then printf '%s\n' "$TRACY_WEB_IMAGE"; return 0; fi

  # Already ours — re-rendering a compose file must not walk the site back to an upstream image.
  case "$base" in tracy/web-*) printf '%s\n' "$base"; return 0 ;; esac

  # The key, and there is exactly one. A base of this platform's own upstream image maps by that
  # exact tag; no base at all means a new site, which is what the bare platform line is for. Any
  # other base (a third-party image, another platform's) has no key and no substitute.
  if [ -z "$base" ]; then
    key="$platform"
  else
    case "$base" in
      "$platform":*) key="$base" ;;
      *) _tracy_web_image_giveup "$base is not a $platform image, so web/IMAGE_TAGS cannot answer for it" "$base"; return ;;
    esac
  fi

  want="$(tracy_web_image_line "$key")" && rc=0 || rc=$?
  case "$rc" in
    0) ;;
    2) _tracy_web_image_giveup "no web/IMAGE_TAGS found, so nothing maps $key" "$base"; return ;;
    *) _tracy_web_image_giveup "web/IMAGE_TAGS has no line for $key" "$base"; return ;;
  esac

  _tracy_web_image_require_supported_php "$want" || return 1

  # Built? Asked of the host, not assumed: a compose file naming an image nobody built fails at
  # `docker compose up` with a message about a registry, which sends the reader looking in the
  # wrong place entirely (the same trap platform/emdash.sh records).
  if [ "${TRACY_WEB_IMAGE_CHECK:-1}" = 1 ] && command -v docker >/dev/null 2>&1; then
    if ! docker image inspect "$want" >/dev/null 2>&1; then
      # A new site whose provision asked for it: build the one line now (see the 🔒 at the top).
      if [ "${TRACY_WEB_IMAGE_STRICT:-0}" != 1 ] && [ "${TRACY_WEB_IMAGE_BUILD:-0}" = 1 ]; then
        if tracy_web_image_build "$key" "$want"; then
          printf '%s\n' "$want"
          return 0
        fi
        _tracy_web_image_loud_fallback "$key" "$want" "$base"
        return
      fi
      _tracy_web_image_giveup "$want is not built on this host" "$base" "$(_tracy_web_image_build_key "$key" "$want" 2>/dev/null)"
      return
    fi
  fi

  printf '%s\n' "$want"
}

# tracy_emdash_web_image <the tracy/emdash image this host would otherwise run>
#
# EmDash is the one platform whose version is not a constant this repo picks: emdash/build-image.sh
# builds whatever upstream last released, so the web image is built per version on the host
# (web/emdash.Dockerfile) and there is no line in IMAGE_TAGS to look up. Same contract as
# tracy_web_image, including the two stances.
tracy_emdash_web_image() {
  local base="${1:-}" version want
  [ -n "$base" ] || return 1
  # A quickstart site's own template image, `tracy/<template>-emdash:<version>[-tools]`: built on
  # this host from the release pinned in quickstarts.json (platform/emdash.sh), so it is already
  # ours and already carries the tools layer when it ends in -tools. Kept as it is, like
  # tracy/web-emdash below — a re-render must not move a running site off the template it serves.
  if [[ "$base" =~ ^tracy/[a-z0-9][a-z0-9._-]*-emdash:[A-Za-z0-9._-]+$ ]]; then
    printf '%s\n' "$base"; return 0
  fi
  case "$base" in
    tracy/web-emdash:*) printf '%s\n' "$base"; return 0 ;;
    # Anything but a tracy/emdash tag — TRACY_EMDASH_IMAGE pointing at another registry, say. The
    # version cannot be read off it, and guessing produced `tracy/web-emdash:ghcr.io/x:1.2`, which
    # is not even a legal reference.
    tracy/emdash:*) ;;
    *) _tracy_web_image_giveup "$base is not a tracy/emdash tag, so no web image can be derived from it" "$base"; return ;;
  esac
  version="${base#tracy/emdash:}"
  want="tracy/web-emdash:$version"
  if [ "${TRACY_WEB_IMAGE_CHECK:-1}" = 1 ] && command -v docker >/dev/null 2>&1 \
     && ! docker image inspect "$want" >/dev/null 2>&1; then
    _tracy_web_image_giveup "$want is not built on this host (bash ${TRACY_FLEET_DIR:-/opt/tracy-fleet}/web/build.sh emdash)" "$base"
    return
  fi
  printf '%s\n' "$want"
}
