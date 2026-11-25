# JA Nova (`@tracy/emdash-theme-nova`)

**JA Nova** (template id `tracy-nova`) is Tracy's EmDash template for business and start-up sites. It is a port of JoomlArt's Joomla template JA Nova (release `quickstart/ja-nova/j6` 1.0.12): home (hero, feature bands, text sliders, stats, call-to-action), About, Services with six service pages, Career, Project lists by category with project pages, Contact form, blog (`/blog`, post pages with related posts), search, 404, and a light/dark theme switch. English only. Demo content: the JA Nova sample site.
Identity, form bindings, mail defaults and the SEO audit policy live in `template.config.json`; every tool reads it.

Built with **EmDash 1.1.0** on **Astro 7.4.12** (SSR, Node adapter) and **Tailwind CSS 4.3.3**. Font: Golos Text (local files in `src/fonts/`, OFL notice beside them). All copy, images, menus and figures are editable in the EmDash admin; the layout is the template's. Provenance: `PROVENANCE.md`; licence: `LICENSE` (GPL-2.0-or-later).

## Requirements

Node >= 22.23.4, pnpm via corepack (`pnpm@11.9.0`). Everything else is pinned in `package.json` + `pnpm-lock.yaml`. `tools/clean-install.sh` also needs `rsync` and `lsof` on the PATH and network access (it fetches fonts and packages). Signing in to the admin of a BUILT site (and so the admin round trip) needs a mail catcher on `127.0.0.1:1025` (SMTP) and `8025` (API): `docker run -d --name mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit`; without Docker any SMTP sink with Mailpit's search API will do. A development site (`astro dev`) needs none of this.

## Install and run (development)

```bash
pnpm install --frozen-lockfile
pnpm exec astro dev --port 4360 --host 127.0.0.1
tools/bootstrap-site.sh http://127.0.0.1:4360 ./data   # first-run setup: admin + agent token, schema, content, media, forms, search index
```

`bootstrap-site.sh` is safe to rerun: it never passes `--force`. Content an editor changed or left as a draft is kept and reported. The agent token lands in `data/tracy-agent.token` (ignored by git). Admin: `/_emdash/admin`.

## Install and run (built)

```bash
pnpm install --frozen-lockfile
pnpm build
mkdir -p data uploads
EMDASH_SITE_URL=http://127.0.0.1:4361 HOST=127.0.0.1 PORT=4361 node dist/server/entry.mjs &
tools/bootstrap-site.sh http://127.0.0.1:4361 ./data
```

`tools/clean-install.sh <dir> <port>` does all of that from a fresh copy of this directory. A built site has no dev bypass: sign in by the e-mail link (`docs/install.md`).

## Day to day

**Public addresses** (router `src/pages/[...path].astro`, page table `src/lib/page-routes.json`): `/`, `/about`, `/career`, `/services` and its six service pages, `/project` and `/project/<branding|ui-ux-design|illustration>`, projects at `/project/<category>/<slug>`, `/contact`, `/blog` (`?page=N`), posts at `/blog/<slug>`, `/search?q=`. An unknown path answers 404.

**Where a text lives.** Header, footer, labels and search words: Admin > the `chrome` entry. Page copy, posts and sections: `pages`, `posts`, `hero`, `features_intro`, `text_slider`, `cta`, `clients`, `teams`, `pricing`, `accordion`, `social`, `contact`. Words the template prints itself: `src/lib/ui-words.ts`. Identity, mail, forms and audit policy: `template.config.json`.

**Environment** (`.env.example`): `EMDASH_ENCRYPTION_KEY` (the local scripts do not create it: generate one, for example `openssl rand -hex 32`, before a site stores plugin secrets, and keep it with the backups), `EMDASH_SITE_URL`, `SITE_DATA_DIR`, `HOST`, `PORT`, `TRACY_OWNER_EMAIL`, `TRACY_OWNER_NAME`. The server does not read `.env` itself: export the variables. The code also reads `TRACY_CONTENT_API_SCALARS` (the Dockerfile sets it to 1) and `TRACY_FRAME_ANCESTORS` (demo sites only). `SITE_DATA_DIR` also holds the optional `ds-slot.css` (see `docs/design-system.md`).

## Personalize (the customer's answers)

`tools/personalize.mjs` writes a customer's answers into a site built from this template, by the map in `seed/personalize.json` and the questions in `seed/questions.json`. Run it from the site folder with `--site <origin> --token-file data/tracy-agent.token --answers-json '{...}'` (`--dry-run`, `--no-model`, `--json`).

## Where things live

| Path | What |
|---|---|
| `seed/seed.json` | schema (13 collections, taxonomy `category`, four menus) and the content; `seed/media/` and `seed/media-map.json` the pictures; `seed/site-model.json` the shaped model; `seed/content-api-map.json` the Content API map |
| `template.config.json` | identity, locales, form bindings, mail defaults, audit policy, theme switch for QA |
| `tools/forms.json` | the Contact form (`contact-en`) for the Forms plugin |
| `src/views/`, `src/components/` | one view per page family; blocks and site parts; page composition in `src/lib/page-layout.json` |
| `src/styles/` | `tokens.css` and `global.css` with `blocks/*.css` and `pages/*.css`; no reset, no admin styling |
| `src/fonts.json`, `src/fonts/` | font declarations and the Golos Text files |
| `ingest/`, `contract/` | rebuild of the seed from the source (`ingest/rebuild-seed.sh`) and the model validator |
| `tools/` | importer (`seed-apply.mjs`), acceptance (`qa.mjs`, `qa-contract.mjs`, `qa-receipt.mjs`, `distribution.mjs`), backup/restore, `recovery-check.mjs` |
| `docs/`, `AGENTS.md` | guidance for a maintenance agent |
| `source/`, `inventory/`, `DECISIONS.md`, `STATUS.md` | the source render recipe, decisions and state of the port: kept in the Tracy repository, NOT in this package; what a maintainer needs is in `docs/` and `docs/generated/` |

## Updating the template on a live site

```bash
S="--site http://127.0.0.1:4361 --token-file data/tracy-agent.token --receipts data/seed-receipts.json"
node tools/seed-apply.mjs status $S
node tools/seed-apply.mjs schema $S
node tools/seed-apply.mjs content $S --dry-run
node tools/seed-apply.mjs content $S
node tools/seed-apply.mjs media $S && node tools/seed-apply.mjs forms $S
```

`--force` resolves conflicts (seed and editor changed the same entry) in the seed's favour; entries only an editor changed are kept. Never run `emdash seed ... --on-conflict update` on a site with editors.

## Backup and restore

`tools/backup.sh [data] [uploads] [out]` snapshots SQLite, uploads, receipts and the token into `backups/`. `tools/restore.sh <archive> [data] [uploads]` (stop the site first) validates the archive before it moves the current state aside as `*.before-restore-<stamp>`. A backup holds the resident agent's token: keep it private.

## Checks

`node tools/qa.mjs --help` lists the acceptance run; `pnpm test` runs `node --test tests/*.test.mjs`; `pnpm typecheck` runs `astro check`. Audit of a running site: `node tools/audit.mjs http://127.0.0.1:4361 ./audit-out --roots /` (about a minute; it needs the two arguments). Admin round trip: the recipe in `docs/checks-and-recovery.md`.

## Known limitations

Not ported (`DECISIONS.md` D8): front-end accounts, Typography, Offline and Error demo pages, the Smart Search and Tagged Items utility pages. The port is in progress; see `STATUS.md`. Contact form notifications go to a placeholder address until the owner sets one.
