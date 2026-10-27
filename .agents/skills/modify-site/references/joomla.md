# Change a running Joomla site

> Read after `SKILL.md`. If the site has `templates/<tpl>/AGENTS.md`, **that file wins over this one** wherever
> the two differ — it is about that template; this is about Joomla in general.
>
> Both Tracy templates ship it, and they are **completely different**: `tracy_business` is a JoomlArt
> **T4** template (13 rules, 13 `docs/`), while `tpl_tracy` — the template of `tracy-base/j6` — is
> Tracy's own template, 5 positions, 16 sections (list and shapes in `packages/cms/tracy-cms-sections/regions.json`), 154 token files. Read the one the site actually runs:
> `content.list` kind `templateStyle`, or look in `templates/`.

## Structure: what lives where

| layer | where | door |
|---|---|---|
| WORDS | article · menu item · module (text usually lives in **`params`**, not the body) | `content.update` |
| SETTINGS | a record's `params`; the site language is `com_languages` **and** a published `language` row — both, not one | `content.update` |
| PHRASES | strings Joomla ships | **language pack first**, `.ini` override only for what the pack does not cover |
| PRESENTATION | `templates/<tpl>/html/` — **overrides**, never core or an extension's views | file |
| INSTALLED | `extension.list` · `content.list` kind `language` | `extension.install {url}` |

## Five silent, measurable mistakes

1. **`css/template.css` is a COMPILED file.** Edit it and the next SCSS compile wipes it. The source is
   `scss/`; colour/type/spacing tokens usually live in a separate hand-written CSS file — the template's `AGENTS.md`
   names it. The system the site wears and the values of the 56 tokens at build time (T4 compilation loses the names) are in
   `docs/agents/design.json` (ADR 0023); before reporting a visual change as done, compare against that file.
2. **A design block is `mod_ja_acm`, not `mod_custom`.** Paste HTML into an article or build it
   with `mod_custom` and it disappears from the block catalogue and from every recipe — the site still looks
   right, so nobody notices until the next maintenance.
3. **Editing core or an extension's views is lost at the next update.** Only overrides survive.
4. **Multilingual means PAIRS with an association.** If one side is missing, the language switcher and hreflang
   break. Don't machine-translate what the customer has not provided — and don't create a counterpart with text in the wrong language,
   not even to unpublish it: say that copy is missing, then link the pair when the customer provides the translation (the *Adding a
   record* section below).
5. **The header brand is a SETTING, not a file.** It is the `siteTitle` of the default
   template style; when it and `logoFile` are both empty the template falls back to **the logo it ships** — usually
   an image, so the text on screen may **exist nowhere in the database**. Read which template the site runs
   before you go looking.

## Adding a record (article)

`content.update {kind:"article", fields, apply_id}` **without an `id`** (or `id:0`) creates a new article and returns
`{created:true, id}`; `apply.revert` removes exactly what was inserted. Nothing mints an `apply_id` for Joomla content writes,
so you name it yourself, one per task. The site context has the `- Adding a record:` line with a sufficient command;
the rest is here. The three common rules in `SKILL.md` (only what the customer gave, no wrong-language copy, read as little
as possible) apply unchanged.

- **Columns the component writes** (`JoomlaSiteWriter::MAP` of the Claude Cowork plugin): `title`, `alias`, `introtext`,
  `fulltext`, `state`, `catid`, `images`, `urls`, `attribs`, `metadata`, `metakey`, `metadesc`, `language`,
  `featured`, `ordering`, `access`, `publish_up`, `publish_down`, `note`. On create the component adds
  `access:1`, `language:"*"` and `created` = creation time when you don't set them. Leave `alias` empty and Joomla derives it from
  the title.
