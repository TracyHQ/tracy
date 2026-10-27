# syntax=docker/dockerfile:1.7
# tracy/dsh — ONE dsh for every site on a host, built from this repository.
#
# WHAT IT IS. The same surface a customer's lane carried until 06/09 — four of the five bundles
# named by `profile/package.json` beside this file (the four the deleted `lanes/native-lane-profile`
# named; `@goodandready/dsh-subscriptions` is a 24/09 addition, not part of that lineage), every
# plugin `@tracy/dsh-native-bundle` names, the shared skills, the design systems, the twelve
# presets, `dsh-passwords` on 8080 — except that one
# process serves EVERY site on the machine instead of one container per site. Commands the agent
# runs never execute here: `@tracy/dsh-subprocess-docker` hands them to `docker exec` on the site's
# own web container.
#
# NO REGISTRY, ANYWHERE. dsh runs from the vendored source after `pnpm build:official`; the vendor
# plugins are built from `vendor/` (LAW #5: Tracy's fixes live there under `-tracy.N`, and
# this image is the first thing to read them instead of a published tarball); Tracy's own plugins
# are directory copies of their committed `lib/` (LAW #3). npm.tracy.ai is not reachable from a
# fleet host and never will be — the old lane image needed a read account and a BuildKit secret to
# get past that, and both are gone.
#
#   export DSH_COMMIT=$(git ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print $3}')
#   DOCKER_BUILDKIT=1 docker build --build-arg DSH_COMMIT="$DSH_COMMIT" \
#     -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile -t tracy/dsh:dev .

# ══ stage: build ═══════════════════════════════════════════════════════════════════════════════
# Everything that needs a toolchain. Only the products cross into the runtime stage — no compiler,
# no pnpm store, no source tree of anything but dsh itself.
FROM node:24-slim AS tools

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# The docker CLI only (static build); the daemon is the host's, reached through a mounted socket
# or, on the fleet, through a proxy named by TRACY_DOCKER_HOST.
ARG DOCKER_CLI_VERSION=27.5.1
RUN ARCH="$(uname -m)" \
 && curl -fsSL "https://download.docker.com/linux/static/stable/${ARCH}/docker-${DOCKER_CLI_VERSION}.tgz" \
    | tar -xz -C /tmp \
 && mv /tmp/docker/docker /usr/local/bin/docker && rm -rf /tmp/docker \
 && docker --version

# wp-cli: site inspection from the dsh side (webroot-read, screenshots). The agent's own shell runs
# in the site container and uses that container's `wp`; this copy serves dsh's own tools.
#
# A RELEASE with its checksum, not `builds/gh-pages/phar/wp-cli.phar` — the same reasoning, the same
# two constants and the same digest as the site image
# (`packages/fleet/tracy-fleet-operation/web/wordpress.Dockerfile`): that gh-pages path is a
# floating file, so two builds of "the same" image a month apart carry different wp-cli, and this
# one runs inside the container that holds the docker socket. The digest is wp-cli's own
# `wp-cli-2.12.0.phar.sha512`. Moving to a newer wp-cli is editing both lines.
ARG WP_CLI_VERSION=2.12.0
ARG WP_CLI_SHA512=be928f6b8ca1e8dfb9d2f4b75a13aa4aee0896f8a9a0a1c45cd5d2c98605e6172e6d014dda2e27f88c98befc16c040cbb2bd1bfa121510ea5cdf5f6a30fe8832
RUN curl -sSL -o /usr/local/bin/wp \
      "https://github.com/wp-cli/wp-cli/releases/download/v${WP_CLI_VERSION}/wp-cli-${WP_CLI_VERSION}.phar" \
 && echo "${WP_CLI_SHA512}  /usr/local/bin/wp" | sha512sum -c - \
 && chmod +x /usr/local/bin/wp

# pnpm at the version the vendored tree pins (packageManager).
RUN corepack enable pnpm && corepack prepare pnpm@11.7.0 --activate

# ══ stage: dsh — the vendored harness, built from source, on the shared tools ══════════════════════
FROM tools AS dsh

# ── dsh from source ─────────────────────────────────────────────────────────────────────────────
WORKDIR /opt/dsh
COPY vendor/tracy/deepseek-harness/ ./
# Workspace slots left behind by older checkouts of the host tree: no package.json, only ignored
# build output that .dockerignore strips, so they land here as empty directories. pnpm skips them,
# but tsdown's `workspace: ['packages/*/*']` glob does not — it matches the empty slot, falls back
# to the ROOT package name, and fails looking for the root's entries inside it.
RUN for slot in packages/*/*/; do [ -f "$slot/package.json" ] || rm -rf "$slot"; done

# The registry is set per RUN, not with ENV: an ENV would persist into the runtime image and
# every `npm`/`pnpm` a later step or an operator runs there would silently inherit it.
#
# pnpm's CACHE dir is mounted beside its store; they are two different directories. pnpm 11 checks
# a frozen lockfile against the supply-chain policy (minimumReleaseAge) by fetching the FULL
# registry document of every entry — 1,385 here — and remembers a lockfile that passed, by content
# hash and policy, in /root/.cache/pnpm/lockfile-verified.jsonl. Unmounted, that memory died with
# the step, so every re-run of this install fetched all 1,385 documents again, and one slow answer
# failed the build after 13 minutes (measured 28/09/2026 on a local build:
# `@asamuzakjp/dom-selector@7.1.1 could not be checked against minimumReleaseAge (The operation
# was aborted due to timeout)`). Mounted, an unchanged lockfile prints "passes supply-chain policies
# (verified … ago)" and fetches nothing; a changed lockfile or a changed policy is checked in full,
# as before. The policy is not relaxed, only remembered.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    npm_config_registry=https://registry.npmjs.org pnpm install --frozen-lockfile
# The build context carries no .git (see .dockerignore), so the official client profile takes its
# commit stamp from the environment — the seam scripts/client-build-environment.ts documents for
# non-Git build environments. No default: a baked-in sha goes stale the moment the submodule
# pointer moves, and a stale stamp is invisible in the built image.
ARG DSH_COMMIT
RUN test -n "$DSH_COMMIT" || { echo "build-arg DSH_COMMIT is required: git ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print \$3}'" >&2; exit 2; }
RUN DSH_CLIENT_COMMIT_HASH="$DSH_COMMIT" pnpm build:official
RUN test -f apps/cli/lib/bin.js && node apps/cli/lib/bin.js --version

# ── dsh's own source maps go HERE, so /opt/dsh is final at the end of this stage ─────────────────
#
# 🔒 WHY A STAGE BOUNDARY RIGHT AFTER dsh IS BUILT — 15/09/2026, measured on the CI box.
# The runtime stage used to `COPY --from=build /opt/dsh`, and the map deletion below ran over
# /opt/dsh AFTER the plugin COPYs. So a one-line change to any Tracy plugin produced a new snapshot
# of /opt/dsh (same bytes, new layer), and BuildKit re-hashed its 1.6 GB / 69,866 files before it
# could decide the runtime COPY was cached: a 42 s silent gap in the log, on a build whose every
# real step took 36 s in total. `COPY --from=dsh` below reads THIS stage, which a plugin change never
# touches, so its checksum is already known.
#
# The deletion itself is unchanged (see "282 MB of source maps" further down): it only moved to
# before anything else reads /opt/dsh, and nothing after this line writes there.
RUN find /opt/dsh -name '*.map' -type f -delete

# ══ stage: build — Tracy's plugins, forks, skills and profile, on top of a finished dsh ═══════════
# ══ stages: the two vendored forks, built from source and copied FINISHED into `build` ═════════════
#
# Two packages a lane used to install from npm.tracy.ai. `dsh-better-sidebar`'s `lib/` is gitignored
# upstream, so it MUST be built here — a copy of the checkout would ship an empty plugin. The other
# two Tracy patches (`dsh-better-locale`, `dsh-locale-vi`) commit their `lib/` the way this repo's
# own LAW #3 requires and carry no runtime dependency, so they are copied whole a few layers down
# rather than rebuilt: an install of tsdown and typescript to reproduce byte-identical committed
# output is a network round trip that changes nothing.
#
# 🔒 WHY FOUR SMALL STAGES PER FORK — 16/09/2026, each step measured on the CI box.
#   1. Install and build in ONE RUN after a COPY of the whole tree: any source edit re-ran the whole
#      dependency install (28 s dsh-passwords, 55 s dsh-better-sidebar on PR #102).
#   2. The two forks as consecutive layers of one stage: an edit to dsh-passwords re-ran
#      dsh-better-sidebar too (43 s install with a node-pty compile, 36 s build).
#   3. The install as its own layer, then `npm prune --omit=dev` / `rm -rf node_modules` in the build
#      RUN: WORSE — deleting 432 installed packages that live in a LOWER layer is a copy-up/whiteout per
#      file on overlayfs, and took 105–134 s ("removed 432 packages in 2m").
# So nothing below deletes what an earlier layer installed. Per fork:
#   `-deps`  full install from the manifests only        — reused unless the lockfile changes
#   `-build` the source over `-deps`, then the build     — the only stage a source edit re-runs
#   `-prod`  production install from the manifests only  — reused unless the lockfile changes
#   final    the source tree + the build output + the production node_modules
# Each is `FROM tools`, never `FROM dsh`: neither fork reads /opt/dsh, so a submodule bump rebuilds
# neither, and BuildKit builds the two forks side by side.
# `--ignore-scripts` on every install: the packages' own `prepare` IS their build and needs `src/`;
# the one dependency script a build needs is re-run by name (`npm rebuild esbuild`).

