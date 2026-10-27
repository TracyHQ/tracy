#!/usr/bin/env bash
#
# teardown — remove a site's whole footprint from this host.
#
# The mirror image of provision, and platform-agnostic on purpose: provision differs by CMS only
# in the image, the database and the address rewrite, but the machinery around a site — the compose
# stack, the volumes, the ingress rule, the directory — is the same whatever wrote it, so undoing it
# is one script for joomla clones and emdash sites alike.
#
# It is the fleet half of the owner's "delete everything" (tracy-web `DELETE /api/sites/:key` →
# POST /_host/teardown), and it destroys DATA — `docker compose down --volumes` is not reversible.
# The caller (an owner seat, proven at tracy-web) is what authorises that. tracy-web does not start
# it beside a publish, a draft or a domain removal of the same site (it refuses the delete while one
# holds the site), and this script refuses beside one too (the lifecycle lock, step 0). Its closing
# line (`TRACY_RESULT torn_down=1 label=<label>`) is how the job's record says the site is gone;
# a run that stops early leaves the record failed, with the reason, and is safe to run again.
#
# The order is: what must be known (step 0) → the door from the internet (step 1) → the stack and
# its data (step 2) → the directories (step 3) → what the host wrote about the site (steps 4–5).
# Everything that can refuse before data is lost does so in steps 0 and 1, with the site still whole.
#
# 🔒 THE CLOSING LINE IS A CONFIRMATION, NOT THE LAST LINE OF THE SCRIPT. Whoever reads the job's
# record takes `TRACY_RESULT torn_down=1` for "the name and the port are free", so that line is
# printed only when
# every step that stops the site being served, and every step that frees something the next site is
# given, was SEEN to have happened: each rule out of the tunnel (read back), no container of the
# stack or lane left (asked of docker again), the volumes gone, the directories gone, the subnet's
# mail rule out of the chain (read from its listing), the network removed. A step that failed, or
# whose result could not be read, either stops the teardown where it is (`teardown_refuse`) or is
# written down (`unfinished`) and ends it non-zero after the remaining steps — never "warn and go
# on". A host this script cannot reconcile at all (no road to the tunnel and nobody saying there is
# no tunnel; a firewall it may not read) is refused, not assumed clean.
#
# Idempotent: a label whose directory is already gone is a success, not an error — a teardown that
# half-finished once must be safe to run again, and running it again IS the retry of every step.
#
# Usage:
#   teardown.sh --label example-com-0871462c [--site example.com] [--root /srv/tracy]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/site-network.sh
. "$HERE/../lib/site-network.sh"
# shellcheck source=../lib/site-lifecycle.sh
. "$HERE/../lib/site-lifecycle.sh"

# Kept as given: the site's lock is taken by starting this script again (lib/site-lifecycle.sh).
TRACY_SCRIPT_ARGV=("$@")
LABEL=""; SITE=""; ROOT="$TRACY_PRIVATE_ROOT"
while [ $# -gt 0 ]; do
  case "$1" in
    # An empty value or the next flag is not a value: `--label --root` would tear down a site
    # called `--root`, and `--root ''` would put SITE_DIR at `/<label>`.
    --label|--site|--root)
      [ $# -ge 2 ] && [ -n "$2" ] && [ "${2#-}" = "$2" ] \
        || { echo "$1 needs a value" >&2; exit 2; } ;;
  esac
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --site) SITE="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] || { echo "need --label" >&2; exit 2; }
tracy_require_label "$LABEL"

SITE_DIR="$ROOT/$LABEL"
# The same fallback chain provision.sh uses: a host configured once with SITE_DOMAIN (tracy-host
# carries it) names the same hostname here that provision named, instead of `<label>.tracy.ai` on
# the dev host, where every site lives under `tracy.site`.
FLEET_ZONE="${FLEET_ZONE:-${SITE_DOMAIN:-tracy.ai}}"
HOSTNAME_FQDN="$LABEL.$FLEET_ZONE"
CF_CONFIG="${CF_CONFIG:-/etc/cloudflared/config.yml}"
# Overridable because the test runs this script against a scratch tree, and a teardown that can
# only ever point at /var is a teardown nothing can prove.
JOBS_DIR="${JOBS_DIR:-/var/lib/tracy-jobs}"
HOOK_LOG_DIR="${HOOK_LOG_DIR:-/var/log/tracy-hooks}"

# ── 0. one lifecycle script per site, and what must be known before anything is destroyed ─────────
teardown_refuse() {
  echo "!! teardown of $LABEL stopped: $1" >&2
  echo "!! keeping $SITE_DIR (its .env holds the password of that volume) and the teardown log; fix the cause and run the teardown again" >&2
  exit 1
}

# What a later step could not finish or could not confirm, kept for the end: the steps after it
# still run (they free nothing this one was guarding), and the script then ends non-zero without
# its closing line, naming each.
UNFINISHED=""
unfinished() {
  echo "!! $1" >&2
  UNFINISHED="$UNFINISHED${UNFINISHED:+; }$1"
}

