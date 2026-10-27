# WordPress-specific half of a provision. Sourced by provision.sh; see platform/README.md.

# The image supplies PHP and Apache and nothing else — the webroot is the customer's own
# WordPress, and the entrypoint is overridden so the image never installs one of its own. Which
# WordPress the site runs is therefore whatever it already ran; only PHP is ours to choose.
#
# Since Plan 3 it supplies one more thing: the agent's shell. One dsh per host execs into this
# container, so the image has to carry git, ripgrep, less, jq and wp. web/IMAGE_TAGS says which
# built image answers for this base; when there is none, the resolver says so and leaves the site
# on the upstream image below (scripts/lib/web-image.sh).
WEB_IMAGE="$(tracy_web_image wordpress "wordpress:php8.3-apache")"
DB_NAME="wordpress"
# Old WordPress and old plugins write '0000-00-00' into date columns, and strict mode rejects it
# on import. Relax the server rather than editing the customer's data on the way in.
DB_SQL_MODE="NO_ENGINE_SUBSTITUTION"
# The file whose presence means a WordPress site already lives in the webroot (provision.sh reads
# it before a quickstart restore, so a second run never unpacks over somebody else's site).
PLATFORM_CONFIG_FILE="wp-config.php"
# The receipt that says this run laid the site down, and so owes it its showcase-navigation phase.
# shellcheck source=../../lib/showcase-nav.sh
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/showcase-nav.sh"

# The directories WordPress writes to as the web user. `uploads/` is where media lands;
# `upgrade/` is the scratch space a plugin or theme install unpacks into, and an install fails
# with a bare "Could not create directory" without it. WordPress makes them on demand — but as
# whatever user PHP runs as, which on a clone whose files arrived by tar is not yet www-data.
platform_runtime_dirs() {
  echo "wp-content/uploads wp-content/upgrade"
}

# WordPress keeps its own address IN THE DATABASE — `siteurl` and `home` in the options table,
# and again inside post content, widget bodies and serialized plugin options. That is the whole
# difference from Joomla, where one line of configuration.php covers it: a WordPress copy served
# at a new address will keep linking to the old one, and half its assets will load from a site
# the customer may have already taken down.
# This installation's table prefix — ONE answer for everybody who asks.
#
# 🔒 THE TRUTH IS IN THE DATABASE, NOT IN wp-config. That file is allowed to COMPUTE the prefix
# rather than state it, and the official WordPress image does exactly that:
#
#     $table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');
#
# The old reader was a regex (`table_prefix…=…[A-Za-z0-9_]+`), so it swallowed `getenv_docker` and
# returned that very word; the query became `FROM getenv_dockeroptions`, and the URL rewrite was
# skipped in silence — the copy still booted, with EVERY link in it still pointing at the original.
#
# ⚠ FOUR READERS NEED THIS ANSWER, and each one that went without it broke the same way. Three
# places call this function; the fourth reader is served by the first call:
#
#   1. `platform_configure` — the options read AND the wp-cli container that runs `search-replace`
#      (the container was missed until 21/09; every import or restore of a fleet-born site died
#      right there, #220);
#   2. the auto-login install in `platform_install_access` (08/09);
#   3. `tracy_wp`, the shared one-shot wp-cli runner, through `WP_TABLE_PREFIX`;
#   4. the copy's own WEB container, through wp-config.php: `platform_configure` hands the same
#      answer to render_wp_config.py, which states it there as a literal. A clone's web container
#      has no `WORDPRESS_*` environment (render-compose.sh `tracy_compose_clone` — a clone carries
#      its own config), so a computed prefix fell back to `wp_` and every page of a `tr_` copy
#      redirected to its own /wp-admin/install.php, with the job green (#264).
#
# A wp-cli container started without `WORDPRESS_TABLE_PREFIX` lets `getenv_docker` fall back to
# `wp_`, and wp-cli then says so and leaves: *"Your table prefix is 'wp_'. Found installation with
# table prefix: tr_"*. Gathered into one function so the four can never answer differently.
#
# ⚠ AND IT IS NOT A RARE CASE: every WordPress site the fleet itself builds runs that image with
# `tr_`, so every import or restore of one is affected.
#
# wp-config is only the fallback, and it accepts a QUOTED STRING only — what a hand-written
# wp-config declares. The `getenv_docker(…, 'wp_')` shape deliberately does NOT match: that site
# really uses `tr_`, so reading the file's default would give a WRONG answer rather than no answer.
# It is read by render_wp_config.py's scanner (`--read-prefix`), not a grep: a grep also matched a
# commented-out `// $table_prefix = 'old_';` above the real line, and reader 4 then wrote `old_`.
#
# `wp_` is the last resort when neither answers. Harmless for a wp-cli run (it fails loudly on a
# wrong prefix), but NOT for reader 4, which writes the answer into the copy for good: so
# `platform_configure` passes `--confirmed`, which prints nothing and returns 1 instead of the
# default, and the renderer refuses a computed assignment it has no real answer for.
tracy_wp_table_prefix() {
  local config="$1" mode="${2:-}" prefix
  prefix="$( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" -N -B -e \
      "SELECT SUBSTRING(table_name, 1, CHAR_LENGTH(table_name) - 7) FROM information_schema.tables \
       WHERE table_schema='$DB_NAME' AND table_name LIKE '%options' \
       ORDER BY CHAR_LENGTH(table_name) LIMIT 1" 2>/dev/null | head -1 )" || true
  if [ -z "$prefix" ] && [ -f "$config" ]; then
    prefix="$(python3 "$HERE/render_wp_config.py" --read-prefix "$config" 2>/dev/null)" || prefix=""
  fi
  if [ -z "$prefix" ] && [ "$mode" = --confirmed ]; then
    return 1
  fi
  printf '%s\n' "${prefix:-wp_}"
}

