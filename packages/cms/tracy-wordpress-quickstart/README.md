# tracy-wordpress-quickstart

The WordPress mirror of `packages/cms/tracy-joomla-quickstart`: where the **content contracts** of a
published WordPress quickstart are authored, one directory per `<design>/<platform major>/<version>`.

A contract binds one published archive (`quickstarts.json`, platform `wordpress`) to the content a
Build writes and the design baseline a change is compared against — a content recommendation, not a
lock (ADR 0022): reuse the quickstart's sections and styles, keep new text at 0.75×–1.25× the length
it replaces (a warning, never a refusal). The seeder ships every directory here as
`dist/data/quickstart-contracts/…` (`packages/cms/tracy-seeder/scripts/build.mjs`), and the Build's
stages read it there (`packages/site/tracy-site-build-wordpress/src/host/stages.mjs`).

## Layout

```
contracts/<design>/wp<major>/<version>/
  manifest.json           package identity, archive checksums, the minimum Claude Cowork plugin version
  content-map.json        entities (options, theme mods, synced patterns) and the slots a Build may write
  presentation-lock.json  the design baseline: options, theme mods and theme file hashes
```

## Authored versus generated

| File | Authored | Generated |
|---|---|---|
| `manifest.json` | id, theme, platform, `coworkMinVersion`, `mode` | `quickstart.parts.*.bytes/sha256` from `SHA256SUMS` when the release is packed |
| `content-map.json` | everything — each slot names the WordPress object it lands in | nothing |
| `presentation-lock.json` | the option and theme-mod tables | `files` (sha256 of the shipped theme) at pack time |

`tracy-base/wp7/1.0.0` is the first contract. Its slots are deliberately few: site name and tagline,
logo, contact email/phone/address, the front-page hero heading, paragraph and "Talk to sales" call
to action. A pattern block is addressed by `metadata.name` exactly as
`packages/cms/tracy-wordpress-theme/overlays/tracy-base/patterns.map.json` names it (`hero.title`,
`hero.lead`, `hero.btn-1`, `contact-information.email`), never by position.

## What differs from the Joomla one

- **No Claude Cowork plugin pin.** The Joomla contracts are also shipped inside the Claude Cowork plugin package, so
  `quickstarts.json` pins the Claude Cowork plugin and hashes the contract files. The WordPress Cowork plugin is
  installed at provision time as the latest release the `claude-cowork` manifest names, never below
  `coworkMinVersion`; the contract lives only here and in the seeder. (`tasks/todo-wordpress-theme-skill.md` Q6.)
- **No `content.contract` door.** The WordPress plugin does not bind a contract. The seeder writes the
  slots itself through the seat door (`content.update` on options and `wp_block` posts); the Build's
  `check` stage verifies the plugin version against the floor and that the contract is shipped.

## Known gaps in 1.0.0

- `contact.phone` and `contact.address` have no block in the Tracy Base contact-information pattern.
  They are written as options (`tracy_contact_phone`, `tracy_contact_address`) the theme does not
  read yet, so they are preserved but not rendered.
- `site.logo` needs a theme-mod write the seat door does not offer; the seeder reports the slot as
  not written.
- `presentation-lock.json.files` and the archive checksums are empty until the release exists.

## Release scripts (`scripts/`)

The next version of a published quickstart is made from the published one, by re-runnable scripts
kept here — the WordPress mirror of `tracy-joomla-quickstart/scripts/`. They work on a **stand**: a
local WordPress (`scripts/stand-compose.yml`: MariaDB, `wordpress:apache`, a wp-cli runner) whose
webroot lives in a folder you name, outside the repo.

| Step | Script | What it leaves |
|---|---|---|
| 1. Restore | `node scripts/restore-release.mjs --stand <dir> --version 1.2.0` | the published version (`tracy-business/wp7` unless `--release`) running on `http://127.0.0.1:8291`, restored by the vendored method's own `restore.mjs` (used, not modified) |
| 2. Change | `node scripts/apply-base-changes.mjs --stand <dir>` | our base changes on that stand; a second run reports `0 changed` |
| 3. Pack and prove | `node scripts/pack-and-verify.mjs --stand <dir> --verify <dir> --version 1.2.0` | `<stand>/cut/<version>/`: the method's `pack.mjs` archives, their restore on a second, clean stand (`http://127.0.0.1:8292`) and `parity.json` between the two |

`--version` has no default in steps 1 and 3 — both refuse to run without it — so the version
restored and the version the pack is labelled cannot silently differ.

