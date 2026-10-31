#!/usr/bin/env bash
#
# render-compose — write a site's docker-compose.yml, and write nothing else.
#
# ## Why this is its own file
#
# The compose file used to be written in four places: provision.sh for a restored site, and
# platform/{joomla,wordpress,emdash}.sh for the three that stand a site up differently. Four copies
# of one shape was survivable while nothing changed in all four at once — and then Plan 3 changed
# exactly that: every web container now also carries the site folder, because the agent's bash runs
# inside it (`docker exec -u www-data -w /site/<label>`). A mount added to three of four copies is
# a site whose agent lands in an empty directory and says, fluently, that the site has nothing in
# it. So the shape lives here once, and the platform files decide only what is theirs to decide.
#
# ## Two callers
#
#   1. provision.sh sources this file and calls `tracy_render_compose` once it has settled the
#      port, the database password and whatever secrets the platform generates.
#   2. `render-compose.sh <label>` re-renders an EXISTING site's compose from what is on disk —
#      the site's `.env`, and the compose file already there. That is how a site running today
#      picks up the site-folder mounts and the web image with the agent's tools in it, without
#      being provisioned again.
#
# ## Safe to re-run on a live site
#
# It writes one file. It does not start, stop, or recreate anything, and it does not touch the
# webroot, the database volume or the site folder. Re-rendering a site's compose and never running
# `docker compose up` leaves the site exactly as it was — which is what makes it usable from a
# migration script that wants to check the file before it recreates the container.
#
# ## What it will not guess
#
# Every value it writes comes from the caller, from the site's `.env`, or from the compose file
# already on disk. Nothing is defaulted into place: a re-render that cannot tell whether a site is
# a clone or a fleet-born install refuses rather than writing the other shape over it, because the
# two differ by an installer that would run against a webroot that already has a site in it.

# ── the shapes ──────────────────────────────────────────────────────────────────────────────
#
# Inputs, all through the environment, all required unless noted:
#
#   SITE_DIR        the site's directory (/srv/tracy/<label>)
#   LABEL           the site's label — the name of its directory, its containers and its folder
#   PLATFORM        joomla | wordpress | emdash
#   COMPOSE_FLAVOR  clone (a restored site) | fresh (the platform's own installer runs)
#   WEB_IMAGE       the image the web service runs
#   DB_NAME         database name        (not read by emdash)
#   DB_SQL_MODE     the relaxed sql-mode (not read by emdash)
#   JOOMLA_EXTENSIONS_URLS   optional, fresh Joomla only: what the installer installs with Joomla
#   TRACY_MAIL_URL           optional: where site mail goes (default: tracy-web on the tracy network)
#   TRACY_NETWORK_PREFIX     optional: first three octets of the tracy network (tracy_mail_url)
#   TRACY_SITE_MEMORY, TRACY_SITE_MEMORY_EMDASH, TRACY_SITE_DB_MEMORY, TRACY_SITE_CPUS,
#   TRACY_SITE_PIDS          optional: this host's resource caps (tracy_site_limits, below)

# ── resource caps: what one site may take from the machine ──────────────────────────────────────
#
# Every agent command runs INSIDE the site's web container (`docker exec -u www-data`, Plan 3 and
# ADR 0014): bash, node, wp-cli, the browser `page.look` drives, EmDash's `astro build` for
# `site.rebuild`. Until 28/09/2026 nothing bounded any of it — `docker inspect` on the stand read
# Memory=0 NanoCpus=0 PidsLimit=<none> for every site container — so one site's runaway command
# could take the memory, the cores or the process table that every other customer's site on the host
# lives on (the dev machine OOM-killed an EmDash rebuild with ~500 MB free, 26/09/2026). And the
# database is reachable from that shell too: a query is the agent's command running in `db`.
#
# So both services carry the same four lines (`tracy_limits_run`):
#   mem_limit      memory, page cache included — the kernel reclaims cache first, and only memory it
#                  cannot reclaim ends in the kernel killing the biggest process IN THIS CONTAINER
#   memswap_limit  EQUAL to mem_limit: no escape from the cap into the host's swap, where one site
#                  thrashing the disk slows every site on it
#   cpus           a share of the machine's cores; a busy site slows itself, not its neighbours
#   pids_limit     processes AND threads (Chromium alone runs ~160); a fork bomb stops here
#
# Defaults, from the stand on 28/09/2026 (six bench sites under a full v6 run, `docker stats` every
# 3 s for 42 minutes plus each container's cgroup `memory.stat`, and throwaway `astro build` runs
# under a cap) — the numbers are in tracy_site_limits.
#
# One value per HOST, never per site: a host sets the knobs above in its env (deploy/.env on a
# laptop, /etc/tracy/tracy-web.env on a server — tracy-host hands that environment to provision.sh),
# and every site rendered on it gets the same caps. A running site keeps the caps its container was
# created with; `apply-site-limits.sh` puts these values on live containers without recreating them.

# One knob's value on this host: the environment first, then the host's tracy-web env file (a hand
# run of this script on a server, where the environment is a person's shell), then the default —
# the order `tracy_mail_url` reads the network prefix in.
tracy_limit_setting() {
  local value="${!1:-}"
  if [ -z "$value" ]; then
    value="$(grep -m1 "^$1=" "${TRACY_WEB_ENV_FILE:-/etc/tracy/tracy-web.env}" 2>/dev/null \
      | cut -d= -f2- | tr -d "\"'\r" || true)"
  fi
  printf '%s' "${value:-$2}"
}

