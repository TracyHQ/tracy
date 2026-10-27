#!/usr/bin/env bash
# webroot-push.sh — pushes ONE BATCH of changes from the customer's workbench to the Preview (ADR 0073).
#
# Why batches: editing a template touches five to seven files, and one job per file leaves the user
# counting seconds. One batch = one signature, one gate run, one commit — and if one file is refused
# then NO file is written, so the running copy never lands in a half-done state.
#
# Takes: a tarball (base64 at the layer above, hooks decode it to a file) holding the files to write, plus
# a list of paths to delete. ADR 0070's Core-zone gate runs for EVERY path in the batch,
# before touching disk.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/webroot-repo-git.sh
. "$HERE/../lib/webroot-repo-git.sh"
# shellcheck source=../lib/webroot-platform.sh
. "$HERE/../lib/webroot-platform.sh"

LABEL="" TARBALL="" DELETES_FILE="" MESSAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --tarball) TARBALL="$2"; shift 2 ;;
    --deletes-file) DELETES_FILE="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$LABEL" ]] || { echo "need --label" >&2; exit 2; }
tracy_require_label "$LABEL"

STACK="$(tracy_private_dir "$LABEL")"
WEBROOT="$(tracy_webroot_dir "$LABEL")"
REPO="$(tracy_repo_dir "$LABEL")"
[[ -d "$WEBROOT" ]] || { echo "no webroot at $WEBROOT" >&2; exit 1; }

g() { git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" "$@"; }
g rev-parse --verify HEAD >/dev/null 2>&1 \
  || { echo "webroot repo not built yet: run webroot-ensure first" >&2; exit 1; }

# The platform is read from the webroot itself, like every script here (lib/webroot-platform.sh).
PLATFORM="$(tracy_webroot_platform "$WEBROOT")"

# ── every path in the batch, gathered to be guarded once ────────────────────────────────────────
paths=()
staged=""
if [[ -n "$TARBALL" ]]; then
  [[ -f "$TARBALL" ]] || { echo "no tarball at $TARBALL" >&2; exit 1; }
  staged="/tmp/webroot-push-$LABEL.$$"
  rm -rf "$staged"; mkdir -p "$staged"
  tar -xzf "$TARBALL" -C "$staged"
  while IFS= read -r rel; do
    paths+=("$rel")
  done < <(cd "$staged" && find . -type f | sed 's|^\./||')
fi
if [[ -n "$DELETES_FILE" && -f "$DELETES_FILE" ]]; then
  while IFS= read -r rel || [[ -n "$rel" ]]; do
    [[ -n "$rel" ]] && paths+=("$rel")
  done < "$DELETES_FILE"
fi

[[ ${#paths[@]} -gt 0 ]] || { echo "nothing to push" >&2; exit 1; }

# Paths: relative, no climbing out, never touching git's own files.
for rel in "${paths[@]}"; do
  case "/$rel/" in
    *"/../"*|"//"*) echo "refused path: $rel" >&2; rm -rf "$staged"; exit 1 ;;
    *"/.git/"*) echo "refused path: .git is not content ($rel)" >&2; rm -rf "$staged"; exit 1 ;;
  esac
done

# Core-zone gate (ADR 0070), one run for the whole batch. The whole batch is refused if it holds one core file: half
# a change already written is much harder to clean up than a refusal.
# Per-site core source (ADR 0070 appendix): when the site has its own ledger the gate reads it first,
# with the bundle's static list as the safety net. No file means yesterday's behaviour, unchanged.
MANIFEST_ARGS=()
[[ -f "$STACK/core-manifest.json" ]] && MANIFEST_ARGS=(--manifest "$STACK/core-manifest.json")
zoned=$(printf 'webroot/%s\n' "${paths[@]}" | xargs node "$TRACY_FLEET_DIR/lib/webroot-zones.cjs" "${MANIFEST_ARGS[@]}" "$PLATFORM")
core=$(echo "$zoned" | awk -F'\t' '$1=="core"{print $2}')
if [[ -n "$core" ]]; then
  echo "refused: the batch touches the core zone (ADR 0070). Change core behavior through overrides or an extension, never by editing core files." >&2
  echo "$core" | sed -n 1,20p >&2
  rm -rf "$staged"
  exit 1
fi

# ── ghi ───────────────────────────────────────────────────────────────────────────────────
if [[ -n "$staged" ]]; then
  # File owner follows the running webroot: a root-owned file is a 500 error when the CMS wants to write it itself.
  owner=$(stat -c '%u:%g' "$WEBROOT")
  ( cd "$staged" && find . -type f -exec chown "$owner" {} + )
  nice -n 19 ionice -c3 rsync -a "$staged/" "$WEBROOT/"
  rm -rf "$staged"
fi

if [[ -n "$DELETES_FILE" && -f "$DELETES_FILE" ]]; then
  while IFS= read -r rel || [[ -n "$rel" ]]; do
    [[ -n "$rel" ]] && rm -f "$WEBROOT/$rel"
  done < "$DELETES_FILE"
fi

g add -A -f -- "${paths[@]}" 2>/dev/null || g add -A -f
g commit --quiet -m "${MESSAGE:-agent: push ${#paths[@]} files}" || true

echo "{\"ok\":true,\"files\":${#paths[@]},\"head\":\"$(g rev-parse HEAD)\"}"