# `dsh-passwords`: the gateway on 8080, the seat door, and the password door. npm, not pnpm — it
# ships an npm-shrinkwrap.json (upstream 2.7.7). The build needs esbuild, react and typescript; the
# running gateway needs express, ws, bcryptjs, jsonwebtoken, dotenv and yaml — none has an install script.
FROM tools AS passwords-deps
COPY vendor/tracy/dsh-passwords/package.json vendor/tracy/dsh-passwords/npm-shrinkwrap.json vendor/tracy/dsh-passwords/.npmrc /opt/vendor/tracy/dsh-passwords/
RUN cd /opt/vendor/tracy/dsh-passwords \
 && npm_config_registry=https://registry.npmjs.org npm ci --no-audit --no-fund --ignore-scripts \
 && npm rebuild esbuild

FROM passwords-deps AS passwords-build
COPY vendor/tracy/dsh-passwords /opt/vendor/tracy/dsh-passwords
RUN cd /opt/vendor/tracy/dsh-passwords \
 && npm run build \
 && test -f dist/cli.js

FROM tools AS passwords-prod
COPY vendor/tracy/dsh-passwords/package.json vendor/tracy/dsh-passwords/npm-shrinkwrap.json vendor/tracy/dsh-passwords/.npmrc /opt/vendor/tracy/dsh-passwords/
RUN cd /opt/vendor/tracy/dsh-passwords \
 && npm_config_registry=https://registry.npmjs.org npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
 && npm cache clean --force

FROM tools AS passwords
COPY vendor/tracy/dsh-passwords /opt/vendor/tracy/dsh-passwords
COPY --from=passwords-build /opt/vendor/tracy/dsh-passwords/dist         /opt/vendor/tracy/dsh-passwords/dist
COPY --from=passwords-prod  /opt/vendor/tracy/dsh-passwords/node_modules /opt/vendor/tracy/dsh-passwords/node_modules
RUN cd /opt/vendor/tracy/dsh-passwords \
 && test -f dist/cli.js \
 && node -e "for (const m of ['express', 'ws', 'bcryptjs', 'jsonwebtoken', 'dotenv', 'yaml']) require.resolve(m)" \
 && ! test -e node_modules/typescript

# `dsh-better-sidebar`: the side card's file tree, editor, changes, jobs and side chat, and Tracy's
# `tracy:browser` site preview (0.21.1-tracy.1, TRACY-FORK.md). The full install builds it; the tree
# is then replaced with a production-only one — its `@deepseek-ai/*` peers are devDependencies ON
# PURPOSE (the host supplies them at mount time through `profiles/node_modules`), so keeping them
# here would give the plugin a SECOND copy of cordis and a plugin graph that fails at registration.
#
# Since 0.21 there is nothing to compile: the plugin's Terminal tab and with it `node-pty` are gone
# upstream (0 hits in its `pnpm-lock.yaml`), so this stage no longer needs the compiler, the
# `pnpm rebuild`, or the prebuilds cleanup it carried until 0.18.1-tracy.9.
#
# ⚠ `--ignore-scripts` ON BOTH INSTALLS. No production dependency has an install script (checked
# 26/09 over the whole `--prod` tree), but the package's OWN `prepare` (`tsdown`) is a root
# lifecycle script pnpm runs on install: on the `--prod` install tsdown is a devDependency it was
# just told to skip (`sh: 1: tsdown: not found`), and on the full install it needs `src/`, which
# the `-deps` layer does not have yet. The build runs it on purpose, in `sidebar-build`.
#
# ⚠ `--prod` IS NOT THE END OF IT: 259 MB OF THE PRODUCTION TREE IS BROWSER CODE THAT IS ALREADY
# IN `lib/`. tsdown bundles the client into `lib/client*.js`, and the packages it inlined stay
# installed beside it: react-icons, mermaid, CodeMirror, dompurify, rxjs. A second copy of a
# renderer that only ever runs in a browser, shipped to every fleet host (261 MB → 1.8 MB).
#
# THE KEEP LIST IS DERIVED, NOT GUESSED. Only `lib/index.js` and `lib/invariant.js` run on this
# side; the bare specifiers they name are `ws`, `yaml`, `@deepseek-ai/schemastery`, and five
# `@deepseek-ai/dsh-*` (`tools`, `subagent`, `settings`, `session`, `llm`). The five resolve UP the
# tree from the host (see the paragraph above). The other three are kept, with what
# `@deepseek-ai/schemastery` itself imports (`@deepseek-ai/cosmokit`, `@standard-schema/spec`).
# The local schemastery copy is safe beside dsh's own: a volatile config reference is recognised
# by `Symbol.for('cosmokit.volatile.write')`, not by object identity (`cosmokit/src/volatile.ts`).
# Re-derive it after a version bump:
#   grep -oE '(from|require\(|import\(|resolve\()\s*"[^"./][^"]*"' lib/index.js lib/invariant.js
#
# Nothing is served OUT of node_modules either — `index.js` names the directory exactly once, to
# EXCLUDE it from a file listing — so deleting a bundled renderer cannot leave a route without
# a file.
FROM tools AS sidebar-deps
COPY vendor/tracy/dsh-better-sidebar/package.json vendor/tracy/dsh-better-sidebar/pnpm-lock.yaml vendor/tracy/dsh-better-sidebar/pnpm-workspace.yaml /opt/vendor/tracy/dsh-better-sidebar/
# pnpm's cache dir is mounted for the reason given at the dsh install: it remembers a lockfile
# that already passed the supply-chain check.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    cd /opt/vendor/tracy/dsh-better-sidebar \
 && npm_config_registry=https://registry.npmjs.org CI=true pnpm install --frozen-lockfile --ignore-scripts

FROM sidebar-deps AS sidebar-build
COPY vendor/tracy/dsh-better-sidebar /opt/vendor/tracy/dsh-better-sidebar
# The site/launcher menus use the Menu extension shipped by this dsh fork.
# Typecheck against that same contract, not the older npm declaration installed
# by sidebar-deps. Runtime primitives remain external and come from the host.
COPY --from=dsh /opt/dsh/packages/client/ui-primitives/lib/types /opt/tracy-dsh-primitives-types
RUN cd /opt/vendor/tracy/dsh-better-sidebar \
 && cp -R /opt/tracy-dsh-primitives-types/. node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/ \
 && pnpm build \
 && test -f lib/client.js

FROM tools AS sidebar-prod
COPY vendor/tracy/dsh-better-sidebar/package.json vendor/tracy/dsh-better-sidebar/pnpm-lock.yaml vendor/tracy/dsh-better-sidebar/pnpm-workspace.yaml /opt/vendor/tracy/dsh-better-sidebar/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    cd /opt/vendor/tracy/dsh-better-sidebar \
 && npm_config_registry=https://registry.npmjs.org CI=true pnpm install --prod --frozen-lockfile --ignore-scripts \
 && find node_modules/.pnpm -mindepth 1 -maxdepth 1 -type d \
      ! -name 'ws@*' ! -name 'yaml@*' ! -name '@deepseek-ai+schemastery@*' \
      ! -name '@deepseek-ai+cosmokit@*' ! -name '@standard-schema+spec@*' -exec rm -rf {} + \
 && find node_modules -mindepth 1 -maxdepth 1 \
      ! -name '.pnpm' ! -name 'ws' ! -name 'yaml' ! -name '@deepseek-ai' -exec rm -rf {} + \
 && find node_modules/@deepseek-ai -mindepth 1 -maxdepth 1 ! -name 'schemastery' -exec rm -rf {} + \
 && test -f node_modules/yaml/package.json \
 && test -f node_modules/@deepseek-ai/schemastery/package.json \
 && test -f node_modules/ws/package.json \
 && node -e "for (const m of ['ws', 'yaml', '@deepseek-ai/schemastery']) require.resolve(m)"

FROM tools AS sidebar
COPY vendor/tracy/dsh-better-sidebar /opt/vendor/tracy/dsh-better-sidebar
RUN rm -rf /opt/vendor/tracy/dsh-better-sidebar/src /opt/vendor/tracy/dsh-better-sidebar/tests /opt/vendor/tracy/dsh-better-sidebar/scripts /opt/vendor/tracy/dsh-better-sidebar/docs /opt/vendor/tracy/dsh-better-sidebar/.git
COPY --from=sidebar-build /opt/vendor/tracy/dsh-better-sidebar/lib          /opt/vendor/tracy/dsh-better-sidebar/lib
COPY --from=sidebar-prod  /opt/vendor/tracy/dsh-better-sidebar/node_modules /opt/vendor/tracy/dsh-better-sidebar/node_modules
RUN cd /opt/vendor/tracy/dsh-better-sidebar \
 && test -f lib/client.js \
 && test -f lib/index.js \
 && node -e "for (const m of ['ws', 'yaml', '@deepseek-ai/schemastery']) require.resolve(m)"

