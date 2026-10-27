# GitHub Actions runner for the source repository (compose.yml: RUNNER_REPO), packaged so the build box stays clean.
#
# The runner drives the HOST docker daemon through a mounted socket (docker-out-of-docker), not a
# nested daemon: a build inside a privileged child daemon would have its own cache, and the image
# it produced would have to be exported and re-imported to reach the host at all.
#
# 🔒 A MOUNTED SOCKET IS ROOT ON THE HOST. Packaging the runner in a container tidies the
# filesystem; it does NOT fence the runner off from the rest of this machine. The fence that
# matters here is the resource ceiling in compose.yml, which keeps a build from starving the dev
# stack that shares the box.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# 🔒 `python3 make g++` ARE FOR ONE PACKAGE ONLY, AND WITHOUT THEM `pnpm install` DIES MIDWAY.
# `fs-ext` compiles natively through node-gyp, and node-gyp needs Python. Measured 07/09 on the runner:
#   fs-ext install: gyp ERR! stack Error: Could not find any Python installation to use
# The error surfaces in the middle of installing 410 packages, after a few minutes, so it looks like a
# flaky install rather than an image missing its tools. dsh dies at boot if `fs-ext` cannot build — CLAUDE.md §5.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git jq sudo unzip zip xz-utils openssh-client \
      python3 make g++ \
      libicu74 liblttng-ust1 libkrb5-3 zlib1g libssl3 \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# uid 1001 so files the runner writes on a bind mount line up with the host `runner` user.
RUN useradd -m -u 1001 -s /bin/bash runner

ARG RUNNER_VER=2.337.0
RUN mkdir -p /home/runner/actions-runner && cd /home/runner/actions-runner \
 && curl -fsSL -o r.tar.gz "https://github.com/actions/runner/releases/download/v${RUNNER_VER}/actions-runner-linux-x64-${RUNNER_VER}.tar.gz" \
 && tar xzf r.tar.gz && rm r.tar.gz \
 && ./bin/installdependencies.sh \
 && chown -R runner:runner /home/runner

# 🔒 NODE IS NOT OPTIONAL HERE, AND ITS ABSENCE LOOKS LIKE A WORKFLOW BUG.
#
# `deploy-workers.yml` runs `node scripts/changed-services.mjs` in its FIRST step, before it
# installs anything — so a runner without node fails at `line 10: node: command not found`, exit
# 127, in a step whose log shows only the script it was about to run. Measured 07/09: four
# consecutive pushes to `develop` deployed no Worker at all while `build-dsh-image` stayed green
# beside them, which is exactly the shape that reads as "CD works" from the run list.
#
# THE VERSION IS THE ONE CLAUDE.md §5 PINS, and for the reason stated there: below 22.19 / 24,
# `tsdown` cannot strip TypeScript natively and falls back to `unrun`, a package no lockfile
# carries. That failure names neither node nor the version — so this ARG is the cheapest place to
# keep the two in step.
#
# Installed from the official tarball rather than apt: Ubuntu 24.04 ships node 18, and NodeSource
# would add a second apt key and repo to a container that already carries docker's.
ARG NODE_VER=24.11.1
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
      --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md \
 && rm /tmp/node.tar.xz \
 # The corepack bundled with node fails "Cannot find matching keyid" (CLAUDE.md §5); the released
 # one works, and it is what picks pnpm 11.18.0 at the root and 11.7.0 inside the submodule.
 && npm i -g corepack@latest \
 && corepack enable pnpm \
 && node -v && corepack -v

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER runner
WORKDIR /home/runner/actions-runner
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
