FROM node:22.19.0-slim

WORKDIR /opt/dsh-passwords

RUN apt-get update \
  && apt-get install -y --no-install-recommends git python3 make g++ \
  && rm -rf /var/lib/apt/lists/*


COPY package.json npm-shrinkwrap.json tsconfig.json cordis.yml ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY scripts ./scripts
COPY .env.example README.md README_en.md LICENSE ./
RUN npm run build

COPY docker/docker-entrypoint.sh /usr/local/bin/dsh-passwords-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/dsh-passwords-entrypoint \
  && chmod 755 /usr/local/bin/dsh-passwords-entrypoint \
  && mkdir -p /data/dsh-passwords

ENV DSH_PASSWORDS_ENV_FILE=/data/dsh-passwords/.env
ENV DSH_PASSWORDS_RUNTIME=docker
ENV MCP_DB_PATH=/data/dsh-passwords/platform.db
ENV MCP_GATEWAY_AUTO_TLS=0
ENV MCP_GATEWAY_HOST=0.0.0.0
ENV MCP_GATEWAY_PORT=3088
ENV MCP_DSH_RESTART_SERVICE=

EXPOSE 3088
ENTRYPOINT ["dsh-passwords-entrypoint"]
CMD ["node", "/opt/dsh-passwords/dist/cli.js", "serve-gateway"]
