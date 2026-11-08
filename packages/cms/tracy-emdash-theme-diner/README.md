# JA Diner (`@tracy/emdash-theme-diner`)

**JA Diner** (template id `tracy-diner`) is Tracy's EmDash template for restaurants and diners. It is a port of
JoomlArt's Joomla template JA Diner (j6 1.0.5): home with slideshow, intro blocks, tabbed dish menu and chefs; blog
(`/our-blog`, four category lists, post pages with sidebar); About us; Offers (Happy Hours); Reservation; Contact form;
search; 404. English only. Demo content: the JA Diner sample site.
Identity, form bindings, mail defaults and the SEO audit policy live in `template.config.json`; every tool reads it.

Built with **EmDash 1.1.0** on **Astro 7.3.3** (SSR, Node adapter), **Tailwind CSS 4.3.3**. Fonts: Work Sans (Google
provider) and Eczar (local woff2 in `src/fonts/`). All copy, images, menus and figures are editable in the EmDash admin;
the layout is the template's. A dark theme is derived from the source palette (it has no source to compare with).
Provenance: `PROVENANCE.md`.

## Requirements

Node >= 22.16, pnpm via corepack (`pnpm@11.9.0`). Everything else is pinned in `package.json` + `pnpm-lock.yaml`.
Optional for local mail testing: Docker (Mailpit).

## Install and run (development)

```bash
pnpm install --frozen-lockfile
pnpm exec astro dev --port 4360 --host 127.0.0.1
tools/bootstrap-site.sh http://127.0.0.1:4360 ./data   # first-run setup: admin + agent token, schema, content, media, forms, search index
```

`bootstrap-site.sh` is safe to rerun: it never passes `--force`. Content an editor changed or left as a draft is kept
and reported (exit 3 = entries need a decision). The agent token lands in `data/tracy-agent.token` (mode 600, ignored
by git). Admin: `/_emdash/admin`.

## Install and run (built)

```bash
pnpm install --frozen-lockfile
pnpm build
EMDASH_SITE_URL=http://127.0.0.1:4361 HOST=127.0.0.1 PORT=4361 node dist/server/entry.mjs &
tools/bootstrap-site.sh http://127.0.0.1:4361 ./data
```

`tools/clean-install.sh <dir> <port>` does all of that from a fresh copy of this directory. It checks that the target is
new or empty before writing anything.

## Sign in to the admin on a built site

A build has no dev bypass; the door is the email link. The resident agent `tracy-agent@tracy.ai` exists after bootstrap
(`tools/mint-admin.cjs`), and the owner too when `TRACY_OWNER_EMAIL` was set. Locally, with Mailpit:

```bash
# skip this line when a Mailpit already listens on 127.0.0.1:8025 / :1025
docker run -d --name diner-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
node tools/configure-smtp.mjs --site http://127.0.0.1:4361 --token-file data/tracy-agent.token --host 127.0.0.1 --port 1025
node tools/admin-session.mjs --site http://127.0.0.1:4361 --email tracy-agent@tracy.ai --out admin-state.json
```

`admin-session.mjs` saves a Playwright storage state that `admin-roundtrip.mjs`, `forms-check.mjs` and
`qa.mjs --storage-state` reuse. `forms-check.mjs` reads Mailpit on `127.0.0.1:8025` only.

## Day to day

**Public addresses** (the router is `src/pages/[...path].astro`, the page table `src/lib/page-routes.json`): `/`,
`/our-blog` (12 per page, `?page=N`), `/about-us`, `/offers`, `/reservation`, `/contact-us`, `/search?q=`, the four
category lists (`/restaurant-news`, `/restaurant-business`, `/restaurant-marketing`, `/restaurant-guide`), and posts at
`/<category>/<slug>`. An unknown path answers 404 with the 404 view.

**Where a text lives.** Header, footer, newsletter band and search words: Admin > the `chrome` entry. Page bodies, posts,
slides, menu lists, chefs and offers: their collections in the admin (`pages`, `posts`, `slideshow`, `features_intro`,
`container_tabs`, `menu`, `happyhours`, `teams`, `modules`, `masthead`, `category_info`, `contact`, `reservation`).
Words the template prints itself: `src/lib/ui-words.ts`. Identity, mail, forms and audit policy: `template.config.json`.

