#!/usr/bin/env bash
#
# The demo farm: what is written on disk for it. Sourced, never run. Needs lib/roots.sh and
# lib/site-runtime.sh first. provision/fold.sh and provision/unfold.sh are the only writers;
# render-compose.sh renders a folded demo's own compose (the forwarder) from here.
#
# ## Why a farm
#
# Measured on the dev and prod hosts (13/11/2026): 44 PHP demos per host, each its own Apache
# prefork + mod_php container (~27 MiB anonymous) and MariaDB (~48 MiB anonymous), plus an OPcache
# arena that grew from 20 MiB to 100-128 MiB per demo of which ~30 MiB was live. ~120 MiB per demo
# was the floor of that model, ~7.5 GiB for the prod demos. Template vendors and shared hosts serve
# the same load with ONE web server, on-demand PHP and ONE database; so does this.
#
# ## The shape (one per host)
#
#   tracy-demos-web   Apache event + PHP-FPM 8.4 (web/demos.Dockerfile). One vhost per demo,
#                     selected by the PORT a request arrives on (the demo's own HOST_PORT), never
#                     by its Host header — a wrong or missing Host cannot reach another demo, and a
#                     port no demo owns serves nothing. DocumentRoot = the demo's own webroot,
#                     MOUNTED (never copied), `AllowOverride All`, and the demo's own
#                     `<private>/<label>/apache/tracy-noindex.conf` included inside its vhost.
#                     One FPM pool per demo: ondemand, 4 children, 20 s idle, open_basedir on its
#                     docroot, its access key directory and its own temp dir, its own environment.
#   tracy-demos-db    MariaDB 11. One schema and one user per demo, the user granted on its own
#                     schema only.
#
#   <label>-web-1     what stays of the demo's own compose project: a TCP forwarder (haproxy, the
#                     image every host already runs for the docker socket proxy), still named
#                     `<label>-web-1`, still on `<label>_default` (tracy-web dials `<label>-web-1:80`
#                     there), still publishing 127.0.0.1:<HOST_PORT> (tracy-host dials that). It
#                     forwards to tracy-demos-web:<HOST_PORT>. Its `db` service is gone; the volume
#                     stays, so unfold.sh can put the demo back exactly.
#
# ## Files (all under `tracy_demos_dir`, default <private root>/_demos)
#
#   compose.yml               the farm's compose project `tracy-demos` (tracy_farm_render_compose)
#   .env                      FARM_DB_ROOT_PASSWORD (600)
#   apache/<label>.conf       a demo's vhost   (mounted read-only at /etc/tracy-demos/apache)
#   fpm/<label>.conf          a demo's pool    (mounted read-only at /etc/tracy-demos/fpm, 600)
#   exec/<label>.env          the pool's environment as `docker exec --env-file` reads it (600)
#   forward.haproxy.cfg       the forwarder's config, the same file for every demo
#   .farm.lock                held by fold/unfold: one farm change at a time on the host
#
# A demo's MEMBERSHIP is its pool file: the farm compose mounts the folders of every label that has
# `fpm/<label>.conf`, and nothing else. A folder the farm does not mount is a folder no PHP and no
# exec in the farm can open — that is the isolation between this farm and the customer sites on the
# same host (a shared mount of the whole sites root would hand every folded demo's PHP every
# customer's webroot). The price: adding or removing a member re-creates tracy-demos-web (a ~1 s
# blip for the folded demos); a change to a member's vhost or pool alone is a graceful reload.

: "${TRACY_DEMOS_PROJECT:=tracy-demos}"
: "${TRACY_DEMOS_FRONT_NETWORK:=tracy-demos-front}"
: "${TRACY_DEMOS_BACK_NETWORK:=tracy-demos-back}"
# The database host every folded demo's configuration names.
: "${TRACY_DEMOS_DB_HOST:=tracy-demos-db}"
# The forwarder: the haproxy image deploy/compose.yml and dsh/host-dsh.yml already pin, so a host
# pulls nothing new for it.
: "${TRACY_DEMOS_FORWARD_IMAGE:=haproxy:3.0-alpine@sha256:34cc7d1f6142464d7d2b73e2a1eef7392556dbf304160aef543e513cfd9e5162}"
# Where fold.sh keeps a demo's per-site compose (relative to its site dir), for unfold.sh and for
# render-compose.sh, which reads a folded demo's facts (DB name, flavor, image) from it.
TRACY_FARM_KEPT_COMPOSE=farm/per-demo.compose.yml
# The farm's own port inside tracy-demos-web (health check, refusal of anything else).
TRACY_DEMOS_OWN_PORT=8080

