# pnpm inside this image installs from apps/tracy-web/pnpm-lock.yaml, a lockfile of its own
# generated with `cd apps/tracy-web && pnpm install --lockfile-only --ignore-workspace` — that
# flag is required because the root pnpm-workspace.yaml would otherwise try to link
# @hono/node-server, hono, and pg from the repo's own node_modules, which do not exist in this
# build context (only apps/tracy-web/package.json and its lockfile are COPYed in). Regenerate
# the lockfile whenever apps/tracy-web/package.json's dependencies change, and commit it.
# The API reference page (`src/api-reference/route.js`) serves ONE file of `@scalar/api-reference`:
# its prebuilt browser bundle. The package itself drags ~280 MB of Vue/editor dependencies the
# server never runs, so it is a devDependency (pinned, in this lockfile) installed in this throwaway
# stage, and only the bundle is copied into the image below — at the same `node_modules/` path a
# checkout resolves, so the route reads one path in both places.
FROM node:24-slim AS scalar
WORKDIR /opt/tracy-web
COPY apps/tracy-web/package.json apps/tracy-web/pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --dev --ignore-scripts --frozen-lockfile \
  && test -s node_modules/@scalar/api-reference/dist/browser/standalone.js

# The design-system library the Design system door wears a site with (`src/lib/ds-slot.js`): of each
# OpenDesign system only the two files the emitters read (`tokens.css`, `manifest.json`), not its
# previews and translated DESIGN.md (78 MB in all), kept in this throwaway stage.
FROM node:24-slim AS dslib
COPY vendor/tracy/od-design-system/systems /lib/systems
COPY packages/cms/tracy-wordpress-theme/overlays /lib/overlays
RUN find /lib/systems -type f ! -name tokens.css ! -name manifest.json -delete \
  && find /lib/overlays -type f ! -name tokens.css -delete \
  && find /lib/systems /lib/overlays -type d -empty -delete \
  && test -s /lib/systems/stripe/tokens.css && test -s /lib/overlays/wp-ja-vega/tokens.css
