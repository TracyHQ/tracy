# tracy-host — the per-host service that shells out the fleet's provision/webroot/go-live
# scripts and runs the agent's `docker exec` (ADR 0014's "one dsh per host"). It needs a real
# `docker` CLI plus `docker compose` on the PATH, talking to the socket bind-mounted in from the
# host (deploy/compose.yml) — it never runs its own dockerd.
#
# NOT `apt-get install docker.io`. Two separate reasons killed that path, both measured against
# this exact base image on 10/09:
#   1. `docker-compose-v2` — the apt package that would give `docker compose` for free — does NOT
#      exist in Debian bookworm's repos (`apt-cache policy docker-compose-v2` returns nothing,
#      `apt-get install` answers "Unable to locate package").
#   2. `docker.io` alone is not a safe substitute either: bookworm ships CLI 20.10.24 (API 1.41),
#      and against a current Docker Desktop daemon (API 1.53 measured here) that failed with
#      `docker version` inside the container answering a bare `Error response from daemon:` —
#      no negotiation, no usable client. `docker exec`/`compose` calls from this process would
#      fail the same way against any host whose daemon has moved past 1.41.
# So both the CLI and the compose plugin are installed by hand: pinned releases, fetched over
# HTTPS, checked against a published sha256 — the docker CLI pin mirrors
# `packages/fleet/tracy-fleet-operation/dsh/Dockerfile`'s own `DOCKER_CLI_VERSION` exactly, so the
# two images that both talk `docker exec` on this fleet carry the same client.
FROM node:24-slim
# `unzip`: an EmDash quickstart ships its site as a packed source zip, and this container is where
# provision unpacks it (emdash/quickstart-restore.sh) before building the site's image. Without it
# the provision dies AFTER downloading 4 MB, on `unzip: command not found` — measured 15/09.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git rsync bash curl python3 iptables ca-certificates \
      unzip \
 && rm -rf /var/lib/apt/lists/*

# The docker CLI (static build) — same pin as the dsh image's own `DOCKER_CLI_VERSION`.
ARG DOCKER_CLI_VERSION=27.5.1
RUN ARCH="$(uname -m)" \
 && curl -fsSL "https://download.docker.com/linux/static/stable/${ARCH}/docker-${DOCKER_CLI_VERSION}.tgz" \
    | tar -xz -C /tmp \
 && mv /tmp/docker/docker /usr/local/bin/docker && rm -rf /tmp/docker \
 && docker --version

# docker compose v2 CLI plugin — pinned tag, checksum-verified. Bump the tag AND both checksums
# together; never trust a floating "latest".
ARG COMPOSE_VERSION=v2.29.7
ARG COMPOSE_SHA256_X86_64=383ce6698cd5d5bbf958d2c8489ed75094e34a77d340404d9f32c4ae9e12baf0
ARG COMPOSE_SHA256_AARCH64=6e9fbd5daa20dca5d7d89145081ae8155d68ef2928b497d9f85b54fe0f9dbb2c
RUN set -eu; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64) sha="$COMPOSE_SHA256_X86_64" ;; \
      aarch64) sha="$COMPOSE_SHA256_AARCH64" ;; \
      *) echo "unsupported arch for docker compose plugin: $arch" >&2; exit 1 ;; \
    esac; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
      "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${arch}"; \
    echo "${sha}  /usr/local/lib/docker/cli-plugins/docker-compose" | sha256sum -c -; \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# docker buildx — the CLI plugin `docker build` needs, pinned and checksum-verified exactly like
# the compose plugin above. Bump the tag AND both checksums together.
#
# 🔒 WITHOUT IT AN EMDASH PROVISION DIES IN FOUR SECONDS, and the message never says `buildx` is
# missing from THIS image. A WordPress or Joomla site is installed from a webroot plus a SQL dump;
# an EmDash site is `docker build`-ed into an image of its own, right here — which is why `unzip`
# is installed above ("before building the site's image"). The daemon has BuildKit on by default,
# this client had no buildx, so every such build ended at:
#     ERROR: BuildKit is enabled but the buildx component is missing or broken.
#     !! could not build tracy/tracy-business-emdash:1.0.1
# Measured 19/09/2026 on the local stand, the first EmDash provision ever attempted there
# (`stageem1`, `tracy-business/emdash-0.x`). Control measured the same day: `DOCKER_BUILDKIT=0
# docker build` inside this very container built and tagged an image — the daemon was never the
# problem, only the missing plugin. The legacy builder is being removed upstream, so it is not the
# fix.
ARG BUILDX_VERSION=v0.37.1
ARG BUILDX_SHA256_X86_64=9447199cdb435f25880548343c128a4b6650e8891ee598905d8d29d39a8e359b
ARG BUILDX_SHA256_AARCH64=e5cc9fe3bbff5cbc91230981f7860e06076110730a2db997082652199042a1f2
RUN set -eu; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64) sha="$BUILDX_SHA256_X86_64"; go="amd64" ;; \
      aarch64) sha="$BUILDX_SHA256_AARCH64"; go="arm64" ;; \
      *) echo "unsupported arch for docker buildx plugin: $arch" >&2; exit 1 ;; \
    esac; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-buildx \
      "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-${go}"; \
    echo "${sha}  /usr/local/lib/docker/cli-plugins/docker-buildx" | sha256sum -c -; \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx; \
    docker buildx version

WORKDIR /opt/tracy-host
# `apps/tracy-host` keeps its own lockfile (generated with
# `cd apps/tracy-host && pnpm install --lockfile-only --ignore-workspace`, same recipe as
# `apps/tracy-web/Dockerfile`) — the root `pnpm-workspace.yaml` has no `.` importer for this
# package's two dependencies to link against inside this build context (only
# apps/tracy-host/package.json is COPYed in), and `--frozen-lockfile` makes a drifted lockfile a
# build failure instead of a silent re-resolve that ships versions no lockfile in the repo names.
COPY apps/tracy-host/package.json apps/tracy-host/pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --prod --ignore-scripts --frozen-lockfile

# The capture browser (POST /_host/capture, src/browser.js): Chromium plus the OS libraries a
# headless browser needs, installed by Playwright's own CLI at the version package.json pins. This
# is by far this image's biggest single cost — roughly +400 MB (Chromium is ~170 MB, its apt
# runtime libraries the rest) — and it is why a change that touches capture must REBUILD and
# redeploy this image to reach a demo host (CLAUDE.md §5: a merge does not carry image code to the
# fleet on its own). Only `chromium` is fetched, not all three engines the dsh image carries.
RUN pnpm exec playwright install --with-deps chromium
COPY apps/tracy-host/src ./src
# The scripts the fleet has always run, at the path they have always had.
COPY packages/fleet/tracy-fleet-operation/scripts /opt/tracy-fleet
# scssphp (vendor/php/scssphp, ADR 0006) rides beside the provision scripts: `ensure-site-folder.mjs`
# copies it into every Joomla site folder as `tools/scssphp/`, where `tools/t4-scss.php` compiles the
# template's scss/ with the site's own PHP — the stock joomla image has no node and no sass (27/09).
COPY vendor/php/scssphp/src /opt/tracy-fleet/vendor/scssphp
COPY vendor/php/scssphp/LICENSE.md /opt/tracy-fleet/vendor/scssphp/LICENSE.md
# The JoomlArt T4 skill (vendor/joomla/joomlart-t4-skill, ADR 0006) rides beside them, whole, because
# a shard builds `tracy/web-joomla:*` from /opt/tracy-fleet/web with NO checkout: joomla.Dockerfile
# copies this tree into the site image, and web/build.sh finds it at /opt/tracy-fleet/vendor/joomla/
# joomlart-t4-skill (sync-fleet-files.sh lifts it onto the host). Without it the four Joomla images of
# IMAGE_TAGS cannot be built on a shard and the updater reports them missing on every run.
# About 66 MB, 63 MB of it `assets/` — and all of it is read at run time (SKILL.md says
# <PLUGIN_ROOT> is the folder holding `assets/` and `skills/`), so nothing is trimmed.
# One tracked directory path, never a glob: scripts/ci/image-context.mjs fingerprints each COPY
# source as a git path, so a change to the skill rebuilds this image.
COPY vendor/joomla/joomlart-t4-skill /opt/tracy-fleet/vendor/joomla/joomlart-t4-skill
# `web/` BELONGS BESIDE THEM, and leaving it out breaks provisioning with a message that names
# the wrong thing. `lib/web-image.sh` resolves the base image a site's agent gets by reading
# `$TRACY_FLEET_DIR/web/IMAGE_TAGS`; with the file absent it gives up with "no web/IMAGE_TAGS
# found, so nothing maps wordpress:php8.3-apache" and `provision.sh` exits 14 — measured 10/09,
# 141ms into a site creation that had already answered 202 and written the seat row, so the seat
# book and the fleet then disagree about a site that does not exist.
#
# The whole directory, not just the one file: `bootstrap.sh` and `migrate-site-to-host-dsh.sh`
# both point an operator at `/opt/tracy-fleet/web/build.sh` by that exact path, and the three
# platform Dockerfiles beside it are what that script builds. The pinned EmDash receiver artifact travels with them.
COPY packages/fleet/tracy-fleet-operation/web /opt/tracy-fleet/web
# The personalize tool travels with the image, not with the provision scripts, and it travels from
# its ONE home. `emdash_complete_source` completes a packed template that ships no personalize tool
# of its own (every template cut from a kit older than 20/09/2026), and a fourth checked-in copy of
# a 1800-line tool is a copy that drifts — a customer's site would then be personalized by rules
# nobody reviewed. Copied here rather than beside the scripts for a second reason: this file holds
# Vietnamese stop words for the brand-initials rule ("và", "công"), which `check-language` refuses
# in `packages/fleet` and allows under `packages/cms`, where the tool is authored and tested.
COPY packages/cms/tracy-emdash-theme-business/tools/personalize.mjs /opt/tracy-fleet/provision/emdash/personalize/personalize.mjs
# The deploy files a host runs, carried so a machine with no checkout (a shard's updater) can lay
# them down at the commit it is about to run. The 13 files the two deploy actions install from a
# checkout (.github/actions/deploy-tracy-stack, .github/actions/deploy-host-dsh), flat in the same
# two directories, plus two extras: prune-old-images.sh (those actions run it from the checkout)
# and deploy/.env.example as the tracy-web.env template.
# Nothing in this image reads them, and prod1/dev keep installing from the checkout.
#
# One COPY line per file, never a glob and never all of deploy/: scripts/ci/image-context.mjs
# fingerprints each COPY source as a git path (a glob exits 2), every file named here rebuilds this
# image when it changes — so nothing a host does not need from the image is named — and adding a
# file is adding a line. The shard beta appends its own files below, one line each.
# scripts/test/tracy-host-fleet-files-image.test.mjs keeps this list, the actions and
# deploy/scripts/check-fleet-files-in-image.sh in step.
COPY deploy/compose.yml /opt/tracy-fleet/stack/
COPY deploy/compose.server.yml /opt/tracy-fleet/stack/
COPY deploy/.env.example /opt/tracy-fleet/stack/tracy-web.env.example
COPY deploy/scripts/deploy-tracy-stack.sh /opt/tracy-fleet/stack/
COPY deploy/scripts/check-server.sh /opt/tracy-fleet/stack/
COPY deploy/scripts/backup-postgres.sh /opt/tracy-fleet/stack/
COPY deploy/scripts/sync-prefixed-site-dns.py /opt/tracy-fleet/stack/
COPY deploy/scripts/prune-old-images.sh /opt/tracy-fleet/stack/
COPY packages/fleet/tracy-fleet-operation/dsh/host-dsh.yml /opt/tracy-fleet/dsh/
COPY packages/fleet/tracy-fleet-operation/dsh/docker-proxy.haproxy.cfg /opt/tracy-fleet/dsh/
COPY packages/fleet/tracy-fleet-operation/dsh/host-dsh.env.example /opt/tracy-fleet/dsh/
COPY packages/fleet/tracy-fleet-operation/dsh/host-dsh-init.sh /opt/tracy-fleet/dsh/
COPY packages/fleet/tracy-fleet-operation/dsh/deploy-host-dsh.sh /opt/tracy-fleet/dsh/
COPY packages/fleet/tracy-fleet-operation/dsh/seed-profile.sh /opt/tracy-fleet/dsh/
COPY packages/fleet/tracy-fleet-operation/dsh/backup-host-dsh.sh /opt/tracy-fleet/dsh/
# The shard's own files (docs/sre/hop-dong-cua-shard.md section 10), flat beside the stack files
# above: /opt/tracy-fleet/stack on a shard IS this layout, so sync-fleet-files.sh copies them name
# for name. One COPY per file, never a glob (scripts/ci/image-context.mjs fingerprints each source as
# a git path); scripts/test/tracy-host-fleet-files-image.test.mjs holds this list equal to the
# CARRIED table, to deploy/scripts/check-fleet-files-in-image.sh and to `sync-fleet-files.sh --list`.
COPY deploy/scripts/install-shard.sh /opt/tracy-fleet/stack/install-shard.sh
COPY deploy/scripts/install-shard-steps.sh /opt/tracy-fleet/stack/install-shard-steps.sh
COPY deploy/scripts/tracy-heartbeat.sh /opt/tracy-fleet/stack/tracy-heartbeat.sh
COPY deploy/scripts/tracy-updater.sh /opt/tracy-fleet/stack/tracy-updater.sh
COPY deploy/scripts/tracy-pgdump-r2.sh /opt/tracy-fleet/stack/tracy-pgdump-r2.sh
COPY deploy/scripts/check-shard.sh /opt/tracy-fleet/stack/check-shard.sh
COPY deploy/scripts/shard-sign.sh /opt/tracy-fleet/stack/shard-sign.sh
COPY deploy/scripts/shard-env-check.sh /opt/tracy-fleet/stack/shard-env-check.sh
COPY deploy/scripts/sync-fleet-files.sh /opt/tracy-fleet/stack/sync-fleet-files.sh
COPY deploy/compose.shard.yml /opt/tracy-fleet/stack/compose.shard.yml
COPY deploy/nginx/shard.conf /opt/tracy-fleet/stack/nginx-shard.conf
COPY deploy/shard.env.example /opt/tracy-fleet/stack/shard.env.example
COPY deploy/systemd/tracy-heartbeat.service /opt/tracy-fleet/stack/tracy-heartbeat.service
COPY deploy/systemd/tracy-heartbeat.timer /opt/tracy-fleet/stack/tracy-heartbeat.timer
COPY deploy/systemd/tracy-updater.service /opt/tracy-fleet/stack/tracy-updater.service
COPY deploy/systemd/tracy-updater.timer /opt/tracy-fleet/stack/tracy-updater.timer
COPY deploy/systemd/tracy-backup-postgres.service /opt/tracy-fleet/stack/tracy-backup-postgres.service
COPY deploy/systemd/tracy-backup-postgres.timer /opt/tracy-fleet/stack/tracy-backup-postgres.timer
ENV TRACY_FLEET_DIR=/opt/tracy-fleet PORT=8090
EXPOSE 8090
# Which commit built this image, for a host that has no checkout to ask (the shard heartbeat) and
# for `docker inspect`. LAST IN THE FILE ON PURPOSE, as in apps/tracy-web/Dockerfile: the commit
# changes on every build, and anywhere earlier it would invalidate the cache of every layer below.
# scripts/ci/image-context.mjs hashes this file's text, not the value passed, so a new commit alone
# does not make a new image — a reused image keeps the commit of the build that made it. Compare
# images by tag, never by this commit.
ARG TRACY_SOURCE_COMMIT=
ENV TRACY_SOURCE_COMMIT=${TRACY_SOURCE_COMMIT}
# The repository that built it; the workflow passes $GITHUB_REPOSITORY, so the move to TracyHQ/tracy needs no edit here.
ARG TRACY_SOURCE_REPO=TracyHQ/tch
LABEL org.opencontainers.image.source="https://github.com/${TRACY_SOURCE_REPO}" \
      org.opencontainers.image.revision="${TRACY_SOURCE_COMMIT}" \
      org.opencontainers.image.title="tracy-host"
CMD ["node", "src/server.js"]
