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
# loopback port answers; on the macOS stack only the docker-network name does. No `-L`: a redirect
# is the site answering.
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
# Prints the HTTP status of the front page, or 000 when neither road answered at all.
tracy_front_page_status() {
  local label="$1" port="$2" code
  for url in "http://$(tracy_web_dns_name "$label")/" "http://127.0.0.1:${port}/"; do
    code="$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
    case "$code" in
      '' | 000) continue ;;
      *) printf '%s\n' "$code"; return 0 ;;
    esac
  done
  printf '000\n'
}

# tracy_front_page_refusal <label> <port>
# Prints why the site may not be called up and returns 1; silent and 0 when the page answers < 500.
tracy_front_page_refusal() {
  local code
  code="$(tracy_front_page_status "$1" "$2")"
  case "$code" in
    000) echo "the front page did not answer at all (http://$(tracy_web_dns_name "$1")/ and 127.0.0.1:$2)"; return 1 ;;
    5??) echo "the front page answers $code — the install finished but the site does not render"; return 1 ;;
  esac
  return 0
}