FROM dsh AS build

# ⚠ `/opt/dsh/node_modules` IS 1.6 GB AND STAYS THAT WAY — do not "just prune" it.
#
# Measured 06/09 inside this image: `pnpm install --prod --frozen-lockfile` finishes, frees nothing
# worth naming, and leaves dsh unable to start —
#   Cannot find package '@deepseek-ai/cordis' imported from /opt/dsh/packages/boot/app-boot/lib/index.js
# In this tree the `@deepseek-ai/*` siblings are DEV dependencies of each other (they are peers of
# the published packages, supplied by the host bundle), so "production only" removes the runtime.
# A smaller image is available by shipping published packages instead of a source tree; that is the
# lane image's model and it is exactly the registry dependency this one exists without.

# ── vendor plugins, built from source — in their own stages, copied in finished ───────────────────
#
# 🔒 WHY TWO STAGES OF THEIR OWN — 15/09/2026, measured on the CI box. Built one after the other in this
# stage, a one-line change to `dsh-passwords`' source invalidated every layer below it, including
# `dsh-better-sidebar`'s install (43 s, a node-pty compile) and build (36 s) — a fork that had not
# changed. As `FROM tools` stages each has its own cache, BuildKit builds the two in parallel, and a
# change to one reuses the other whole. Neither reads /opt/dsh (both `cd` into their own directory
# and install from npmjs), which is what makes `tools` the right base rather than `dsh`.
COPY --from=passwords /opt/vendor/tracy/dsh-passwords      /opt/vendor/tracy/dsh-passwords
COPY --from=sidebar   /opt/vendor/tracy/dsh-better-sidebar /opt/vendor/tracy/dsh-better-sidebar

# ── Tracy's profile ─────────────────────────────────────────────────────────────────────────────
ENV DSH_HOME=/desk-home
COPY packages/fleet/tracy-fleet-operation/dsh/profile/package.json \
     packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml \
     /desk-home/profiles/native/
COPY packages/fleet/tracy-fleet-operation/dsh/profile/settings.yaml /desk-home/settings.yaml

# The runtime dependencies outside dsh's closure.
# It runs BEFORE the plugin copies on purpose: the profile manifest declares no dependencies, so
# npm treats every directory already in node_modules/ as extraneous and prunes it. Copying the
# plugins first left `@tracy/` empty and no step said so — npm reported "removed 5 packages".
#
# Exact versions, not the ranges the plugins' own manifests carry: there is no lockfile in this
# directory (`--no-package-lock`), so a caret would re-resolve on every build and two builds of one
# commit would differ. Each is what the range resolves to today.
#
# No `schemastery` any more (until 26/09 `schemastery@3.18.0`, the npm one, for `@tracy/dsh-brand`).
# Every Tracy package that builds a Config schema — `@tracy/dsh-brand`, `@tracy/dsh-subprocess-docker`,
# `@goodandready/dsh-subscriptions` — now imports DSH's `@deepseek-ai/schemastery`, which resolves
# like every other `@deepseek-ai/*` peer: through the fallback directory dsh fills at boot from
# `/opt/dsh/apps/cli` (see "The profile's resolution root" below). A second, public copy here would
# be one more schema library whose `.volatile()` fields the loader could not commit into.
#
#   linkedom    — `@tracy/dsh-design-inspiration` and `@tracy/dsh-brand-engine` parse HTML with it
#   undici      — shared by `@tracy/od-brand-engine` and `dsh-subscriptions`, which needs `^8.10.1`;
#                 one flat directory means one version. The brand engine takes `fetch` AND `Agent`
#                 from this package (never Node's global `fetch`, which is undici 7): an undici-8
#                 `Agent` handed to the global `fetch` threw on every request and every brand
#                 extraction answered NO_MATERIAL (29/09/2026, `scripts/test/od-brand-engine-undici.test.mjs`)
#   socks       — `dsh-subscriptions`' SOCKS proxy support
RUN cd /desk-home/profiles/native \
 && npm_config_registry=https://registry.npmjs.org \
    npm install --no-save --no-package-lock --omit=dev \
      linkedom@0.18.13 undici@8.10.1 socks@2.8.9

# Tracy's plugins: committed lib/, copied whole. The profile is hoisted, so a copy at
# node_modules/<name> is what pnpm would have produced.
#
# The list is `@tracy/dsh-native-bundle`'s own `dependencies` — that manifest is the contract for
# what this directory must contain, and a name missing here shows up as HALF AN INTERFACE with no
# error anywhere (LAW #2's failure mode). The bundle itself is copied too: the profile names it, so
# it must resolve like any other package.
COPY packages/bundle/tracy-native            /desk-home/profiles/native/node_modules/@tracy/dsh-native-bundle
COPY packages/tools/tracy-sandbox-docker     /desk-home/profiles/native/node_modules/@tracy/dsh-sandbox-docker
COPY packages/tools/tracy-subprocess-docker  /desk-home/profiles/native/node_modules/@tracy/dsh-subprocess-docker
COPY packages/tools/tracy-webroot-read       /desk-home/profiles/native/node_modules/@tracy/dsh-webroot-read
COPY packages/brand/tracy-brand              /desk-home/profiles/native/node_modules/@tracy/dsh-brand
COPY packages/ui/tracy-chat-input            /desk-home/profiles/native/node_modules/@tracy/dsh-chat-input
COPY packages/ui/tracy-sidebar               /desk-home/profiles/native/node_modules/@tracy/dsh-sidebar
COPY packages/ui/tracy-settings              /desk-home/profiles/native/node_modules/@tracy/dsh-settings
COPY packages/ui/tracy-mode-picker           /desk-home/profiles/native/node_modules/@tracy/dsh-mode-picker
COPY packages/ui/tracy-model-plan            /desk-home/profiles/native/node_modules/@tracy/dsh-model-plan
COPY packages/ui/tracy-onboard               /desk-home/profiles/native/node_modules/@tracy/dsh-onboard
COPY packages/site/tracy-add-site            /desk-home/profiles/native/node_modules/@tracy/dsh-add-site
COPY packages/site/tracy-my-sites            /desk-home/profiles/native/node_modules/@tracy/dsh-my-sites
COPY packages/site/tracy-inbox               /desk-home/profiles/native/node_modules/@tracy/dsh-inbox
COPY packages/site/tracy-site-tabs           /desk-home/profiles/native/node_modules/@tracy/dsh-site-tabs
# Website Opportunities' client half; its domain (`website-opportunities`) is bundled into `lib/client.js`.
COPY packages/site/tracy-website-opportunities /desk-home/profiles/native/node_modules/@tracy/dsh-website-opportunities
COPY packages/ui/tracy-ask-form              /desk-home/profiles/native/node_modules/@tracy/dsh-ask-form
COPY packages/ui/tracy-assistant             /desk-home/profiles/native/node_modules/@tracy/dsh-assistant
# Three Build plugins, one per CMS (09/09; EmDash 15/09). `@tracy/site-build-core` — everything they share —
# is a SOURCE library bundled into each plugin's `lib/`, so it is NOT copied: a copy here would be a
# second, unbundled answer to what the two `lib/index.js` already carry.
COPY packages/site/tracy-site-build-wordpress /desk-home/profiles/native/node_modules/@tracy/dsh-site-build-wordpress
COPY packages/site/tracy-site-build-joomla   /desk-home/profiles/native/node_modules/@tracy/dsh-site-build-joomla
COPY packages/site/tracy-site-build-emdash   /desk-home/profiles/native/node_modules/@tracy/dsh-site-build-emdash
COPY packages/design/tracy-design-inspiration /desk-home/profiles/native/node_modules/@tracy/dsh-design-inspiration
COPY packages/design/tracy-brand-engine      /desk-home/profiles/native/node_modules/@tracy/dsh-brand-engine
COPY packages/tools/tracy-site-tools         /desk-home/profiles/native/node_modules/@tracy/dsh-site-tools
COPY packages/ui/tracy-tab-link              /desk-home/profiles/native/node_modules/@tracy/dsh-tab-link
COPY packages/locale/tracy-locale-vi         /desk-home/profiles/native/node_modules/@tracy/dsh-tracy-locale-vi
COPY packages/locale/tracy-locales           /desk-home/profiles/native/node_modules/@tracy/dsh-tracy-locales