platform_configure() {
  # The webroot is under TRACY_SITES_ROOT, not the private root: `tracy_webroot_dir` (lib/roots.sh)
  # is the only place that split is named, and it is what render-compose.sh binds to /var/www/html.
  local webroot config
  webroot="$(tracy_webroot_dir "$LABEL")"
  config="$webroot/wp-config.php"
  [ -f "$config" ] || { echo "archive carried no wp-config.php" >&2; return 1; }

  # The prefix is resolved BEFORE the file is rendered, and from the database provision.sh step 4
  # has already imported: the web container reads it out of wp-config.php (reader 4 at
  # tracy_wp_table_prefix), the options read and wp-cli below reuse this same answer, and the
  # early returns further down can no longer leave the file computing `wp_` (#264). The fallback
  # reads the SOURCE config — rendering has not touched it yet.
  #
  # The options table is not always `wp_options`. WordPress lets a site pick any table prefix at
  # install, and a security-minded install usually does — juneflower.vn runs `wpjf_`. Reading a
  # hard-coded `wp_options` there is "Table doesn't exist", which is an ERROR the client exits
  # non-zero on, which under `set -o pipefail` becomes the pipe's exit, which under `set -e` kills
  # the whole provision one line before the graceful skip below could catch it.
  #
  # `--confirmed`: an empty answer rather than the `wp_` default when the database named no options
  # table and the file states no literal. The renderer then leaves literals alone and FAILS on a
  # computed assignment instead of turning a guess into the copy's permanent prefix; only after it
  # has passed does the default stand in for the options read and wp-cli, as it always did.
  local prefix
  prefix="$(tracy_wp_table_prefix "$config" --confirmed)" || prefix=""

  echo "==> rewriting wp-config.php for this environment"
  cp "$config" "$SITE_DIR/work/wp-config.source.php"
  local original_mode
  original_mode="$(stat -c '%a' "$config" 2>/dev/null || stat -f '%Lp' "$config")"
  chmod u+w "$config"
  python3 "$HERE/render_wp_config.py" \
    --source "$SITE_DIR/work/wp-config.source.php" --out "$config" \
    --db-host db --db-user "$DB_USER" --db-password "$DB_PASSWORD" --db-name "$DB_NAME" \
    --site-url "$SITE_URL" --table-prefix "$prefix"
  chmod "$original_mode" "$config"
  prefix="${prefix:-wp_}"

  # A clone runs behind a TLS-terminating proxy (Cloudflare → cloudflared → this container over
  # plain HTTP), so any "force HTTPS" redirect the site keeps in .htaccess loops forever: the
  # container always sees http, the rule always fires, and mod_rewrite's %{HTTPS} reads the real
  # connection rather than X-Forwarded-Proto — no SetEnvIf or wp-config change can reach it. So the
  # redirect is neutralised in the CLONE's copy of .htaccess; the customer's original is untouched.
  # Every hosting panel writes its own (ONEPANEL, Really Simple SSL, hand-rolled), so the pair is
  # matched by shape — an `%{HTTPS}` off-condition and the https redirect it guards — not by name.
  # (lib/webroot-htaccess.sh, sourced by provision.sh: "Sync from live" does the same to every read
  # of the live site, so this change never reads as the customer's.)
  tracy_neutralize_https_redirect "$webroot/.htaccess"

  # Everything the address is baked into, which no config file reaches.
  #
  # `wp search-replace` and not `sed`: WordPress stores arrays as PHP-serialized strings that
  # carry the LENGTH of every string inside them, so a plain substitution of a longer or shorter
  # URL leaves the declared length wrong and the option unreadable — silently, and only for the
  # options that happened to contain a URL. search-replace unserializes, replaces, and writes
  # back. The options read and the rewrite use `$prefix`, resolved above before rendering.

  # `|| true`, so a database that is not answering yet degrades to the skip below rather than
  # ending the provision. The site still boots; only the in-database URL rewrite is missed, which
  # is the same outcome the "could not read" branch was written to accept.
  local old_url=""
  # A quickstart was packed with a placeholder address (`https://quickstart.invalid`): the pack
  # tool (`.agents/skills/tracy-wordpress-theme/scripts/quickstart/pack.mjs` → export-db.sh
  # --placeholder-url) writes it into the dump's `siteurl`/`home`, and publishes it as
  # `placeholderUrl` in the release `manifest.json` BESIDE the tar. The tar itself carries the
  # webroot and wp-config.php only, so the database is the source read here; a tar that does carry
  # a `manifest.json` at its root (a hand-packed one) is honoured first, and the file is removed so
  # build metadata is never served from the customer's root.
  if [ -n "${QUICKSTART:-}" ] && [ -f "$webroot/manifest.json" ]; then
    old_url="$(python3 -c 'import json,sys; m=json.load(open(sys.argv[1])); u=m.get("placeholderUrl"); print(u if isinstance(u,str) else "")' "$webroot/manifest.json" 2>/dev/null)" || old_url=""
    rm -f "$webroot/manifest.json"
  fi
  [ -n "$old_url" ] || old_url="$( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" \
      -N -B -e "SELECT option_value FROM ${prefix}options WHERE option_name='home' LIMIT 1" "$DB_NAME" 2>/dev/null | head -1 )" || true

  if [ -z "$old_url" ]; then
    echo "!!  could not read the site's own address from ${prefix}options — skipping the URL rewrite." >&2
    echo "!!  the copy will still boot, and will still link to wherever the original lived." >&2
    return 0
  fi
  if [ "$old_url" = "$SITE_URL" ]; then
    echo "==> address already $SITE_URL — nothing to rewrite"
    return 0
  fi

  echo "==> rewriting $old_url to $SITE_URL through the database"
  # A throwaway wp-cli container, attached to the stack's own network rather than added to its
  # compose file: this is one platform's need, and the compose file is written by the shared
  # half. The network is read off the running database container instead of guessed from the
  # project name, which compose normalises in ways that are easy to get wrong.
  local db_container network
  db_container="$( cd "$SITE_DIR" && docker compose ps -q db | sed -n 1p )"
  network="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$db_container")"

  # `--skip-columns=guid` because a post's guid is an identifier that merely looks like a URL:
  # feed readers key on it, and rewriting it makes every old post arrive as new.
  #
  # 🔒 `WORDPRESS_TABLE_PREFIX` is the SAME `$prefix` the options read above used — resolved once,
  # by `tracy_wp_table_prefix`, so the read and the rewrite can never name two different sites.
  # Without it wp-cli's wp-config computes `wp_` from `getenv_docker` and refuses the site (#220).
  docker run --rm --network "$network" --user 33:33 \
    -v "$webroot:/var/www/html" \
    -e WORDPRESS_TABLE_PREFIX="$prefix" \
    wordpress:cli-php8.3 \
    wp search-replace "$old_url" "$SITE_URL" --all-tables --skip-columns=guid --report-changed-only
}

# Installs the clone auto-login and points it at this clone's Access application.
#
# Called by provision.sh only on a clone that got an --access-aud, never on a customer's site.
# WordPress's own plugin (SEPARATE from Joomla's — the two share no code), dropped into
# wp-content/mu-plugins so it is always on and cannot be turned off from the admin. Its two
# settings — the team domain and this clone's aud — live in options, set here through the same
# throwaway wp-cli container platform_configure uses.
platform_install_access() {
  local plugin="$HERE/access/wordpress/tracy-access.php"
  if [ ! -f "$plugin" ]; then
    echo "!! access plugin missing at $plugin — skipping auto-login" >&2
    return 0
  fi

  echo "==> installing the clone auto-login plugin (WordPress)"
  # The webroot is a bind mount, so a plain copy lands inside the container. www-data (33:33) is
  # the web user; the file only needs to be readable, which a copy already is.
  local webroot mu
  webroot="$(tracy_webroot_dir "$LABEL")"
  mu="$webroot/wp-content/mu-plugins"
  mkdir -p "$mu"
  cp "$plugin" "$mu/tracy-access.php"

  local db_container network
  db_container="$( cd "$SITE_DIR" && docker compose ps -q db | sed -n 1p )"
  network="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$db_container")"

  # Options carry no secret — the aud is a public tag and the team domain is a hostname — so they
  # go in wp_options where the mu-plugin reads them. The work role is `editor`: it edits content
  # and touches no settings, the WordPress restraint that matches Joomla's Manager-not-Super-User.
  # 🔒 `WORDPRESS_TABLE_PREFIX` MUST BE PASSED IN, and without it this whole install fails. The
  # official image's wp-config reads the prefix with `getenv_docker`, so a wp-cli container without
  # that variable falls back to `wp_` — and then wp-cli says so itself and gives up:
  #
  #     Error: The site you have requested is not installed.
  #     Your table prefix is 'wp_'. Found installation with table prefix: tr_.
  #
  # Measured 08/09 on the first real import. Same root cause as the URL rewrite above — see
  # `tracy_wp_table_prefix`.
  docker run --rm --network "$network" --user 33:33 \
    -v "$webroot:/var/www/html" \
    -e WORDPRESS_TABLE_PREFIX="$(tracy_wp_table_prefix "$webroot/wp-config.php")" \
    wordpress:cli-php8.3 sh -c \
      "wp option update tracy_access_aud '$ACCESS_AUD' \
       && wp option update tracy_access_team_domain '$ACCESS_TEAM_DOMAIN' \
       && wp option update tracy_access_work_role editor" \
    || { echo '!! could not configure the auto-login' >&2; return 0; }

  echo "==> auto-login plugin installed (aud ${ACCESS_AUD})"
}

# One wp-cli run against the standing stack: the throwaway-container pattern
# platform_install_access already uses, shared here so every step speaks the same way.
#
# `WP_TABLE_PREFIX` is the prefix of THIS site: a fleet-born site is created with `tr_` and a
# quickstart reads its own out of the database (`tracy_wp_table_prefix`) before calling in.
tracy_wp() {
  local db_container network db_password webroot
  webroot="$(tracy_webroot_dir "$LABEL")"
  db_container="$( cd "$SITE_DIR" && docker compose ps -q db | sed -n 1p )"
  network="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$db_container")"
  db_password="$(sed -n 's/^DB_PASSWORD=//p' "$SITE_DIR/.env" | sed -n 1p)"
  # The official image's wp-config.php reads WORDPRESS_* env at RUNTIME (getenv with a 'mysql'
  # fallback) — a cli container without them looks for a host named mysql and dies. Same env
  # as the web service, or wp-cli is talking about a different site.
  docker run --rm --network "$network" --user 33:33 \
    -e WORDPRESS_DB_HOST=db -e WORDPRESS_DB_USER=root \
    -e WORDPRESS_DB_PASSWORD="$db_password" -e WORDPRESS_DB_NAME="$DB_NAME" \
    -e WORDPRESS_TABLE_PREFIX="${WP_TABLE_PREFIX:-tr_}" \
    -v "$webroot:/var/www/html" \
    wordpress:cli sh -c "$1"
}

# POST one `content.contract` call to the site's plugin and print its answer, then, always as the
# last line, what curl itself saw: its exit code, the HTTP status and its own error (cut to 300
# characters). An answer that is not JSON names no cause on its own: L29 (05/10/2026) was one bind
# in 265 answered EMPTY, and the log kept nothing that said why. The request is the one it always
# was; curl's error never carries the body, so the token stays out of the log.
tracy_wp_contract_post() {
  local err raw code='' said='' rc=0
  err="$(mktemp)"
  raw="$(curl -sS -m 120 -w '\n%{http_code}' -H 'content-type: application/json' \
    --data-binary "$1" "$2" 2>"$err")" || rc=$?
  # `-w` puts the status on a line of its own after the body; a curl that wrote nothing has none.
  case "$raw" in *$'\n'*) code="${raw##*$'\n'}"; raw="${raw%$'\n'*}" ;; esac
  [ -s "$err" ] && said=", $(tr '\n' ' ' < "$err" | cut -c1-300)" && said="${said% }"
  rm -f "$err"
  printf '%s\ncurl exit %s, HTTP %s%s\n' "$raw" "$rc" "${code:-none}" "$said"
}

