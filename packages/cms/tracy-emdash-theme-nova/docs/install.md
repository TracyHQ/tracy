# Installation

Read ../AGENTS.md. Requirements: Node >= 22.23.4, pnpm 11.9.0 via corepack, an empty destination folder; `tools/clean-install.sh` also needs `rsync`, `lsof` and network access (fonts, packages). Signing in to the admin of a built site needs a mail catcher on 127.0.0.1:1025 / 8025 (`docker run -d -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit`).

```bash
pnpm install --frozen-lockfile
pnpm build
mkdir -p data uploads
EMDASH_SITE_URL=http://127.0.0.1:4361 HOST=127.0.0.1 PORT=4361 node dist/server/entry.mjs &
tools/bootstrap-site.sh http://127.0.0.1:4361 ./data   # schema, content, media, forms, search index, agent token
```

`tools/clean-install.sh <new-dir> <port>` does all of this from a copy of the package. Development: `pnpm exec astro dev --port 4360 --host 127.0.0.1` (a dev bypass signs the admin in); a built site has no bypass: the door is the e-mail link, for the resident agent `tracy-agent@tracy.ai` created by bootstrap (`tools/mint-admin.cjs`) and for the owner when `TRACY_OWNER_EMAIL` was set; `tools/configure-smtp.mjs --site <origin> --token-file data/tracy-agent.token` and `tools/admin-session.mjs --site <origin> --email tracy-agent@tracy.ai --out state.json` set up a local sign-in (in that order, mail catcher first; the full admin round-trip recipe is in `checks-and-recovery.md`). Data lives in `SITE_DATA_DIR` (default `./data`) and `./uploads`; `astro.config.mjs` creates both when missing. `.env.example` lists the variables (`EMDASH_ENCRYPTION_KEY` must be kept: losing it loses the plugin secrets; neither `clean-install.sh` nor `bootstrap-site.sh` creates it, so generate one, for example `openssl rand -hex 32`, and export it before a site stores plugin secrets). Export the variables yourself: the server does not read `.env`.

The Contact form is defined in `tools/forms.json` (`contact-en`) and bound to the `contact` entry `contact-layout` field `form_id` by `template.config.json` `forms.bindings`; `tools/seed-apply.mjs forms` creates it. Its notification address is a placeholder (`hello@ja-nova.example`); set the real one in the admin. Mail goes through the `emdash-smtp` plugin; production SMTP is configured in Admin > SMTP Providers, never from this repo.

Localhost setup differs from production: production needs `EMDASH_SITE_URL`, an SMTP provider and a real owner e-mail (`TRACY_OWNER_EMAIL`). Runtime credentials and keys are private installation state, never source assets. Before modifying a site, identify it: origin, data directory, and the process that serves it (`ps`, `HOST`/`PORT`), and never stop another site's process.