# The farm image this checkout builds (web/DEMOS_IMAGE): `TRACY_DEMOS_IMAGE` wins, for tests.
tracy_demos_image() {
  if [ -n "${TRACY_DEMOS_IMAGE:-}" ]; then printf '%s' "$TRACY_DEMOS_IMAGE"; return 0; fi
  local file line
  for file in "$(dirname "${BASH_SOURCE[0]}")/../../web/DEMOS_IMAGE" "${TRACY_FLEET_DIR:-/opt/tracy-fleet}/web/DEMOS_IMAGE"; do
    [ -f "$file" ] || continue
    line="$(grep -v '^#' "$file" | grep '=' | sed -n 1p)"
    [ -n "$line" ] && { printf '%s' "${line#*=}"; return 0; }
  done
  echo "!! no web/DEMOS_IMAGE line — which farm image to run is unknown" >&2
  return 1
}

# A demo's schema and user name in the farm: readable, and unique per label even where two labels
# sanitize alike (`a-b`, `a_b`) — the hash is of the label itself. 51 characters at most.
tracy_farm_db_ident() {
  local clean sum
  clean="$(printf '%s' "$1" | tr -c 'A-Za-z0-9_' '_' | cut -c1-40)"
  sum="$(printf '%s' "$1" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-8)"
  printf 'd_%s_%s' "$clean" "$sum"
}

