#!/usr/bin/env bash
# Generates a site's `apache/tracy-noindex.conf` — ONE single source, two readers.
#
# WHY THIS FILE EXISTS. That conf file holds TWO things of different nature:
#
#   1. The `X-Robots-Tag` header — a SWITCH. On while the copy is a draft; when the customer points their real
#      domain here it must go off, or their real site vanishes from Google without anyone knowing.
#   2. The DirectorySlash patch — a BUG FIX. Never off, in any state.
#
# Two writers produce it (`provision.sh` at build, `go-live.sh` when flipping the switch), so if each side
# kept its own `cat > ... <<EOF` the patch would exist twice and drift. Worse: a switch flip
# that rewrote the file and forgot to copy the patch would SILENTLY bring that bug back — the user sees
# a blank page when opening `/administrator`, and there is nothing to search for.
#
# Use:  tracy_write_apache_conf <site_dir> <on|off>     # on = noindex on (draft)

. "$(dirname "${BASH_SOURCE[0]}")/frame-policy.sh"

tracy_write_apache_conf() {
  local site_dir="$1" noindex="$2"
  local frame
  frame="$(tracy_frame_ancestors)" || return 1
  local custom=0 current="" managed_pattern="^'self' https://\*\.[a-zA-Z0-9.-]+( https://[a-zA-Z0-9.-]+)? http://127\.0\.0\.1:\* http://localhost:\*( https?://[^[:space:];]+)?$"
  if [ -f "$site_dir/apache/tracy-noindex.conf" ]; then
    current="$(sed -n 's/^Header always set Content-Security-Policy "frame-ancestors \(.*\)"$/\1/p' "$site_dir/apache/tracy-noindex.conf")"
    if [ -n "$current" ] && ! [[ "$current" =~ $managed_pattern ]]; then
      frame="$current"
      custom=1
    fi
  fi
  mkdir -p "$site_dir/apache"

  {
    if [ "$noindex" = "on" ]; then
      cat <<'NOINDEX'
# `always` so it survives error responses too — a 404 from a staging copy is still a page a
# crawler can list.
#
# SWITCH: the line below disappears when the site goes live (go-live.sh --op live). It must NOT survive
# go-live — a noindex header baked into the origin would apply to the customer's real domain too.
Header always set X-Robots-Tag "noindex, nofollow, noarchive"
NOINDEX
    else
      cat <<'LIVE'
# NO noindex header at the origin. Two cases lead here, and they differ:
#
#   1. The site has gone live (go-live.sh --op live) — so search engines and AI bots read it like any
#      other site. Back to draft: go-live.sh --op draft.
#   2. The site was BORN ON THE FLEET (the create branch). For it, hiding a draft is the job of the
#      fleet-bar Worker and follows `publish_state` (ADR 0086 §3) — a noindex header baked into the origin
#      would survive Publish and keep the customer's real site out of Google forever.
#
# The second case is why this file is still written for fresh sites: the PATCH part below (frame-ancestors
# and DirectorySlash) is right for every site, and before 31/08 fresh sites got nothing at all because the whole
# file was skipped along with the switch it carries.
LIVE
    fi

    cat <<'FIXES'

# ── What follows is NOT a switch. It is a patch, and it stays in every state. ──────────
#
# A directory asked for without its trailing slash used to answer with a blank page, and the
# blankness was the whole problem: no error, no message, nothing to search for. Opening
# `https://<clone>/administrator` loaded the Tracy bar, the bar framed the same path, mod_dir's
# DirectorySlash answered `301 http://<clone>/administrator/`, and Chrome refused an http frame
# inside an https page. The person saw white space and reasonably concluded their seat was wrong.
#
# DirectorySlash builds that redirect from the scheme of the CONNECTION, and behind the tunnel the
# connection reaching this container is plain http. `X-Forwarded-Proto` does not change it: Apache
# does not consult the header, or the `HTTPS` env var, when it constructs a self-referential URL.
#
# Three fixes that look right and are not, so nobody spends the afternoon again:
#   - `SetEnvIf X-Forwarded-Proto https HTTPS=on` — the env var is not what builds the URL.
#   - a `RewriteRule` at server scope — mod_rewrite is not inherited into a vhost, so it never runs.
#   - `ServerName https://host` with `UseCanonicalName On` — does not reach the redirect's scheme.
#
# Per-directory scope is what makes this one work: `%{REQUEST_FILENAME}` is a real path here, so
# `-d` can tell a directory from anything else, and the rule runs before mod_dir gets the chance.
# Absolute `https://%{HTTP_HOST}` because that is the only part Apache would otherwise get wrong;
# the host comes from the request, so this stays correct for every clone and every zone.
<Directory /var/www/html>
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !/$
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI}/ [R=301,L]
</Directory>

# ── Who may embed this site in a frame ────────────────────────────────────────────────
#
# Joomla sends `X-Frame-Options: SAMEORIGIN` by default, and WordPress does much the same. That header
# is right in intent — it blocks clickjacking — but it is a rule FROM THE LAST DECADE: an on/off
# switch that cannot say "allow exactly these".
#
# The consequence measured on 31/08 on `tracy-probe-ui-02.tracy.ai`: the site answered **200** to `curl` and
# **"refused to connect"** in Tracy's preview pane. The site was perfectly healthy; its owner had simply
# never been asked whether Tracy may look at it.
#
# `frame-ancestors` is the narrow answer, and it REPLACES rather than loosens: modern browsers ignore
# `X-Frame-Options` when the CSP has `frame-ancestors`, so the `unset` below only avoids two rules
# saying two things on the same response. Clickjacking protection REMAINS — every origin outside this list
# is still refused exactly as before.
#
# Four allowed sources, each a real Tracy surface:
#   'self'                       — the site itself, for Joomla/WordPress's own internal frames
#   https://*.<zone>             — every Tracy surface of this deployment: the workbench shell
#                                  (`cowork.<zone>`) and each site's dsh sidecar
#                                  (`<label>-agent.<zone>`). ONE level, so the wildcard covers them all.
#   http://127.0.0.1:* / localhost:* — dsh running on a developer's machine
#
# 🔒 THE ZONE IS A PARAMETER, NOT HARD-CODED TEXT — and it used to be the hard-coded `tracy.ai`. There has been more than one
# deployment since 11/09 (`tracy.site` is the dev one), and on another zone the old line blocked EXACTLY what it
# existed to allow: the preview frame in dsh showed nothing, and the console only said the site "refused to
# connect" — CSP does not report to the server, and the site still answered 200 to `curl`.
#
# ⚠ THE LOOPBACK LINE IS A REAL TRADE-OFF. It lets ANY page running on the viewer's localhost
# embed this site. An attacker would already have to run code on the victim's machine — by then they have
# worse options than clickjacking. In exchange, developers can view the site in a local dsh without
# editing the config each time. Drop that line if one day it is no longer worth it.
Header always unset X-Frame-Options

# ── The site's own name, given back to it ────────────────────────────────────────────────
#
# 🔒 THE SITE CANNOT SEE ITS OWN HOSTNAME WITHOUT THIS. tracy-web reaches a site's copy at
# `http://<label>-web-1/` (a docker alias), and Node's fetch RECOMPUTES `Host` from the URL it is
# given — a `Host` set on the outgoing headers is discarded, measured 11/09. So PHP reads
# `HTTP_HOST=<label>-web-1`, and every URL the CMS builds from it names a host no browser can
# resolve. Measured on `devsmoke3.tracy.site`: `GET /wp-admin/` answered
# `Location: …/wp-login.php?redirect_to=https%3A%2F%2Fdevsmoke3-web-1%2Fwp-admin%2F` — sign in
# succeeds and then lands the person on a dead address.
#
# `X-Forwarded-Host` is what the proxy in front says the visitor typed; mod_headers puts it back
# where the application looks. `env=` means a request that carries no such header — anything
# dialling the loopback port directly — is left exactly as it was.
#
# tracy-web ALSO rewrites `Location` on the way out (`bar/site-proxy.js`), and both are wanted:
# this line fixes the value at the source, that one catches whatever is built some other way.
<IfModule mod_headers.c>
  SetEnvIfNoCase X-Forwarded-Host "^(.+)$" TRACY_FWD_HOST=$1
  RequestHeader set Host "%{TRACY_FWD_HOST}e" env=TRACY_FWD_HOST
</IfModule>
FIXES

    # Outside the heredoc because the heredoc above is `<<'FIXES'` (no interpolation, on purpose: the whole block is full of
    # mod_rewrite's `%{...}`). A line that needs interpolation is printed on its own, rather than turning interpolation on
    # for the whole block.
    printf 'Header always set Content-Security-Policy "frame-ancestors %s"\n' "$frame"
  } > "$site_dir/apache/tracy-noindex.conf"
  if [ "$custom" = 0 ]; then tracy_record_frame_policy "$site_dir" "$frame"; fi
}
