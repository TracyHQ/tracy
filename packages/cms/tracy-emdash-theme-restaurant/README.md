# JA Restaurant (`@tracy/emdash-theme-restaurant`)

**JA Restaurant** (template id `tracy-restaurant`) is Tracy's EmDash template for restaurants, bars and cafes. It is a
port of JoomlArt's Joomla template JA Restaurant (j6 1.0.6): home with slideshow, collage and testimonials, blog
(+ categories, Featured, Tagged, All Categories, Smart Search), chefs, gallery with albums, About us, Our History,
the menu page and three menu styles under it (simple, with image, two columns), Offers (Happy Hours), Phone Reservation, Contact and Subscribe forms, 404. English only.
Identity, form bindings, mail defaults and the SEO audit policy live in `template.config.json`; every tool reads it.

Built with **EmDash 1.1.0** on **Astro 7.4.12** (SSR, Node adapter), **Tailwind CSS 4.3.3**. All copy, images, menus and
figures are editable in the EmDash admin; the layout is the template's. A dark theme (derived from the source palette) is reachable through the ◐ toggle. Provenance: `PROVENANCE.md`.

## Requirements

Node ≥ 22.23.4, pnpm via corepack. Everything else is pinned in `package.json` + `pnpm-lock.yaml`. Network access for
the install and the build: `pnpm install` fetches the packages, and `astro build` downloads the template's web fonts
from Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`); a fetch that fails stops the build, and running it
again usually passes. Optional for local mail testing: Docker (Mailpit).

## Install and run (development)

```bash
pnpm install --frozen-lockfile
pnpm exec astro dev --port 4360 --host 127.0.0.1
tools/bootstrap-site.sh http://127.0.0.1:4360 ./data   # first-run setup: admin + agent token, schema, content, media, forms
```

`bootstrap-site.sh` is safe to rerun: it never passes `--force`. Content an editor changed or left as a draft is
kept and reported (exit 3 = entries need a decision: `seed-apply adopt` after review, or an explicit `--force`).
The agent token lands in `data/tracy-agent.token` (mode 600, ignored by git). Every tool takes the site origin
explicitly (`--site`), except `tools/personalize.mjs`, which falls back to `$TEMPLATE_SITE` or `http://127.0.0.1:4321`:
always pass `--site` to it. Admin: `/_emdash/admin`.

## Install and run (built)

```bash
pnpm install --frozen-lockfile
pnpm build
EMDASH_SITE_URL=http://127.0.0.1:4361 HOST=127.0.0.1 PORT=4361 node dist/server/entry.mjs &
tools/bootstrap-site.sh http://127.0.0.1:4361 ./data
```

`tools/clean-install.sh <dir> <port>` does all of that from a fresh copy of this directory. It only fills a new or empty
directory and checks that before writing anything; `server.log` in the new directory is the server's log, and
`install.log` and `build.log` hold the whole output of the install and the build (the terminal shows their end). When a
step fails, the script prints the last 40 lines of its log and stops; the directory then holds the copy, and a second
run refuses it (it never deletes). Finish it in place (`cd <dir> && pnpm exec astro build`, then start the server and run
`tools/bootstrap-site.sh` as the built steps above say), or remove the directory and run the script again.

## Sign in to the admin on a built site

A build has no dev bypass; the door is the **email link**. The resident agent `tracy-agent@tracy.ai` exists after
bootstrap (`tools/mint-admin.cjs`), and the owner too when `TRACY_OWNER_EMAIL` was set. Locally, with Mailpit:

```bash
docker run -d --name rs-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit
node tools/configure-smtp.mjs --site http://127.0.0.1:4361 --token-file data/tracy-agent.token --host 127.0.0.1 --port 1025
node tools/admin-session.mjs --site http://127.0.0.1:4361 --email tracy-agent@tracy.ai --out admin-state.json
```

`admin-session.mjs` saves a Playwright storage state that `admin-roundtrip.mjs`, `forms-check.mjs` and
`qa.mjs --storage-state` reuse.

The ports 1025 and 8025 above are Mailpit's defaults. A second site on the same machine with its own Mailpit takes other
ports for both (`-p 127.0.0.1:1026:1025 -p 127.0.0.1:8026:8025`), and its commands follow: `configure-smtp.mjs --port 1026`
and `admin-session.mjs --mailpit http://127.0.0.1:8026` (see Tool notes for `forms-check.mjs`).

`admin-session.mjs` writes a live session cookie into its `--out` file (`admin-state.json` above): delete that file when
the checks are done.

## Personalize (the customer's answers)