# `@tracy/od-brand-engine`: OpenDesign's brand pipeline, vendored with its `dist/` committed
# (`scripts/build-od-brand-engine.mjs` builds it, LAW #3's reasoning applies to a vendored bundle
# too). `@tracy/dsh-brand-engine` and `@tracy/dsh-design-inspiration` both import it by name, so it has
# to resolve from the profile like any other package — on `main` it was a registry tarball, here it
# is the directory it was built from. `undici`, its one dependency, is installed above.
COPY vendor/tracy/od-brand-engine /desk-home/profiles/native/node_modules/@tracy/od-brand-engine

# The two locale packages whose lib/ is committed (see the vendor block above), copied like Tracy's.
COPY vendor/tracy/dsh-locale-vi     /desk-home/profiles/native/node_modules/dsh-locale-vi
COPY vendor/tracy/dsh-better-locale /desk-home/profiles/native/node_modules/@huanlin/dsh-plugin-better-locale

# Same shape: lib/ committed upstream, nothing to build.
COPY vendor/tracy/dsh-subscriptions /desk-home/profiles/native/node_modules/@goodandready/dsh-subscriptions


# ...and the two that were built, moved with their pruned node_modules.
RUN mv /opt/vendor/tracy/dsh-passwords        /desk-home/profiles/native/node_modules/dsh-passwords \
 && mv /opt/vendor/tracy/dsh-better-sidebar   /desk-home/profiles/native/node_modules/dsh-better-sidebar \
 && rm -rf /opt/vendor
# Trim what a `pnpm pack` of these packages would not have carried anyway. ⚠ `src/` IS NOT ON THIS
# LIST: `@tracy/dsh-subprocess-docker` ships `src/route.mjs` and imports it at load
# (`files: ["index.js", "src", ...]`), so deleting it cost a boot on 06/09 —
# `Cannot find module .../src/route.mjs`. Read each package's `files` before adding a name here.
RUN rm -rf /desk-home/profiles/native/node_modules/@tracy/*/dev \
           /desk-home/profiles/native/node_modules/@tracy/*/test \
           /desk-home/profiles/native/node_modules/@tracy/od-brand-engine/src \
           /desk-home/profiles/native/node_modules/@tracy/od-brand-engine/contracts \
           /desk-home/profiles/native/node_modules/dsh-locale-vi/baseline \
           /desk-home/profiles/native/node_modules/@huanlin/dsh-plugin-better-locale/tests

# ── The profile's resolution root is dsh's OWN job — do not create it here ─────────────────────
#
# ⚠ AN EARLIER VERSION OF THIS FILE CREATED `profiles/node_modules` AS A SYMLINK TO
# `/opt/dsh/apps/cli/node_modules`, AND IT BROKE BOOT. dsh's app-boot has
# `healProfilesModuleFallback`: at start it fills that directory with one symlink per package it
# needs (229 of them, measured 09/09/2026). A read-only symlink in its place turns that into
#
#   EACCES: permission denied, symlink '/opt/dsh/apps/cli' -> '/desk-home/profiles/node_modules/@deepseek-ai/dsh'
#
# and the container never reaches healthy. `deploy-host-dsh.sh` rolled it back on its own.
#
# 🔒 SO THE OLD COMMENT'S "the host supplies them at mount time" WAS NOT A PROMISE NOBODY KEPT —
# dsh keeps it, at boot, into the mounted directory. What that comment does not say, and what cost
# a production incident to learn, is that IT ONLY HAPPENS ON A BOOT: a host whose `tracy-dsh` has
# never restarted since the profile was seeded can sit with no fallback directory at all, serving
# HTTP 200 while every `preset failed to mount: … cannot be resolved`.


# ── /opt/tracy: the shared library every seat reads ─────────────────────────────────────────────
#
# Same three blocks as the lane image (the `dsh/Dockerfile` deleted 2026-09-06), with
# the sources taken from this repository instead of four `npm install -g` calls against
# npm.tracy.ai. Shared CONTENT lives in the image, never on a volume: one copy for the whole fleet,
# and upgrading it is a build rather than a round of file copies onto each machine.
#
# ENABLED SELECTIVELY, not all of it: `vendor/tracy/od-skill` carries 164 skills whose descriptions alone are
# ~29k tokens, re-read on every turn by every user. `tracy-enabled.txt` names the 20 that touch
# web/brand/interface work; the rest stay in the repository, one line away from being enabled.
# One enabled list, two source folders: OpenDesign keeps page workflows under `design-templates/`.
# `craft/` is prose upstream injects through its own daemon, which dsh does not have — so it is
# copied whole for the agent to read.
#
# Matt Pocock's skills come the same way. Until 06/09 they rode in on `dsh-mattpocock-skills-deck`,
# a task-board PROFILE plugin; the carrier was dropped (`tasks/todo-go-deck.md`) and the skills
# stayed. They are now the subtree `vendor/tracy/mattpocock-skills` (mattpocock/skills v1.2.3, NOTICE
# there), and `matt-enabled.txt` in `@tracy/design-skill` names the seven copied onto the rank-300
# path — ADR 0008's answer, the image carries content.
#
# Copied AS THEY ARE, out of the group folders upstream keeps them in. 14 of the 25 carry
# `disable-model-invocation: true` (wayfinder, triage, to-spec, to-tickets …) and skill-filesystem
# honours that flag: the model cannot call them, only `/name` can. That is upstream's choice and it
# stays (LAW #5). The skill the model does call is Tracy's own `tracy-design-inspiration`, which tells
# the agent to READ the wayfinder file and follow it in the customer's words.
#
# `brand-extract` is a THIRD name that used to be here and is not: OpenDesign's version drives a
# tool (`agent-browser`) this image does not have, so it is absent from `tracy-enabled.txt`, and
# Tracy's replacement `tracy-brand-extract` was retired on `main` — reading a brand is the
# `tracy_brand` TOOL of `@tracy/dsh-brand-engine`, a profile plugin copied above, not image content.
# 🔒 THE LIBRARY COPY BELOW IS THE ROAD BACK, NOT THE SOURCE — ADR 0012 (`main`, 07/09). The
# design-inspiration host reads the 152 systems from the public page (`libraryUrl`) and caches them
# under $DSH_HOME, keyed by commit; it opens `/opt/tracy/design-systems` and this catalog only with
# no network and nothing cached. `design-catalog.json` gives the index a stable path — the
# `design-systems` link points at `systems/`, one level below where `catalog.json` lives upstream, so
# nothing could reach it before. Keep both until that road is measured unnecessary: dropping them is
# a decision, not a cleanup.
COPY vendor/tracy/od-skill                      /opt/tracy/od-skill
COPY vendor/tracy/mattpocock-skills             /opt/tracy/matt-skills
COPY vendor/tracy/od-design-system/systems      /opt/tracy/design-systems
COPY vendor/tracy/od-design-system/catalog.json /opt/tracy/design-catalog.json
COPY packages/design/tracy-design-skill   /opt/tracy/design-skill
# The pictures of every TEMPLATE card on the gallery (Tracy Business first). The CARDS themselves
# now come from Tracy — `GET /api/templates`, answered from the releases it has read (ADR 0017) —
# so the catalogue file no longer travels in this image; only the pictures do, because they were
# released with the quickstart and a customer's lane should not fetch them from a demo site.
COPY packages/fleet/tracy-fleet-operation/scripts/provision/templates        /opt/tracy/templates

# 🔒 EVERY PLUGIN THE TWELVE PRESETS NAME MUST EXIST IN THIS IMAGE — CHECKED HERE, WHERE IT IS FREE.
# A preset row naming a package the image does not carry is not a build error and not a log line;
# it is a `SessionCreateError` in one customer's browser. The presets are GENERATED (gen-presets.ts
# from tasks/mode-matrix.json) and the dsh tree comes from a submodule, so the two drift with
# nothing in between noticing.
#
# Since dsh 0.1.7-rc.2 the twelve are ROWS in `@tracy/dsh-native-bundle`'s `presets.patch.yml`,
# which arrives with the bundle's own COPY above; until then they were folders this image copied
# to `/opt/tracy/presets`, a directory that no longer exists. The file names
# `@deepseek-ai/dsh-agent-preset` itself as well as every child plugin, and both are checked.
#
# ⚠ TWO PLACES, AND BOTH ARE NEEDED. A preset names `@deepseek-ai/*` rows (dsh's own plugins, in
# `/opt/dsh`) AND `@tracy/*` rows (this repo's, COPYed into the profile a hundred lines above) —
# `@tracy/dsh-webroot-read` is one, and checking only `/opt/dsh` reports it missing when it is not.
#
# What it must NOT ask about is `profiles/node_modules`: that directory does not exist in the image
# at all, dsh builds it at boot (see the block above), so asserting against it is how the first
# version of this check passed on an image that could not boot.
RUN set -eu; \
    presets=/desk-home/profiles/native/node_modules/@tracy/dsh-native-bundle/presets.patch.yml; \
    names="$(grep -hoE "name: '[^']+'" "$presets" | sed "s/name: '//; s/'$//" | sort -u)"; \
    [ -n "$names" ] || { echo "!! no plugin names found in $presets — the format changed" >&2; exit 1; }; \
    missing=''; \
    for n in $names; do \
      [ -e "/opt/dsh/apps/cli/node_modules/$n" ] \
        || [ -e "/desk-home/profiles/native/node_modules/$n" ] \
        || missing="$missing $n"; \
    done; \
    [ -z "$missing" ] || { echo "!! presets name plugins this image does not carry:$missing" >&2; exit 1; }; \
    echo "presets: $(echo "$names" | wc -l) distinct plugins, all present in /opt/dsh"


