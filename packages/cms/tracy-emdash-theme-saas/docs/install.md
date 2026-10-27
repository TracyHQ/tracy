# Installation

Read ../AGENTS.md. Localhost setup and production requirements are separated below.
Real customer authentication must not depend on a development bypass. Runtime credentials
and encryption keys are private installation state, never source assets.

## Requirements

Node >= 22.16 (24.11.1 is what the template was built with) and pnpm 11 (`packageManager` in
`package.json`). The package is a standalone pnpm project: its own `pnpm-workspace.yaml` marker and
lockfile. `better-sqlite3`, `esbuild` and `sharp` compile native parts during install.

## Empty destination, localhost

```bash
# from a copy of this package in an empty directory
pnpm install --frozen-lockfile
pnpm build
HOST=127.0.0.1 PORT=4361 node dist/server/entry.mjs &      # SSR server; SITE_DATA_DIR defaults to ./data
tools/bootstrap-site.sh http://127.0.0.1:4361 ./data         # explicit origin + data dir
node tools/seed-apply.mjs status --site http://127.0.0.1:4361
```

`tools/clean-install.sh <empty-dir> <port>` performs the same steps into a new directory with preflight
checks (refuses non-empty, symlinked or nested destinations and busy ports).

Bootstrap does, idempotently: first-run setup with the seed's content → `tools/mint-admin.cjs` (an
admin for the resident agent plus a Personal Access Token in `data/tracy-agent.token`, mode 0600) →
`seed-apply schema`, `content`, `media` (uploads `seed/media/` per `seed/media-map.json`), `forms`
(creates the forms in `tools/forms.json` and writes their ids per `template.config.json`) → `status`.
Exit 3 means some entries need a human decision; it never forces.

Development: `pnpm exec astro dev --port <port> --host 127.0.0.1` runs a daemon
(`pnpm exec astro dev status|logs|stop`).

## Environment

Copy `.env.example` to `.env` for a deployed site:

| Variable | Purpose |
| --- | --- |
| `EMDASH_ENCRYPTION_KEY` | Encrypts plugin secrets at rest (`npx emdash secrets generate`). Losing it loses those secrets. |
| `EMDASH_SITE_URL` | Public origin for absolute URLs (canonical, media, Open Graph) behind a proxy |
| `SITE_DATA_DIR` | Directory of `data.db` (default `./data`); `uploads/` stays beside the app |
| `HOST`, `PORT` | Bind of `node dist/server/entry.mjs` |
| `TRACY_OWNER_EMAIL`, `TRACY_OWNER_NAME` | Optional: bootstrap also seeds the owner as an admin |

## Owner authentication

The admin is `/_emdash/admin`. The owner signs in with a passkey or an email link on the built site; the
agent token is for API/MCP automation only. The development bypass
(`/_emdash/api/setup/dev-bypass`) exists only under `astro dev` and must never be used as production auth.

## Forms and mail

The footer newsletter posts to the Forms plugin (`newsletter-en`). Mail delivery needs SMTP:
`node tools/configure-smtp.mjs --test <address>` configures the Generic SMTP provider of `emdash-smtp`
(use Mailpit locally). Without SMTP, submissions are stored and visible in the admin but no mail is sent.

## Identifying a site before changing it

Record origin, port, `SITE_DATA_DIR` and the process id (`astro dev status`, or the `node
dist/server/entry.mjs` process and its working directory) before any write; several sites can run on one
machine and each has its own `data/`.