# Bind the restored site to its content contract through the Claude Cowork plugin's own door, and read the
# binding back. Refuses — and on the pinned road so stops the provision, marker kept — when the
# profile cannot be laid over the site (the plugin does not carry it, an entity that is missing or
# resolves to two rows, a slot that cannot be read). A theme file that differs from the released
# one is a warning the plugin names, never a refusal (ADR 0022).
tracy_wp_bind_contract() {
  local contract="$1" token answer
  echo "==> binding $LABEL to $contract"
  tracy_wp "wp option update claude_cowork_contract '$contract'" >/dev/null \
    || { echo '!! could not record the contract on the site' >&2; return 1; }
  # The token tracy_wp_install_doors just collected — read once, from the site's own folder.
  token="$(tr -d '\r\n ' < "$SITE_DIR/tracy-agent.token" 2>/dev/null)"
  [ -n "$token" ] || { echo '!! no plugin token — cannot bind' >&2; return 1; }
  local url
  url="http://$(tracy_web_dns_name "$LABEL")/wp-admin/admin-ajax.php?action=claude_cowork"
  [ -n "${HOST_PORT:-}" ] && ! curl -sf -m 3 -o /dev/null "http://$(tracy_web_dns_name "$LABEL")/" \
    && url="http://127.0.0.1:${HOST_PORT}/wp-admin/admin-ajax.php?action=claude_cowork"
  answer="$(tracy_wp_contract_post \
    "{\"token\":\"$token\",\"action\":\"content.contract\",\"params\":{\"operation\":\"bind\",\"contract\":\"$contract\"}}" "$url")"
  python3 - "${answer%$'\n'*}" "$contract" "${answer##*$'\n'}" <<'PY' || return 1
import json, sys
try:
    a = json.loads(sys.argv[1])
except Exception:
    print('!! the Claude Cowork plugin did not answer the bind with JSON (%s): %s' % (sys.argv[3], sys.argv[1][:300]), file=sys.stderr); sys.exit(1)
# A provision that runs again on a bound site (the second pass of the same label) finds the
# binding already there: the Claude Cowork plugin says so with `conflict`, and the inspect below is the proof.
already = (not a.get('ok')) and 'already bound to ' + sys.argv[2] in str(a.get('message') or '')
if already:
    print('    already bound to %s' % sys.argv[2])
elif not a.get('ok') or not a.get('bound'):
    print('!! bind refused: ' + str(a.get('message') or a.get('error') or a)[:600], file=sys.stderr); sys.exit(1)
else:
    print('    bound to %s (revision %s)' % (a.get('contract'), str(a.get('revision', ''))[:12]))
PY
  answer="$(tracy_wp_contract_post \
    "{\"token\":\"$token\",\"action\":\"content.contract\",\"params\":{\"operation\":\"inspect\"}}" "$url")"
  local said
  said="$(tracy_wp_inspect_confirms "$answer" "$contract")" || {
    echo "!! inspect after bind: $said" >&2
    return 1
  }
  echo "    inspect: bound, $said entities"
}

# Take the quickstart's TEMPLATE SHOWCASE out of a freshly bound site's menus through the plugin's
# `showcaseNav` operations, then read it back with `showcaseNav.status` and an inspect — the same
# phase, rules and words as `tracy_showcase_phase` in joomla-bootstrap.php:
#   - one request id for the whole phase, from the site's receipt (`lib/showcase-nav.sh`), so a call
#     whose answer was lost (no answer, no JSON, a status that is not 2xx) is asked again with the
#     SAME id and the plugin resumes or replays instead of hiding anything twice;
#   - `apply` answers `running` until `completed`; an `ok` that is not exactly true is a refusal,
#     every `running` must leave less to do than the one before, and the calls are bounded;
#   - `unsupported` (no checked map for this design), or the refusal a plugin released before the
#     phase gives every unknown operation, is a coverage state: skipped, said, and the provision goes on.
# No receipt: not a site this run laid down, so nothing is called. The token is never printed.
#
# 🔒 THE PHASE IS COSMETIC, SO IT NEVER STOPS A SITE BEING CREATED (product rule). Hiding the showcase
# only tidies the menus; the site works the same with it shown. So:
#   - a phase that cannot run (no plugin token) and never started is said with `!!` and skipped;
#   - a phase that fails once started — a refusal, a stall, lost answers, too many calls, a status or
#     an inspect that does not confirm it — may have left the menus half-edited. What it applied is
#     taken back once with `showcaseNav.revert` (best effort, same door and token), the contract is
#     inspected again, and the failure is said in ONE `!!` line: the reason, and either "reverted" or
#     "the revert did not complete — the menus may be partly hidden". That inspect confirming →
#     settled as failed, provision goes on, whether or not the revert finished;
#   - a revert the plugin refuses because nothing is left to bring back (no showcase-nav record and
#     no receipts of an earlier revert: the apply hid nothing, or another revert already put it all
#     back) is not an unfinished revert: the `!!` line says nothing was left applied and the menus
#     are as they were. Everything else about the failure is the same;
#   - an apply refused on its FIRST call (no answer before it, lost or `running`) wrote nothing: a
#     refused call commits no batch. There is nothing to revert, so no revert is asked; the contract
#     is inspected the same way, and the ONE `!!` line names the plugin's reason and says nothing was
#     written and the showcase stays in the menus. Settled as failed;
#   - a phase an earlier pass started and did not finish (`showcase-nav.started`) is not applied
#     again: that pass may have died anywhere in it, so this pass runs the same recovery — one revert,
#     the inspect, settled as failed. With no token to revert through, it is settled as failed by
#     `tracy_showcase_unfinished` (lib/showcase-nav.sh), never as skipped;
#   - only an inspect that no longer confirms the contract after all that stops the provision (status
#     1, receipt kept): that is a broken contract binding, fatal exactly as an inspect after the bind is.
# Usage: tracy_wp_showcase_nav CONTRACT — the contract the site was just bound to; every inspect
# must confirm that one. The bind and the inspect before the phase are `tracy_wp_bind_contract`'s and stay fatal.
tracy_wp_showcase_nav() {
  local contract="$1" request owed=0 token url verdict status=0 reason='' state said untouched=''
  # The mark decides, not the receipt: a started phase with no request id to revert it with is
  # settled as failed here, whether its receipt is missing or holds no request id.
  ! tracy_showcase_stranded || return 0
  request="$(tracy_showcase_request)" || owed=$?
  case "$owed" in
    1) tracy_showcase_not_new; return 0 ;;
    0) ;;
    # A receipt that holds no request id is said and kept for a person (`tracy_showcase_request`); the
    # phase cannot run without its id, and a cosmetic phase never stops the provision.
    *) return 0 ;;
  esac
  token="$(tr -d '\r\n ' < "$SITE_DIR/tracy-agent.token" 2>/dev/null)"
  if [ -z "$token" ]; then
    if tracy_showcase_started; then
      tracy_showcase_unfinished 'no plugin token'
      return 0
    fi
    echo '!! showcase navigation: no plugin token, so the phase cannot run — the site is handed over with its template showcase in the menus' >&2
    tracy_showcase_settle 'skipped — no plugin token'
    return 0
  fi
  url="http://$(tracy_web_dns_name "$LABEL")/wp-admin/admin-ajax.php?action=claude_cowork"
  [ -n "${HOST_PORT:-}" ] && ! curl -sf -m 3 -o /dev/null "http://$(tracy_web_dns_name "$LABEL")/" \
    && url="http://127.0.0.1:${HOST_PORT}/wp-admin/admin-ajax.php?action=claude_cowork"
  if tracy_showcase_started; then
    echo '==> taking back the template showcase phase an earlier pass started and did not finish'
    reason='started on an earlier pass and not finished'
  else
    echo '==> taking the template showcase out of the site menus'
    if ! tracy_showcase_start; then
      tracy_showcase_settle 'skipped — the phase could not be marked as started'
      return 0
    fi
    tracy_wp_showcase_job apply "$request" "$token" "$url" || status=$?
    case "$status" in
      3) tracy_showcase_settle "skipped — $TRACY_WP_SHOWCASE_WHY"; return 0 ;;
      0)
        # Read back, not trusted: the job must say complete, and the binding must still inspect as bound.
        verdict="$(tracy_wp_showcase_status "$token" "$url")" || status=$?
        if [ "$status" = 4 ]; then
          # Every owner was left as it was: nothing was hidden, so it is a failure, not "applied".
          reason="$verdict"
        elif [ "$status" != 0 ]; then
          reason="status after apply did not confirm it: $verdict"
        elif ! reason="$(tracy_wp_showcase_inspect "$token" "$url" "$contract")"; then
          reason="inspect after showcase navigation: $reason"
        else
          tracy_showcase_settle "$verdict"
          return 0
        fi ;;
      # Refused on its first call: no batch was committed, so there is nothing to revert.
      5) reason="$TRACY_WP_SHOWCASE_WHY"; untouched=1 ;;
      *) reason="$TRACY_WP_SHOWCASE_WHY" ;;
    esac
  fi
  state="failed — $reason"
  if [ -n "$untouched" ]; then
    echo "!! showcase navigation: $reason; nothing was written, the template showcase stays in the menus" >&2
    state="$state; nothing was written, the template showcase stays in the menus"
  elif tracy_wp_showcase_job revert "$request" "$token" "$url"; then
    echo "!! showcase navigation: $reason; what it applied was reverted" >&2
    state="$state; what it applied was reverted"
  elif [ "$?" = 4 ]; then
    echo "!! showcase navigation: $reason; nothing was left applied to revert, the menus are as they were" >&2
    state="$state; nothing was left applied to revert, the menus are as they were"
  else
    echo "!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; $reason; revert: $TRACY_WP_SHOWCASE_WHY" >&2
    state="$state; the revert did not finish ($TRACY_WP_SHOWCASE_WHY)"
  fi
  said="$(tracy_wp_showcase_inspect "$token" "$url" "$contract")" || {
    echo "!! inspect after the failed showcase navigation and its revert: $said — the contract binding is broken; showcase-nav.request is kept" >&2
    return 1
  }
  tracy_showcase_settle "$state"
}

