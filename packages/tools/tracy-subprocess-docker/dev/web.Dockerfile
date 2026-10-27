# packages/tools/tracy-subprocess-docker/dev/web.Dockerfile
# A site's web container, plus what an agent shell needs inside it. On the fleet this becomes the
# Tracy web image; here it is the smallest thing that proves the exec route.
FROM wordpress:6-php8.3-apache

# git ripgrep less jq — same as the fleet's web/*.Dockerfile.
#
# python3, python3-pip — Task 3's site image (see README.md §Deviations): pptx-html-fidelity-audit
# (vendor/tracy/od-skill/skills/pptx-html-fidelity-audit) runs `scripts/extract_pptx.py` /
# `scripts/verify_layout.py`, both a hard `import pptx` — that is `python-pptx` from PyPI, hence
# pip below, pinned to an exact version so two same-date builds cannot silently carry different
# python-pptx/Pillow/lxml.
#
# chromium, fonts-liberation, fonts-noto-color-emoji — Task 3c: web-clone drives a browser over
# CDP and its loader (`scripts/lib/playwright-loader.mjs`) never installs one, it only reuses a
# system Chrome/Edge/Chromium already on PATH — `chromium` is the exact name it searches for,
# matching Debian's package, so no symlink is needed. See the fleet's web/wordpress.Dockerfile for
# the full reasoning, including why the fonts are not optional.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ripgrep less jq python3 python3-pip \
      chromium fonts-liberation fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir --break-system-packages python-pptx==1.0.2

# node — fix round 1, found live: Debian trixie's `nodejs` apt package (20.19.2) has no global
# `WebSocket` without `--experimental-websocket`, and web-clone's only browser-control path
# (`scripts/lib/system-browser.mjs`) does `new WebSocket(url)` with no import and no flag, so the
# apt package made every web-clone script crash with `ReferenceError: WebSocket is not defined` at
# its first CDP connection — invisible to a `curl` smoke test, since curl never runs the skill's
# own code. Node 22 LTS ("Jod") has `WebSocket` as a global with no flag. Debian trixie carries no
# Node 22 package, so this installs the official upstream tarball instead — pinned by version AND
# a SHA256 from nodejs.org's own SHASUMS256.txt for v22.23.2, one hash per architecture this
# Dockerfile is actually built on (this dev cluster builds on Apple Silicon: `arm64`; see the
# fleet's web/wordpress.Dockerfile for the full reasoning and the `amd64` hash the fleet hosts use).
ARG NODE_VERSION=22.23.2
ARG NODE_SHA256_LINUX_X64=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307
ARG NODE_SHA256_LINUX_ARM64=fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8
RUN set -eu; \
      case "$(dpkg --print-architecture)" in \
        amd64) node_arch=x64; node_sha="$NODE_SHA256_LINUX_X64" ;; \
        arm64) node_arch=arm64; node_sha="$NODE_SHA256_LINUX_ARM64" ;; \
        *) echo "no pinned Node checksum for architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
      esac; \
      curl -fsSL -o /tmp/node.tar.xz \
        "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"; \
      echo "${node_sha}  /tmp/node.tar.xz" | sha256sum -c -; \
      tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner; \
      rm /tmp/node.tar.xz; \
      node --version; \
      node -e "if (typeof WebSocket === 'undefined') { throw new Error('global WebSocket missing — web-clone will crash') }"

# No Chromium sandbox is usable as `docker exec -u www-data` in an unprivileged container — see
# the fleet's web/wordpress.Dockerfile for the full reasoning. This drop-in is what Debian's own
# `/usr/bin/chromium` wrapper documents for adding a flag without touching the command that calls
# it, which is what makes web-clone's launcher work unmodified.
RUN printf '%s\n' \
      '# Tracy: this container has no Chromium sandbox available (see web/wordpress.Dockerfile).' \
      'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox"' \
      > /etc/chromium.d/no-sandbox

RUN curl -sS -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
 && chmod +x /usr/local/bin/wp
