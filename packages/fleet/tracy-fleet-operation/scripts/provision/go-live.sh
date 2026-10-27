#!/usr/bin/env bash
#
# go-live — flip a copy between DRAFT and LIVE, in both directions.
#
# The customer's only job is to point their domain's DNS here. This script's job is to make the copy
# fit to receive that traffic: let it send mail, let search engines and AI bots read it, and teach
# the tunnel the new domain.
#
#   go-live.sh --label example-com-0871462c --op live  --domain example.com [--domain www.example.com]
#   go-live.sh --label example-com-0871462c --op draft
#   go-live.sh --label example-com-0871462c --op drop-domain --domain example.com
#
# `--route-gen N` (tracy-web sends it with every ask that names a domain): the generation of the
# own-domain routes this run writes or removes — see step 4 and `ingress_api.py`.
#
# `drop-domain` takes ONE of the site's own domains out — the ingress rule and the name in this
# site's record of its domains (step 4) — and touches nothing else: mail, noindex and the other
# domains stay as they are. It is what "Remove domain" on a published site runs.
#
# ## The exit code is the answer
#
# 🔒 EVERY STEP THAT MUST HAPPEN EITHER HAPPENS OR ENDS THE SCRIPT NON-ZERO. The caller raises the
# site's "published" flag on exit 0 and the closing `TRACY_RESULT` line, so a step that fails and
# lets the script run on is a site announced live with mail still closed, or still unindexable —
# and nothing to say so. The one exception is said in a line of its own instead: a `live` that
# could not add one of the domains still ends 0 (the site IS live at its Tracy address) and simply
# never prints that domain's `==> ingress: <domain> → …` line, which the caller reads per domain.
#
# ## The exit code is the answer
#
# 🔒 EVERY STEP OF THE MAIL AND NOINDEX SWITCHES EITHER HAPPENS OR ENDS THE SCRIPT NON-ZERO. The
# caller raises the site's "published" flag on exit 0 and the closing `TRACY_RESULT` line, so a step
# that fails and lets the script run on is a site announced live with mail still closed, or still
# unindexable — and nothing to say so. (The customer's own domains in step 4 are not held to this
# yet: a domain that could not be added or removed is said on stderr and the script goes on.)
#
# Exit 75 means "another go-live of this site is running, nothing was changed": not an outcome of
# the flip, and the caller must not read it as one.
#
# ## Why this is a SWITCH and not "removing the net"
#
# The three safety nets exist because a copy is a FULL copy of the customer's site — the whole user
# table, all the content — standing at a guessable address. That holds until the second the customer
# decides the copy IS their site. From that second on, those very nets become bugs: a real site that
# cannot send order-confirmation mail, and a real site that is not on Google, is a broken site.
#
# So `--op draft` must work, and must be a way back cheap enough that people dare to flip.
#
# ## Why mail has to flip at TWO layers
#
# 🔒 The network blocks at `TRACY-FLEET-EGRESS` (net #1) — it needs to know nothing about the CMS,
# so it holds for unsupported CMSes too. But Joomla also refuses to send by itself with
# `mailer: "none"` in configuration.php. Open the network and forget the app layer: Joomla silently
# sends nothing. Fix the app and forget the network: PHP can call `mail()` but the packets are
# REJECTed. Two failures, one symptom — "no mail anywhere" — and neither leaves an error where
# anyone looks.
#
# WordPress and EmDash have no app layer; for them, the network IS the switch.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

# Kept as given: the site's lock is taken by starting this script again (lib/site-lifecycle.sh).
TRACY_SCRIPT_ARGV=("$@")
LABEL=""; OP=""; ROOT="$TRACY_PRIVATE_ROOT"; DOMAINS=(); PLATFORM=""; ROUTE_GEN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label)  LABEL="$2"; shift 2 ;;
    --op)     OP="$2"; shift 2 ;;
    --domain) DOMAINS+=("$2"); shift 2 ;;
    --root)   ROOT="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --route-gen) ROUTE_GEN="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] || { echo "need --label" >&2; exit 2; }
case "$OP" in live|draft|drop-domain) ;; *) echo "need --op live|draft|drop-domain" >&2; exit 2 ;; esac
case "$ROUTE_GEN" in
  ''|0) ;;
  *[!0-9]*|0*) echo "--route-gen is not a number" >&2; exit 2 ;;