# A memory size as a cap is written — whole mebibytes or gibibytes, `1536m` or `2g`, docker's binary
# units — in MiB. Prints nothing for anything else (`2GB`, `1.5g`, `2 g`, a bare number of bytes).
tracy_memory_mib() {
  [[ "$1" =~ ^[1-9][0-9]*m$ ]] && { printf '%s' "${1%m}"; return 0; }
  [[ "$1" =~ ^[1-9][0-9]*g$ ]] && { printf '%s' "$((${1%g} * 1024))"; return 0; }
  return 1
}

# The cores this machine has. `TRACY_HOST_CPUS` when the caller already asked docker (the apply
# script asks the daemon, which is what `--cpus` is checked against); otherwise the machine itself
# — this script runs on the docker host or inside tracy-host, which sees the host's cores.
tracy_host_cpus() {
  local n="${TRACY_HOST_CPUS:-}"
  [[ "$n" =~ ^[1-9][0-9]*$ ]] || n="$(getconf _NPROCESSORS_ONLN 2>/dev/null || true)"
  [[ "$n" =~ ^[1-9][0-9]*$ ]] || n="$(nproc 2>/dev/null || true)"
  [[ "$n" =~ ^[1-9][0-9]*$ ]] || n=1
  printf '%s' "$n"
}

# This host's caps for one site, into SITE_LIMIT_WEB_MEMORY, SITE_LIMIT_DB_MEMORY, SITE_LIMIT_CPUS
# and SITE_LIMIT_PIDS — or a refusal naming the setting, before anything is written. A typo in a
# host's env must stop a render loudly, not produce sites that crash-loop under a 15 MB cap.
# SITE_LIMIT_NOTE carries what the caller should say about a setting it had to hold to the machine.
#
#   TRACY_SITE_MEMORY         2g     Joomla/WordPress web. The heaviest measured: a Joomla container
#                                    with the browser open held 926 MiB it could not give back
#                                    (anonymous) beside 550 MiB of page cache it could; WordPress
#                                    peaked at 946 MiB, most of it cache. Twice what cannot be
#                                    reclaimed, so a busy Apache and a page.look fit together.
#   TRACY_SITE_MEMORY_EMDASH  3g     EmDash web: the Node server (110–340 MiB) and `astro build`
#                                    beside it. Uncapped, the build grew to 2.2 GiB — Node sizes its
#                                    heap from the memory it sees; under a 3g cap it sizes it to
#                                    1.7 GiB and the build finished with the container at 1.9 GiB
#                                    (under 2g it hit the cap and still finished, with no room left
#                                    for the server or a browser).
#   TRACY_SITE_DB_MEMORY      1g     MariaDB: measured 156–295 MiB. Generous on purpose — a killed
#                                    database is a crash recovery, a slow one is only slow — and it
#                                    still holds an import that uses the 256M max_allowed_packet.
#   TRACY_SITE_CPUS           2, or 1 on a host with fewer than 4 cores; web and db each. Clamped
#                                    to the machine: docker refuses to create a container asking
#                                    for more cores than there are ("range of CPUs is from 0.01 to
#                                    10.00"), and a site that cannot be created is worse than one
#                                    that is not capped. An EmDash rebuild took 28–63 s under 2.
#   TRACY_SITE_PIDS           1024   web and db each. Measured peaks: 180 (the browser open in a
#                                    Joomla container), 172 (an EmDash rebuild beside its server),
#                                    34 (MariaDB); Apache's own ceiling is 150 workers.
tracy_site_limits() {
  local platform="${1:-${PLATFORM:-}}" web_name web_default web db cpus pids host mib pair
  SITE_LIMIT_NOTE=""
  case "$platform" in
    emdash) web_name=TRACY_SITE_MEMORY_EMDASH; web_default=3g ;;
    *) web_name=TRACY_SITE_MEMORY; web_default=2g ;;
  esac
  web="$(tracy_limit_setting "$web_name" "$web_default")"
  db="$(tracy_limit_setting TRACY_SITE_DB_MEMORY 1g)"
  for pair in "$web_name=$web" "TRACY_SITE_DB_MEMORY=$db"; do
    mib="$(tracy_memory_mib "${pair#*=}" || true)"
    if [ -z "$mib" ]; then
      echo "$pair is not a memory size docker takes as a cap — write whole megabytes or gigabytes, e.g. 1536m or 2g" >&2
      return 1
    fi
    if [ "$mib" -lt 256 ]; then
      echo "$pair is below 256m — less than one idle site uses; refusing a cap every site would die under" >&2
      return 1
    fi
  done

  host="$(tracy_host_cpus)"
  if [ "$host" -ge 4 ]; then cpus=2; else cpus=1; fi
  cpus="$(tracy_limit_setting TRACY_SITE_CPUS "$cpus")"
  if ! [[ "$cpus" =~ ^([1-9][0-9]*(\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)$ ]]; then
    echo "TRACY_SITE_CPUS=$cpus is not a positive number of cores (e.g. 2 or 1.5)" >&2
    return 1
  fi
  if awk -v want="$cpus" -v have="$host" 'BEGIN { exit !(want > have) }'; then
    SITE_LIMIT_NOTE="   TRACY_SITE_CPUS=$cpus is more cores than this machine has ($host) — capped at $host"
    cpus="$host"
  fi

  pids="$(tracy_limit_setting TRACY_SITE_PIDS 1024)"
  if ! [[ "$pids" =~ ^[1-9][0-9]*$ ]] || [ "$pids" -lt 64 ]; then
    echo "TRACY_SITE_PIDS=$pids is not a process count of at least 64" >&2
    return 1
  fi

  SITE_LIMIT_WEB_MEMORY="$web"
  SITE_LIMIT_DB_MEMORY="$db"
  SITE_LIMIT_CPUS="$cpus"
  SITE_LIMIT_PIDS="$pids"
}

# The four cap lines, as every service that carries them writes them — in this order, memswap equal
# to mem. The custody matchers (apps/tracy-host/src/webroot.js `matchLimits`, mint-agent-token.sh
# `limits()`) accept exactly this run, so a change here is a change there in the same commit.
tracy_limits_run() {
  cat <<COMPOSE
    mem_limit: $1
    memswap_limit: $1
    cpus: $SITE_LIMIT_CPUS
    pids_limit: $SITE_LIMIT_PIDS
COMPOSE
}

# The mounts that make the site's folder reachable at the same path everywhere (Plan 3).
#
# The agent sees `/site/<label>` whether it is standing in the host's dsh (which has the folder
# bind-mounted from /srv/tracy-sites/<label>) or in this container. One path, so a cwd handed from
# one to the other means the same directory in both — the whole reason the exec route works.
#
# `.webroot` inside it, and not a second top-level mount, because that is the shape the site folder
# already documents to the agent (siteFolder.mjs) and the shape the lane mounted before this.
tracy_site_mounts() {
  local site webroot
  site="$(tracy_site_dir "$LABEL")"
  webroot="$(tracy_webroot_dir "$LABEL")"
  case "$PLATFORM" in
    emdash)
      # EmDash has no webroot: its site is a SQLite file and an uploads directory. They mount where
      # a webroot would be, so `.webroot` keeps meaning "the running site" on every platform. data/
      # and uploads/ themselves stay where platform/emdash.sh's own mkdir puts them — under the
      # PRIVATE root ($SITE_DIR), not the two roots.sh functions — only their container target is
      # under `.webroot`.
      printf '      - %s:/site/%s\n' "$site" "$LABEL"
      printf '      - %s/data:/site/%s/.webroot/data\n' "$SITE_DIR" "$LABEL"
      printf '      - %s/uploads:/site/%s/.webroot/uploads\n' "$SITE_DIR" "$LABEL"
      ;;
    *)
      printf '      - %s:/site/%s\n' "$site" "$LABEL"
      printf '      - %s:/site/%s/.webroot\n' "$webroot" "$LABEL"
      ;;
  esac
  # The site's access key (P0): the directory, read-only, so a re-issued key reaches the running
  # container. Only once a key exists — a site without one renders exactly as before, and the
  # access plugins believe nobody there (tools/issue-site-access-key.sh, resync-*-plugin.sh).
  # EmDash reads no X-Tracy-* header yet; it gets the same mount so secure-site-access.sh proves
  # every platform the same way, and the mount changes nothing the site serves.
  if [ -f "$(tracy_access_key_dir)/key.json" ]; then
    printf '      - %s:/run/tracy-access:ro\n' "$(tracy_access_key_dir)"
  fi
}

