# Running Tracy locally

This guide takes a fresh clone to a working Tracy on one machine: first the toolchain and the build
gates, then the whole system (every service, real sites) in Docker.

## Prerequisites

You need **Node 22.19+ or 24+**, **pnpm** (through corepack), **git**, **jq**, and **Docker** with at
least 6 GB of memory and about 25 GB of free disk for the local stand (the dsh image alone is ~7 GB).
On Docker Desktop, turn on **Settings → Resources → Network → Host networking**. macOS and Linux are
what the team runs every day.

This page is the short path. The long version, with every trap the team has hit, is
[`docs/references/running-tracy-locally.md`](references/running-tracy-locally.md).

## Build from source

```bash
npm i -g corepack@latest && corepack enable pnpm

git clone --recurse-submodules https://github.com/TracyHQ/tracy.git
cd tracy
pnpm dsh:build                  # build dsh from vendor/tracy/deepseek-harness — before pnpm install
pnpm install --frozen-lockfile
pnpm build:check                # every gate the project merges on (list: scripts/check-all.ts)
```

The order matters: `pnpm install` resolves `@deepseek-ai/*` packages from the dsh submodule, so the
submodule must be checked out and built first. If you cloned without `--recurse-submodules`, run
`git submodule update --init` before `pnpm dsh:build`.

Day-to-day commands:

```bash
pnpm build          # build every package under packages/ (including the committed lib/client.js bundles)
pnpm test           # every test suite
pnpm lint           # oxlint --fix, typecheck and format
./run.sh web        # boot the dsh web profile with Tracy's plugins, for UI work
```

## Running the whole system

`deploy/compose.yml` runs every service on one machine: `tracy-web`, `tracy-host`, dsh, a filtered
Docker API proxy, Postgres, MinIO and a small DNS server that answers `*.tracy.test`. Sites then
answer at `http://<label>.tracy.test:51710`.

