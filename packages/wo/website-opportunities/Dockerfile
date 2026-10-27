# The standalone Website Opportunities server. Build context: this folder alone.
#   docker build -t website-opportunities .          (or: docker compose up --build)
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json* ./
# The repository ships a lockfile: install exactly it. Without one, every direct dependency is pinned to an exact version.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --ignore-scripts --no-audit --no-fund; \
    else npm install --omit=dev --ignore-scripts --no-audit --no-fund; fi \
  && npm cache clean --force
COPY . ./
# Photos and logos (`src/standalone/disk-objects.js`); mount a volume here to keep them.
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
USER node
CMD ["node", "src/standalone/server.js"]
