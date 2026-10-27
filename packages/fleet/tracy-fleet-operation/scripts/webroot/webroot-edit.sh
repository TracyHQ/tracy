#!/usr/bin/env bash
# webroot-edit.sh — the only WRITE door into the Preview's webroot (ADR 0073 §2, §4).
#
# The agent edits the site in place through this path: write or delete one file in the webroot, each run one
# commit in the local repo (built by webroot-git.sh). Before touching disk, the path goes through the
# zone gate of ADR 0070 — the same classifier the Changes panel uses, bundled from that very module
# (lib/webroot-zones.cjs). The core zone is REFUSED here, the last layer still holding write rights;
# however polite the desk is, it cannot replace this guard.
#
# Ops:
#   --op write  --path X --content-file /tmp/f   write (create or overwrite), commit "agent: write X"
#   --op delete --path X                          delete, commit "agent: delete X"
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/webroot-repo-git.sh
. "$HERE/../lib/webroot-repo-git.sh"
# shellcheck source=../lib/webroot-platform.sh
. "$HERE/../lib/webroot-platform.sh"

LABEL="" OP="" FILE_PATH="" CONTENT_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --op) OP="$2"; shift 2 ;;
    --path) FILE_PATH="$2"; shift 2 ;;
    --content-file) CONTENT_FILE="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$LABEL" && -n "$OP" && -n "$FILE_PATH" ]] || { echo "need --label, --op, --path" >&2; exit 2; }
tracy_require_label "$LABEL"

STACK="$(tracy_private_dir "$LABEL")"
WEBROOT="$(tracy_webroot_dir "$LABEL")"
REPO="$(tracy_repo_dir "$LABEL")"
[[ -d "$WEBROOT" ]] || { echo "no webroot at $WEBROOT" >&2; exit 1; }

# A path relative to the webroot: not absolute, no climbing out, never touching git's own files.
case "/$FILE_PATH/" in
  *"/../"*|"//"*) echo "refused path" >&2; exit 1 ;;
  *"/.git/"*) echo "refused path: .git is not content" >&2; exit 1 ;;
esac

# The platform is read from the webroot itself, through UNMISTAKABLE signs (lib/webroot-platform.sh).
# Do not detect again here: this very spot once detected with `-d administrator` and took every WordPress
# Preview for Joomla, making the zone gate refuse the whole webroot (🔒 21/08/2026).
PLATFORM="$(tracy_webroot_platform "$WEBROOT")"

# Zone gate (ADR 0070): the classifier answers "<zone>\t<path>"; core is the zone the agent may not write.
MANIFEST_ARGS=()
[[ -f "$STACK/core-manifest.json" ]] && MANIFEST_ARGS=(--manifest "$STACK/core-manifest.json")
ZONE=$(node "$TRACY_FLEET_DIR/lib/webroot-zones.cjs" "${MANIFEST_ARGS[@]}" "$PLATFORM" "webroot/$FILE_PATH" | cut -f1)
if [[ "$ZONE" == "core" ]]; then
  echo "refused: webroot/$FILE_PATH is in the core zone (ADR 0070). Change core behavior through overrides or an extension, never by editing core files." >&2
  exit 1
fi

g() { git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" "$@"; }
g rev-parse --verify HEAD >/dev/null 2>&1 \
  || { echo "webroot repo not built yet: run webroot-ensure first" >&2; exit 1; }

TARGET="$WEBROOT/$FILE_PATH"

case "$OP" in
  write)
    [[ -n "$CONTENT_FILE" && -f "$CONTENT_FILE" ]] || { echo "need --content-file" >&2; exit 2; }
    mkdir -p "$(dirname "$TARGET")"
    # File owner follows its neighbours: the container running the site reads/writes the webroot as its own user,
    # and a root-owned file left behind is a 500 error when the CMS wants to overwrite it itself.
    REF_OWNER=$(stat -c '%u:%g' "$TARGET" 2>/dev/null || stat -c '%u:%g' "$WEBROOT")
    install -m 0644 "$CONTENT_FILE" "$TARGET"
    chown "$REF_OWNER" "$TARGET"
    g add -f -- "$FILE_PATH"
    g commit --quiet -m "agent: write $FILE_PATH" || true  # identical content means nothing to record
    echo "{\"ok\":true,\"zone\":\"$ZONE\",\"head\":\"$(g rev-parse HEAD)\"}"
    ;;
  delete)
    [[ -e "$TARGET" ]] || { echo "no such file: $FILE_PATH" >&2; exit 1; }
    rm -f "$TARGET"
    g add -A -f -- "$FILE_PATH"
    g commit --quiet -m "agent: delete $FILE_PATH" || true
    echo "{\"ok\":true,\"zone\":\"$ZONE\",\"head\":\"$(g rev-parse HEAD)\"}"
    ;;
  *) echo "unknown op: $OP" >&2; exit 2 ;;
esac
