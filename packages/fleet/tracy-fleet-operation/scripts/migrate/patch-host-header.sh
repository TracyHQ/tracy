#!/usr/bin/env bash
# Give the OLD sites the one Apache block the new architecture depends on (production notes B7).
#
# tracy-web dials a site by its CONTAINER name (`sites/resolver.js` siteTarget →
# http://<label>-web-1/), and Node's fetch recomputes `Host` from the URL, so a `Host` set on the
# outgoing headers is discarded. The CMS then sees `HTTP_HOST=<label>-web-1`. Most sites shrug;
# one that enforces a canonical host answers `301` to its real address — and since that address
# comes straight back to tracy-web, that is an infinite redirect, not a cosmetic difference.
# Measured on `tracy-test-bakery`: 301 through tracy-web, 200 straight to its own port.
#
# Sites provisioned by the new `site-apache-conf.sh` already carry this. The fifteen that predate
# it do not. Safe on every site either way: with no `X-Forwarded-Host` the env var is never set
# and `RequestHeader` never fires, so today's tunnel path is untouched.
set -euo pipefail
MARK='# tracy: Host from X-Forwarded-Host (B7)'
for d in /srv/tracy/*/; do
  label=$(basename "$d"); [ "$label" = host-dsh ] && continue
  conf="$d/apache/tracy-noindex.conf"
  [ -f "$conf" ] || { echo "!! $label: no $conf"; continue; }
  if grep -qF "$MARK" "$conf"; then echo "$label: already patched"; continue; fi
  cp -a "$conf" "$conf.bak-b7"
  cat >> "$conf" <<'APACHE'

# tracy: Host from X-Forwarded-Host (B7)
# See patch-host-header.sh for why. Without it a canonical-host CMS 301s to its real address and
# tracy-web sends the browser straight back here — a loop, not a redirect.
<IfModule mod_headers.c>
  SetEnvIfNoCase X-Forwarded-Host "^(.+)$" TRACY_FWD_HOST=$1
  RequestHeader set Host "%{TRACY_FWD_HOST}e" env=TRACY_FWD_HOST
</IfModule>
APACHE
  if docker exec "${label}-web-1" apachectl -t >/dev/null 2>&1 && docker exec "${label}-web-1" apachectl graceful >/dev/null 2>&1; then
    echo "$label: patched + graceful reload"
  else
    echo "!! $label: apache refused the config — ROLLED BACK"
    mv "$conf.bak-b7" "$conf"
    docker exec "${label}-web-1" apachectl graceful >/dev/null 2>&1 || true
  fi
done
