# Installation

## Commands

Node >= 22.16 and pnpm 11.9.0 (corepack); versions are pinned in `package.json` and `pnpm-lock.yaml`. From an empty
destination, with a copy of this package in it:

```bash
pnpm install --frozen-lockfile
pnpm build                                              # Astro SSR, adapter @astrojs/node (standalone)
EMDASH_SITE_URL=http://127.0.0.1:4361 HOST=127.0.0.1 PORT=4361 node dist/server/entry.mjs &  # start
tools/bootstrap-site.sh http://127.0.0.1:4361 ./data    # explicit origin and data directory
```

`tools/clean-install.sh <new-dir> <port>` does the same from a copy of the package and refuses a used directory or a
busy port. `bootstrap-site.sh` never passes `--force`; exit 3 means entries need a decision (see `content-api.md`). It
also switches on the full-text search index for the collections that declare `search` support.

## Paths and environment

- Data: `$SITE_DATA_DIR` (default `./data`): SQLite `data.db`, `seed-receipts.json`, `tracy-agent.token` (mode 600),
  and the optional `ds-slot.css`. Media: `./uploads`. Both are private installation state, ignored by git, never part of
  a source distribution.
- Environment: copy `.env.example` to `.env`. `EMDASH_ENCRYPTION_KEY` (plugin secrets at rest; losing it loses them),
  `EMDASH_SITE_URL` (public origin behind a proxy), `SITE_DATA_DIR`, `HOST`, `PORT`, optional `TRACY_OWNER_EMAIL` /
  `TRACY_OWNER_NAME` (the owner becomes an admin on bootstrap). The Node server does not read `.env` by itself: export
  the variables or load the file in the process manager.

## Authentication

A build has no development bypass. The door is the email link: `/_emdash/admin/login` > *Sign in with email link*. The
resident agent `tracy-agent@tracy.ai` exists after bootstrap. For scripts: `tools/admin-session.mjs --site <origin>
--email tracy-agent@tracy.ai --out <private json>` signs in through the mailbox (SMTP must reach a mailbox first:
`tools/configure-smtp.mjs`, locally Mailpit on `127.0.0.1:1025`, web on `127.0.0.1:8025`) and saves a Playwright storage
state. Production SMTP is configured in the admin (SMTP Providers), never in the repository.

## Forms

Two Forms-plugin forms (`tools/forms.json`): `contact-en` and `subscribe-en`, bound by
`template.config.json -> forms.bindings`: `contact-en` into the `contact` entry (`form_id`), `subscribe-en` into the
`chrome` entry (`form_id`, the newsletter band under every page). They are created by `seed-apply.mjs forms`.
Notifications go through `emdash-smtp`; the sender is `template.config.json -> mail`. The subscribe form stores
submissions only.

## Who is who

Before changing anything identify the site: its origin, its data directory and the process owner. Several sites can share
a machine; never touch another site's `data/` or `uploads/`. Runtime credentials and encryption keys are private
installation state, never source assets.

The examples use port 4361; use any free port and give the same origin to `EMDASH_SITE_URL`, `PORT` and the bootstrap.
`tools/clean-install.sh <new target dir> <port>` does all of this in one command for a throw-away site.