# Where this site's access key lives on the host: `<private root>/.site-access/<label>` — beside the
# site's private directory, never inside the site folder (synced to GitHub) or the webroot. tracy-web
# mounts the parent read-only (deploy/compose.yml) and signs with it (`bar/site-access.js`).
tracy_access_key_dir() {
  printf '%s/.site-access/%s' "$(dirname "$SITE_DIR")" "$LABEL"
}

# A site on its OWN network (P0): the marker `<private dir>/network-isolated` is written by provision
# for a new site and by tools/isolate-site-network.sh for an existing one. Such a web container joins
# only its project's `<label>_default` network — never the host-wide `tracy` network every other site
# is on — and tracy-web joins that network instead, with the alias `tracy-web` (lib/site-network.sh).
tracy_site_isolated() {
  [ -f "$SITE_DIR/network-isolated" ]
}

# The database service the two PHP platforms share. Identical in both flavours.
# ── a demo site is lean: small Apache pool, small MariaDB buffers ──────────────────────────────
# 🔒 12/10/2026 on fleet01 (2 cores, 3.9 GB, ~22 Joomla demos): 32 MB available, 939 MB of swap in
# use, load 18-22; 184 apache2 processes (~3.4 GB RSS) and 22 mariadbd (~2.3 GB). The image
# defaults are sized for a site with visitors (prefork StartServers 5 / MinSpare 5 / MaxSpare 10 /
# MaxRequestWorkers 150; MariaDB's 128 MB buffer pool, Aria page cache and key buffer, 16 MB log
# buffer), and a demo has almost none. Measured on the real ja-space j6 quickstart
# (joomla:6-apache + mariadb:11), defaults -> lean: Apache after a 24-wide burst 7 -> 3 processes,
# 302 -> 128 MB RSS (53 -> 26 MB anonymous); mariadbd 133 -> 80 MB RSS (111 -> 58 MB anonymous).
#
# A demo is marked by ONE file in its site dir, `apache/tracy-demo-limits.conf`, which provision.sh
# writes when tracy-host says the install is a demo (TRACY_DEMO_SITE=1) and removes otherwise. The
# file is the Apache half itself; its presence also gives the database its lean flags. Every later
# re-render of the compose file (set-php.sh, enable-site-mail.sh…) reads the same file, so a demo
# stays lean without anyone passing the flag again. A customer's site is never touched.
TRACY_DEMO_LIMITS_CONF="apache/tracy-demo-limits.conf"
tracy_is_demo_site() { [ -f "${1:-$SITE_DIR}/$TRACY_DEMO_LIMITS_CONF" ]; }

# Write (on) or remove (off) the marker for a site. Call: tracy_write_demo_limits <site_dir> <on|off>
tracy_write_demo_limits() {
  local file="$1/$TRACY_DEMO_LIMITS_CONF"
  if [ "$2" != on ]; then rm -f "$file"; return 0; fi
  mkdir -p "$1/apache"
  # MaxRequestWorkers 6: one browser loading a page opens about six connections; a demo answers one
  # visitor at a time well, and the host is not swapped out by a crawler. KeepAliveTimeout 2: an
  # idle kept-alive connection holds a whole prefork process.
  cat > "$file" <<'CONF'
# Tracy: a demo site's Apache pool (scripts/provision/render-compose.sh, "a demo site is lean").
<IfModule mpm_prefork_module>
    StartServers            1
    MinSpareServers         1
    MaxSpareServers         2
    ServerLimit             6
    MaxRequestWorkers       6
    MaxConnectionsPerChild  500
</IfModule>
KeepAliveTimeout 2
CONF
}