# ── The seeder, at /opt/tracy/cms ──────────────────────────────────────────────────────────────
#
# `@tracy/seeder` — the command the Build plugins' seed stage runs as `/opt/tracy/cms/seed-<platform>`
# to write the customer's pages, menu and posts into a working copy (packages/cms/tracy-seeder). It
# is staged here rather than installed because it is a private package, like every other layer here.
#
# 🔒 THIS LAYER CAME ACROSS FROM THE LANE IMAGE ON 07/09 AND ITS ABSENCE WAS SILENT. The one-dsh
# image was written before the CMS work landed on `main`, so the merge brought the skill that seeds
# a site without the seeder it calls. Nothing fails at build; the press just reports it cannot find
# the command, on a customer's screen.
#
# THE TWO LOOKS ARE DELIBERATELY NOT HERE (07/09: "the public release is always there"). The theme
# `tracy` and the template `tpl_tracy` are released from the public repository TracyHQ/claude-cowork,
# and the Build plugins' theme/template stage installs the released package straight from its URL. A copy
# in the image would be a second answer to which version a site is on, stale the day after every
# release and saying so nowhere.
#
# ⚠ `cms/` IS GITIGNORED AND MUST BE STAGED BEFORE THE BUILD — it holds build output, not source:
#     packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh
# CI runs it in `build-dsh-image.yml`; a hand build must run it too, or the assert below fails
# (deliberately: an image missing the seeder should not reach a host at all).
#
# The path is written from the REPO ROOT because that is the build context: `build-dsh-image.yml`
# runs `docker build -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile .`, not a build from
# inside `dsh/`.
COPY packages/fleet/tracy-fleet-operation/dsh/cms/ /opt/tracy/cms/
RUN test -x /opt/tracy/cms/seed-wordpress \
 && test -x /opt/tracy/cms/seed-joomla \
 && echo "cms: $(ls /opt/tracy/cms | wc -l) entries"
RUN set -eu; \
    OD=/opt/tracy/od-skill; \
    TRACY=/opt/tracy/design-skill; \
    MATT=/opt/tracy/matt-skills; \
    mkdir -p /opt/tracy/skills; \
    while read -r s; do \
      [ -z "$s" ] && continue; \
      for d in skills design-templates; do \
        [ -d "$OD/$d/$s" ] && cp -a "$OD/$d/$s" /opt/tracy/skills/ || true; \
      done; \
    done < "$OD/tracy-enabled.txt"; \
    while read -r s; do \
      [ -z "$s" ] && continue; \
      for g in engineering productivity misc in-progress; do \
        [ -d "$MATT/skills/$g/$s" ] && cp -a "$MATT/skills/$g/$s" /opt/tracy/skills/ || true; \
      done; \
    done < "$TRACY/matt-enabled.txt"; \
    cp -a "$TRACY"/skills/* /opt/tracy/skills/; \
    mv "$OD/craft" /opt/tracy/craft; \
    rm -rf "$OD" "$TRACY" "$MATT"; \
    echo "skills enabled: $(ls /opt/tracy/skills | wc -l), craft: $(ls /opt/tracy/craft/*.md | wc -l)"


# Template construction needs the same skill at discovery time in dsh and at execution time
# inside the site's web container. Keep the plugin root intact for its relative asset paths.
COPY vendor/joomla/joomlart-t4-skill /opt/tracy/joomlart-t4
RUN mkdir -p /opt/tracy/skills \
 && ln -s /opt/tracy/joomlart-t4/skills/joomlart-t4-template /opt/tracy/skills/joomlart-t4-template \
 && cd /opt/tracy/joomlart-t4/skills/joomlart-t4-template \
 && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev --ignore-scripts \
 && test -s SKILL.md \
 && node --input-type=module -e "await import('jsdom'); await import('sass'); await import('playwright')"

# ── One skill folder per preset ────────────────────────────────────────────────────────────────────
#
# Every preset read the one `/opt/tracy/skills` (36 skills on 27/09/2026): a Joomla T4 skill rode along
# in every EmDash conversation, a slide-deck skill in every writer's, and `web-clone`'s Chinese
# description in all of them. `skill-sets.json` is GENERATED from the matrix (`scripts/gen-presets.ts`,
# gate `presets`): each `<role>-<platform>` folder links that preset's skills, and that preset reads
# it (`customSkillDirs`). A named skill this image does not carry is said and skipped; a skill it
# carries that no preset reads is said too — the matrix decided that, and the build log shows it. A
# preset left with no skill fails the build.
COPY packages/fleet/tracy-fleet-operation/dsh/skill-sets.json /opt/tracy/skill-sets.json
RUN node -e ' \
  const fs = require("fs"); \
  const sets = JSON.parse(fs.readFileSync("/opt/tracy/skill-sets.json", "utf8")).presets; \
  const all = fs.readdirSync("/opt/tracy/skills").sort(); \
  const used = new Set(); \
  for (const [preset, skills] of Object.entries(sets)) { \
    const dir = "/opt/tracy/skill-sets/" + preset; \
    fs.mkdirSync(dir, { recursive: true }); \
    const own = skills.filter((s) => all.includes(s)); \
    for (const s of own) { fs.symlinkSync("/opt/tracy/skills/" + s, dir + "/" + s); used.add(s); } \
    console.log("skill-sets: " + preset + " " + own.length + " of " + all.length); \
    if (own.length === 0) process.exit(1); \
  } \
  const named = [...new Set(Object.values(sets).flat())].filter((s) => !all.includes(s)); \
  if (named.length > 0) console.log("skill-sets: named, not in this image: " + named.join(", ")); \
  const unread = all.filter((s) => !used.has(s)); \
  if (unread.length > 0) console.log("skill-sets: in this image, read by no preset: " + unread.join(", "));'

# The three directories a deployment mounts a volume over. They must EXIST in the image, owned by
# 33: docker seeds a fresh named volume from the image path it covers, ownership included, and a
# path the image does not have is created as root — after which dsh (uid 33) cannot write its own
# sessions, and the failure is a boot that half-works.
RUN mkdir -p /desk-home/sessions /desk-home/storages /desk-home/dsh-passwords-data

# ── 282 MB of source maps that nothing here reads ──────────────────────────────────────────────
#
# 12,795 `.map` files across the three trees the build hands to the runtime (/opt/dsh's are deleted
# at the end of the `dsh` stage, the other two here). A source map is read
# by a debugger, or by Node when `--enable-source-maps` is on — and it is NOT on: neither
# `entrypoint.sh` nor this file sets it or `NODE_OPTIONS`. So they are 282 MB that ship to every
# fleet host, are pulled on every image change, and are opened by nobody.
#
# Deleted HERE, in the build stage, not after the COPY. A `rm` in the runtime stage writes a new
# layer while the old one keeps every deleted byte — the same trap the `--chown` note below is
# about. Turning maps back on is one line in `pnpm build:official`'s config plus dropping this RUN.
# /opt/dsh's maps were deleted at the end of the `dsh` stage (see there for why they moved).
RUN find /opt/tracy /desk-home -name '*.map' -type f -delete

# ── Tracy's own plugins leave the big COPY, so a one-file change is a 7 MB layer ────────────────
#
# `/desk-home` is 421 MB, and 373 MB of it is `dsh-better-sidebar` — a vendored subtree that moves
# a few times a month. `@tracy/*` is 7 MB and moves several times a DAY. Copied together they are
# ONE layer, so every plugin edit rebuilds 421 MB, pushes 421 MB to the registry, and makes every
# fleet host pull 421 MB to receive 7 MB of changed code.
#
# Moving `@tracy` aside here lets the runtime stage copy the stable 414 MB first and lay the
# volatile 7 MB on top. The stable layer's cache key is the content of what it copies, so a Tracy
# commit no longer touches it.
#
# ⚠ IT MUST RUN AFTER the `rm -rf @tracy/*/dev` trim above — that step globs the path this moves.
RUN mkdir -p /staging && mv /desk-home/profiles/native/node_modules/@tracy /staging/tracy

# ══ stage: runtime ═════════════════════════════════════════════════════════════════════════════
FROM node:24-slim AS runtime

# The tools that run on the DSH side. The agent's shell runs in the site container and uses that
# image's programs (dev/web.Dockerfile), so this list serves dsh's own surfaces only:
#   git ripgrep less jq curl  — the file/search tools and the skills' shell recipes
#   php-cli + wp + mariadb-client — webroot-read and a read-only look at a site's database
#   imagemagick + fonts       — the design skills montage screenshots and WRITE LABELS on them; an
#                               ImageMagick without a freetype delegate silently drops every label
#
# `python3` is here for PARITY with the lane image, and the honest note is that nothing in this
# image is known to call it: the two enabled skills that ship `.py` files
# (`pptx-html-fidelity-audit`, and `web-clone`'s static-mirror reference) run through the agent's
# shell, which since Task 1 is the SITE container's. It is ~30 MB, it is what the lane had, and a
# missing interpreter is the kind of absence that surfaces halfway through a customer's turn.
# `dsh` and `pnpm` are deliberately NOT restored — see the README's Deviations.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ripgrep ca-certificates curl less jq \
      python3 \
      mariadb-client \
      php-cli php-mysql php-xml php-mbstring php-zip \
      imagemagick fonts-dejavu-core fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

COPY --from=dsh /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dsh /usr/local/bin/wp     /usr/local/bin/wp

# ── Browsers live in the IMAGE, not on a volume ────────────────────────────────────────────────
#
# Measured on the fleet 31/08, when PLAYWRIGHT_BROWSERS_PATH pointed inside the mounted home: 656 MB
# × 2, on a 77 GB disk, with two containers. One copy per image is one copy per FLEET.
#
# THREE ENGINES (31/08): a site broken in Safari that the agent can only open in Chromium gets
# the worst answer it can give — "cannot reproduce". WebKit is the user's Safari; Firefox catches a
# different class of failure entirely.
#
# ⚠ IT RUNS HERE, IN THE RUNTIME STAGE, and that is not tidiness. `--with-deps` installs SYSTEM
# libraries through apt; those live outside the browser directory, so a `COPY --from=build
# /opt/playwright` carries the browsers and leaves every library they link against behind — and the
# failure is a launch error deep inside a screenshot tool, not a missing file at build time.
#
# A VERSION, not `latest`. 1.2 GB of browsers whose contents are decided by the day of the build is
# the one line that would make "the same commit builds the same image" false — the rest of this file
# pins everything (DOCKER_CLI_VERSION, esbuild, `--frozen-lockfile`, `npm ci`, a required
# DSH_COMMIT). 1.63.0 installs chromium-1243, firefox-1543, webkit-2359; if those numbers move under
# an unchanged version, the mirror changed and that is worth knowing.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
ARG PLAYWRIGHT_VERSION=1.63.0
RUN npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium firefox webkit \
 && rm -rf /var/lib/apt/lists/* /root/.npm

# ── One browser under a fixed path, for the scripts that spawn one ─────────────────────────────
#
# OpenDesign's `web-clone` skill (enabled in `tracy-enabled.txt`, copied into /opt/tracy/skills)
# ships fourteen Node scripts that drive a real Chromium over CDP — recon-site, route-crawl,
# asset-harvest, dna-scaffold, audit-clone… They never download a browser; they read
# `OD_BROWSER_EXECUTABLE_PATH` (or Open Design's own daemon broker, absent here). The Playwright
# Chromium installed above IS that browser, with one catch measured on the lane 06/09: the scripts
# spawn the executable with a FIXED flag list, so any flag they do not pass has to live in a
# wrapper. `--no-sandbox` because a container without SYS_ADMIN cannot open the sandbox and Chromium
# exits 1 at once; `--disable-dev-shm-usage` because /dev/shm is 64 MB here and a screenshot at
# 1440 wide blows it. The wrapper resolves the versioned directory at BUILD time, so a Playwright
# bump cannot leave a dangling path behind a green build.
#
# SSRF: this adds no reach. dsh already has `curl` in this container; a headless browser sees the
# same network. The guard for customer-named hosts stays where it is — in `@tracy/od-brand-engine`'s
# safe-fetch, in front of the crawl that runs before these scripts.
RUN set -eu; \
    CHROME="$(ls -d /opt/playwright/chromium-*/chrome-linux*/chrome | head -1)"; \
    [ -x "$CHROME" ] || { echo "no Playwright Chromium under /opt/playwright" >&2; exit 1; }; \
    printf '#!/bin/sh\nexec %s --no-sandbox --disable-dev-shm-usage "$@"\n' "$CHROME" > /usr/local/bin/tracy-chrome; \
    chmod +x /usr/local/bin/tracy-chrome; \
    /usr/local/bin/tracy-chrome --headless=new --disable-gpu --dump-dom about:blank > /dev/null
