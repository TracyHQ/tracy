#!/usr/bin/env bash
# Rebuild the vendored dsh fork as ONE commit on top of the upstream history it is based on, so the
# public copy carries upstream's (already public) history plus Tracy's changes, without the private
# fork's own commits, authors or CI history.
#
#   scripts/opensource/squash-submodule.sh <fork-clone-dir> <commit> [upstream-ref]
#
# <fork-clone-dir> must have a remote `upstream` (https://github.com/deepseek-ai/deepseek-harness.git)
# fetched. Prints the new commit; push it as the public repo's default branch.
set -euo pipefail
dir="${1:?fork clone dir}"
commit="${2:?commit of the fork the parent repo pins}"
upstream="${3:-upstream/master}"
base="$(git -C "$dir" merge-base "$commit" "$upstream")"
tree="$(git -C "$dir" rev-parse "$commit^{tree}")"
GIT_AUTHOR_NAME=Tracy GIT_AUTHOR_EMAIL=noreply@tracy.ai \
GIT_COMMITTER_NAME=Tracy GIT_COMMITTER_EMAIL=noreply@tracy.ai \
  git -C "$dir" commit-tree "$tree" -p "$base" \
    -m "Tracy's changes to dsh" \
    -m "Squashed from the private fork at $commit, on top of upstream $(git -C "$dir" describe --tags --always "$base")."
