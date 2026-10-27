#!/usr/bin/env bash
#
# check-local.sh — turn "it worked on my machine once" into something the next person can
# re-run. Brings the WHOLE local stack up (`deploy/compose.yml`, profile `local`) and proves it,
# rather than trusting that `docker compose config` parsing cleanly means it boots — it does not:
# Task 5's own history has two bugs (an apt-installed docker CLI too old to talk to the daemon,
# and a bucket-creation race) that `config` was blind to and only an actual `up` surfaced.
#
# Every check below either passes silently or names the ONE switch to flip — never just "failed".
# That is the whole point of a script over a runbook paragraph: a person re-running this six
# months from now gets an instruction, not a stack trace to reverse-engineer.
#
# Run from anywhere; it cd's to deploy/ itself (one level up from this file).
#
#   check-local.sh                # every check, then `up -d --build` and the health checks
#   check-local.sh --images-only  # only "can a clean machine pull the local profile's images";
#                                 # runs no container, pulls nothing, needs no deploy/.env
set -euo pipefail

IMAGES_ONLY=0
case "${1:-}" in
  "") : ;;
  --images-only) IMAGES_ONLY=1 ;;
  *) echo "usage: $0 [--images-only]" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

# ── which compose files, and it is NOT a preference ────────────────────────────────────────────
#
# 🔒 ON macOS THE OVERRIDE IS PART OF THE STACK, NOT AN OPTION. `compose.macos.yml` takes
# `tracy-host` off `network_mode: host` (which on Docker Desktop means the LINUX VM's namespace —
# nobody's) and adds the resolver macOS itself needs. Bringing the stack up without it looks like
# it worked: `up -d` returns 0, all services report healthy, and then every site creation answers
# `502 {"code":"FLEET_REFUSED"}`, because each health check only probes its own port. Measured
# twice on 10/09, the second time by an agent that ran plain `docker compose up -d tracy-host`
# and took ten minutes to work out what it had broken.
#
# This script used to run bare `docker compose` while `compose.macos.yml`'s own header claimed
# this script picked the override up automatically. It did not. Now it does.
COMPOSE=(docker compose)
EXTRA_HEALTHY=""
if [ "$(uname -s)" = "Darwin" ]; then
  COMPOSE=(docker compose -f compose.yml -f compose.macos.yml)
  EXTRA_HEALTHY=" dns-host"
  # Plain `docker compose` loads compose.override.yml by itself; naming files with -f turns that off.
  [ -f compose.override.yml ] && COMPOSE+=(-f compose.override.yml)
fi
dc() { "${COMPOSE[@]}" "$@"; }

fail() {
  echo "✗ $1" >&2
  [ -n "${2:-}" ] && echo " switch to turn on: $2" >&2
  exit 1
}
ok() { echo "✓ $1"; }