# 🔒 NOT BESIDE A GO-LIVE OF THE SAME SITE. A go-live adds the customer's domains to the tunnel and
# writes them down; a teardown running beside it would read the record before the name is in it and
# delete the site with that rule standing. Whoever is second ends here, having changed nothing
# (exit 75) — also when tracy-host restarted and no longer knows the first is running
# (lib/site-lifecycle.sh).
lock_rc=0
tracy_site_lifecycle_lock "$ROOT" "$LABEL" || lock_rc=$?
if [ "$lock_rc" -eq "$TRACY_SITE_BUSY" ]; then
  echo "!! teardown of $LABEL stopped: a go-live or another teardown of it is running — nothing was changed" >&2
  exit "$TRACY_SITE_BUSY"
elif [ "$lock_rc" -ne 0 ]; then
  echo "!! teardown of $LABEL stopped: its lifecycle lock could not be taken — nothing was changed" >&2
  exit 1
fi

# 🔒 THE SITE'S OWN DOMAINS ARE READ BEFORE THE FIRST THING IS DESTROYED, AND "CANNOT READ" IS NOT
# "NONE". A go-live recorded each domain it added in `.golive-domains`; their rules send the name
# straight to this site's port, and the next site given that port would answer for a name it never
# proved. The check used to sit after `compose down --volumes`, and took a link, a pipe or a folder
# under that name for "no record" — the data was gone and the rules stayed. So here, first: the
# record is a plain readable file of host names or it is not there (`tracy_golive_ledger`); with
# names in it the site's port must be readable and this host must have the road that added them
# (the Cloudflare API — go-live.sh has no other). Any of these missing stops the teardown with the
# site whole.
GOLIVE_DOMAINS_FILE="$SITE_DIR/.golive-domains"
tracy_golive_ledger "$GOLIVE_DOMAINS_FILE" \
  || teardown_refuse "$GOLIVE_LEDGER_ERROR, so the site's own domains cannot be taken out of the tunnel — nothing was changed"
HAVE_CF_API=0
if [ -n "${TRACY_CF_API_TOKEN:-}" ] && [ -n "${TRACY_CF_ACCOUNT_ID:-}" ] && [ -n "${TRACY_TUNNEL_ID:-}" ]; then
  HAVE_CF_API=1
fi
# 🔒 WHICH ROAD LEADS TO THE TUNNEL IS DECIDED HERE, AND "NONE" MUST BE SAID, NEVER INFERRED. With
# no API credentials and no config file this script cannot look at the tunnel at all, and it used to
# take that for "no tunnel": on a host whose credentials were merely not handed to it, the site was
# deleted with its rule standing. Now the caller that owns the tunnel configuration says so
# (`TRACY_TUNNEL=none` — tracy-host sets it when it has no tunnel configured, the same fact that
# makes its address door answer "not configured"); without that word, and without a road, the
# teardown is refused.
TUNNEL_ROAD=""
if [ "$HAVE_CF_API" = 1 ]; then
  TUNNEL_ROAD=api
elif command -v cloudflared >/dev/null 2>&1 && [ -f "$CF_CONFIG" ]; then
  TUNNEL_ROAD=file
elif [ "${TRACY_TUNNEL:-}" = catch-all ]; then
  # A shard host: its tunnel sends every name to tracy-web and holds no rule of any site.
  TUNNEL_ROAD=catch-all
elif [ "${TRACY_TUNNEL:-}" = none ]; then
  TUNNEL_ROAD=none
else
  teardown_refuse "this host has no road to the tunnel (no Cloudflare API credentials, no cloudflared with $CF_CONFIG) and was not declared to have no tunnel (TRACY_TUNNEL=none), so whether a rule of $HOSTNAME_FQDN stands cannot be told — nothing was changed"
fi
OWN_PORT=""
if [ -n "$GOLIVE_LEDGER" ] && [ "$TUNNEL_ROAD" != catch-all ]; then
  [ "$HAVE_CF_API" = 1 ] \
    || teardown_refuse "$GOLIVE_DOMAINS_FILE names domains of $LABEL that may be in the tunnel, and this host has no Cloudflare API credentials to take them out — nothing was changed"
  # `|| true`: a missing .env must reach the refusal below, not end the script without a word. Read
  # from what was opened, never through a link or a pipe (`tracy_site_env`): the port says whose
  # rule each name is.
  OWN_PORT="$(tracy_site_env "$SITE_DIR/.env" HOST_PORT || true)"
  case "$OWN_PORT" in
    ''|*[!0-9]*) teardown_refuse "cannot read HOST_PORT of $LABEL, so its own domains in $GOLIVE_DOMAINS_FILE cannot be taken out of the tunnel — nothing was changed" ;;
  esac
fi

if [ "$TUNNEL_ROAD" = file ]; then
  for tool in flock systemctl; do
    command -v "$tool" >/dev/null 2>&1 \
      || teardown_refuse "the tunnel of this host is configured in $CF_CONFIG, and there is no $tool here to change it safely — nothing was changed"
  done
fi