esac
[ "${#ROUTE_GEN}" -le 15 ] || { echo "--route-gen is not a number" >&2; exit 2; }
if [ "$OP" = drop-domain ] && [ "${#DOMAINS[@]}" -ne 1 ]; then
  echo "drop-domain needs exactly one --domain" >&2; exit 2
fi

SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no such site: $SITE_DIR" >&2; exit 2; }
# The same chain provision.sh and teardown.sh read; lib/site-apache-conf.sh prints it into
# frame-ancestors. Without it every Publish on dev (22/10/2026) rewrote `https://*.tracy.site` as
# `https://*.tracy.ai`, and a shard origin could no longer frame the published site.
FLEET_ZONE="${FLEET_ZONE:-${SITE_DOMAIN:-tracy.ai}}"
# shellcheck source=../lib/site-apache-conf.sh
. "$HERE/../lib/site-apache-conf.sh"

# shellcheck source=../lib/site-lifecycle.sh
. "$HERE/../lib/site-lifecycle.sh"

# 🔒 ONE LIFECYCLE SCRIPT PER SITE, AND IT IS TAKEN BEFORE ANYTHING IS READ OR FLIPPED. A live, a
# draft, a drop-domain and a teardown of one site each move the same firewall rule, ingress rules
# and record of domains; side by side they end in whatever order their steps land. Whoever is second
# ends here, having changed nothing (exit 75) — also when the first one's tracy-host has restarted
# and no longer knows it is running (lib/site-lifecycle.sh).
lock_rc=0
tracy_site_lifecycle_lock "$ROOT" "$LABEL" || lock_rc=$?
if [ "$lock_rc" -eq "$TRACY_SITE_BUSY" ]; then
  echo "!! another go-live of $LABEL is running — nothing was changed" >&2
  echo "!! (a draft, a domain removal and a teardown of the site hold the same lock)" >&2
  exit "$TRACY_SITE_BUSY"
elif [ "$lock_rc" -ne 0 ]; then
  exit 1
fi

# The site's own record of the domains a go-live added for it (step 4), one name per line.
GOLIVE_DOMAINS_FILE="$SITE_DIR/.golive-domains"
# Read once, and checked before anything is flipped, so a refusal here leaves the site exactly as it
# was. Anything under that name that is not a plain readable file of host names is not read and not
# written through (lib/site-lifecycle.sh `tracy_golive_ledger`).
if ! tracy_golive_ledger "$GOLIVE_DOMAINS_FILE"; then
  echo "!! $GOLIVE_LEDGER_ERROR — refusing to use it" >&2
  exit 1
fi

if [ "$OP" != drop-domain ]; then
# The platform is read from the stack itself, not taken from the caller unless they force it: a
# remembered answer is confidently wrong, and here it decides whether there is a mail hook.
#
# Not scoped in the Task 2 brief's own table for this file — added because provision.sh (this same
# task) moved where a webroot actually lands to tracy_webroot_dir(), under TRACY_SITES_ROOT. Leaving
# these three checks pointed at $SITE_DIR/webroot would make every freshly-provisioned Joomla or
# WordPress site silently fall through to `else PLATFORM=emdash` here — no error, just the wrong
# mail hook (or none at all) on a site's very first go-live.
if [ -z "$PLATFORM" ]; then
  WEBROOT_DIR="$(tracy_webroot_dir "$LABEL")"
  if [ -f "$WEBROOT_DIR/configuration.php" ]; then PLATFORM=joomla
  elif [ -f "$WEBROOT_DIR/wp-config.php" ] || [ -d "$WEBROOT_DIR/wp-content" ]; then PLATFORM=wordpress
  else PLATFORM=emdash; fi
fi
echo "==> $LABEL ($PLATFORM) → $OP"

# Read without following a link or waiting on a pipe (`tracy_site_env`): empty when it cannot be.
HOST_PORT="$(tracy_site_env "$SITE_DIR/.env" HOST_PORT || true)"
DB_PASSWORD="$(tracy_site_env "$SITE_DIR/.env" DB_PASSWORD || true)"
DB_NAME="${DB_NAME:-tracy}"
export SITE_DIR DB_PASSWORD DB_NAME