ENV OD_BROWSER_EXECUTABLE_PATH=/usr/local/bin/tracy-chrome

# ⚠ `--chown` ON THE COPY, NEVER A `chown -R` AFTERWARDS. A recursive chown rewrites every file it
# touches into a NEW layer, and the old one stays in the image: measured 06/09, chowning
# `/desk-home`, `/opt/tracy` and `/opt/playwright` after the fact added 2.9 GB to a 3.1 GB image.
#
# `/opt/dsh`, `/opt/tracy` and `/opt/playwright` stay root-owned: programs and shared content that
# uid 33 reads and must never rewrite. `/desk-home` is the runtime's own home — sessions, storages,
# the gateway database — and is the only tree handed to the runtime user wholesale.
COPY --from=dsh   /opt/dsh    /opt/dsh
COPY --from=build /opt/tracy  /opt/tracy
# Stable first, volatile second — see the `mv /staging/tracy` note at the end of the build stage.
# These two lines are one tree in two layers; keep them adjacent and in this order.
COPY --from=build --chown=33:33 /desk-home     /desk-home
COPY --from=build --chown=33:33 /staging/tracy /desk-home/profiles/native/node_modules/@tracy

# ── FOUR files of dsh's own, and only those four ───────────────────────────────────────────────
#
# `dsh-passwords` rewrites parts of dsh at every gateway start (`src/patch.ts`): it forces the
# settings client out of `memory` mode — which dsh picks for any browser that is not on loopback,
# and this deployment is only ever reached through the gateway — and widens what a plugin may
# persist. Root-owned, the patch fails with EACCES on its `.bak-dshpw` write, the gateway prints
# `补丁同步失败（不影响网关启动）` and boots anyway: a Settings page that silently stops saving
# (measured 06/09).
#
# 🔒 THE FIRST FIX HERE WAS `COPY --chown=33:33 /opt/dsh`, AND IT WAS TOO WIDE. That hands the
# runtime user every byte of dsh's own code, `apps/cli/lib/bin.js` — the file the entrypoint
# `exec`s — included, and a rewrite of it survives `docker restart` in the writable layer. Today
# the container also holds the docker socket, so it grants nothing new; the day Plan 3's socket
# proxy lands, it would be the escalation path left behind with nobody remembering why.
#
# The list is `patch.ts`'s own (SETTINGS/WORKSPACE/STARTUP/CONNECTION_PACKAGE + _FILE), resolved
# through its `workspacePath` map, which is how it finds a dsh built from source. The DIRECTORY is
# chowned as well as the file: the patch writes `<file>.bak-dshpw` and `<file>.sha256-dshpw` beside
# it. `@deepseek-ai/dsh-host-apiproxy`, the fifth name in `patch.ts`, has no package in this dsh
# (0.1.3-alpha.1) and no workspace mapping — the patch skips it, and so does this list.
#
# The build fails if a target moves. A dsh upgrade that renames one of these would otherwise be a
# Settings page that stops saving, months later, with nothing pointing here.
RUN set -eu; \
    for target in packages/client/ui-settings/lib/client.js \
                  packages/client/ui-workspace/lib/client.js \
                  packages/client/connection/lib/index.js \
                  packages/bundle/web-app/lib/startup.js; do \
      [ -f "/opt/dsh/$target" ] || { echo "dsh-passwords patches $target, which this dsh does not have" >&2; exit 2; }; \
      chown 33:33 "/opt/dsh/$target" "$(dirname "/opt/dsh/$target")"; \
    done

# ── Apply that patch HERE, not at the first gateway start ───────────────────────────────────────
#
# dsh-passwords applies it when the gateway starts, then asks `systemctl` to restart dsh's web
# service so dsh loads the patched files. A container has no systemctl: the restart fails, and dsh
# keeps serving the unpatched bundles until the container restarts once more (measured on the rc2
# stand, 05/10/2026: "重启 dsh-web 失败 … systemctl exit 1"). Every deploy recreates the container
# from the image, so every deploy would start on unpatched files. Patching the image makes the
# first start already patched; the gateway then finds "unchanged" and restarts nothing.
# Anything but "applied" fails the build: a dsh that renamed a target would otherwise ship a
# Settings page that stops saving.
RUN set -eu; cd /desk-home/profiles/native/node_modules/dsh-passwords; \
    result="$(node -e "import('./dist/patch.js').then(m => process.stdout.write(m.applyRemotePatch('/opt/dsh')))")"; \
    [ "$result" = applied ] || { echo "dsh-passwords patch at build: $result, expected applied" >&2; exit 2; }; \
    for target in packages/client/ui-settings/lib/client.js packages/client/connection/lib/index.js; do \
      [ -f "/opt/dsh/$target.bak-dshpw" ] || { echo "no backup beside $target after the build patch" >&2; exit 2; }; \
    done; \
    chown -R 33:33 /opt/dsh/packages/client/ui-settings/lib /opt/dsh/packages/client/ui-workspace/lib \
                   /opt/dsh/packages/client/connection/lib
