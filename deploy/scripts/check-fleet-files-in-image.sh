#!/usr/bin/env bash
#
# check-fleet-files-in-image — the tracy-host image carries THIS checkout's fleet deploy files.
#
#   deploy/scripts/check-fleet-files-in-image.sh <image>      (from the repository root)
#
# A machine with no checkout (a shard's updater) lays /opt/tracy-fleet/{stack,dsh} down from the
# image it is about to run. This compares each of those files, byte for byte, with the checkout the
# image is meant to come from, and checks the entry scripts are executable. Read only: one
# throwaway container, nothing written outside a temp file.
set -euo pipefail

IMAGE="${1:?usage: check-fleet-files-in-image.sh <image>}"
[ -f deploy/compose.yml ] || { echo "run from the repository root" >&2; exit 2; }

# <path under /opt/tracy-fleet in the image> <source in this checkout>, one line per file: the same
# set as the COPY lines of apps/tracy-host/Dockerfile into /opt/tracy-fleet/{stack,dsh}/
# (scripts/test/tracy-host-fleet-files-image.test.mjs holds the two equal). Adding a fleet file is
# adding one line here; the shard beta's 18 files (install-shard.sh …) are appended the same way.
FILES='
stack/compose.yml deploy/compose.yml
stack/compose.server.yml deploy/compose.server.yml
stack/tracy-web.env.example deploy/.env.example
stack/deploy-tracy-stack.sh deploy/scripts/deploy-tracy-stack.sh
stack/check-server.sh deploy/scripts/check-server.sh
stack/backup-postgres.sh deploy/scripts/backup-postgres.sh
stack/sync-prefixed-site-dns.py deploy/scripts/sync-prefixed-site-dns.py
stack/prune-old-images.sh deploy/scripts/prune-old-images.sh
stack/install-shard.sh deploy/scripts/install-shard.sh
stack/install-shard-steps.sh deploy/scripts/install-shard-steps.sh
stack/tracy-heartbeat.sh deploy/scripts/tracy-heartbeat.sh
stack/tracy-updater.sh deploy/scripts/tracy-updater.sh
stack/tracy-pgdump-r2.sh deploy/scripts/tracy-pgdump-r2.sh
stack/check-shard.sh deploy/scripts/check-shard.sh
stack/shard-sign.sh deploy/scripts/shard-sign.sh
stack/shard-env-check.sh deploy/scripts/shard-env-check.sh
stack/sync-fleet-files.sh deploy/scripts/sync-fleet-files.sh
stack/compose.shard.yml deploy/compose.shard.yml
stack/nginx-shard.conf deploy/nginx/shard.conf
stack/shard.env.example deploy/shard.env.example
stack/tracy-heartbeat.service deploy/systemd/tracy-heartbeat.service
stack/tracy-heartbeat.timer deploy/systemd/tracy-heartbeat.timer
stack/tracy-updater.service deploy/systemd/tracy-updater.service
stack/tracy-updater.timer deploy/systemd/tracy-updater.timer
stack/tracy-backup-postgres.service deploy/systemd/tracy-backup-postgres.service
stack/tracy-backup-postgres.timer deploy/systemd/tracy-backup-postgres.timer
dsh/host-dsh.yml packages/fleet/tracy-fleet-operation/dsh/host-dsh.yml
dsh/docker-proxy.haproxy.cfg packages/fleet/tracy-fleet-operation/dsh/docker-proxy.haproxy.cfg
dsh/host-dsh.env.example packages/fleet/tracy-fleet-operation/dsh/host-dsh.env.example
dsh/host-dsh-init.sh packages/fleet/tracy-fleet-operation/dsh/host-dsh-init.sh
dsh/deploy-host-dsh.sh packages/fleet/tracy-fleet-operation/dsh/deploy-host-dsh.sh
dsh/seed-profile.sh packages/fleet/tracy-fleet-operation/dsh/seed-profile.sh
dsh/backup-host-dsh.sh packages/fleet/tracy-fleet-operation/dsh/backup-host-dsh.sh
'

# sha256sum on Linux, shasum on a Mac without coreutils.
digest() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1; }

want="$(mktemp)"; got="$(mktemp)"
trap 'rm -f "$want" "$got"' EXIT
while read -r dest src; do
  [ -n "$dest" ] || continue
  [ -f "$src" ] || { echo "not in this checkout: $src (FILES line $dest)" >&2; exit 2; }
  printf '%s %s\n' "$dest" "$(digest < "$src")"
done <<< "$FILES" > "$want"
DESTS="$(awk 'NF { print $1 }' <<< "$FILES")"

if ! docker run --rm --entrypoint sh -e DESTS="$DESTS" "$IMAGE" -c '
  set -eu
  for f in $DESTS; do printf "%s %s\n" "$f" "$(sha256sum < "/opt/tracy-fleet/$f" | cut -d" " -f1)"; done
  test -x /opt/tracy-fleet/stack/deploy-tracy-stack.sh
  test -x /opt/tracy-fleet/dsh/deploy-host-dsh.sh
  test -x /opt/tracy-fleet/dsh/host-dsh-init.sh
  test -x /opt/tracy-fleet/stack/sync-fleet-files.sh
  test -x /opt/tracy-fleet/stack/install-shard.sh
' > "$got"; then
  echo "!! $IMAGE: the container could not read the fleet files, or an entry script is not executable" >&2
  cat "$got" >&2
  exit 1
fi

if ! diff -u "$want" "$got"; then
  echo "!! $IMAGE does not carry this checkout's fleet files (- checkout, + image)" >&2
  exit 1
fi
printf '==> %s carries %s fleet files, byte for byte\n' "$IMAGE" "$(wc -l < "$want" | tr -d ' ')"
# Informational only. An image built without --build-arg TRACY_SOURCE_COMMIT carries an empty
# label, and a bare "built from commit" with nothing after it reads like a half-printed line.
if COMMIT="$(docker image inspect "$IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null)"; then
  if [ -n "$COMMIT" ]; then
    printf 'built from commit: %s\n' "$COMMIT"
  else
    printf 'built from commit: (none — image built without --build-arg TRACY_SOURCE_COMMIT)\n'
  fi
else
  printf 'built from commit: (unknown — docker image inspect failed)\n'
fi
