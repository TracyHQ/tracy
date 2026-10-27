#!/usr/bin/env bash
# Compile all T4 entrypoints in one Sass invocation; watch uses the same list.
set -euo pipefail
TPL=""
WATCH=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --template) TPL="${2:?--template needs a directory}"; shift 2 ;;
    --watch) WATCH=true; shift ;;
    -h|--help) echo 'Usage: compile-scss.sh --template <dir> [--watch]'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$TPL" && -f "$TPL/scss/template.scss" ]] || { echo 'Missing --template or scss/template.scss' >&2; exit 2; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -x "$SCRIPT_DIR/../node_modules/.bin/sass" ]]; then
  SASS=("$SCRIPT_DIR/../node_modules/.bin/sass")
elif command -v sass >/dev/null 2>&1; then
  SASS=(sass)
else
  echo 'Sass missing in this execution environment. Run npm ci in the skill directory.' >&2
  exit 2
fi
ENTRIES=()
for entry in template darkmode; do
  for prefix in '' 'local/'; do
    source="$TPL/${prefix}scss/$entry.scss"
    if [[ -f "$source" ]]; then
      mkdir -p "$TPL/${prefix}css"
      ENTRIES+=("$source:$TPL/${prefix}css/$entry.css")
    fi
  done
done
FLAGS=(--style=expanded)
[[ "$WATCH" == false ]] || FLAGS+=(--watch)
"${SASS[@]}" "${FLAGS[@]}" "${ENTRIES[@]}"