**Environment** (`.env.example`): `EMDASH_ENCRYPTION_KEY`, `EMDASH_SITE_URL`, `SITE_DATA_DIR`, `HOST`, `PORT`,
`TRACY_OWNER_EMAIL`, `TRACY_OWNER_NAME`. The server does not read `.env` itself: export the variables. The code also
reads `TRACY_CONTENT_API_SCALARS` (the Dockerfile sets it to 1; turns on the Content API reader). `SITE_DATA_DIR` also
holds the optional `ds-slot.css` (see `docs/design-system.md`).

## Where things live

| Path | What |
|---|---|
| `seed/seed.json` | schema (14 collections, taxonomy `category`, menu `primary`) and the content; `seed/media/` and `seed/media-map.json` the pictures; `seed/questions.json`, `seed/personalize.json` the personalization questionnaire; `seed/content-api-map.json` the Content API map |
| `template.config.json` | identity, locales, content order, form bindings, mail defaults, audit policy |
| `tools/forms.json` | the Contact (`contact-en`) and Subscribe (`subscribe-en`) forms for the Forms plugin |
| `src/views/`, `src/components/site/` | one view per page family; page composition is code |
| `src/styles/` | `tokens.css` (light + dark) and `global.css` with `pages/*.css`; no reset, no admin styling |
| `src/fonts.json`, `src/fonts/` | font declarations; Eczar woff2 files |
| `ingest/`, `contract/` | rebuild of the seed from the source (`ingest/rebuild-seed.sh`), the contract builder and the model validator |
| `tools/` | importer (`seed-apply.mjs`), acceptance (`qa.mjs`, `qa-contract.mjs`, `qa-receipt.mjs`, `distribution.mjs`), backup/restore, `recovery-check.mjs`, `forms-check.mjs` |
| `docs/`, `AGENTS.md` | guidance for a maintenance agent |
| `qa.contract.json`, `source/`, `inventory/`, `evidence/` | the acceptance contract, the source mirror, its inventory and the acceptance evidence: repository checkout only, not shipped |
| `DECISIONS.md`, `STATUS.md` | decisions taken and the state of the port |

## Editing content

Admin > the `chrome` entry, the section collections, **Posts** and **Pages** hold the copy with labelled fields;
pictures come from the media library. Save writes a draft; **Publish changes** puts it on the public site.

## Updating the template on a live site

```bash
S="--site http://127.0.0.1:4361 --token-file data/tracy-agent.token --receipts data/seed-receipts.json"
node tools/seed-apply.mjs status $S
node tools/seed-apply.mjs schema $S
node tools/seed-apply.mjs content $S --dry-run
node tools/seed-apply.mjs content $S
node tools/seed-apply.mjs media $S && node tools/seed-apply.mjs forms $S
```

`--force` resolves conflicts (seed and editor changed the same entry) in the seed's favour; entries only an editor
changed are kept. Never run `emdash seed ... --on-conflict update` on a site with editors.

## Backup and restore

`tools/backup.sh [data] [uploads] [out]` snapshots SQLite, uploads, receipts and the token into
`backups/tracy-diner-<stamp>.tgz`. `tools/restore.sh <archive> [data] [uploads]` — stop the site first — validates the
whole archive before it moves the current state aside as `*.before-restore-<stamp>`. A backup archive holds the resident
agent's token: keep it private. `tools/recovery-check.mjs` proves the round trip on a running site.

## Mail

Forms notify the address in `template.config.json -> mail` (sender `no-reply@ja-diner.example`) through the
`emdash-smtp` plugin. Production SMTP is configured in Admin > SMTP Providers, never from this repo. A local Mailpit
pass says nothing about production deliverability.

## Checks

`node tools/qa.mjs --help` lists the acceptance run; `pnpm test` runs `node --test tests/*.test.mjs`; `pnpm typecheck`
runs `astro check`. The acceptance evidence is kept in the repository checkout, not in the package; verify a package with
`node tools/distribution.mjs verify <package dir>`; the commands for the audit, the admin round trip and the backup are in
`docs/checks-and-recovery.md`.

## Known limitations

Not ported (`DECISIONS.md` D6, D13, D14): front-end accounts (login, registration, profile), Typography, Offline and
Error demo pages, the four "Home - colour" demos, AcyMailing (the newsletter band is a Forms-plugin form that stores
submissions only), the Joomla login module, Advanced Search. The search page shows a results state where the source
shows its empty state. The questionnaire translations were made by Claude.
