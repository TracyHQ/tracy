# The web container of a WordPress site, plus what the agent's shell needs inside it.
#
# From Plan 3 the agent has no container of its own per site: one dsh per host runs every site's
# session and reaches into THIS container — `docker exec -u www-data -w /site/<label>`. So every
# tool a bash turn reaches for has to be here, and the two users the exec names have to exist.
# Nothing about serving the site changes; this is the same upstream image with a handful of
# packages on it — one of them (node) because two enabled agent skills need it (see below).
#
# Build on the fleet host, from a copy of this repo (web/build.sh does every line of IMAGE_TAGS):
#
#   docker build -f packages/fleet/tracy-fleet-operation/web/wordpress.Dockerfile \
#     --build-context tracy-web-files=packages/fleet/tracy-fleet-operation/web \
#     --build-arg BASE=wordpress:php8.3-apache -t tracy/web-wordpress:php8.3-apache-20260923-r1 .
#
# BASE is every `wordpress:*` tag the fleet puts a site on — `wordpress:php8.3-apache` for a clone
# and `wordpress:apache` for a fleet-born site (platform/wordpress.sh). One image per base, because
# the base IS the site's PHP: an upgrade that moves the tag must not silently move the PHP with it.
# web/IMAGE_TAGS maps base to built image and is what provision reads.
ARG BASE=wordpress:php8.3-apache
FROM ${BASE}

# git       — the webroot baseline (ADR 0073) is a git repo the agent commits into, in this container
# ripgrep   — dsh's grep tool shells out to `rg`; without it the tool fails with ENOENT, not "no match"
# less, jq  — what a bash turn reaches for between those two
# curl, ca-certificates — the fetch below, and every later fetch a turn makes
#
# python3, python3-pip — pptx-html-fidelity-audit (vendor/tracy/od-skill/skills/pptx-html-fidelity-audit)
# runs `scripts/extract_pptx.py` and `scripts/verify_layout.py`, both a hard `import pptx` (no
# fallback) — that is `python-pptx` from PyPI, not a Debian package, hence pip below, pinned to an
# exact version: this pip install has no other anchor (unlike wp-cli below, which pins a release +
# checksum), so two same-date builds must not silently carry different python-pptx/Pillow/lxml.
#
# chromium, fonts-liberation, fonts-noto-color-emoji — web-clone's `.mjs` scripts drive a browser
# over CDP; its loader (`scripts/lib/playwright-loader.mjs`) never installs one (no
# `npm install playwright` is allowed here), it only reuses a system Chrome/Edge/Chromium already
# on PATH, and `findSystemChromiumExecutable` searches `chromium` before `chromium-browser` — the
# exact name Debian's package installs, so no symlink is needed. In the old per-site dsh image the
# agent had Playwright's bundled Chromium; this restores the same capability (a real browser, no
# npm package) now that the agent's shell runs in this container instead. The two font packages
# are `recon-site.mjs`'s own gap otherwise: missing Liberation metrics substitute a different-width
# fallback font under real pages' `font-family` stacks, and missing color-emoji glyphs render as
# tofu boxes in screenshots — both silent, neither an error.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ripgrep less jq curl ca-certificates python3 python3-pip \
      chromium fonts-liberation fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir --break-system-packages python-pptx==1.0.2

# node — two enabled agent skills need an interpreter, not just shell tools: web-clone
# (vendor/tracy/od-skill/skills/web-clone) runs its whole toolchain as zero-dependency `.mjs` scripts
# (recon-site.mjs, asset-harvest.mjs, …) invoked as `node scripts/xxx.mjs` (the skill explicitly
# forbids `npm install` for it, so node alone is enough — no package.json here), and
# pptx-html-fidelity-audit's node-side tooling shares the same runtime.
#
# NOT Debian trixie's `nodejs` apt package (20.19.2) — fix round 1, found live: that build has no
# global `WebSocket` constructor without `--experimental-websocket`, and web-clone's ONLY
# browser-control path (`scripts/lib/system-browser.mjs`) does `new WebSocket(url)` with no import
# and no flag, so the apt package makes every web-clone script crash with `ReferenceError:
# WebSocket is not defined` at its first CDP connection — invisible to a `curl` smoke test because
# curl never runs the skill's own code. Node 22 LTS ("Jod") has `WebSocket` as a global with no
# flag (this is also why `emdash.Dockerfile`'s `node:22-slim` base was never affected). Debian
# trixie carries no Node 22 package, so this installs the official upstream tarball instead —
# pinned by version AND a SHA256 from nodejs.org's own SHASUMS256.txt for v22.23.2, one hash per
# architecture this Dockerfile is actually built on: `amd64` on the fleet hosts, `arm64` on this
# Mac's dev cluster. Verified against the pinned hash before it is ever extracted.
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

