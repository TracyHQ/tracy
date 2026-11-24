# Installation

Read ../AGENTS.md. Requirements: Node >= 22.23.4, pnpm 11.9.0 via corepack, an empty destination folder.

```bash
pnpm install --frozen-lockfile
pnpm build
mkdir -p data uploads
EMDASH_SITE_URL=http://127.0.0.1:4361 HOST=127.0.0.1 PORT=4361 node dist/server/entry.mjs &
tools/bootstrap-site.sh http://127.0.0.1:4361 ./data   # schema, content, media, forms, search index, agent token
```

`tools/clean-install.sh <new-dir> <port>` does all of this from a copy of the package. Development: `pnpm exec astro dev --port 4360 --host 127.0.0.1` (a dev bypass signs the admin in); a built site has no bypass: the door is the e-mail link (see README "Sign in to the admin on a built site"). Data lives in `SITE_DATA_DIR` (default `./data`) and `./uploads`; `.env.example` lists the variables (`EMDASH_ENCRYPTION_KEY` must be kept: losing it loses the plugin secrets). Export the variables yourself: the server does not read `.env`. Localhost setup differs from production: production needs `EMDASH_SITE_URL`, an SMTP provider (Admin > SMTP Providers) and a real owner e-mail (`TRACY_OWNER_EMAIL`). Runtime credentials and keys are private installation state, never source assets. Before modifying a site, identify it: origin, data directory, and the process that serves it (`ps`, `HOST`/`PORT`), and never stop another site's process.
