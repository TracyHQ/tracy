# `site-model.json` — the neutral source contract

> **The P1→P2 packet.** Read before writing any source adapter, and before editing
> `scripts/contract/`. Decision: **TCH ADR 0016** (`docs/adr/0016-hop-dong-nguon-hai-tang.md`)
> — deliberately NOT a link: this tree lives in the `JoomlArt-Products/tracy-emdash-template` repo, which
> has no `docs/adr/`, so a relative path into TCH breaks exactly where the skill is developed.

## Why it exists

Tracy has three site-building skill sets — EmDash, Joomla T4, WordPress — and each used to read its source
its own way. The consequence, measured 15/09/2026: **none of them could read a WordPress site**, not even the
WordPress one; and every new source format had to be written three times.

`site-model.json` describes **what the source says**, in a vocabulary that belongs to no CMS. Adapters emit it;
each CMS's compiler translates it into its own storage shape.

```
SOURCE           ADAPTER                    CONTRACT            COMPILER            TARGET
Joomla        →  from-joomla.mjs      ┐                    ┌ compile-seed.mjs  → EmDash seed
WordPress     →  (not yet)            │                    │ (WordPress set)    → theme + wp-cli
HTML / canvas →  inventory + extract  ├→  site-model.json  ┤ (Joomla set)       → ACM + module
brief         →  hand-written         ┘                    └
```

## Shape

| Key | What it is |
|---|---|
| `$schema` | `tracy-site-model/v1` — checked on read, refused if wrong |
| `source` | `kind` (html · canvas · url · frames · joomla · wordpress · brief) and `parity` (`measured` \| `declared`) |
| `locales` | `{ default, all[] }` |
| `site` | `title`, `tagline`, `postsPerPage` — labels are **maps by language** |
| `types[]` | content types: `name`, `mode` (`single` \| `list`), `label`, `fields[]` |
| `taxonomies[]` | `name`, `appliesTo[]`, `hierarchical`, `terms[]` |
| `records[]` | one record: `type`, `slug`, `locale`, `status`, `values{}`, `terms{}` |
| `menus[]` | `name`, `label`, `items[]` (`label`, `path`, `localisedPath`, `children[]`) |
| `routes[]` | `path`, `kind` (page · list · detail · archive · system), `type?`, `slug?` |
| `redirects[]`, `media[]`, `tokens`, `facts[]` | redirects, images (with `usedBy`), design tokens, facts about the site |

Field kinds: `text` · `prose` · `number` · `boolean` · `date` · `url` · `email` · `image` · `file` ·
`link` · `group` · `reference`. The source says **what** a value is, not which widget edits it — choosing the
widget is the compiler's job, and each CMS chooses differently.

## Where to get the two sibling-repo scripts

The `contract` road runs two scripts that **are not in this repo**:

| Script | Job | Repo |
|---|---|---|
| `scripts/ingest/joomla-dump.mjs` | a running Joomla site → `inventory.json` + `render-routes.json` | `JoomlArt-Products/tracy-wordpress-theme` |
| `scripts/ingest/from-joomla.mjs` | those two files → `site-model.json` (+ the WordPress set's spec-pack) | same repo |

```bash
gh repo clone JoomlArt-Products/tracy-wordpress-theme       # private: needs org read access
cd tracy-wordpress-theme/skills/tracy-wordpress-theme && npm install

node scripts/ingest/joomla-dump.mjs --out <j6-dir> --compose <the-site's-compose-folder>
node scripts/ingest/from-joomla.mjs <j6-dir> --out <spec-dir> --site-url <site-url>
# then back in this repo:
node tools/compile-seed.mjs <spec-dir>/site-model.json seed/
```

In TCH the two trees already sit side by side — `vendor/wordpress/tracy-wordpress-theme/` and
`vendor/emdash/tracy-emdash-skill/` — so nothing needs cloning.

🔒 **Why clone instead of importing directly.** The three skills are three repos, and TCH's [ADR 0006](https://github.com/TracyHQ/tch/blob/develop/docs/adr/0006-plugin-vao-bang-subtree-ghim-commit.md)
forbids a dependency pointing at a live repo: when someone else's copy changes is their business, and a
customer-site build must not break because of it. So each skill **declares** the contract version it speaks
(`tracy-site-model/v1`), and TCH — the only tree that vendors all three — keeps the gate proving the three still match
(`scripts/check-site-model.ts`).

## Three rules worth remembering above all

1. **A translation is a derivable relation, not hand-declared data.** The model has no `translationOf`:
   a secondary-locale record uses the same `type` + `slug`, and the compiler rebuilds the link. A derivable
   field written by hand is a field that will go stale.
2. **A `values` must not hold a whole page.** The validator refuses (`VALUE_HOLDS_A_PAGE`) when a
   value carries `<header>`, `<nav>`, `<footer>`, `<main>` — that is a rendered page pasted into a field,
   and every CMS downstream would store it as an uneditable block. This is the skill's invariant #1, placed
   at the contract layer.
3. **Neutrality is enforced by the machine.** `scripts/tests/site-model.test.mjs` scans
   `scripts/contract/` for the storage vocabulary of all three CMSs — EmDash's included, because the contract
   is written in the EmDash set, so EmDash is the one most likely to dirty it.

## `compile.config.json` — the target's decisions, not the source's

A source does not know whether long text should be `text` or `portableText`, which collections are routable, how the admin
orders them. Those live next to the template:

```jsonc
{
  "seedSchema": "https://emdashcms.com/seed.schema.json",
  "meta": { "name": "…", "description": "…", "author": "Tracy" },
  "collections": { "posts": { "label": "News", "sortOrder": 4, "routable": true, "urlPattern": "/news/:slug" } },
  "fields": { "posts.body": { "type": "portableText" } }
}
```

A collection with an entry in `collections` is written **exactly as declared, in that key order**;
only a collection with no entry gets the derived shape. A field kind with no mapping is an **error**,
not a default `string`: a wrong-but-looks-right field renders normally and loses data on the first
edit in the admin.

## Commands

```bash
node scripts/contract/validate.mjs <site-model.json>           # gate: exit 1 with a named error code
node tools/compile-seed.mjs <site-model.json> seed/ --config seed/compile.config.json
node tools/from-emdash-seed.mjs seed/seed.json <out>           # bootstrap: existing seed → model + config
```

⚠ `from-emdash-seed.mjs` is a **one-time bootstrap** for templates built before the contract existed, not
a road in the pipeline. Real sources are Joomla, WordPress, HTML, a brief — not an EmDash
seed.

## Tracy Business acceptance

The first template moved onto this contract: `seed/site-model.json` (14 types, 100 records, EN/RU) plus
`seed/compile.config.json`. `tests/seed-roundtrip.test.mjs` pins that recompiling yields **exactly the accepted
`seed/seed.json`, byte for byte** (SHA-256 matches, 262,644 bytes).
