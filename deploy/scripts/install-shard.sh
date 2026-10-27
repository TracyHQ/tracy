#!/usr/bin/env bash
#
# install-shard - turn a blank Ubuntu 24.04 or 26.04 VM into shard <name> of Tracy (spec section 6).
#
#   install-shard.sh --inputs /root/shard-s1.env [--phase beta|g1] [--from-image | --from-dir <path>] [--dry-run] [--force [--rotate-webhook-secret]] [--skip-web-images]
#   TRACY_SHARD_NAME=s1 TRACY_MASTER_ORIGIN=https://cowork.tracy.ai ... install-shard.sh
#
# NOT RUN ON A REAL VM YET: the first real run is d1 (DigitalOcean, dev master cowork.tracy.site,
# --phase g1), approved by the SRE owner beforehand, its log kept in docs/sre.
#
# Every input is a variable (the environment, or KEY=value lines of a 0600 --inputs file; the
# environment wins), nothing is typed on the box, a re-run is safe. It brings the shard up but does
# NOT open it to customers: that is `accepting` on the master (/ops > Shards > Add).
#
# ## Two files
# This file keeps the inputs, their validation, the preflight, the helpers and main(). The steps
# themselves (1-17) live in install-shard-steps.sh beside it, which this file `source`s: the
# repository keeps every code file under 800 lines and the shard interface contract (section 10)
# names the split. They travel together, flat in /opt/tracy-fleet/stack.
#
# ## Order: spec section 6 as the code forces it (docs/sre/2026-10-15-shard-beta-implementation-w3-w4-scripts.md)
#    0  preflight (Ubuntu 24.04 or 26.04, x86_64, RAM, a blank VM, which firewall tool is present)
#    1  docker (bootstrap.sh's own apt lines), daemon.json pools, jq openssl age rclone chrony
#    2  this shard's secrets: /etc/tracy/shard-secrets.env, generated once, reused on every re-run
#    3  registry login (ghcr or ecr, REGISTRY_AUTH); the fleet files from the tracy-host image (W5 P4), from a directory rsynced off a
#       worktree (--from-dir, G1 before any image carries them), or from a checkout (REPO_TOKEN)
#    4  bootstrap.sh (node, git, python3, egress chain, iptables-persistent)
#    5  sysctl: the reserved port ranges
#    6  inbound firewall: chain TRACY-INPUT, or the provider's (FIREWALL_MODE=cloud)
#    7  chrony
#    8  /etc/tracy/host-dsh.env, then host-dsh-init.sh --actor-secret-file --tracy-origin --seat-secret-out (W5 P1)
#    9  MCP_SEAT_SECRET from the --seat-secret-out file; /etc/tracy/tracy-web.env; shard-env-check.sh
#    10 deploy-host-dsh.sh --tag, then deploy-tracy-stack.sh --tag --services postgres,tracy-web,tracy-host
#    11 seed-admin-seats.mjs inside tracy-web: AFTER the stack, because migrations run at boot (server.js:42)
#    12 nginx on 127.0.0.1:80 (compose.shard.yml)
#    13 site web images (web/build.sh)
#    14 cloudflared with this shard's tunnel token
#    15 timers: heartbeat 60 s, updater 5 min, backup daily with its R2 push
#    16 check-server.sh and check-shard.sh --before-registration
#    17 the registration for the master, both ways of docs/sre/hop-dong-cua-shard.md section 8: the
#       /ops > Shards > Add values and the SHARDS / SHARD_<name>_* env block (root-only file; the
#       SHARD secret is not printed)
#
# ## What it never does
#   * print a secret: inputs show as set / not set, every env file in --dry-run shows <set> for a
#     secret key, and host-dsh-init.sh's output passes through a 64-hex mask;
#   * regenerate a secret it generated before, even with --force (a new SESSION_SECRET signs every
#     customer out; a new HOST secret breaks tracy-web -> tracy-host; a new actor secret breaks dsh).
#     The one exception is asked for by name: --force --rotate-webhook-secret mints a new
#     GITHUB_WEBHOOK_SECRET (contract section 9: revoking it is a re-run of the installer);
#   * touch a VM that already serves sites, without --force.
#
# --dry-run prints every command and changes nothing; it runs on a laptop (macOS included). The
# run / run_secret / write_file helpers and the preflight come from docs/sre/scripts/tracy-vm-join.sh.
set -euo pipefail
# Everything this script writes that is not a secret (apt keyrings and sources, /etc/docker, the
# fleet files) must be world-readable: apt verifies signatures as the _apt user. Secret files set
# their own umask 077 below, so a caller's `umask 077` must not leak into the rest (s1, 21/10/2026:
# docker.asc came out 0600 and apt called the Docker repository unsigned).
umask 022