- **Only `state:1` is published.** Don't rely on the default: if the customer says publish, say `state:1`.
- **`publish_up`** is `YYYY-MM-DD HH:MM:SS` (UTC, like Joomla's column) and the `Today:` notice is also a UTC date,
  so the time of day is midnight, `YYYY-MM-DD 00:00:00`, of the day the customer named (today if none), unless they
  also named a time — don't make up a time: midnight is never ahead of now, while a made-up time may be.
  A past date shows immediately and lists sort by it; **with a future date (or a time later than now) the
  article is published but the customer cannot see it until then** (Joomla filters on `publish_up`).
- **`catid`** is the category the PAGE the customer named lists, not a category that "sounds right". The door already reads it for
  you (30/09): `content.read {view:"pages", url}` returns, in the page's row, `lists.create` — the create command with `catid` and
  `language` filled in, read from the page's menu item — plus `lists.subcategories` when the page also shows posts of
  subcategories. Without `lists` (the menu item is not a category blog, the blog filters by tag — `filter_tag[…]` at the end of `link` —
  featured posts only or posts of a few authors, a read error) read it by hand:
  the page's menu item is a category blog or list, and its `link` carries `id=<catid>`
  (`content.get {kind:"menuItem", id}`, id in the page's `native`), or
  search by name in `content.list {kind:"category"}` (long list: pick the category in the right language). If the page has
  subcategories and the customer named none, use the page's category; picking a subcategory "that fits" is
  classifying on the customer's behalf.
- **`language`** is that category's language; `*` means all languages — wrong for a two-language site with a separate category
  per language.
- **Text**: `introtext` is the lead, `fulltext` is the part after "read more". How the template splits them:
  read ONE sibling article in the same category (`content.get`), not the template code.
- **Article layout — ONE read of a sibling article, and that is the ONLY read of the create** (adversarial
  review round 7, PP-2). Tracy templates put the article's layout in `attribs.article_layout` (e.g.
  `tracy_business:tb-article`; the `- Adding a record:` line does not carry it because the site context has almost no
  room left): a new article without it renders with Joomla's default layout, unlike its siblings, while the receipt
  still looks complete. Get the id of an article in the same category (the listing page's `content.read` gives ids; or
  `content.list {kind:"article"}`), `content.get {kind:"article", id}`, copy the `article_layout` value into the CREATE
  command: `attribs:{patch:{article_layout:"<value read>"}}` (the door writes the whole column on create — no second
  update needed). Don't make up a key or value; if the site does not run a Tracy template (siblings have no
  `article_layout`) skip this.
- **Leave empty what the customer did not give**: image (`images`), extra categories, a copy in another language.
- **A new PAGE is not this record**: it is an article in the pages category PLUS a menu item pointing to it (create the
  article first, then the menu item — exactly the ordering rule in `SKILL.md`). The describe's `where.pages` (quickstart) gives
  both commands; the `- Adding a record:` line only creates the article part and says to read `where.pages` for the rest.

## Languages: install, then type

1. `content.list` kind `language` — what is there, which are published
2. If missing, `extension.install {url}` — **the site downloads** the zip itself, so a package catalogue (URL + sha256)
   is enough; the site may carry one already (`AGENTS.md` says)
3. Only what the pack does **not** cover is an override: a `KEY="value"` line in
   `language/overrides/<tag>.override.ini` (`administrator/language/overrides/` for the admin side),
   **never** edit a shipped `.ini`
4. Find keys in ONE pass: `grep -rn` all the visible English text, together, over
   `language/en-GB/` — not one grep per key

## After writing

**Clear the cache, always:** `php cli/joomla.php cache:clean`. Measured 21/09 on `site-kutise`: that command
also clears `media/t4/optimize/` — the CSS/JS bundles T4 serves. Without it you are still looking at the previous
version, and *"I changed it but nothing changed"* is almost always this step.

The admin is at `/administrator` but **you cannot open it**, and the database is **never** the
answer instead.

## Going deeper

The T4 **build** skill holds the details, under the same subtree constraint as above:

- `vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/references/t4-anatomy.md` — what T4 consists of
- `vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/references/blocks-and-elements.md` — ACM blocks and elements
- `vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/references/css-tokenizing.md` — colour/type tokens
- `vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/references/editability-standards.md`
- `vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/references/agent-docs.md` — what documentation a template ships, who writes which file
- `vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/references/gotchas.md`
