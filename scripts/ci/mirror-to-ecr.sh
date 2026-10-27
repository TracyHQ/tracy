#!/usr/bin/env bash
#
# mirror-to-ecr - make one image of this run present in AWS ECR under the tags its GHCR copy has.
#
#   scripts/ci/mirror-to-ecr.sh --from <ghcr repo> --to <ecr repo> --source <tag> [--tag <tag>]...
#
# Run by the `mirror-to-ecr` jobs of build-app-images.yml and build-dsh-image.yml, logged in to both
# registries already. GHCR stays the registry every build pushes to; ECR is filled from it:
#   1. <to>:<source> missing in ECR -> copied from <from>:<source> (`imagetools create` copies the
#      manifests and their blobs across registries; nothing is pulled into a daemon). This is also
#      the backfill: a context tag an earlier run built, which this run reused without building, is
#      copied the first time a run asks for it.
#   2. <to>:<source> already there -> left as it is (no second copy).
#   3. every --tag is then pointed at <to>:<source> inside ECR, as the build points the same tags at
#      the GHCR manifest (deploy tag, dated commit tag, latest).
# Reads registries only; prints image names and tags, never a credential.
set -euo pipefail

FROM=""; TO=""; SOURCE=""; TAGS=()
TAG_RE='^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$'

die() { printf '::error::mirror-to-ecr: %s\n' "$*" >&2; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:?--from needs a repository}"; shift ;;
    --to) TO="${2:?--to needs a repository}"; shift ;;
    --source) SOURCE="${2:?--source needs a tag}"; shift ;;
    --tag) TAGS+=("${2:?--tag needs a tag}"); shift ;;
    *) die "unknown argument $1" ;;
  esac
  shift
done
[ -n "$FROM" ] && [ -n "$TO" ] && [ -n "$SOURCE" ] || die "usage: --from <repo> --to <repo> --source <tag> [--tag <tag>]..."
for tag in "$SOURCE" ${TAGS[@]+"${TAGS[@]}"}; do
  printf '%s' "$tag" | grep -E "$TAG_RE" >/dev/null || die "not an image tag: $tag"
done

if docker buildx imagetools inspect "$TO:$SOURCE" >/dev/null 2>&1; then
  echo "$TO:$SOURCE is already in ECR - not copied again"
else
  echo "copying $FROM:$SOURCE -> $TO:$SOURCE"
  docker buildx imagetools create --tag "$TO:$SOURCE" "$FROM:$SOURCE"
fi

if [ "${#TAGS[@]}" -gt 0 ]; then
  args=()
  for tag in "${TAGS[@]}"; do args+=(--tag "$TO:$tag"); done
  echo "tagging $TO:$SOURCE as ${TAGS[*]}"
  docker buildx imagetools create "${args[@]}" "$TO:$SOURCE"
fi

# The registry is the only witness: ask it for the tag a deploy will pull.
docker buildx imagetools inspect "$TO:$SOURCE" >/dev/null
echo "in ECR: $TO:$SOURCE${TAGS[*]:+ (also ${TAGS[*]})}"