1. Copy the environment file and fill it in:

   ```bash
   cp deploy/.env.example deploy/.env
   ```

   Every variable is described in [`deploy/.env.example`](../deploy/.env.example). The ones you must set:

   | Variable | What to put |
   |---|---|
   | `POSTGRES_PASSWORD`, `MINIO_PASSWORD` | `openssl rand -hex 16` each; compose refuses to start without them. Reuse them in `DATABASE_URL`, `TEST_DATABASE_URL` and `ARTIFACT_S3_SECRET_KEY` |
   | `SESSION_SECRET`, `MCP_TRACY_ACTOR_SECRET`, `HOST_local_SECRET`, `SEAT_local_SECRET` | `openssl rand -hex 32`, a different value for each |
   | `TRACY_SITES_ROOT`, `TRACY_PRIVATE_ROOT`, `TRACY_DSH_HOME` | **absolute** paths to three empty directories |
   | `TRACY_EGRESS_FENCE` | `off` on a laptop (no iptables) |
   | `MODEL_API_KEY` | a [DeepSeek](https://platform.deepseek.com) API key, if you want the agent to answer chats |

   Mail, OAuth sign-in, Cloudflare and GitHub settings can stay empty locally; the features that need
   them say so instead of failing.

2. Build the web apps the `tracy-web` image copies in, and the dsh image (compose does not build it):

   ```bash
   pnpm --filter @tracy/harness-web build
   pnpm --filter @tracy/design-page build
   pnpm --filter @tracy/wo-find-page build
   pnpm --filter @tracy/docs build
   node scripts/gen-ops-cms-snapshot.mjs --out apps/tracy-web/static/ops-cms
   packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh
   DSH_COMMIT=$(git ls-tree HEAD vendor/tracy/deepseek-harness | awk '{print $3}')
   DOCKER_BUILDKIT=1 docker build --build-arg DSH_COMMIT="$DSH_COMMIT" \
     -f packages/fleet/tracy-fleet-operation/dsh/Dockerfile -t tracy/dsh:dev .
   ```

   The dsh image build takes 10–20 minutes the first time. Then copy its profiles into
   `TRACY_DSH_HOME` once (the bind mount hides the ones inside the image):

   ```bash
   TDH=<your TRACY_DSH_HOME>
   docker run --rm --entrypoint sh tracy/dsh:dev -c 'tar -C /desk-home -cf - profiles' \
     | docker run -i --rm -v "$TDH":/out alpine tar -C /out -xf -
   ```

3. Start it. The script checks the prerequisites first and adds the macOS override when needed:

   ```bash
   deploy/scripts/check-local.sh
   ```

   On macOS, `*.tracy.test` must also resolve on the host itself; the script prints the one-time
   `/etc/resolver/test` command (it needs `sudo`) if it is missing. The name is answered by the
   stack's own `dns-host` service, so on the very first run start that one alone, then run the script
   again:

   ```bash
   (cd deploy && docker compose -f compose.yml -f compose.macos.yml --profile local up -d dns-host)
   ```

4. Open `http://tracy.test:51710` and sign in. With no mail configured (`MAIL=console`), the sign-in
   code is printed in the `tracy-web` log; `deploy/scripts/otp.sh` reads it for you.

## Using it

- **A new site.** The *Create a new site* and *Start from a template* cards list the quickstart
  releases Tracy publishes; those are not public yet, so a fresh stand shows "Showing all 0 designs".
  Until they are, create a plain WordPress or Joomla site through the API with your signed-in session
  (from the browser's console on `http://tracy.test:51710`):

  ```js
  await fetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: 'my-first-site', platform: 'wordpress' }) }).then((r) => r.json())
  ```

  The label is 6–30 lowercase letters, digits or hyphens. The site is ready in about two minutes at
  `http://my-first-site.tracy.test:51710/`, and its workspace is `http://tracy.test:51710/my-first-site.tracy.test/`.
- **The agent.** With `MODEL_API_KEY` set, ask for a change in the workspace chat ("Change the site
  title to …"); the site on the right updates when the agent is done.

## Running next to another stand

`deploy/compose.yml` names its project `tracy` and binds fixed names and ports, so a second stand on
the same Docker (another checkout, or a teammate's) must change all of them, or it takes over the
first one's containers. Put the names in `deploy/compose.override.yml` (gitignored; `check-local.sh`
and `otp.sh` read it):

```yaml
name: tracy-b
services:
  docker-proxy:
    container_name: tracy-b-docker-proxy
  tracy-dsh:
    container_name: tracy-b-dsh
    ports: !override ["127.0.0.1:37700:8080"]
    environment:
      DSH_TRUSTED_HOSTS: "local-agent.b.tracy.test,127.0.0.1:37700,127.0.0.1:37710,b.tracy.test:37710,host.docker.internal:37700"
```

and change these lines of `deploy/.env` (never put `COMPOSE_PROJECT_NAME` there: the file is also
every container's environment, and the sites tracy-host creates would join this project):

```bash
TRACY_ORIGIN=http://b.tracy.test:37710
SITE_DOMAIN=b.tracy.test
SESSION_DOMAIN=b.tracy.test
DOCS_ORIGIN=http://docs-b.tracy.test:37710
WEB_PORT=37710
TRACY_HOST_PORT=37720
HOST_local_ORIGIN=http://tracy-host:37720
POSTGRES_PORT=37730            # and the port in TEST_DATABASE_URL
MINIO_PORT=37740               # and the port in ARTIFACT_S3_ENDPOINT and TRACY_MIGRATE_S3_ENDPOINT
ARTIFACT_S3_PUBLIC_ENDPOINT=http://127.0.0.1:37740
TRACY_NETWORK_PREFIX=10.234.201
TRACY_SITE_NETWORK=tracy-b_tracy
HOST_DNS_PORT=15399
APP_IMAGE_TAG=b-dev
DSH_IMAGE_TAG=b-dev            # build the dsh image as tracy/dsh:b-dev
```

`*.b.tracy.test` still resolves through the first stand's `/etc/resolver/test`. If Docker reports
that its address pools are exhausted, give the `default`, `docker-api` and `egress` networks explicit
subnets in the same override file.

## The desktop app

`packages/desktop/tracy-desktop` is the Electron shell around the same web pages. To build an app that
opens your own stand instead of `cowork.tracy.ai`, pin the origin at package time:

```bash
cd packages/desktop/tracy-desktop
TRACY_DESKTOP_ORIGIN=http://tracy.test:51710 bash build/package.sh
open "dist/Tracy Cowork Preview.app"
```

Any origin other than Tracy's own builds **Tracy Cowork Preview**: ad-hoc signed (it runs on the Mac
that built it), never updates itself, and keeps its data apart from an installed Tracy Cowork. Signing
in opens your default browser at the stand to confirm, so that browser must reach the same address.
To run it from source instead, see the package's [`README.md`](../packages/desktop/tracy-desktop/README.md).