# ── 1. net #1, network layer ────────────────────────────────────────────────────────────
# live  = take the site out of the chain (may send mail).  draft = put it back.
# Read the subnet from docker rather than guess: compose names the network after the project, but
# it allocates the IP range itself and that changes between rebuilds.
SITE_NET="$(docker network inspect "${LABEL}_default" \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
if [ -z "$SITE_NET" ]; then
  echo "!! could not read the subnet of ${LABEL}_default — cannot flip the mail net" >&2
  exit 1
fi
# 🔒 "IS THE RULE THERE" IS READ FROM THE CHAIN'S OWN LISTING, NEVER FROM `iptables -C`. `-C` exits
# non-zero for "no such rule" AND for "could not look" (no permission, a table that will not load, a
# missing chain), so a loop on it took a firewall it could not read for a site already open: it
# printed OPEN and went on, and the site was announced live unable to send mail. The listing either
# succeeds — and the rule is in it or is not — or the script ends here.
MAIL_RULE="-A DOCKER-USER -s $SITE_NET -j TRACY-FLEET-EGRESS"
mail_rule_present() {
  local listed
  listed="$(iptables -S DOCKER-USER)" || {
    echo "!! could not read the firewall chain DOCKER-USER — the mail rule for $SITE_NET is unknown" >&2
    exit 1
  }
  # A here-string, not a pipe: under `pipefail` a writer cut short by `grep -q` would read as "absent".
  grep -qxF -- "$MAIL_RULE" <<<"$listed"
}
if [ "$OP" = live ]; then
  # A rule that cannot be deleted ends the script: `|| break` here used to leave the loop, print
  # "OPEN" and go on, with the site still unable to send a single message.
  while mail_rule_present; do
    iptables -D DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS || {
      echo "!! could not remove the mail egress rule for $SITE_NET — the site cannot send mail" >&2
      exit 1
    }
  done
  # The listing is compared as text, and a listing that spells the rule another way (another
  # iptables, a normalised subnet) would read as "absent" for ever. So the firewall is asked for the
  # rule itself as well, and the door is called open only on its own "no such rule": `-C` exits 0
  # when the rule IS there and 1 when it is not (the chain was just listed, so it exists). Any other
  # exit — the xtables lock held, no permission — is a check that did not happen, never "absent".
  MAIL_CHECK=0
  iptables -C DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS 2>/dev/null || MAIL_CHECK=$?
  case "$MAIL_CHECK" in
    1) ;;
    0)
      echo "!! the firewall still has the mail egress rule for $SITE_NET, though its listing does not show it as written — the site cannot send mail" >&2
      exit 1
      ;;
    *)
      echo "!! could not check the mail egress rule for $SITE_NET (iptables -C exit $MAIL_CHECK) — whether the site can send mail is unknown" >&2
      exit 1
      ;;
  esac
  echo "==> mail egress: OPEN ($SITE_NET)"
else
  if ! mail_rule_present; then
    iptables -I DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS || {
      echo "!! could not put the mail egress rule back for $SITE_NET — the site can still send mail" >&2
      exit 1
    }
    # Read back: an insert that reported success and left no such rule is not a closed door.
    mail_rule_present || {
      echo "!! the mail egress rule for $SITE_NET is not in the chain after adding it" >&2
      exit 1
    }
  fi
  echo "==> mail egress: BLOCKED ($SITE_NET)"
fi
# Saved, or the next reboot brings back the rule set from before this flip. A host without the
# tool keeps no saved rule set at all, and there is nothing to bring back.
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 || {
    echo "!! could not save the firewall rules — a reboot would undo this change to mail" >&2
    exit 1
  }
fi

# ── 2. net #1, application layer ────────────────────────────────────────────────────────
# For a platform that declares no hook, the network layer above is the whole switch.
if [ -f "$HERE/platform/$PLATFORM.sh" ]; then
  # 🔒 `web-image.sh` FIRST, BECAUSE THE PLATFORM FILE CALLS INTO IT AT SOURCE TIME.
  # `platform/wordpress.sh` line 11 is `WEB_IMAGE="$(tracy_web_image wordpress …)"` — a call that
  # runs the moment the file is sourced, not when some function is later invoked. `provision.sh`
  # sources this lib before the platform file for exactly that reason; this script did not, and
  # nothing noticed until 11/09, the first time `--op live` ran on the new stack:
  #
  #   platform/wordpress.sh: line 11: tracy_web_image: command not found   (exit 127)
  #
  # And it failed AFTER the mail egress rule was already opened, so the site was left half
  # flipped — network open, app hook never set, ingress never written.
  # shellcheck source=../lib/web-image.sh
  . "$HERE/../lib/web-image.sh"
  # shellcheck source=/dev/null
  . "$HERE/platform/$PLATFORM.sh"
