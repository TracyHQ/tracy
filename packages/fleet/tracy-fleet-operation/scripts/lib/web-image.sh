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
#   lenient (default)  a NEW site being provisioned. An unlisted base or an image nobody built
#                      leaves the site on its own upstream base — same PHP, no agent tools — and
#                      says so with `!!`. Refusing here would stop every provision on a host whose
#                      images are not built yet, which is a much larger failure than a degraded
#                      agent, and the images are built by hand (web/build.sh).
#   strict             a site that is already ALIVE: render-compose.sh run by hand, or set-php.sh.
#                      A person is sitting there running it, fourteen times in a row, and one `!!`
#                      in fourteen screens of output is a line nobody reads. Refuse, name the
#                      IMAGE_TAGS line that is missing, and leave the compose file untouched.
#                      TRACY_WEB_IMAGE_STRICT=1 asks for this.

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

# Say it the same way in both stances, and let the stance decide whether it is fatal.
# _tracy_web_image_giveup <message> <fallback image>
_tracy_web_image_giveup() {
  local message="$1" fallback="$2"
  if [ "${TRACY_WEB_IMAGE_STRICT:-0}" = 1 ]; then
    echo "!! $message" >&2
    echo "   this site is already running — refusing rather than moving it. Add the line to" >&2
    echo "   web/IMAGE_TAGS and build it: bash ${TRACY_FLEET_DIR:-/opt/tracy-fleet}/web/build.sh" >&2
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
  local platform="$1" base="${2:-}" tags key want

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

  if ! tags="$(tracy_image_tags_file)"; then
    _tracy_web_image_giveup "no web/IMAGE_TAGS found, so nothing maps $key" "$base"
    return
  fi

  # Exact match only. `sed` on the key as a literal: a tag carries dots, and a dot that matches
  # any character is how `php8.2` would quietly answer for `php812`.
  want="$(awk -v k="$key=" 'index($0, k) == 1 { print substr($0, length(k) + 1); exit }' "$tags")"
  if [ -z "$want" ]; then
    _tracy_web_image_giveup "web/IMAGE_TAGS has no line for $key" "$base"
    return
  fi

  _tracy_web_image_require_supported_php "$want" || return 1

  # Built? Asked of the host, not assumed: a compose file naming an image nobody built fails at
  # `docker compose up` with a message about a registry, which sends the reader looking in the
  # wrong place entirely (the same trap platform/emdash.sh records).
  if [ "${TRACY_WEB_IMAGE_CHECK:-1}" = 1 ] && command -v docker >/dev/null 2>&1; then
    if ! docker image inspect "$want" >/dev/null 2>&1; then
      _tracy_web_image_giveup "$want is not built on this host" "$base"
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