# The web container's mount of that file (empty for a customer's site).
tracy_demo_web_mount() {
  tracy_is_demo_site || return 0
  # `zz-` so it loads after mods-enabled/mpm_prefork.conf and its values win.
  printf '      - ./%s:/etc/apache2/conf-enabled/zz-tracy-demo-limits.conf:ro\n' "$TRACY_DEMO_LIMITS_CONF"
}

# The database's extra flags (empty for a customer's site). performance_schema is already OFF by
# default in MariaDB 11 (measured: @@performance_schema = 0), so it is not repeated here.
tracy_demo_db_command() {
  tracy_is_demo_site || return 0
  printf '      - %s\n' --innodb-buffer-pool-size=16M --innodb-log-buffer-size=4M \
    --aria-pagecache-buffer-size=8M --key-buffer-size=8M
}

tracy_compose_db() {
  cat <<COMPOSE
  db:
    image: mariadb:11
    restart: unless-stopped
COMPOSE
  tracy_limits_run "$SITE_LIMIT_DB_MEMORY"
  cat <<COMPOSE
    command:
      # Why this is relaxed is the platform's business — see platform/$PLATFORM.sh.
      - --sql-mode=$DB_SQL_MODE
      # A migrated dump batches rows into one multi-row INSERT per export chunk, and a real
      # content table (Joomla's ja_content) alone runs one statement past the 16M default —
      # the import then dies mid-stream with "Got a packet bigger than 'max_allowed_packet'".
      - --max-allowed-packet=256M
$(tracy_demo_db_command)
    environment:
      MARIADB_ROOT_PASSWORD: "\${DB_PASSWORD}"
      MARIADB_DATABASE: "$DB_NAME"
    volumes:
      - db:/var/lib/mysql
COMPOSE
}

tracy_render_compose() {
  : "${SITE_DIR:?render-compose needs SITE_DIR}"
  : "${LABEL:?render-compose needs LABEL}"
  : "${PLATFORM:?render-compose needs PLATFORM}"
  : "${WEB_IMAGE:?render-compose needs WEB_IMAGE}"
  : "${COMPOSE_FLAVOR:?render-compose needs COMPOSE_FLAVOR (clone|fresh)}"

  if [ "$PLATFORM" != emdash ]; then
    : "${DB_NAME:?render-compose needs DB_NAME for $PLATFORM}"
    : "${DB_SQL_MODE?render-compose needs DB_SQL_MODE for $PLATFORM}"
    # The password reaches compose through the site's own .env, never through this file: the
    # compose file is world-readable and .env is 600.
    grep -qs '^DB_PASSWORD=' "$SITE_DIR/.env" \
      || { echo "no DB_PASSWORD in $SITE_DIR/.env — refusing to write a compose file the database cannot start from" >&2; return 1; }
  fi

  # The caps first: a host env that names an impossible one refuses here, with nothing written.
  tracy_site_limits "$PLATFORM" || return 1
  [ -z "$SITE_LIMIT_NOTE" ] || echo "$SITE_LIMIT_NOTE" >&2

  local shape
  case "$PLATFORM:$COMPOSE_FLAVOR" in
    emdash:*)          shape=tracy_compose_emdash ;;
    joomla:fresh)      shape=tracy_compose_joomla_fresh ;;
    wordpress:fresh)   shape=tracy_compose_wordpress_fresh ;;
    *:clone)           shape=tracy_compose_clone ;;
    *) echo "no compose shape for $PLATFORM:$COMPOSE_FLAVOR" >&2; return 1 ;;
  esac

  # Written beside the real file and renamed over it, because a redirect TRUNCATES first and the
  # body runs after. A host that fills up mid-write (this script's own header remembers the day
  # that happened — seven sites' leftovers, 5.4 GB, juneflower.vn) would otherwise leave half a
  # compose file, and `docker compose` cannot parse half a file: the site can then not be stopped,
  # started or torn down, and the version that worked is gone. Same directory, so the rename is
  # atomic; a failed write leaves the old file exactly as it was.
  local tmp="$SITE_DIR/.docker-compose.yml.new"
  if ! "$shape" > "$tmp"; then
    rm -f "$tmp"
    echo "could not write $tmp" >&2
    return 1
  fi
  mv "$tmp" "$SITE_DIR/docker-compose.yml"
}

