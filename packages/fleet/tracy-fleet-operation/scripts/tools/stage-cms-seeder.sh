#!/usr/bin/env bash
#
# Build the seeder and stage it beside the lane Dockerfile, in `dsh/cms/`, where the
# `COPY cms/ /opt/tracy/cms/` layer picks it up. Run from the repo before `docker build` (and
# before the scp to contabo's dsh-build/).
#
# The two CMS looks used to be staged here too, as `tracy.zip` and `tpl_tracy.zip`. They are not any
# more (07/09/2026: "the public release is always there ... no need to keep this zip in the
# image at all"): the template and the theme are released from the public repository
# TracyHQ/claude-cowork, and `tracy-site-build`'s theme stage installs the released package straight
# from its URL. A copy in the image would be a second answer to "which version is this site on", and
# it would go stale the day after every release — while nothing on the lane would say so.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
OUT="$ROOT/packages/fleet/tracy-fleet-operation/dsh/cms"
# 🔒 `-C "$ROOT"`, AND THE MISSING `-C` COST A WHOLE IMAGE. Every other path here comes from `$0` —
# the tree this script is IN — while `pnpm` resolves its workspace from the CALLER'S directory. In a
# normal checkout those are one directory and nothing shows; built from a throwaway worktree
# (`rebuild-local.sh --ref <branch>`, which is how a build avoids baking in another session's
# uncommitted edits) they are two trees, so the seeder was built in whichever tree the caller stood
# in and the `cp` below read the worktree, which has no `dist/`. Measured 20/09/2026: the dsh build
# died with
#
#     cp: /tmp/tracy-rebuild.XXXX/packages/cms/tracy-seeder/dist/.: No such file or directory
#
# — a path, not a reason, and the same sentence `rebuild-local.sh`'s own comment records from
# 19/09. That round fixed the other half (a worktree with no `node_modules`) and this half kept the
# symptom alive, which is why the comment there reads as if `--ref` already worked.
pnpm -C "$ROOT" --filter @tracy/seeder build >/dev/null
mkdir -p "$OUT"
# The seeder: tracy-site-build's seed stage runs /opt/tracy/cms/seed-<platform>; the bundle, its
# data and the Joomla PHP applier sit beside those two wrappers (packages/cms/tracy-seeder).
# The two look zips are removed as well, so an image built from an older staging directory does not
# quietly keep shipping them.
rm -rf "$OUT/data" "$OUT/seed.mjs" "$OUT/seed-joomla.php" "$OUT/seed-wordpress" "$OUT/seed-joomla" \
  "$OUT/tracy.zip" "$OUT/tpl_tracy.zip"
cp -R "$ROOT/packages/cms/tracy-seeder/dist/." "$OUT/"
ls -la "$OUT"
