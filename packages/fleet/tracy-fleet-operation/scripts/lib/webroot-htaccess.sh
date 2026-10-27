#!/usr/bin/env bash
#
# The two things a clone's webroot needs from Apache that no customer archive reliably carries.
#
# Sourced, never executed. provision.sh calls it when a site is stood up and deploy-site.sh calls it
# again after every deploy, because neither on its own is enough: the file it maintains is untracked,
# so a deploy can never create it, and a webroot that a later provision re-extracts can lose it.
#
# ## Why the root .htaccess has to be provisioned
#
# 🔒 Measured 2026-08-17 on joomlart-com-0871462c: every SEF URL answered Apache's OWN 404
# (charset=iso-8859-1, HTML 4.01 doctype) while the homepage answered 200 and
# `index.php?option=com_content&...&Itemid=664` answered 200 with 122 KB. Nothing was wrong with the
# database, the content or the template. `webroot/.htaccess` simply did not exist, so mod_rewrite
# never handed /joomla/templates/ to index.php, and DirectoryIndex kept the homepage alive well
# enough to make the site look healthy.
#
# It is missing for a reason that does not fix itself:
#
#   - Joomla ships its rules as `htaccess.txt` and expects a human to rename the file. A webroot
#     captured from a customer's git-based stack carries the .txt and not the dotfile: ja-mainsite
#     gitignores `/.htaccess` and generates it at container start in docker/docker-entrypoint.sh.
#   - Our compose sets `entrypoint: ["apache2-foreground"]` on joomla:5-apache so the image installs
#     nothing over the customer's webroot — which also means no entrypoint of anybody's runs that
#     copy.
#   - deploy-site.sh materialises only what `main` tracks, and the file is in nobody's `main`. So
#     re-deploying could not repair it however many times it ran. That is exactly what was reported.
#
# Every Joomla clone on the fleet was missing it; only the one with `sef_rewrite = true` showed
# symptoms, which is why this survived three other sites. reskin/install-demo-frame.sh already calls
# it "trap 6" and repairs it for the length of its own run; this is the same fix, moved to where
# every clone passes through.
#
# ## Why the hardening block exists as well
#
# A clone stands at a guessable public address with no login in front of it, so whatever the customer
# left lying in their webroot is world-readable here in a way it may not have been at home. 🔒 On the
# same site and the same day, before this block existed: `_resources/ja_j6.sql` (42 MB),
# `_resources/joomlart.sql` (40 MB), `_resources/ja_j6_seo.sql.zip` (58 MB) and
# `configuration.php.bak` all answered 200 to an anonymous request. The .bak is the sharp one —
# Apache serves a `.bak` as a plain file instead of handing it to PHP, so it published the source
# site's database password and Joomla `$secret` in clear text.
#
# Joomla's own htaccess.txt blocks none of those extensions (it covers .svg inline script and gzip
# negotiation and nothing else of this kind), so this is not a duplicate of anything it carries. The
# X-Robots-Tag the provision mounts is not access control either; it asks a crawler not to list what
# it already fetched.

# Marker for the appended block. Grepped for rather than regenerated, so calling this twice on the
# same webroot is a no-op instead of a file that grows a copy per deploy.
TRACY_HARDENING_MARKER='## --- Tracy clone hardening (provisioned by the fleet, not by the customer) ---'

# Is Joomla's rewrite-based SEF turned on for this webroot?
#
# Read rather than assumed, because the answer decides whether a missing .htaccess is a fault or
# simply the shape of that site: with sef_rewrite off, Joomla emits /index.php?option=... and needs
# no rewrite at all. Real values seen across the fleet are `true`, `false`, `'0'` and `'1'` — quoted
# and bare, from different Joomla generations — so the quotes come off before the comparison rather
# than being spelled into one clever pattern.
tracy_sef_rewrite_on() {
  local cfg="$1/configuration.php" value
  [ -f "$cfg" ] || return 1
  value="$(sed -n "s/.*\\\$sef_rewrite[[:space:]]*=[[:space:]]*['\"]*\([A-Za-z0-9]*\).*/\1/p" "$cfg" | sed -n 1p)"
  case "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" in
    1|true) return 0 ;;
    *)      return 1 ;;
  esac
}

# Give the file to the web user when we are the kind of process that can. provision.sh chowns the
# whole webroot later anyway; deploy-site.sh does not, and a root-owned .htaccess is read fine by
# Apache but cannot be repaired by any of the in-container tooling that might need to.
tracy_chown_web() {
  id -u www-data >/dev/null 2>&1 || return 0
  chown www-data:www-data "$1" 2>/dev/null || true
}