# ── Check 0: every image of the `local` profile still resolves, anonymously ─────────────────────
#
# 🔒 A PINNED IMAGE CAN VANISH FROM ITS REGISTRY, AND ONLY A CLEAN MACHINE NOTICES. Happened
# twice to MinIO: Docker Hub dropped `minio/*` (#70, 14/09), then quay.io dropped `minio/*` (#349,
# 25/09). Every machine that already had the image cached kept booting, so nobody saw it until a
# fresh `up` died mid-pull on `no such manifest` — and compose cancels the other pulls with it,
# so the error names several images, not the one that is gone.
#
# The list is read from the merged compose config (services whose `profiles:` include `local`),
# never typed here: a second hand-kept list is how the next image would be missed. Services
# without that profile are either built on this machine (`tracy/*:dev`) or shared with servers,
# where a deploy catches them. `--config` points at an empty directory so the answer is the one
# a machine with no `docker login` gets — a cached credential must not make a gone image look
# present. Network-dependent on purpose, so it lives here and never in `scripts/check-all.ts`.
check_images() {
  local envfile=.env
  [ -f "$envfile" ] || envfile=.env.example
  local tmp cfg list svc image out missing="" checked=" " n=0
  tmp="$(mktemp -d)"
  # EXIT, not a trailing rm: every `fail` below exits the script from inside this function.
  trap 'rm -rf "$tmp"' EXIT
  # stderr kept apart: a compose warning on stdout's side would corrupt the JSON jq reads.
  cfg="$("${COMPOSE[@]}" --env-file "$envfile" --profile local config --no-env-resolution --format json 2>"$tmp/err")" \
    || fail "docker compose could not read the local profile's config: $(cat "$tmp/err")" "fix the error it names in deploy/compose.yml, then re-run"
  list="$(printf '%s' "$cfg" | jq -r '.services | to_entries[]
      | select((.value.profiles // []) | index("local")) | "\(.key) \(.value.image // "")"')" \
    || fail "could not list the local profile's services from docker compose config" "check that jq is installed"
  [ -n "$list" ] || fail "the local profile lists no service — nothing to check" \
    "check deploy/compose.yml still carries \`profiles: [local]\` on minio, minio-init and dns"
  mkdir "$tmp/anon"
  while read -r svc image; do
    if [ -z "$image" ]; then
      missing="$missing"$'\n'"  $svc: no image: line"
      continue
    fi
    case "$checked" in *" $image "*) ok "$svc: $image (already checked)"; continue ;; esac
    checked="$checked$image "
    n=$((n + 1))
    if out="$(docker --config "$tmp/anon" manifest inspect "$image" 2>&1 >/dev/null)"; then
      ok "$svc: $image resolves"
    else
      missing="$missing"$'\n'"  $svc: $image → $(printf '%s' "$out" | tr '\n' ' ')"
    fi
  done <<<"$list"
  rm -rf "$tmp"
  trap - EXIT
  [ -z "$missing" ] || fail "a local-profile image cannot be pulled anonymously:$missing" \
    "pin an image that resolves (docker manifest inspect <image> with an empty --config) in deploy/compose.yml — see docs/references/running-tracy-locally.md §9 trap #9"
  ok "all $n local-profile images resolve without docker login"
}

echo "── images ──"
check_images
if [ "$IMAGES_ONLY" = 1 ]; then
  exit 0
fi

# ── .env must exist before anything below can read it ──────────────────────────────────────────
[ -f .env ] || fail ".env is missing" "cp deploy/.env.example deploy/.env, then fill in the blank secrets (openssl rand -hex 32) and the three absolute *_ROOT paths"

# Read one KEY from .env without sourcing the whole file (a value can legitimately contain shell
# metacharacters this script has no business interpreting).
# Read one key out of `.env` the way docker compose reads it, not the way `cut` does.
#
# 🔒 THE TRAILING COMMENT IS PART OF THE LINE, NOT PART OF THE VALUE. Measured 10/09: with
# `TRACY_SITES_ROOT=/Users/x/sites              # server: /srv/tracy-sites`, the bare `cut`
# handed back the path AND the comment, so the failure this script printed read
# `"/Users/x/sites   # server: ..." is not absolute` — a true verdict about a value nobody
# wrote, which sends the reader to fix a path that was already correct. Compose itself strips
# an unquoted value's ` #` comment, so reading it any other way measures a different file than
# the one that will actually boot.
# `|| true` is NOT sloppiness — it is what makes a MISSING key reportable. Measured 10/09:
# `TRACY_DSH_HOME` was absent from `.env`, `grep` exited 1, and under `set -euo pipefail` the
# assignment in `check_root` aborted the whole script BEFORE its own `fail` could print the
# instruction. Four ✓ lines, then silence, and no exit message — a preflight that dies without
# saying why is worse than no preflight, because the reader concludes the checks passed.
env_get() {
  grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' || true
}
# A value as compose resolves it: the shell first, then deploy/.env, then the default.
env_value() {
  local v="${!1:-}"
  [ -n "$v" ] || v="$(env_get "$1")"
  printf '%s' "${v:-$2}"
}
# A second stand on the same Docker (see docs/running-locally.md) has its own project and subnet;
# checking `tracy_tracy` would judge — and advise removing — another stand's network.
TRACY_NET="$(dc config --format json 2>/dev/null | jq -r '.name // empty' || true)"
TRACY_NET="${TRACY_NET:-tracy}_tracy"
NET_PREFIX="$(env_value TRACY_NETWORK_PREFIX 172.30.0)"

echo "── preflight ──"

# ── Check 1: Docker Desktop's "Enable host networking" ─────────────────────────────────────────
#
# `tracy-host` runs `network_mode: host` (go-live's iptables and the loopback ports a site
# publishes both live in the host network namespace — a bridged tracy-host cannot see either).
# Without the macOS setting, a container asked to join the host network gets no real network
# stack instead: a probe to a definitely-closed port answers "Network unreachable" (no route)
# rather than "Connection refused" (a real TCP stack, nothing listening). `wget --timeout` instead
# of wrapping in the external `timeout` command — that binary is coreutils, not on stock macOS.
NET1_OUT="$(docker run --rm --network host alpine wget --timeout=5 -qO- http://127.0.0.1:1 2>&1 || true)"
if echo "$NET1_OUT" | grep -i "connection refused" >/dev/null; then
  ok "host networking (Docker Desktop → Settings → Resources → Network) is enabled"
elif echo "$NET1_OUT" | grep -i "unreachable" >/dev/null; then
  fail "host networking is OFF (got \"$NET1_OUT\", not \"Connection refused\")" \
       "Docker Desktop → Settings → Resources → Network → enable \"Host networking\", then Apply & Restart"
else
  fail "unexpected probe result: $NET1_OUT" "re-run with Docker Desktop running and try again"
fi

# ── Check 2: no stale `tracy_tracy` network from a broken previous run ──────────────────────────
#
# Compose only CREATES a network that does not already exist — it never reconciles one that does
# against a changed definition. If a `tracy_tracy` network is left over from before the fixed
# `172.30.0.0/24` subnet was added to this file (or from a `down` that didn't take `-v`/network
# cleanup with it), `up` will silently REUSE the stale network, the static
# `ipv4_address: 172.30.0.10`/`172.30.0.53` assignments below will fail at container start, and
# the error names an IP, not "your network is stale" — a long way to walk back to this cause.
EXISTING_NET="$(docker network ls --filter "name=^${TRACY_NET}$" --format '{{.ID}}' || true)"
if [ -z "$EXISTING_NET" ]; then
  ok "no stale $TRACY_NET network (first run, or already cleaned up)"
else
  SUBNET="$(docker network inspect "$EXISTING_NET" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
  if [ "$SUBNET" = "$NET_PREFIX.0/24" ]; then
    ok "existing $TRACY_NET network already has the right subnet ($SUBNET)"
  else
    fail "$TRACY_NET network exists with subnet \"$SUBNET\", not $NET_PREFIX.0/24" \
         "${COMPOSE[*]} --profile local down; docker network rm $TRACY_NET (ignore \"not found\"), then re-run this script"
  fi
fi

# ── Check 3: the two host roots are absolute and exist ──────────────────────────────────────────
#
# `tracy-host` and `tracy-dsh` bind these SAME PATHS in on both sides
# (`${TRACY_SITES_ROOT}:${TRACY_SITES_ROOT}`, `${TRACY_SITES_ROOT}:/site`) — a relative value
# resolves fine as the HOST side of the bind but ships a relative container TARGET, which docker
# refuses at container start, not at `compose config` time. `TRACY_DSH_HOME` gets the same check:
# it is not in the brief's literal list of two, but it is bound into `tracy-dsh` the exact same
# way and fails the exact same way if it is relative or missing.
check_root() {
  local name="$1" value
  value="$(env_get "$name")"
  [ -n "$value" ] || fail "$name is empty in .env" "set $name to an absolute path in deploy/.env"
  case "$value" in
    /*) : ;;
    *) fail "$name=\"$value\" is not absolute" "change $name in deploy/.env to an absolute path (e.g. \$HOME/tracy-data/...)" ;;
  esac
  [ -d "$value" ] || fail "$name=\"$value\" does not exist" "mkdir -p \"$value\""
  ok "$name=$value (absolute, exists)"
}
check_root TRACY_SITES_ROOT
check_root TRACY_PRIVATE_ROOT
check_root TRACY_DSH_HOME

# ── Check 4 (not in the brief's three — added after hitting this) : TRACY_DSH_HOME is SEEDED ────
#
# `tracy-dsh`'s bind mount (`${TRACY_DSH_HOME}:/desk-home`) hides the image's own profile the same
# way `host-dsh.yml`'s fleet mount does — `entrypoint.sh` refuses to boot rather than serve an
# empty client graph, but that refusal shows up as `tracy-dsh` restart-looping AFTER `up -d`
# already returned 0, which the "7 healthy" check below reports only as a timeout, not as "you
# forgot to seed". `seed-profile.sh` itself assumes a Linux fleet host running as root
# (`tar --same-owner` — root chowning to uid 33): on a macOS dev box, running it directly fails
# with "Can't set UID=33: No such file or directory" for every entry, because the CALLER (not a
# container) is doing the chown, as a non-root user.
TDH="$(env_get TRACY_DSH_HOME)"
if [ ! -f "$TDH/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json" ]; then
  fail "TRACY_DSH_HOME=$TDH has no seeded profile yet" \
    "seed it once (macOS-safe: extraction happens INSIDE a container, not on the host, so there is no chown-as-non-root problem seed-profile.sh hits directly on a Mac) — docker run --rm --entrypoint sh tracy/dsh:dev -c 'tar -C /desk-home -cf - profiles' | docker run -i --rm -v \"$TDH\":/out alpine tar -C /out -xf -"
fi
ok "TRACY_DSH_HOME has a seeded profile"

# ── Check 5: the two built SPAs exist, and were built under the right base path ─────────────────
#
# `apps/tracy-web/Dockerfile` COPYs `packages/web/tracy-harness/dist` and
# `packages/web/tracy-design-page/dist` straight into the image. Both are GITIGNORED — a fresh
# clone has neither, and `docker compose up --build` then dies on a COPY line that names a path
# and not a cause. Worse is the half-state: a `dist/` built BEFORE its `vite.config.ts` grew its
# `base` writes absolute `/assets/...` URLs, the image accepts them happily, and the page loads
# 200 with a blank body — its script and stylesheet fall through to `workspace/route.js`'s
# catch-all, get resolved against the viewer's `tracy_site` cookie, and 404 inside a site's dsh
# proxy. Measured 10/09 on `/ops`: staff signed in, document 200, `#root` never mounted, no
# console error, nothing in any log. That is why this check reads the emitted URLs rather than
# just testing that the directory is there.
check_spa() {
  local name="$1" dir="$2" prefix="$3"
  [ -f "$dir/index.html" ] || fail "$name has no built dist ($dir/index.html missing)" \
    "pnpm --filter $name build   (needs Node >=22.19 or >=24 — see CLAUDE.md §5)"
  local strays
  strays="$(grep -oE '(src|href)="/[^"]*"' "$dir/index.html" | grep -v "\"$prefix" || true)"
  [ -z "$strays" ] || fail "$name's dist was built under the wrong base — it asks for $(echo "$strays" | sed -n 1p | cut -d'"' -f2), not $prefix..." \
    "pnpm --filter $name build   (its vite.config.ts already sets base; the dist on disk predates it)"
  ok "$name dist is built and asks for $prefix..."
}
# Paths from the REPO ROOT, not from here — this script cd'd to deploy/ at the top, so a
# relative `packages/...` would name `deploy/packages/...` and report every SPA as missing.
check_spa @tracy/harness-web "$REPO_ROOT/packages/web/tracy-harness/dist" /ops/
# Since 19/09 the harness is ONE entry again (index.html routes /ops and /ops/cms alike); a dist/
# with a cms.html is merely stale, not wrong, so nothing here asks for it.
check_spa @tracy/design-page "$REPO_ROOT/packages/web/tracy-design-page/dist" /design-inspiration/
check_spa @tracy/wo-find-page "$REPO_ROOT/packages/web/tracy-wo-find-page/dist" /find/

# ── Check 5b: the /ops/cms configuration snapshots exist and name the environments they serve ───
#
# Same shape as Check 5, third COPY line of the Dockerfile: `apps/tracy-web/static/ops-cms/` is
# generated out of git by `scripts/gen-ops-cms-snapshot.mjs` and gitignored. Without it the image
# builds fine and `/ops/cms` shows an empty Environment picker with "This build shipped no
# configuration snapshots" — measured 2026-09-15 on this stand (image built 14/09 19:46 skipped
# the generator). The check reads the index, not just the directory: an index that lists no
# environment is the same blank screen.
snapshots="$REPO_ROOT/apps/tracy-web/static/ops-cms"
[ -s "$snapshots/index.json" ] || fail "no /ops/cms snapshots ($snapshots/index.json missing)" \
  "node scripts/gen-ops-cms-snapshot.mjs --out apps/tracy-web/static/ops-cms   (from the repo root)"
envs="$(grep -oE '"id": *"[a-z0-9-]+"' "$snapshots/index.json" | wc -l | tr -d ' ')"
[ "$envs" -ge 1 ] || fail "/ops/cms snapshot index lists no environment" \
  "node scripts/gen-ops-cms-snapshot.mjs --out apps/tracy-web/static/ops-cms"
ok "/ops/cms snapshots present ($envs environment(s))"

# ── Check 6 (macOS only): the machine itself can resolve *.<SITE_DOMAIN> ────────────────────────
#
# A site lives at `<label>.<SITE_DOMAIN>`, and the session cookie is issued for `SESSION_DOMAIN`
# so it covers BOTH the app and every site hostname — the same shape production gets from
# `.tracy.ai`. That only works if this Mac can resolve the site names at all.
#
# 🔒 WHY NOT `.localhost`, WHICH MACOS RESOLVES FOR FREE. Because Chrome refuses to share a
# cookie across it: set `Domain=localhost` on `http://localhost:${WEB_PORT:-51710}`, open
# `http://anything.localhost:${WEB_PORT:-51710}`, and the cookie is gone (measured 10/09 in a real browser).
# `localhost` behaves as a public suffix, so a site owner signed in to Tracy was a stranger on
# their own site — "Private copy", from the very button My Sites hands them, with a sign-in link
# that bounced them straight back to the same refusal.
#
# The fix is a resolver file, one `sudo`, once. It is macOS-only: on the fleet the site domain is
# real and public DNS answers for it.
if [ "$(uname -s)" = "Darwin" ]; then
  SD="$(env_get SITE_DOMAIN)"
  TLD="${SD##*.}"
  RESOLVED="$(dscacheutil -q host -a name "checklocal.$SD" 2>/dev/null | sed -n 's/^ip_address: //p' | sed -n 1p)"
  if [ "$RESOLVED" = "127.0.0.1" ]; then
    ok "macOS resolves *.$SD to 127.0.0.1"
  else
    fail "macOS cannot resolve *.$SD (got \"${RESOLVED:-nothing}\", wanted 127.0.0.1)" \
      "sudo mkdir -p /etc/resolver && printf 'nameserver 127.0.0.1\\nport $(env_value HOST_DNS_PORT 5354)\\n' | sudo tee /etc/resolver/$TLD   (the file is named after the LAST label, not the whole domain; then re-run this)"
  fi
fi

# ── Check 7: the model key, which is OPTIONAL and fails in silence when it is missing ──────────
#
# Not a `fail` — a stack with no model key is a legitimate state, and plenty of what this repo
# works on (sites, seats, the bar, /ops) never asks a model anything. But when it IS missing the
# symptom is a chat box that accepts a message and never answers, with the reason buried one
# level down in the turn's own error (`MISSING_CREDENTIAL: llm-deepseek: no API key for provider
# route "deepseek-official"`). A person who has not seen that before reads it as "the agent is
# broken". One line here is cheaper than that afternoon.
if [ -z "$(env_get MODEL_API_KEY)" ]; then
  echo "• MODEL_API_KEY is empty — chat will send and never answer, and /design-inspiration's brand half answers 503"
  echo "  (set it in deploy/.env; it reaches tracy-dsh as DEEPSEEK_API_KEY. Everything else works without it.)"
else
  ok "MODEL_API_KEY is set (reaches tracy-dsh as DEEPSEEK_API_KEY)"
fi

# ── Check 8: the site web images named in IMAGE_TAGS are built on THIS machine ──────────────────
#
# 🔒 A MISSING WEB IMAGE DEGRADES A SITE IN SILENCE, IT DOES NOT FAIL IT. The images a site's web
# container runs (`tracy/web-wordpress:*`, `tracy/web-joomla:*`) are built on the host that runs
# them, never pulled — so a clean machine has none. Provision then keeps a NEW site on the upstream
# base (`wordpress:php8.3-apache`) with one warning in the provision log (scripts/lib/web-image.sh),
# and the site comes up fine. What it lacks is the agent's tools inside that container: no
# chromium, no node, no git/rg/jq. Measured 27/09 on the Studio stand: site r1w1734 ran
# `wordpress:php8.3-apache`, and the agent told the customer "no screenshots on this site (the
# container has no browser)", while the same kind of site on the dev machine
# (`tracy/web-wordpress:php8.3-apache-20260923-r1`) had `/usr/bin/chromium`.
#
# DEFAULTS_ONLY=1: only the two images a NEW site gets (~5 min each on the Studio, first run only —
# a tag already built from the same inputs is skipped). The other PHP lines are for imported sites
# on another base; build them by hand when one needs it. A site created BEFORE this ran stays on
# the upstream image until it is moved (docs/references/running-tracy-locally.md §1).
echo "── site web images (IMAGE_TAGS) ──"
DEFAULTS_ONLY=1 bash "$REPO_ROOT/packages/fleet/tracy-fleet-operation/web/build.sh" \
  || fail "a site web image in IMAGE_TAGS did not build (the '!! not built:' line above names it)" \
       "fix the error it names and re-run; bash packages/fleet/tracy-fleet-operation/web/build.sh <platform> retries one platform"
ok "the default site web images from IMAGE_TAGS are built (agent tools: chromium, node, git, rg, jq)"

echo "── bringing the stack up ──"
dc --profile local up -d --build

echo "── docker compose ps ──"
dc --profile local ps

EXPECT_HEALTHY="postgres minio dns tracy-web tracy-host docker-proxy tracy-dsh$EXTRA_HEALTHY"
MISSING=""
for svc in $EXPECT_HEALTHY; do
  health="$(dc --profile local ps --format json "$svc" 2>/dev/null | jq -r '.Health // empty' | sed -n 1p)"
  if [ "$health" = "healthy" ]; then
    ok "$svc: healthy"
  else
    MISSING="$MISSING $svc(${health:-no healthcheck reported / not running})"
  fi
done
# Count the list rather than writing a number: macOS runs an eighth service (`dns-host`), and a
# hardcoded "7" would have been wrong for it from the day that service landed.
N_EXPECTED="$(printf '%s\n' $EXPECT_HEALTHY | wc -l | tr -d ' ')"
[ -z "$MISSING" ] || fail "not all $N_EXPECTED services are healthy yet:$MISSING" \
  "give it a bit longer (tracy-dsh's own start_period is 180s on a cold boot) and re-run this script — it is safe to run again, nothing here is destructive"

echo "── loopback probe: tracy-host, the way a site container on the host network would reach it ──"
HEALTH_OUT="$(docker run --rm --network host alpine wget --timeout=5 -qO- http://127.0.0.1:$(env_value TRACY_HOST_PORT 51720)/health)"
echo "$HEALTH_OUT" | grep '"docker":true' >/dev/null || fail "tracy-host answered but docker:true is missing ($HEALTH_OUT)" \
  "check the docker socket bind in deploy/compose.yml's tracy-host service, and that /var/run/docker.sock is reachable"
ok "tracy-host /health: $HEALTH_OUT"

# ── Design inspiration card pictures, copied from the dev machine ──────────────────────────────
#
# The card list comes from the releases; the pictures live only in each deployment's own
# `template_shots`, so a fresh stack draws every card as an empty grey box (27/09). Optional like
# the model key: without ssh to the dev machine the stack still works, the cards just have no
# pictures — said out loud, never skipped in silence. `TRACY_SKIP_SHOTS=1` skips it on purpose.
if [ "${TRACY_SKIP_SHOTS:-0}" = "1" ]; then
  echo "⚠ card pictures not pulled (TRACY_SKIP_SHOTS=1)"
elif ! "$SCRIPT_DIR/pull-template-shots.sh"; then
  echo "⚠ card pictures not pulled — Design inspiration cards will have no pictures" >&2
  echo "  switch to turn on: ssh access to the dev machine, then deploy/scripts/pull-template-shots.sh" >&2
fi

echo
echo "All checks passed — the local stack is up and healthy."
