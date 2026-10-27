#!/usr/bin/env bash
# Which Claude Cowork version is "the latest", answered from the SAME place Tracy Desk asks.
#
# 🔒 WHY NOT `git ls-remote --tags`. The first version of provision listed the tags and filtered them with
# a glob hard-coded in shell (`joomla-v0.8.*`, `wordpress-v0.6.*`). Such a glob breaks only
# on the very day the minor version jumps, and it breaks SILENTLY: `wordpress-v0.6.*` cannot match `0.8.x`,
# so the fleet stood still at 0.6.3 while Desk installed 0.8.0. Measured 29/08 on a real new-born site.
#
# `tracy-desk/src/main/features/coworkExtension/extensionManifest.ts` abandoned that approach and recorded
# why: "Measured 25/08/2026: tracy.ai ran 0.4.0, the docs said 0.5.4, this app carried 0.6.0 —
# three numbers, three answers, none of them visibly wrong to anyone holding just one." The fleet was the
# fourth opinion. This file removes it by reading that very manifest.
#
#   cowork_latest joomla 0.8.19   →  "0.8.19<TAB>https://github.com/.../pkg_claudecowork-0.8.19.zip"
#
# Two guards, both falling back to `floor`, carried over as-is from the TypeScript version:
#
#   1. NEVER BELOW THE FLOOR. Pulling a broken release by rolling the manifest back is a real and
#      right move — but it must not drag the fleet below the version the code here was written to talk
#      to.
#   2. ONLY THAT REPO'S OWN RELEASES. `package` arrives over the network and is handed to a site that
#      downloads and installs it itself. A URL that is not a release asset of this repo is not something
#      the fleet puts on anyone's server, whatever the manifest says.
#
# NEVER THROWS. A release is published on someone else's server, and a site build must not fail
# because that server is having a bad minute.

COWORK_MANIFEST_BASE="${COWORK_MANIFEST_BASE:-https://raw.githubusercontent.com/TracyHQ/claude-cowork/main}"
COWORK_RELEASE_PREFIX="https://github.com/TracyHQ/claude-cowork/releases/download/"

# The fallback address when the manifest is silent — built from `floor` itself.
#
# The two platforms name their assets differently because they package differently: Joomla ships a
# package wrapping both component and plugin, WordPress ships the plugin folder. Deriving one from the
# other is a guess that breaks the day either of them changes.
cowork_floor_url() {
  case "$1" in
    joomla)    printf '%spkg_claudecowork-%s.zip' "${COWORK_RELEASE_PREFIX}joomla-v$2/" "$2" ;;
    wordpress) printf '%sclaude-cowork-%s.zip'    "${COWORK_RELEASE_PREFIX}wordpress-v$2/" "$2" ;;
    *) return 1 ;;
  esac
}

# Compares NUMBER BY NUMBER, not as strings — that is the whole reason this function exists: as strings
# `0.10.0` sorts before `0.9.0`, so the tenth minor would read as older than the ninth. A missing part
# reads as 0, so `0.2` equals `0.2.0`.
cowork_newer() {
  python3 - "$1" "$2" <<'PY'
import sys
def parts(v):
    out = []
    for p in v.split('.'):
        try: out.append(int(p))
        except ValueError: out.append(0)
    return out
a, b = parts(sys.argv[1]), parts(sys.argv[2])
for i in range(max(len(a), len(b))):
    x, y = (a[i] if i < len(a) else 0), (b[i] if i < len(b) else 0)
    if x != y: sys.exit(0 if x > y else 1)
sys.exit(1)
PY
}