FLEET_DIR=/opt/tracy-fleet
ETC="${TRACY_ETC:-/etc/tracy}"
STATE_DIR=/var/lib/tracy
LOG_DIR=/var/log/tracy
SITES_ROOT=/srv/tracy-sites
PRIVATE_ROOT=/srv/tracy-private
DSH_HOME=/srv/tracy/host-dsh/home
# Derived from REGISTRY_AUTH and TRACY_IMAGE_PREFIX by apply_defaults: <prefix>/tracy-{web,host,dsh}.
REGISTRY=ghcr.io
WEB_IMAGE_REPO=ghcr.io/tracyhq/tracy-web
HOST_IMAGE_REPO=ghcr.io/tracyhq/tracy-host
DSH_IMAGE_REPO=ghcr.io/tracyhq/tracy-dsh
# The image that turns an ECR pull key into a docker login token (REGISTRY_AUTH=ecr), pinned.
AWS_CLI_IMAGE="${TRACY_AWS_CLI_IMAGE:-public.ecr.aws/aws-cli/aws-cli:2.17.0}"
ECR_REGISTRY_RE='^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$'
# The two docker address pools of daemon.json (step 1): every compose network of this VM but
# `tracy` gets its /24 from here, so it is also what the firewall lets reach tracy-host (step 6).
DOCKER_POOLS_CIDR=10.200.0.0/15
TAG_RE='^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'

INPUT_KEYS="TRACY_SHARD_NAME TRACY_MASTER_ORIGIN TRACY_SITE_DOMAIN TRACY_APP_TAG TRACY_DSH_TAG REGISTRY_AUTH TRACY_IMAGE_PREFIX GHCR_USER GHCR_TOKEN ECR_REGISTRY AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY CF_TUNNEL_TOKEN CF_TUNNEL_ID MODEL_API_KEY OPENROUTER_API_KEY RESEND_KEY MAIL_FROM DOCS_ORIGIN R2_ENDPOINT R2_ARTIFACT_BUCKET R2_ARTIFACT_ACCESS_KEY R2_ARTIFACT_SECRET_KEY R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY R2_BACKUP_SECRET_KEY BACKUP_AGE_RECIPIENT OPERATOR_EMAILS TRACY_RELEASES_GITHUB_TOKEN GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY_FILE GITHUB_ORG SITE_MAIL SITE_MAIL_DOMAIN SITE_MAIL_GLOBAL_DAILY BACKUP_EXPORT TRACY_COMMENT_PICKER TRACY_ENVIRONMENT TRACY_NETWORK_PREFIX SSH_ALLOW_FROM FIREWALL_MODE REPO_TOKEN REPO_REF TRACY_SOURCE_REPO SHARD_PROVIDER SHARD_REGION"
# Contract section 9: this shard's own GitHub App (three inputs, written once) and the bastion's
# CIDR are required; GITHUB_WEBHOOK_SECRET is generated (step 2), never an input. The registry
# credential (REGISTRY_KEYS_<auth>) is required too, and takes its place after TRACY_DSH_TAG.
REGISTRY_KEYS_ghcr="GHCR_USER GHCR_TOKEN"
REGISTRY_KEYS_ecr="ECR_REGISTRY TRACY_IMAGE_PREFIX AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY"
REQUIRED_KEYS="TRACY_SHARD_NAME TRACY_MASTER_ORIGIN TRACY_SITE_DOMAIN TRACY_APP_TAG TRACY_DSH_TAG CF_TUNNEL_TOKEN CF_TUNNEL_ID MODEL_API_KEY RESEND_KEY MAIL_FROM R2_ENDPOINT R2_ARTIFACT_BUCKET R2_ARTIFACT_ACCESS_KEY R2_ARTIFACT_SECRET_KEY R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY R2_BACKUP_SECRET_KEY BACKUP_AGE_RECIPIENT OPERATOR_EMAILS TRACY_RELEASES_GITHUB_TOKEN GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY_FILE GITHUB_ORG SSH_ALLOW_FROM"