COPY packages/fleet/tracy-fleet-operation/dsh/entrypoint.sh /usr/local/bin/tracy-dsh-entrypoint
RUN chmod +x /usr/local/bin/tracy-dsh-entrypoint

ENV DSH_HOME=/desk-home
ENV HOME=/desk-home
# dsh-passwords 2.7.7 (ADR 0027) finds the dsh it patches only through MCP_DSH_ROOT; without it the
# settings patch never ran on the fleet (measured 05/10/2026) and the gateway's version gate refuses
# to start. MCP_TRACY_FLEET marks this image as a fleet host: the gateway then starts only with the
# Tracy policy, a seat secret and that root (src/tracy/fleet-guard.ts), exit 38 otherwise.
ENV MCP_DSH_ROOT=/opt/dsh
ENV MCP_TRACY_FLEET=1

# No secret may be baked into the image's environment: `docker history` and `docker image inspect`
# publish it to anyone who can pull. Runtime secrets arrive through the gateway's env file.
RUN if env | grep -Eiq '^[A-Z_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY)[A-Z_]*='; then \
      echo "a secret-shaped variable is baked into this image's environment:" >&2; \
      env | grep -Eio '^[A-Z_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY)[A-Z_]*=' >&2; exit 2; \
    fi

# ── Non-root, uid 33 ───────────────────────────────────────────────────────────────────────────
#
# 33 IS `www-data`, AND IT IS THE SITE CONTAINER'S USER. The fleet chowns each site folder to 33 so
# the web container can write it, and mounts that same folder here at `/site/<label>` — dsh's own
# file tools (workspace files, AGENTS.md, webroot-read, the moment hooks) read AND write it. A
# different uid would leave dsh able to list a site folder and unable to change one file in it, and
# the error surfaces inside a tool call, far from this line. node:24-slim already ships 33:33.
#
# 🔒 THE DOCKER GROUP IS NOT BAKED IN, and that is the whole point of one image per fleet.
#
# This file's first line promises an image that is identical on every host. A build-time
# `ARG DOCKER_GID` + `groupadd`/`usermod` breaks that promise quietly: a host whose docker socket is
# group 998 and one where it is 999 then need two builds and two digests. Worse, the second host
# pulls the tag, the container starts, and `docker ps` from inside answers `permission denied` —
# which reads exactly like a missing socket mount.
#
# It belongs to the RUN, where the gid is a fact that can be read off the machine:
#
#   docker run  --group-add "$(stat -c %g /var/run/docker.sock)" …
#   compose     group_add: ["${DOCKER_GID}"]   # DOCKER_GID=$(stat -c %g /var/run/docker.sock)
#
# On Docker Desktop for macOS that reads 0, so uid 33 joins group 0 — group-root, not root, and a
# dev-machine concession the README spells out.
RUN set -eu; mkdir -p /site; chown 33:33 /site

# ⚠ BY NAME, NOT `USER 33:33`. Docker reads /etc/passwd and /etc/group for a NAMED user and applies
# the supplementary groups it finds; given a bare uid:gid pair it applies exactly those two and
# nothing else. Measured 06/09: with `USER 33:33` the container came up as
# `uid=33(www-data) gid=33(www-data) groups=33(www-data)` — the docker group joined above simply
# absent — and every call to the socket answered `permission denied`, which reads like a missing
# mount rather than a dropped group.
USER www-data
# The measurement the brief asks for, made where it cannot drift: if a later edit reintroduces a
# root runtime, the build says so instead of the fleet finding out.
RUN test "$(id -u)" -ne 0

# ── Build-time asserts ─────────────────────────────────────────────────────────────────────────
#
# They run HERE and not in the build stage because this is the image that ships: an assert about a
# tree that is then copied is an assert about a copy nobody checked.
#
# 🔒 AFTER `USER 33:33`, not before. `--dump-config` WRITES — it rewrites the profile's `cordis.yml`
# root and heals `profiles/node_modules` — so running it as root leaves root-owned files inside a
# home the runtime user owns, and the container then dies at boot on
# `EACCES: permission denied, open '/desk-home/profiles/native/cordis.yml'` (measured 06/09). It
# also makes the assert honest: this is the identity that will run the same command at boot.
#
# `--dump-config` composes the profile and exits, so a patch that no longer parses, or a row Tracy's
# layer fails to reach, fails the build. Every line below has been a silent failure at least once:
# a disabled row that stayed enabled is a code runtime inside the socket-holding container; a
# `config:` that a later layer replaced wholesale drops every key the bundle set.
#
# `row skill-filesystem "disabled: true"` is the host row, which must stay DOWN (28/09/2026): a host
# row registers into the skill registry's global layer, which dsh merges into every agent's
# catalogue, so switching it on (as the native bundle did until then, over `/opt/tracy/skills`)
# hands every preset the whole library and undoes the per-preset sets. Each preset reads its own
# `/opt/tracy/skill-sets/<role>-<platform>` (`has` below), built from `skill-sets.json` above.
#
# ⚠ No `#` line may sit inside the RUN below. Indented or not, a comment there would be handed to
# the shell, where it swallows the rest of the line INCLUDING the `\` that continues it.
# 🔒 THE SIDE CARD'S ROW LIVES IN THREE PLACES, AND THE `row better-sidebar` / `nokey` LINES BELOW
# ARE THE THIRD. `@tracy/dsh-native-bundle` DECIDES it, `scripts/check-image-profile.ts` gates the
# profile layer that restates it, and this block reads the COMPOSED tree — the only one of the
# three that sees what dsh actually ends up with.
#
# Until 26/09 this asserted `has "terminal: false"` and `has "/bin/bash"`: the Terminal tab off on
# customer surfaces was the decision with teeth (a tab that reopens for customers is a door, where
# a seeded tab is a convenience), and `shell: /bin/bash` kept that tab from asking a WordPress
# container for zsh. dsh-better-sidebar 0.21 removed its Terminal tab and tab seeding upstream, and
# its Config drops unknown keys silently — so both greps would have stayed green on a row that
# configures nothing. The decision now holds by construction (no such tab; `dsh-passwords` keeps
# every `/sidebar/ws/*` but `fs-watch` owner-only), and what still has teeth is:
#   - `workspaceFence: true` in the composed row — the containment switch of every sidebar file
#     route, `ws/fs-watch` included; a later layer replacing the row's `config:` drops it;
#   - no removed key (`shell`, `seedTabs`, `tabsEnabled.terminal`, …) in the row — each would read
#     as a decision in force while doing nothing.
# The plugins are still asserted by name above, so a bundle that drops `add-site` is still caught.
# `row <id> <pattern>` looks inside that row only -- from its `- id:` line to the next one -- and
# matches the pattern as a row-level key (two or four spaces in, never the six of a nested plugin
# list). The earlier `grep -A<n>` form read a fixed number of lines after the id, which passed
# while `disabled:` came first and would have failed on dsh 0.1.7's preset rows, where the key
# follows ~190 lines of `plugins` (measured 26/09/2026 on a native dump: `preset-standard`
# spans lines 666-849, `disabled: true` on the last one).
#
# `row approval "policy: never"` and `lacks permission "approval: ask"` (29/09/2026) hold the two
# rows `@tracy/dsh-native-bundle` adds so no session waits on an approval nobody can see: dsh-base
# pins `ask`, `dsh-passwords` shows a seat no approval, and one `bash` escalation held a bench turn
# 643 s. A later layer that restates either row's `config:` with dsh's own `ask` would bring the
# wait back for every new session on the host; `lacks <id> <pattern>` fails when the pattern
# appears anywhere inside that row, nested preset keys included.
# `lacks tracy-mode-picker "customerRoutes"` (07/10/2026): a customer's own model plan is for the
# desktop app's dsh on the customer's machine only; on this host it would be every seat's.
RUN set -eu; \
    node /opt/dsh/apps/cli/lib/bin.js --profile native --dump-config > /tmp/tree.yml; \
    missing=0; \
    has() { grep -q "$1" /tmp/tree.yml || { echo "the composed tree is missing: $1" >&2; missing=1; }; }; \
    row() { awk -v id="$1" '$0 == "- id: " id { f = 1; next } f && /^- id: / { exit } f' /tmp/tree.yml | grep -Eq "^ {2,4}$2\$" || { echo "row $1 is missing: $2" >&2; missing=1; }; }; \
    nokey() { if awk -v id="$1" '$0 == "- id: " id { f = 1; next } f && /^- id: / { exit } f' /tmp/tree.yml | grep -Eq "$2"; then echo "row $1 carries a removed key: $2" >&2; missing=1; fi; }; \
    lacks() { if awk -v id="$1" '$0 == "- id: " id { f = 1; next } f && /^- id: / { exit } f' /tmp/tree.yml | grep -Eq "$2"; then echo "row $1 must not carry: $2" >&2; missing=1; fi; }; \
    has "name: '@tracy/dsh-subprocess-docker'"; \
    has "name: '@tracy/dsh-sandbox-docker'"; \
    has "name: dsh-passwords"; \
    has "name: '@tracy/dsh-brand'"; \
    has "name: '@tracy/dsh-sidebar'"; \
    has "name: '@tracy/dsh-add-site'"; \
    has "name: '@tracy/dsh-my-sites'"; \
    has "name: '@tracy/dsh-inbox'"; \
    has "name: '@tracy/dsh-site-tabs'"; \
    has "name: '@tracy/dsh-ask-form'"; \
    has "name: '@tracy/dsh-assistant'"; \
    has "name: '@tracy/dsh-website-opportunities'"; \
    has "name: '@tracy/dsh-design-inspiration'"; \
    has "name: '@tracy/dsh-brand-engine'"; \
    has "name: '@tracy/dsh-site-tools'"; \
    has "name: '@tracy/dsh-tab-link'"; \
    has "name: '@tracy/dsh-settings'"; \
    has "name: '@tracy/dsh-mode-picker'"; \
    has "name: '@tracy/dsh-model-plan'"; \
    has "name: '@tracy/dsh-onboard'"; \
    has "name: '@tracy/dsh-chat-input'"; \
    has "name: '@tracy/dsh-webroot-read'"; \
    has "name: '@tracy/dsh-tracy-locale-vi'"; \
    has "name: '@tracy/dsh-tracy-locales'"; \
    has "name: dsh-locale-vi"; \
    has "name: '@huanlin/dsh-plugin-better-locale'"; \
    has "name: dsh-better-sidebar"; \
    has "name: '@goodandready/dsh-subscriptions'"; \
    has "name: '@deepseek-ai/dsh-host-directory-picker-browse'"; \
    row better-sidebar "workspaceFence: true"; \
    nokey better-sidebar "^    (shell|shellArgs|terminalsPerSession|reconnectGraceMs|seedTabs|seedFilesTab|openByDefault|browserNoSandbox|agentBrowserTools):"; \
    nokey better-sidebar "^      terminal:"; \
    has "/opt/tracy/skill-sets/designer-wordpress"; \
    has "id: designer-wordpress"; \
    row subprocess "disabled: true"; \
    row sandbox "disabled: true"; \
    row ptc-runtime "disabled: true"; \
    row plugin-manager "disabled: true"; \
    row hmr "disabled: true"; \
    row ui-sidebar "disabled: true"; \
    row ui-brand-official "disabled: true"; \
    row ui-settings-general "disabled: true"; \
    row ui-agent-preset "disabled: true"; \
    row ui-model-selection "disabled: false"; \
    row agent-preset-registry "default: designer-wordpress"; \
    row preset-standard "disabled: true"; \
    row preset-ptc "disabled: true"; \
    row preset-minimal "disabled: true"; \
    row preset-cordis "disabled: true"; \
    row settings "disabled: true"; \
    row config-editor "disabled: true"; \
    row authorization "disabled: true"; \
    row ui-settings-models "disabled: true"; \
    row dsh-subscriptions "disabled: true"; \
    row tracy-model-plan "disabled: false"; \
    has "accountSubscriptions: true"; \
    row deepseek-account "disabled: true"; \
    row llm-deepseek-account "disabled: true"; \
    row account-controller "disabled: true"; \
    row ui-settings-account "disabled: true"; \
    row ui-settings-shell "disabled: true"; \
    row ui-settings-agent-loop "disabled: true"; \
    row ui-settings-subagent "disabled: true"; \
    row ui-settings-web-search "disabled: true"; \
    row cordis-inspect-providers "disabled: true"; \
    row product-analytics "disabled: true"; \
    row ui-settings-session-log "disabled: true"; \
    row otel "disabled: true"; \
    row session-telemetry-otel "disabled: true"; \
    row directory-picker "disabled: true"; \
    row skill-filesystem "disabled: true"; \
    row tools "mode: native"; \
    row webserver "port: 51700"; \
    row approval "policy: never"; \
    lacks permission "approval: ask"; \
    lacks tracy-mode-picker "customerRoutes"; \
    if [ "$missing" -ne 0 ]; then echo "--- composed tree follows ---" >&2; cat /tmp/tree.yml >&2; exit 1; fi; \
    rm /tmp/tree.yml

