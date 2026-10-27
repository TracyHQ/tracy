#!/usr/bin/env bash
# For every migrated site: what the Worker serves the world TODAY vs what tracy-web would serve
# after the cutover. Compared by status AND by <title>, because a 200 that renders the wrong site
# is the failure this whole step exists to catch.
set -uo pipefail
printf "%-46s %-18s %-18s %s\n" SITE "worker(today)" "tracy-web(after)" VERDICT
for d in /srv/tracy/*/; do
  l=$(basename "$d"); [ "$l" = host-dsh ] && continue
  ow=$(curl -s -o /tmp/a.html -w '%{http_code}' --max-time 25 "https://$l.tracy.ai/" || echo 000)
  ot=$(grep -oE '<title>[^<]*</title>' /tmp/a.html 2>/dev/null | sed -n 1p | sed 's/<[^>]*>//g' | cut -c1-24)
  nw=$(curl -s -o /tmp/b.html -w '%{http_code}' --max-time 25 -H "Host: $l.tracy.ai" http://127.0.0.1:51710/ || echo 000)
  nt=$(grep -oE '<title>[^<]*</title>' /tmp/b.html 2>/dev/null | sed -n 1p | sed 's/<[^>]*>//g' | cut -c1-24)
  if [ "$ow" = "$nw" ] && [ "$ot" = "$nt" ]; then v="same"; else v="DIFFERENT"; fi
  printf "%-46s %-18s %-18s %s\n" "$l" "$ow ${ot:-–}" "$nw ${nt:-–}" "$v"
done