tracy_farm_members() {
  local dir pool
  dir="$(tracy_demos_dir)/fpm"
  for pool in "$dir"/*.conf; do
    [ -f "$pool" ] || continue
    basename "$pool" .conf
  done
}

# A value that goes into a pool file (`env[K] = "v"`), an --env-file line and a compose file alike.
# Refused rather than escaped: none of the values Tracy puts there needs any of these characters.
tracy_farm_value_safe() {
  case "$1" in
    *'"'*|*'\'*|*'$'*|*$'\n'*|*$'\r'*|*';'*) return 1 ;;
  esac
  return 0
}

# Where a folded demo's mail goes: the farm is on the host-wide tracy network (or nowhere), never on
# a site's own network, so the isolated-site alias (`tracy-web:8080`) cannot be its address.
tracy_farm_mail_url() {
  if [ -n "${TRACY_MAIL_URL:-}" ]; then printf '%s' "$TRACY_MAIL_URL"; return 0; fi
  local prefix="${TRACY_NETWORK_PREFIX:-}"
  if [ -z "$prefix" ]; then
    prefix="$(grep -m1 '^TRACY_NETWORK_PREFIX=' "${TRACY_WEB_ENV_FILE:-/etc/tracy/tracy-web.env}" 2>/dev/null \
      | cut -d= -f2- | tr -d "\"'\r" || true)"
  fi
  printf 'http://%s.10:8080/_site-mail' "${prefix:-172.30.0}"
}

# The access key directory of a label (render-compose.sh `tracy_access_key_dir`, by label).
tracy_farm_access_dir() { printf '%s/.site-access/%s' "$TRACY_PRIVATE_ROOT" "$1"; }

# A demo's pool environment, one KEY=VALUE per line: what the pool's `env[...]` lines say and what
# an exec into the farm as this demo gets (`tracy_site_web_exec`). Extra lines (a WordPress image's
# runtime WORDPRESS_* settings) come from `<private>/<label>/farm/pool.env`, written by fold.sh.
tracy_farm_pool_env() {
  local label="$1" site_dir token extra line
  site_dir="$(tracy_private_dir "$label")"
  token="$(sed -n 's/^TRACY_MAIL_TOKEN=//p' "$site_dir/.env" 2>/dev/null | sed -n 1p)"
  printf 'TRACY_MAIL_URL=%s\n' "$(tracy_farm_mail_url)"
  printf 'TRACY_MAIL_LABEL=%s\n' "$label"
  printf 'TRACY_MAIL_TOKEN=%s\n' "$token"
  printf 'TRACY_ACCESS_KEY_FILE=/run/tracy-access/%s/key.json\n' "$label"
  printf 'TRACY_SITE_LABEL=%s\n' "$label"
  printf 'TMPDIR=/tmp/tracy-demos/%s\n' "$label"
  extra="$site_dir/farm/pool.env"
  if [ -f "$extra" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in ''|'#'*) continue ;; esac
      printf '%s\n' "$line"
    done < "$extra"
  fi
}

# The pool file. Refuses (nothing printed) a value it could not write safely.
tracy_farm_render_pool() {
  local label="$1" docroot env key value
  docroot="$(tracy_farm_docroot "$label")"
  env="$(tracy_farm_pool_env "$label")" || return 1
  cat <<POOL
; Tracy demo farm — the PHP pool of $label (scripts/lib/demo-farm.sh; written by provision/fold.sh).
[$label]
user = www-data
group = www-data
listen = /run/tracy-demos/$label.sock
; Only Apache (its own user, farmhttp — web/demos.Dockerfile) may connect: FPM takes
; PHP_ADMIN_VALUE from whoever connects, and every pool's worker is www-data.
listen.owner = farmhttp
listen.group = farmhttp
listen.mode = 0600
; Workers only while somebody is looking: a demo nobody opens holds no PHP process at all.
pm = ondemand
pm.max_children = 4
pm.process_idle_timeout = 20s
pm.max_requests = 500
request_terminate_timeout = 300s
; Its own status, through its socket only (Apache hands it `.php` files alone): unfold.sh asks it which
; workers are busy before the copy (provision/farm-pool-status.php).
pm.status_path = /fpm-status
catch_workers_output = yes
decorate_workers_output = no
clear_env = yes
security.limit_extensions = .php
chdir = $docroot
; What mod_php in the demo's own container could reach was its own container. Here: its docroot,
; its access key, its own temp dir — never another demo's.
php_admin_value[open_basedir] = $docroot/:/run/tracy-access/$label/:/tmp/tracy-demos/$label/
php_admin_value[upload_tmp_dir] = /tmp/tracy-demos/$label
php_admin_value[sys_temp_dir] = /tmp/tracy-demos/$label
php_value[session.save_path] = /tmp/tracy-demos/$label
; open_basedir binds PHP's own file functions, not a program PHP starts: \`exec('cat …')\` would read
; every other folded demo's webroot (all run as www-data, all mounted here). So the pool starts no
; program at all. What Tracy installs on a demo copes: the Claude Cowork plugin starts \`php -l\` only to
; lint, and lints by tokens when proc_open is disabled (its lib/TemplateFiles.php); the access plugins
; start nothing; PHP's own mail() is not one of these, so site mail still leaves through tracy-sendmail.
; A CLI exec into the farm (tracy_site_web_exec) does not read this pool and is not limited by it.
; Nor a link: Apache follows symlinks (FollowSymLinks — every CMS .htaccess rewrite needs it) and reads
; files as the same www-data as every other demo, without open_basedir, so \`symlink('/site/<other>/…',
; 'x.txt')\` would make Apache serve another demo's file as this one's. symlink() and link() are off;
; a link shipped in a webroot before the fold is refused by fold.sh.
php_admin_value[disable_functions] = exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec,symlink,link
POOL
  while IFS= read -r line; do
    key="${line%%=*}"; value="${line#*=}"
    if ! [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || ! tracy_farm_value_safe "$value"; then
      echo "!! $label: pool environment $key holds a value this farm will not write into a pool file" >&2
      return 1
    fi
    printf 'env[%s] = "%s"\n' "$key" "$value"
  done <<<"$env"
}

# The `docker exec --env-file` form of the same environment.
tracy_farm_render_exec_env() {
  local label="$1" env line value
  env="$(tracy_farm_pool_env "$label")" || return 1
  while IFS= read -r line; do
    value="${line#*=}"
    tracy_farm_value_safe "$value" || { echo "!! $label: ${line%%=*} cannot be written" >&2; return 1; }
    printf '%s\n' "$line"
  done <<<"$env"
}

# The demo's vhost. Its port is its HOST_PORT; the demo's own tracy-noindex.conf is included as it
# is (its headers, X-Forwarded-Host → Host, frame-ancestors), and the one block in it that names the
# per-site container's docroot (`<Directory /var/www/html>`: the trailing-slash redirect) is said
# again for the farm's docroot — read from the file, so it says what the file says.
tracy_farm_render_vhost() {
  local label="$1" port="$2" conf docroot fixes
  docroot="$(tracy_farm_docroot "$label")"
  conf="$(tracy_private_dir "$label")/apache/tracy-noindex.conf"
  [[ "$port" =~ ^[1-9][0-9]{0,4}$ ]] && [ "$port" -le 65535 ] && [ "$port" != "$TRACY_DEMOS_OWN_PORT" ] || {
    echo "!! $label: port '$port' cannot be a farm listener" >&2; return 1; }
  [ -f "$conf" ] || { echo "!! $label has no $conf — its headers and frame policy would be lost" >&2; return 1; }
  fixes="$(awk '
    /^[[:space:]]*<Directory[[:space:]]+\/var\/www\/html\/?>[[:space:]]*$/ { inside = 1; next }
    inside && /^[[:space:]]*<\/Directory>/ { inside = 0; next }
    inside { print }
  ' "$conf")"
  cat <<VHOST
# Tracy demo farm — the vhost of $label (scripts/lib/demo-farm.sh; written by provision/fold.sh).
# Chosen by the port only: its forwarder <label>-web-1 sends every request here.
Listen $port
<VirtualHost *:$port>
    ServerName $label:80
    DocumentRoot $docroot
    <Directory $docroot>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        CGIPassAuth On
$(printf '%s\n' "$fixes" | sed '/^[[:space:]]*$/d; s/^[[:space:]]*/        /')
    </Directory>
    <FilesMatch "\\.php\$">
        SetHandler "proxy:unix:/run/tracy-demos/$label.sock|fcgi://tracy-demo-$label/"
    </FilesMatch>
    # SERVER_PORT as the per-site container gave it: the port the client's Host header names, else
    # 80 (that container's own port) — never the farm's listener. Read from the Host as it arrived,
    # before tracy-noindex.conf swaps in X-Forwarded-Host, exactly when Apache read it there.
    SetEnvIf Host "^" TRACY_SERVER_PORT=80
    SetEnvIf Host ":([0-9]+)\$" TRACY_SERVER_PORT=\$1
    ProxyFCGISetEnvIf "true" SERVER_PORT "%{reqenv:TRACY_SERVER_PORT}"
    ProxyFCGISetEnvIf "true" !TRACY_SERVER_PORT
    Include /etc/tracy-demos/site-apache/$label/tracy-noindex.conf
</VirtualHost>
VHOST
}