`tools/personalize.mjs` writes a customer's answers into a site built from this template: the name, the language, the
contact lines, and (with a text model) the words of the pages. Run it from the site folder:

```bash
node tools/personalize.mjs --site <origin> --token-file data/tracy-agent.token \
  --answers-json '{"name":"Test Bistro","sector":"restaurant","contact":"1 Main St, Springfield · +1 555 0100"}' \
  [--dry-run] [--no-model] [--json]
```

**Answer keys** are the question ids of `seed/questions.json`: `name`, `languages` (a list of locale codes), `sector`,
`contact` and `email`. `contact` is one line that carries the address and the phone together ("4 5th Avenue, Brooklyn, NY
11217 · +1 718 555 0110"): the tool reads the phone and the address out of it. There are no `phone` or `address` keys; such
keys are ignored. Tracy's brief can also give `about` (what the business does: the model rewrites the page words only when
it is given), `hours` and `social`.

**The demo's address.** With an address in `contact`, the footer address, the contact card and the footer map link take
the customer's, and the demo's place leaves the page words, with or without a model: only the place phrase goes, with the
word that ties it to the sentence ("Opened in 1982 at 4 5th Avenue" reads "Opened in 1982", "Four decades on 5th Avenue"
reads "Four decades"). When the place is a core part of its sentence ("has welcomed Brooklyn to …", "a Brooklyn favourite"), the whole sentence goes instead, and no word is put in its place; a sentence also goes when nothing readable is left of it. A heading, a picture's caption
or alt text is never left empty: it falls back to the item's year, else the page's title, else the brief's `name`, never
to the demo's place; with none of them it keeps its words, and the report names it (`skipped`, rule `places-kept`). The
brief's own values are never the demo's place: with the name "Brooklyn Bistro", "Welcome to Brooklyn Bistro" stays whole,
and the demo's own "Brooklyn" elsewhere still goes (a sentence where it is a core part goes whole, as for any name). With no
address, the demo's address, its map link and those words stay, as a placeholder (`unanswered: keep-demo` in
`seed/personalize.json`).
No field is left empty: a short field whose only sentence goes takes the entry's title or the customer's name (with an
address, the Our History timeline intro, "From a twelve-table neighborhood bar to a Brooklyn favourite: …", reads "Our
History"), and a longer one with nothing left keeps its words and is named in the report (`skipped`, rule `places-kept`). A detachable place can leave a phrase shorter than the demo's ("to the people of Brooklyn" reads "to the
people"). To read every such change, open the report (`--json`): its `skipped` line with rule `places` names each field
that held the demo's place and lists `changes`, one `{ field, before, after }` per field. A field that changed for
another reason (a phone) is not listed there. "Fulton market", "Hudson Valley" and "New York" stay on purpose: they name
where a dish or its produce comes from (the menu and the posts), not where the restaurant is.

**The demo's phone and e-mail.** A phone in `contact` replaces the demo's in every field of every page, with or without
an address: the tool finds the demo's number by its digits, in any spelling ("(084) 555-0110", "084 555 0110", a
non-breaking space) and in `tel:` links, so it reaches the contact card, the phone reservation page, the Call Now link,
the footer's Phone line and the Happy Hours info line of `/offers` (`happyhours.hp_other_info`), which no rule names.
The demo's web address and e-mail (`res-restaurant.example`, as a whole host or a subdomain of it, never inside another
host such as `notres.example`) go with it: a sentence or line that holds them goes, and a
`mailto:` link to them leads nowhere; the brief's `email` replaces the demo's e-mail where it is given. The demo's second
numbers go beside it too (the card's mobile line, the footer's Fax line). After writing, the tool scans every field for
the demo's phone and web address and reports each one left as an error (`contacts-left`, exit 4). With no phone, no
address and no e-mail, the demo's contacts stay as a placeholder.

**The demo's brand.** "RES" is renamed as a whole word ("Lunch at RES" reads "Lunch at Test Bistro"), never inside a
longer word (RESERVATIONS, FRESH) or the demo's lowercase web address. The header and footer logo is a picture of the
demo's brand (`public/brand/logo.png`, `small-logo.png`): the words cannot rename it. Give the customer's logo with
`--logo-file` (and `--logo-dark-file`), or replace it by hand in the admin: Settings › Logo (core `settings.logo`) and the
`logo_dark` image of the chrome entry. Until then the demo's logo shows. The opening hours of the top bar and the footer stay the demo's: the questionnaire asks for none,
and they go only with the demo's other claims when the brief describes the business (`about`).