# cowork_latest <joomla|wordpress> <floor>  → prints "<version>\t<packageUrl>" to stdout.
# Warnings go to stderr so they land in the job log without mixing into the return value.
cowork_latest() {
  local platform="$1" floor="$2" version="" package="" body=""
  local url_floor; url_floor="$(cowork_floor_url "$platform" "$floor")" || {
    echo "!! cowork_latest: unknown platform: $platform" >&2; return 1; }

  body="$(curl -sS --max-time 10 "$COWORK_MANIFEST_BASE/$platform/update.json" 2>/dev/null || true)"
  if [ -n "$body" ]; then
    # Read with python3, not grep: a syntactically broken manifest must become "no answer",
    # never a garbage string carried on into the install URL.
    read -r version package <<<"$(printf '%s' "$body" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
v = d.get("version")
p = d.get("package")
if not isinstance(v, str): v = ""
if not isinstance(p, str): p = ""
sys.stdout.write(v + "\t" + p + "\n")' 2>/dev/null)" || true
  fi

  if [ -z "$version" ] || [ -z "$package" ]; then
    echo "!! could not read the cowork manifest ($platform) — using the floor $floor" >&2
    printf '%s\t%s\n' "$floor" "$url_floor"; return 0
  fi
  case "$package" in
    "$COWORK_RELEASE_PREFIX"*) ;;
    *) echo "!! the cowork manifest ($platform) points outside the repo's releases — ignored: $package" >&2
       printf '%s\t%s\n' "$floor" "$url_floor"; return 0 ;;
  esac
  if ! cowork_newer "$version" "$floor"; then
    printf '%s\t%s\n' "$floor" "$url_floor"; return 0
  fi
  # 🔒 A MANIFEST THAT NAMES A PACKAGE NOBODY UPLOADED MUST NOT STOP EVERY NEW SITE.
  # `update.json` is read live from `main`, and the version in it is bumped in the SAME commit as
  # the plugin header (tests/run.php enforces that) — but the release zip it points at is uploaded
  # by a separate, deliberate act (`scripts/release-wordpress.mjs`: "a release is an act somebody
  # performs"). Between the merge and that act the manifest is honest about the version and wrong
  # about the file. Measured 21/09/2026: `main` said 0.10.0, the zip answered 404, and every new
  # WordPress site died at "installing cowork 0.10.0 … plugin could not be found" — on the dev
  # stand, and on every host that reads this manifest, which is all of them. The floor zip was
  # sitting there the whole time.
  # So the package is asked for before it is trusted; a missing one falls back to the floor, said
  # out loud. The site then builds on the floor plugin and picks up the real version through the
  # plugin's own update check once the release exists — a slower road to the same place, not a
  # dead end.
  local probe
  probe="$(curl -sIL -o /dev/null -w '%{http_code}' --max-time 10 "$package" 2>/dev/null || echo 000)"
  case "$probe" in
    2*) ;;
    *) echo "!! the cowork manifest ($platform) names package $version, which is not uploaded yet (HTTP $probe) — using the floor $floor: $package" >&2
       printf '%s\t%s\n' "$floor" "$url_floor"; return 0 ;;
  esac
  printf '%s\t%s\n' "$version" "$package"
}

# cowork_package <platform> <version> <url> → the package's path on this host, on stdout: read from the host's cache
# (`$TRACY_PRIVATE_ROOT/_cowork`, one file per platform and version), downloaded into it the first time.
#
# 🔒 A SLOW LINK IS NOT A FAILED ONE, AND ONE VERSION IS FETCHED ONCE. The Joomla package carries every quickstart's
# contract (42.5 MB at 0.24.27) and was fetched for each new site under a 120-second cap: on a ~50 KB/s link the cap
# cut it at 5-8 MB and the site was handed over without its component — Site questions' Apply then failed with
# COMPONENT_NOT_REGISTERED (2 of ~12 local Joomla builds, 14/10/2026). A transfer is now given up only when it stalls
# (under 10 KB/s for a minute), a finished one is kept only when its zip reads, and the next site of that version
# reads it from disk.
cowork_package() {
  local platform="$1" version="$2" url="$3"
  case "$platform" in joomla|wordpress) ;; *) echo "!! cowork_package: unknown platform: $platform" >&2; return 1 ;; esac
  # the version names a file: digits and dots only
  case "$version" in ''|*[!0-9.]*) echo "!! cowork_package: not a version: $version" >&2; return 1 ;; esac
  local dir="${TRACY_COWORK_CACHE_DIR:-${TRACY_PRIVATE_ROOT:-/srv/tracy}/_cowork}"
  local file="$dir/$platform-$version.zip"
  if [ -s "$file" ]; then printf '%s\n' "$file"; return 0; fi
  mkdir -p "$dir" || return 1
  local part
  part="$(mktemp "$dir/.$platform-$version.XXXXXX")" || return 1
  echo "==> downloading Tracy's Cowork package $version (kept for the next site)" >&2
  if ! curl -fsSL --connect-timeout 20 --speed-limit 10240 --speed-time 60 -o "$part" "$url"; then
    rm -f "$part"; echo "!! could not download the Cowork package ($url)" >&2; return 1
  fi
  if ! python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).namelist()' "$part" 2>/dev/null; then
    rm -f "$part"; echo "!! the Cowork package from $url is not a readable zip" >&2; return 1
  fi
  # readable by whoever provisions next (mktemp makes it 600)
  chmod 644 "$part" && mv -f "$part" "$file" && printf '%s\n' "$file"
}

# Call directly to inspect by hand: `bash lib/cowork-extension.sh wordpress 0.8.0`
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cowork_latest "${1:?need platform}" "${2:?need floor}"
fi
