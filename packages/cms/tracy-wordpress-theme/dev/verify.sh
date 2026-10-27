#!/bin/sh
# Stand up WordPress with the tracy theme and demo content, then apply and check three design
# systems. Assumes `docker compose -f dev/compose.yml up -d web` and a built ../dist/tracy.zip.
#
#   dev/verify.sh                    # install + seed + check brutalism, airbnb, apple
#   dev/verify.sh apple              # only switch to one design system and check it
#   dev/verify.sh --host unix:///path/to/docker.sock [id]
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
URL="http://127.0.0.1:8089"
FIXTURE_BODY="$HERE/../../tracy-cms-sections/scripts/fixture-body.mjs"
ARTIFACT_BODY="$HERE/../../tracy-cms-sections/scripts/artifact-body.mjs"
HOST_FLAG=""
if [ "${1:-}" = "--host" ] && [ -n "${2:-}" ]; then
  HOST_FLAG="-H $2"
  shift 2
fi
ONLY="${1:-}"

# shellcheck disable=SC2086
wp() { docker $HOST_FLAG compose -f "$HERE/compose.yml" run --rm -T cli "$@"; }

wait_for_site() {
  i=0
  until curl -sf -o /dev/null "$URL/" || [ "$i" -ge 60 ]; do i=$((i + 1)); sleep 2; done
}

seed() {
  echo "== install WordPress"
  wp core is-installed 2>/dev/null || wp core install --url="$URL" --title="Tracy Demo" \
    --admin_user=tracyadmin --admin_password=tracy-demo-password-2026 --admin_email=admin@example.com --skip-email
  echo "== install the theme"
  wp theme install /dist/tracy.zip --force --activate
  wp rewrite structure '/%postname%/' --hard
  wp option update date_format 'd F Y' >/dev/null   # the Joomla stand's date shape

  echo "== demo content"
  wp post delete 1 --force >/dev/null 2>&1 || true   # the stock "Hello world!" post
  wp post delete 2 --force >/dev/null 2>&1 || true   # the stock "Sample Page"
  # The home page is the engine's landing artifact of the chosen design system — what the preview
  # dialog's Landing chip shows, pixel for pixel — because a landing has its own navigation and
  # calls to action, where a fixture has neither. apply_and_check rewrites it on every style
  # switch. The section library's landing lives at /sections/.
  home_id="$(node "$ARTIFACT_BODY" brutalism landing --wp | wp post create - --post_type=page --post_title=Home --post_name=home --post_status=publish --porcelain --user=tracyadmin)"
  wp post meta update "$home_id" _wp_page_template artifact
  wp post meta update "$home_id" tracy_artifact landing
  # The Design page is the design system's own fixture (the preview's Home chip).
  design_id="$(node "$FIXTURE_BODY" brutalism --wp | wp post create - --post_type=page --post_title=Design --post_name=design --post_status=publish --porcelain --user=tracyadmin)"
  wp post meta update "$design_id" _wp_page_template fixture
  sections_id="$(wp post create --post_type=page --post_title=Sections --post_name=sections --post_status=publish --porcelain \
    --post_content='<!-- wp:pattern {"slug":"tracy/landing"} /-->')"
  wp post meta update "$sections_id" _wp_page_template landing
  blog_id="$(wp post create --post_type=page --post_title=Blog --post_name=blog --post_status=publish --porcelain)"
  styleguide_id="$(wp post create --post_type=page --post_title="Style guide" --post_name=style-guide --post_status=publish --porcelain \
    --post_content='<!-- wp:pattern {"slug":"tracy/section-styleguide"} /-->')"
  contact_id="$(wp post create --post_type=page --post_title=Contact --post_name=contact --post_status=publish --porcelain \
    --post_content='<!-- wp:pattern {"slug":"tracy/section-contact"} /-->')"
  wp option update show_on_front page
  wp option update page_on_front "$home_id"
  wp option update page_for_posts "$blog_id"

  pricing="$(sed -n '/^<!-- wp:table/,$p' "$HERE/../src/tracy/patterns/pricing.php")"
  pricing_id="$(printf '%s' "$pricing" | wp post create - --post_type=page --post_title=Pricing --post_name=pricing --post_status=publish --porcelain)"
  wp post meta update "$pricing_id" _wp_page_template pricing

  # The same three posts as the Joomla stand's seed.sql, in the same order (newest first on the
  # listing, so dates run backwards), in a Blog category, by an author with a display name.
  wp user update tracyadmin --display_name="Tracy team" >/dev/null
  blog_cat="$(wp term create category Blog --porcelain 2>/dev/null || wp term list category --name=Blog --field=term_id)"
  seed_post() {
    post_id="$(wp post create --post_title="$1" --post_name="$2" --post_status=publish --post_excerpt="$3" --post_date="$4" \
      --post_author=1 --post_category="$blog_cat" --porcelain \
      --post_content="<!-- wp:paragraph --><p>$3</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>$5</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>Each change is recorded under an apply id, so one call puts a whole deliverable back.</p><!-- /wp:paragraph -->")"
    wp media import "https://picsum.photos/seed/tracy$6/800/600.jpg" --post_id="$post_id" --featured_image --porcelain >/dev/null || true
  }
  seed_post "WordPress skills, explained" wordpress-skills "What an agent can and cannot touch on a WordPress site, and how every change is held for review." "2026-09-07 10:00:00" "Skills are bounded actions: install a plugin, edit a post, put a file in the media library. Nothing else." 1
  seed_post "Joomla on the fleet" joomla-on-the-fleet "A fresh Joomla in ninety seconds, with the template already wearing your design system." "2026-09-06 10:00:00" "The template is one zip; the design system is a parameter of its style." 2
  seed_post "Shopify, coming next" shopify-coming-next "The same bounded endpoint, on a platform that has no files to walk." "2026-09-05 10:00:00" "Themes, products and pages through the API, held for review like everything else." 3

  # Links of kind post-type with the page's id: WordPress then marks the page the visitor is on
  # (current-menu-item, aria-current), which a custom URL never gets. Home is the home-link block.
  nav_link() { printf '<!-- wp:navigation-link {"label":"%s","type":"page","id":%s,"url":"/%s/","kind":"post-type"} /-->' "$1" "$2" "$3"; }
  wp post create --post_type=wp_navigation --post_title="Main" --post_status=publish \
    --post_content="<!-- wp:home-link {\"label\":\"Home\"} /-->$(nav_link Design "$design_id" design)$(nav_link Sections "$sections_id" sections)$(nav_link Blog "$blog_id" blog)$(nav_link Pricing "$pricing_id" pricing)$(nav_link "Style guide" "$styleguide_id" style-guide)$(nav_link Contact "$contact_id" contact)" --porcelain >/dev/null
}

