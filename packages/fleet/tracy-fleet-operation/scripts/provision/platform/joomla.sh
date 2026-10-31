# Joomla-specific half of a provision. Sourced by provision.sh; see platform/README.md.

# Since Plan 3 the image is also the agent's shell: one dsh per host execs into this container,
# so it has to carry git, ripgrep, less and jq. web/IMAGE_TAGS says which built image answers for
# this base; a provision builds it when it is missing (lib/web-image.sh), and the site stays on the
# upstream one — loudly — only when that build fails.
#
# Which base, decided BEFORE the one lookup. A clone runs what it was captured on (5); a fleet-born
# site (FRESH) and a quickstart are born on the newest major (6) — a site born today has no reason
# to be born on last year's major. One lookup and not a default overridden later: the lookup may
# BUILD the image, and a quickstart provision must not spend five minutes building the clone's.
if [ "${FRESH:-0}" = 1 ] || [ -n "${QUICKSTART:-}" ]; then
  WEB_IMAGE="$(tracy_web_image joomla "joomla:6-apache")"
else
  WEB_IMAGE="$(tracy_web_image joomla "joomla:5-apache")"
fi
# The file whose presence means a Joomla site already lives in the webroot (provision.sh reads it
# before a quickstart restore). Joomla is the default there; named here so the two platforms read alike.
PLATFORM_CONFIG_FILE="configuration.php"
# The receipt that says this run laid the site down, and so owes it its showcase-navigation phase.
# shellcheck source=../../lib/showcase-nav.sh
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/showcase-nav.sh"
DB_NAME="joomla"
# Joomla writes '0000-00-00' as a sentinel and strict mode rejects it on import. Relax the
# server rather than editing the customer's data on the way in.
DB_SQL_MODE="NO_ENGINE_SUBSTITUTION"

# The directories Joomla writes to as the web user, named HERE rather than in provision.sh.
# 🔒 21/08/2026: this list used to run on every clone, WordPress included, and the stray
# `administrator/` it left behind was later read as "this site is Joomla" by the ADR 0070 write
# gate — which then refused every path in a WordPress webroot. A CMS's writable directories are
# the CMS's business, exactly like its configuration file.
platform_runtime_dirs() {
  echo "tmp cache administrator/logs administrator/cache"
}

# The site's own configuration.php, which travelled inside the archive. Rewritten in place
# rather than rendered from a separate template — one artifact instead of two to keep in step.
platform_configure() {
  # The webroot is under TRACY_SITES_ROOT, not the private root: `tracy_webroot_dir` (lib/roots.sh)
  # is the only place that split is named, and it is what render-compose.sh binds to /var/www/html.
  local source_config
  source_config="$(tracy_webroot_dir "$LABEL")/configuration.php"
  [ -f "$source_config" ] || { echo "archive carried no configuration.php" >&2; return 1; }

  echo "==> rewriting configuration.php for this environment"
  cp "$source_config" "$SITE_DIR/work/configuration.source.php"
  # Joomla sites are routinely hardened by making this file read-only (0444), and tar preserves
  # that, so writing the rewritten version fails with a bare "Permission denied" that names the
  # destination and not the reason. Open it, write, then put it back the way it was found.
  # GNU stat first, BSD second — and the order matters. On Linux `stat -f` means "filesystem
  # status" and SUCCEEDS, so testing BSD first never falls through and hands chmod a paragraph
  # of filesystem statistics instead of a mode.
  local original_mode
  original_mode="$(stat -c '%a' "$source_config" 2>/dev/null || stat -f '%Lp' "$source_config")"
  chmod u+w "$source_config"
  # An imported copy is brought online whatever its source said (`--online`): a site offline while
  # the customer rebuilds it showed them, and the agent, only its offline page (beta week 16–23/10).
  local online=""
  [ "${SITE_ORIGIN:-}" = imported ] && online="--online"
  python3 "$HERE/render_configuration.py" \
    --source "$SITE_DIR/work/configuration.source.php" --out "$source_config" \
    --db-host db --db-user "$DB_USER" --db-password "$DB_PASSWORD" --db-name "$DB_NAME" \
    --live-site "$SITE_URL" $ALLOW_MAIL $online
  chmod "$original_mode" "$source_config"

  platform_neutralize_live_domain
  platform_check_in_all
}

# Once the stack runs: the configuration.php rewritten above loads in the site's own PHP, or the
# provision stops here, saying why — never a site called up that answers 500 on every page (#218).
# Called first by the import's `platform_post_up` (below).
platform_config_loads() {
  # shellcheck source=../../lib/joomla-config-loads.sh
  . "$HERE/../lib/joomla-config-loads.sh"
  local refusal
  if ! refusal="$(tracy_joomla_config_refusal "$SITE_DIR")"; then
    echo "!! $refusal" >&2
    exit 1
  fi
}

# Every record the captured site had open in an editor, checked in on the copy. Joomla keeps a
# check-out (`checked_out` = the user, `checked_out_time`) until that editor is closed, and a tab
# closed instead leaves it there; the archive carries it, and on the copy nobody can close it: the
# copy's administrator met "checked out by another user" on an article a live editor left open two
# days before the import (dev, 26/10/2026). Global Check-in, done once: each column back to its own
# default (NULL on Joomla 4+, 0 and the zero date on Joomla 3).
platform_check_in_all() {
  local prefix tables table has_time assign script=""
  prefix="$(grep -oE "dbprefix['\"]? *= *['\"][a-zA-Z0-9_]+" "$(tracy_webroot_dir "$LABEL")/configuration.php" \
            | grep -oE "[a-zA-Z0-9_]+$")"
  [ -n "$prefix" ] || { echo "!! could not read the table prefix — check-outs left as they are" >&2; return 0; }
  # One line per table with a check-out: its name, and 1 when it has `checked_out_time` too.
  tables="$( ( cd "$SITE_DIR" && docker compose exec -T db sh -c \
      "exec mariadb --skip-ssl -N -B -uroot -p\"$DB_PASSWORD\" \"$DB_NAME\"" <<SQL
SELECT c.table_name, MAX(t.column_name IS NOT NULL)
  FROM information_schema.columns c
  LEFT JOIN information_schema.columns t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.column_name = 'checked_out_time'
 WHERE c.table_schema = DATABASE() AND c.column_name = 'checked_out' AND c.table_name LIKE '${prefix//_/\\_}%'
 GROUP BY c.table_name;
SQL
  ) )" || { echo "!! could not list the tables with check-outs — left as they are" >&2; return 0; }
  [ -n "$tables" ] || return 0
  while IFS=$'\t' read -r table has_time; do
    [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || continue
    assign="\`checked_out\` = DEFAULT"
    [ "$has_time" = 1 ] && assign="$assign, \`checked_out_time\` = DEFAULT"
    script+="UPDATE \`$table\` SET $assign WHERE \`checked_out\` IS NOT NULL AND \`checked_out\` <> 0;"$'\n'
  done <<< "$tables"
  ( cd "$SITE_DIR" && docker compose exec -T db sh -c \
      "exec mariadb --skip-ssl -uroot -p\"$DB_PASSWORD\" \"$DB_NAME\"" <<< "$script" ) \
    || { echo "!! could not check in the records the live site had open — left as they are" >&2; return 0; }
  echo "==> checked in every record the captured site had open in an editor"
}