# The confinement every site's web container wears, in ONE place because it is now load-bearing
# for the HOST boundary and not merely good hygiene.
#
# From Plan 3 the agent's shell is `docker exec` into this container, through the socket proxy in
# `dsh/docker-proxy.haproxy.cfg`. That proxy bounds WHICH container. It cannot bound the exec's
# request body, so a privileged root exec into a `-web-1` container is reachable — measured
# 06/09/2026: uid 0 with CapEff 000001ffffffffff, against 0000000000000000 for a normal exec. What
# stopped the escape in the same measurement was this container's own profile.
#
# ⚠ `no-new-privileges` DOES NOT CLOSE THAT GAP, and saying it does would be worse than not adding
# it. Measured on both: a privileged exec into a container started WITH the flag still came back
# with every capability. What it does buy is the ordinary case — a setuid binary inside the webroot
# cannot escalate — and it costs nothing here.
#
# 🔒 IT DOES NOT BREAK APACHE, and that is the thing to check before believing it. Apache starts as
# root and drops its workers to www-data by CALLING setuid(); `no-new-privileges` blocks a setuid
# BINARY from gaining privileges, not a root process from giving them up. Measured on
# `tracy/web-wordpress:test` with the flag on: container running, `GET /` → 302 (the WordPress
# installer), and `ps` showing one root parent with five www-data workers.
#
# `shm_size: 512m` — fix round 1. Docker's default `/dev/shm` is 64 MB (measured live:
# `df -h /dev/shm` inside a rendered web container → `64M`), and web-clone's Chromium runs
# `--disable-dev-shm-usage`-free (its launcher, `system-browser.mjs`, hardcodes its flag list with
# no such flag), so shared-memory-backed renderer buffers for a real page — not the `about:blank`
# both prior tasks smoke-tested — exhaust that in a few tabs and the renderer dies with SIGBUS,
# reported upward as "Renderer process crashed", not as "out of shared memory". Raising the
# container's own `/dev/shm` is the fix that needs no change to the skill's launch flags.
#
# Then the resource caps (`tracy_limits_run`, top of this file). ⚠ `/dev/shm` is memory: what the
# browser puts there counts against `mem_limit`, so the 512m here is room inside the cap, not
# beside it.
tracy_web_confinement() {
  cat <<'COMPOSE'
    security_opt: ["no-new-privileges:true"]
    shm_size: 512m
COMPOSE
  tracy_limits_run "$SITE_LIMIT_WEB_MEMORY"
}

# Where a site's mail goes: tracy-web's static address on the `tracy` network (deploy/compose.yml
# pins it at `<prefix>.10`, port 8080 inside the container). A host whose tracy-web lives elsewhere
# sets TRACY_MAIL_URL outright. The prefix is read the way bootstrap.sh reads it: the environment
# first (tracy-host has deploy/.env), then the host's tracy-web env file, then compose's default.
# Resolved at render time and written as a literal, because `docker compose` in a site directory
# only sees that site's .env, which carries no network prefix.
tracy_mail_url() {
  if [ -n "${TRACY_MAIL_URL:-}" ]; then
    printf '%s' "$TRACY_MAIL_URL"
    return 0
  fi
  # An isolated site reaches tracy-web only by the alias tracy-web carries on the site's own network.
  if tracy_site_isolated; then
    printf 'http://tracy-web:8080/_site-mail'
    return 0
  fi
  local prefix="${TRACY_NETWORK_PREFIX:-}"
  if [ -z "$prefix" ]; then
    prefix="$(grep -m1 '^TRACY_NETWORK_PREFIX=' "${TRACY_WEB_ENV_FILE:-/etc/tracy/tracy-web.env}" 2>/dev/null \
      | cut -d= -f2- | tr -d "\"'\r" || true)"
  fi
  printf 'http://%s.10:8080/_site-mail' "${prefix:-172.30.0}"
}

# The three variables web/tracy-sendmail reads, on EVERY web service variant: a variant without
# them is a site whose mail() fails with "not configured" after go-live, and nothing else notices.
# The token is interpolated from the site's .env (provision.sh / enable-site-mail.sh write it):
# the compose file is world-readable, .env is 0600. Empty when missing — the shim then refuses
# with exit 75 rather than compose refusing to start the site.
tracy_web_mail_env() {
  cat <<COMPOSE
      # Site mail: web/tracy-sendmail posts every message here (tracy-web decides whether it goes).
      TRACY_MAIL_URL: "$(tracy_mail_url)"
      TRACY_MAIL_LABEL: "$LABEL"
      TRACY_MAIL_TOKEN: "\${TRACY_MAIL_TOKEN:-}"
COMPOSE
}

# The bounded DNS alias for a label whose `<label>-web-1` would exceed the 63-octet DNS-label cap.
# `tracy-web-` and the first 32 hex digits (128 bits) of SHA-256 over the WHOLE label — the SAME
# derivation as `webDnsName` in apps/tracy-web/src/sites/label.js and its copy in
# apps/tracy-host/src/capture.js. The parity test in test/render-compose.test.mjs pins them equal.
# `sha256sum` on the Linux fleet host; `shasum -a 256` is the macOS fallback so the test runs there.
tracy_web_dns_alias() {
  printf 'tracy-web-%s' "$(printf '%s' "$1" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-32)"
}

# The docker-network NAME to DIAL a site's web container by — the shell twin of `webDnsName` in
# apps/tracy-web/src/sites/label.js (and its copy in apps/tracy-host/src/capture.js). `<label>-web-1`
# for any label whose name fits a 63-octet DNS label; the bounded `tracy-web-<hash>` alias otherwise
# — the same alias `tracy_web_networks` puts on the `tracy` network. The container's OWN name stays
# `<label>-web-1` regardless (`docker exec`/`docker cp` address it by name); this is only the name a
# DNS client on the shared network dials. Any host-side probe that curls a site over the docker
# network (the readiness fallbacks in platform/{wordpress,joomla}.sh) must go through here, or a long
# label's dial fails ENOTFOUND before a byte leaves the process (issue #165).
tracy_web_dns_name() {
  local name="$1-web-1"
  if [ "${#name}" -gt 63 ]; then
    tracy_web_dns_alias "$1"
  else
    printf '%s' "$name"
  fi
}

