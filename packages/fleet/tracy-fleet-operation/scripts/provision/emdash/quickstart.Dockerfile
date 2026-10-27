# The fleet's stock image recipe for a Tracy EmDash quickstart whose package ships none.
#
# A template cut from the kit (vendor/emdash/tracy-emdash-skill) carries its source, seed and
# tools, but a Dockerfile only when its author added one — Tracy Business did (its copy is the
# origin of this file, minus the hard-coded labels); Tracy SaaS 1.0.0 did not, and its provision
# died at `docker build` before a single line of the template ran (measured 16/09 on dev).
# `quickstart-restore.sh#emdash_complete_source` copies this file into the unpacked package when
# `Dockerfile` is absent, and never over one that is present: a template's own recipe wins.
#
# The three labels are what `docker inspect` answers about a site container — the EmDash tell of
# `tracy_emdash` (packages/tools/tracy-site-tools) reads `io.tracy.cms` — so they are passed in
# from the package's own template.config.json / package.json rather than typed here.
ARG TEMPLATE_ID=unknown
ARG TEMPLATE_VERSION=0.0.0
ARG CMS_VERSION=unknown

FROM node:24.11.1-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g corepack@0.34.0 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.11.1-bookworm-slim
ARG TEMPLATE_ID
ARG TEMPLATE_VERSION
ARG CMS_VERSION
LABEL io.tracy.template.id="${TEMPLATE_ID}" \
      io.tracy.template.version="${TEMPLATE_VERSION}" \
      io.tracy.cms="emdash" \
      io.tracy.cms.version="${CMS_VERSION}"
WORKDIR /app
# The container is also the agent's shell (ADR 0014): git/rg/less/jq for it, gosu for the
# entrypoint's drop to www-data, curl for the provision's own health probes.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash curl ca-certificates git ripgrep less jq gosu \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g corepack@0.34.0 && corepack enable
COPY --from=build --chown=www-data:www-data /app/node_modules ./node_modules
COPY --from=build --chown=www-data:www-data /app/dist ./dist
COPY --chown=www-data:www-data . .
# /app is the site's own (tasks/todo-emdash-site-owner-rebuild.md): everything in it belongs to
# www-data so the site's agent can rebuild it in place.
RUN mkdir -p .astro .emdash && find /app -xdev -not -user www-data -exec chown www-data:www-data {} +
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 SITE_DATA_DIR=./data
EXPOSE 4321
ENTRYPOINT ["bash", "/app/tools/docker-entrypoint.sh"]
CMD ["node", "dist/server/entry.mjs"]
