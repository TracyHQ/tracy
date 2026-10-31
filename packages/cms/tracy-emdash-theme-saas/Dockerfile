# Build from THIS standalone package, not the TCH repository root.
FROM node:24.11.1-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g corepack@0.34.0 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# 🔒 THE RELEASE-AGE CHECK IS OFF HERE, AND ONLY HERE. pnpm 11's supply-chain policy re-reads the
# registry metadata of every entry in the lockfile before it installs — 1075 packuments, some of
# them megabytes. Measured 22/09/2026 building the Tracy Business zip: 22m42s and then
# `ERR_PNPM_BROKEN_METADATA_JSON: The operation was aborted due to timeout`, i.e. a provision that
# dies after twenty minutes with a message about JSON. With the flag: 40 seconds.
# It is safe to drop at THIS point and nowhere else: the versions were already chosen and aged in
# the repository, the lockfile is frozen, and these bytes reached the host inside an artifact
# whose sha256 the catalog pinned before the download. The gate belongs where the lockfile is
# written, not where a pinned artifact is unpacked.
# It had not bitten before only because the host's build cache still held the layer from the
# previous release; one word changed in package.json is enough to lose that.
RUN pnpm install --frozen-lockfile --config.minimumReleaseAge=0
COPY . .
# Content API reader (tools/content-api): ON in every image the fleet builds (the fleet passes no
# build arg to a template's own Dockerfile), off only for a build that says
# --build-arg TRACY_CONTENT_API_SCALARS=0. It is read by astro.config.mjs at build time, because
# the reader is an injected route, not a runtime switch. Tracy's comment picker needs it: the
# provenance stamps (src/lib/stamps.ts) name ids only the reader can resolve.
# 🔒 ENV, NOT ONLY ARG, HERE AND IN THE FINAL STAGE. The site rebuilds its dist inside its own
# container later on (site.rebuild, provision/emdash/drop-old-guard.mjs, the owner's agent), and
# that build sees the container's environment and nothing else: an ARG ends with its stage and a
# LABEL is not an environment variable. With ARG + LABEL only, the first rebuild dropped the
# reader and /content.json answered 404 HTML while the label still said scalars=1 (measured
# 26/09/2026 on dev, ge2357). tests/content-api-dockerfile.test.mjs holds this.
ARG TRACY_CONTENT_API_SCALARS=1
ENV TRACY_CONTENT_API_SCALARS=$TRACY_CONTENT_API_SCALARS
RUN pnpm build

FROM node:24.11.1-bookworm-slim
ARG TRACY_CONTENT_API_SCALARS=1
ENV TRACY_CONTENT_API_SCALARS=$TRACY_CONTENT_API_SCALARS
LABEL io.tracy.content-api.scalars="$TRACY_CONTENT_API_SCALARS"
LABEL io.tracy.template.id="tracy-saas" \
      io.tracy.template.version="1.4.14" \
      io.tracy.cms="emdash" \
      io.tracy.cms.version="1.1.0"
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash curl ca-certificates git ripgrep less jq gosu \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g corepack@0.34.0 && corepack enable
COPY --from=build --chown=www-data:www-data /app/node_modules ./node_modules
COPY --from=build --chown=www-data:www-data /app/dist ./dist
COPY --chown=www-data:www-data . .
# The owner's agent runs as www-data and rebuilds the site in place: `astro build` writes .astro/,
# .emdash/ and dist/, so the application directory itself is theirs — not root's (measured 15/09:
# EACCES on /app/.emdash with everything under it already www-data's). A quickstart site is no
# exception (ADR 0022, Lee 26/09/2026): changing its look is an edit under /app and a rebuild.
RUN mkdir -p .astro .emdash data uploads && find /app -xdev -not -user www-data -exec chown www-data:www-data {} +
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 SITE_DATA_DIR=./data
EXPOSE 4321
ENTRYPOINT ["bash", "/app/tools/docker-entrypoint.sh"]
CMD ["node", "dist/server/entry.mjs"]