# Usage: tracy_wp_showcase_job apply|revert REQUEST TOKEN URL. Drives one `showcaseNav` job to its end,
# one committed batch per call: 0 done, 3 skipped (apply only), 5 an apply refused (`ok: false`) on
# its first call, so nothing was written, 4 a revert refused because the plugin records nothing
# hidden to bring back, 1 failed otherwise; the reason of a skip or a failure is
# left in TRACY_WP_SHOWCASE_WHY. A revert is its own request (`REQUEST.rv`, apply id
# `snav-revert-REQUEST`), so a revert retried after a lost answer is answered again, not run twice.
tracy_wp_showcase_job() {
  local op="$1" request="$2" token="$3" url="$4" apply answer verdict calls=0 lost=0 left='' moved=moved what=''
  apply="snav-$request"
  [ "$op" = apply ] || { apply="snav-revert-$request"; request="$request.rv"; moved='put back'; what='revert '; }
  TRACY_WP_SHOWCASE_WHY=''
  while :; do
    calls=$((calls + 1))
    if [ "$calls" -gt 50 ]; then
      TRACY_WP_SHOWCASE_WHY="${what}did not complete within 50 calls"
      return 1
    fi
    answer="$(tracy_wp_contract_post \
      "{\"token\":\"$token\",\"action\":\"content.contract\",\"params\":{\"operation\":\"showcaseNav.$op\",\"apply_id\":\"$apply\",\"request_id\":\"$request\"}}" "$url")"
    verdict="$(python3 - "${answer%$'\n'*}" "${answer##*$'\n'}" "$left" "$op" <<'PY'
import json, re, sys
body, transport, left, op = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
m = re.search(r'HTTP (\d+)', transport)
status = int(m.group(1)) if m else 0
done = 'completed' if op == 'apply' else 'reverted'
prefix = '' if op == 'apply' else 'revert '
def fail(what, a):
    said = {k: a[k] for k in ('ok', 'error', 'message', 'status', 'remaining') if k in a}
    detail = json.dumps(said, ensure_ascii=False) if said else 'no answer (%s)' % transport
    print(('fail:%s%s: %s' % (prefix, what, detail))[:600].replace('\n', ' '))
    sys.exit(0)
try:
    a = json.loads(body)
except Exception:
    a = None
if not 200 <= status < 300 or not isinstance(a, dict) or not a:
    print('lost:%s' % (status or 'no status'))
    sys.exit(0)
if op == 'apply' and a.get('ok') is False and a.get('error') == 'unsupported':
    print('skip:unsupported: %s' % str(a.get('message') or '')[:300].replace('\n', ' '))
    sys.exit(0)
if op == 'apply' and a.get('ok') is False and a.get('error') == 'bad_params' and a.get('message') == 'unknown contract operation: showcaseNav.apply':
    print('skip:unsupported: the installed Claude Cowork plugin predates showcase navigation')
    sys.exit(0)
# The one answer the plugin gives when it has no showcase-nav record and no receipts of an earlier
# revert: nothing any apply hid is still recorded as hidden, so the menus are as they were. Matched
# on the code AND the exact message, since contract_failed alone also carries other refusals.
if op == 'revert' and a.get('ok') is False and a.get('error') == 'contract_failed' \
        and a.get('message') == 'This site has no showcase navigation entries to bring back':
    print('none:revert refused: nothing left to bring back')
    sys.exit(0)
remaining = a.get('remaining')
if op == 'apply' and a.get('ok') is False and left == '':
    # The first answer of this apply is a refusal: a refused call commits no batch.
    fail('untouched:refused', a)
if a.get('ok') is not True or type(remaining) is not int or remaining < 0:
    fail('refused', a)
if a.get('status') == done and remaining == 0:
    print('done')
    sys.exit(0)
if a.get('status') != 'running' or remaining == 0 or (left != '' and remaining >= int(left)):
    fail('made no progress', a)
moved = a.get('moved')
print('next:%d:%d' % (remaining, moved if type(moved) is int else 0))
PY
)" || verdict=''
    case "$verdict" in
      lost:*)
        lost=$((lost + 1))
        if [ "$lost" -ge 3 ]; then
          TRACY_WP_SHOWCASE_WHY="${what}lost its answer $lost times in a row (${answer##*$'\n'})"
          return 1
        fi
        echo "    showcase navigation: no answer (${verdict#lost:}), asking again with the same request" ;;
      skip:*) TRACY_WP_SHOWCASE_WHY="${verdict#skip:}"; return 3 ;;
      none:*) TRACY_WP_SHOWCASE_WHY="${verdict#none:}"; return 4 ;;
      done) return 0 ;;
      next:*)
        lost=0
        verdict="${verdict#next:}"
        left="${verdict%%:*}"
        echo "    showcase navigation: ${verdict#*:} $moved, $left left" ;;
      # Only a refusal with no call before it, answered or lost, wrote nothing.
      fail:untouched:*)
        TRACY_WP_SHOWCASE_WHY="${verdict#fail:untouched:}"
        [ "$calls" = 1 ] && return 5
        return 1 ;;
      fail:*) TRACY_WP_SHOWCASE_WHY="${verdict#fail:}"; return 1 ;;
      *) TRACY_WP_SHOWCASE_WHY="${what}answer could not be read"; return 1 ;;
    esac
  done
}

# Prints the coverage state a finished apply reached, read back from `showcaseNav.status`; status 1,
# with what the plugin said printed instead, when it does not confirm the job complete.
#
# The plugin answers `skipped` as an object keyed by owner (`showcaseNavSkipped()`: owner → why), and
# `owners` as the number of owners the map changes; a list is still read, for any older answer. An
# entry whose why starts `kept` was kept on purpose (the rule `tracy_showcase_verdict` holds for a
# Joomla mega-menu): not a conflict, and alone it proves nothing was hidden. An entry whose why says
# `already` is an owner already as the map leaves it; every other entry is an owner left as it was (a
# conflict: edited, gone, raced), and nothing was hidden for it. So, as `tracy_showcase_verdict` reads
# the same answer:
#   - some owners left as they were → "applied, N of M owners left as they were (conflict: …)";
#   - EVERY owner in `skipped`, none `already`, each a conflict or kept, at least one a conflict →
#     nothing was hidden: status 4, with that said instead, and the phase settles as failed with one
#     `!!` line (`tracy_wp_showcase_nav`) — never a plain "applied".
tracy_wp_showcase_status() {
  local answer
  answer="$(tracy_wp_contract_post \
    "{\"token\":\"$1\",\"action\":\"content.contract\",\"params\":{\"operation\":\"showcaseNav.status\"}}" "$2")"
  python3 - "${answer%$'\n'*}" "${answer##*$'\n'}" <<'PY'
import json, re, sys

def showcase_verdict(a):
    skipped = a.get('skipped')
    if isinstance(skipped, dict):
        entries = [(str(k), v) for k, v in skipped.items()]
    elif isinstance(skipped, list):
        entries = [(str(v.get('key', n)) if isinstance(v, dict) else str(n), v) for n, v in enumerate(skipped)]
    else:
        entries = []
    def why(v):
        return str(v.get('why', '') if isinstance(v, dict) else v)
    kept = [(k, why(v)) for k, v in entries if re.match(r'kept\b', why(v))]
    left = [(k, why(v)) for k, v in entries if not re.match(r'kept\b', why(v)) and not re.search(r'\balready\b', why(v))]
    already = len(entries) - len(left) - len(kept)
    owners = a.get('owners')
    owners = owners if type(owners) is int and owners >= len(entries) else None
    named = '; '.join('%s: %s' % (k, w) if w else k for k, w in left)[:300].replace('\n', ' ')
    if left and owners is not None and not already and len(left) + len(kept) == owners:
        print('nothing was hidden — all %d owners the map changes were left as they were (conflict: %s)%s' % (owners, named,
            '; %d mega-menu styles kept with them (%s)' % (len(kept), '; '.join('%s: %s' % (k, w) for k, w in kept)[:300].replace('\n', ' ')) if kept else ''))
        return 4
    said = []
    if left:
        said.append('%d%s owners left as they were (conflict: %s)' % (len(left), ' of %d' % owners if owners is not None else '', named))
    if kept:
        said.append('%d kept on purpose (%s)' % (len(kept), '; '.join('%s: %s' % (k, w) for k, w in kept)[:300].replace('\n', ' ')))
    if already:
        said.append('%d already as the map leaves them' % already)
    print('applied' + (', ' + '; '.join(said) if said else ''))
    return 0

try:
    a = json.loads(sys.argv[1])
except Exception:
    a = None
if not isinstance(a, dict) or a.get('ok') is not True or a.get('status') != 'complete' or a.get('remaining') != 0:
    said = {k: a[k] for k in ('ok', 'error', 'message', 'status', 'remaining') if k in a} if isinstance(a, dict) else {}
    print((json.dumps(said, ensure_ascii=False) if said else 'no answer (%s)' % sys.argv[2])[:600])
    sys.exit(1)
sys.exit(showcase_verdict(a))
PY
}