# The dump reads the patch files and never resolves an inserted row's package (app-boot's
# renderConfigDump only loads the profile's bundles), so it stays green with every plugin missing
# from node_modules/. Resolve each one the way the loader will, from the profile directory.
#
# The two `@deepseek-ai/*` rows the native bundle inserts (the directory picker's host and client
# halves) are NOT in this list, and cannot be: they resolve through `$DSH_HOME/profiles/node_modules`,
# a symlink farm into `/opt/dsh` that the LAUNCHER writes at boot (`healProfilesModuleFallback`).
# `--dump-config` does not write it — measured 06/09, `Cannot find module` for exactly those two
# while all 21 copied packages resolved — so asserting them here would only assert that the build
# does something boot does. The boot-time check is `ls /desk-home/profiles/node_modules/@deepseek-ai`
# in the README's three post-boot probes. `@deepseek-ai/schemastery` (imported by `@tracy/dsh-brand`,
# `@tracy/dsh-subprocess-docker` and `dsh-subscriptions`) is in that same fallback, so the last
# line asks the directory the fallback is filled FROM (`/opt/dsh/apps/cli`, which depends on it).
RUN node -e "const{createRequire}=require('node:module');const r=createRequire('/desk-home/profiles/native/');for(const name of process.argv.slice(1))console.log(name,'->',r.resolve(name))" \
      @tracy/dsh-native-bundle/package.json @tracy/dsh-sandbox-docker @tracy/dsh-subprocess-docker \
      @tracy/dsh-brand @tracy/dsh-chat-input @tracy/dsh-webroot-read @tracy/dsh-sidebar \
      @tracy/dsh-settings @tracy/dsh-mode-picker @tracy/dsh-model-plan @tracy/dsh-onboard @tracy/dsh-add-site @tracy/dsh-my-sites @tracy/dsh-inbox \
      @tracy/dsh-site-tabs @tracy/dsh-ask-form @tracy/dsh-assistant @tracy/dsh-site-build-wordpress @tracy/dsh-site-build-joomla @tracy/dsh-site-build-emdash \
      @tracy/dsh-design-inspiration @tracy/dsh-brand-engine \
      @tracy/dsh-site-tools @tracy/dsh-tab-link @tracy/dsh-tracy-locale-vi @tracy/dsh-tracy-locales @tracy/dsh-website-opportunities \
      dsh-passwords dsh-better-sidebar dsh-locale-vi @huanlin/dsh-plugin-better-locale \
      @tracy/od-brand-engine linkedom undici \
 && node -e "require('node:module').createRequire('/opt/dsh/apps/cli/').resolve('@deepseek-ai/schemastery')"

# ── What is running here, answerable FROM the running container ────────────────────────────────
#
# 🔒 "READ DSH_COMMIT IN THE CONTAINER TO SEE WHICH BUILD THIS IS" WAS NOT TRUE UNTIL THIS BLOCK.
# `DSH_COMMIT` was a build ARG and nothing else: it stamped the client bundle and then vanished, so
# `docker inspect` printed no labels at all and the only answer to "which build is this host on"
# was the tag in /etc/tracy/host-dsh.env — a file that says what somebody MEANT to deploy, not what
# is running. After a hand-run `docker run` or a half-finished deploy those two disagree, and the
# one that matters is the container.
#
# Two commits, because they move independently: the repo's (Tracy's plugins, the profile) and the
# vendored dsh's. A deploy verifies the first; `MISSING dsh feature` questions are about the second.
#
# LAST IN THE FILE ON PURPOSE. These are metadata layers of zero bytes, and SOURCE_COMMIT changes
# on every commit — anywhere earlier it would invalidate the cache for everything below it.
ARG DSH_COMMIT
ARG SOURCE_COMMIT=unknown
ENV TRACY_DSH_COMMIT=${DSH_COMMIT}
ENV TRACY_SOURCE_COMMIT=${SOURCE_COMMIT}
# The repository that built it; the workflow passes $GITHUB_REPOSITORY, so the move to TracyHQ/tracy needs no edit here.
ARG SOURCE_REPO=TracyHQ/tch
LABEL org.opencontainers.image.source="https://github.com/${SOURCE_REPO}" \
      org.opencontainers.image.revision="${SOURCE_COMMIT}" \
      org.opencontainers.image.title="tracy-dsh" \
      ai.tracy.dsh-commit="${DSH_COMMIT}"

WORKDIR /site
EXPOSE 8080
# No CMD. Every argument is a fact about the deployment (a port, the hostnames a browser sends,
# where the gateway's configuration is mounted), so the entrypoint reads them from the environment;
# a baked argument list would make this image a per-host artifact.
ENTRYPOINT ["/usr/local/bin/tracy-dsh-entrypoint"]
