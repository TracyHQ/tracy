#!/usr/bin/env bash
#
# migrate-site-from-host — move ONE site from another fleet host onto THIS one.
#
#   migrate-site-from-host.sh <label> --from <ssh-alias> [--platform NAME] [--tag TAG]
#                             [--port N] [--dry-run]
#
# ## Why this is not `restore.sh`
#
# `restore.sh` is a rollback tool: it puts a snapshot back into a site that is ALREADY standing on
# this machine, and it reads `$SITE_DIR/.env` for the database password before it does anything. A
# site arriving from another host has none of that here — no .env, no compose file, no database
# volume — so restore alone fails on its first line. `migrate-site-to-host-dsh.sh` is the other
# neighbour and it is same-host too: it moves a site off its own lane onto the dsh of the machine
# it is already on. Nothing in the tree crossed a machine boundary until this file.
#
# ## What actually has to travel, measured rather than assumed
#
# A site is THREE things, and only one of them is in the site directory:
#
#   webroot          bind mount `./webroot` -> the site directory. Travels in the snapshot tar.
#   database         a NAMED DOCKER VOLUME (`<label>_db`), NOT under /srv/tracy. Travels as the
#                    snapshot's db.sql.gz, and this is the part a plain rsync of /srv/tracy silently
#                    leaves behind — the site comes up empty and looks like a fresh install.
#   the scaffolding  .env (DB_PASSWORD — the dump will not import without the same one), the apache
#                    conf mounts, the team folder `site/`, tracy-agent.token.
#
# ## Order, and why this order
#
#   1. snapshot on the SOURCE          also the rollback point; the source is only READ
#   2. copy the scaffolding            everything but webroot/work/baseline/dsh-home
#   3. `up -d db` here                 restore.sh needs a database to talk to, and `start` cannot
#                                      start a container that has never been created
#   4. restore.sh                      webroot + database, under the image the snapshot names
#   5. render-compose.sh               NOW move to the tracy/web-* image: the agent's shell is this
#                                      container, so it needs git/rg/jq that the upstream base has not
#   6. chown -R 33:33 site/            the agent WRITES in there; a number, never a name (the host's
#                                      passwd may resolve www-data differently — see migrate-site-to-host-dsh)
#   7. up -d --no-deps web · attach-site.sh
#
# 🔒 THE SOURCE IS NEVER WRITTEN TO. No container is stopped there, no file is changed. The old copy
# keeps running and keeps its data; the cutover is a DNS record and a KV row, both listed at the end
# and both reversible in seconds. That is the whole rollback story, and it only holds while nothing
# here touches the other machine.
#
# ⚠ WHAT THIS DOES NOT DO, on purpose: the Cloudflare ingress, the DNS record and the two KV rows.
# Those are account-wide writes with an account-wide blast radius, and the same stance
# `tracy-fleet-operation` takes everywhere — a destructive or outward-facing step prints the command
# and lets a person run it. They are printed at the end, filled in.
# ⚠ IT REACHES THE OTHER MACHINE OVER SSH, SO DO NOT DETACH IT FROM THE SESSION THAT LENT IT A KEY.
# The usual way to run this is `ssh -A <target> '… migrate-site-from-host.sh …'`, and the forwarded
# agent socket dies the moment that ssh returns. Wrapping the call in `setsid nohup … &` to make it
# survive a disconnect therefore breaks the one thing it needs: measured 09/09/2026, the run reached
# preflight and stopped at `root@<source>: Permission denied (publickey)`. Keep the ssh in the
# foreground (or under a job runner that holds it open), or give the target its own key for the
# source instead of borrowing yours.
#
# 🔒 That refusal is the script working. Preflight asks whether it can read the source BEFORE any
# byte moves, so a lost key costs a message rather than half a site.
set -euo pipefail