# The forwarder's config: one file for every demo, the port from the container's environment.
tracy_farm_forward_cfg() {
  cat <<'CFG'
# Tracy demo farm — the TCP forwarder every folded demo's <label>-web-1 runs (scripts/lib/demo-farm.sh).
# It forwards to the farm listener of its own demo (TRACY_DEMO_PORT = the demo's HOST_PORT), nothing else.
global
    maxconn 256
    nbthread 1
defaults
    mode tcp
    timeout connect 5s
    timeout client 330s
    timeout server 330s
# Docker's resolver, re-asked: a re-created tracy-demos-web comes back on another address.
resolvers docker
    nameserver dns 127.0.0.11:53
    hold valid 2s
    hold other 2s
    hold refused 2s
    hold nx 2s
    hold timeout 2s
frontend demo
    bind :80
    default_backend farm
backend farm
    server farm "tracy-demos-web:${TRACY_DEMO_PORT}" resolvers docker init-addr last,libc,none
CFG
}

# The four cap lines for one farm service (render-compose.sh `tracy_limits_run` form).
_tracy_farm_limits() {
  cat <<COMPOSE
    mem_limit: $1
    memswap_limit: $1
    cpus: $2
    pids_limit: $3
COMPOSE
}

# Whether the host-wide tracy network exists (the farm joins it for site mail, never required).
tracy_farm_mail_network() {
  local name="${TRACY_SITE_NETWORK:-tracy_tracy}"
  if [ "${TRACY_DEMOS_MAIL_NETWORK+set}" = set ]; then printf '%s' "$TRACY_DEMOS_MAIL_NETWORK"; return 0; fi
  docker network inspect "$name" >/dev/null 2>&1 && printf '%s' "$name"
  return 0
}