check() { if [ "$2" -gt 0 ]; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }

apply_and_check() {
  id="$1"
  meta="$(grep -A5 "\"$id\": {" "$HERE/../src/tracy/inspirations.json")"
  nav="$(printf '%s' "$meta" | sed -n 's/.*"nav": "\([^"]*\)".*/\1/p' | head -1)"
  hero="$(printf '%s' "$meta" | sed -n 's/.*"hero": "\([^"]*\)".*/\1/p' | head -1)"
  accent="$(grep -A2 '"slug": "accent",' "$HERE/../src/tracy/styles/$id.json" | sed -n 's/.*"color": "\([^"]*\)".*/\1/p' | head -1)"
  if [ -z "$accent" ]; then echo "verify: could not read the accent of $id" >&2; exit 1; fi
  result="$(wp eval "echo tracy_apply_inspiration('$id') ? 'applied' : 'refused';")"
  wp cache flush >/dev/null 2>&1 || true
  # Before the body is rewritten: a design page keeps the stylesheet of the system its body was
  # written for, whatever the variation now says — switching the style in the admin must not break it.
  kept="$(curl -s "$URL/" | sed -n 's/.*class="tracy-artifact" data-inspiration="\([a-z0-9-]*\)".*/\1/p' | head -1)"
  kept_css="$(curl -s "$URL/" | grep -c "css/artifacts/landing/$kept.css")"
  # The home page is the system's landing artifact and /design/ its fixture, so their markup follows the style switch.
  home_id="$(wp post list --post_type=page --name=home --field=ID)"
  node "$ARTIFACT_BODY" "$id" landing --wp | wp post update "$home_id" - --user=tracyadmin >/dev/null
  design_id="$(wp post list --post_type=page --name=design --field=ID)"
  node "$FIXTURE_BODY" "$id" --wp | wp post update "$design_id" - --user=tracyadmin >/dev/null
  home="$(curl -s "$URL/")"
  fixture="$(curl -s "$URL/design/")"
  landing="$(curl -s "$URL/sections/")"
  fail=0
  echo "== $id  nav=$nav hero=$hero accent=$accent ($result)"
  check "variation applied"       "$(printf '%s' "$result" | grep -c applied)"
  check "accent in global styles" "$(printf '%s' "$landing" | grep -c -- "--wp--preset--color--accent: *$accent")"
  check "body classes"            "$(printf '%s' "$landing" | grep -c "tracy-nav-$nav tracy-hero-$hero")"
  check "home is the landing artifact" "$(printf '%s' "$home" | grep -c "class=\"tracy-artifact\" data-inspiration=\"$id\" data-artifact=\"landing\"")"
  check "artifact css linked"     "$(printf '%s' "$home" | grep -c "css/artifacts/landing/$id.css")"
  check "home kept its css ($kept) across the switch" "$kept_css"
  check "design page is the fixture" "$(printf '%s' "$fixture" | grep -c "class=\"tracy-fixture\" data-inspiration=\"$id\"")"
  check "fixture css linked"      "$(printf '%s' "$fixture" | grep -c "css/fixtures/$id.css")"
  check "hero rendered"           "$(printf '%s' "$landing" | grep -c 'tracy-hero__copy')"
  check "custom tokens kebab"     "$(printf '%s' "$landing" | grep -c -- '--wp--custom--section-y--desktop')"
  check "spacing slug intact"     "$(printf '%s' "$landing" | grep -c -- '--wp--preset--spacing--12')"
  check "home loads no theme css" "$(printf '%s' "$home" | grep -c 'global-styles-inline-css\|assets/css/tracy.css' | awk '{print ($1 == 0) ? 1 : 0}')"
  check "listing has 3 cards"     "$(curl -s "$URL/blog/" | grep -c 'tracy-card__media' | awk '{print ($1 == 3) ? 1 : 0}')"
  check "pricing template"        "$(curl -s "$URL/pricing/" | grep -c 'tracy-pricing-page')"
  check "pricing ends on the cta" "$(curl -s "$URL/pricing/" | grep -c 'tracy-cta-final__box')"
  check "listing kind is Blog"    "$(curl -s "$URL/blog/" | grep -c '>Blog</a>' | awk '{print ($1 >= 3) ? 1 : 0}')"
  check "article names its author" "$(curl -s "$URL/wordpress-skills/" | grep -c 'Tracy team')"
  check "navigation rendered"     "$(printf '%s' "$landing" | grep -c 'wp-block-navigation-item')"
  check "current page marked in nav" "$(curl -s "$URL/pricing/" | grep -c 'current-menu-item')"
  check "landing has 12 sections" "$(printf '%s' "$landing" | grep -o 'tracy-hero__copy\|tracy-social-proof__label\|tracy-problem\|tracy-pillars__grid\|tracy-steps\|tracy-cta-inline__box\|tracy-zig\|tracy-stats__grid\|tracy-testimonials\|tracy-faq__list\|tracy-plans__grid\|tracy-cta-final__box' | sort -u | wc -l | awk '{print ($1 >= 12) ? 1 : 0}')"
  check "style guide page"        "$(curl -s "$URL/style-guide/" | grep -c 'tracy-swatch')"
  check "contact page"            "$(curl -s "$URL/contact/" | grep -c 'tracy-form')"

  # ?style=<id> from the address bar: a section page wears the asked variation for this visitor
  # (accent, nav and hero), the design pages keep their own, an unknown id is ignored, and the
  # cookie set by ?style= carries the look to the next page.
  probe="airbnb"; [ "$id" = "airbnb" ] && probe="apple"
  probe_meta="$(grep -A5 "\"$probe\": {" "$HERE/../src/tracy/inspirations.json")"
  probe_nav="$(printf '%s' "$probe_meta" | sed -n 's/.*"nav": "\([^"]*\)".*/\1/p' | head -1)"
  probe_accent="$(grep -A2 '"slug": "accent",' "$HERE/../src/tracy/styles/$probe.json" | sed -n 's/.*"color": "\([^"]*\)".*/\1/p' | head -1)"
  styled="$(curl -s -c "$HERE/.cookies" "$URL/sections/?style=$probe")"
  check "?style= switches the accent"      "$(printf '%s' "$styled" | grep -c -- "--wp--preset--color--accent: *$probe_accent")"
  check "?style= switches nav"             "$(printf '%s' "$styled" | grep -c "tracy-nav-$probe_nav")"
  check "?style= leaves the home alone"   "$(curl -s "$URL/?style=$probe" | grep -c "css/artifacts/landing/$id.css")"
  check "?style= ignores an unknown id"    "$(curl -s "$URL/sections/?style=no-such-thing" | grep -c "tracy-nav-$nav tracy-hero-$hero")"
  check "cookie carries ?style= onward"    "$(curl -s -b "$HERE/.cookies" "$URL/pricing/" | grep -c "tracy-nav-$probe_nav")"
  check "?style= (empty) forgets it"       "$(curl -s -b "$HERE/.cookies" -c "$HERE/.cookies" "$URL/sections/?style=" | grep -c "tracy-nav-$nav tracy-hero-$hero")"
  rm -f "$HERE/.cookies"
  return $fail
}

wait_for_site
if [ -z "$ONLY" ]; then
  seed
  echo "== variations known to WordPress: $(wp eval 'echo count(WP_Theme_JSON_Resolver::get_style_variations());')"
  status=0
  for id in brutalism airbnb apple; do apply_and_check "$id" || status=1; done
  apply_and_check brutalism >/dev/null || true
  exit $status
else
  apply_and_check "$ONLY"
fi