**Model.** The page words are rewritten by a text model when one is configured: `OPENROUTER_API_KEY`, or
`DEEPSEEK_API_KEY`, or `TRACY_MODEL_URL` with `TRACY_MODEL_KEY` and `TRACY_MODEL_NAME` (an OpenAI-compatible door).
Without one, or with `--no-model`, the demo's words stay (renamed) and only the facts above change. `--dry-run` lists the
entries and fields the facts and the renaming would change, not the values, and not what the model or the demo-place
pass would change; run it on a copy of the site to see the values.

**Exit codes:** 0 everything written; 3 some page words were not rewritten (no model, `about` blank, or the model gave
no usable text), the facts are written, and a `--dry-run` that would leave them so exits 3 too (it writes nothing); 4 a
write failed (the report's `errors`); 2 usage; 1 the tool stopped. The report's `unanswered` names each placeholder kept
and why ("no address in the contact answer" for a `contact` that gives only a phone).

## Day to day

**Public addresses** (the router reads `src/lib/page-routes.json`): `/`, `/blog`, `/about-us`, `/about-us/our-history`, `/gallery` (albums under it; the Chefs page is the post `chefs` at `/pages/chefs`), `/menu` (also `/menu/simple-menu`, `/menu/menu-with-image`, `/menu/2-column-menu`), `/offers`, `/contact/contact-us`, `/contact/phone-reservation`, `/explore/j-pages/featured-articles`, `/explore/j-pages/tagged-items`, `/explore/j-pages/all-categories`, `/explore/j-pages/smart-search`; posts live at `/<first category slug>/<slug>`. Bare `/contact` is not a page and answers 404. The full list is in `src/lib/page-routes.json`.

**Where a text lives.** Header and footer words, the top bar and the opening hours: Admin → Site chrome (`chrome.topbar_text`, `chrome.footer_hours`). Page bodies, posts, slides, menu cards, chefs, offers and testimonials: their collections in the admin. Words the template prints itself (buttons, labels in other languages): `src/lib/ui-words.ts`, code. Identity, mail, forms and audit policy: `template.config.json`.

**Add or hide a page.** A page exists at an address only if `src/lib/page-routes.json` lists it. To hide one, unpublish its entry in Pages and remove it from the `primary` menu in the admin. To add one, create the Pages entry and add its row (`path`, `slug`, `view`) to `src/lib/page-routes.json`, then rebuild; the file is generated by `ingest/build-route-table.mjs` from a source model that is not shipped, so edit it by hand in an installed copy.

**Environment** (`.env.example`): `EMDASH_ENCRYPTION_KEY`, `EMDASH_SITE_URL`, `SITE_DATA_DIR`, `HOST`, `PORT`, `TRACY_OWNER_EMAIL`, `TRACY_OWNER_NAME`. The code also reads `TRACY_FRAME_ANCESTORS` (the origins allowed to frame the site, set by Tracy's proxy) and `TRACY_CONTENT_API_SCALARS=1` (set in the Dockerfile; turns on the Content API reader). The server does not read `.env` itself: export the variables.

**Tool notes.** `tools/admin-roundtrip.mjs --entry` takes the admin address of an entry, `/_emdash/admin/content/<collection>/<id>`, and `--field` the input id the admin draws (`field-title` for a title). The entry's id is `data.item.id` of `curl -H "Authorization: Bearer $(cat data/tracy-agent.token)" -H 'X-EmDash-Request: 1' "<origin>/_emdash/api/content/<collection>/<slug>?locale=en"`. `tools/admin-session.mjs` and `tools/forms-check.mjs` expect Mailpit on `127.0.0.1:8025` (`admin-session.mjs --mailpit <url>` overrides it; `forms-check.mjs` has no option and reads `127.0.0.1:8025` only: if that port is taken, free it or run a copy of the tool with the port replaced; `configure-smtp.mjs --port` must point the site at the same Mailpit's SMTP port, and `admin-session.mjs --mailpit` at its web port). `tools/artifact.mjs [out]` takes the output path as its first argument: do not pass `--help`. `tools/recovery-check.mjs` restarts the site from `dist/` and leaves it running (stop it with `kill $(lsof -ti tcp:<port>)`; example call: `node tools/recovery-check.mjs --site <origin> --collection posts --slug <slug> --field title --public <public path> --out <report.json>`, where `--field` is the data field, not the input id; a post answers at its `path` field (for example `/restaurant-business/4-habits-that-can-improve-your-customer-service`), which is also the link of its card on `/blog`: `curl -H "Authorization: Bearer $(cat data/tracy-agent.token)" -H 'X-EmDash-Request: 1' "<origin>/_emdash/api/content/posts?locale=en"` lists each post's `slug` and `data.path`) and leaves `data.before-restore-*` and `uploads.before-restore-*` beside the site. The browser tools use Playwright, which `pnpm install` puts in the installed site only (not in the package folder), and its Chromium: run `pnpm exec playwright install chromium` once in the site folder, or set `RENDER_CHROME_PATH` to another executable. Playwright keeps its browsers in `.cache/ms-playwright` in your home folder (about 660 MB with its headless shell and ffmpeg), not in the site folder: removing the site leaves them behind; remove them with `pnpm exec playwright uninstall --all` (from a site folder), or delete that folder. A worked example of each recipient command, `audit.mjs` included, is in `docs/checks-and-recovery.md`.

**Known limits.** `/sitemap.xml` answers an empty sitemap index (the site has no sitemap source); robots.txt still points to it. A backup archive holds the resident agent's token: keep it private. Only the resident agent exists as an admin unless `TRACY_OWNER_EMAIL` was set before the first bootstrap.

## Where things live

| Path | What |
|---|---|
| `seed/seed.json` | schema (21 collections, taxonomies, menu `primary`) and the content; `seed/media-map.json`, `seed/media/` the 66 pictures; `seed/questions.json`, `seed/personalize.json` the personalization questionnaire |
| `template.config.json` | identity, locales, content order, form bindings, mail defaults, audit policy |
| `tools/forms.json` | the Contact and Subscribe forms for the Forms plugin |
| `src/views/`, `src/components/` | one view per page family; page composition is code |
| `src/styles/` | tokens (light + dark) and the template's CSS; no reset, no admin styling |
| `ingest/`, `contract/`, `compile.config.json` | rebuild of the seed from the source (`rebuild-seed.sh`, needs the source stand described there), the contract builder and the model validator |
| `tools/` | importer (`seed-apply.mjs`), acceptance (`qa.mjs`, `qa-contract.mjs`, `qa-receipt.mjs`, `distribution.mjs`), evidence for the review gates, backup/restore |
| `docs/`, `AGENTS.md` | guidance for a maintenance agent; `docs/generated/` is produced by `node tools/generate-docs.mjs` |
| `artifact.json` | manifest for a later integration — `node tools/artifact.mjs` |
| `qa.contract.json`, `source/`, `inventory/` | the acceptance contract, the mirror of the source site and its inventory: kept in the template's repository, not part of the shipped folders; the tools that need them (`qa.mjs`, `visual-qa.mjs`) are for the repository checkout |

## Editing content

Admin → **Site chrome**, the page-section collections (Slideshow, Menu, Teams, …), **Posts** and **Pages** hold the
copy with labelled fields; pictures come from the media library. Save writes a draft; **Publish changes** puts it on
the public site.

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
changed are kept. Never run `emdash seed … --on-conflict update` on a site with editors.

## Backup and restore

`tools/backup.sh [data] [uploads] [out]` snapshots SQLite, uploads, receipts and the token into
`backups/tracy-restaurant-<stamp>.tgz`. `tools/restore.sh <archive> [data] [uploads]` — stop the site first — validates
the whole archive before it moves the current state aside as `*.before-restore-<stamp>`.

## Mail

Forms notify the address in `template.config.json → mail` (demo: `hello@res-restaurant.example`) through the
`emdash-smtp` plugin. Production SMTP is configured in Admin → SMTP Providers, never from this repo. A local Mailpit
pass says nothing about production deliverability.

## Environment

See `.env.example`. Development needs nothing. A deployed site sets `EMDASH_ENCRYPTION_KEY` and `EMDASH_SITE_URL`.

## Checks

`node tools/qa.mjs --help` lists the acceptance run; `pnpm test` runs the kit and template tests. About 50 of them
launch a browser: install Playwright's Chromium once in the site folder first (`pnpm exec playwright install chromium`;
it goes to `.cache/ms-playwright` in your home folder, not the site folder; see Tool notes to remove it).
The cases that need the Tracy repository (`TRACY_CHECKOUT`, or the contracts under `contracts/`, which are not shipped)
skip and say why. Evidence of the port
is in `docs/checks-and-recovery.md`.

## Known limitations

Not ported: visitor login/registration/profile pages, demo pages, colour demos. Not drawn:
third-party extensions (Vik Restaurants, OpenTable, Maps), Most Read, Smart Search advanced panel, Tagged Items filter
bar. The questionnaire translations were made by Claude. The dark theme has no source to compare with.