# Usage: tracy_wp_inspect_confirms ANSWER CONTRACT, where ANSWER is what `tracy_wp_contract_post`
# printed for an inspect. Status 0 only when the plugin confirms THIS contract is bound: a 2xx answer,
# `ok` exactly true, `contract` exactly CONTRACT and `bound` exactly true (a `"true"` string, a `1` or
# an answer bound to another contract is not a confirmation) — the rule `tracy_inspect_confirms` holds
# on Joomla. Otherwise status 1, with what the plugin said printed on one line. Prints the number of
# entities on success.
tracy_wp_inspect_confirms() {
  python3 - "${1%$'\n'*}" "${1##*$'\n'}" "$2" <<'PY'
import json, re, sys
body, seen, contract = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    a = json.loads(body)
except Exception:
    print(('no JSON answer (%s): %s' % (seen, body[:300])).replace('\n', ' ')); sys.exit(1)
status = re.search(r'HTTP (\d{3})', seen)
if not status or not 200 <= int(status.group(1)) < 300:
    said = a.get('message') if isinstance(a, dict) else None
    print(('not a 2xx answer (%s)%s' % (seen, ': ' + str(said) if said else ''))[:600].replace('\n', ' ')); sys.exit(1)
if not isinstance(a, dict) or a.get('ok') is not True or a.get('bound') is not True:
    print((str(a.get('message') or a) if isinstance(a, dict) else str(a))[:600].replace('\n', ' ')); sys.exit(1)
if not contract or a.get('contract') != contract:
    print(('bound to %r, not %r' % (a.get('contract'), contract))[:600]); sys.exit(1)
print(len(a.get('entities') or []) if isinstance(a.get('entities'), list) else 0)
PY
}

# Usage: tracy_wp_showcase_inspect TOKEN URL CONTRACT. Status 0 when the site still inspects as bound
# to CONTRACT (`tracy_wp_inspect_confirms`); status 1, with what the plugin said printed.
tracy_wp_showcase_inspect() {
  local answer
  answer="$(tracy_wp_contract_post \
    "{\"token\":\"$1\",\"action\":\"content.contract\",\"params\":{\"operation\":\"inspect\"}}" "$2")"
  local said
  said="$(tracy_wp_inspect_confirms "$answer" "$3")" || { printf '%s\n' "$said"; return 1; }
}

# The same binding for a release that pins NO Claude Cowork plugin: the latest plugin above the floor
# carries the released profiles too, so the site is bound like a pinned one — the road Joomla has
# always taken. `$2` is the marker: once the site is bound it names the installed plugin
# (`coworkContractVersion`), which is what tells the agent's tools and the build's check stage to
# take the contract road (`contractDoorOf`, `sealOf`). A marker that said "record road" over a
# bound site would send the agent to a door the site no longer opens.
#
# 🔒 NEVER FAILS THE PROVISION OVER THE BIND (a site it did bind whose contract no longer inspects as
# bound after the showcase phase is another matter, below). Until 04/10/2026 this road did not bind at all, and every site it
# built was handed over sealed by the host fence only. A bind this road cannot make — a plugin
# that lacks the profile, a row the profile names twice, no answer — leaves exactly that site:
# the contract setting is taken back, the marker keeps saying "record road", and it is said.
tracy_wp_bind_latest() {
  local contract="$1" marker="$2" version
  # The reader, once, whichever way the bind goes — after it, so a bound site's reader reads the
  # profile it was just bound to. Never fatal, as on every road that has no pinned plugin.
  local reader_said='!! content reader: not enabled — content.locate answers "Content identity is not set up" on this site until tracy-host tries again at its next start'
  if ! tracy_wp_bind_contract "$contract"; then
    tracy_wp "wp option delete claude_cowork_contract" >/dev/null 2>&1 || true
    # Not bound, so no contract to revert through: a showcase phase an earlier pass started and did not
    # finish is settled as failed, never as skipped (`tracy_showcase_skip`), and a receipt that holds
    # no request id is kept for a person.
    tracy_showcase_skip "not bound to $contract, so its showcase map cannot be applied" || return 1
    echo "!! $LABEL was not bound to $contract — handed over sealed by the host fence only, as before" >&2
    tracy_wp_content_identity || echo "$reader_said" >&2
    return 0
  fi
  # The version `tracy_wp_install_doors` just installed. The floor when it named none: the field
  # must name a version once the site is bound, and the floor is the lowest one the bind could
  # have been made with.
  version="${TRACY_WP_COWORK_INSTALLED:-}"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]] || version="$COWORK_MIN_VERSION"
  printf '{"contract":"%s","platform":"wordpress","quickstart":"%s","coworkMinVersion":"%s","coworkContractVersion":"%s","policy":1}\n' \
    "$contract" "$QUICKSTART" "$COWORK_MIN_VERSION" "$version" > "$marker"
  chmod 644 "$marker"
  echo "    marker names Claude Cowork $version"
  # The fallback above is for a plugin that cannot bind. A showcase phase that fails never stops the
  # provision; only a contract that no longer inspects as bound after it does (`tracy_wp_showcase_nav`).
  tracy_wp_showcase_nav "$contract" || {
    echo "!! $LABEL is bound to $contract, but the binding no longer inspects as bound after its template showcase phase" >&2
    return 1
  }
  tracy_wp_content_identity || echo "$reader_said" >&2
}

# POST one JSON body to the site's own Claude Cowork plugin and print its answer. The web container's
# network name first, `127.0.0.1:$HOST_PORT` when that name does not answer (why both: `site_answers`).
tracy_wp_post_ajax() {
  local url
  url="http://$(tracy_web_dns_name "$LABEL")/wp-admin/admin-ajax.php?action=claude_cowork"
  [ -n "${HOST_PORT:-}" ] && ! curl -sf -m 3 -o /dev/null "http://$(tracy_web_dns_name "$LABEL")/" \
    && url="http://127.0.0.1:${HOST_PORT}/wp-admin/admin-ajax.php?action=claude_cowork"
  curl -s -m 300 -H 'content-type: application/json' --data-binary "$1" "$url"
}

# Content API (`/content.json`): opt the freshly bound site in through the Claude Cowork plugin's own door —
# its content seed and a uid per row (`content.identity`). A NEW site, so `newSite` with a request
# id this label keeps across a retried provision: a retry never rotates the seed twice. A Claude Cowork plugin
# that predates the reader answers "unknown action": said and skipped, not a failure.
# `$1`, when given, is the plugin token to use instead of the one `tracy_wp_install_doors` collected
# into the site's private folder — an import reads it from the copy and keeps no file (below).
# Enabled, the site gets `content-identity.done` beside its token — the marker the Joomla road writes
# too, and the one tracy-host's start-up pass (apps/tracy-host/src/content-identity.js) reads to leave
# the site alone. Not written on a skip, so that pass picks the site up once its plugin has a reader.
tracy_wp_content_identity() {
  local token="${1:-}" answer
  [ -n "$token" ] || token="$(tr -d '\r\n ' < "$SITE_DIR/tracy-agent.token" 2>/dev/null)"
  [ -n "$token" ] || { echo '!! no plugin token — cannot enable the content reader' >&2; return 1; }
  echo '==> enabling the content reader'
  answer="$(tracy_wp_post_ajax \
    "{\"token\":\"$token\",\"action\":\"content.identity\",\"params\":{\"newSite\":true,\"requestId\":\"provision-$LABEL\"}}")"
  python3 - "$answer" "$SITE_DIR/content-identity.done" <<'PY'
import json, sys
try:
    a = json.loads(sys.argv[1])
except Exception:
    print('!! the Claude Cowork plugin did not answer content.identity with JSON: ' + sys.argv[1][:300], file=sys.stderr); sys.exit(1)
if not a.get('ok') and 'unknown action' in str(a.get('message') or a.get('error') or '').lower():
    print('    content reader: this Claude Cowork plugin has none — skipped'); sys.exit(0)
if not a.get('ok'):
    print('!! content reader could not be enabled: ' + str(a.get('message') or a.get('error'))[:300], file=sys.stderr); sys.exit(1)
i = a.get('identity') or {}
alias = a.get('alias') or {}
# Which seed the site holds after this pass: a replayed request id is the proof a retry changed nothing.
seed = 'seed kept (request replayed)' if i.get('replayed') else 'new seed' if (i.get('rotated') or i.get('site')) else 'seed kept'
print('    content reader: enabled (%s rows, %s, %s minted, alias %s%s)' % (i.get('total'), seed, i.get('minted'), alias.get('path'), '' if alias.get('available') else ' UNAVAILABLE: ' + str(alias.get('collision'))))
# A marker that cannot be written costs one harmless `newSite: false` pass at the next start, never
# the provision.
try:
    open(sys.argv[2], 'a').close()
except OSError as e:
    print('!! content reader enabled, but its marker was not written: %s' % e, file=sys.stderr)
PY
}