# 🔒 THE FIREWALL TOO: READABLE, OR DECLARED OFF. Step 4 takes the site's subnet out of the mail
# fence; a chain this script may not read used to pass for "no rule". The same switch provision.sh
# reads says a host has no fence (`TRACY_EGRESS_FENCE=off`, a dev machine); anywhere else the chain
# must answer now, while the site is whole — when the site has a network at all (no network, no
# subnet a rule could name). Docker has to answer that first.
if ! SITE_NET_LISTED="$(docker network ls -q --filter "name=^${LABEL}_default\$" 2>&1)"; then
  teardown_refuse "cannot ask docker for the network of $LABEL: $SITE_NET_LISTED — nothing was changed"
fi
if [ -n "$SITE_NET_LISTED" ] && [ "${TRACY_EGRESS_FENCE:-on}" != off ]; then
  iptables -S DOCKER-USER >/dev/null 2>&1 \
    || teardown_refuse "the firewall chain DOCKER-USER cannot be read here (and TRACY_EGRESS_FENCE is not off), so the mail rule of $LABEL could not be taken out — nothing was changed"
fi

echo "==> tearing down $LABEL ${SITE:+($SITE) }→ $SITE_DIR"

# ── 1. the door from the internet — closed FIRST ────────────────────────────────────────────────
# Mirror provision stage 7: the same two ways in, the same lock, the same restart — only removing
# instead of adding. Without this the tunnel keeps a rule pointing at a port nothing listens on any
# more, and the next site to land on that port would answer for this hostname. Skipped when
# neither road exists here (a bare test host), same as provision.
#
# 🔒 BEFORE THE STACK AND ITS DATA, NOT AFTER (05/10/2026). A rule that cannot be removed must stop
# the teardown, and it used to be found out with the volumes already gone. Closing the door first
# means a refusal here leaves a site that still runs, with its directory keeping the port taken and
# the record of what is left; running the teardown again is the retry (removing a rule that is
# already gone succeeds).
#
# 🔒 THE API ROAD NEEDS NO `cloudflared` AND NO CONFIG FILE. A remotely managed tunnel keeps its
# ingress at Cloudflare, and tracy-host runs this script in a container that has neither the binary
# nor `/etc/cloudflared`. Gating both roads on them skipped the removal on every teardown there.
# Measured 21/09 on the dev host: `business-joomla.tracy.site` still had its rule to 127.0.0.1:52007
# five days after that demo moved off the port, `base-joomla` was provisioned onto 52007, and the
# Tracy Business demo served Tracy Base. `apple-joomla` pointed at `ja-voyara-joomla` the same way.
#
# The DNS record is left in place on either road: it is a CNAME to the tunnel, and with the ingress
# rule gone the tunnel answers it with the catch-all 404. `cloudflared tunnel route dns` has no
# delete, and removing the record needs a zone-scoped API call this script is not trusted with —
# a dangling CNAME to our own tunnel is harmless, a stale ingress rule is not.
if [ "$TUNNEL_ROAD" = api ]; then
  # Not best-effort: the rule this leaves behind is the measured failure above.
  python3 "$HERE/ingress_api.py" --hostname "$HOSTNAME_FQDN" --remove \
    || teardown_refuse "the ingress rule of $HOSTNAME_FQDN could not be removed via the API — nothing else was changed"
  echo "==> DNS record for $HOSTNAME_FQDN left as a CNAME to the tunnel (harmless once ingress is gone)"
  # 🔒 THE CUSTOMER'S OWN DOMAINS GO TOO. Each is removed only when its rule is this site's (the
  # name may be another site's by now), from the list read in step 0 — the file is not read a second
  # time. This site's: a rule from before #1037 by its port (`--only-port`), a rule to tracy-web by
  # its owner record (`--owner`; the same reading of where tracy-web listens as `go-live.sh`). A
  # teardown names no generation: every route on record for this label goes with the site.
  OWN_DOMAIN_SERVICE="${TRACY_OWN_DOMAIN_SERVICE:-}"
  if [ -z "$OWN_DOMAIN_SERVICE" ]; then
    case "${TRACY_WEB_ORIGIN:-}" in
      http://127.0.0.1:*|http://localhost:*) OWN_DOMAIN_SERVICE="${TRACY_WEB_ORIGIN%/}" ;;
    esac
  fi
  if [ -n "$OWN_DOMAIN_SERVICE" ] && ! [[ "$OWN_DOMAIN_SERVICE" =~ ^http://[A-Za-z0-9.-]+:[0-9]{1,5}$ ]]; then
    teardown_refuse "the own-domain service '$OWN_DOMAIN_SERVICE' is not http://host:port — nothing else was changed"
  fi
  while IFS= read -r own_domain; do
    [ -n "$own_domain" ] || continue
    rc=0
    REMOVE_ARGS=(--hostname "$own_domain" --remove --only-port "$OWN_PORT" --owner "$LABEL")
    [ -z "$OWN_DOMAIN_SERVICE" ] || REMOVE_ARGS+=(--service "$OWN_DOMAIN_SERVICE")
    python3 "$HERE/ingress_api.py" "${REMOVE_ARGS[@]}" || rc=$?
    case "$rc" in
      0) echo "==> ingress: removed $own_domain" ;;
      3) echo "==> ingress: $own_domain is not routed to this site" ;;
      *) teardown_refuse "the ingress rule of $own_domain (a domain of $LABEL) could not be removed — it may still open the site" ;;
    esac
  done <<LEDGER