INPUTS_FILE=""; PHASE=beta; DRY_RUN=0; FORCE=0; ROTATE_WEBHOOK=0; SKIP_WEB_IMAGES=0; FROM_DIR=""
LOGGED_IN=0; WORK=""; CHECKS_FAILED=0
NAME=""; ZONE=""; MASTER=""; FQDN=""; ORIGIN=""; NET_PREFIX=""; SOURCE=image; ACTOR_FILE=""
# Every input exists as a variable from here on, empty when not given (set -u).
for key in $INPUT_KEYS; do printf -v "$key" '%s' "${!key:-}"; done

say()  { printf '==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }
die()  { warn "$1"; exit "${2:-1}"; }
shown() { if [ -n "${1:-}" ]; then echo set; else echo "not set"; fi; }
run() { if [ "$DRY_RUN" = 1 ]; then printf '    $ %s\n' "$*"; else "$@"; fi; }
run_sh() { if [ "$DRY_RUN" = 1 ]; then printf '    $ %s\n' "$1"; else bash -c "$1"; fi; }
# A command whose argv carries a secret: --dry-run prints the masked form, a real run runs the real one.
run_secret() { local masked="$1"; shift; if [ "$DRY_RUN" = 1 ]; then printf '    $ %s\n' "$masked"; else "$@"; fi; }
# Every KEY whose name says secret (or whose value embeds one) shows as <set> in a --dry-run listing.
mask_env() { sed -E '/^([A-Za-z0-9_]*(SECRET|TOKEN|PASSWORD|PEPPER|KEK|KEY)|AWS_ACCESS_KEY_ID|DATABASE_URL|MAIL)=./ s/=.*/=<set>/'; }

# write_file <path> <mode> [env]; the content on stdin. Written through a temp file and moved into
# place, so an interrupted run never leaves half a file that names this shard's secrets.
write_file() {
  local path="$1" mode="$2" kind="${3:-}"
  if [ "$DRY_RUN" = 1 ]; then
    printf '    > %s (mode %s)\n' "$path" "$mode"
    if [ "$kind" = env ]; then mask_env; else cat; fi | sed 's/^/      | /'
    return 0
  fi
  mkdir -p "$(dirname "$path")"
  ( umask 077; cat > "$path.tmp.$$" )
  chmod "$mode" "$path.tmp.$$"
  mv -f "$path.tmp.$$" "$path"
}

# write_secret_file <path> <value>: a file holding one bare secret (host-dsh-init.sh reads it whole).
write_secret_file() {
  if [ "$DRY_RUN" = 1 ]; then printf '    > %s (mode 0600) <value set>\n' "$1"; return 0; fi
  mkdir -p "$(dirname "$1")"
  chmod 700 "$(dirname "$1")"
  ( umask 077; printf '%s\n' "$2" > "$1" )
}

cleanup() {
  if [ "$LOGGED_IN" = 1 ]; then docker logout "$REGISTRY" >/dev/null 2>&1 || true; fi
  if [ "$DRY_RUN" = 0 ] && [ -n "$WORK" ]; then rm -rf "$WORK"; fi
}

# The root of a checkout-shaped source (repo paths under it), or nothing when the files come from
# the image: $WORK/tch for a sparse checkout (REPO_TOKEN), the --from-dir directory for `dir`.
source_root() {
  case "$SOURCE" in git) printf '%s' "$WORK/tch" ;; dir) printf '%s' "$FROM_DIR" ;; esac
}

