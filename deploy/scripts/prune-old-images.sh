#!/usr/bin/env bash
# Remove the images a host can pull back from the registry, after a deploy that succeeded.
#
# WHY THIS EXISTS: every deploy pulls a new image and nothing ever removed the old ones. Measured
# 24/09/2026 on the dev machine: 467 images — 30 tracy-dsh builds at ~6.6 GB each, 194
# tracy-web, 194 tracy-host — plus 52 GB of build cache filled the 290 GB disk to 99%, and the next
# deploy died in the middle of `git fetch` without printing an error. `cowork.tracy.site` then
# answered 502 for twenty minutes, because the half-finished deploy had stopped tracy-web.
#
# WHAT STAYS, in this order of reasons:
#   1. an image any container uses, running or stopped — compared by image id, not by name;
#   2. the tags an env file names: `KEY` and `KEY_PREVIOUS` for every `--keep-env FILE:KEY`, so
#      `deploy-*.sh --rollback` still finds its image without a registry;
#   3. the newest `--keep` images of each `--repo` (default 2).
# Only the repositories named with `--repo` are looked at; a customer site's image, a base image
# or a dangling layer is never this script's business.
#
# 🔒 IT NEVER FAILS THE DEPLOY IT FOLLOWS. The deploy already happened; a removal docker refuses
# (a container created a second ago, a tag shared with another) is reported and skipped.
#
# Usage:
#   prune-old-images.sh --repo ghcr.io/tracyhq/tracy-web --repo ghcr.io/tracyhq/tracy-host \
#     --keep-env /etc/tracy/tracy-web.env:APP_IMAGE_TAG [--keep 2] [--dry-run]
set -uo pipefail

KEEP=2
DRY=0
REPOS=()
KEEP_ENV=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPOS+=("${2:?--repo needs a value}"); shift ;;
    --keep) KEEP="${2:?--keep needs a value}"; shift ;;
    --dry-run) DRY=1 ;;
    --keep-env) KEEP_ENV+=("${2:?--keep-env needs FILE:KEY}"); shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "prune-old-images: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
[ ${#REPOS[@]} -gt 0 ] || { echo "prune-old-images: name at least one --repo" >&2; exit 2; }
case "$KEEP" in '' | *[!0-9]*) echo "prune-old-images: --keep must be a number" >&2; exit 2 ;; esac

# Image ids any container holds.
used_ids=""
containers=$(docker ps -aq 2>/dev/null)
[ -z "$containers" ] || used_ids=$(docker inspect --format '{{.Image}}' $containers 2>/dev/null | sort -u)

# Tags an env file names, with their rollback twin.
keep_tags=""
# `${a[@]+…}`: an empty array under `set -u` is an error on bash 3.2.
for spec in ${KEEP_ENV[@]+"${KEEP_ENV[@]}"}; do
  file="${spec%%:*}" key="${spec#*:}"
  [ -f "$file" ] || continue
  keep_tags+=$(grep -E "^(${key}|${key}_PREVIOUS)=" "$file" | cut -d= -f2- | tr -d '"'"'" | tr -d ' ')$'\n'
done

removed=0
failed=0
for repo in "${REPOS[@]}"; do
  n=0
  # Newest first; a `<none>` tag is a dangling layer, not a named image this script owns.
  while IFS='|' read -r _created r tag id; do
    [ "$r" = "$repo" ] && [ "$tag" != "<none>" ] || continue
    n=$((n + 1))
    [ "$n" -le "$KEEP" ] && continue
    printf '%s\n' "$keep_tags" | grep -xF "$tag" >/dev/null && continue
    printf '%s\n' "$used_ids" | grep -E "^(sha256:)?${id#sha256:}" >/dev/null && continue
    if [ "$DRY" -eq 1 ]; then
      echo "would remove $repo:$tag"
      removed=$((removed + 1))
    elif docker rmi "$repo:$tag" > /dev/null 2>&1; then
      removed=$((removed + 1))
    else
      failed=$((failed + 1))
      echo "prune-old-images: could not remove $repo:$tag (docker refused); left in place"
    fi
  done < <(docker images --format '{{.CreatedAt}}|{{.Repository}}|{{.Tag}}|{{.ID}}' 2>/dev/null | sort -r)
done

echo "prune-old-images: removed $removed image(s), $failed refused, kept the newest $KEEP per repository"
df -h / 2>/dev/null | tail -1 || true
exit 0
