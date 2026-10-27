#!/usr/bin/env bash
#
# What a freshly installed site's front page answers, before provision.sh calls it "up".
#
# Sourced by `provision/provision.sh`, never executed; kept apart so a test can run it against a
# fake `curl`.
#
# Measured 23/09 on dev: `quickstart/ja-intranet/j6` provisioned to `state: done` while its front page
# answered 500 (`Attempted to load class "JFactory"` — a T3 template on Joomla 6 whose #__extensions
# lacks the compat6 row). Nothing between the installer and the last stage ever asked the page, so a
# demo nobody could open was listed as deployed. A quickstart that installs to a 5xx is a failed
# install, and the job has to say so where the Demos screen reads it.
#
# Asked both ways, like WordPress's `site_answers`: host-networked on a fleet host only the published
# loopback port answers; on the macOS stack the docker-network name may answer. Isolated sites
# can deny both roads, so the last probe runs inside the verified PHP web container. This proves
# CMS rendering, not customer proxy health. No `-L`: a redirect is the site answering.
#
# 🔒 THE NAME IS `tracy_web_dns_name`, NOT the raw `<label>-web-1` (issue #165). A label longer than
# 57 characters makes `<label>-web-1` exceed the 63-octet DNS-label cap, so it never resolves; such a
# site is reachable on the `tracy` network only by the bounded `tracy-web-<hash>` alias
# render-compose.sh gives it. provision.sh has already sourced render-compose.sh; a caller that has
# not (the test) gets it sourced here, so the dial never silently falls back to the long name.
if ! declare -F tracy_web_dns_name >/dev/null; then
  # shellcheck source=../provision/render-compose.sh
  . "$(dirname "${BASH_SOURCE[0]}")/../provision/render-compose.sh"
fi

# tracy_front_page_status <label> <port>
# Prints the HTTP status of the front page, or 000 when no road answered at all.
tracy_front_page_status() {
  local label="$1" port="$2" code identity id running project service extra
  if [[ ! "$label" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then printf '000\n'; return 0; fi
  for url in "http://$(tracy_web_dns_name "$label")/" "http://127.0.0.1:${port}/"; do
    if code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)"; then
      if [[ "$code" =~ ^[1-5][0-9]{2}$ ]]; then printf '%s\n' "$code"; return 0; fi
    fi
  done
  # Pin the exec to the inspected container ID: a replacement must not change the target.
  identity="$(docker inspect --type container --format '{{.Id}}|{{.State.Running}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}' "${label}-web-1" 2>/dev/null)" || identity=''
  IFS='|' read -r id running project service extra <<< "$identity"
  if [[ "$id" =~ ^[a-f0-9]{64}$ && "$running" == true && "$project" == "$label" && "$service" == web && -z "$extra" && "$identity" == "$id|true|$label|web" ]]; then
    if code="$(docker exec "$id" curl --noproxy '*' -s --max-time 20 -o /dev/null --write-out '%{http_code}' --header "Host: $(tracy_web_dns_name "$label")" http://127.0.0.1/ 2>/dev/null)"; then
      if [[ "$code" =~ ^[1-5][0-9]{2}$ ]]; then printf '%s\n' "$code"; return 0; fi
    fi
  fi
  printf '000\n'
}

# tracy_front_page_refusal <label> <port>
# Prints why the site may not be called up and returns 1; silent and 0 when the page answers < 500.
tracy_front_page_refusal() {
  local code
  code="$(tracy_front_page_status "$1" "$2")"
  case "$code" in
    000) echo "the front page did not answer at all (http://$(tracy_web_dns_name "$1")/, 127.0.0.1:$2, or the verified site web container)"; return 1 ;;
    5??) echo "the front page answers $code — the install finished but the site does not render"; return 1 ;;
  esac
  return 0
}