usage() {
  sed -n '3,6p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'USAGE'

Inputs (environment, or KEY=value lines of the --inputs file; the environment wins):
  required  TRACY_SHARD_NAME (s1, d1: [a-z][a-z0-9]{0,15})  TRACY_MASTER_ORIGIN (https://cowork.tracy.ai)
            TRACY_SITE_DOMAIN (tracy.ai)                  TRACY_APP_TAG, TRACY_DSH_TAG (what the master runs)
            the registry this shard pulls from, by REGISTRY_AUTH (default ghcr):
              ghcr: GHCR_USER, GHCR_TOKEN (read:packages, this shard's own)
              ecr:  ECR_REGISTRY (<account>.dkr.ecr.<region>.amazonaws.com), AWS_REGION,
                    TRACY_IMAGE_PREFIX (<ECR_REGISTRY>/lab3-image/tracy-ai),
                    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (the pull-only IAM user)
            CF_TUNNEL_TOKEN, CF_TUNNEL_ID (this shard's own tunnel)
            MODEL_API_KEY (dsh's model key)               RESEND_KEY (this shard's own), MAIL_FROM
            R2_ENDPOINT, R2_ARTIFACT_BUCKET/_ACCESS_KEY/_SECRET_KEY, R2_BACKUP_BUCKET/_ACCESS_KEY/_SECRET_KEY
            BACKUP_AGE_RECIPIENT (age1...; its private half is NOT on this VM)
            OPERATOR_EMAILS (a@x,b@y: their tracy_admin seats)   TRACY_RELEASES_GITHUB_TOKEN
            GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_FILE (path to the PEM), GITHUB_ORG=tracy-sites-<name>
              (this shard's own App in its own org; written once, here; the webhook secret is generated)
            SSH_ALLOW_FROM (the bastion's IPv4 address or CIDR; never 0.0.0.0/0)
  optional  DOCS_ORIGIN (default https://docs.<zone>; the real value is confirmed at G0)
            TRACY_NETWORK_PREFIX (default 10.90.0)        FIREWALL_MODE (iptables | cloud)
            SITE_MAIL (off | log | smtp) + SITE_MAIL_DOMAIN + SITE_MAIL_GLOBAL_DAILY (the master's total / 7)
            OPENROUTER_API_KEY  BACKUP_EXPORT  TRACY_COMMENT_PICKER  TRACY_ENVIRONMENT (prod | dev)
            REPO_TOKEN + REPO_REF (install from a checkout until W5 P4)
            TRACY_SOURCE_REPO (the repository that checkout clones: TracyHQ/tch, default, or TracyHQ/tracy)
            SHARD_PROVIDER (aws | digitalocean | vultr ...)  SHARD_REGION (asia | america | europe | unknown)
Options
  --inputs <file>    KEY=value lines, mode 0600; delete it after the run
  --phase beta|g1    g1: d1 before W2 exists - no SESSION_DOMAIN, site labels prefixed <name>t-, and
                     no staff seats when seed-admin-seats.mjs is in neither the image nor the source
  --from-image       the fleet files come from the tracy-host image of TRACY_APP_TAG (the default)
  --from-dir <path>  the fleet files come from a checkout-shaped directory ON THIS VM (absolute path),
                     rsynced off a worktree: deploy/, packages/fleet/tracy-fleet-operation/{dsh,scripts,web}/,
                     apps/tracy-web/scripts/. For G1, before any image carries the shard files.
  --dry-run          print everything, change nothing (works on a laptop)
  --force            rewrite the env files and reinstall cloudflared; never regenerates a secret
  --rotate-webhook-secret  with --force: mint a new GITHUB_WEBHOOK_SECRET (the one secret it rotates)
  --skip-web-images  leave the site web images to tracy-updater.sh
USAGE
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --inputs) INPUTS_FILE="${2:?--inputs needs a path}"; shift ;;
      --phase) PHASE="${2:?--phase needs beta or g1}"; shift ;;
      --from-image) FROM_DIR="" ;;
      --from-dir) FROM_DIR="${2:?--from-dir needs an absolute path}"; shift ;;
      --dry-run) DRY_RUN=1 ;;
      --force) FORCE=1 ;;
      --rotate-webhook-secret) ROTATE_WEBHOOK=1 ;;
      --skip-web-images) SKIP_WEB_IMAGES=1 ;;
      -h|--help) usage; exit 0 ;;
      *) usage >&2; die "unknown argument: $1" 2 ;;
    esac
    shift
  done
  case "$PHASE" in beta|g1) ;; *) die "--phase is beta or g1 (got '$PHASE')" 2 ;; esac
  # Without --force tracy-web.env is kept, and a new secret in shard-secrets.env would reach nothing.
  [ "$ROTATE_WEBHOOK" = 0 ] || [ "$FORCE" = 1 ] || die "--rotate-webhook-secret needs --force (tracy-web.env is rewritten with it)" 2
  [ -z "${TRACY_ETC:-}" ] || [ "$DRY_RUN" = 1 ] || die "TRACY_ETC is for --dry-run tests only" 2
}