# The farm's compose file: every member's folders mounted, nothing else.
tracy_farm_render_compose() {
  local image cpus pids web_mem db_mem mail_net label key_dir
  image="$(tracy_demos_image)" || return 1
  cpus="$(tracy_host_cpus)"; [ "$cpus" -ge 4 ] && cpus=2 || cpus=1
  cpus="${TRACY_DEMOS_CPUS:-$cpus}"
  pids="${TRACY_DEMOS_PIDS:-1024}"
  web_mem="${TRACY_DEMOS_WEB_MEMORY:-2g}"
  db_mem="${TRACY_DEMOS_DB_MEMORY:-1g}"
  mail_net="$(tracy_farm_mail_network)"
  cat <<COMPOSE
# Tracy demo farm (scripts/lib/demo-farm.sh) — rendered by provision/fold.sh and unfold.sh. Do not edit:
# the next fold re-renders it from the members (fpm/<label>.conf) on disk.
name: $TRACY_DEMOS_PROJECT
services:
  demos-web:
    image: $image
    container_name: $TRACY_DEMOS_WEB_CONTAINER
    restart: unless-stopped
    init: true
    security_opt: ["no-new-privileges:true"]
COMPOSE
  _tracy_farm_limits "$web_mem" "$cpus" "$pids"
  cat <<COMPOSE
    healthcheck:
      test: ["CMD", "curl", "-fsS", "-o", "/dev/null", "http://127.0.0.1:$TRACY_DEMOS_OWN_PORT/fpm-ping"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    # The base image declares VOLUME /var/www/html; a tmpfs there keeps docker from leaving an
    # anonymous volume behind every container of this service (a `compose run` config test too).
    tmpfs:
      - /var/www/html:ro,size=1m
    volumes:
      - ./apache:/etc/tracy-demos/apache:ro
      - ./fpm:/etc/tracy-demos/fpm:ro
      - opcache:/var/cache/opcache
COMPOSE
  while IFS= read -r label; do
    [ -n "$label" ] || continue
    printf '      # %s\n' "$label"
    printf '      - %s:/site/%s\n' "$(tracy_site_dir "$label")" "$label"
    printf '      - %s:/site/%s/.webroot\n' "$(tracy_webroot_dir "$label")" "$label"
    printf '      - %s/apache:/etc/tracy-demos/site-apache/%s:ro\n' "$(tracy_private_dir "$label")" "$label"
    key_dir="$(tracy_farm_access_dir "$label")"
    if [ -f "$key_dir/key.json" ]; then
      printf '      - %s:/run/tracy-access/%s:ro\n' "$key_dir" "$label"
    fi
  done <<<"$(tracy_farm_members)"
  printf '    networks: [front, back%s]\n' "${mail_net:+, mail}"
  cat <<COMPOSE
  demos-db:
    image: mariadb:11
    container_name: $TRACY_DEMOS_DB_CONTAINER
    restart: unless-stopped
COMPOSE
  _tracy_farm_limits "$db_mem" "$cpus" "$pids"
  cat <<COMPOSE
    command:
      # As every site database (render-compose.sh tracy_compose_db): the relaxed sql-mode both PHP
      # platforms ask for, and room for a migrated dump's multi-row INSERTs.
      - --sql-mode=NO_ENGINE_SUBSTITUTION
      - --max-allowed-packet=256M
      # One buffer pool for every demo instead of 16M each.
      - --innodb-buffer-pool-size=${TRACY_DEMOS_DB_BUFFER_POOL:-256M}
      - --innodb-log-buffer-size=8M
      - --aria-pagecache-buffer-size=16M
      - --key-buffer-size=8M
      # Four PHP workers per demo, each with at most one connection.
      - --max-connections=${TRACY_DEMOS_DB_CONNECTIONS:-300}
    environment:
      MARIADB_ROOT_PASSWORD: "\${FARM_DB_ROOT_PASSWORD:?the farm .env has no FARM_DB_ROOT_PASSWORD}"
    volumes:
      - db:/var/lib/mysql
    networks: [back]

networks:
  front:
    name: $TRACY_DEMOS_FRONT_NETWORK
  # Only the farm's web reaches the farm's database (and, for the seconds a fold or unfold runs, the
  # one demo's own web container being moved).
  back:
    name: $TRACY_DEMOS_BACK_NETWORK
    internal: true
COMPOSE
  if [ -n "$mail_net" ]; then
    cat <<COMPOSE
  mail:
    external: true
    name: $mail_net
COMPOSE
  fi
  cat <<'COMPOSE'

volumes:
  opcache:
  db:
COMPOSE
}
