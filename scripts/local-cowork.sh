#!/usr/bin/env bash
# Build a LOCAL Claude Cowork package for Joomla that carries the content contracts of one or more tch
# refs, and put it in the local stand's Cowork cache so the next Joomla site the stand builds installs it.
#
# WHY: a quickstart sealed by a contract only provisions when the Cowork component installed on the site
# carries that contract (the pairing probe answers `contract_unavailable` otherwise: "Cowork token probe
# failed"). A new contract cut on a branch (a role-variable re-release, say tracy-apple/j6/1.3.1) is
# carried by no published Cowork until someone releases one, so a local pack sealed by it cannot be
# built on the stand to be reviewed. This builds the package the next release would be, without
# releasing anything.
#
# HOW THE STAND PICKS IT UP: provision asks for the latest published Cowork (`lib/cowork-extension.sh`,
# read from claude-cowork `main`'s joomla/update.json) and installs it from the host cache
# (`$TRACY_PRIVATE_ROOT/_cowork/joomla-<version>.zip`, fetched once per version). This script builds on
# that same `main`, at that same version, and replaces the cached file; the published file is kept
# beside it as `joomla-<version>.zip.published` and `--restore` puts it back. Nothing in tch changes:
# dev and production have no such cache file of ours and keep downloading the published package.
# A site already built keeps the component it was built with; only sites created after this run get it.
# When `main` moves to a newer version the stand downloads that one (no contracts of ours): run this again.
#
# Contracts: every profile directory under packages/cms/tracy-joomla-quickstart/contracts that holds a
# manifest.json, copied as it is into joomla/cowork/lib/contracts/<same path> (the layout claude-cowork
# uses, same bytes), less the files tch keeps for itself (design-system-measurement.json, questions.json).
# Refs are laid over one another in the order given, so a lane branch named last wins over the
# integration branch for a profile both carry.
#
# Usage (on the machine that runs the stand, from a tch checkout):
#   scripts/local-cowork.sh --ref origin/feat/ds-role-vars-batch2
#   scripts/local-cowork.sh --ref origin/feat/ds-role-vars-batch2 --ref origin/feat/ds-batch2-lane-A
#   scripts/local-cowork.sh --ref ... --build-only      # build and print the zip, install nothing
#   scripts/local-cowork.sh --restore                   # put the published package back
# Options:
#   --cowork <dir>      claude-cowork checkout (default: <tch>/../claude-cowork)
#   --cowork-ref <ref>  claude-cowork ref to build on (default: origin/main, what provision installs)
#   --cache <dir>       Cowork cache (default: TRACY_COWORK_CACHE_DIR, else $TRACY_PRIVATE_ROOT/_cowork
#                       read from deploy/.env of the shared checkout)
set -euo pipefail

REFS=()
COWORK=""
COWORK_REF="origin/main"
CACHE="${TRACY_COWORK_CACHE_DIR:-}"
BUILD_ONLY=0
RESTORE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REFS+=("$2"); shift ;;
    --cowork) COWORK="$2"; shift ;;
    --cowork-ref) COWORK_REF="$2"; shift ;;
    --cache) CACHE="$2"; shift ;;
    --build-only) BUILD_ONLY=1 ;;
    --restore) RESTORE=1 ;;
    -h|--help) sed -n '2,42p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

REPO="$(git rev-parse --show-toplevel)"
SHARED="$(cd "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
[ -n "$COWORK" ] || COWORK="$SHARED/../claude-cowork"
CONTRACTS_PATH="packages/cms/tracy-joomla-quickstart/contracts"

if [ -z "$CACHE" ] && [ "$BUILD_ONLY" -eq 0 ]; then
  ENV_FILE="$REPO/deploy/.env"
  [ -f "$ENV_FILE" ] || ENV_FILE="$SHARED/deploy/.env"
  [ -f "$ENV_FILE" ] || { echo "✖ no deploy/.env: pass --cache <dir>" >&2; exit 2; }
  PRIVATE_ROOT="$(sed -n 's/^TRACY_PRIVATE_ROOT=//p' "$ENV_FILE" | tail -1)"
  [ -n "$PRIVATE_ROOT" ] || { echo "✖ TRACY_PRIVATE_ROOT is not set in $ENV_FILE: pass --cache <dir>" >&2; exit 2; }
  CACHE="$PRIVATE_ROOT/_cowork"