# KEY=value lines; a key not in INPUT_KEYS is refused (a typo would otherwise be a silent default),
# and a value is never echoed back, only its line number.
load_inputs() {
  local line key value n=0
  [ -n "$INPUTS_FILE" ] || return 0
  [ -r "$INPUTS_FILE" ] || die "cannot read --inputs $INPUTS_FILE" 2
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    case "$line" in ''|'#'*) continue ;; esac
    [[ "$line" =~ ^([A-Z0-9_]+)=(.*)$ ]] || die "--inputs line $n is not KEY=value" 2
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    case " $INPUT_KEYS " in *" $key "*) ;; *) die "--inputs line $n: unknown key $key" 2 ;; esac
    case "$value" in \"*\") value="${value#\"}"; value="${value%\"}" ;; \'*\') value="${value#\'}"; value="${value%\'}" ;; esac
    [ -n "${!key}" ] || printf -v "$key" '%s' "$value"
  done < "$INPUTS_FILE"
}

apply_defaults() {
  NAME="$TRACY_SHARD_NAME"
  ZONE="$TRACY_SITE_DOMAIN"
  MASTER="${TRACY_MASTER_ORIGIN%/}"
  FQDN="$NAME.$ZONE"
  ORIGIN="https://$FQDN"
  # UNVERIFIED default: the master's real docs origin is confirmed at G0 on a real host (contract section 9).
  DOCS_ORIGIN="${DOCS_ORIGIN:-https://docs.$ZONE}"
  NET_PREFIX="${TRACY_NETWORK_PREFIX:-10.90.0}"
  # No default for SSH_ALLOW_FROM: a required input (contract section 9), never 0.0.0.0/0.
  FIREWALL_MODE="${FIREWALL_MODE:-iptables}"
  SITE_MAIL="${SITE_MAIL:-off}"
  SHARD_PROVIDER="${SHARD_PROVIDER:-unknown}"
  SHARD_REGION="${SHARD_REGION:-unknown}"
  if [ -z "$TRACY_ENVIRONMENT" ]; then
    if [ "$ZONE" = tracy.ai ]; then TRACY_ENVIRONMENT=prod; else TRACY_ENVIRONMENT=dev; fi
  fi
  REGISTRY_AUTH="${REGISTRY_AUTH:-ghcr}"
  if [ "$REGISTRY_AUTH" = ghcr ]; then TRACY_IMAGE_PREFIX="${TRACY_IMAGE_PREFIX:-ghcr.io/tracyhq}"; fi
  TRACY_IMAGE_PREFIX="${TRACY_IMAGE_PREFIX%/}"
  REGISTRY="${TRACY_IMAGE_PREFIX%%/*}"
  WEB_IMAGE_REPO="$TRACY_IMAGE_PREFIX/tracy-web"
  HOST_IMAGE_REPO="$TRACY_IMAGE_PREFIX/tracy-host"
  DSH_IMAGE_REPO="$TRACY_IMAGE_PREFIX/tracy-dsh"
  if [ -n "$FROM_DIR" ]; then SOURCE=dir; elif [ -n "$REPO_TOKEN" ]; then SOURCE=git; else SOURCE=image; fi
  TRACY_SOURCE_REPO="${TRACY_SOURCE_REPO:-TracyHQ/tch}"
  ACTOR_FILE="$ETC/secrets/mcp-actor-secret"
}

