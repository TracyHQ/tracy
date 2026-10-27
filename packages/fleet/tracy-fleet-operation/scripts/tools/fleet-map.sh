#!/usr/bin/env bash
#
# What is actually running on the fleet, asked of the fleet rather than assumed from names.
#
# This exists because guessing cost something real: on 2026-08-15 a container was assumed to be
# a customer's clone because it sat on a host that hosts clones, and a probe file was written
# into the production site instead. Nothing on the box says out loud which public URL reaches
# which container — the label encodes a hash, the tunnel ingress lives in Cloudflare, and a
# stack can be stood up outside the `/srv/tracy/<label>` convention (`tracy-wp` is). So the one
# question anybody needs answered before writing anything — "is THIS the clone?" — had no
# answer that could be checked.
#
# Every column below is read from live state. Nothing is inferred from a name.
#
#   ./tools/fleet-map.sh                 # the default fleet host
#   ./tools/fleet-map.sh 1.2.3.4         # some other host
#   ./tools/fleet-map.sh --probe         # also ask each public URL what site it thinks it is
#
# `--probe` is off by default because it reaches the public internet once per site; the local
# columns come from one ssh round trip.

set -euo pipefail

# NO default IP. Since there are two fleet hosts (ADR 0005 §4), a hard-coded default is a confident
# answer about the WRONG machine — and the question this script exists to answer is "is this container
# a copy"; asking the wrong machine is worse than not asking. Taken from `.env` at the repo root.
HOST="${TRACY_FLEET_HOST:?TRACY_FLEET_HOST is required — see .env at the repo root, or set it to ask the old host}"
USER_AT="${TRACY_FLEET_USER:-root}"
ZONE="${TRACY_FLEET_ZONE:-tracy.ai}"
PROBE=0

for arg in "$@"; do
  case "$arg" in
    --probe) PROBE=1 ;;
    -h|--help) sed -n '3,25p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) HOST="$arg" ;;
  esac
done

# One ssh, one pass over the host: the site directories are the spine, and everything else is
# looked up per label. Reading it in a single remote script keeps the map internally consistent —
# a container list fetched separately from a webroot list can disagree about a site being torn
# down while we look.
ssh -o BatchMode=yes -o ConnectTimeout=10 "${USER_AT}@${HOST}" 'bash -s' <<'REMOTE' > /tmp/fleet-map.tsv
set -u
REPOS_MAP=/etc/tracy/repos.json

# label -> "Org/repo", from the file the webhook itself reads. A site missing here is a site
# whose pushes the fleet cannot route, which is worth seeing next to the site.
repo_for() {
  [ -f "$REPOS_MAP" ] || { echo "-"; return; }
  python3 - "$1" <<'PY' 2>/dev/null || echo "-"
import json, sys
label = sys.argv[1]
with open("/etc/tracy/repos.json") as f:
    m = json.load(f)
print(next((k for k, v in m.items() if v.get("label") == label), "-"))
PY
}

for dir in /srv/tracy/*/; do
  label=$(basename "$dir")
  case "$label" in _*|repos) continue ;; esac
  webroot="$dir/webroot"
  [ -d "$webroot" ] || continue

  # A site directory with no running container is a site that is down — the one state the port
  # column has to say out loud, because an empty cell reads as "not collected".
  container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "^${label}-web" | sed -n 1p)
  if [ -z "${container:-}" ]; then
    port="DOWN"
  else
    port=$(docker inspect "$container" --format '{{range $p,$v := .NetworkSettings.Ports}}{{range $v}}{{.HostPort}}{{end}}{{end}}' 2>/dev/null | sed -n 1p)
    [ -n "${port:-}" ] || port="?"
  fi

  if [ -d "$webroot/.git" ]; then
    git_state="git:$(cd "$webroot" && git status --porcelain 2>/dev/null | wc -l | tr -d ' ')dirty"
  elif [ -d "/srv/tracy/$label/repo.git" ]; then
    git_state="bare"
  else
    git_state="none"
  fi

  files=$(find "$webroot" -type f 2>/dev/null | wc -l | tr -d ' ')

  # A static file that exists in THIS webroot, with its hash — the witness `--probe` uses to
  # prove a public URL serves this directory. Static on purpose: a rendered page differs between
  # two fetches (nonces, timestamps) and would prove nothing. Every CMS answers this the same
  # way, which the CMS-specific alternatives (`/wp-json/`) do not.
  # Deliberately NOT robots.txt: Cloudflare serves a managed one of its own (~2 KB, "As a
  # condition of accessing this website…") in place of the origin's, so every proxied site reads
  # as a mismatch it is not. Whatever stands in as a witness has to be a file the edge passes
  # through untouched. Both casings of the Joomla files — the tree is case-sensitive.
  witness=""; wsum="-"
  for cand in license.txt LICENSE.txt readme.html README.txt htaccess.txt favicon.ico; do
    if [ -f "$webroot/$cand" ]; then
      witness="$cand"; wsum=$(md5sum "$webroot/$cand" 2>/dev/null | cut -c1-32); break
    fi
  done
  [ -n "$witness" ] || witness="-"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$label" "$port" "$git_state" "$files" "$(repo_for "$label")" "$witness" "$wsum"
done
REMOTE

printf '%-40s %-6s %-14s %-8s %-28s %s\n' LABEL PORT GIT FILES REPO 'PUBLIC URL'
printf '%.0s─' {1..135}; echo

while IFS=$'\t' read -r label port git_state files repo witness wsum; do
  url="https://${label}.${ZONE}"
  line=$(printf '%-40s %-6s %-14s %-8s %-28s %s' "$label" "$port" "$git_state" "$files" "$repo" "$url")
  if [ "$PROBE" = 1 ]; then
    # Does this URL serve THIS directory? Fetch the witness file over the public address and
    # compare it to the copy on disk. `SERVES-OTHER` is the finding that matters: the URL
    # answers, but from a webroot that is not this one — write to it and you have written
    # somewhere you did not look.
    if [ "$witness" = "-" ]; then
      verdict="no-witness"
    else
      # Follow redirects: a clone that bounces to the customer's real domain is exactly the case
      # worth naming, and without -L every redirecting site reads as a mismatch it is not.
      body=$(curl -sL --max-time 15 -o /tmp/fm-probe.$$ -w '%{http_code} %{url_effective}' "$url/$witness" 2>/dev/null || echo '000 -')
      code=${body%% *}; landed=${body##* }
      got=$(md5sum /tmp/fm-probe.$$ 2>/dev/null | cut -c1-32); rm -f /tmp/fm-probe.$$
      if   [ "$got" = "$wsum" ];  then verdict="serves-this"
      elif [ "$code" = "000" ];   then verdict="UNREACHABLE"
      # Access standing in front of a site is the configured state, not a fault — and its login
      # URL carries a JWT long enough to destroy the table if printed.
      elif [ "${landed#*cloudflareaccess.com}" != "$landed" ]; then verdict="access-gated"
      elif [ "$code" != "200" ];  then verdict="HTTP $code"
      elif [ "$landed" != "$url/$witness" ]; then verdict="REDIRECTED-TO ${landed%%\?*}"
      else verdict="SERVES-OTHER"; fi
    fi
    line="$line  $verdict"
  fi
  echo "$line"
done < /tmp/fleet-map.tsv

rm -f /tmp/fleet-map.tsv