# Every web container joins two networks: `default` (compose's own project network — how it
# reaches `db`) and `tracy` — the network deploy/compose.yml creates on this host, which is how
# tracy-web reaches `<label>-web-1` (Plan 3). Always on, never conditional on a flag: a site left
# off it is invisible to tracy-web with nothing at the surface that says why. The site itself still
# publishes only to 127.0.0.1 (below) — joining `tracy` does not open it to the internet.
#
# 🔒 A LONG LABEL NEEDS AN EXPLICIT ALIAS ON `tracy`. Docker's embedded DNS registers a container by
# its NAME, and `<label>-web-1` runs up to 69 octets while a DNS label caps at 63 — an over-long name
# simply does not resolve, and tracy-web's dial fails ENOTFOUND (issue #165, measured Node 22.17). So
# for a label whose `<label>-web-1` exceeds 63 we add a bounded `tracy-web-<hash>` alias that DOES
# resolve, and the DNS callers (webDnsName) dial that same alias. A short label keeps the exact
# `networks: [default, tracy]` shorthand it has today, so no deployed normal site changes — the
# container name (`docker exec`/`docker cp`) is untouched either way.
tracy_web_networks() {
  local name="${LABEL}-web-1"
  if tracy_site_isolated; then
    # Only the site's own network; a long label keeps its bounded alias there, where tracy-web dials.
    if [ "${#name}" -gt 63 ]; then
      cat <<COMPOSE
    networks:
      default:
        aliases: ["$(tracy_web_dns_alias "$LABEL")"]
COMPOSE
    else
      printf '    networks: [default]\n'
    fi
    # No `dns:` either: the stand's resolver lives on the shared network this site has left.
    return 0
  fi
  if [ "${#name}" -gt 63 ]; then
    local alias
    alias="$(tracy_web_dns_alias "$LABEL")"
    cat <<COMPOSE
    networks:
      default: {}
      tracy:
        aliases: ["$alias"]
COMPOSE
  else
    cat <<'COMPOSE'
    networks: [default, tracy]
COMPOSE
  fi
  # Local dev only. A container here has no real DNS of its own, so a webroot that resolves its
  # own hostname (rare, but the local compose lane hits it) needs somewhere to send that lookup.
  # Empty in production, where cloudflared's tunnel never depends on container-side DNS at all.
  if [ -n "${TRACY_SITE_DNS:-}" ]; then
    printf '    dns: [%s]\n' "$TRACY_SITE_DNS"
  fi
}

# The two networks are declared once per compose file. Both are external because the provisioner
# creates them before compose starts: Docker's automatic bridge pool is finite, and once it is
# exhausted compose fails before the first container can start. Giving each site an explicit,
# pre-created /24 keeps provisioning deterministic and lets the allocator report a useful error.
tracy_networks_footer() {
  if tracy_site_isolated; then
    cat <<COMPOSE

networks:
  default:
    external: true
    name: ${LABEL}_default
COMPOSE
    return 0
  fi
  cat <<COMPOSE

networks:
  default:
    external: true
    name: ${LABEL}_default
  tracy:
    external: true
    name: ${TRACY_SITE_NETWORK:-tracy_tracy}
COMPOSE
}

# A restored site: Apache serving the customer's own webroot, MariaDB beside it. The image's
# entrypoint is bypassed — it would install a fresh site of its own, and this webroot is already
# the customer's.
tracy_compose_clone() {
  {
    echo "services:"
    tracy_compose_db
    cat <<COMPOSE

  web:
    image: $WEB_IMAGE
    restart: unless-stopped
COMPOSE
    tracy_web_confinement
    cat <<COMPOSE
    depends_on: [db]
    # Straight to Apache: the image's entrypoint would install a fresh site of its own, and
    # this webroot is already the customer's.
    entrypoint: ["apache2-foreground"]
    environment:
COMPOSE
    tracy_web_mail_env
    cat <<COMPOSE
    volumes:
      - $(tracy_webroot_dir "$LABEL"):/var/www/html
      - ./apache/headers.load:/etc/apache2/mods-enabled/headers.load:ro
      # \`zz-\` so it loads last and its header wins over anything the site's own config sets.
      - ./apache/tracy-noindex.conf:/etc/apache2/conf-enabled/zz-tracy-noindex.conf:ro
COMPOSE
    tracy_demo_web_mount
    tracy_site_mounts
    tracy_web_networks
    cat <<COMPOSE
    ports:
      - "127.0.0.1:\${HOST_PORT:?this site's .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:80"

volumes:
  db:
COMPOSE
    tracy_networks_footer
  }
}

# A fleet-born Joomla: the image's own entrypoint installs Joomla, and the write door rides in on
# JOOMLA_EXTENSIONS_URLS. The admin it creates is the site agent, not a person (platform/joomla.sh).
tracy_compose_joomla_fresh() {
  {
    echo "services:"
    tracy_compose_db
    cat <<COMPOSE

  web:
    image: $WEB_IMAGE
    restart: unless-stopped
COMPOSE
    tracy_web_confinement
    cat <<COMPOSE
    depends_on: [db]
    environment:
      JOOMLA_DB_HOST: db
      JOOMLA_DB_USER: root
      JOOMLA_DB_PASSWORD: "\${DB_PASSWORD}"
      JOOMLA_DB_NAME: "$DB_NAME"
      # Deterministic, so post-up SQL (the cowork token read) does not have to discover it.
      JOOMLA_DB_PREFIX: "tr_"
      JOOMLA_SITE_NAME: "$LABEL"
      JOOMLA_ADMIN_USER: "Tracy Agent"
      JOOMLA_ADMIN_USERNAME: "tracyagent"
      JOOMLA_ADMIN_PASSWORD: "\${JOOMLA_ADMIN_PASSWORD}"
      JOOMLA_ADMIN_EMAIL: "tracy-agent@tracy.ai"
      JOOMLA_EXTENSIONS_URLS: "${JOOMLA_EXTENSIONS_URLS:-}"
COMPOSE
    tracy_web_mail_env
    cat <<COMPOSE
    volumes:
      - $(tracy_webroot_dir "$LABEL"):/var/www/html
      - ./apache/headers.load:/etc/apache2/mods-enabled/headers.load:ro
      # \`zz-\` so it loads last and its headers win over anything the site's own config sets.
      - ./apache/tracy-noindex.conf:/etc/apache2/conf-enabled/zz-tracy-noindex.conf:ro
COMPOSE
    tracy_demo_web_mount
    tracy_site_mounts
    tracy_web_networks
    cat <<COMPOSE
    ports:
      - "127.0.0.1:\${HOST_PORT:?this site's .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:80"

volumes:
  db:
COMPOSE
    tracy_networks_footer
  }
}