validate_inputs() {
  local key missing="" email required registry_keys
  case "$REGISTRY_AUTH" in
    ghcr) registry_keys="$REGISTRY_KEYS_ghcr" ;;
    ecr) registry_keys="$REGISTRY_KEYS_ecr" ;;
    *) die "REGISTRY_AUTH is ghcr or ecr" 2 ;;
  esac
  required="${REQUIRED_KEYS/TRACY_DSH_TAG /TRACY_DSH_TAG $registry_keys }"
  for key in $required; do [ -n "${!key}" ] || missing="$missing $key"; done
  [ -z "$missing" ] || die "missing inputs:$missing (names only; values are never printed - see --help)" 2
  if [ "$REGISTRY_AUTH" = ecr ]; then
    printf '%s' "$ECR_REGISTRY" | grep -E "$ECR_REGISTRY_RE" >/dev/null \
      || die "ECR_REGISTRY must be <account>.dkr.ecr.<region>.amazonaws.com" 2
    case "$TRACY_IMAGE_PREFIX" in "$ECR_REGISTRY"/?*) ;; *) die "TRACY_IMAGE_PREFIX must start with ECR_REGISTRY/" 2 ;; esac
    printf '%s' "$AWS_REGION" | grep -E '^[a-z]{2}(-[a-z]+)+-[0-9]$' >/dev/null || die "AWS_REGION is a region name such as us-east-1" 2
  fi
  # The one shard-name pattern of docs/sre/hop-dong-cua-shard.md section 1 (SHARD_NAME of shard-shapes.js).
  printf '%s' "$NAME" | grep -E '^[a-z][a-z0-9]{0,15}$' >/dev/null \
    || die "TRACY_SHARD_NAME must match ^[a-z][a-z0-9]{0,15}\$ (contract section 1): one DNS label (spec 3.5) and HOST_<name>_* at once, so no '_' and no '-'" 2
  printf '%s' "$ZONE" | grep -E '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' >/dev/null \
    || die "TRACY_SITE_DOMAIN must be a bare domain such as tracy.ai" 2
  case "$MASTER" in https://*) ;; *) die "TRACY_MASTER_ORIGIN must start with https://" 2 ;; esac
  # The same two homes apps/tracy-web/src/lib/source-repository.js accepts: REPO_TOKEN reaches no other.
  case "$TRACY_SOURCE_REPO" in TracyHQ/tch|TracyHQ/tracy) ;; *) die "TRACY_SOURCE_REPO is TracyHQ/tch or TracyHQ/tracy" 2 ;; esac
  case "$DOCS_ORIGIN" in https://*) ;; *) die "DOCS_ORIGIN must start with https://" 2 ;; esac
  case "$R2_ENDPOINT" in https://*) ;; *) die "R2_ENDPOINT must start with https://" 2 ;; esac
  for key in TRACY_APP_TAG TRACY_DSH_TAG; do printf '%s' "${!key}" | grep -E "$TAG_RE" >/dev/null || die "$key is not an image tag" 2; done
  printf '%s' "$CF_TUNNEL_ID" | grep -E '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' >/dev/null \
    || die "CF_TUNNEL_ID must be the tunnel's UUID" 2
  printf '%s' "$BACKUP_AGE_RECIPIENT" | grep -E '^age1[02-9ac-hj-np-z]{58}$' >/dev/null \
    || die "BACKUP_AGE_RECIPIENT must be an age public key (age1..., 62 characters)" 2
  printf '%s' "$NET_PREFIX" | grep -E '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' >/dev/null || die "TRACY_NETWORK_PREFIX is three octets, such as 10.90.0" 2
  case "$NET_PREFIX" in 10.200.*|10.201.*) die "TRACY_NETWORK_PREFIX must stay out of the docker pools $DOCKER_POOLS_CIDR" 2 ;; esac
  case "$FIREWALL_MODE" in iptables|cloud) ;; *) die "FIREWALL_MODE is iptables or cloud" 2 ;; esac
  # Contract section 9: required, and never the whole internet (a /0 mask is refused).
  printf '%s' "$SSH_ALLOW_FROM" | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}(/([1-9]|[12][0-9]|3[0-2]))?$' >/dev/null \
    || die "SSH_ALLOW_FROM must be the bastion's IPv4 address or CIDR (a.b.c.d or a.b.c.d/1-32); never 0.0.0.0/0" 2
  case "$SHARD_REGION" in asia|america|europe|unknown) ;; *) die "SHARD_REGION is asia, america, europe or unknown" 2 ;; esac
  printf '%s' "$SHARD_PROVIDER" | grep -E '^[a-z][a-z0-9-]{0,31}$' >/dev/null || die "SHARD_PROVIDER is one lowercase word (aws, digitalocean, vultr)" 2
  case "$SITE_MAIL" in
    off) ;;
    log|smtp)
      [ -n "$SITE_MAIL_DOMAIN" ] || die "SITE_MAIL=$SITE_MAIL needs SITE_MAIL_DOMAIN (config.js:283)" 2
      printf '%s' "$SITE_MAIL_GLOBAL_DAILY" | grep -E '^[0-9]+$' >/dev/null \
        || die "SITE_MAIL=$SITE_MAIL needs SITE_MAIL_GLOBAL_DAILY: the master's daily total / 7 (spec 6)" 2 ;;
    *) die "SITE_MAIL is off, log or smtp" 2 ;;
  esac
  for email in $(printf '%s' "$OPERATOR_EMAILS" | tr ',' ' '); do
    printf '%s' "$email" | grep -E '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' >/dev/null || die "OPERATOR_EMAILS: not an email address: $email" 2
  done
  # This shard's own GitHub App in its own org (spec 6.1, contract section 9): the three inputs are
  # required (REQUIRED_KEYS) and written to tracy-web.env once, by step 9 and nowhere else.
  printf '%s' "$GITHUB_APP_ID" | grep -E '^[0-9]+$' >/dev/null || die "GITHUB_APP_ID is the App's number" 2
  [ "$GITHUB_ORG" = "tracy-sites-$NAME" ] \
    || die "GITHUB_ORG must be tracy-sites-$NAME: this shard's App lives in an org of its own, never TracyHQ (spec 6.1)" 2
  [ "$DRY_RUN" = 1 ] || [ -r "$GITHUB_APP_PRIVATE_KEY_FILE" ] || die "cannot read GITHUB_APP_PRIVATE_KEY_FILE" 2
  # --from-dir (contract section 10): a checkout-shaped directory on this VM, checked here so a
  # missing rsync stops the run before step 1 touches the box. The one file every source must have
  # is the sync script itself; sync-fleet-files.sh checks the rest before it writes anything.
  if [ -n "$FROM_DIR" ]; then
    [ -z "$REPO_TOKEN" ] || die "--from-dir and REPO_TOKEN are two sources: pass one" 2
    case "$FROM_DIR" in /*) ;; *) die "--from-dir needs an absolute path (got '$FROM_DIR')" 2 ;; esac
    [ -d "$FROM_DIR" ] || die "--from-dir $FROM_DIR is not a directory" 2
    [ -f "$FROM_DIR/deploy/scripts/sync-fleet-files.sh" ] \
      || die "--from-dir $FROM_DIR has no deploy/scripts/sync-fleet-files.sh: rsync deploy/ and packages/fleet/tracy-fleet-operation/{dsh,scripts,web}/ off the worktree first (see --help)" 2
  fi
}

# Amendment 7: ufw and iptables-persistent. Reported, then chosen out loud (step 6 acts on it).
firewall_preflight() {
  local ufw_state=absent ipp=absent conflicts=""
  if command -v dpkg >/dev/null 2>&1; then
    if dpkg -s ufw >/dev/null 2>&1; then ufw_state="installed ($(ufw status 2>/dev/null | sed -n 1p || true))"; fi
    if dpkg -s iptables-persistent >/dev/null 2>&1; then ipp=installed; fi
    conflicts="$(apt-cache show iptables-persistent 2>/dev/null | sed -n 's/^Conflicts: *//p' | sed -n 1p || true)"
  fi
  note "firewall: ufw $ufw_state · iptables-persistent $ipp (its Conflicts: ${conflicts:-unknown here}) · mode $FIREWALL_MODE"
  note "  bootstrap.sh installs iptables-persistent (bootstrap.sh:61-64), which conflicts with ufw on Ubuntu"
  note "  (UNVERIFIED on 24.04: the Conflicts above is the check); so step 6 writes a TRACY-INPUT chain"
  note "  that netfilter-persistent saves, or leaves inbound to the provider's firewall (FIREWALL_MODE=cloud)"
}