# The Refero library (`src/lib/ds-slot.js` referoLibrary): only the systems the doors OFFER, the ones the
# quality gate passes (Akemi, 12/10/2026). The offered list is `packages/design/tracy-ds-slot/refero-thumbs/`
# itself: `scripts/build-refero-thumbs.mjs` writes one 480-px WebP card picture per offered system (computed
# by `referoLibrary()`, the doors' own code) and none for a refused one, and its `--check` holds the folder
# to that list. So this stage keeps, of each system, the two files `loadProfile` reads (`design-system.json`
# + `manifest.json`; `.dockerignore` lets in nothing else) only when the system has a thumbnail, and fails
# unless every thumbnail has both: a count and ids taken from the data, none written here. A refused
# system's data is not needed: the doors never offer, preview or apply it, and a site that already wears
# one names it from its own slot and is undone by its host. The card pictures are NOT the snapshot's
# 1440-px screenshots (151 MB): the final stage copies the thumbnails folder as is.
COPY packages/design/tracy-ds-slot/refero-thumbs /lib/refero-thumbs
COPY vendor/tracy/refero/systems /lib/refero/systems
COPY vendor/tracy/refero/catalog.json /lib/refero/catalog.json
RUN find /lib/refero/systems -type f ! -name design-system.json ! -name manifest.json -delete \
  && for d in /lib/refero/systems/*/; do u="$(basename "$d")"; [ -e "/lib/refero-thumbs/$u.webp" ] || rm -r "$d"; done \
  && find /lib/refero/systems -type d -empty -delete \
  && offered="$(ls /lib/refero-thumbs | grep -c '\.webp$')" && test "$offered" -gt 0 \
  && test "$(ls /lib/refero/systems | wc -l)" -eq "$offered" \
  && for f in /lib/refero-thumbs/*.webp; do u="$(basename "$f" .webp)"; \
       test -s "/lib/refero/systems/$u/design-system.json" && test -s "/lib/refero/systems/$u/manifest.json" || exit 1; done

FROM node:24-slim
WORKDIR /opt/tracy-web
COPY apps/tracy-web/package.json apps/tracy-web/pnpm-lock.yaml ./
# `--frozen-lockfile`: this package keeps its own lockfile, and nothing keeps it in step with the
# root one. Without the flag pnpm silently re-resolves when they drift, so the image would ship
# versions no lockfile in the repo records — the failure being loud is the whole point.
RUN corepack enable pnpm && pnpm install --prod --ignore-scripts --frozen-lockfile
COPY --from=scalar /opt/tracy-web/node_modules/@scalar/api-reference/dist/browser/standalone.js ./node_modules/@scalar/api-reference/dist/browser/standalone.js
COPY apps/tracy-web/src ./src
# The open Website Opportunities package (ADR 0036), which `src/` imports by name (`website-opportunities/src/…`,
# `website-opportunities/domain`): its own bytes where a checkout's root `node_modules/` links it. Its npm
# dependencies (hono, pdfjs-dist, sharp, tinyld) resolve up to this app's `node_modules/`, so they stay pinned in
# this app's lockfile at the versions the package declares. `scripts/test/tracy-web-wo-package-image.test.mjs`
# rebuilds this layout and imports the package from it.
COPY packages/wo/website-opportunities ./node_modules/website-opportunities
# Operator tools that must run INSIDE this container (they need its DATABASE_URL and HOST_* settings,
# and import `../src`). Named one by one, never the whole `scripts/` directory: a dev or test helper
# added there later must not ship by accident. Until 03/10 none was in the image, and the Site
# changes V2 backfill had to be `docker cp`-ed in by hand on dev.
#   backfill-site-operations.mjs — one-off: old Undo/Restore presses get their presser (contract §5).
COPY apps/tracy-web/scripts/backfill-site-operations.mjs ./scripts/backfill-site-operations.mjs
#   seed-admin-seats.mjs — a new deployment's operators get their tracy_admin seats (install-shard.sh).
COPY apps/tracy-web/scripts/seed-admin-seats.mjs ./scripts/seed-admin-seats.mjs
#   copy-place-media-to-shared-bucket.mjs — old WO place pictures into the shared bucket (plan-wo-shared-places §7).
COPY apps/tracy-web/scripts/copy-place-media-to-shared-bucket.mjs ./scripts/copy-place-media-to-shared-bucket.mjs
#   push-wo-places.mjs — push places to a master's ingest door (plan-wo-shared-places §6).
COPY apps/tracy-web/scripts/push-wo-places.mjs ./scripts/push-wo-places.mjs
# The design registry decides which Joomla template a picked inspiration actually builds with, and
# the CANONICAL copy ships with the fleet's provision scripts (`tracy-host` carries that directory
# whole) because that is where it is executed. This process only resolves against it, so it gets
# the same bytes copied over the mirror `src/` already carries — the mirror exists so a checkout
# and a container read one path, and `scripts/check-design-templates.ts` fails the build if the two
# copies ever differ. Copying the canonical file LAST is what makes the image's answer the fleet's.
COPY packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json ./src/design-templates.json
# Same arrangement for the quickstart catalog: `provision.sh` gates a restore on the platform this
# file names, and `POST /api/sites` must accept exactly what the fleet will restore.
COPY packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json ./src/quickstarts.json
# The content contract profiles, both CMS trees merged into one directory — the same arrangement the
# seeder builds for the image that installs them (`tracy-seeder/scripts/build.mjs` copies the Joomla
# tree and the WordPress tree into one `data/quickstart-contracts/`). This process reads each
# `manifest.json`, to answer "which contract seals a site built from this quickstart", and — for the
# content relay (`sites/content-profile.js`) — `content-map.json` and `presentation-lock.json` beside
# it: the slot limits and the block kinds a `content.read` describe reports. Both are already in the
# directories copied whole here, so no file needs its own line.
COPY packages/cms/tracy-joomla-quickstart/contracts ./src/contracts
COPY packages/cms/tracy-wordpress-quickstart/contracts ./src/contracts
# An EmDash theme's measurement files (`contracts/<version>/design-system-measurement.json`, the
# Template Design System Readiness check's built-site rules, #1313), laid out as the quickstart ones:
# `<slug>/<cms dir of the tag>/<version>/`.
# Every EmDash theme with measurement files needs its line: Tracy Base and Tracy SaaS were missing until 14/10, so
# /ops said "not measured yet" for files the tree held (template-design-system-readiness.test.mjs checks the list).
COPY packages/cms/tracy-emdash-theme-business/contracts ./src/contracts/tracy-business/emdash-0.x
COPY packages/cms/tracy-emdash-theme-base/contracts ./src/contracts/tracy-base/emdash-0.x
COPY packages/cms/tracy-emdash-theme-saas/contracts ./src/contracts/tracy-saas/emdash-0.x
# What a Joomla quickstart ships translated for its own demo copy, beside the contracts (same release/version folders):
# "Apply" with a language the template does not carry translates what the site holds, and a string the template already
# translated is not asked of a model again (`tracy-seeder/src/shipped-translations.mjs`, `lib/seeder.js` `seederDataDir`).
COPY packages/cms/tracy-joomla-quickstart/translations ./src/translations
# The Joomla identity plugin's token list, read by the Customize your site check (rule STAB-7,
# `src/lib/template-customization-question-readiness/rules/stab-7-machine-text.js`), which /ops runs
# on this server after every read of the releases.
COPY packages/cms/tracy-joomla-quickstart/plugins/plg_system_tracyidentity/src/Identity.php ./src/identity-plugin/Identity.php
# The EmDash template's own personalize tool and each template's seed (`lib/emdash-tool.js`): "Apply" in the Add site popup
# writes an EmDash site's words with the tool the Build runs, as a client of the site's HTTP API. The three templates ship
# ONE byte-identical tool (`test/emdash-tool.test.mjs` holds them equal), so one copy; the seed (the demo content the tool
# plans against, 5.4 MB for Business) and `template.config.json` are each template's own. The tool reads
# `<seed>/../template.config.json`, hence the layout. `media-map.json` says which link fields the importer fills with a
# document of the demo company (DEMO FILE LINKS): without it the hero's company-profile PDF stayed on every Apply
# (g60-biz-emd-full, 10/10/2026). `test/emdash-tool.test.mjs` holds every seed file the tool reads to be copied here.
COPY packages/cms/tracy-emdash-theme-business/tools/personalize.mjs ./src/emdash-tool/personalize.mjs
# The Build plugin's pure reader, without its dsh or site-folder dependencies.
COPY packages/site/tracy-site-build-emdash/src/host/template-tokens.mjs ./src/emdash-tool/template-tokens.mjs
# Which elements the replace job never leaves empty, the one list the residue sweep plans against
# (`opportunities-build/residue-sweep.js`): the site-tools leaf itself, no copy kept in this app.
COPY packages/tools/tracy-site-tools/src/host/empty-rules.mjs ./src/site-tools/empty-rules.mjs
COPY packages/cms/tracy-emdash-theme-business/seed/seed.json packages/cms/tracy-emdash-theme-business/seed/personalize.json packages/cms/tracy-emdash-theme-business/seed/questions.json packages/cms/tracy-emdash-theme-business/seed/media-map.json packages/cms/tracy-emdash-theme-business/seed/field-map.json ./src/emdash-tool/tracy-business/seed/
COPY packages/cms/tracy-emdash-theme-business/template.config.json ./src/emdash-tool/tracy-business/template.config.json
COPY packages/cms/tracy-emdash-theme-saas/seed/seed.json packages/cms/tracy-emdash-theme-saas/seed/personalize.json packages/cms/tracy-emdash-theme-saas/seed/questions.json packages/cms/tracy-emdash-theme-saas/seed/media-map.json packages/cms/tracy-emdash-theme-saas/seed/field-map.json ./src/emdash-tool/tracy-saas/seed/
COPY packages/cms/tracy-emdash-theme-saas/template.config.json ./src/emdash-tool/tracy-saas/template.config.json
COPY packages/cms/tracy-emdash-theme-base/seed/seed.json packages/cms/tracy-emdash-theme-base/seed/personalize.json packages/cms/tracy-emdash-theme-base/seed/questions.json packages/cms/tracy-emdash-theme-base/seed/media-map.json packages/cms/tracy-emdash-theme-base/seed/field-map.json ./src/emdash-tool/tracy-base/seed/
COPY packages/cms/tracy-emdash-theme-base/template.config.json ./src/emdash-tool/tracy-base/template.config.json
# Image-only placement measures and hashes the release's original demo files; metadata maps alone cannot prove ownership.
# These are template seed files (about 16 MB across the three templates), never collected customer media.
COPY packages/cms/tracy-emdash-theme-business/seed/media ./src/emdash-tool/tracy-business/seed/media
COPY packages/cms/tracy-emdash-theme-business/seed/content-api-map.json ./src/emdash-tool/tracy-business/seed/content-api-map.json
COPY packages/cms/tracy-emdash-theme-saas/seed/media ./src/emdash-tool/tracy-saas/seed/media
COPY packages/cms/tracy-emdash-theme-saas/seed/content-api-map.json ./src/emdash-tool/tracy-saas/seed/content-api-map.json
COPY packages/cms/tracy-emdash-theme-base/seed/media ./src/emdash-tool/tracy-base/seed/media
COPY packages/cms/tracy-emdash-theme-base/seed/content-api-map.json ./src/emdash-tool/tracy-base/seed/content-api-map.json
# The content seeder's own modules (`lib/seeder.js`): "Apply" in the Add site popup writes a new site's words
# with the planners and the door calls the seeder uses, not a second copy of their rules. Only the leaf
# modules are loaded at run time (the plan-* / apply-* / model / picture ones: they import nothing outside
# this directory); `cli.mjs`, `inputs.mjs` and `writers.mjs` import other packages and are never loaded
# here. The package's own bytes, as with the Content API above: no mirror to keep equal.
COPY packages/cms/tracy-seeder/src ./src/seeder
# The Content API schema, its validator and its slot → block kind map (`@tracy/content-api`), for the
# content relay (`lib/content-api.js` reads `./src/content-api/` here and the package in a checkout).
# The package's own bytes, not a mirror: the image installs from this app's lockfile alone, so a
# workspace dependency would have nothing to resolve to.
COPY packages/cms/tracy-content-api/package.json packages/cms/tracy-content-api/validate.mjs packages/cms/tracy-content-api/schema.json packages/cms/tracy-content-api/describe-map.mjs ./src/content-api/
# The operator's User Interface switches (`lib/ui-setting.js`): the ONE catalogue the customer-page
# plugins read through `@tracy/core/ui-switches`. Same arrangement as the Content API above — the
# package's own bytes here, the package in place in a checkout, no mirror.
COPY packages/core/tracy-core/src/ui-switches/catalogue.json ./src/ui-switches/catalogue.json
# The design-system slot's emitters (`lib/ds-slot.js`, the Design system door): the package's own
# `src/` and `templates/` — no mirror — with what they read laid out under `src/ds-slot/root/` as in a
# checkout (the library and the WordPress overlays' base tokens), and `@tracy/wordpress-theme/variation`
# where a bare import from `src/ds-slot/src/` resolves. `scripts/test/tracy-web-ds-slot-image.test.mjs`
# copies these the same way and loads every module from the copy.
COPY packages/design/tracy-ds-slot/src ./src/ds-slot/src
COPY packages/design/tracy-ds-slot/templates ./src/ds-slot/templates
COPY packages/design/tracy-ds-slot/refero-thumbs ./src/ds-slot/refero-thumbs
COPY packages/cms/tracy-wordpress-theme/package.json ./src/ds-slot/node_modules/@tracy/wordpress-theme/package.json
COPY packages/cms/tracy-wordpress-theme/lib/variation.mjs ./src/ds-slot/node_modules/@tracy/wordpress-theme/lib/variation.mjs
COPY vendor/tracy/od-design-system/catalog.json ./src/ds-slot/root/vendor/tracy/od-design-system/catalog.json
COPY --from=dslib /lib/systems ./src/ds-slot/root/vendor/tracy/od-design-system/systems
COPY --from=dslib /lib/overlays ./src/ds-slot/root/packages/cms/tracy-wordpress-theme/overlays
COPY --from=dslib /lib/refero ./src/ds-slot/root/vendor/tracy/refero
# And the three CMS default questionnaires (tracy-questions/v1), one per Build plugin: the create
# door resolves which questionnaire a site is asked from the same bytes the plugin ships;
# `scripts/check-questions.ts` holds mirror and source equal.
COPY packages/site/tracy-site-build-wordpress/questions.json ./src/questions/wordpress.json
COPY packages/site/tracy-site-build-joomla/questions.json ./src/questions/joomla.json
COPY packages/site/tracy-site-build-emdash/questions.json ./src/questions/emdash.json
# The questionnaire schema/resolver is ONE module, owned by site-build-core; this process cannot
# import packages/ (the image carries apps/tracy-web alone), so the file is mirrored, gate-held.
COPY packages/site/tracy-site-build-core/src/questions.mjs ./src/lib/questions-schema.mjs
# What an EmDash template DECLARES, for the questionnaire generator's capabilities reader
# (`lib/quickstart-capabilities.js`, 22/09): the artifact card, the personalize map and the site
# model of each packaged template, and the fleet-side personalize map of a packed release
# (`tracy-saas`). Joomla and WordPress read the contract profiles above; EmDash has no contract
# tree, so these three files are its declared sources. Metadata only — no seed, no media.
COPY packages/cms/tracy-emdash-theme-business/artifact.json ./src/emdash-templates/tracy-business/artifact.json
COPY packages/cms/tracy-emdash-theme-business/seed/personalize.json ./src/emdash-templates/tracy-business/seed/personalize.json
COPY packages/cms/tracy-emdash-theme-business/seed/site-model.json ./src/emdash-templates/tracy-business/seed/site-model.json
# Which v1 content type each collection is (`content.read` describe lists these types for an EmDash site).
COPY packages/cms/tracy-emdash-theme-business/seed/content-api-map.json ./src/emdash-templates/tracy-business/seed/content-api-map.json
# (tracy-base ships no site model; the reader reads what is there and says so.)
COPY packages/cms/tracy-emdash-theme-base/artifact.json ./src/emdash-templates/tracy-base/artifact.json
COPY packages/cms/tracy-emdash-theme-base/seed/personalize.json ./src/emdash-templates/tracy-base/seed/personalize.json
COPY packages/fleet/tracy-fleet-operation/scripts/provision/emdash/personalize ./src/emdash-templates
# The built harness SPA (Plan 4 Task 2) — `dist/` is gitignored (built with `pnpm --filter
# @tracy/harness-web build`, same reasoning RULE #3 (CLAUDE.md §2) gives `lib/client.js`: this one is NOT a
# checked-in build, so whoever builds this image must run that build first). Served from
# `apps/tracy-web/src/ops/route.js` at `/ops` (one index.html for every page address, `/ops/cms`
# included), whose own `DEFAULT_STATIC_DIR` resolves to exactly this path relative to `src/ops/route.js`.
COPY packages/web/tracy-harness/dist ./static/ops
# The public Design inspiration page's built assets (Task 3, ADR 0011) — `route.js` reads them
# straight off disk, no bundler step of its own.
COPY packages/web/tracy-design-page/dist ./static/design-inspiration
# The sign-in-free Find (`packages/web/tracy-wo-find-page`), served at `/find` by `public/wo-find-page.js`.
COPY packages/web/tracy-wo-find-page/dist ./static/find
# The documentation site (`apps/tracy-docs`, Astro Starlight; tasks/todo-api-public.md S5) — served
# by `src/docs/route.js` at `/docs` on every hostname and as the root of the API host. Same shape as
# the two dist/ above: gitignored, built by `pnpm --filter @tracy/docs build` (CI: build-app-images.yml;
# local: scripts/rebuild-local.sh), and `scripts/ci/image-context.mjs` hashes its content.
COPY apps/tracy-docs/dist ./static/docs
# The `/ops/cms` configuration snapshots — one JSON per environment, read out of git BEFORE the
# build by `scripts/gen-ops-cms-snapshot.mjs --out apps/tracy-web/static/ops-cms` (the image has no
# `.git`, on purpose; see `src/ops/cms.js`). Gitignored like the two dist/ above, so the generator is
# a pre-build step of every build path (CI: build-app-images.yml; local: running-tracy-locally.md §2).
# An image built without it serves "This build shipped no configuration snapshots" — measured
# 2026-09-15 on the local stand.
COPY apps/tracy-web/static/ops-cms ./static/ops-cms
RUN useradd --system --create-home --shell /usr/sbin/nologin tracy-web && chown -R tracy-web:tracy-web /opt/tracy-web
# An empty named volume inherits this private mountpoint's owner/mode on its first mount.
# No campaign key is built into this image or copied into a database backup.
RUN install -d -m 0700 -o tracy-web -g tracy-web /var/lib/tracy/invitations-real-keys
USER tracy-web
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
# Which build this is, for `GET /api/build` (src/public/build-info-door.js; Settings › Help & about):
# the commit the image was built from and when, passed by build-app-images.yml. LAST IN THE FILE ON
# PURPOSE, as in the dsh image: the commit changes on every build, and anywhere earlier it would
# invalidate the cache of every layer below it. scripts/ci/image-context.mjs hashes this file's
# text, not the values passed, so a new commit alone does not make a new image — a reused image
# keeps the commit and time of the build that made it, which is the build that runs.
# A build that passes nothing (a laptop) answers null, and the page shows no label.
ARG TRACY_SOURCE_COMMIT=
ARG TRACY_BUILT_AT=
ENV TRACY_SOURCE_COMMIT=${TRACY_SOURCE_COMMIT} TRACY_BUILT_AT=${TRACY_BUILT_AT}
CMD ["node", "src/server.js"]