# A fleet-born WordPress: the image writes wp-config.php itself from WORDPRESS_* env.
tracy_compose_wordpress_fresh() {
  {
    echo "services:"
    tracy_compose_db
    cat <<COMPOSE

  web:
    image: $WEB_IMAGE
    restart: unless-stopped
COMPOSE
    tracy_web_confinement
    cat <<COMPOSE
    depends_on: [db]
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: root
      WORDPRESS_DB_PASSWORD: "\${DB_PASSWORD}"
      WORDPRESS_DB_NAME: "$DB_NAME"
      # Deterministic, same reasoning as Joomla's tr_ prefix: post-up work must not discover it.
      WORDPRESS_TABLE_PREFIX: "tr_"
COMPOSE
    tracy_web_mail_env
    cat <<COMPOSE
    volumes:
      - $(tracy_webroot_dir "$LABEL"):/var/www/html
      - ./apache/headers.load:/etc/apache2/mods-enabled/headers.load:ro
      # \`zz-\` so it loads last and its headers win over anything the site's own config sets.
      - ./apache/tracy-noindex.conf:/etc/apache2/conf-enabled/zz-tracy-noindex.conf:ro
COMPOSE
    tracy_demo_web_mount
    tracy_site_mounts
    tracy_web_networks
    cat <<COMPOSE
    ports:
      - "127.0.0.1:\${HOST_PORT:?this site's .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:80"

volumes:
  db:
COMPOSE
    tracy_networks_footer
  }
}

# EmDash: one Node container, SQLite inside the site dir, no database service at all.
tracy_compose_emdash() {
  {
    # `init: true` (#205): the image runs `node` as PID 1 (`exec gosu www-data node …`), and PID 1
    # gets no default action for SIGTERM, so every `docker stop` / recreate waited out Docker's
    # timeout before the kill (measured: 5.0 s on Docker Desktop's, 0.8 s with an init in front).
    # The init forwards the signal and Node ends at once. The custody matchers accept the line in
    # this one place (`mint-agent-token.sh`, tracy-host `webroot.js` `EMDASH_COMPOSE_FORM`).
    cat <<COMPOSE
services:
  web:
    image: $WEB_IMAGE
    restart: unless-stopped
    init: true
COMPOSE
    tracy_web_confinement
    cat <<COMPOSE
    environment:
      EMDASH_ENCRYPTION_KEY: "\${EMDASH_ENCRYPTION_KEY}"
      EMDASH_SITE_URL: "\${EMDASH_SITE_URL}"
      # Who may frame this site. Read from the site's .env, empty by default: a customer EmDash
      # site's .env never sets it, so the template middleware emits no frame-ancestors CSP and the
      # site stays unframeable. Only a demo provision (provision.sh's --frame-ancestors) writes a
      # value here, which is what lets a demo show in the Design inspiration preview iframe.
      TRACY_FRAME_ANCESTORS: "\${TRACY_FRAME_ANCESTORS:-}"
COMPOSE
    tracy_web_mail_env
    cat <<COMPOSE
    volumes:
      # The application — code, dist, node_modules — is the SITE'S OWN COPY, not the shared image
      # (Lee, 15/09: the customer and their agent own the site, so they own its code). A named
      # volume is filled from the image the first time it is mounted empty, and from then on the
      # image is only the seed: an edit under /app survives every recreate, and a template
      # upgrade is a merge into this copy, not a new tag. data/ and uploads/ stay bind mounts
      # under it, where they were.
      - app:/app
      - ./data:/app/data
      - ./uploads:/app/uploads
      # The site's agent PAT (#155), root-owned 0600 on the host, mounted READ-ONLY here — OUTSIDE
      # /app and /app/data (the agent-writable volumes) so the container's own www-data agent shell
      # can neither read it nor replace it (a symlink swap needs a writable parent, and /run is
      # root-owned); only a root docker exec — the site-tools MCP transport — reads it. provision's
      # platform_compose creates the host file as a regular root:0600 file BEFORE compose up, so
      # Docker binds a FILE (not a fresh directory), and the token is written in place so this bind's
      # inode stays valid across updates and restarts.
      - ./tracy-agent.token:/run/tracy-agent.token:ro
COMPOSE
    tracy_site_mounts
    tracy_web_networks
    cat <<COMPOSE
    ports:
      - "127.0.0.1:\${HOST_PORT:?this site's .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:4321"

volumes:
  app:
COMPOSE
    tracy_networks_footer
  }
}

# ── standalone: re-render a site that already exists ────────────────────────────────────────

# What the compose file on disk already says. Read rather than assumed, so a re-render carries a
# site's own database name, sql-mode and extension list forward instead of the defaults this repo
# would pick today — those two are not the same thing for a site provisioned months ago.
tracy_read_existing_compose() {
  local file="$SITE_DIR/docker-compose.yml"
  [ -f "$file" ] || return 0
  CURRENT_WEB_IMAGE="$(sed -n 's/^ *image: *//p' "$file" | grep -v '^mariadb' | sed -n 1p)"
  [ -n "${DB_NAME:-}" ] || DB_NAME="$(sed -n 's/^ *MARIADB_DATABASE: *//p' "$file" | tr -d '"' | sed -n 1p)"
  [ -n "${DB_SQL_MODE:-}" ] || DB_SQL_MODE="$(sed -n 's/^ *- --sql-mode=//p' "$file" | sed -n 1p)"
  [ -n "${JOOMLA_EXTENSIONS_URLS:-}" ] || JOOMLA_EXTENSIONS_URLS="$(sed -n 's/^ *JOOMLA_EXTENSIONS_URLS: *//p' "$file" | tr -d '"' | sed -n 1p)"
  if [ -z "${COMPOSE_FLAVOR:-}" ]; then
    # The installer environment is the tell, and it is a reliable one: a clone's web service has
    # its entrypoint overridden precisely so no installer ever reads those variables.
    if grep -q '^ *\(JOOMLA\|WORDPRESS\)_DB_HOST:' "$file"; then
      COMPOSE_FLAVOR=fresh
    else
      COMPOSE_FLAVOR=clone
    fi
  fi
}