fi
if declare -F platform_set_mail >/dev/null 2>&1; then
  # if/else, not `a && b || c`: with the short form a FAILED `on` fell through to `off`, turning a
  # go-live whose mail restore failed into a draft mailer (and a remembered value overwritten).
  if [ "$OP" = live ]; then platform_set_mail on; else platform_set_mail off; fi
else
  echo "==> $PLATFORM has no mail switch of its own — the network is the whole switch"
fi

# ── 3. net #2: allow or disallow indexing ───────────────────────────────────────────────
# 🔒 The DirectorySlash patch lives in the same file and must NOT be lost — that is why this file is
# generated by `lib/site-apache-conf.sh` rather than `cat`-ed by this script.
if [ -f "$SITE_DIR/apache/tracy-noindex.conf" ]; then
  # if/else, not `a && b || c`: with the short form a FAILED write of `off` fell through to writing
  # `on` — a go-live that put noindex back and carried on. Either write failing ends the script.
  if [ "$OP" = live ]; then
    tracy_write_apache_conf "$SITE_DIR" off || { echo "!! could not write the noindex conf" >&2; exit 1; }
  else
    tracy_write_apache_conf "$SITE_DIR" on || { echo "!! could not write the noindex conf" >&2; exit 1; }
  fi
  # Apache reads its conf at startup, so changing the bind mount's content alone is not enough.
  # Neither a reload nor a restart: Apache still serves the OLD conf, so the line below would be a
  # lie about what search engines are told. The script ends here instead.
  ( cd "$SITE_DIR" && docker compose exec -T web apache2ctl -k graceful ) 2>/dev/null ||
    ( cd "$SITE_DIR" && docker compose restart web >/dev/null 2>&1 ) || {
      echo "!! could not reload Apache — run \`docker compose restart web\` in $SITE_DIR" >&2
      exit 1
    }
  if [ "$OP" = live ]; then echo "==> noindex: off (search engines may index the site)"; else echo "==> noindex: on"; fi
else
  echo "==> this site mounts no tracy-noindex.conf (fleet-born) — publish_state decides what search engines see"
fi
fi  # steps 1–3: live | draft only

# ── 4. the customer's domain into the tunnel ────────────────────────────────────────────
# Added, NOT replaced: `<label>.tracy.ai` stays after go-live. It is how the agent and the owner edit
# the site, and dropping it drops the webroot workbench right when the site starts having real users.
#
# 🔒 AND THE WAY BACK MUST REMEMBER THE DOMAINS ITSELF, NOT WAIT FOR THE CALLER TO REMEMBER THEM.
# Until 11/09 this step ran only with `--domain`, so a `--op draft` without the list closed mail and
# turned noindex back on but LEFT the ingress rules in place. Measured on the dev machine, right
# after flipping back to draft:
#
#   tracydemo.tracy.site   -> 403   (Tracy address: covered again, correct)
#   golive-test.tracy.site -> 200   (customer's domain: still serving the whole world)
#
# The ingress rule pointed STRAIGHT at the site's port, i.e. it went around tracy-web — the very
# place that keeps the door private. So two nets were put back, while the third, the ADDRESS, stayed
# open. This file's own docstring calls draft "a way back cheap enough that people dare to flip"; a
# way back that leaves the site public at its domain is not a way back.
#
# 🔒 SINCE #1037 A CUSTOMER'S OWN DOMAIN LEADS TO TRACY-WEB, NOT TO THE SITE'S PORT. The rule above
# was the hole itself, not only on the way back to draft: the site trusts `x-tracy-email` /
# `x-tracy-tier` because tracy-web strips what a client sends and sets its own — and a rule straight
# to the site's port carried a client's forged headers to it untouched (a CMS back-office session
# for anyone who asked). So `live` now writes `domain → $OWN_DOMAIN_SERVICE` (tracy-web's local
# address on this host), with this site's label and the run's generation on record beside the rule
# (`ingress_api.py --service --owner --owner-gen`), and replaces this site's own old rule when it
# finds one (`--takeover-port`: that is how a site connected the old way is brought over, by being
# published again). A removal takes out either kind, and only this site's.
#
# So a `live` run RECORDS the domains it just added, and a `draft` run without a list READS that
# record. Only what this script added for this very site can be removed — no one else's rules.
# Both write a file beside the record and move it over, so a write cut short never leaves half a
# record — and half a name is still a name to whoever reads it next. Neither goes by the name alone:
# the record is opened again without following a link and judged by what was opened, and the file
# beside it is made new (lib/site-lifecycle.sh).
ledger_add() { tracy_golive_ledger_add "$GOLIVE_DOMAINS_FILE" "$1"; }
ledger_drop() { tracy_golive_ledger_drop "$GOLIVE_DOMAINS_FILE" "$1"; }

