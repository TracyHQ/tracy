#!/bin/sh
# Switch the local stand to one design system and print the checks that prove it rendered.
#
#   dev/demo.sh brutalism            # or airbnb, apple, … any id in inspirations.json
#   dev/demo.sh apple --host unix:///path/to/docker.sock
#
# Assumes `docker compose -f dev/compose.yml up -d` is running and dev/seed.sql has been applied.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
ID="${1:?design system id}"
HOST_FLAG=""
if [ "${2:-}" = "--host" ] && [ -n "${3:-}" ]; then
  HOST_FLAG="-H $3"
fi
URL="http://127.0.0.1:8080"

# shellcheck disable=SC2086
compose() { docker $HOST_FLAG compose -f "$HERE/compose.yml" "$@"; }

if ! grep -q "\"$ID\":" "$HERE/../src/tpl_tracy/inspirations.json"; then
  echo "demo: $ID is not in inspirations.json" >&2
  exit 1
fi

compose exec -T db mariadb -uroot -ptracy-dev joomla \
  -e "UPDATE jos_template_styles SET params='{\"inspiration\":\"$ID\",\"nav\":\"auto\",\"hero\":\"auto\"}' WHERE client_id=0 AND template='tpl_tracy'" 2>/dev/null

# Before the body is reseeded: a design page keeps the stylesheet of the system its body was
# written for, whatever the style now says — switching the style in the admin must not break it.
kept="$(curl -s "$URL/" | sed -n 's/.*class="tracy-artifact" data-inspiration="\([a-z0-9-]*\)".*/\1/p' | head -1)"
kept_css="$(curl -s "$URL/" | grep -c "css/artifacts/landing/$kept.css")"

# The home page is the design system's landing artifact and /design its fixture, so their markup follows the style switch.
if [ -n "$HOST_FLAG" ]; then "$HERE/seed.sh" --host "$3" --fixture "$ID" >/dev/null; else "$HERE/seed.sh" --fixture "$ID" >/dev/null; fi

home="$(curl -s "$URL/")"
blog="$(curl -s "$URL/index.php/blog")"
body="$(printf '%s' "$home" | grep -o '<body[^>]*>' | head -1)"
nav="$(printf '%s' "$body" | sed -n 's/.*data-nav="\([^"]*\)".*/\1/p')"
hero="$(printf '%s' "$body" | sed -n 's/.*data-hero="\([^"]*\)".*/\1/p')"

check() { if [ "$2" -gt 0 ]; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }
fail=0
echo "== $ID  nav=$nav hero=$hero"
check "token file linked"      "$(printf '%s' "$blog" | grep -c "css/inspirations/$ID.css")"
check "home loads no theme css" "$(printf '%s' "$home" | grep -c 'css/tracy.css\|css/inspirations/' | awk '{print ($1 == 0) ? 1 : 0}')"
check "home is the landing artifact" "$(printf '%s' "$home" | grep -c "class=\"tracy-artifact\" data-inspiration=\"$ID\" data-artifact=\"landing\"")"
check "artifact css linked"     "$(printf '%s' "$home" | grep -c "css/artifacts/landing/$ID.css")"
check "home kept its css ($kept) across the switch" "$kept_css"
check "no chrome on home"      "$(printf '%s' "$home" | grep -Eo '<body[^>]*' | grep -c 'data-page="artifact"')"
check "design page is the fixture" "$(curl -s "$URL/index.php/design" | grep -c "class=\"tracy-fixture\" data-inspiration=\"$ID\"")"
check "fixture css linked"     "$(curl -s "$URL/index.php/design" | grep -c "css/fixtures/$ID.css")"
check "tracy.css before tokens" "$(printf '%s' "$blog" | grep -o 'css/[a-z]*\.css\|css/inspirations' | awk '/tracy.css/{t=NR} /inspirations/{i=NR} END{print (t && i && t < i) ? 1 : 0}')"
check "listing has 3 cards"    "$(curl -s "$URL/index.php/blog" | grep -c 'tracy-grid__item' | awk '{print ($1 == 3) ? 1 : 0}')"
check "pricing table framed"   "$(curl -s "$URL/index.php/pricing" | grep -c 'tracy-pricing-page')"
check "pricing ends on the cta" "$(curl -s "$URL/index.php/pricing" | grep -c 'tracy-cta-final__box')"
check "sections page, 12 sections" "$(curl -s "$URL/index.php/sections" | grep -o 'tracy-hero__copy\|tracy-social-proof__label\|tracy-problem\|tracy-pillars__grid\|tracy-steps\|tracy-cta-inline__box\|tracy-zig\|tracy-stats__grid\|tracy-testimonials\|tracy-faq__list\|tracy-plans__grid\|tracy-cta-final__box' | sort -u | wc -l | awk '{print ($1 >= 12) ? 1 : 0}')"
check "footer says built with"  "$(printf '%s' "$blog" | grep -c 'Built with Tracy')"
check "token file has 56 names" "$(curl -s "$URL/media/templates/site/tpl_tracy/css/inspirations/$ID.css" | grep -c '^  --' | awk '{print ($1 >= 56) ? 1 : 0}')"

# ?style=<id> from the address bar: a section page wears the asked system for this visitor
# (token file, nav and hero), the design pages keep their own, an unknown id is ignored, and
# the cookie set by ?style= carries the look to the next page.
probe="airbnb"; [ "$ID" = "airbnb" ] && probe="apple"
probe_nav="$(sed -n "/\"$probe\": {/,/}/p" "$HERE/../src/tpl_tracy/inspirations.json" | sed -n 's/.*"nav": "\([^"]*\)".*/\1/p' | head -1)"
styled="$(curl -s -c "$HERE/.cookies" "$URL/index.php/blog?style=$probe")"
check "?style= switches the token file"  "$(printf '%s' "$styled" | grep -c "css/inspirations/$probe.css")"
check "?style= switches nav"             "$(printf '%s' "$styled" | grep -Eo '<body[^>]*' | grep -c "data-nav=\"$probe_nav\"")"
check "?style= leaves the home alone"   "$(curl -s "$URL/?style=$probe" | grep -c "css/artifacts/landing/$ID.css")"
check "?style= ignores an unknown id"    "$(curl -s "$URL/index.php/blog?style=no-such-thing" | grep -c "css/inspirations/$ID.css")"
check "cookie carries ?style= onward"    "$(curl -s -b "$HERE/.cookies" "$URL/index.php/pricing" | grep -c "css/inspirations/$probe.css")"
check "?style= (empty) forgets it"       "$(curl -s -b "$HERE/.cookies" -c "$HERE/.cookies" "$URL/index.php/blog?style=" | grep -c "css/inspirations/$ID.css")"
rm -f "$HERE/.cookies"
exit $fail