$GOLIVE_LEDGER
LEDGER
elif [ "$TUNNEL_ROAD" = file ]; then
  # 🔒 BOTH HALVES, OR THE SITE STAYS. The rule out of the file is not the rule out of the tunnel:
  # the running connector reads the file only when it restarts. Either half failing used to be a
  # line on stderr (`|| echo`, `|| true`) and the teardown went on to delete the site.
  # Chained with `&&`: `set -e` does nothing inside a subshell whose result is tested with `||`.
  (
    flock 9 &&
      python3 "$HERE/ingress.py" --config "$CF_CONFIG" --hostname "$HOSTNAME_FQDN" --remove &&
      cloudflared tunnel --config "$CF_CONFIG" ingress validate
  ) 9>"${TRACY_INGRESS_LOCK:-/var/lock/tracy-cloudflared-ingress.lock}" \
    || teardown_refuse "the ingress rule of $HOSTNAME_FQDN could not be removed from $CF_CONFIG — nothing else was changed"
  systemctl restart cloudflared \
    || teardown_refuse "cloudflared could not be restarted, so the running tunnel still has the rule of $HOSTNAME_FQDN — nothing else was changed"
  echo "==> DNS record for $HOSTNAME_FQDN left as a CNAME to the tunnel (harmless once ingress is gone)"
elif [ "$TUNNEL_ROAD" = catch-all ]; then
  echo "==> this host's tunnel answers every name with tracy-web (TRACY_TUNNEL=catch-all) — no rule to remove, own domains on record included"
else
  echo "==> this host is declared to have no tunnel (TRACY_TUNNEL=none) — no ingress rule to remove"
fi

