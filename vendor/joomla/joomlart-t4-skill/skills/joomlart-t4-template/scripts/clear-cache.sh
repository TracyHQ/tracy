#!/usr/bin/env bash
# Clear only the canonical T4 cache of an existing Joomla installation.
set -euo pipefail
[[ $# == 2 && "$1" == --root ]] || { echo 'Usage: clear-cache.sh --root <joomla-root>' >&2; exit 2; }
ROOT="$2"
[[ -d "$ROOT" && -f "$ROOT/configuration.php" && -f "$ROOT/includes/defines.php" ]] || {
  echo 'Invalid Joomla root: configuration.php and includes/defines.php are required' >&2; exit 2;
}
ROOT="$(cd "$ROOT" && pwd -P)"
CACHE="$ROOT/media/t4/optimize"
if [[ ! -e "$CACHE" && ! -L "$CACHE" ]]; then echo 'Cache not created yet'; exit 0; fi
[[ -d "$CACHE" ]] || { echo 'Cache is not a directory' >&2; exit 2; }
RESOLVED="$(cd "$CACHE" && pwd -P)"
[[ "$RESOLVED" == "$CACHE" ]] || { echo 'Refusing cache with symlinked path components' >&2; exit 2; }
find "$CACHE" -mindepth 1 -delete
echo "Cleared T4 cache: $CACHE"
