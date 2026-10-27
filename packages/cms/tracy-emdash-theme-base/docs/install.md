# Installation

Read ../AGENTS.md first.

## Inputs

- Node `>=22.16` (24.11.1 used and pinned in `Dockerfile`), pnpm 11 through corepack
  (`packageManager` in `package.json`). Every dependency is an exact pin in `pnpm-lock.yaml`.
- An **empty destination directory** for a new site. `tools/clean-install.sh <dir> <port>` refuses an
  existing, non-empty, symlinked or nested destination and a busy port, before writing anything.
- The site origin, always explicit (`--site http://host:port` or the first positional argument).
  Nothing in `tools/` assumes localhost.

## Sequence (development)

```bash
pnpm install --frozen-lockfile
pnpm exec astro dev --port 4370 --host 127.0.0.1      # daemon: astro dev status | logs | stop
tools/bootstrap-site.sh http://127.0.0.1:4370 ./data --config template.config.json --seed seed
```

## Sequence (built)

```bash
pnpm install --frozen-lockfile && pnpm build
HOST=127.0.0.1 PORT=4371 SITE_DATA_DIR=./data node dist/server/entry.mjs &
tools/bootstrap-site.sh http://127.0.0.1:4371 ./data --config template.config.json --seed seed
```

`tools/clean-install.sh <dir> <port>` copies the source (no runtime state), installs from the
lockfile, builds, starts the server detached and bootstraps — the proof that the template rebuilds
from what is committed. `server.log` in the destination is the server's log; find the process with
`lsof -ti tcp:<port> -sTCP:LISTEN`.

The bootstrap: first-run setup (`POST /_emdash/api/setup` with the seed, only when the site says
`needsSetup`) → `tools/mint-admin.cjs` (resident agent admin `tracy-agent@tracy.ai` and, with
`TRACY_OWNER_EMAIL`, the owner; agent token to `data/tracy-agent.token`, mode 600) → `seed-apply
schema → content → media → forms → status`. Rerunning is safe: entries equal to the seed are adopted,
editor changes are kept and reported, a seed-and-editor conflict exits 3 for a decision.

## State and paths

| What | Where | Ships with the package? |
|---|---|---|
| SQLite database | `data/data.db` (`SITE_DATA_DIR`, default `./data`) | no |
| Uploaded media | `uploads/` | no (the importer uploads `seed/media/` on bootstrap) |
| Agent token | `data/tracy-agent.token` | no — private installation state |
| Seed receipts | `data/seed-receipts.json` | no |
| Backups | `backups/` (`tools/backup.sh`) | no |
| Environment | process environment; `astro.config.mjs` reads `SITE_DATA_DIR`, `src/middleware.ts` reads `TRACY_FRAME_ANCESTORS` (demo sites only), `src/lib/public-origin.ts` reads the public origin | no |

`astro.config.mjs` creates `data/` and `uploads/` on start; a clean checkout has neither.

## Docker installation

Copy `.env.example` to a private `.env`, configure a unique encryption key and set
`EMDASH_SITE_URL` to the public origin before starting. Configure owner email and SMTP for your
installation; never reuse example credentials.

```bash
mkdir -p data uploads
docker build -t tracy-base:0.5.3 .
docker run -d --name tracy-base-owned -p 127.0.0.1:4371:4321 --env-file .env -e HOST=0.0.0.0 -e PORT=4321 -e SITE_DATA_DIR=/app/data -v "$PWD/data:/app/data" -v "$PWD/uploads:/app/uploads" tracy-base:0.5.3
docker exec -u www-data -e TRACY_OWNER_EMAIL=owner@example.test tracy-base-owned bash tools/bootstrap-site.sh http://127.0.0.1:4321 /app/data --config template.config.json --seed seed
```

The bootstrap origin is inside this container; the public origin remains the configured
`EMDASH_SITE_URL`. Keep generated tokens private. Give the builder sufficient bounded memory;
a canceled or out-of-memory build is not a successful installation.

## Owner authentication

A built site has no dev bypass. Sign in with the **email link** (`/_emdash/admin/login`) as the
owner (`TRACY_OWNER_EMAIL` during bootstrap) or the resident agent; passkeys can be added in the
admin afterwards. Mail must be configured first: `node tools/configure-smtp.mjs --site <origin>
--token-file data/tracy-agent.token --config template.config.json --host <smtp> --port <n>
[--security starttls|ssl] [--from …]` sets the `emdash-smtp` Generic SMTP provider and selects it
for `email:deliver`. Locally, Mailpit (`README.md`). The development bypass
(`/_emdash/api/setup/dev-bypass`) exists only under `astro dev`.

## Forms

`tools/forms.json` defines the contact form; `seed-apply forms` (part of the bootstrap) creates it
and writes its id into `contact.form_id`. Notification recipients (`settings.notifyEmails`) and the
`mail` block of `template.config.json` are demo values (`*.example`): set the deployment's own
before enabling enquiries.

## Identify the site before changing it

`GET <origin>/_emdash/api/setup/status` (setup complete?), `data/seed-receipts.json` (`site`,
last runs), `template.config.json` (`id`, `version`), and the process owner of the port. Two sites
built from this package look alike; the origin and the data directory are what tell them apart.

## Installing from a quickstart release

`tools/release.mjs` assembles a release (`tracy-quickstart/v1`): a source zip and a state snapshot
(database + uploads without reusable agent credentials, tokens, sign-in state and logs). A restored
site mints its own agent token with `tools/mint-admin.cjs`.