# The site's subnet, read BEFORE the stack is taken down: `compose down` also deletes the network,
# and after that nothing is left to look up the IP range net #1's iptables rule points at. Reading it
# afterwards leaves an orphan rule — harmless once, but they pile up and docker hands the IP range
# to the next site.
#
# 🔒 "NO SUCH NETWORK" IS DOCKER'S ANSWER, NOT A FAILED QUESTION. Step 0 asked docker whether the
# network exists; when it does, its subnet must be readable — an empty answer used to skip step 4,
# and the rule stayed in the chain for the next site given that subnet.
SITE_NET=""
if [ -n "$SITE_NET_LISTED" ]; then
  SITE_NET="$(docker network inspect "${LABEL}_default" \
    --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
  case "$SITE_NET" in
    */*) ;;
    *) teardown_refuse "the network ${LABEL}_default exists and docker would not say its subnet, so the mail rule of $LABEL cannot be taken out — nothing else was changed" ;;
  esac
fi

# ── 2. the compose stack and its data ───────────────────────────────────────────────────
# `down --volumes` is the whole point of a teardown: the named volumes (a site's database, its
# uploads, an emdash site's SQLite and media) go with the containers. `--remove-orphans` catches a
# container the current compose file no longer declares — a stack that was reshaped in place still
# leaves nothing behind. Best-effort as a COMMAND: a stack already half-gone must not stop the rest
# — and never believed either way. Whatever `down` said, steps 2b and 2c ask docker what of the site
# is still there and remove it, and nothing else is deleted until docker answers "nothing".
DOWN_FAILED=0
if [ -f "$SITE_DIR/docker-compose.yml" ]; then
  if ! ( cd "$SITE_DIR" && docker compose down --volumes --remove-orphans ); then
    DOWN_FAILED=1
    echo "!! compose down reported an error — continuing to clean up what is left" >&2
  fi
else
  echo "==> no compose file at $SITE_DIR — nothing to bring down"
fi

# The stack's own containers, by the compose project label — whatever `down` said. Sets
# SITE_CONTAINERS to the full ids docker names; refuses when docker cannot say, or says something
# that is not a container id.
site_containers() {
  local leftovers container
  SITE_CONTAINERS=""
  # `--no-trunc`: the full 64-hex id is the only answer taken. A short one (`a`) is a prefix docker
  # resolves against every container on the host, not just this project's.
  if ! leftovers="$(docker ps -aq --no-trunc --filter "label=com.docker.compose.project=$LABEL" 2>&1)"; then
    teardown_refuse "cannot ask docker which containers of compose project $LABEL remain: $leftovers"
  fi
  while IFS= read -r container; do
    case "$container" in
      "") ;;
      *[!0-9a-f]*) teardown_refuse "docker answered '$container' when asked for the containers of $LABEL — not a container id" ;;
      *)
        [ "${#container}" -eq 64 ] \
          || teardown_refuse "docker answered '$container' when asked for the containers of $LABEL — not a full container id"
        SITE_CONTAINERS="$SITE_CONTAINERS${SITE_CONTAINERS:+ }$container" ;;
    esac
  done <<EOF
$leftovers
EOF
}
site_containers
for container in $SITE_CONTAINERS; do
  echo "==> removing the leftover container $container of $LABEL"
  docker rm -f "$container" >/dev/null \
    || teardown_refuse "could not remove container $container of compose project $LABEL — it may still serve the site and hold its volumes"
done
if [ -n "$SITE_CONTAINERS" ]; then
  site_containers
  [ -z "$SITE_CONTAINERS" ] \
    || teardown_refuse "container(s) of compose project $LABEL are still there after docker rm: $SITE_CONTAINERS"
fi

# ── 2b. the lane container ──────────────────────────────────────────────────────────────
# The lane era's `create-lane.sh` (deleted 2026-09-06) started the agent's dsh with a plain
# `docker run --name <label>-dsh --restart unless-stopped`, NOT as part of the compose project —
# so `compose down --remove-orphans` above never sees it (it only sweeps containers labelled with
# this project). Lanes born that way are still on the hosts. Left behind, one keeps
# restarting forever with its binds pointing at a directory step 3 is about to delete, and it
# keeps the host port bound so the next lane on that port cannot start.
#
# Measured gap, 04/09/2026: teardown ran green and left the lane running.
#
# BY PREFIX, NOT BY EXACT NAME (05/09/2026). `update-lane.sh` and `migrate-lane-site-folder.sh`
# both park the container they are about to replace under `<label>-dsh-truoc-<stamp>`, keeping it
# as the way back; `update-lane.sh` only ever prunes down to the newest one. An exact `^<label>-dsh$`
# match walks straight past those: measured on `tchwp2august`, a teardown that removed every other
# trace of the site left `tchwp2august-dsh-truoc-20260905-055255` sitting on the host, holding a
# name for a site that no longer exists anywhere else.
#
# The anchor still matters. `^<label>-dsh` cannot reach a neighbouring label — `tchwp2august2-dsh`
# does not match `^tchwp2august-dsh` — and that is the whole reason the filter is anchored rather
# than a bare substring.
#
# 🔒 ASKED, REMOVED, ASKED AGAIN. A docker that could not list them, or a container that would not
# go, used to be a line on stderr — and the teardown reported the site gone with its agent running.
lane_containers() {
  local prefix listing name
  LANE_CONTAINERS=""
  for prefix in "${LABEL}-dsh" "${LABEL}-agent"; do
    if ! listing="$(docker ps -a --filter "name=^${prefix}" --format '{{.Names}}' 2>&1)"; then
      teardown_refuse "cannot ask docker which lane containers of $LABEL remain: $listing"
    fi
    while IFS= read -r name; do
      case "$name" in
        "") ;;
        "$prefix"|"$prefix"-*) LANE_CONTAINERS="$LANE_CONTAINERS${LANE_CONTAINERS:+ }$name" ;;
        # `^<label>-dsh` also matches a neighbour called `<label>-dshop`: not this site's, left alone.
        *) ;;
      esac
    done <<EOF
$listing
EOF
  done
}
lane_containers
for container in $LANE_CONTAINERS; do
  echo "==> removing the lane container $container"
  docker rm -f "$container" >/dev/null \
    || teardown_refuse "could not remove the lane container $container of $LABEL — it is still running"
done
if [ -n "$LANE_CONTAINERS" ]; then
  lane_containers
  [ -z "$LANE_CONTAINERS" ] \
    || teardown_refuse "lane container(s) $LANE_CONTAINERS of $LABEL are still there after docker rm"
fi

# ── 2c. the volumes must really be gone before the key to them is ──────────────────────
# `.env` holds DB_PASSWORD, the only thing that opens `<label>_db`. Deleting the directory while
# that volume survives leaves a database nobody can open, and the next provision of this label
# refuses it ("volume <label>_db outlived its stack", lib/db-volume.sh) — the site cannot come back.
# Measured on a fleet host (#666, ja-vega-joomla): `down` failed, the private directory was gone,
# and an orphan `<label>-db-1` container still held `<label>_db`.
#
# So: ask docker which of this site's volumes survive — by the compose project label, and by the
# exact names the site templates give them — remove any leftover project containers and the
# volumes once more, and ask again. A volume that is still there, or a docker that cannot answer,
# stops the teardown HERE: the directory, its `.env` and the teardown log stay, and the job fails
# naming why. 🔒 An unanswered question is not a clean host (the same rule as db-volume.sh).
# Sets SITE_VOLUMES to this site's surviving volumes (space-separated, possibly empty); returns 1
# with the reason in VOLUME_ERROR when docker cannot say, or says something that is not one of them.
site_volumes() {
  local listing out="" name filter sorted
  SITE_VOLUMES=""; VOLUME_ERROR=""
  for filter in "label=com.docker.compose.project=$LABEL" "name=^${LABEL}_db\$" "name=^${LABEL}_app\$"; do
    if ! listing="$(docker volume ls -q --filter "$filter" 2>&1)"; then
      VOLUME_ERROR="cannot ask docker which volumes of $LABEL remain (docker volume ls --filter $filter): $listing"
      return 1
    fi
    out="$out$listing"$'\n'
  done
  # Checked on its own: inside the here-document below a failing `sort` would read as "no volumes".
  if ! sorted="$(printf '%s' "$out" | sort -u)"; then
    VOLUME_ERROR="cannot sort the volume listing of $LABEL"
    return 1
  fi
  while IFS= read -r name; do
    case "$name" in
      "") continue ;;
      "${LABEL}_"*[!A-Za-z0-9_.-]*|"${LABEL}_") ;;
      "${LABEL}_"*) SITE_VOLUMES="$SITE_VOLUMES${SITE_VOLUMES:+ }$name"; continue ;;
    esac
    VOLUME_ERROR="docker answered '$name' when asked for the volumes of $LABEL — not a name this site owns"
    return 1
  done <<EOF
$sorted
EOF
  return 0
}

site_volumes || teardown_refuse "$VOLUME_ERROR"
if [ -n "$SITE_VOLUMES" ]; then
  echo "!! volumes of $LABEL survived the teardown: $SITE_VOLUMES — removing them explicitly" >&2
  # The containers that could hold them are gone by now (above).
  for volume in $SITE_VOLUMES; do
    echo "==> removing the volume $volume"
    docker volume rm "$volume" >/dev/null || echo "!! docker volume rm $volume failed" >&2
  done
  site_volumes || teardown_refuse "$VOLUME_ERROR"
  [ -z "$SITE_VOLUMES" ] \
    || teardown_refuse "volume(s) $SITE_VOLUMES still exist after docker volume rm — remove them by hand (docker volume rm $SITE_VOLUMES) only if nothing in them is still wanted"
  echo "==> the volumes of $LABEL are gone"
fi

# ── 3. the directory ────────────────────────────────────────────────────────────────────
# Two roots now, not one: $SITE_DIR is the private half (.env, tokens, compose.yml, work/,
# webroot-baseline.git), and the site folder plus its running webroot live separately under
# TRACY_SITES_ROOT — no bind between them any more, so nothing under the private root's
# removal reaches them.
# `$SITE_DIR/backups/` (ADR 0024: the database dumps of every backup point, the customer's
# customers' personal data among them) goes with it — deleting a site deletes its backups.
#
# 🔒 SOMETHING THAT WILL NOT GO DOES NOT END THE TEARDOWN HERE. Measured 05/10/2026, twice, on sites
# whose install had failed: `rm: cannot remove '…/webroot-baseline.git': Directory not empty`, and
# under `set -e` the script ended on this step — steps 4 and 4b never ran, so the failed site kept its
# SMTP rule, its `<label>_default` network and the /24 under it, as well as the directory.
#
# What held it was a DETACHED `git gc` that the baseline commit had started: it was still repacking
# while `rm -rf` emptied the repo, and then wrote `gc.log` ("failed to run repack") into it — the one
# file left behind on the dev Mac. Commits no longer start one (lib/webroot-repo-git.sh), but a site
# whose baseline was committed before that can still have one running. So: first a bounded wait for a
# gc that `gc.pid` names as alive on this machine; then each path is removed, judged by whether it is
# still THERE rather than by rm's exit status, and tried once more after 2 s; one that stays is said
# with rm's reason. The steps after this one still run, and the teardown ends non-zero naming it, so
# nothing reports the site as gone while part of it is on the host. Running the teardown again is the
# retry: with the directory gone it is the idempotent no-op. The volumes are already gone (step 2c),
# so a directory left here cannot strand a database.
#
# The gc's own record: `gc.pid` holds "<pid> <hostname>" while it runs. A pid from another machine
# (or container) means nothing here, and git itself ignores one that names a different host.
wait_for_repo_gc() {
  local pidfile="$SITE_DIR/webroot-baseline.git/gc.pid" pid="" host="" i
  [ -f "$pidfile" ] || return 0
  read -r pid host < "$pidfile" || true
  case "$pid" in ""|*[!0-9]*) return 0 ;; esac
  [ "$host" = "${HOSTNAME:-}" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  echo "!! a git gc (pid $pid) still runs in $SITE_DIR/webroot-baseline.git — waiting up to 10 s for it to end" >&2
  for ((i = 0; i < 10; i++)); do
    sleep 1
    kill -0 "$pid" 2>/dev/null || { echo "==> the git gc in the baseline repo has ended"; return 0; }
  done
  echo "!! the git gc (pid $pid) is still running after 10 s — removing the directory anyway" >&2
}
wait_for_repo_gc
LEFT_BEHIND=""
remove_path() {
  local target="$1" why=""
  why="$(rm -rf "$target" 2>&1)" || true
  { [ -e "$target" ] || [ -L "$target" ]; } || return 0
  echo "!! could not remove $target (${why:-rm gave no reason}) — trying once more in 2 s" >&2
  sleep 2
  why="$(rm -rf "$target" 2>&1)" || true
  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "!! could not remove $target: ${why:-rm gave no reason}" >&2
    LEFT_BEHIND="$LEFT_BEHIND${LEFT_BEHIND:+ }$target"
  else
    echo "==> removed $target on the second try"
  fi
}
remove_path "$SITE_DIR"
remove_path "$(tracy_site_dir "$LABEL")"
# The access key lives beside the private directory: a label used again must never inherit it.
remove_path "$(dirname "$SITE_DIR")/.site-access/$LABEL"
# The seal (`.content-contracts/<label>.json`) and the measured facts (`.site-facts/<label>.json`)
# live BESIDE the site folders, never inside one, so the lines above never reached them. Left behind,
# they belong to the next site given this label: a Joomla template provision refuses "to reopen a
# protected site", and a WordPress build reads the old site's contract. Measured 23/09/2026 on the
# local stand: 13 test sites torn down through the delete door, 25 such files left.
remove_path "$TRACY_SITES_ROOT/.content-contracts/$LABEL.json"
remove_path "$TRACY_SITES_ROOT/.site-facts/$LABEL.json"
# An imported copy's record of its derived contract (`collect-import-contract.mjs`) lives beside them too,
# and is what gives the agent the derived door: left behind, the next copy given this label inherits it.
remove_path "$TRACY_SITES_ROOT/.import-contracts/$LABEL"

# ── 4. safety net #1: this site's SMTP-blocking rule ────────────────────────────────────
# Mirrors provision step 6. Delete until none is left: `iptables -D` removes only ONE copy, and a
# site built over and over may have left several identical copies.
#
# 🔒 READ FROM THE CHAIN'S LISTING, AND EVERY FAILURE COUNTS (the same rule as go-live.sh step 1).
# `iptables -C` exits non-zero for "no such rule" and for "could not look" alike, and `-D … || break`
# left the loop on a rule that would not go: either way the teardown reported the site gone and the
# next site handed this /24 inherited a rule nobody wrote for it. A rule that is still there, or a
# chain that cannot be read, keeps the network (step 4b is skipped, so the subnet is not handed out)
# and ends the teardown non-zero.
MAIL_RULE_GONE=1
if [ -n "$SITE_NET" ] && [ "${TRACY_EGRESS_FENCE:-on}" != off ]; then
  MAIL_RULE="-A DOCKER-USER -s $SITE_NET -j TRACY-FLEET-EGRESS"
  # 0 = in the chain · 1 = not in it · 2 = the chain could not be read
  mail_rule_present() {
    local listed
    listed="$(iptables -S DOCKER-USER 2>/dev/null)" || return 2
    # A here-string, not a pipe: under `pipefail` a writer cut short by `grep -q` would read as "absent".
    grep -qxF -- "$MAIL_RULE" <<<"$listed"
  }
  while :; do
    rc=0
    mail_rule_present || rc=$?
    [ "$rc" -eq 0 ] || break
    if ! iptables -D DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS; then
      rc=3
      break
    fi
  done
  case "$rc" in
    1)
      # The listing is compared as text; `-C` exiting 0 can only mean the rule IS there.
      if iptables -C DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS 2>/dev/null; then
        MAIL_RULE_GONE=0
        unfinished "the firewall still has the mail rule of $SITE_NET, though its listing does not show it as written"
      fi ;;
    2) MAIL_RULE_GONE=0; unfinished "the firewall chain DOCKER-USER could not be read, so the mail rule of $SITE_NET may still be in it" ;;
    *) MAIL_RULE_GONE=0; unfinished "the mail rule of $SITE_NET could not be removed from DOCKER-USER" ;;
  esac
  # Saved, or the next reboot brings the rule back. A host without the tool keeps no saved rule set.
  if [ "$MAIL_RULE_GONE" = 1 ] && command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save >/dev/null 2>&1 \
      || unfinished "the firewall rules could not be saved — a reboot would bring the mail rule of $SITE_NET back"
  fi
fi

# ── 4b. the site's own network ──────────────────────────────────────────────────────────
# provision.sh creates `<label>_default` itself, on an explicit /24 under 10.240.0.0/16 — 256 of them
# for the whole host — and the compose file names it `external: true`, so `compose down` above leaves
# it. Nothing else ever removed it: measured 05/10/2026 on a dev Mac, 183 `_default` networks and 182
# of the 256 subnets taken, most with no container left; past 256 every provision on the host stops at
# "no free explicit site subnet". Exact name only (`<label>2_default` is a neighbour's).
#
# LAST, AFTER STEP 4, AND UNDER THE ALLOCATOR'S LOCK. The freed /24 is the next provision's to take,
# so this subnet's SMTP rule must already be gone (taken later, it would take the new site's rule with
# it); and provision lists every network and inspects them all at once, so one vanishing between the
# two would fail it.
#
# 🔒 A NETWORK THAT WILL NOT GO IS A SITE THAT IS NOT GONE. Docker refuses to remove a network
# something is still attached to — a container of the site this script did not find. It used to be
# said and left, with the closing line printed all the same; now it ends the teardown non-zero, and
# the next teardown of this label takes it once it is free. Asked of docker again afterwards: gone
# is what docker's listing says, not what `network rm` returned.
remove_site_network() {
  local listed why
  if ! listed="$(docker network ls -q --filter "name=^${LABEL}_default\$" 2>&1)"; then
    echo "!! cannot ask docker whether the site network ${LABEL}_default remains: $listed" >&2
    return 1
  fi
  [ -n "$listed" ] || return 0
  # tracy-web (and tracy-host on a macOS stand) joins an isolated site's network (lib/site-network.sh): let go of it first, or docker
  # refuses the removal for an endpoint that is ours, not the site's.
  local web
  for web in "$(tracy_web_container 2>/dev/null)" "$(tracy_host_container 2>/dev/null)"; do
    [ -n "$web" ] && { docker network disconnect "${LABEL}_default" "$web" >/dev/null 2>&1 || true; }
  done
  why="$(docker network rm "${LABEL}_default" 2>&1 >/dev/null)" || true
  if ! listed="$(docker network ls -q --filter "name=^${LABEL}_default\$" 2>&1)" || [ -n "$listed" ]; then
    echo "!! could not remove the site network ${LABEL}_default: ${why:-docker gave no reason}; docker network rm ${LABEL}_default once nothing uses it" >&2
    return 1
  fi
  echo "==> removed the site network ${LABEL}_default${SITE_NET:+ ($SITE_NET)}"
}
if [ "$MAIL_RULE_GONE" != 1 ]; then
  echo "!! keeping the site network ${LABEL}_default: its subnet still has a mail rule, and must not be handed to another site" >&2
elif command -v flock >/dev/null 2>&1 && [ -d "$TRACY_PRIVATE_ROOT" ]; then
  # In a subshell for the lock, so its verdict comes back as an exit status.
  ( flock 9; remove_site_network ) 9>"$TRACY_PRIVATE_ROOT/.network-allocator.lock" \
    || unfinished "the site network ${LABEL}_default is still on this host"
else
  remove_site_network || unfinished "the site network ${LABEL}_default is still on this host"
fi


# ── 5. the paper trail this host keeps about the site ───────────────────────────────────
# Everything above removes what SERVES the site. This removes what the host WROTE ABOUT it, and it
# is not bookkeeping: a job record carries whole slabs of the site's own content in `output`.
#
# 🔒 Measured 2026-08-25, after `mentor-educazone-net-a6886ede` had been torn down cleanly: a 93 KB
# content inventory, 17 job records and 4 hook logs were still on disk, all naming a site that no
# longer existed anywhere else in the system.
#
# Only files this label OWNS. A teardown that reached across to delete another site's history
# would be a worse bug than the one it fixes.
#
# And only FINISHED ones. tracy-host hands this script its real jobs directory (JOBS_DIR), and the
# record of the job running this teardown is in it, labelled with this site and still `running`.
# deploy-tracy-stack.sh §3b drains a host by waiting until no job is queued or running: a record
# dropped while its job runs reads as an idle host, and the deploy replaces tracy-host mid-teardown.
# A queued or running record stays; tracy-host settles it, and the next teardown of this label takes it.
if [ -d "$JOBS_DIR" ]; then
  python3 - "$JOBS_DIR" "$LABEL" <<'JOBS' || echo "!! could not prune job records — check $JOBS_DIR by hand" >&2
import json, os, sys
jobs_dir, label = sys.argv[1], sys.argv[2]
dropped = 0
for name in os.listdir(jobs_dir):
    if not name.endswith(".json"):
        continue
    path = os.path.join(jobs_dir, name)
    try:
        with open(path) as f:
            job = json.load(f)
    except (OSError, json.JSONDecodeError):
        continue
    # The label FIELD, not the filename: jobs are named by job id, and a substring match on the
    # content would sweep up the demo-site records that merely mention this label.
    if job.get("label") == label and job.get("state") not in ("queued", "running"):
        os.remove(path)
        dropped += 1
if dropped:
    print(f"job records: dropped {dropped} for {label}")
JOBS
fi

# The hook logs this label owns, by the exact names `tracy-hooks.py` builds. Named exactly rather
# than globbed on the label: a glob would also match another label that contains this one.
# Only two remain — webroot jobs write into the job record, not a log file of their own.
# The teardown log stays when `compose down` failed (#666) or step 3 left something behind: it is
# the only place that says why.
rm -f "$HOOK_LOG_DIR/provision-$LABEL.log" 2>/dev/null || true
if [ -n "$LEFT_BEHIND" ]; then
  echo "==> keeping $HOOK_LOG_DIR/teardown-$LABEL.log: $LEFT_BEHIND could not be removed, and it says why"
elif [ -n "$UNFINISHED" ]; then
  echo "==> keeping $HOOK_LOG_DIR/teardown-$LABEL.log: a step did not finish, and it says which"
elif [ "$DOWN_FAILED" = 0 ]; then
  rm -f "$HOOK_LOG_DIR/teardown-$LABEL.log" 2>/dev/null || true
else
  echo "==> keeping $HOOK_LOG_DIR/teardown-$LABEL.log: compose down failed, and it says why"
fi

# Not `torn_down=1` while part of the site is still on the host (step 3): the job fails, naming it.
if [ -n "$LEFT_BEHIND" ]; then
  echo "!! teardown of $LABEL did not finish (the steps after the directory ran): still on this host after two tries: $LEFT_BEHIND — run the teardown again once nothing holds it, or remove it by hand" >&2
  exit 1
fi
# Nor while a step after the directory could not be finished or confirmed (steps 4, 4b).
if [ -n "$UNFINISHED" ]; then
  echo "!! teardown of $LABEL did not finish: $UNFINISHED — run the teardown again once the cause is fixed" >&2
  exit 1
fi

# The lock's file goes with the site; the lock itself is held until this script ends.
rm -f -- "$(_tracy_site_lifecycle_file "$ROOT" "$LABEL")" 2>/dev/null || true

echo
echo "TRACY_RESULT torn_down=1 label=$LABEL"
echo "==> $LABEL is gone"