# The Ubuntu releases the shard runs on: spec 6 names 24.04; 26.04 since 21/10/2026 (the first dev
# shard VM and tracy-dev run it; docker, cloudflared and the step 1 apt packages exist for it).
os_supported() {
  [ "$1" = ubuntu ] || return 1
  case "$2" in 24.04 | 26.04) return 0 ;; *) return 1 ;; esac
}

preflight() {
  local ok=1 mem disk os_id os_version
  say "0. preflight · shard $NAME · origin $ORIGIN · phase $PHASE · source $SOURCE · dry-run $DRY_RUN"
  [ "$(id -u)" = 0 ] || { warn "not root"; ok=0; }
  [ "$(uname -s)" = Linux ] || { warn "not Linux ($(uname -s))"; ok=0; }
  if [ -r /etc/os-release ]; then
    # Read in subshells: sourcing /etc/os-release here would overwrite NAME, the shard's name.
    os_id="$(. /etc/os-release >/dev/null 2>&1 && printf '%s' "${ID:-}")"
    os_version="$(. /etc/os-release >/dev/null 2>&1 && printf '%s' "${VERSION_ID:-}")"
    os_supported "$os_id" "$os_version" || { warn "the shard runs on Ubuntu 24.04 or 26.04; this is ${os_id:-?} ${os_version:-?}"; ok=0; }
  fi
  [ "$(uname -m)" = x86_64 ] || { warn "tracy-dsh is built for x86_64 only; this is $(uname -m)"; ok=0; }
  if [ -r /proc/meminfo ]; then
    mem=$(( $(awk '/^MemTotal:/ {print $2}' /proc/meminfo) / 1024 / 1024 ))
    note "RAM ${mem} GB"
    [ "$mem" -ge 15 ] || { warn "${mem} GB RAM; spec 6 sizes a shard at 32 GB"; ok=0; }
  fi
  disk="$(df -Pk / 2>/dev/null | awk 'NR == 2 {print int($4 / 1024 / 1024)}' || true)"
  note "disk / free: ${disk:-?} GB (spec 6: NVMe >= 200 GB)"
  firewall_preflight
  if [ "$FORCE" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    if ls -d "$PRIVATE_ROOT"/*/ >/dev/null 2>&1; then die "$PRIVATE_ROOT already holds sites: not a blank VM (--force to go on)"; fi
    if docker ps --format '{{.Names}}' 2>/dev/null | grep 'tracy-host' >/dev/null; then die "a tracy-host container already runs here (--force to go on)"; fi
  fi
  if [ "$ok" = 0 ]; then
    if [ "$DRY_RUN" = 1 ]; then note "dry run: going on; what follows describes a run, it is not one"
    else die "preflight failed (see above); --dry-run reads the plan on any machine"; fi
  fi
  note "registry: $REGISTRY_AUTH, images $TRACY_IMAGE_PREFIX/tracy-{web,host,dsh}"
  local registry_secret="GHCR_TOKEN $(shown "$GHCR_TOKEN")"
  [ "$REGISTRY_AUTH" != ecr ] || registry_secret="AWS_SECRET_ACCESS_KEY $(shown "$AWS_SECRET_ACCESS_KEY")"
  note "inputs: $registry_secret, CF_TUNNEL_TOKEN $(shown "$CF_TUNNEL_TOKEN"), MODEL_API_KEY $(shown "$MODEL_API_KEY"), RESEND_KEY $(shown "$RESEND_KEY"), R2 keys $(shown "$R2_ARTIFACT_SECRET_KEY")/$(shown "$R2_BACKUP_SECRET_KEY"), REPO_TOKEN $(shown "$REPO_TOKEN")"
}

# The steps live beside this file (contract section 10; the repository's 800-line rule). Sourced
# after every helper above is defined and before main runs; a missing file is a usage error with the
# cause named, not a bash "No such file" halfway through.
[ -f "$(dirname "$0")/install-shard-steps.sh" ] \
  || die "install-shard-steps.sh is not beside $0: the two files travel together (sync-fleet-files.sh --list, contract section 10)" 2
# shellcheck source=install-shard-steps.sh
source "$(dirname "$0")/install-shard-steps.sh"

main() {
  parse_args "$@"
  load_inputs
  apply_defaults
  validate_inputs
  WORK=/tmp/install-shard.dry-run
  [ "$DRY_RUN" = 1 ] || WORK="$(mktemp -d /tmp/install-shard.XXXXXX)"
  trap cleanup EXIT
  preflight
  step_host_base
  step_secrets
  step_fleet_files
  step_bootstrap
  step_kernel
  step_firewall
  step_time
  step_dsh
  step_web_env
  step_deploys
  step_seed
  step_nginx
  step_web_images
  step_cloudflared
  step_timers
  step_checks
  step_registration
  say "done: shard $NAME at $ORIGIN; it takes no customer until /ops > Shards on the master says so"
  [ "$CHECKS_FAILED" = 0 ] || exit 1
}

main "$@"; exit $?