# Which CMS this site is, asked of the site rather than the caller — same rule as
# ensure-site-folder.mjs, and for the same reason: the argument has been wrong before.
tracy_detect_platform() {
  [ -n "${PLATFORM:-}" ] && { printf '%s\n' "$PLATFORM"; return 0; }
  local from_env
  from_env="$(sed -n 's/^PLATFORM=//p' "$SITE_DIR/.env" 2>/dev/null | sed -n 1p)"
  [ -n "$from_env" ] && { printf '%s\n' "$from_env"; return 0; }
  case "${CURRENT_WEB_IMAGE:-}" in
    joomla:*|tracy/web-joomla:*)                printf 'joomla\n'; return 0 ;;
    wordpress:*|tracy/web-wordpress:*)          printf 'wordpress\n'; return 0 ;;
    tracy/emdash:*|tracy/*-emdash:*)            printf 'emdash\n'; return 0 ;;
  esac
  # data.db stays under $SITE_DIR (the private root) on purpose — emdash's data/uploads mount
  # source is not tracy_webroot_dir() (Plan 3 Task 2, judgment call #3: platform/emdash.sh's own
  # mkdir puts them on the private root, and this reads the same place). The webroot markers below
  # DO move: a webroot now lives under TRACY_SITES_ROOT, not under $SITE_DIR.
  [ -f "$SITE_DIR/data/data.db" ] && { printf 'emdash\n'; return 0; }
  local webroot_dir
  webroot_dir="$(tracy_webroot_dir "$LABEL")"
  [ -f "$webroot_dir/configuration.php" ] && { printf 'joomla\n'; return 0; }
  [ -f "$webroot_dir/wp-config.php" ] && { printf 'wordpress\n'; return 0; }
  return 1
}

tracy_render_compose_main() {
  set -euo pipefail
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # shellcheck source=../lib/roots.sh
  . "$here/../lib/roots.sh"

  local root="$TRACY_PRIVATE_ROOT" label="" image=""
  PLATFORM="${PLATFORM:-}"
  COMPOSE_FLAVOR="${COMPOSE_FLAVOR:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --root) root="$2"; shift 2 ;;
      --platform) PLATFORM="$2"; shift 2 ;;
      --flavor) COMPOSE_FLAVOR="$2"; shift 2 ;;
      --image) image="$2"; shift 2 ;;
      # For tests and for anyone rendering on a machine that is not the host: the image the
      # resolver would check for is not here, and its absence says nothing.
      --no-image-check) export TRACY_WEB_IMAGE_CHECK=0; shift ;;
      -*) echo "unknown argument: $1" >&2; return 2 ;;
      *) label="$1"; shift ;;
    esac
  done
  [ -n "$label" ] || { echo "use: render-compose.sh <label> [--root DIR] [--platform NAME] [--flavor clone|fresh] [--image REF]" >&2; return 2; }

  LABEL="$label"
  SITE_DIR="$root/$LABEL"
  [ -d "$SITE_DIR" ] || { echo "no site directory at $SITE_DIR" >&2; return 1; }

  # shellcheck source=../lib/web-image.sh
  . "$here/../lib/web-image.sh"
  # Run by hand against a site that is ALREADY RUNNING (Task 6 does this fourteen times in a row).
  # An unlisted base or an unbuilt image must stop the run, not print a `!!` into a screen nobody
  # reads — the thing at stake is the site's PHP version, and the person who can fix it in thirty
  # seconds (`bash web/build.sh`) is standing right there.
  export TRACY_WEB_IMAGE_STRICT=1

  tracy_read_existing_compose
  [ -n "${COMPOSE_FLAVOR:-}" ] || {
    echo "$LABEL has no compose file to read, so whether it is a clone or a fleet-born install is" >&2
    echo "not something this can tell — pass --flavor clone or --flavor fresh" >&2
    return 1
  }
  PLATFORM="$(tracy_detect_platform)" \
    || { echo "cannot tell which platform $LABEL is — pass --platform" >&2; return 1; }

  if [ -n "$image" ]; then
    WEB_IMAGE="$image"
  elif [ "$PLATFORM" = emdash ]; then
    WEB_IMAGE="$(tracy_emdash_web_image "${CURRENT_WEB_IMAGE:-}")"
  else
    WEB_IMAGE="$(tracy_web_image "$PLATFORM" "${CURRENT_WEB_IMAGE:-}")"
  fi
  [ -n "$WEB_IMAGE" ] || { echo "no web image for $LABEL — pass --image" >&2; return 1; }
  case "$PLATFORM" in
    wordpress|joomla) _tracy_web_image_require_supported_php "$WEB_IMAGE" || return 1 ;;
  esac

  tracy_render_compose
  echo "==> rendered $SITE_DIR/docker-compose.yml  ($PLATFORM/$COMPOSE_FLAVOR, $WEB_IMAGE)"
}

# Sourced by provision.sh and by the platform files; run directly by a migration.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  tracy_render_compose_main "$@"
fi
