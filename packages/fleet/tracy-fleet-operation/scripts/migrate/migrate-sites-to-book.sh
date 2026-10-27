#!/usr/bin/env bash
# One-time: bring the sites of the OLD architecture into tracy-web's book, and put tracy-web on
# each site's network so it can dial `<label>-web-1` (sites/resolver.js `siteTarget`).
#
# Reads facts from the machine, never from a guess: label from the directory, port from the site's
# own .env, platform from the image its web container actually runs, publish from whether the site
# answers the public TODAY. Idempotent: `on conflict do nothing`, and a network already joined is
# skipped.
set -euo pipefail
ZONE=tracy.ai
SQL=/tmp/migrate-sites.sql
: > "$SQL"
for d in /srv/tracy/*/; do
  label=$(basename "$d"); [ "$label" = host-dsh ] && continue
  port=$(sed -n 's/^HOST_PORT=//p' "$d/.env" 2>/dev/null | sed -n 1p)
  [ -n "$port" ] || { echo "!! $label has no HOST_PORT — skipped" >&2; continue; }
  img=$(docker inspect "${label}-web-1" --format '{{.Config.Image}}' 2>/dev/null || true)
  case "$img" in
    *web-wordpress*) platform=wordpress ;;
    *web-joomla*)    platform=joomla ;;
    *) echo "!! $label: cannot tell platform from image '$img' — skipped" >&2; continue ;;
  esac
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$label.$ZONE/" || echo 000)
  case "$code" in
    200) publish=published ;;
    403) publish=draft ;;
    *) echo "!! $label answers $code today — left draft, check by hand" >&2; publish=draft ;;
  esac
  printf "insert into site (site_key,label,host,platform,origin,publish,port,address,attached) values ('%s.%s','%s','prod1','%s','migrated','%s',%s,'https://%s.%s/',false) on conflict (site_key) do nothing;\n" \
    "$label" "$ZONE" "$label" "$platform" "$publish" "$port" "$label" "$ZONE" >> "$SQL"
  net="${label}_default"
  if docker network inspect "$net" >/dev/null 2>&1; then
    joined=$(docker inspect tracy-tracy-web-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')
    case " $joined " in *" $net "*) : ;; *) docker network connect "$net" tracy-tracy-web-1 && echo "   net: joined $net" ;; esac
  else
    echo "!! $label: no network $net" >&2
  fi
  printf "%-46s port=%-6s %-9s %s\n" "$label" "$port" "$platform" "$publish"
done
echo "== applying =="
docker exec -i tracy-postgres-1 psql -U tracy -d tracy -v ON_ERROR_STOP=1 < "$SQL"