# Bind an imported copy to a contract DERIVED from its own rows (`content.contract` operation `derive`,
# tasks/todo-import-site-contract.md): the plugin reads the copy's rows through its codecs, calibrates
# them against the rendered pages, and the Edit picker then resolves a click to a slot the agent can
# write and revert. Same request id discipline as identity: the label's, so a retried pass replays.
# Never fails the import: without it the copy works, the picker just resolves by text. A plugin older
# than the operation answers `bad_action` or `bad_params` "unknown contract operation" — said, skipped.
tracy_wp_derive_contract() {
  local token="$1" body answer
  echo '==> deriving the content contract'
  body="$(TOKEN="$token" LABEL="$LABEL" python3 -c 'import json,os;print(json.dumps({"token":os.environ["TOKEN"],"action":"content.contract","params":{"operation":"derive","label":os.environ["LABEL"],"requestId":"provision-"+os.environ["LABEL"]}}))')"
  answer="$(tracy_wp_post_ajax "$body")" || answer=""  # no answer at all is judged below, never fatal
  ANSWER="$answer" python3 - <<'PY' || echo '!! derived contract: not bound — the Edit picker resolves by text only on this copy' >&2
import json, os, sys
try:
    a = json.loads(os.environ.get("ANSWER") or "")
except Exception:
    print('!! derive: the Claude Cowork plugin did not answer with JSON: ' + (os.environ.get("ANSWER") or '')[:300], file=sys.stderr); sys.exit(1)
if not isinstance(a, dict):
    sys.exit(1)
said = str(a.get('message') or a.get('error') or '')
if not a.get('ok'):
    old = a.get('error') == 'bad_action' or 'unknown contract operation' in said.lower()
    print('!! derive: %s: %s' % ('this Claude Cowork plugin cannot derive' if old else 'refused', said[:300]), file=sys.stderr)
    sys.exit(1)
if not a.get('contract'):
    print('!! derive: the answer named no contract', file=sys.stderr); sys.exit(1)
print('    derived contract: %d entities, %d slots, %s%s' % (int(a.get('entities') or 0), int(a.get('slots') or 0),
      'calibrated' if a.get('calibrated') else 'not calibrated', ' (request replayed)' if a.get('replayed') else ''))
PY
  return 0
}