# 🔒 A DRAFT TAKES OUT THE NAMES IT IS GIVEN AND THE ONES ON RECORD, BOTH. The caller names the
# domains it knows are connected; the record holds what this script added. Either list alone can be
# short — a record lost with a restore, a caller that forgot — and a name missed here goes on
# serving the site to the world past every gate.
if [ "$OP" = draft ] && [ -n "$GOLIVE_LEDGER" ]; then
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    seen=0
    for have in ${DOMAINS[@]+"${DOMAINS[@]}"}; do [ "$have" = "$d" ] && seen=1; done
    [ "$seen" -eq 1 ] || DOMAINS+=("$d")
  done <<LEDGER
$GOLIVE_LEDGER
LEDGER
fi

# Read here as well: `drop-domain` skips the steps above, and whose rule a name is, is read off this port.
# 🔒 THE PORT IS READ FROM WHAT WAS OPENED, NEVER THROUGH A LINK. It says whose rule a name is: read
# through a link to another site's `.env`, this script would take THAT site's rule out, or add a
# customer's domain in front of it.
HOST_PORT="$(tracy_site_env "$SITE_DIR/.env" HOST_PORT || true)"
# Where tracy-web listens on this host, as cloudflared reaches it: the service a customer's own
# domain is sent to. Named outright (`TRACY_OWN_DOMAIN_SERVICE`), or tracy-web's own loopback
# origin, which every host that runs tracy-host beside tracy-web already has (`TRACY_WEB_ORIGIN`,
# `deploy/compose.yml`). A public origin is not a local service and is never used as one.
OWN_DOMAIN_SERVICE="${TRACY_OWN_DOMAIN_SERVICE:-}"
if [ -z "$OWN_DOMAIN_SERVICE" ]; then
  case "${TRACY_WEB_ORIGIN:-}" in
    http://127.0.0.1:*|http://localhost:*) OWN_DOMAIN_SERVICE="${TRACY_WEB_ORIGIN%/}" ;;
  esac