LABEL=""; FROM=""; PLATFORM=""; TAG=""; DRY_RUN=0; ROOT="/srv/tracy"; PORT_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:?--from needs an ssh alias}"; shift 2 ;;
    --platform) PLATFORM="${2:?}"; shift 2 ;;
    --tag) TAG="${2:?}"; shift 2 ;;
    --port) PORT_ARG="${2:?--port needs a number}"; shift 2 ;;
    --root) ROOT="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -*) echo "unknown argument: $1" >&2; exit 2 ;;
    *) LABEL="$1"; shift ;;
  esac
done
[ -n "$LABEL" ] && [ -n "$FROM" ] || { sed -n '3,5p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
TAG="${TAG:-pre-move-$(hostname -s)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$ROOT/$LABEL"

say() { printf '==> %s\n' "$*"; }
run() { if [ "$DRY_RUN" = 1 ]; then printf '    [dry-run] %s\n' "$*"; else "$@"; fi; }

# ── Preflight: ask everything that can refuse, before anything moves ──────────────────────────
say "0. preflight"
[ "$(id -u)" = 0 ] || { echo "!! must run as root: it chowns the site folder and writes /etc/fstab" >&2; exit 1; }
docker inspect tracy-dsh >/dev/null 2>&1 || { echo "!! no tracy-dsh on this host — run dsh/host-dsh-init.sh first" >&2; exit 1; }
[ -e "$SITE_DIR" ] && { echo "!! $SITE_DIR already exists here; refusing to migrate onto a live site" >&2; exit 1; }
ssh -o BatchMode=yes "$FROM" "test -d $ROOT/$LABEL" || { echo "!! no $ROOT/$LABEL on $FROM" >&2; exit 1; }
# The platform decides which snapshot/restore half runs. Read it off the SOURCE compose rather than
# guessed: `snapshot.sh` defaults to joomla, and a WordPress site dumped as joomla is a dump of a
# database that is not there.
if [ -z "$PLATFORM" ]; then
  PLATFORM="$(ssh "$FROM" "grep -oE 'image: (joomla|wordpress)[:@]' $ROOT/$LABEL/docker-compose.yml | head -1 | sed 's/image: //; s/[:@]//'" || true)"
  [ -n "$PLATFORM" ] || { echo "!! cannot read the platform off $FROM:$ROOT/$LABEL — pass --platform" >&2; exit 1; }
fi
say "    $LABEL · platform $PLATFORM · from $FROM · tag $TAG"

# ── 1. snapshot on the source (READ ONLY over there) ─────────────────────────────────────────
say "1. snapshot on $FROM"
run ssh "$FROM" "set -a; . /etc/tracy/hooks.env; set +a; cd /opt/tracy-fleet/provision && bash snapshot.sh --label '$LABEL' --tag '$TAG' --platform '$PLATFORM'"

# ── 2. the scaffolding ───────────────────────────────────────────────────────────────────────
# webroot comes from the tar in step 4, so it is excluded here — copying it twice would double the
# transfer and the second copy would be the one thrown away. `work/` is a snapshot's scratch,
# `webroot-baseline.git` is a repo of the same files, `dsh-home` belongs to a lane this host has not
# got. Everything else is small and is exactly what restore.sh will look for.
# 🔒 EXCLUDE BY PURPOSE, NOT BY THE NAMES ONE HOST HAPPENS TO HAVE. The first version of this list
# was written from contabo's directory shape and cost 5.7 GB on the first site that came from DO,
# which carries `_rollback` (4.4 GB — the SOURCE's rollback store, and it belongs to the source) and
# `dsh-home-alpha` (1.3 GB — a lane's home; this host runs one dsh for every site and has its own).
# Measured 09/09/2026. Nothing broke; it just carried a gigabyte of somebody else's history.
#
#   webroot            arrives in the snapshot tar at step 4
#   work               a snapshot's scratch
#   *-baseline.git     git mirrors of files that are already travelling
#   dsh-home*          per-site lane homes — there are no lanes here
#   _rollback          the source's restore points, which stay with the source
say "2. scaffolding (.env, compose, apache, site/, token)"
run bash -c "ssh '$FROM' \"tar -C '$ROOT' -cf - --exclude='$LABEL/webroot' --exclude='$LABEL/work' --exclude='$LABEL/*-baseline.git' --exclude='$LABEL/dsh-home*' --exclude='$LABEL/_rollback' '$LABEL'\" | tar -C '$ROOT' -xf -"
run mkdir -p "$SITE_DIR/webroot"

# 🔒 HOST_PORT BELONGS TO THE MACHINE, NOT TO THE SITE — and two fleet hosts hand them out
# independently, so they collide the first time a site moves. Measured 09/09/2026: the landing site
# arrived from DO on 8086, which `finance` already held here. The failure is `docker compose up`
# refusing to bind, AFTER the webroot and the database are already in place — loud, but late.
#
# Only the web container publishes a port (`127.0.0.1:${HOST_PORT}:80`), so rewriting .env before
# step 7 is the whole fix. The tunnel ingress written at cutover has to name the SAME number, which
# is why this prints it rather than leaving the caller to remember.
if [ -n "$PORT_ARG" ]; then
  say "2b. HOST_PORT -> $PORT_ARG (the source's number is taken on this host)"
  run sed -i "s|^HOST_PORT=.*|HOST_PORT=$PORT_ARG|" "$SITE_DIR/.env"
fi

# ── 3–4. the database container, then the snapshot into it ───────────────────────────────────
say "3. db container"
run bash -c "cd '$SITE_DIR' && docker compose up -d db >/dev/null"
say "4. restore webroot + database"
run bash -c "set -a; . /etc/tracy/hooks.env; set +a; cd '$HERE' && bash restore.sh --label '$LABEL' --tag '$TAG' --platform '$PLATFORM'"

# ── 5–7. onto the tracy image, and into the host dsh ─────────────────────────────────────────
say "5. render compose onto the tracy/web-* image"
run bash -c "cd '$HERE' && bash render-compose.sh '$LABEL' --root '$ROOT'"
say "6. chown site/ to the dsh uid"
run chown -R 33:33 "$SITE_DIR/site"
say "7. web container + attach"
run bash -c "cd '$SITE_DIR' && docker compose up -d --no-deps web >/dev/null"
run bash "$HERE/attach-site.sh" "$LABEL"

# ── Proof, from the two places that matter ───────────────────────────────────────────────────
if [ "$DRY_RUN" != 1 ]; then
  say "8. probes"
  PORT="$(sed -n 's/^HOST_PORT=//p' "$SITE_DIR/.env" | sed -n 1p)"
  printf '    site on 127.0.0.1:%s -> HTTP %s\n' "$PORT" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1:$PORT/" || echo '000')"
  printf '    dsh sees /site/%s: %s\n' "$LABEL" \
    "$(docker exec tracy-dsh sh -c "test -d /site/$LABEL && echo yes || echo NO")"
  printf '    agent exec: %s\n' \
    "$(docker exec -u www-data -w "/site/$LABEL" "$LABEL-web-1" bash -lc 'printf "%s uid=%s" "$(pwd)" "$(id -u)"' 2>&1 || echo FAILED)"
fi

# ── The cutover, printed rather than done ────────────────────────────────────────────────────
SITE_KEY="$(ssh "$FROM" "sed -n 's/^SITE=//p' $ROOT/$LABEL/.env 2>/dev/null | head -1" || true)"
cat <<EOF

==> the site is standing here. The cutover is three writes, and none of them happened:

  1. tunnel ingress on THIS host's tunnel:  $LABEL.tracy.ai -> http://127.0.0.1:${PORT:-<HOST_PORT>}
  2. DNS: point the site's record at this host's tunnel (keep the old id — it is the rollback)
  3. KV (namespace FLEET_SITES):
       wrangler kv key put 'host:${SITE_KEY:-<siteKey>}' '<this host>' --namespace-id <ns> --remote
       wrangler kv key put 'attached:$LABEL' 'on' --namespace-id <ns> --remote

  Rollback, in this order: KV row back, then DNS back. $FROM was never written to and is still
  serving the same site on its own tunnel.
EOF