# AcyMailing (the newsletter plugin `quickstart/ja-kinetic/wp7` ships) keeps three secrets in its own
# configuration table: `api_key` authenticates its REST calls, `security_key` lets a subscribe URL
# skip the captcha, `cron_key` guards its cron URL. The plugin writes them once, at activation
# (`back/Helpers/Update/Configuration.php`), and never again — so a restored archive carries the
# BUILD's keys, and every site restored from one release would share them. Each restored site gets
# three of its own here, in AcyMailing's own shape (`acym_generateKey(30)`: 30 of [0-9a-zA-Z]); the
# table holds them and nothing else does (measured on the Kinetic 1.0.0 package: one hit each).
# No such table — most archives carry no AcyMailing — is nothing to do. A table that cannot be
# rewritten stops the provision: a site is not handed over holding another site's secrets.
tracy_wp_acym_keys() {
  local table="${1}acym_configuration" found key rows=""
  found="$( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" -N -B -e \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='$table'" )" \
    || { echo "!! could not ask the database whether $table exists" >&2; return 1; }
  [ "$found" = 1 ] || return 0
  for key in api_key cron_key security_key; do
    rows="$rows${rows:+, }('$key', '$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | { head -c 30; cat >/dev/null; })')"
  done
  ( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" "$DB_NAME" -e \
      "REPLACE INTO \`$table\` (name, value) VALUES $rows" ) \
    || { echo "!! could not write this site's own AcyMailing keys into $table" >&2; return 1; }
  echo "==> AcyMailing: this site's own api, cron and security keys written"
}

# "Is the site's own web container answering yet?" — asked BOTH ways, because this process sits
# in a different network namespace on a fleet host than it does on a dev Mac and neither answer
# is reachable from the other side.
#
# 🔒 ON THE FLEET this process runs host-networked, so a site's published `127.0.0.1:<port>` is
# right there and Docker's embedded DNS is NOT — the web container's docker-network name does not
# resolve from the host namespace. ON A DEV MAC `deploy/compose.macos.yml` moves this process onto
# the compose bridge (host mode on Docker Desktop means the LINUX VM's namespace, which is nobody's),
# and then the two swap: the docker-network name resolves over the `tracy` network every site
# container joins, while `127.0.0.1:<port>` is this container's OWN loopback and answers nothing,
# forever. That is exactly the trade `siteTarget()` (`apps/tracy-web/src/sites/resolver.js`) already
# writes down for its own two branches.
#
# 🔒 THE NAME TO DIAL IS `tracy_web_dns_name`, NOT the raw `<label>-web-1`. render-compose.sh (sourced
# by provision.sh before this file) settles it: a short label dials `<label>-web-1`, but a long label
# would overflow the 63-octet DNS-label cap and fail ENOTFOUND, so it dials the bounded
# `tracy-web-<hash>` alias render-compose.sh put on the `tracy` network — the same choice `webDnsName`
# makes on the web side (issue #165).
#
# Trying both is not indecision — it is the one probe that means the same thing in both places,
# and it needs no `if macOS` anywhere, which is the thing that would rot.
site_answers() {
  curl -sf -m 3 -o /dev/null "http://$(tracy_web_dns_name "$LABEL")/" && return 0
  [ -n "${HOST_PORT:-}" ] && curl -sf -m 3 -o /dev/null "http://127.0.0.1:${HOST_PORT}/" && return 0
  return 1
}

# The four things every Tracy-run WordPress site gets after its core is in place, whichever road
# it came in on — a fresh install or a quickstart restore:
#
#   1. the write door (ADR 0080): the cowork plugin, installed by the SITE (wp-cli hands WordPress
#      the URL and it downloads the zip itself). Version from the same release manifest the Desk
#      reads — see `lib/cowork-extension.sh`. `$1` is a FLOOR, not the version to install.
#      🔒 It was `git ls-remote --tags` filtered by `wordpress-v0.6.*` until 2026-08-29, and that
#      glob cannot match `0.8.x` — so a site born here installed 0.6.3 while the Desk installed
#      0.8.0, and nothing anywhere said the two disagreed. Measured on a real fleet-born site.
#   2. the key: the plugin minted its token on activation (claude_cowork_seed_token). Collected into
#      the same file, mode and contract the fleet's agent-token door already serves for EmDash and
#      Joomla — no relay change for a new platform.
#   3. the people door (ADR 0085): the same mu-plugin the clones carry, reading x-tracy-email from
#      the fleet-bar Worker; owner/admin seats sign in as administrator on a site that IS theirs.
#      No Access aud on a fleet-born site — the Worker is the only gate.
#   4. the content reader (`content.identity`), except on the sealed road that binds first — see the
#      step itself.
#
# ONE function on purpose: the quickstart path used to be a clone, which runs none of these, and a
# restored site stood with no write door and no way in — silently, since a clone is not supposed
# to have them (tasks/todo-wordpress-theme-skill.md §G).
# The token the Claude Cowork plugin minted on activation, read out of the site's own options — the one
# place it is read, for the doors below and for an import's content reader.
tracy_wp_cowork_token() {
  tracy_wp "wp option get claude_cowork_token" 2>/dev/null | tr -d '\r\n '
}

tracy_wp_install_doors() {
  local floor="${1:-0.8.0}" pinned="${2:-}" reader="${3:-}" webroot
  webroot="$(tracy_webroot_dir "$LABEL")"

  if [ -n "$pinned" ]; then
    # 🔒 A SEALED QUICKSTART INSTALLS THE CLAUDE COWORK PLUGIN ITS RELEASE PINS, never "the latest": the
    # profile the site is bound to ships INSIDE that zip (`lib/contracts/<id>/`), hash for hash
    # with this repository, and a newer plugin may carry a different profile. The zip was already
    # checked against the release's sha256 by quickstart.py; it is copied into the webroot only
    # because wp-cli runs in a container that sees nothing else.
    # World-readable on purpose: `mktemp` hands out 0600 and wp-cli runs as www-data (33:33) in its
    # own container — measured on the dev machine 25/09/2026: "PCLZIP_ERR_READ_OPEN_FAIL (-2)",
    # "No plugins installed", provision failed. Docker Desktop on a Mac hid this (shared files read as 0644).
    install -m 0644 "$pinned" "$webroot/tracy-cowork.zip"
    echo "==> installing the pinned Claude Cowork plugin (floor ${floor})"
    tracy_wp "wp plugin install /var/www/html/tracy-cowork.zip --activate --force" \
      || { rm -f "$webroot/tracy-cowork.zip"; echo '!! the pinned Claude Cowork plugin did not install' >&2; return 1; }
    rm -f "$webroot/tracy-cowork.zip"
  else
    local cowork_version cowork_url
    . "$HERE/../lib/cowork-extension.sh"
    read -r cowork_version cowork_url <<<"$(cowork_latest wordpress "$floor")"
    if [ -n "$cowork_version" ]; then
      echo "==> installing cowork ${cowork_version} (floor ${floor})"
      # The version this run installed, for `tracy_wp_bind_latest`'s marker — kept here because
      # asking wp-cli for it afterwards is one more container start on the provision's path.
      TRACY_WP_COWORK_INSTALLED=''
      if tracy_wp "wp plugin install '$cowork_url' --activate"; then
        TRACY_WP_COWORK_INSTALLED="$cowork_version"
      else
        echo '!! cowork did not install — the site stands without its write door' >&2
      fi
    else
      echo '!! could not resolve a cowork release — the site stands without its write door' >&2
    fi
  fi

  echo "==> reading the plugin token"
  local token
  token="$(tracy_wp_cowork_token)"
  if [ -n "$token" ]; then
    printf '%s\n' "$token" > "$SITE_DIR/tracy-agent.token"
    chmod 600 "$SITE_DIR/tracy-agent.token"
    echo "    agent token ready"
  else
    echo '!! no plugin token to collect — the Desk connect step will report no_token' >&2
  fi

  local access_plugin="$HERE/access/wordpress/tracy-access.php"
  if [ -f "$access_plugin" ]; then
    mkdir -p "$webroot/wp-content/mu-plugins"
    cp "$access_plugin" "$webroot/wp-content/mu-plugins/tracy-access.php"
    tracy_wp "wp option update tracy_access_work_role editor" \
      || echo '!! could not set the work role — defaults to editor anyway' >&2
    echo "==> auto-login plugin installed"
  else
    echo "!! access plugin missing at $access_plugin — people reach a login form" >&2
  fi

  # 4. The content reader (`content.identity`, `tracy_wp_content_identity`), on EVERY site these doors
  #    serve. 🔒 Until 30/09/2026 only the sealed road with a pinned plugin called it, so a blank site,
  #    a template card with no contract (`tracy-business/wp7` 1.3.0) and a sealed quickstart pinning no
  #    plugin answered every `content.locate` with "Content identity is not set up" until tracy-host
  #    next restarted (measured on `e3sw0330`). Never fatal here: the site works without the Content
  #    API, it is said, and no marker is written, so tracy-host's start-up pass tries again. The
  #    pinned road skips it: it binds the contract first and calls the reader itself, fatally,
  #    because a sealed site's reader reads the profile it was just bound to. So does the sealed
  #    road with no pin (`$3` = `defer-reader`): `tracy_wp_bind_latest` calls it once, after its bind.
  if [ -z "$pinned" ] && [ "$reader" != defer-reader ]; then
    tracy_wp_content_identity \
      || echo '!! content reader: not enabled — content.locate answers "Content identity is not set up" on this site until tracy-host tries again at its next start' >&2
  fi
}

# ── Fresh install (ADR 0086 / 0088: a fleet-BORN site, no archive to restore) ────────────────
#
# Everything above serves CLONES — a customer's captured site, restored verbatim. A fleet-born
# site has no archive: the official image lays the newest WordPress core into the webroot on
# first boot, and — unlike Joomla's image — it has NO auto-install and NO extensions seam, so
# the install ceremony and the cowork plugin both go through wp-cli in platform_post_up (the
# playbook's "no-autoinstall variant").
#
# The one admin the installer creates is the SITE AGENT, not a person. People enter through the
# mu-plugin auto-login (ADR 0085: the fleet-bar Worker vouches x-tracy-email, and the plugin
# maps owner/admin seats to administrator), so nobody needs a password ceremony. The generated
# password is kept in .env as break-glass, never printed.
if [ "${FRESH:-0}" = 1 ]; then
  PLATFORM_NEEDS_WEBROOT=0
  # No archive to download, BUT the installer writes a real webroot — so it must be recorded,
  # or the owner/developer cannot edit the site just built for them.
  PLATFORM_HAS_WEBROOT=1
  # The newest WordPress from the official image. The pinned php8.3 tag at the top of this file
  # is for clones, whose captured sites are what they are; a site born today is born current.
  WEB_IMAGE="$(tracy_web_image wordpress "wordpress:apache")"

  # The image writes wp-config.php itself from WORDPRESS_* env, correctly, for THIS environment —
  # nothing to rewrite, no live domain to search-replace out of a database that was born here.
  platform_configure() {
    :
  }

  platform_compose() {
    # Generated once, then kept — same rule as DB_PASSWORD: a re-provision must not strand an
    # installed site behind a password younger than its database.
    if ! grep -qs '^WP_ADMIN_PASSWORD=' "$SITE_DIR/.env"; then
      echo "WP_ADMIN_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '+/=\n')" >> "$SITE_DIR/.env"
    fi
    mkdir -p "$(tracy_webroot_dir "$LABEL")"

    # Same as the Joomla fresh path, and for the same reason: the conf is written with the
    # noindex switch OFF (hiding a draft is the fleet-bar Worker's job, following publish_state
    # — ADR 0086 §3), but the file still carries the parts that are FIXES rather than switches:
    # the `frame-ancestors` policy that lets Tracy's own surfaces show this site, and the
    # DirectorySlash patch. Without it a WordPress site answers 200 to curl and "refused to
    # connect" inside Tracy's preview, while a Joomla one built the same day does not — the kind
    # of split that reads as "Tracy is broken for WordPress".
    mkdir -p "$SITE_DIR/apache"
    cat > "$SITE_DIR/apache/headers.load" <<'LOAD'
LoadModule headers_module /usr/lib/apache2/modules/mod_headers.so
LOAD
    tracy_write_apache_conf "$SITE_DIR" off

    # The shape itself is in provision/render-compose.sh — one file writes every compose file
    # this fleet has, so the site-folder mounts cannot be added to three shapes out of four.
    COMPOSE_FLAVOR=fresh tracy_render_compose
  }

  # After `docker compose up`: the image lays the core down, then wp-cli does what Joomla's
  # installer did by itself — the install ceremony, the write door, the people door, the key.
  platform_post_up() {
    echo "==> waiting for the WordPress core copy"
    # Where the image actually lays the core down — the directory render-compose.sh binds to
    # /var/www/html. Watching the old $SITE_DIR/webroot here made this wait time out every time.
    local ready="" webroot
    webroot="$(tracy_webroot_dir "$LABEL")"
    for _ in $(seq 1 90); do
      if [ -f "$webroot/wp-config.php" ] && site_answers; then
        ready=1; break
      fi
      sleep 2
    done
    # 🔒 `return 1`, NOT `return 0` — changed 10/09 after measuring what the swallow costs.
    # `provision.sh` runs under `set -euo pipefail` and calls this bare, so a non-zero return
    # stops provisioning and the job reports a failure. That is the point. With `return 0` the
    # script marched on and the site was announced `state:done, step:ready` with no WordPress in
    # it at all — and worse, step 6d then captured a webroot baseline over the empty directory,
    # so the site's first "restore to baseline" DELETED the core that arrived later (measured on
    # `qatest1`: baseline 0 files, then 3785 logged as an outside change, then a restore back to
    # 0). A refusal here is early enough to be clean: 6e's own comment marks the line after which
    # a refusal would leave a skeleton behind, and this is before it.
    [ -n "$ready" ] || {
      echo "!! WordPress never finished copying its core into $webroot after 180s" >&2
      echo "!! (check \`docker logs ${LABEL}-web-1\`; the site's own web container is the one" >&2
      echo "!!  laying the core down, and this refuses rather than announce a site with no CMS)" >&2
      return 1
    }
    echo "    core in place — the site answers"

    local admin_password
    admin_password="$(sed -n 's/^WP_ADMIN_PASSWORD=//p' "$SITE_DIR/.env" | sed -n 1p)"

    echo "==> running the install ceremony (wp core install)"
    tracy_wp "wp core is-installed 2>/dev/null || wp core install \
      --url='$SITE_URL' --title='$LABEL' \
      --admin_user=tracyagent --admin_password='$admin_password' \
      --admin_email=tracy-agent@tracy.ai --skip-email" \
      || { echo '!! wp core install failed — refusing to announce a site with no WordPress in it' >&2; return 1; }

    # Search-friendly URLs from birth (--hard writes the .htaccess the apache image honours):
    # the handover chips offer 'friendly URLs' as a basic, and a fresh site should start there
    # rather than send the agent to flip WordPress's oldest default.
    tracy_wp "wp rewrite structure '/%postname%/' --hard" \
      || echo '!! could not set the permalink structure — plain links until someone flips it' >&2

    # The write door, the key and the people door — the same three steps a quickstart restore
    # runs, in one function so the two paths can never drift apart (`tracy_wp_install_doors`).
    tracy_wp_install_doors 0.8.0
  }
fi

# ── Quickstart restore (tasks/todo-wordpress-theme-skill.md §G) ──────────────────────────────
#
# A pinned WordPress archive (`quickstarts.json`, platform `wordpress`) restored through the CLONE
# path above: provision.sh sets FRESH=0 before this file is sourced, fetches the webroot tar and
# the database dump through quickstart.py, and platform_configure rewrites the placeholder address
# out of the database. What a clone does NOT do is what a fleet-born site gets after `core
# install` — the Cowork plugin, its token, the auto-login — so this branch adds exactly those, from
# the same function the fresh path calls. The archive carries its own theme and no Cowork plugin
# (Q6): the plugin installed is the LATEST the manifest names, never below `coworkMinVersion`, and
# the stage `check` of the Build refuses a site whose plugin is older than that floor.
#
# Two roads, chosen by provision.sh (BUILD_WORKFLOW):
#   - a build base (`tracy-base/wp7`) is always sealed — policy marker, then the doors at the
#     contract's floor — and needs CONTRACT_ID + COWORK_MIN_VERSION from provision.sh, which today
#     resolves them for Joomla only: a WordPress build base stops at the demand below;
#   - a TEMPLATE (a finished site, `tracy-business/wp7`, also a customer's pick from a template
#     card) has nothing locked, so provision resolved no contract. The seal is then READ from the
#     entry (`--field contract`, which tracy-web sets only when a profile seals that exact release):
#     present → sealed exactly like a build base; absent → no marker and the fresh site's doors.
#     18/09: without this road `tracy-business/wp7` died at the last step of its demo install with
#     `provision resolved no content contract for this quickstart`.
if [ -n "${QUICKSTART:-}" ]; then
  platform_post_up() {
    local webroot
    webroot="$(tracy_webroot_dir "$LABEL")"
    [ -f "$webroot/wp-config.php" ] || { echo 'quickstart wp-config.php is missing' >&2; return 1; }
    local marker="$TRACY_SITES_ROOT/.content-contracts/$LABEL.json"
    if [ "${BUILD_WORKFLOW:-contract}" = template ]; then
      # provision.sh resolved nothing for a template; the entry says whether a profile seals it.
      CONTRACT_ID="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field contract 2>/dev/null)" || CONTRACT_ID=''
      COWORK_MIN_VERSION=''
      if [ -n "$CONTRACT_ID" ]; then
        COWORK_MIN_VERSION="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field coworkMinVersion 2>/dev/null)" || COWORK_MIN_VERSION=''
        [ -n "$COWORK_MIN_VERSION" ] || { echo 'provision resolved no minimum Claude Cowork plugin version for this quickstart' >&2; return 1; }
      else
        # A protected site must never be reopened as one with no policy at all — the same refusal
        # the Joomla template road keeps. A SEALED card passes: its marker is rewritten below, so
        # an install that failed after the marker was written can be retried.
        [ ! -e "$marker" ] || {
          echo "!! $LABEL already carries a content contract — refusing to reopen a protected site as a template" >&2
          return 1
        }
      fi
    else
      [ -n "${CONTRACT_ID:-}" ] || { echo 'provision resolved no content contract for this quickstart' >&2; return 1; }
      [ -n "${COWORK_MIN_VERSION:-}" ] || { echo 'provision resolved no minimum Claude Cowork plugin version for this quickstart' >&2; return 1; }
    fi

    echo "==> waiting for the restored site to answer"
    local ready=""
    for _ in $(seq 1 60); do
      if site_answers; then ready=1; break; fi
      sleep 2
    done
    [ -n "$ready" ] || { echo "!! the restored WordPress never answered after 120s (check \`docker logs ${LABEL}-web-1\`)" >&2; return 1; }

    # The archive's own table prefix, read from the database it just imported: wp-cli must be told
    # (see tracy_wp_table_prefix for the day it was not).
    WP_TABLE_PREFIX="$(tracy_wp_table_prefix "$webroot/wp-config.php")"
    export WP_TABLE_PREFIX
    tracy_wp "wp core is-installed" || { echo '!! the restored database does not hold an installed WordPress' >&2; return 1; }
    tracy_wp_acym_keys "$WP_TABLE_PREFIX" || return 1

    if [ -n "$CONTRACT_ID" ]; then
      # The same marker Joomla writes, outside every site root: which contract this site is held to.
      # Written BEFORE the doors are installed, so a failed install never leaves a site with no policy.
      # The marker is the host's fence (shell and file tools); the binding below is the site's own
      # (Codex review #6: bind ADDS to the marker, never replaces it).
      mkdir -p "$TRACY_SITES_ROOT/.content-contracts"
      local cowork_version=''
      cowork_version="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field cowork.version 2>/dev/null)" || cowork_version=''
      printf '{"contract":"%s","platform":"wordpress","quickstart":"%s","coworkMinVersion":"%s","coworkContractVersion":"%s","policy":1}\n' \
        "$CONTRACT_ID" "$QUICKSTART" "$COWORK_MIN_VERSION" "$cowork_version" > "$marker"
      chmod 644 "$marker"
      # Marker → pinned Claude Cowork plugin → bind → inspect → hand over. A quickstart whose release pins no
      # Claude Cowork plugin installs the latest above the floor and is bound through it
      # (`tracy_wp_bind_latest`); that bind never stops the provision.
      local package='' pinned=''
      package="$(mktemp)"
      python3 "$HERE/quickstart.py" --id "$QUICKSTART" --part cowork --out "$package" 2>/dev/null && pinned=1
      if [ -n "$pinned" ]; then
        tracy_wp_install_doors "$COWORK_MIN_VERSION" "$package" || { rm -f "$package"; return 1; }
        rm -f "$package"
        tracy_wp_bind_contract "$CONTRACT_ID" || return 1
        # Cosmetic: fails only when the contract no longer inspects as bound after it (see the function).
        tracy_wp_showcase_nav "$CONTRACT_ID" || return 1
        tracy_wp_content_identity || return 1
      fi
      [ -n "$pinned" ] || {
        rm -f "$package"
        echo "==> $QUICKSTART pins no Claude Cowork plugin — installing the latest cowork release above the floor"
        tracy_wp_install_doors "$COWORK_MIN_VERSION" "" defer-reader
        tracy_wp_bind_latest "$CONTRACT_ID" "$marker" || return 1
      }
      echo "==> quickstart $QUICKSTART restored (contract $CONTRACT_ID)"
    else
      # Nothing seals this template: the same doors a fresh site gets, and no policy file.
      tracy_wp_install_doors 0.8.0
      tracy_showcase_skip 'this template carries no content contract, so it has no showcase map' || return 1
      echo "==> quickstart $QUICKSTART restored (template, no content contract)"
    fi
  }
fi

# ── Import (a copy of a customer's own site) ─────────────────────────────────────────────────
#
# The clone road with no quickstart and no --fresh: the archive is the customer's own server, read
# by the import wizard through the Claude Cowork plugin it installed there first — so the copy comes
# up WITH that plugin, active, holding the same token (tracy-web moves the site's component row onto
# the copy once this job is done, `pairFleetCopy`). What a quickstart gets right after its plugin is
# installed, this copy gets here: `content.identity`, the plugin's own opt-in to the Content API
# (a uid per row in its post meta `_tracy_content_uid`, a seed in its own option — both go when the
# plugin is removed). Without it `content.read`/`content.locate` answer 501 "Content identity is not
# set up on this site yet" and the element picker sends no location (decision 3, 27/09/2026).
#
# The same call as the quickstart's: `newSite` with the request id this label keeps. The copy is a
# NEW site — a seed that came with the customer's archive must not be shared with it — and the plugin
# remembers the request id in the database, so a second pass over the same database replays instead
# of rotating, while a re-import (a fresh database, no such marker) gets its own seed again.
#
# Never fatal: the copy is a working site without the Content API, and refusing the whole import
# over it would hand the customer nothing instead of a copy that lacks one door. Said on stderr.
# Never where the plugin is missing, inactive or has no token — nothing is called there.
tracy_wp_import_content_identity() {
  local token
  WP_TABLE_PREFIX="$(tracy_wp_table_prefix "$(tracy_webroot_dir "$LABEL")/wp-config.php")"
  export WP_TABLE_PREFIX
  if ! tracy_wp "wp plugin is-active claude-cowork" >/dev/null 2>&1; then
    echo '==> content reader (import): no active Claude Cowork plugin on this copy — skipped'
    return 0
  fi
  token="$(tracy_wp_cowork_token)"
  if [ -z "$token" ]; then
    echo '!! content reader (import): the Claude Cowork plugin on this copy has no token — skipped' >&2
    return 0
  fi
  echo '==> content reader (import): opting the copy in through its Claude Cowork plugin'
  tracy_wp_content_identity "$token" \
    || echo '!! content reader (import): not enabled — the Content API answers 501 on this copy until content.identity runs' >&2
  tracy_wp_derive_contract "$token"
  return 0
}

if [ "${FRESH:-0}" != 1 ] && [ -z "${QUICKSTART:-}" ]; then
  platform_post_up() {
    # An imported copy is for looking at (beta week 16–23/10/2026): a `.maintenance` file the archive
    # carried (an update running on the source as it was read) would show only "Briefly unavailable".
    # A maintenance or coming-soon PLUGIN is left alone here — the agent is told how to turn it off
    # on the copy (`tracy-site-tools` site context), since which plugin it is varies.
    rm -f "$(tracy_webroot_dir "$LABEL")/.maintenance"
    tracy_wp_import_content_identity
  }
fi
