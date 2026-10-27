# The web container of a Joomla site, plus what the agent's shell needs inside it.
#
# Same reasoning as web/wordpress.Dockerfile, read that one first: from Plan 3 the agent's bash
# runs `docker exec -u www-data -w /site/<label>` into THIS container, so the tools and the users
# have to be in the image.
#
# Build on the fleet host, from a copy of this repo (web/build.sh does every line of IMAGE_TAGS):
#
#   docker build -f packages/fleet/tracy-fleet-operation/web/joomla.Dockerfile \
#     --build-context tracy-web-files=packages/fleet/tracy-fleet-operation/web \
#     --build-arg BASE=joomla:5-apache -t tracy/web-joomla:5-apache-20260923-r1 .
#
# BASE is every `joomla:*` tag the fleet puts a site on, and there are two families of them:
#
#   joomla:5-apache · joomla:6-apache        a clone (platform/joomla.sh) and a fleet-born site
#   joomla:php8.0-apache … php8.3-apache     the PHP an upgrade hop runs on (provision/set-php.sh,
#                                            php_matrix.py — a hop picks the one PHP both majors run)
#
# One image per base, because the base IS the site's PHP. web/IMAGE_TAGS maps base to built image;
# a hop whose base has no line there keeps the upstream image and says so, rather than moving a
# site onto a PHP nobody asked for.
#
# No wp-cli here: Joomla's command line is `php cli/joomla.php`, already in the webroot.
ARG BASE=joomla:5-apache
FROM ${BASE}

# git       — the webroot baseline (ADR 0073) is a git repo the agent commits into, in this container
# ripgrep   — dsh's grep tool shells out to `rg`; without it the tool fails with ENOENT, not "no match"
# less, jq  — what a bash turn reaches for between those two
# curl, ca-certificates — every fetch a turn makes
#
# python3, python3-pip — pptx-html-fidelity-audit (vendor/tracy/od-skill/skills/pptx-html-fidelity-audit)
# runs `scripts/extract_pptx.py` and `scripts/verify_layout.py`, both a hard `import pptx` (no
# fallback) — that is `python-pptx` from PyPI, not a Debian package, hence pip below, pinned to an
# exact version so two same-date builds cannot silently carry different python-pptx/Pillow/lxml.
#
# chromium, fonts-liberation, fonts-noto-color-emoji — see web/wordpress.Dockerfile for the full
# reasoning: web-clone drives a browser over CDP and its loader only reuses a system browser
# already on PATH (`chromium` is the exact name it searches, matching Debian's package — no
# symlink needed), never installs one itself; the fonts are what its recon/screenshot scripts
# otherwise render with wrong metrics or missing color-emoji glyphs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ripgrep less jq curl ca-certificates python3 python3-pip \
      chromium fonts-liberation fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir --break-system-packages python-pptx==1.0.2

# node — see web/wordpress.Dockerfile for the full reasoning, including why this is the official
# upstream tarball (pinned version + SHA256 from nodejs.org's SHASUMS256.txt, one hash per built
# architecture) and NOT Debian trixie's `nodejs` apt package: that build's Node 20 has no global
# `WebSocket`, and web-clone's only browser-control path (`scripts/lib/system-browser.mjs`) does
# `new WebSocket(url)` with no import and no flag — a `ReferenceError` at the first CDP connection
# that a `curl` smoke test cannot see.
ARG NODE_VERSION=22.23.2
ARG NODE_SHA256_LINUX_X64=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307
ARG NODE_SHA256_LINUX_ARM64=fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8
RUN set -eu; \
      case "$(dpkg --print-architecture)" in \
        amd64) node_arch=x64; node_sha="$NODE_SHA256_LINUX_X64" ;; \
        arm64) node_arch=arm64; node_sha="$NODE_SHA256_LINUX_ARM64" ;; \
        *) echo "no pinned Node checksum for architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
      esac; \
      curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors --connect-timeout 20 \
        -o /tmp/node.tar.xz \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
      echo "${node_sha}  /tmp/node.tar.xz" | sha256sum -c -; \
      tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner; \
      rm /tmp/node.tar.xz; \
      node --version; \
      node -e "if (typeof WebSocket === 'undefined') { throw new Error('global WebSocket missing — web-clone will crash') }"

# No Chromium sandbox is usable as `docker exec -u www-data` in an unprivileged container — see
# web/wordpress.Dockerfile for the full reasoning. This is the drop-in Debian's own
# `/usr/bin/chromium` wrapper documents for adding a flag without touching the command that calls
# it, which is what makes web-clone's launcher work unmodified.
RUN printf '%s\n' \
      '# Tracy: this container has no Chromium sandbox available (see web/wordpress.Dockerfile).' \
      'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox"' \
      > /etc/chromium.d/no-sandbox

# The two users `docker exec -u` names: www-data for a seat that may write, nobody for a guest.
# Checked at BUILD time, because a missing user shows up at run time as an exec that fails with
# "unable to find user", inside a session, with nothing pointing back at the image.
RUN id www-data && id nobody

# Template construction needs the same skill at discovery time in dsh and at execution time
# inside the site's web container. Keep the plugin root intact for its relative asset paths.
COPY vendor/joomla/joomlart-t4-skill /opt/tracy/joomlart-t4
RUN mkdir -p /opt/tracy/skills \
 && ln -s /opt/tracy/joomlart-t4/skills/joomlart-t4-template /opt/tracy/skills/joomlart-t4-template \
 && cd /opt/tracy/joomlart-t4/skills/joomlart-t4-template \
 && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev --ignore-scripts \
 && test -s SKILL.md \
 && node --input-type=module -e "await import('jsdom'); await import('sass'); await import('playwright')"

# Mail: route PHP mail() to tracy-web through the shim, because this image has no MTA and must not
# get one (a site would then hold delivery credentials, and a draft could reach real people). The
# shim holds no key: it posts the raw message with the site's token, and tracy-web decides.
# /usr/sbin/sendmail points at it too, so Joomla's "Sendmail" mailer and any plugin that shells out
# to sendmail land in the same place. See web/tracy-sendmail for the exit codes mail() relies on.
#
# `--from=tracy-web-files` is a NAMED build context (web/build.sh passes
# `--build-context tracy-web-files=<this directory>`), so the two files arrive the same way whatever
# the main context is. Last in the file: a change to the shim rebuilds this layer and nothing else.
# The label is what scripts/provision/enable-site-mail.sh checks before moving a site onto an image.
COPY --from=tracy-web-files --chmod=0755 tracy-sendmail /usr/local/bin/tracy-sendmail
COPY --from=tracy-web-files --chmod=0644 tracy-sendmail.ini /usr/local/etc/php/conf.d/zz-tracy-sendmail.ini
RUN ln -sf /usr/local/bin/tracy-sendmail /usr/sbin/sendmail \
 && php -r 'exit(ini_get("sendmail_path") === "/usr/local/bin/tracy-sendmail -t -i" ? 0 : 1);'
LABEL tracy.site-mail="v1"