# The second place a Joomla site keeps its address, and the one configuration.php does not cover.
#
# 🔒 Measured on joomlart-com-0871462c, 2026-08-17, with live_site already correctly set to the
# clone: requesting /joomla/templates (no trailing slash) answered
#
#     301 -> https://www.joomlart.com/joomla/templates/
#
# which takes the visitor out of the clone and drops them on the customer's production site. With the
# trailing slash the same page answered 200 from the clone, so nothing was broken except where the
# canonical form was being built. Eight routes behaved this way.
#
# The mechanism is plg_system_sef::onAfterRoute: when the router reports a URL "tainted" it rebuilds
# the route and 301s to it, and the plugin's stored `domain` param supplies the host. That param is
# in the database, so render_configuration.py never sees it and re-provisioning never clears it.
#
# Confirmed by experiment rather than by reading: clearing the field turned all three cross-domain
# redirects into `https://joomlart-com-0871462c.tracy.ai/...` on the same request, and restoring it
# brought them straight back.
#
# Empty rather than "set it to the clone's URL": empty is what Joomla treats as "use the address you
# were reached on", which is also what makes the clone behave when it is reached by more than one
# name. Only this one field is touched, so a customer who set a suffix or strict routing keeps it.
platform_neutralize_live_domain() {
  local prefix
  prefix="$(grep -oE "dbprefix['\"]? *= *['\"][a-zA-Z0-9_]+" "$(tracy_webroot_dir "$LABEL")/configuration.php" \
            | grep -oE "[a-zA-Z0-9_]+$")"
  [ -n "$prefix" ] || { echo "!! could not read the table prefix — SEF domain left alone" >&2; return 0; }

  # JSON_VALID first: a params column can hold '' or a hand-edited fragment, and JSON_SET on one of
  # those raises an error that would take the whole provision down with it under `set -e`.
  ( cd "$SITE_DIR" && docker compose exec -T db sh -c \
      "exec mariadb --skip-ssl -uroot -p\"$DB_PASSWORD\" \"$DB_NAME\"" <<SQL
UPDATE \`${prefix}extensions\`
   SET params = JSON_SET(params, '\$.domain', '')
 WHERE type = 'plugin' AND folder = 'system' AND element = 'sef'
   AND JSON_VALID(params)
   AND JSON_UNQUOTE(JSON_EXTRACT(params, '\$.domain')) NOT IN ('');
SQL
  ) || { echo "!! could not clear the SEF plugin's domain — clone may redirect to the live site" >&2; return 0; }
  echo "==> cleared the SEF plugin's site domain, so canonical redirects stay on this clone"
}

# The clone auto-login plugin is NOT installed here any more: it ships inside the claude-cowork
# package (pkg_claudecowork, from v0.8.18), which the Desk installs on a clone for Apply — so the
# one Tracy package carries both the write component and the auto-login system plugin (ADR 0085).
# provision therefore defines no `platform_install_access` for Joomla, and stage 6b skips it. That
# package still carries the old, header-trusting plugin, so stage 6c½ (strict-site-access.sh) replaces
# its files with the signed verifier in access/joomla/ once the post-up hook has installed it.

# ── Fresh install (ADR 0086: a fleet-born site) ──────────────────────────────────────────────
#
# Everything above this line restores a CAPTURED site; `--fresh` builds one that does not exist
# yet. The official image installs Joomla itself when the JOOMLA_* variables are set — the same
# entrypoint the restore path deliberately bypasses ("this webroot is already the customer's")
# is, here, the whole point.
#
# The one admin the installer creates is the SITE AGENT, not a person. People enter through the
# cowork auto-login (ADR 0085: the fleet-bar Worker vouches x-tracy-email, and cowork 0.8.19 maps
# owner/admin to Super User), so nobody needs a password ceremony — same reasoning as EmDash's
# passkey-stays-unmade. The generated password is kept in .env as break-glass, never printed.
if [ "${FRESH:-0}" = 1 ]; then
  PLATFORM_NEEDS_WEBROOT=0
  # No archive to download, BUT the installer writes a real webroot — so it must be recorded,
  # or the owner/developer cannot edit the site just built for them.
  PLATFORM_HAS_WEBROOT=1
  # The newest Joomla, from the official image (docker-library builds it from the official
  # release): WEB_IMAGE at the top of this file is already the 6-apache line for a FRESH site.

  # The installer writes configuration.php itself, correctly, for THIS environment — there is
  # nothing to rewrite and no live domain to neutralize (no SEF param has ever been set).
  platform_configure() {
    :
  }

  platform_compose() {
    # Generated once, then kept — same rule as DB_PASSWORD and for the same reason: a re-provision
    # must not strand an installed site behind a password younger than its database.
    if ! grep -qs '^JOOMLA_ADMIN_PASSWORD=' "$SITE_DIR/.env"; then
      echo "JOOMLA_ADMIN_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '+/=\n')" >> "$SITE_DIR/.env"
    fi
    mkdir -p "$(tracy_webroot_dir "$LABEL")"

    # The write door rides the installer: the image installs any JOOMLA_EXTENSIONS_URLS right
    # after Joomla itself, so cowork needs no second installer of its own. The version comes from
    # the release manifest the Desk also reads (`lib/cowork-extension.sh` says why); the constant
    # below is a FLOOR, not the version to install — newest is right because the pace is 12
    # releases in 4 days and every one is additive, and a floor is what stops a rolled-back
    # manifest dragging a site under the release this code was written against. 0.24.1: an article
    # write that says nothing of tags keeps the article's tags (TCH #1013, D3).
    COWORK_FLOOR=0.24.1
    . "$HERE/../lib/cowork-extension.sh"
    read -r COWORK_VERSION COWORK_URL <<<"$(cowork_latest joomla "$COWORK_FLOOR")"
    echo "==> cowork ${COWORK_VERSION} will install with Joomla itself"

    # The Apache conf is written with the noindex switch OFF, and that distinction is the whole
    # point: hiding a DRAFT site is the fleet-bar Worker's job and follows publish_state
    # (ADR 0086 §3) — a noindex header baked into the origin would survive Publish and keep the
    # customer's real site out of search.
    #
    # What the file still carries is the part that is a FIX rather than a switch: the
    # `frame-ancestors` policy that lets Tracy's own surfaces show this site, and the
    # DirectorySlash patch. Before 2026-08-31 a fresh site got neither, because the whole file
    # was skipped along with the switch it carried — and the symptom was a site that answered
    # 200 to curl and "refused to connect" inside Tracy's preview.
    #
    # `mod_headers` is not enabled in the joomla image, so it is mounted in the same way the
    # clone compose does it.
    mkdir -p "$SITE_DIR/apache"
    cat > "$SITE_DIR/apache/headers.load" <<'LOAD'
LoadModule headers_module /usr/lib/apache2/modules/mod_headers.so
LOAD
    tracy_write_apache_conf "$SITE_DIR" off
    # The shape itself is in provision/render-compose.sh — one file writes every compose file
    # this fleet has, so the site-folder mounts cannot be added to three shapes out of four.
    # The extension list is this platform's to decide and travels as an environment variable.
    COMPOSE_FLAVOR=fresh JOOMLA_EXTENSIONS_URLS="$COWORK_URL" tracy_render_compose
  }

  # After `docker compose up`: wait out the auto-install, then give the site its write door.
  platform_post_up() {
    echo "==> waiting for the Joomla auto-install"
    # Where the image actually installs — the directory render-compose.sh binds to /var/www/html,
    # not the near-empty $SITE_DIR/webroot under the private root.
    local installed="" webroot
    webroot="$(tracy_webroot_dir "$LABEL")"
    for _ in $(seq 1 90); do
      # Asked both ways, like WordPress's `site_answers`: host-networked on a fleet host only the
      # published loopback port answers; on the macOS stack (tracy-host on the compose network) only
      # the web container's docker-network name does. With the loopback probe alone that stack waited
      # out all 180 seconds on a site that was up, and returned below before the component token was
      # ever read. The name comes from `tracy_web_dns_name` (render-compose.sh, sourced by provision.sh
      # before this file), so a long label dials its `tracy-web-<hash>` alias rather than the over-long
      # `<label>-web-1` that would fail ENOTFOUND (issue #165).
      if [ -f "$webroot/configuration.php" ] && \
         { curl -s -o /dev/null "http://127.0.0.1:${HOST_PORT}/" || \
           curl -s -m 3 -o /dev/null "http://$(tracy_web_dns_name "$LABEL")/"; }; then
        installed=1; break
      fi
      sleep 2
    done
    [ -n "$installed" ] || {
      echo "!! Joomla never finished installing — no tracy-agent.token collected, so this site's content door will not pair" >&2
      return 0
    }
    echo "    installed — the site answers"

    # The file no archive carried and the installer does not write either (Joomla ships
    # htaccess.txt and leaves the rename to a person). Same canonical file every clone gets.
    tracy_ensure_webroot_htaccess "$webroot"

    # cowork rode in on JOOMLA_EXTENSIONS_URLS (see platform_compose) — the image installed it
    # right after Joomla itself, so there is no second installer here, only its key to collect.
    # The component token is the agent's write key (the desk reads the same value off the
    # component's Options page on a customer's own site). Mint it here if the install did not:
    # the component compares against its params verbatim, so a value written into params IS the
    # token. Saved where the fleet's agent-token door already looks — the same file, the same
    # mode, the same contract as EmDash's PAT.
    echo "==> reading the component token"
    local token held
    # `|| token=""`: under `set -euo pipefail` an empty answer (no token in the params yet) made this
    # assignment end the whole provision with no message, so the mint below never ran.
    token=$( ( cd "$SITE_DIR" && docker compose exec -T db \
      mariadb --skip-ssl -N -uroot -p"$DB_PASSWORD" "$DB_NAME" -e \
      "SELECT JSON_UNQUOTE(JSON_EXTRACT(params,'\$.token')) FROM tr_extensions WHERE element='com_claudecowork' AND JSON_VALID(params);" \
      ) 2>/dev/null | grep -vE '^(NULL)?$' | sed -n 1p ) || token=""
    if [ -z "$token" ]; then
      token=$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')
      # ROW_COUNT: an UPDATE that matched no component row succeeds too, and a token file naming a
      # token nothing holds would only move the failure to pairing.
      held=$( ( cd "$SITE_DIR" && docker compose exec -T db \
        mariadb --skip-ssl -N -uroot -p"$DB_PASSWORD" "$DB_NAME" -e \
        "UPDATE tr_extensions SET params = JSON_SET(IF(JSON_VALID(params), params, '{}'), '\$.token', '$token') WHERE element='com_claudecowork'; SELECT ROW_COUNT();" ) ) \
        || held=""
      held="$(printf '%s' "$held" | tr -dc '0-9')"
      [ "${held:-0}" -gt 0 ] || {
        echo "!! could not mint the component token (no com_claudecowork row took it) — no tracy-agent.token, so this site's content door will not pair" >&2
        return 0
      }
    fi
    printf '%s\n' "$token" > "$SITE_DIR/tracy-agent.token"
    chmod 600 "$SITE_DIR/tracy-agent.token"
    echo "    agent token ready"

    # Content API (`/content.json`): the blank site's own seed and row registry. 🔒 Missing until
    # 30/09/2026 — a blank site answered every `content.locate` with "Content identity is not set up"
    # until tracy-host's next start (`apps/tracy-host/src/content-identity.js`). Never fatal: the
    # site works without the Content API, and a site with no marker is tried again at that start.
    joomla_enable_content_reader \
      || echo '!! content reader: not enabled — the Content API answers 501 on this site until tracy-host tries again at its next start' >&2
  }
fi

# The application-level mail switch. Joomla is the only platform with one: `$mailer = 'none'` makes
# Joomla itself refuse to send, even with the network open. WordPress and EmDash have no equivalent
# (they call PHP's mail() directly), so for them the network IS the switch and this hook does not
# exist — which is why go-live.sh opens the network first and calls this hook after.
#
# 🔒 A CUSTOMER'S OWN MAILER SURVIVES A DRAFT/LIVE ROUND TRIP. Until 23/09 `on` always wrote 'mail'
# and `off` always wrote 'none', so a site whose owner had set 'smtp' (their own server) came back
# from draft on PHP mail — their setting silently gone. Now `off` remembers the value it replaces in
# $SITE_DIR/.mail-before-draft (the private root, never the webroot) and `on` puts that value back,
# falling back to 'mail' (= PHP mail() = the Tracy relay shim) only when nothing was remembered.
# A second `off` while already 'none' keeps the first memory instead of overwriting it with 'none'.
#
# Only `$mailer` is touched. The smtp* keys are the customer's and are never read or written here.
# ⚠ A clone's configuration.php had its smtp* blanked and `$mailer` set by render_configuration.py
# at provision time, on purpose (a staging copy must not hold the customer's mail credentials), so
# what this remembers is what was set ON THE TRACY COPY, not what the source site had.
platform_set_mail() {
  local want="$1" config current mailer memo="$SITE_DIR/.mail-before-draft" remembered=""
  config="$(tracy_webroot_dir "$LABEL")/configuration.php"
  [ -f "$config" ] || { echo "!! no configuration.php — the application-level mail switch is unchanged" >&2; return 1; }

  current="$(sed -nE "s/^.*\\\$mailer[[:space:]]*=[[:space:]]*'([^']*)'.*$/\\1/p" "$config" | sed -n 1p)"
  [ -n "$current" ] || { echo "!! no \$mailer line in configuration.php — the application-level mail switch is unchanged" >&2; return 1; }

  if [ "$want" = "on" ]; then
    if [ -f "$memo" ]; then
      remembered="$(head -1 "$memo" | tr -d '\r\n ')"
      # Only a plain word goes back into a PHP file (the values Joomla offers: mail, sendmail, smtp).
      case "$remembered" in *[!A-Za-z0-9_-]*|none) remembered="" ;; esac
    fi
    mailer="${remembered:-mail}"
  else
    if [ "$current" != "none" ]; then
      # Written beside the memo and renamed over it: a half-written memory would restore garbage.
      printf '%s\n' "$current" > "$memo.new" && chmod 600 "$memo.new" && mv "$memo.new" "$memo" || {
        rm -f "$memo.new"
        echo "!! could not remember the current mailer ($current) — leaving it as it is" >&2
        return 1
      }
    fi
    mailer="none"
  fi

  if [ "$current" != "$mailer" ]; then
    # Edited in place, mode kept: Apache reads this file on every request, and a half-written file
    # is a site answering 500. The new content is complete in $tmp before a byte of $config moves.
    local tmp; tmp="$(mktemp)"
    sed -E "s/(\\\$mailer[[:space:]]*=[[:space:]]*)'[^']*'/\\1'$mailer'/" "$config" > "$tmp"
    grep -qE "\\\$mailer[[:space:]]*=[[:space:]]*'$mailer'" "$tmp" || {
      rm -f "$tmp"; echo "!! could not set \$mailer in configuration.php" >&2; return 1; }
    cat "$tmp" > "$config" && rm -f "$tmp"
  fi
  # Forgotten only once it has been put back: a failed write above keeps it for the next attempt.
  [ "$want" = "on" ] && rm -f "$memo"
  if [ -n "$remembered" ]; then
    echo "==> joomla mailer = $mailer (restored)"
  else
    echo "==> joomla mailer = $mailer"
  fi
}


# ── Tracy's Cowork component, installed into a site that is already up ────────────────────────
#
# Content API (`/content.json`): opt a freshly bound site in — its own seed, its row registry
# (`joomla-content-identity.php`, which skips a component that predates the reader). Idempotent
# across a retried provision: the host-side marker says this site already got its own seed, so a
# second pass keeps it instead of rotating every id again.
#
# 🔒 THE MARKER MEANS "IDENTITY IS IN", NOT "THE SCRIPT RAN" (28/09/2026). The script exits 0 when it
# SKIPS — a Cowork component with no reader (`none`), one older than the reader (`outdated`), a Joomla
# the reader does not support (`unsupported`) — so the marker was written for a site that got no
# identity at all. `tracy-host` reads that marker as "already done" and returns before it tries
# (`content-identity.js`), so once the component was upgraded NOTHING ever installed the registry:
# `content.read`/`content.locate` answered 501 on that site for good. The marker is now written only
# for `enabled`, and a skip says so and leaves the next start to try again.
joomla_enable_content_reader() {
  echo '==> enabling the content reader'
  local out=''
  local status=0
  local said=''
  if [ ! -f "$SITE_DIR/content-identity.done" ]; then
    out="$( (cd "$SITE_DIR"; docker compose exec -T -e TRACY_NEW_SITE=1 web php) < "$HERE/joomla-content-identity.php" 2>&1 )" || status=$?
  else
    out="$( (cd "$SITE_DIR"; docker compose exec -T web php) < "$HERE/joomla-content-identity.php" 2>&1 )" || status=$?
  fi
  printf '%s\n' "$out"
  [ "$status" = 0 ] || return 1
  said="$(printf '%s\n' "$out" | sed -n 's/^TRACY_RESULT content_reader=\([a-z]*\).*$/\1/p' | tail -1)"
  if [ "$said" = enabled ]; then
    : > "$SITE_DIR/content-identity.done"
    return 0
  fi
  echo "!! content reader: not installed (${said:-no outcome named}) — NOT marked, so tracy-host tries again at its next start" >&2
  return 0
}

# Bind an imported copy to a contract DERIVED from its own rows (`joomla-content-derive.php`, which calls
# `content.contract` operation `derive` on the copy's own component; tasks/todo-import-site-contract.md).
# Never fails the import: the script always exits 0 and names its outcome on its last line; anything but
# `bound` is said, and the copy works without it — the Edit picker just resolves by text.
joomla_derive_contract() {
  local out='' said=''
  echo '==> deriving the content contract'
  out="$( (cd "$SITE_DIR"; docker compose exec -T -e TRACY_LABEL="$LABEL" web php) < "$HERE/joomla-content-derive.php" 2>&1 )" || true
  printf '%s\n' "$out" | grep -v '^TRACY_RESULT ' || true
  said="$(printf '%s\n' "$out" | sed -n 's/^TRACY_RESULT derived=\(.*\)$/\1/p' | tail -1)"
  case "$said" in
    bound\ *)
      printf '%s\n' "$said" | sed -n 's/^bound entities=\([0-9]*\) slots=\([0-9]*\) calibrated=\([01]\).*$/    derived contract: \1 entities, \2 slots, calibrated=\3/p' \
        | sed 's/calibrated=1$/calibrated/; s/calibrated=0$/not calibrated/' ;;
    *) said="${said%% *}"; echo "!! derived contract: not bound (${said:-no outcome named}) — the Edit picker resolves by text only on this copy" >&2 ;;
  esac
  return 0
}

# A published profile id (`ja-kinetic/j6/1.0.0`) and nothing else: the id is written into a JSON
# marker and into the component's params, so quotes, newlines and paths are refused before either.
joomla_contract_id_valid() {
  local pattern='^[a-z][a-z0-9-]{1,40}/[a-z][a-z0-9]{0,9}/[0-9]+\.[0-9]+\.[0-9]+$'
  [[ "$1" =~ $pattern ]]
}

# The profile that seals this quickstart's card, or nothing when its catalogue entry names none.
# Only that one answer of `quickstart.py` (exit 4, the key absent) means "unsealed"; any other
# failure of the lookup (an unknown id, an unreadable catalogue, a `contract` that is empty or not a
# string) is a failure, never a site quietly provisioned unbound.
joomla_card_contract() {
  local out='' err status=0
  err="$(mktemp)"
  out="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field contract 2>"$err")" || status=$?
  if [ "$status" != 0 ]; then
    if [ "$status" = 4 ] && [ "$(tail -1 "$err")" = 'quickstart has no contract' ]; then
      rm -f "$err"
      return 0
    fi
    echo "!! could not read this card's content contract: $(tail -1 "$err" | cut -c1-300)" >&2
    rm -f "$err"
    return 1
  fi
  rm -f "$err"
  joomla_contract_id_valid "$out" || { echo '!! the card names a content contract that is not a profile id' >&2; return 1; }
  printf '%s\n' "$out"
}

# The pairing token a host file holds: exactly 64 lowercase hex characters and one newline, the
# shape this file and `mint-agent-token.sh` write. Anything else — empty, a 40-hex legacy value,
# trailing bytes — is not a token to pair with, and is answered with status 1. A file this host
# cannot read is refused here too, before anything reads, changes or hands it on.
joomla_token_read() {
  local value
  [ -f "$1" ] && [ ! -L "$1" ] && [ -r "$1" ] || return 1
  [ "$(wc -c < "$1" | tr -d ' ')" = 65 ] || return 1
  value="$(cat -- "$1")"
  [[ "$value" =~ ^[a-f0-9]{64}$ ]] || return 1
  printf '%s\n' "$value"
}

# 🔒 A token file is used only at mode 0600 — the one invariant for the pending file, the committed
# file, and the commit itself. A plain file at any other mode is set to 0600, and the mode is then
# READ BACK, so a chmod that failed or changed nothing is caught rather than trusted. `find -perm`
# reads the mode the same way on GNU and BSD (the check `mint-agent-token.sh` uses). Status 1: the
# file is not a plain 0600 file, and nothing may hand it on or call the pairing done.
joomla_token_private() {
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  if [ -z "$(find "$1" -maxdepth 0 -type f -perm 0600 2>/dev/null)" ]; then
    chmod 600 "$1" 2>/dev/null || return 1
  fi
  [ -n "$(find "$1" -maxdepth 0 -type f -perm 0600 2>/dev/null)" ]
}

# The token FILE holds, but only if it is a plain readable file holding a token, at 0600 (made so
# here when it is not). Every road to the container and every success goes through this.
# Usage: joomla_token_held FILE  — prints the token; status 1 with a message naming FILE otherwise.
joomla_token_held() {
  local value
  value="$(joomla_token_read "$1")" || {
    echo "!! refusing to pair: ${1##*/} does not hold a pairing token" >&2; return 1; }
  joomla_token_private "$1" || {
    echo "!! refusing to pair: ${1##*/} could not be made private (0600)" >&2; return 1; }
  printf '%s\n' "$value"
}

# Remove one token file this function put in place, and prove it is gone: `rm -f` answers 0 for a
# file it never removed only when there was none, but the check reads the result, not the exit code.
# Status 1 when the file (or a link in its place) is still there; nothing may then call the pass done.
joomla_token_drop() {
  rm -f -- "$1" 2>/dev/null
  [ ! -e "$1" ] && [ ! -L "$1" ]
}

# Pair a quickstart with its private Cowork token and bind it to CONTRACT through the component's
# own door — the Joomla half of `tracy_wp_bind_contract` (wordpress.sh), one road for every Joomla
# quickstart. `joomla-bootstrap.php` writes `contract` into com_claudecowork's params, binds, and
# reads the binding back with `inspect`; a pass that finds a token already there keeps it, and still
# fills an EMPTY `contract` before it binds (#722: a site paired with none was held to Apple's lock).
#
# 🔒 THE HOST HOLDS THE TOKEN BEFORE THE COMPONENT DOES. The token is minted HERE and kept in
# `tracy-agent.token.pending` (0600) before the container sees it; it becomes `tracy-agent.token`
# only once bind and inspect confirmed the pairing. A pass that dies after the component stored it
# leaves the pending file behind, so the next pass hands the SAME token in, and the bootstrap reads
# "the component already holds the host's token" as a resumed pairing: no new token, no second
# session reset or admin password. A committed token is handed in as verify-only, and the bootstrap
# refuses it unless the component holds that very token. The token reaches the container on stdin
# (first line, read by `sh` before `php` reads the script), never argv or a `-e` value.
#
# 🔒 THE SHOWCASE PHASE RIDES ON THE SAME PASS, AND ONLY FOR A SITE THIS PROVISION LAID DOWN. When the
# site's receipt is there (`lib/showcase-nav.sh`) and the workflow binds, its request id goes in as
# `TRACY_SHOWCASE_REQUEST` and the bootstrap takes the template showcase out of the menus after the
# bind and its inspect, then inspects again — all before the token is committed, so a pass that stops
# there is resumed like any other, with the same token and the same request id; a phase that pass
# started is then taken back and settled as failed, not applied again (`TRACY_SHOWCASE_RESUMED`). Every road through
# here ends with a coverage state said: applied, skipped or failed by the bootstrap, skipped here for
# a road that binds nothing, or "not applied" for a site this run did not lay down. The receipt goes
# only once that state is final. The phase is cosmetic: a phase that fails is said, reverted and
# settled as failed by the bootstrap (`tracy_showcase_phase`), and the pairing goes on; only a contract
# that no longer inspects as bound after it fails the pass.
# Usage: joomla_bind_contract CONTRACT WORKFLOW [OPTIONAL]. Answers 3 only when OPTIONAL is 1 and the
# site carries no component; any other failure is 1, and `tracy-agent.token` is written only on success.
joomla_bind_contract() {
  local contract="$1" workflow="$2" optional="${3:-0}" status=0 token='' verify=0 tmp f
  local committed="$SITE_DIR/tracy-agent.token" pending="$SITE_DIR/tracy-agent.token.pending"
  local showcase='' owed=0 stranded=''
  if [ "$workflow" != template ] && ! joomla_contract_id_valid "$contract"; then
    echo '!! refusing to bind: the provision named no valid content contract' >&2
    return 1
  fi
  # The mark decides, not the receipt: a phase an earlier pass started, with no request id to revert
  # it with (no receipt, or one that holds none), is settled as failed now, before any road below
  # would read its missing receipt as "not laid down" (`tracy_showcase_stranded`).
  ! tracy_showcase_stranded || stranded=1
  [ -n "$stranded" ] || showcase="$(tracy_showcase_request)" || owed=$?
  # A receipt that holds no request id was said and is kept for a person (`tracy_showcase_request`):
  # the pairing goes on without the phase, which is cosmetic, and settles nothing.
  [ "$owed" != 2 ] || showcase=''
  # Only the bootstrap of a binding workflow runs the phase; the other roads settle it below.
  local request=''
  [ "$workflow" != contract ] || request="$showcase"
  # The token files are this host's own, written only by this function or `mint-agent-token.sh`: a
  # link, a pipe or a folder in their place is not a pairing to keep, read or write through.
  for f in "$committed" "$pending"; do
    if [ -L "$f" ] || { [ -e "$f" ] && [ ! -f "$f" ]; }; then
      echo "!! refusing to pair: ${f##*/} is not a plain file" >&2
      return 1
    fi
  done
  if [ -e "$committed" ]; then
    token="$(joomla_token_held "$committed")" || return 1
    verify=1
  elif [ -e "$pending" ]; then
    # A pending file is only ever put in place whole (written beside, then renamed), so one that does
    # not hold a token was damaged after the fact — and the token it held may already sit in the
    # component. A fresh token here would read as a first pairing and reset the site a second time,
    # so the pass stops and leaves the file for a person to look at.
    token="$(joomla_token_held "$pending")" || {
      echo '!! tracy-agent.token.pending is kept as it is: the component may already hold the token it was minted with' >&2
      return 1
    }
  else
    # No committed token and none pending: no pass on this host got as far as minting one.
    token="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    [[ "$token" =~ ^[a-f0-9]{64}$ ]] || { echo '!! could not mint a pairing token' >&2; return 1; }
    tmp="$(mktemp "$SITE_DIR/.tracy-agent.token.XXXXXX")" || { echo '!! could not keep the minted token pending' >&2; return 1; }
    # The token in a file left here was never handed in, so it pairs nothing; but it is a token,
    # and a temporary file that will not go is named rather than left behind in silence.
    printf '%s\n' "$token" > "$tmp" && mv -f "$tmp" "$pending" || {
      echo '!! could not keep the minted token pending' >&2
      joomla_token_drop "$tmp" || echo "!! and ${tmp##*/} could not be removed: delete it by hand (it holds a token nothing was paired with)" >&2
      return 1
    }
    # The same check as a pending file a pass before left: the container sees no token the host
    # does not hold, whole and private.
    [ "$(joomla_token_held "$pending")" = "$token" ] || return 1
  fi
  # The bootstrap runs the phase after it binds: from here the site may be half-edited (lib/showcase-nav.sh).
  # `begun`: an earlier pass already started it. The bootstrap is told (`TRACY_SHOWCASE_RESUMED=1`) and
  # does not apply again: it takes back what that pass applied and inspects (`tracy_showcase_phase`).
  # A road on which no bootstrap reaches it (no component, no contract) settles it as failed, never as
  # skipped (`tracy_showcase_skip`). A mark that cannot be written never stops the pairing: the phase
  # then does not run, and is settled as skipped once the pairing holds.
  local begun='' resumed=0 unmarked=''
  ! tracy_showcase_started || begun=1
  if [ -n "$request" ] && [ -n "$begun" ]; then
    resumed=1
  elif [ -n "$request" ] && ! tracy_showcase_start; then
    request=''
    unmarked=1
  fi
  if [ "$verify" = 1 ]; then
    { printf '%s\n' "$token"; cat "$HERE/joomla-bootstrap.php"; } | (cd "$SITE_DIR"; docker compose exec -T -e TRACY_SHOWCASE_REQUEST="$request" -e TRACY_PAIR_OPTIONAL="$optional" -e TRACY_CONTRACT_VERIFY_ONLY=1 -e TRACY_CONTRACT_ID="$contract" -e TRACY_BUILD_WORKFLOW="$workflow" -e TRACY_SHOWCASE_RESUMED="$resumed" web sh -c 'IFS= read -r TRACY_PAIR_TOKEN && export TRACY_PAIR_TOKEN && exec php') || status=$?
  else
    { printf '%s\n' "$token"; cat "$HERE/joomla-bootstrap.php"; } | (cd "$SITE_DIR"; docker compose exec -T -e TRACY_SHOWCASE_REQUEST="$request" -e TRACY_PAIR_OPTIONAL="$optional" -e TRACY_CONTRACT_ID="$contract" -e TRACY_BUILD_WORKFLOW="$workflow" -e TRACY_SHOWCASE_RESUMED="$resumed" web sh -c 'IFS= read -r TRACY_PAIR_TOKEN && export TRACY_PAIR_TOKEN && exec php') || status=$?
  fi
  if [ "$status" = 3 ]; then
    # No component: the token was stored nowhere, so nothing is kept for a resume. "No component" is
    # an answer (status 3), which the caller takes as a finished pass, only once the pending file is
    # really gone: a pass is never called done while a token it minted is still on disk.
    if [ "$verify" != 1 ] && ! joomla_token_drop "$pending"; then
      echo '!! no component took the token, but tracy-agent.token.pending could not be removed' >&2
      return 1
    fi
    if [ "$optional" = 1 ]; then
      # No component answered, so this pass's phase never reached the site; only an earlier one counts.
      [ -n "$begun" ] || rm -f -- "$(tracy_showcase_started_mark)"
      [ -n "$stranded" ] || tracy_showcase_skip 'no Cowork component on this site, so nothing is bound' || return 1
      return 3
    fi
    return 1
  fi
  if [ "$status" != 0 ]; then
    # Kept, never replaced, whatever the bootstrap answered — a refusal of a component paired to
    # another token included: that is a site for a person to look at, not one to pair over.
    [ "$verify" = 1 ] || echo '!! Cowork pairing did not finish; tracy-agent.token.pending is kept so the next pass resumes it (or a person looks at a refused pairing)' >&2
    return 1
  fi
  # Every step of the commit is checked: a pass is done only once `tracy-agent.token` holds THIS
  # token at 0600, read back. A pass that fails here keeps what it has, and the next one resumes.
  if [ "$verify" = 1 ]; then
    joomla_token_drop "$pending" || { echo '!! the pairing holds, but a stale tracy-agent.token.pending could not be removed' >&2; return 1; }
  else
    mv -f "$pending" "$committed" || { echo '!! the pairing holds, but tracy-agent.token could not be written; the next pass resumes it' >&2; return 1; }
  fi
  [ "$(joomla_token_held "$committed")" = "$token" ] || {
    echo '!! the pairing holds, but tracy-agent.token is not this token at 0600; the next pass checks it again' >&2
    return 1
  }
  if [ -n "$stranded" ]; then
    # Already settled as failed above; nothing more is owed or said.
    :
  elif [ "$workflow" = contract ]; then
    # The bootstrap said applied, skipped or failed, and the contract inspected as bound: nothing is
    # owed any more.
    if [ -n "$unmarked" ]; then
      tracy_showcase_settle 'skipped — the phase could not be marked as started'
    elif [ -n "$showcase" ]; then
      tracy_showcase_settle
    elif [ "$owed" != 2 ]; then
      tracy_showcase_not_new
    fi
  elif [ "$workflow" = template ]; then
    tracy_showcase_skip 'this card carries no content contract, so it has no showcase map' || return 1
  else
    tracy_showcase_skip 'a site under construction is built by its builder, not handed over as the template' || return 1
  fi
  return 0
}

# The component IS the door: `com_claudecowork` answers `tracy_site` and every stage of a Build.
# Two callers reach these functions — a release that ships the package as a part beside its
# archive, and a release that does not (almost every one: measured 19/09, 86 of 88 releases
# answered `cowork: false`). One installer for both, so the two roads cannot drift apart.
# The error a failed Joomla CLI install threw, as one line, read from the installer's output on stdin.
# Symfony Console prints a thrown error as `In <File>.php line <n>:` and an INDENTED message block,
# then the command's usage synopsis unindented — so the last line of a failed job was the synopsis
# and /ops read a usage dump (ja-restaurant 1.0.0). tracy-web's `failureReason` reads the
# `!! installer: <message>` line this feeds. With no block: the last line that is not the synopsis.
joomla_installer_error() {
  awk '
    /^In [^ ]+ line [0-9]+:$/ { inblock = 1; msg = ""; next }
    inblock && /^[ \t]*$/ { if (msg != "") inblock = 0; next }
    inblock && /^[ \t]/ { line = $0; gsub(/^[ \t]+|[ \t]+$/, "", line); msg = (msg == "" ? line : msg " " line); found = msg; next }
    inblock { inblock = 0 }
    /^[a-z][A-Za-z0-9_:-]* \[-/ { next }
    /[^ \t]/ { last = $0; gsub(/^[ \t]+|[ \t]+$/, "", last) }
    END { print (found != "" ? found : last) }
  '
}

joomla_install_cowork_package() {
  (cd "$SITE_DIR"; docker compose cp "$1" web:/tmp/tracy-contract-cowork.zip) || return 1
  (cd "$SITE_DIR"; docker compose exec -T web php < "$HERE/joomla-contract-install.php") || return 1
}

# Tracy's own package, from the SAME manifest `platform_compose` reads for a fleet-born site
# (`lib/cowork-extension.sh` says why it is asked rather than globbed, and why the floor exists).
# WordPress has had this since its quickstart road was written — `tracy_wp_install_doors` installs
# the plugin for a card with nothing sealed too; this is the Joomla half of the same rule.
joomla_install_cowork_release() {
  . "$HERE/../lib/cowork-extension.sh"
  local version url package
  read -r version url <<<"$(cowork_latest joomla "${COWORK_FLOOR:-0.24.1}")"
  [ -n "$url" ] || { echo '!! could not resolve a cowork release — the site stands without its door' >&2; return 1; }
  echo "==> installing Tracy's Cowork component ${version}"
  # from the host's cache, fetched once per version and never under a total time cap (`cowork_package` says why)
  package="$(cowork_package joomla "$version" "$url")" || return 1
  joomla_install_cowork_package "$package"
}

# Usage: joomla_fetch_contract CONTRACT. The profile a site is bound to, put into its component
# while the provisioner is still root and online, between the install and the bind.
#
# 🔒 A COMPONENT FROM 0.24.55 ON CARRIES NO PROFILES. It ships an index (`lib/contracts.json`) and
# fetches the profile on first use into `lib/contracts/<id>` — inside its own code folder, which the
# install above wrote as root. So the site (www-data) could not create it, and every new Joomla
# quickstart on dev died at the bind with `contract_unavailable: cannot create
# …/lib/contracts/ja-fresco/j6`, half built. `joomla-contract-fetch.php` runs the component's own
# `ContractFetch::ensure` as root (asset names, named profiles and checks stay the component's),
# leaves the profile 0755/0644 so the site reads it, and is a no-op for a component that predates
# fetching or a profile already on disk. A failure stops here, before the bind, naming the profile.
joomla_fetch_contract() {
  local contract="$1"
  [ -n "$contract" ] || return 0
  joomla_contract_id_valid "$contract" || { echo '!! the contract to fetch is not a profile id' >&2; return 1; }
  (cd "$SITE_DIR"; docker compose exec -T -e TRACY_CONTRACT_ID="$contract" web php < "$HERE/joomla-contract-fetch.php") \
    || { echo "!! contract profile $contract: not on disk — the site cannot be bound to it" >&2; return 1; }
}


# A Tracy quickstart uses the captured-site restore hooks above and adds a private first boot.
# Its image (the 6-apache line) is resolved at the top of this file.
if [ -n "${QUICKSTART:-}" ]; then

  # ── The `installer` shape (todo-design-inspiration-card-ops.md §80+ quickstart JA) ────────────
  #
  # A THIRD shape, and the one 79 older `quickstart/ja-*` releases already sit in: one zip holding
  # a complete Joomla webroot AND Joomla's own `installation/` folder. No .jpa, no database dump —
  # so nothing here is RESTORED. The site is BUILT on this host by running Joomla's CLI installer
  # against the stack's MariaDB, exactly as a person would through the browser installer.
  #
  # 🔒 MEASURED 16/09 ON `ja-space`, and the measurement is what decides the steps below:
  #   - the CLI DOES load `installation/sql/mysql/custom.sql`, which is JA's demo content
  #     (`InstallCommand`, step `custom2`, skipped only when the file is absent). 23 articles, 57
  #     menu items, `ja_space` as the default style. So there is NO second load here — a second
  #     pass would double every demo article;
  #   - `createTables()` substitutes `#__` with the prefix passed on the command line, so the demo
  #     data lands on the tables this provision then reads. The prefix is passed, never defaulted:
  #     the default is RANDOM per run, which would make a re-provision unreadable;
  #   - the CLI deletes `installation/` itself, but only on a Stable release — it keeps it on a
  #     development build. So this file removes it too rather than trusting the version;
  #   - the installer runs as root, so the finished webroot is root-owned and the site answers 500
  #     until it is chowned. The log then says "Allowed memory size exhausted" in `LanguageHelper`,
  #     which names neither permissions nor the webroot.
  #
  # The catalog is asked which shape this is — the shell lists no ids, same rule as `--platform`.
  QUICKSTART_INSTALLER="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field installer.file 2>/dev/null)" ||
    QUICKSTART_INSTALLER=""
  if [ -n "${QUICKSTART_INSTALLER:-}" ]; then
    # provision.sh put this quickstart on the captured-site road before sourcing this file. Take it
    # off: there is no webroot tar and no database dump in the release, and leaving the keys set
    # sends the provision looking for archives nobody published — a 404 that names the wrong thing.
    WEBROOT_KEY=""
    DB_KEY=""
    PLATFORM_NEEDS_WEBROOT=0
    # ...but the installed webroot IS real and must be booked, or the owner and the developer
    # cannot edit the site this host just built for them (the split is explained in provision.sh).
    PLATFORM_HAS_WEBROOT=1

    # Deterministic, and the same `tr_` every fleet-born Joomla site already uses
    # (render-compose.sh): post-install work must never have to discover the prefix.
    INSTALLER_DB_PREFIX=tr_

    # The installer writes configuration.php itself, for THIS environment. There is nothing to
    # rewrite and no SEF domain to neutralize — no captured site ever set one.
    platform_configure() {
      :
    }

    # Unpacked BEFORE the stack comes up, because stage 6 starts the web container and a webroot
    # that arrives afterwards is a site Apache served empty first.
    joomla_installer_unpack() {
      local webroot archive
      webroot="$(tracy_webroot_dir "$LABEL")"
      # A re-provision of a site that is already built: the CLI refuses a webroot that has a
      # configuration.php, and unpacking over a live site would put `installation/` back beside it.
      [ ! -f "$webroot/configuration.php" ] || {
        echo "==> the webroot already carries an installed site — not unpacking the package again"
        return 0
      }
      echo "==> fetching the quickstart package ($QUICKSTART_INSTALLER)"
      archive="$SITE_DIR/work/installer.zip"
      python3 "$HERE/quickstart.py" --id "$QUICKSTART" --part installer --out "$archive" || return 1
      echo "==> unpacking it into the webroot"
      # Members were held to the same rule a webroot tar is (quickstart.py), at download time.
      python3 - "$archive" "$webroot" <<'PY' || { rm -f "$archive"; return 1; }
import pathlib, sys, zipfile

archive, webroot = sys.argv[1], pathlib.Path(sys.argv[2])
with zipfile.ZipFile(archive) as package:
    package.extractall(webroot)
PY
      rm -f "$archive"
    }

    platform_compose() {
      # `mod_headers` is not enabled in the joomla image, so it is mounted in — and the Apache conf
      # is written HERE because stage 2 writes it only for platforms that fetch a webroot.
      mkdir -p "$SITE_DIR/apache"
      cat > "$SITE_DIR/apache/headers.load" <<'LOAD'
LoadModule headers_module /usr/lib/apache2/modules/mod_headers.so
LOAD
      tracy_write_apache_conf "$SITE_DIR" on
      joomla_installer_unpack || return 1
      COMPOSE_FLAVOR=clone tracy_render_compose
    }

    # Run from platform_post_up, once the database is up and the web container is running.
    joomla_installer_install() {
      local webroot admin_password runtime_dirs
      webroot="$(tracy_webroot_dir "$LABEL")"
      if [ -f "$webroot/configuration.php" ]; then
        echo '==> the quickstart is already installed — leaving it alone'
        return 0
      fi
      [ -f "$webroot/installation/joomla.php" ] || {
        echo 'the quickstart package carried no installation/joomla.php' >&2; return 1; }

      # Generated once, then kept — same rule as DB_PASSWORD and for the same reason: a
      # re-provision must not strand an installed site behind a password younger than its database.
      # The one admin the installer creates is the SITE AGENT, not a person: people enter through
      # the cowork auto-login. Never printed; break-glass only.
      if ! grep -qs '^JOOMLA_ADMIN_PASSWORD=' "$SITE_DIR/.env"; then
        echo "JOOMLA_ADMIN_PASSWORD=$(head -c 24 /dev/urandom | base64 | tr -d '+/=\n')" >> "$SITE_DIR/.env"
      fi
      admin_password="$(sed -n 's/^JOOMLA_ADMIN_PASSWORD=//p' "$SITE_DIR/.env" | sed -n 1p)"

      # This run builds the site, so it owes the site its showcase-navigation phase (lib/showcase-nav.sh).
      # The installer shape never reaches provision.sh's webroot extract, where every other quickstart
      # writes its receipt, so it is written here: past the "already installed" return above (a re-run
      # on a built site gets none), before the CLI writes configuration.php. A pass that stopped after
      # it keeps its receipt, and so its request id.
      tracy_showcase_begin

      echo "==> building the quickstart with Joomla's own CLI installer"
      # `--db-pass` is passed even though the help calls it optional: under --no-interaction every
      # field the installer reaches is read from the options, and an absent one ends the command
      # with "db-pass has been declared, but has not been given!".
      #
      # The address is composed from FLEET_ZONE rather than written out: this deployment is not
      # always tracy.ai, and an agent identity carrying the wrong deployment's domain is the kind
      # of wrong that never announces itself.
      #
      # The output is captured and printed whole, then, on failure, the thrown error is printed once
      # more as its own `!! installer: <message>` line: Symfony ends a failed command with its usage
      # synopsis, which would otherwise be the line the job is reported by (joomla_installer_error).
      local out rc=0
      out="$( cd "$SITE_DIR" && docker compose exec -T -w /var/www/html web \
          php installation/joomla.php install --no-interaction \
            --site-name "$LABEL" \
            --admin-user 'Tracy Agent' --admin-username tracyagent \
            --admin-password "$admin_password" --admin-email "tracy-agent@$FLEET_ZONE" \
            --db-type mysqli --db-host db --db-user "$DB_USER" --db-pass "$DB_PASSWORD" \
            --db-name "$DB_NAME" --db-prefix "$INSTALLER_DB_PREFIX" 2>&1 )" || rc=$?
      [ -n "$out" ] && printf '%s\n' "$out"
      if [ "$rc" -ne 0 ]; then
        echo "!! installer: $(printf '%s\n' "$out" | joomla_installer_error)" >&2
        return 1
      fi

      [ -f "$webroot/configuration.php" ] || {
        echo 'the CLI installer reported success but wrote no configuration.php' >&2; return 1; }
      # Belt and braces: the CLI removes this itself on a Stable release and keeps it on a
      # development build, and Joomla redirects to a missing installer with a 500 rather than serving.
      rm -rf "$webroot/installation"

      # Stage 6a chowns the webroot — but only for platforms that FETCH one, and this shape fetches
      # none. Without it the site answers 500 (measured 16/09; see the block at the top).
      runtime_dirs="$(platform_runtime_dirs)"
      ( cd "$SITE_DIR" && docker compose exec -T web sh -c \
          "cd /var/www/html && mkdir -p $runtime_dirs && chown -R www-data:www-data /var/www/html" ) ||
        echo '!! could not set ownership — expected on a macOS bind mount, a real problem on Linux' >&2

      # Joomla ships htaccess.txt and leaves the rename to a person; stage 5b is in the same
      # turned-off block. Without it SEF URLs never reach index.php.
      tracy_ensure_webroot_htaccess "$webroot"
      echo '==> the quickstart is installed, with the demo content its custom.sql carries'
    }
  fi

  platform_post_up() {
    local webroot
    webroot="$(tracy_webroot_dir "$LABEL")"
    # The installer shape has nothing on disk yet but a webroot and its installation/ folder; every
    # assertion below is about a FINISHED site, so the site is finished first. Every other shape
    # skips straight past this — provision.sh restored theirs at stage 1.
    [ -z "${QUICKSTART_INSTALLER:-}" ] || joomla_installer_install || return 1
    [ -f "$webroot/configuration.php" ] || { echo 'quickstart configuration is missing' >&2; return 1; }
    [ ! -d "$webroot/installation" ] || { echo 'quickstart installer was not removed' >&2; return 1; }
    if [ "${BUILD_WORKFLOW:-contract}" = template ]; then
      # A template card: the site is what was released, and no design template goes on top.
      #
      # ── SEALED WHEN THE RELEASE HAS A PROFILE ────────────────────────────────────────────────
      # `tracy-web` puts `contract` on the entry when a profile in this repo seals exactly this
      # release AND version (`lib/contracts.js`), so the question "is this card's presentation
      # accounted for" is already answered before the provision starts. A card with one is bound
      # like any other quickstart; a card with none stays as it was — installed as seen, unsealed.
      #
      # 🔒 AND AN UNSEALED SITE IS NOT A HARMLESS ONE. `EngineFactory::buildContract` falls back to
      # `DEFAULT_CONTRACT = tracy-apple/j6/1.1.0` when a site names no contract and no build
      # baseline — so the component verified JA Voyara's files against Apple's lock and refused the
      # first inspection with `Presentation asset changed: templates/tracy/acm/accordion/config.xml`,
      # a path that does not exist in that archive. Measured 17/09 on `site-hptb1b`, whose params
      # read `{"contract":"","webroot":""}`. Binding the profile the release actually has is what
      # makes that answer true instead of borrowed.
      local card_contract=''
      card_contract="$(joomla_card_contract)" || return 1
      if [ -z "$card_contract" ]; then
        [ ! -f "$TRACY_SITES_ROOT/.content-contracts/$LABEL.json" ] || { echo 'refusing to reopen a protected site as a template' >&2; return 1; }
      else
        # Written BEFORE the bind, and outside every site root, for the reason the contract road
        # gives: a failed bootstrap must never leave an unrestricted site behind.
        mkdir -p "$TRACY_SITES_ROOT/.content-contracts"
        printf '{"contract":"%s","design":"%s","requested":"%s","policy":1}\n' \
          "$card_contract" "${TEMPLATE_ELEMENT:-$card_contract}" "${DESIGN:-$card_contract}" \
          > "$TRACY_SITES_ROOT/.content-contracts/$LABEL.json"
        chmod 644 "$TRACY_SITES_ROOT/.content-contracts/$LABEL.json"
        echo "==> this card is sealed by $card_contract"
      fi
      # ── Tracy's Cowork component, on every card ──────────────────────────────────────────────
      # A quickstart somebody else packed ships no Cowork, and this road used to leave the site
      # with no door at all — a site with no door is not "a demo without an agent" once a customer
      # presses Build on it: every stage is a content call, so the first one dies and the other six
      # never run. Measured 17/09 on `site-8eo60a` (`quickstart/ja-voyara/j6`, the door answered
      # 404) and again 19/09 on `site-oo0sea`, built from the `ja-resort` card, where stage `check`
      # failed in 290 ms with `COMPONENT_NOT_REGISTERED`.
      #
      # 🔒 THE FIRST FIX HERE ONLY INSTALLED WHAT THE RELEASE CARRIED, AND NO RELEASE CARRIES IT.
      # `tracy_setting.json` may offer the package as a part beside the archive (ADR 0017 §4), so
      # that is still asked first — but measured 19/09 on the dev machine, 86 of the 88 releases
      # `tracy-web` had read answered `cowork: false` and the other two carried no setting at
      # all. The component is TRACY'S, not the publisher's, so a release that offers none is not a
      # site that must go without: Tracy installs its own, from the manifest every fleet-born site
      # already uses. A download that FAILS after a release offered one is still a real failure and
      # stops the provision, the same as on the contract road.
      # 🔒 A SEALED CARD MUST NOT BE GIVEN A CLAUDE COWORK PLUGIN THAT CANNOT BIND, AND THAT IS WORTH STOPPING
      # THE PROVISION FOR. The bind below calls `content.contract`, an action the Claude Cowork plugin only grew
      # in 0.14.0; `cowork_latest` installs whatever `update.json` advertises above the floor, and on
      # 19/09 that was 0.12.0. So without a floor this road stood the site up, installed 0.12.0, and
      # died at the last step with `Quickstart contract binding failed` — two minutes in, with the
      # site healthy and nothing pointing at the Claude Cowork plugin. Measured on `site-lp4yub`.
      #
      # The floor comes from the contract profile that seals this card (`coworkContractVersion`), threaded
      # here by tracy-web as `--cowork-min-version`. Failing HERE, before anything is installed, is the
      # whole point: the alternative is the late failure this comment describes.
      if [ -n "$card_contract" ] && [ -z "${COWORK_FLOOR:-}" ]; then
        echo "!! $card_contract seals this card but no --cowork-min-version was passed; refusing to install a Claude Cowork plugin that may not bind" >&2
        return 1
      fi
      local cowork_installed=0
      if python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field cowork.file >/dev/null 2>&1; then
        echo '==> installing the Cowork component this release carries'
        local package
        package="$(mktemp)"
        python3 "$HERE/quickstart.py" --id "$QUICKSTART" --part cowork --out "$package" || { rm -f "$package"; return 1; }
        joomla_install_cowork_package "$package" || { rm -f "$package"; return 1; }
        rm -f "$package"
        cowork_installed=1
      elif joomla_install_cowork_release; then
        cowork_installed=1
      else
        # Not a provision failure: the site itself is finished and worth serving. It simply has no
        # agent, and the warning above already said why.
        echo '!! this site stands without a Cowork component — it cannot be built on' >&2
      fi
      # The sealed card's profile, on disk before the bind reads it (`joomla_fetch_contract` says why).
      if [ "$cowork_installed" = 1 ]; then
        joomla_fetch_contract "$card_contract" || return 1
      fi
      echo '==> pairing the template with its private Cowork token'
      # Exit 3 from the bootstrap: no Cowork component on this site. That can only happen now when
      # the install above could not run at all (no manifest, no network), and such a site is still
      # worth serving — it simply has no agent, so there is no token to write and nothing to
      # verify. Any other non-zero exit is still a failure (16/09: ja-kinetic died here twice with
      # the site already up).
      #
      # 🔒 AND EXIT 3 IS ONLY TOLERATED WHEN NO COMPONENT COULD BE INSTALLED AT ALL. One installed
      # a few lines up means the component IS on disk, so "no component" can only be an install
      # that did not take — a failure to report, not a site to hand over doorless.
      local pair_status=0
      local pair_optional=1
      [ "$cowork_installed" = 0 ] || pair_optional=0
      # A sealed card pairs the way every other sealed quickstart does — the bootstrap BINDS, which
      # it only does when the workflow is not `template` (it stops after the manifest probe there).
      local pair_workflow=template
      [ -z "$card_contract" ] || pair_workflow=contract
      joomla_bind_contract "$card_contract" "$pair_workflow" "$pair_optional" || pair_status=$?
      if [ "$pair_status" = 3 ]; then
        echo '==> no Cowork component on this site — it runs without an agent'
        return 0
      fi
      [ "$pair_status" = 0 ] || return 1
      if [ -z "$card_contract" ]; then
        echo '==> template Cowork pairing verified (no content contract)'
        # 🔒 An unsealed card gets its reader too (30/09/2026; it waited for tracy-host's next start
        # before). Never fatal here, unlike a sealed card: nothing is bound that the reader must
        # agree with, and the card is a working site without the Content API.
        joomla_enable_content_reader \
          || echo '!! content reader: not enabled — the Content API answers 501 on this site until tracy-host tries again at its next start' >&2
      else
        echo "==> template Cowork pairing verified (sealed by $card_contract)"
        # A sealed card reads like any sealed quickstart: its reader is enabled the same way.
        joomla_enable_content_reader || return 1
      fi
      return 0
    fi
    [ -n "${CONTRACT_ID:-}" ] || { echo 'provision resolved no content contract for this quickstart' >&2; return 1; }
    joomla_contract_id_valid "$CONTRACT_ID" || { echo 'provision resolved a content contract that is not a profile id' >&2; return 1; }
    # This marker is outside every site root: agent file tools cannot remove their own policy.
    # Write it BEFORE installing/binding, so a failed bootstrap never exposes an unrestricted site.
    # It names the profile THIS design resolves to, not a fixed one — the base archive serves more
    # than one design now, and a marker that always said Apple would tell every later reader the
    # wrong thing about half the sites on the host.
    if [ "${BUILD_WORKFLOW:-contract}" != template-build ]; then
    mkdir -p "$TRACY_SITES_ROOT/.content-contracts"
    printf '{"contract":"%s","design":"%s","requested":"%s","policy":1}\n' \
      "$CONTRACT_ID" "$EFFECTIVE_DESIGN" "${DESIGN:-$EFFECTIVE_DESIGN}" \
      > "$TRACY_SITES_ROOT/.content-contracts/$LABEL.json"
    chmod 644 "$TRACY_SITES_ROOT/.content-contracts/$LABEL.json"
    else
      [ ! -f "$TRACY_SITES_ROOT/.content-contracts/$LABEL.json" ] || { echo 'refusing to reopen a protected site for construction' >&2; return 1; }
    fi
    # EVERY quickstart gets the Cowork component its release carries, the Base archive included.
    # Base ships one inside its JPA (0.15.0), and until 15/09 this step skipped it — so a Base
    # site ran whatever
    # the archive was packed with, and the fix that lets a site under construction answer the
    # contract door (claude-cowork joomla-v0.16.0) never reached it: every build from a design
    # with no template of its own died at "Install the template" with "Presentation asset changed"
    # (measured 14/09). Installing over the bundled copy is a plain Joomla package upgrade.
    local package
    package="$(mktemp)"
    python3 "$HERE/quickstart.py" --id "$QUICKSTART" --part cowork --out "$package" || { rm -f "$package"; return 1; }
    joomla_install_cowork_package "$package" || { rm -f "$package"; return 1; }
    rm -f "$package"
    joomla_fetch_contract "$CONTRACT_ID" || return 1

    # ── The design's own template, installed and activated BEFORE the contract is bound ────────
    # Before, because binding captures the site's final presentation: a template activated after
    # the bind is drift by definition, and the component would refuse the site it had just accepted.
    # A bundled design (Apple) has nothing to install and skips straight past this.
    if [ "${TEMPLATE_SOURCE:-bundled}" = artifact ]; then
      echo "==> installing the $EFFECTIVE_DESIGN template ($TEMPLATE_ELEMENT)"
      local template
      template="$(mktemp)"
      python3 "$HERE/design-artifact.py" --plan "$DESIGN_PLAN" --out "$template" || { rm -f "$template"; return 1; }
      (cd "$SITE_DIR"; docker compose cp "$template" web:/tmp/tracy-template.zip) || { rm -f "$template"; return 1; }
      rm -f "$template"
      (cd "$SITE_DIR"; docker compose cp "$DESIGN_PLAN" web:/tmp/tracy-template-plan.json) || return 1
      (cd "$SITE_DIR"; docker compose exec -T web php < "$HERE/joomla-template-activate.php") || return 1
    fi

    echo '==> pairing the quickstart with its private Cowork token'
    joomla_bind_contract "$CONTRACT_ID" "${BUILD_WORKFLOW:-contract}" 0 || return 1
    echo "==> quickstart Cowork pairing verified ($BUILD_WORKFLOW, baseline $CONTRACT_ID)"
    # Content API (`/content.json`): opt the new site in — its own seed, its row registry. After the
    # bind, because the reader reads the bound profile; skipped by the script itself when the
    # installed component predates the reader.
    joomla_enable_content_reader || return 1
  }
fi

# ── Import (a copy of a customer's own site) ─────────────────────────────────────────────────
#
# The clone road with no quickstart and no --fresh: the import wizard installed com_claudecowork on
# the customer's server to read it, so the copy comes up WITH the component. It gets what a
# quickstart gets right after its component is in place — the Content API opt-in
# (`joomla-content-identity.php`: the site seed and the row identity registry, both the component's
# own tables and params) — or `content.read`/`content.locate` answer 501 on the copy and the element
# picker sends no location (decision 3, 27/09/2026). The script skips a component that predates the
# reader, and a Joomla the reader does not support, and says so.
#
# 🔒 A NEW SEED ONLY FOR A DATABASE THIS PASS IMPORTED. The host-side marker says "this site already
# got its own seed" — true of the database the marker was written against. An import provision loads
# the customer's database again (`DB_IMPORTED`, provision.sh stage 4), and a marker left by the pass
# before would then keep the seed that came with the archive. A pass that imported nothing keeps the
# seed it has, so the ids already handed out stay valid.
#
# Never fatal, for the reason the WordPress import gives: a copy without the Content API is still a
# working copy.
if [ "${FRESH:-0}" != 1 ] && [ -z "${QUICKSTART:-}" ]; then
  platform_post_up() {
    platform_config_loads
    [ "${DB_IMPORTED:-0}" = 1 ] && rm -f "$SITE_DIR/content-identity.done"
    echo '==> content reader (import): opting the copy in through its Claude Cowork component'
    joomla_enable_content_reader \
      || echo '!! content reader (import): not enabled — the Content API answers 501 on this copy until the identity registry is installed' >&2
    joomla_derive_contract
    return 0
  }
fi
