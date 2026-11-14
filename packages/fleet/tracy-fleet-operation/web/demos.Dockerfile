# The demo farm: Apache (mpm_event) + PHP-FPM 8.4 for every folded PHP demo on a host.
#
# Built FROM the official Joomla 6 FPM image because that image is the per-demo Joomla image's
# twin: the same PHP 8.4 build and the same extension set (apcu bcmath bz2 exif gd gmp imagick intl
# ldap memcached mysqli opcache pdo_mysql pdo_pgsql pgsql redis zip), which is a superset of what the
# WordPress image carries (bcmath exif gd imagick intl mysqli opcache zip). So a demo of either CMS
# finds every extension it found in its own container. Its Joomla tree (/usr/src/joomla) is never
# used: the entrypoint is ours, and every DocumentRoot is a demo's own webroot, mounted.
#
# What this image adds is what the apache variants carry and the fpm variant does not: Apache, with
# the modules and the conf the per-demo images run (remoteip, rewrite, headers, expires, deflate,
# DirectoryIndex index.php, -Indexes, AllowOverride All), plus the site-mail shim and the error
# logging ini of web/joomla.Dockerfile / web/wordpress.Dockerfile. mod_php is NOT here: PHP is FPM,
# one ondemand pool per demo (scripts/lib/demo-farm.sh renders them).
ARG BASE=joomla:6-php8.4-fpm
FROM ${BASE}

# Apache from Debian (the base is Debian like the apache variants), event MPM, FastCGI proxy.
# The small agent tools of the per-demo images come along (git, rg, jq, less, curl); Chromium and
# Node do not — a farm image is shared by every demo and stays small (see the part-1 report).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      apache2 git ripgrep less jq curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN { a2dismod -f mpm_prefork mpm_worker >/dev/null 2>&1 || true; } \
 && a2enmod -q mpm_event proxy proxy_fcgi rewrite headers setenvif remoteip expires deflate env \
      alias dir mime negotiation filter reqtimeout status \
 && a2dissite -q 000-default \
 && a2disconf -q serve-cgi-bin other-vhosts-access-log \
 && rm -f /var/www/html/index.html \
 && mkdir -p /var/www/empty /etc/tracy-demos/apache /etc/tracy-demos/fpm /etc/tracy-demos/site-apache \
      /run/tracy-demos /var/cache/opcache \
 && chown www-data:www-data /var/cache/opcache

# wp-cli, pinned as in web/wordpress.Dockerfile: WordPress demos are reached through it.
ARG WP_CLI_VERSION=2.12.0
ARG WP_CLI_SHA512=be928f6b8ca1e8dfb9d2f4b75a13aa4aee0896f8a9a0a1c45cd5d2c98605e6172e6d014dda2e27f88c98befc16c040cbb2bd1bfa121510ea5cdf5f6a30fe8832
RUN curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors --connect-timeout 20 \
      -o /usr/local/bin/wp \
      "https://github.com/wp-cli/wp-cli/releases/download/v${WP_CLI_VERSION}/wp-cli-${WP_CLI_VERSION}.phar" \
 && echo "${WP_CLI_SHA512}  /usr/local/bin/wp" | sha512sum -c - \
 && chmod +x /usr/local/bin/wp

# The pools are ours: the image's `www` pool (pm dynamic, five children at start) would idle for
# nobody. The farm's own pool answers only the health check; every demo's pool comes from
# /etc/tracy-demos/fpm/<label>.conf.
# 🔒 APACHE IS NOT www-data. Every PHP pool runs as www-data, so a socket www-data could open is a
# socket every folded demo's PHP could open: FPM takes PHP_VALUE/PHP_ADMIN_VALUE from whoever
# connects, and demo A's PHP would run demo B's scripts as B's pool, with any ini it likes. So Apache
# runs as its own user (`farmhttp`, uid/gid 3301), in the www-data group only to read group-readable
# webroot files and .htaccess; every pool socket is farmhttp's alone, 0600 (lib/demo-farm.sh), and
# /run/tracy-demos is root:farmhttp 0750 (entrypoint.sh) — no worker of any pool can reach any socket.
# Apache writes nothing in a webroot; its logs go to the container's stdout/stderr (opened by root).
RUN groupadd -g 3301 farmhttp \
 && useradd -u 3301 -g farmhttp -G www-data -M -d /nonexistent -s /usr/sbin/nologin farmhttp \
 && sed -i 's/^export APACHE_RUN_USER=.*/export APACHE_RUN_USER=farmhttp/; s/^export APACHE_RUN_GROUP=.*/export APACHE_RUN_GROUP=farmhttp/' /etc/apache2/envvars \
 && grep -qx 'export APACHE_RUN_USER=farmhttp' /etc/apache2/envvars

RUN rm -f /usr/local/etc/php-fpm.d/www.conf /usr/local/etc/php-fpm.d/www.conf.default \
      /usr/local/etc/php-fpm.d/zz-docker.conf /usr/local/etc/php-fpm.d/docker.conf
COPY --from=tracy-web-files --chmod=0644 demos/php-fpm-farm.conf /usr/local/etc/php-fpm.d/farm.conf
COPY --from=tracy-web-files --chmod=0644 demos/php-farm.ini /usr/local/etc/php/conf.d/zz-tracy-farm.ini
COPY --from=tracy-web-files --chmod=0644 demos/apache-farm.conf /etc/apache2/conf-enabled/zz-tracy-demos.conf
COPY --from=tracy-web-files --chmod=0644 demos/ports.conf /etc/apache2/ports.conf
COPY --from=tracy-web-files --chmod=0755 demos/entrypoint.sh /usr/local/bin/tracy-demos-entrypoint
COPY --from=tracy-web-files --chmod=0755 demos/reload.sh /usr/local/bin/tracy-demos-reload

# Site mail, exactly as the per-demo images wire it (web/joomla.Dockerfile). Each pool hands the
# shim its own demo's TRACY_MAIL_* through `env[...]`.
COPY --from=tracy-web-files --chmod=0755 tracy-sendmail /usr/local/bin/tracy-sendmail
COPY --from=tracy-web-files --chmod=0644 tracy-sendmail.ini /usr/local/etc/php/conf.d/zz-tracy-sendmail.ini
RUN ln -sf /usr/local/bin/tracy-sendmail /usr/sbin/sendmail \
 && php -r 'exit(ini_get("sendmail_path") === "/usr/local/bin/tracy-sendmail -t -i" ? 0 : 1);' \
 && php-fpm -t \
 && apache2ctl -t

LABEL tracy.site-mail="v1"
EXPOSE 8080
ENTRYPOINT ["tracy-demos-entrypoint"]