fi

[ -d "$COWORK/.git" ] || [ -f "$COWORK/.git" ] || { echo "✖ no claude-cowork checkout at $COWORK (--cowork <dir>)" >&2; exit 2; }
git -C "$COWORK" fetch origin --quiet
VERSION="$(git -C "$COWORK" show "$COWORK_REF:joomla/update.json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
case "$VERSION" in ''|*[!0-9.]*) echo "✖ not a version in $COWORK_REF:joomla/update.json: $VERSION" >&2; exit 1 ;; esac
TARGET="$CACHE/joomla-$VERSION.zip"
KEPT="$TARGET.published"

if [ "$RESTORE" -eq 1 ]; then
  [ -f "$KEPT" ] || { echo "✖ nothing to restore: no $KEPT" >&2; exit 1; }
  mv -f "$KEPT" "$TARGET"
  rm -f "$TARGET.local.txt"
  echo "==> restored the published Cowork $VERSION: $TARGET"
  exit 0
fi
[ ${#REFS[@]} -gt 0 ] || { echo "✖ name at least one tch ref with --ref" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/local-cowork.XXXXXX")"
CW_TREE="$WORK/claude-cowork"
cleanup() {
  git -C "$COWORK" worktree remove --force "$CW_TREE" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# The contracts of every ref, laid over one another in the order given.
git -C "$REPO" fetch origin --quiet
mkdir -p "$WORK/contracts"
LINEAGE=()
for ref in "${REFS[@]}"; do
  sha="$(git -C "$REPO" rev-parse --short "$ref")"
  echo "==> contracts of $ref ($sha)"
  git -C "$REPO" archive "$ref" "$CONTRACTS_PATH" | tar -x -C "$WORK/contracts"
  LINEAGE+=("$ref@$sha")
done

echo "==> claude-cowork $COWORK_REF (Joomla package $VERSION) into a throwaway worktree"
git -C "$COWORK" worktree add --detach --quiet "$CW_TREE" "$COWORK_REF"
DEST="$CW_TREE/joomla/cowork/lib/contracts"

# Copy each profile directory (one holding a manifest.json) and say which ones the package did not carry
# as they are — those are the reason for this build.
SRC="$WORK/contracts/$CONTRACTS_PATH"
CHANGED=()
while IFS= read -r manifest; do
  dir="$(dirname "$manifest")"
  rel="${dir#"$SRC"/}"
  mkdir -p "$DEST/$rel"
  before="$(cd "$DEST/$rel" && find . -type f -exec shasum {} + 2>/dev/null | sort | shasum)"
  for f in "$dir"/*; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in design-system-measurement.json|questions.json) continue ;; esac
    cp "$f" "$DEST/$rel/"
  done
  after="$(cd "$DEST/$rel" && find . -type f -exec shasum {} + | sort | shasum)"
  [ "$before" = "$after" ] || CHANGED+=("$rel")
done < <(find "$SRC" -mindepth 4 -maxdepth 4 -name manifest.json | sort)

if [ ${#CHANGED[@]} -eq 0 ]; then
  echo "==> the published Cowork $VERSION already carries every contract of these refs: nothing to build"
  exit 0
fi
echo "==> contracts new or changed against the published package (${#CHANGED[@]}):"
printf '    %s\n' "${CHANGED[@]}"

echo "==> building the Joomla package"
( cd "$CW_TREE/joomla/cowork" && bash build.sh )
ZIP="$CW_TREE/joomla/cowork/dist/pkg_claudecowork.zip"

# A slim Cowork (after joomla-v0.24.53) packs no profile: its component holds an index,
# administrator/lib/contracts.json, and each profile is a release asset the site fetches when it binds.
# A local build has no release to fetch from, so the new or changed profiles are put into the
# component, where the engine reads a carried profile first. A full Cowork already carries them.
#
# The package's postflight then prunes every profile the site is not held to (script-install.php,
# `prune`), and a NEW site is held to nothing yet: the bind comes after the install. So on its own the
# prune deleted every profile put in here, the provisioner's fetch went to the PUBLISHED release asset,
# and the index of this build refused it on its sha256 ("contract profile <id>: not on disk"). The
# prune of this package is therefore told to keep the profiles it carries; nothing else changes.
python3 - "$ZIP" "$DEST" "${CHANGED[@]}" <<'PY'
import io, json, os, sys, zipfile
path, dest, profiles = sys.argv[1], sys.argv[2], sys.argv[3:]
COMPONENT = 'packages/com_claudecowork.zip'
INSTALLER = 'script-install.php'
PRUNE = '    public static function prune($contracts, array $held): array\n    {\n'
with zipfile.ZipFile(path) as outer:
    entries = [(info, outer.read(info)) for info in outer.infolist()]
component = next(data for info, data in entries if info.filename == COMPONENT)
with zipfile.ZipFile(io.BytesIO(component)) as inner:
    names = set(inner.namelist())
    if 'administrator/lib/contracts.json' not in names:
        sys.exit(0)
    missing = [p for p in profiles if f'administrator/lib/contracts/{p}/manifest.json' not in names]
    if not missing:
        sys.exit(0)
    rebuilt = io.BytesIO()
    with zipfile.ZipFile(rebuilt, 'w', zipfile.ZIP_DEFLATED) as out:
        for info in inner.infolist():
            out.writestr(info, inner.read(info))
        for p in missing:
            for name in sorted(os.listdir(os.path.join(dest, p))):
                file = os.path.join(dest, p, name)
                if os.path.isfile(file):
                    out.write(file, f'administrator/lib/contracts/{p}/{name}')
installer = next((data for info, data in entries if info.filename == INSTALLER), None)
if installer is None or installer.decode().count(PRUNE) != 1:
    sys.exit(f'✖ {INSTALLER} has no single prune() to keep the carried profiles: the install would delete them')
keep = '        $held = array_merge($held, ' + json.dumps(missing) + '); // carried by this local build (scripts/local-cowork.sh)\n'
installer = installer.decode().replace(PRUNE, PRUNE + keep).encode()
tmp = path + '.tmp'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
    for info, data in entries:
        out.writestr(info, rebuilt.getvalue() if info.filename == COMPONENT else installer if info.filename == INSTALLER else data)
os.replace(tmp, path)
print(f'==> slim package: {len(missing)} profile(s) put into the component, kept by its install-time prune')
PY

# Read back: every new or changed profile is inside the component the package wraps.
python3 - "$ZIP" "${CHANGED[@]}" <<'PY'
import io, sys, zipfile
outer = zipfile.ZipFile(sys.argv[1])
inner = zipfile.ZipFile(io.BytesIO(outer.read('packages/com_claudecowork.zip')))
names = set(inner.namelist())
missing = [p for p in sys.argv[2:] if f'administrator/lib/contracts/{p}/manifest.json' not in names]
if missing:
    sys.exit('✖ the built package is missing: ' + ', '.join(missing))
print(f'==> package carries all {len(sys.argv) - 2} new or changed profiles')
PY

if [ "$BUILD_ONLY" -eq 1 ]; then
  OUT="${TMPDIR:-/tmp}/pkg_claudecowork-$VERSION-local.zip"
  cp "$ZIP" "$OUT"
  echo "==> built (not installed): $OUT"
  exit 0
fi

mkdir -p "$CACHE"
# The published file is kept once: a second run must not take a local build for the published one.
if [ -f "$TARGET" ] && [ ! -f "$KEPT" ]; then mv "$TARGET" "$KEPT"; fi
cp "$ZIP" "$TARGET.tmp" && chmod 644 "$TARGET.tmp" && mv -f "$TARGET.tmp" "$TARGET"
{
  echo "local Claude Cowork $VERSION built $(date -u +%Y-%m-%dT%H:%M:%SZ) on claude-cowork $COWORK_REF ($(git -C "$COWORK" rev-parse --short "$COWORK_REF"))"
  echo "tch refs: ${LINEAGE[*]}"
  echo "contracts added or changed:"
  printf '  %s\n' "${CHANGED[@]}"
  echo "published package kept at: $KEPT (scripts/local-cowork.sh --restore)"
} > "$TARGET.local.txt"
echo "==> installed for new sites: $TARGET (published copy kept: $KEPT)"