fi
if [ -n "$OWN_DOMAIN_SERVICE" ] && ! [[ "$OWN_DOMAIN_SERVICE" =~ ^http://[A-Za-z0-9.-]+:[0-9]{1,5}$ ]]; then
  echo "!! the own-domain service '$OWN_DOMAIN_SERVICE' is not http://host:port — refusing to use it" >&2
  exit 1
fi
DOMAINS_LEFT=0
LEDGER_LEFT=0
if [ "${#DOMAINS[@]}" -gt 0 ]; then
  [ -n "$HOST_PORT" ] || { echo "!! could not read HOST_PORT — cannot add ingress" >&2; exit 1; }
  for d in "${DOMAINS[@]}"; do
    if [ "$OP" = live ]; then
      # A shard host (TRACY_TUNNEL=catch-all, tracy-host says so): its tunnel already sends every
      # name to nginx and tracy-web, so the domain is routed the moment its DNS points here. It is
      # recorded like any other (a later draft or teardown reads the record) and no rule is written.
      if [ "${TRACY_TUNNEL:-}" = catch-all ]; then
        if ! ledger_add "$d"; then
          echo "!! could not record $d in $GOLIVE_DOMAINS_FILE — not announced as routed" >&2
          continue
        fi
        echo "==> ingress: $d → tracy-web (catch-all tunnel, no rule written)"
        continue
      fi
      # No service to send the name to: nothing is added and nothing recorded. Never the old rule
      # instead — a domain that is not connected is the safe one of the two.
      if [ -z "$OWN_DOMAIN_SERVICE" ]; then
        echo "!! this host does not say where tracy-web listens (TRACY_OWN_DOMAIN_SERVICE) — $d not added to the ingress" >&2
        continue
      fi
      # On record BEFORE the rule exists: a rule this script added and did not write down is one no
      # later draft would know to take out.
      if ! ledger_add "$d"; then
        echo "!! could not record $d in $GOLIVE_DOMAINS_FILE — not added to the ingress" >&2
        continue
      fi
      # 🔒 THE WORD `tracy-web` IS WHAT THE CALLER READS (`publish-store.js` `routedLine`): only this
      # line says the name's route is installed, and it is printed only on exit 0 — the rule read
      # back from the tunnel AND its owner record written.
      if python3 "$HERE/ingress_api.py" --hostname "$d" --service "$OWN_DOMAIN_SERVICE" \
          --owner "$LABEL" --owner-gen "${ROUTE_GEN:-0}" --takeover-port "$HOST_PORT"; then
        echo "==> ingress: $d → tracy-web $OWN_DOMAIN_SERVICE"
      else
        echo "!! could not add $d to the ingress" >&2
      fi
    else
      # 🔒 ONLY THIS SITE'S RULE. The name may have moved to another site since this one recorded
      # it. A rule from before #1037 is this site's by its port (`--only-port`); a rule to tracy-web
      # is this site's by its owner record — this label, and no newer generation than this run's
      # (`--owner`, `--owner-gen`). Anything else is left standing (exit 3).
      rc=0
      # A catch-all tunnel holds no rule of this domain: only the record is taken out below.
      if [ "${TRACY_TUNNEL:-}" != catch-all ]; then
        REMOVE_ARGS=(--hostname "$d" --remove --only-port "$HOST_PORT" --owner "$LABEL")
        [ -z "$ROUTE_GEN" ] || REMOVE_ARGS+=(--owner-gen "$ROUTE_GEN")
        [ -z "$OWN_DOMAIN_SERVICE" ] || REMOVE_ARGS+=(--service "$OWN_DOMAIN_SERVICE")
        python3 "$HERE/ingress_api.py" "${REMOVE_ARGS[@]}" || rc=$?
      fi
      case "$rc" in
        0|3) ;;
        *) echo "!! could not remove $d from the ingress — it may still open the site" >&2
           DOMAINS_LEFT=$((DOMAINS_LEFT + 1))
           continue ;;
      esac
      # 🔒 A DOMAIN IS SAID TO BE OUT ONLY WHEN BOTH HALVES ARE: THE RULE AND THE RECORD. The caller
      # reads the two `==> ingress:` lines below per domain and forgets a domain on them — so with
      # the rule gone and the record still naming it, neither is printed: the name stays the
      # caller's to ask about again, and the script ends non-zero below. Printed first, a record
      # that could not be written left a name on this host that nobody would ever retry.
      if ! ledger_drop "$d"; then
        echo "!! could not take $d out of $GOLIVE_DOMAINS_FILE (its rule is out of the ingress, the record is not)" >&2
        LEDGER_LEFT=$((LEDGER_LEFT + 1))
        continue
      fi
      if [ "$rc" -eq 0 ]; then
        echo "==> ingress: removed $d"
      else
        echo "==> ingress: $d is not routed to this site"
      fi
    fi
  done
fi
# A domain that may still answer is the one thing a draft exists to prevent: not a success.
if [ "$DOMAINS_LEFT" -gt 0 ]; then
  echo "!! $DOMAINS_LEFT domain(s) could not be removed from the ingress" >&2
  exit 1
fi
if [ "$LEDGER_LEFT" -gt 0 ]; then
  echo "!! $LEDGER_LEFT domain(s) are still in $GOLIVE_DOMAINS_FILE — run this again once the file can be written" >&2
  exit 1
fi

echo
echo "TRACY_RESULT go_live=$OP label=$LABEL platform=${PLATFORM:-none}"
if [ "$OP" = live ]; then
  cat <<'NEXT'
==> two steps remain outside this host:
    - DNS: the customer points the domain at Tracy (the record the site's Publish tab shows)
    - tracy-web raises the site's `published` flag on this line, then asks each domain over HTTPS
      and calls it connected only on the domain's own answer
NEXT
fi
