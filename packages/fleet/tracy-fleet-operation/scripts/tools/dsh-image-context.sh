#!/usr/bin/env bash
#
# dsh-image-context.sh — the fingerprint of everything that can end up inside the tracy-dsh image
# at the commit checked out, so CI can tell "this push changed the image" from "this push changed
# something beside it" WITHOUT a hand-kept list of paths.
#
# WHY NOT `paths-ignore`. That list in build-dsh-image.yml is written by hand and goes stale in
# silence: a COPY line added to the Dockerfile without a matching edit there means the image is
# quietly not rebuilt, and the host serves last week's plugin with nothing red. Measured 14/09: a
# merge touching only the Storybook bench and docs rebuilt 5.8 GB and restarted the dev dsh, and
# the next merge waited 24 minutes behind it. The fix that does not rot is to ask the Dockerfile
# itself what it copies, every time.
#
# WHAT IS HASHED — one line per input, `<git object id> <path>`:
#   - every `COPY <src>…` source in the Dockerfile that is not `--from=` (a stage copy carries
#     nothing new), resolved as a git object at HEAD: a directory becomes its tree id, a file its
#     blob id, the vendored dsh submodule its commit id (a gitlink). Any change under the path,
#     including inside a subtree, changes the id.
#   - a COPY source that git does not track is a BUILD OUTPUT, and its inputs are hashed instead:
#     the generator names them (`generated_inputs` below). A source that is neither tracked nor declared
#     makes this script exit 2 with the path — red, never a silent "no change".
#   - the Dockerfile, .dockerignore, this script, and the generator script: a change to how the
#     context is assembled is a change to the image.
# Build ARGs the workflow passes (DSH_COMMIT) are covered by the submodule gitlink; ARGs pinned in
# the Dockerfile (WP-CLI, Playwright versions) are covered by the Dockerfile blob.
#
# Usage:  dsh-image-context.sh            → prints `ctx-<12 hex>` for HEAD
#         dsh-image-context.sh --explain  → prints every input line, then the fingerprint
#         CTX_REF=<commit> dsh-image-context.sh   → the same for another commit ("would this push rebuild?")
# Runs from anywhere inside the checkout; needs git and the commit, not an initialised submodule.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
REF="${CTX_REF:-HEAD}"

DOCKERFILE=packages/fleet/tracy-fleet-operation/dsh/Dockerfile
DOCKERIGNORE=.dockerignore
SELF=packages/fleet/tracy-fleet-operation/scripts/tools/dsh-image-context.sh
SEEDER_STAGE=packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh

# Build outputs the Dockerfile copies, and what they are built FROM. `stage-cms-seeder.sh` writes
# dsh/cms/ from @tracy/seeder's dist, and that build (packages/cms/tracy-seeder/scripts/build.mjs)
# both COPIES trees into dist and BUNDLES code with esbuild from outside the seeder's own directory.
#
# 🔒 THIS LIST IS PROVEN, NOT REMEMBERED — since 15/09. Until then it named four inputs, and the
# build read eight: `tracy-wordpress-quickstart/contracts` and `tracy-cms-sections/sections` are
# copied into the image, and the bundle pulls in `tracy-cms-sections/lib`, three modules of
# `tracy-design-inspiration`, `scripts/lib/od-slot*.mjs`, `od-brand-engine/dist` and
# `tracy-joomla-quickstart/language-packs.json`. A change to any of them shipped nothing and said
# nothing. `packages/fleet/tracy-fleet-operation/test/dsh-image-inputs.test.mjs` runs the real build,
# records every path it reads (fs calls + the esbuild metafile), and fails on any path outside the
# list below — so adding an import to the seeder without adding its directory here is red on the PR.
# `pnpm-lock.yaml` stands for the npm dependencies the bundle inlines (linkedom, undici, …).
# A function rather than an associative array: macOS ships bash 3.2, and this script is also run
# by hand on a laptop to answer "would this push rebuild the image".
generated_inputs() {
  case "$1" in
    packages/fleet/tracy-fleet-operation/dsh/cms)
      echo "packages/cms/tracy-seeder packages/cms/tracy-joomla-quickstart packages/cms/tracy-wordpress-quickstart/contracts packages/cms/tracy-cms-sections packages/design/tracy-design-inspiration packages/fleet/tracy-fleet-operation/scripts/provision scripts/lib vendor/tracy/od-design-system vendor/tracy/od-brand-engine pnpm-lock.yaml $SEEDER_STAGE" ;;
    *) echo "" ;;
  esac
}

EXPLAIN=0
[ "${1:-}" = "--explain" ] && EXPLAIN=1

# COPY lines, with backslash continuations joined, `--from=` stage copies dropped, the last
# argument (destination) removed, and any `--chown=`/`--chmod=` flags dropped.
copy_sources() {
  git show "$REF:$DOCKERFILE" | awk '
    /\\$/ { sub(/\\$/, ""); buf = buf $0; next }
    { print buf $0; buf = "" }
  ' \
  | awk '$1 == "COPY" && $0 !~ /--from=/ {
      n = NF; out = ""
      for (i = 2; i < n; i++) if ($i !~ /^--/) out = out " " $i
      print out
    }' \
  | tr ' ' '\n' | sed -E 's#/+$##' | grep -v '^$' | sort -u
}

object_id() {
  # `<ref>:<path>` names the tree, blob or gitlink at that path in the commit — or nothing.
  git rev-parse -q --verify "$REF:$1" 2>/dev/null || true
}

lines=()
add() { lines+=("$1 $2"); }

for src in $(copy_sources); do
  id="$(object_id "$src")"
  if [ -n "$id" ]; then
    add "$id" "$src"
    continue
  fi
  inputs="$(generated_inputs "$src")"
  if [ -n "$inputs" ]; then
    for input in $inputs; do
      iid="$(object_id "$input")"
      [ -n "$iid" ] || { echo "error: generated source $src declares input $input, which git does not track at $REF" >&2; exit 2; }
      add "$iid" "$src <- $input"
    done
    continue
  fi
  echo "error: Dockerfile copies '$src', which git does not track at $REF and no GENERATED entry explains." >&2
  echo "       If it is a build output, add it to generated_inputs in $SELF with the paths it is built from." >&2
  exit 2
done

for meta in "$DOCKERFILE" "$DOCKERIGNORE" "$SELF"; do
  id="$(object_id "$meta")"
  [ -n "$id" ] || { echo "error: $meta is not tracked at $REF" >&2; exit 2; }
  add "$id" "$meta"
done

sorted="$(printf '%s\n' "${lines[@]}" | sort)"
fingerprint="ctx-$(printf '%s\n' "$sorted" | shasum -a 256 | cut -c1-12)"

if [ "$EXPLAIN" = 1 ]; then
  printf '%s\n' "$sorted"
  echo "---"
  echo "$(printf '%s\n' "$sorted" | wc -l | tr -d ' ') inputs"
fi
echo "$fingerprint"
