#!/usr/bin/env bash
#
# seed-profile — copy the image's plugin profile onto the host's /desk-home, replacing what is there.
#
#   seed-profile.sh <image> [desk-home]
#
# ## Why this exists at all
#
# `host-dsh.yml` bind-mounts the host's directory over the container's whole `/desk-home`, and the
# image carries its profile — every Tracy plugin, 45 MB — under exactly that path. So the mount
# HIDES the image's own profile, and the image's entrypoint refuses to boot when it does:
#
#     [entrypoint] /desk-home/profiles/native/package.json is missing.
#
# That refusal is the good outcome. Without it dsh boots, answers HTTP 200, and serves an EMPTY
# client graph: a white page with no error line, the failure CLAUDE.md §3 calls the most expensive
# one in this repo.
#
# The entrypoint's own comment says "`host-dsh-init.sh` seeds the profile first". It did not — there
# was no such step in it, in any branch, and `tracy-dsh` therefore crash-looped on the first
# bring-up of a fresh host (measured on the dev box 07/09). This script is that missing step.
#
# ## 🔒 IT RUNS ON EVERY DEPLOY, NOT ONLY ON INIT, AND THAT IS THE WHOLE POINT
#
# The profile is where the plugins live. Seed it once and it becomes host state that never changes
# again: a new image would be pulled, the container restarted, and every seat would keep running
# LAST MONTH'S plugins — while `docker inspect` shows the new image and every check passes. That is
# precisely the drift the one-dsh architecture was built to end ("build one image, restart one
# container, every site is on the new version"), reintroduced by a bind mount.
#
# So `deploy-host-dsh.sh` calls this after pulling and before `up -d`, always.
#
# ## What it does NOT touch
#
# Only `profiles/` is replaced. `sessions/`, `storages/`, `dsh-passwords-data/`, `workspace/`,
# `dsh-passwords.env` and `.credentials.yaml` are DATA and identity — they are why the mount exists.
# `settings.yaml` is seeded only when absent: the image ships a default, and dsh writes to it.
set -euo pipefail

IMAGE="${1:?usage: seed-profile.sh <image> [desk-home]}"
DESK_HOME="${2:-${HOST_DSH_HOME:-/srv/tracy/host-dsh/home}}"

[ -d "$DESK_HOME" ] || { echo "seed-profile: no $DESK_HOME" >&2; exit 1; }

# Extracted BESIDE the live one and swapped in, rather than untarred over the top. Over the top
# leaves a plugin that the new image deleted still sitting in the tree, where the profile manifest
# no longer names it — a package that resolves and never loads, which is LAW #2's silent half of an
# interface. The swap also keeps the window where the profile is incomplete down to one `mv`.
NEW="$DESK_HOME/.profiles.incoming.$$"
OLD="$DESK_HOME/.profiles.outgoing.$$"
rm -rf "$NEW" "$OLD"
mkdir -p "$NEW"
trap 'rm -rf "$NEW" "$OLD"' EXIT

echo "seed-profile: reading profiles/ out of $IMAGE"
# `--entrypoint sh` because the image's entrypoint is the launcher and would refuse to run for the
# very reason this script exists. `--same-owner` keeps 33:33 — the uid the image runs as, and the
# only uid that may write the site folders.
docker run --rm --entrypoint sh "$IMAGE" -c 'tar -C /desk-home -cf - profiles' \
  | tar -C "$NEW" -xf - --same-owner

[ -f "$NEW/profiles/native/package.json" ] || { echo "seed-profile: $IMAGE carries no profiles/native — refusing to swap" >&2; exit 1; }
[ -f "$NEW/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json" ] \
  || { echo "seed-profile: the seeded profile has no @tracy/dsh-native-bundle — refusing to swap" >&2; exit 1; }

if [ -e "$DESK_HOME/profiles" ]; then
  mv "$DESK_HOME/profiles" "$OLD"
fi
mv "$NEW/profiles" "$DESK_HOME/profiles"
# ⚠ `-h`, AND IT IS NOT A STYLE CHOICE. The image's profile now carries `profiles/node_modules` as
# a SYMLINK to /opt/dsh (see the Dockerfile block that creates it). That path exists inside the
# container and NOT on the host, so a bare `chown -R` dereferences a dangling link, fails, and
# `set -e` ends the seed — on every host, every deploy. With `-h` the link itself is chowned and
# nothing is followed.
chown -Rh 33:33 "$DESK_HOME/profiles"

# The image ships a default; dsh writes to it at runtime. Replacing it on every deploy would reset
# whatever an operator set, so it is seeded once and then left alone.
if [ ! -f "$DESK_HOME/settings.yaml" ]; then
  docker run --rm --entrypoint sh "$IMAGE" -c 'cat /desk-home/settings.yaml' > "$DESK_HOME/settings.yaml"
  chown 33:33 "$DESK_HOME/settings.yaml"
  echo "seed-profile: seeded settings.yaml (it was absent)"
fi

echo "seed-profile: $(du -sh "$DESK_HOME/profiles" | cut -f1) in $DESK_HOME/profiles"