# `docker exec -u www-data` is not root, and this container gets no extra capabilities — so
# Chromium's own sandbox (unprivileged user namespaces, or the setuid `chrome-sandbox` helper)
# fails here every time: "No usable sandbox!" without `chromium-sandbox` installed, or "Failed to
# move to new namespace: … Operation not permitted" with it, because Docker's default seccomp
# profile blocks the underlying `clone()`/`unshare()` either way. web-clone's own launcher
# (`vendor/tracy/od-skill/skills/web-clone/scripts/lib/system-browser.mjs`) spawns plain `chromium
# <flags>` with no `--no-sandbox` of its own and no way to pass one in — so add it the way
# Debian's `/usr/bin/chromium` wrapper documents for exactly this: it sources every file in
# `/etc/chromium.d/` into `$CHROMIUM_FLAGS` before exec'ing the real binary. This makes the
# skill's own command work as written, no symlink or script edit needed.
RUN printf '%s\n' \
      '# Tracy: this container has no Chromium sandbox available (see web/wordpress.Dockerfile).' \
      'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox"' \
      > /etc/chromium.d/no-sandbox

# wp-cli, the same binary provision already runs against the site from a throwaway container.
#
# A RELEASE, with its checksum, and not `builds/gh-pages/phar/wp-cli.phar`: that path is a floating
# file, so two builds of "the same" image a month apart carry different wp-cli, and a `--info` check
# catches a download that broke but never one that CHANGED. The digest is the one wp-cli publishes
# beside the release (wp-cli-2.12.0.phar.sha512, read 2026-09-06); moving to a newer wp-cli is
# editing both lines, which is what makes it a decision rather than a Tuesday.
# 🔒 EVERY FETCH IN THIS FILE RETRIES, AND THAT IS NOT DEFENSIVE HABIT — IT IS A MEASUREMENT.
# Building the 14 IMAGE_TAGS lines on a fresh fleet host (prod1, 08/09/2026) lost FOUR of them to
# `curl` exit 28 on exactly this line. The route from that machine to `github.com` answers 10 times
# out of 15: TCP connects, TLS completes, and then nothing comes back. The redirect target
# (`objects.githubusercontent.com`) was 15/15 in the same minute, so one retry clears it.
#
# Retrying is safe precisely because both fetches here are checksum-pinned: a truncated or swapped
# body fails `sha512sum -c` on the next line and the build stops, so the retry can only turn a
# flaky network into a slower build, never into a different binary. A one-shot `curl` for an
# artifact the image cannot work without is the fragile shape, on any network.
#
# ⚠ It does NOT cover an upstream that has aged out, and the difference is worth knowing before
# reaching for a flag. The same run also lost `wordpress:php8.0-apache` and `joomla:php8.0-apache`,
# but to `E: Release file for .../bullseye-security/InRelease is expired`. Disabling that check
# (`-o Acquire::Check-Valid-Until=false`) gets past the signature and straight into the real wall:
# the pool itself 404s. Debian 11 is end of life, so those two lines LEFT IMAGE_TAGS on 08/09/2026
# rather than being retried around — the block at the top of that file records what it costs.
ARG WP_CLI_VERSION=2.12.0
ARG WP_CLI_SHA512=be928f6b8ca1e8dfb9d2f4b75a13aa4aee0896f8a9a0a1c45cd5d2c98605e6172e6d014dda2e27f88c98befc16c040cbb2bd1bfa121510ea5cdf5f6a30fe8832
RUN curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors --connect-timeout 20 \
      -o /usr/local/bin/wp \
      "https://github.com/wp-cli/wp-cli/releases/download/v${WP_CLI_VERSION}/wp-cli-${WP_CLI_VERSION}.phar" \
 && echo "${WP_CLI_SHA512}  /usr/local/bin/wp" | sha512sum -c - \
 && chmod +x /usr/local/bin/wp \
 && wp --allow-root --info >/dev/null

# The two users `docker exec -u` names: www-data for a seat that may write, nobody for a guest.
# Checked at BUILD time, because a missing user shows up at run time as an exec that fails with
# "unable to find user", inside a session, with nothing pointing back at the image.
RUN id www-data && id nobody

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