# Create the root .htaccess from Joomla's shipped htaccess.txt, but only when it is both needed and
# absent. Never overwrites: a WordPress clone's .htaccess is the customer's own, and a Joomla site
# whose owner hand-edited theirs has reasons we do not know.
tracy_provision_htaccess() {
  local webroot="$1"
  [ -d "$webroot" ] || return 0
  if [ -f "$webroot/.htaccess" ]; then
    return 0
  fi
  if [ ! -f "$webroot/htaccess.txt" ]; then
    # WordPress and anything else that does not ship one. The hardening block below still applies,
    # so an empty file is created for it to live in.
    return 0
  fi
  if ! tracy_sef_rewrite_on "$webroot"; then
    echo "==> .htaccess absent but sef_rewrite is off — no rewrite needed"
    return 0
  fi
  cp "$webroot/htaccess.txt" "$webroot/.htaccess"
  tracy_chown_web "$webroot/.htaccess"
  echo "==> provisioned .htaccess from htaccess.txt (sef_rewrite is on)"
}

# Append the deny rules, once. Kept separate from the rewrite rules above because it applies to every
# clone of every platform, including the ones that already had an .htaccess of their own.
tracy_harden_htaccess() {
  local webroot="$1" ht="$1/.htaccess"
  [ -d "$webroot" ] || return 0
  if [ -f "$ht" ] && grep -qF "$TRACY_HARDENING_MARKER" "$ht"; then
    return 0
  fi
  cat >> "$ht" <<HARDEN

$TRACY_HARDENING_MARKER
#
# See lib/webroot-htaccess.sh for the measurements behind each line. Removing this block republishes
# the customer's database dumps and their configuration backups to anyone who guesses the address.
<FilesMatch "\.(sql|sqlite|db|bak|backup|old|orig|save|swp|swo|tar|tgz|jpa|log|inc)\$">
	Require all denied
</FilesMatch>
# The same files one compression step further on. Written as its own rule because the pattern above
# anchors on the LAST extension, so it never matches dump.sql.gz.
<FilesMatch "\.(sql|tar|db|xml|json)\.(gz|bz2|zip|xz|7z)\$">
	Require all denied
</FilesMatch>
# The bare deploy repository lives beside the webroot precisely so it cannot be served, but a
# customer's own .git can still arrive inside the migrate archive, and that publishes their whole
# history including whatever was committed by mistake and removed in the next commit. 404 and not
# 403, because a 403 confirms to the person guessing that the thing is there.
RedirectMatch 404 /\.(git|svn|hg|bzr)(/|\$)
## --- end Tracy clone hardening ---
HARDEN
  tracy_chown_web "$ht"
  echo "==> hardened .htaccess (dumps, backups and VCS directories denied)"
}

# The one call sites make.
tracy_ensure_webroot_htaccess() {
  tracy_provision_htaccess "$1"
  tracy_harden_htaccess "$1"
}

# A WordPress clone runs behind a TLS-terminating proxy (Cloudflare → cloudflared → this container over
# plain HTTP), so a "force HTTPS" redirect in its .htaccess loops forever: platform/wordpress.sh
# platform_configure calls this on the clone's copy, and webroot-sync.sh on every read of the live
# site (a sync must not read the clone's neutralised pair as the customer's change).
# Comments out the `RewriteCond %{HTTPS} !=on` + `RewriteRule … https://… [R]` pair wherever it
# appears, leaving every other rule (WordPress's own front-controller rewrite included) alone.
tracy_neutralize_https_redirect() {
  local ht="$1"
  [ -f "$ht" ] || return 0
  # Matched on a lower-cased copy of each line, because Apache directive names are
  # case-insensitive and a hand-edited .htaccess need not spell them the usual way; the ORIGINAL
  # line is what gets printed. tolower() keeps this working on mawk, which has no IGNORECASE.
  awk '
    { low = tolower($0) }
    low ~ /^[[:space:]]*rewritecond[[:space:]]+%\{https\}[[:space:]]*(!=on|!on|=off|off)([[:space:]]|$)/ {
      held = $0; pending = 1; next
    }
    pending && low ~ /^[[:space:]]*rewriterule.*https?:\/\/.*\[[^]]*r[^]]*\]/ {
      print "# tracy-clone (behind a TLS proxy, this would loop): " held
      print "# tracy-clone (behind a TLS proxy, this would loop): " $0
      pending = 0; next
    }
    pending { print held; pending = 0 }
    { print }
    END { if (pending) print held }
  ' "$ht" > "$ht.tracy" && mv "$ht.tracy" "$ht"
  echo "==> neutralised any force-HTTPS redirect in the clone .htaccess"
}