`restore-release.mjs` downloads the version's archives with `gh` on every run, over whatever an
earlier run left in `<stand>/release/<version>/` (a re-cut release keeps its asset names), and
packs them with the lines of the release's own `SHA256SUMS` that name them (the release lists
every version's assets, and the method refuses a pack with a listed file missing). A version the release's `manifest.json` does not
describe yet (1.2.0 was cut by hand, and the release's declaration files still name 1.1.0) is
restored from a manifest built on the machine from this package's contract profile of that
version: the downloaded archives must match the bytes and sha256 its `quickstart.parts` records,
or the restore stops.

`apply-base-changes.mjs` (with `apply-base-changes.php`, run inside WordPress) puts this branch's
built `wp-tracy-business` theme into the webroot — the profile's presentation lock pins those
files — and changes the database: every language's Contact card becomes the rows drawn from the
site identity; form 25 gets the neutral request types, the generic description hint and the added
upload types; the Russian Contact page embeds form 25 and form 303 goes; a Sitemap page and a
`footer-legal` menu, titled with the language's "Sitemap" word, are added in every language; the
database footer part gets the footer's Sitemap navigation; the database header part's dark-mode
label becomes "Dark", as in the theme file; every language's home page trades the news band's three
typed cards (copies of three posts, "Read more" going to `#`) for the theme pattern's Query Loop of
the page language's three latest posts, its head (heading, "View all") kept. The demo company outside every slot becomes identity tokens that hide when empty: the Contact page's side column (map and branches gone, social profiles from the identity), and the name, mailboxes, phone and address of the careers, investor, email, newsletter, slide and form pages; page excerpts naming the company go, and so does the company word in the posts' author name. `--keep-theme` leaves the released theme in place for a content-only cut (1.3.1 and 1.3.2 on 1.3.0). Every step writes only
what differs, so it is re-run as is on a later cut of the published `tracy-business/wp7` 1.2.0.

⚠ **The news band step changes what the contract may write.** The committed `1.2.0` profile still
names fifteen `home.news.item.<n>.*` slots (text and image of the three typed cards) — it is the
profile of the archive cut by hand on 24/09, and its bytes are pinned by the Claude Cowork plugin
that carries it (`quickstarts.json` → `cowork.alsoCarries`, checked by the `contracts` gate). The
profile of the next cut must drop those slots and keep `home.news.heading` and `home.news.cta.1`:
the cards are the posts now, and a post is written as a post. Left in, they stop the cut where it
should stop — `capture-inventory.mjs` masks every slot with the seeder's `setBlockValue`, which
refuses a block the page no longer has ("block news.item.1.meta is not in this pattern").

**Demo copy edits for the next cut (`content-edits/`).** A webroot + database cut ships the
published dump as it is, so a defect in the demo words themselves is recorded as a literal edit:
`content-edits/<design>-wp<major>.json`, in the shape `packages/design/tracy-ds-slot/src/release-content-edits.mjs`
reads (`from`, `to`, and `count`, the occurrences in the last published dump). Apply it to the
dump with that module's `editDump` before packing (it stops when a count differs), then capture the
new contract, since the presentation lock hashes the edited pages. Tracy Base: copy that named
Joomla on the WordPress site (after 1.1.5).

**Tracy Base content changes for the next cut (`scripts/apply-tracy-base-changes.mjs`).** The WordPress
site must carry what the approved Joomla source shows instead of hiding extra content with CSS (a
customer would edit text that never shows). With the tracy-base theme of this branch installed on
the restored stand, `node scripts/apply-tracy-base-changes.mjs --stand <dir>` (or `--wp '<wp-cli
command>'` for any other site) removes the footer's "Pages" column and copyright line, gives the
header's Service, Resources and Company panels the source's content (Service's fifth link and
feature card, Resources' three link columns with "Talk to sales" going straight to the contact page,
Company's four people cards on the media library's team portraits; every picture is checked to be in
the media library first), points the Contact button straight to the contact page, copies the one-page home's own
header (`parts/header-onepage.html`) into a database template part of the same bytes, as the site header and footer
are, so Tracy can rewrite its words (TCQR LANG-2), gives the contact form the source's
labels and its Subject field, takes the category descriptions, pictures and labels out of the
listing pages, turns All articles, Browse by tag and Tags into the source's views, publishes
`/resources/search` (its redirect to the home page goes), and applies `content-edits/tracy-base-wp7.json`.
A second run reports `0 changed`.

Nothing here uploads: `release.mjs` of the method is not run, and the release files are published
on a separate order.
