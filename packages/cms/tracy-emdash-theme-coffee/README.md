# Tracy Coffee (`@tracy/emdash-theme-coffee`)

**Tracy Coffee** (template id `tracy-coffee`), copied from Tracy Base (PROVENANCE.md), is Tracy's EmDash template for a
coffee shop: an espresso-dark side it opens on and a milky cream side, Playfair Display headings over
Manrope text, one moss-green accent, capsule buttons. The home page scrolls around one 3D cup that the owner can replace with their
own object. Its demo content is **Ember Roasters**, an illustrative small-batch café. Pages: home (six
sections around the cup), menu (items grouped by the owner), about, blog (+ categories, topics,
articles), contact (real form), search, sitemap and 404. One locale (English); the code stays
locale-aware.

Identity, locale, form binding, mail defaults and the SEO audit policy live in `template.config.json`;
every tool reads that file, none of them hardcodes the demo shop.

Built with **EmDash 1.1.0** on **Astro 7** (SSR, Node adapter), **Tailwind CSS 4** and **shadcn/ui**.
Every piece of copy, every image, menu and figure is editable in the EmDash admin; the layout, the
section components are the template's. Design source:
documented in `PROVENANCE.md`; the shipped route table and architecture are in
`docs/architecture.md`, with the generated file inventory in `docs/generated/inventory.json`.

## Requirements

Node ≥ 22.16 (24.x used), pnpm 11 via corepack. Everything else is pinned in `package.json` +
`pnpm-lock.yaml`. Optional for local mail testing: Docker (Mailpit).

## Install and run (development)

```bash
pnpm install --frozen-lockfile
pnpm exec astro dev --port 4370 --host 127.0.0.1     # Astro 7 daemon: `astro dev status|logs|stop`
tools/bootstrap-site.sh http://127.0.0.1:4370 ./data # first-run setup, admin + agent token, schema/content/media/forms
```

`bootstrap-site.sh` is safe to rerun: it never passes `--force`. Content written by the first-run
setup is adopted (recorded, not rewritten) because it equals the seed; anything an editor changed or
left as a draft is kept and reported (exit 3 = entries need a decision: `seed-apply adopt` after
review, or an explicit `--force`).

The site answers at `http://127.0.0.1:4370`; admin at `/_emdash/admin` (development only:
`/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin` signs in as a dev admin). The agent token
lands in `data/tracy-agent.token` (mode 600, gitignored) and is what `tools/seed-apply.mjs` uses.
Every tool takes the site origin explicitly (`--site`, or the first argument) — there is no implicit
localhost site.

## Install and run (built)

```bash
pnpm install --frozen-lockfile
pnpm build
HOST=127.0.0.1 PORT=4371 node dist/server/entry.mjs &
tools/bootstrap-site.sh http://127.0.0.1:4371 ./data
```

`tools/clean-install.sh <dir> <port>` does all of that from a fresh copy of this directory — the
proof that the template rebuilds from what is committed. It only fills a new or empty directory
(never a symlink, never inside this tree or another project, never a busy port). It starts the server
detached: `lsof -ti tcp:<port> -sTCP:LISTEN` finds it; `server.log` in the new directory is its log.

## Sign in to the admin on a built site

A build has no dev bypass, so the door for a person or a script is the **email link**. Two admins
exist after bootstrap (`tools/mint-admin.cjs`): the resident agent `tracy-agent@tracy.ai`
(`TRACY_AGENT_EMAIL`) and, when `TRACY_OWNER_EMAIL` was set for the bootstrap, the site owner. Mail
must reach somewhere first — locally, Mailpit:

```bash
docker run -d --name tracy-coffee-mailpit -p 127.0.0.1:1125:1025 -p 127.0.0.1:8125:8025 axllent/mailpit
node tools/configure-smtp.mjs --site http://127.0.0.1:4371 --token-file data/tracy-agent.token --config template.config.json --host 127.0.0.1 --port 1125
node tools/admin-session.mjs --site http://127.0.0.1:4371 --email tracy-agent@tracy.ai --out admin-state.json --mailpit http://127.0.0.1:8125
```

Admin entry URLs are `/_emdash/admin/content/<collection>/<id>?locale=en` where `<id>` is the entry's
ULID: `GET /_emdash/api/content/<collection>/<slug>?locale=en` with `Authorization: Bearer
<data/tracy-agent.token>` and `X-EmDash-Request: 1` returns it as `data.item.id` (envelope
`{ success, data: { item, _rev } }`). Field controls in the editor carry `id="field-<fieldName>"`.

## Content and where it lives

- `seed/seed.json` — schema (8 collections, 2 taxonomies, 5 menus) and the demo content, edited by hand
  (the Base export it was first generated from is not part of this template); `seed/site-model.json`
  is read back from it with `node tools/from-emdash-seed.mjs`; `seed/field-map.json` lists
  every field, (Base's copy rewrites and slug renames, both unused here); `seed/media-map.json` +
  `seed/media/` are what the importer uploads (the seed carries no media). The 28 café pictures are
  under `seed/media/images/coffee/` (`how-drawn.md` there says how they were made).
- Singletons (one entry each, editable in the admin under their label): `site` (chrome, labels,
  404, search strings), `home`, `menu_page`, `blog`, `about`, `contact`.
- Collections: `posts` (`/blog/{slug}`, taxonomy `category`), `menu_items` (listed on `/menu`,
  taxonomy `menu_group`).
- Menus: `primary`, `resources_read`, `resources_help`, `footer_resources`, `footer_company`.
- Forms: `tools/forms.json` (contact form, five fields) — `seed-apply forms` creates it and writes the
  form id into `contact.form_id`.

## The 3D cup

`public/models/default-cup.glb` is the default cup, built from code by `node tools/build-cup.mjs`;
`src/assets/default-cup-still.webp` is its still image (`node tools/capture-default-still.mjs`).
What a replacement file must be, and how the home page shows it: `docs/object-template.md`. Controls
held fixed in this version (motion, camera angle, lid, ordering): `docs/kept-for-later.md`.

## Personalising a customer's copy

`seed/questions.json` (name · sector · address/hotline) and `seed/personalize.json` drive
`node tools/personalize.mjs --answers <file> --site <origin>`: identity fields are written from the
answers, the demo brand is replaced everywhere, claims (counts, prices, named people and clients,
milestones) are removed, and — with a model key — the shop copy is rewritten for the sector.
`--dry-run --json` prints the plan.

## Checks

`TRACY_CHECKOUT=<root of a tracy checkout> node --test tests/*.test.mjs` runs the kit's regression tests against a
mock EmDash API; the release tests need `TRACY_CHECKOUT` because `tools/release.mjs` imports two modules from that
checkout and stops without it. Acceptance on
a running site: `tools/shoot.mjs` (screens, overflow, console, images), `tools/audit.mjs` (routing
policy), `tools/admin-roundtrip.mjs`, `tools/recovery-check.mjs`, and distribution verification. The author-only full contract run requires separately supplied
source and contract files; see `docs/checks-and-recovery.md` for package recipient checks.

## Known limitations

- The source's Joomla-only pages (sign-in, account, authors, news feeds, wrapper, tag index, archive,
  layout fixtures) and Base's thirteen studio page kinds are not part of the template. Supported
  routes are listed in `docs/architecture.md`.
- The demo shop's email is a `.example` address and its social links are unconfigured on purpose.
- Ordering, table booking and a cart are not part of this version (`docs/kept-for-later.md`): the
  Menu page's Order button links wherever the owner points it.
