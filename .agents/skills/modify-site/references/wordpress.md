# Change a running WordPress site

> Read after `SKILL.md`. If there is a `wp-content/themes/<theme>/AGENTS.md`, **that file wins over this one**.
> Both Tracy themes ship it: `tracy-base` (with `README.md` + 7 `docs/`) and
> `wp-tracy-business`. Their source is the **overlay**, not `src/`:
> `packages/cms/tracy-wordpress-theme/overlays/<theme>/AGENTS.md` — edits in `src/` are lost at the next
> build.

## The first question, before any other

**Is this a block theme or a classic theme?** The two want **completely different** edits for the same result,
and guessing wrong means you edit a file nobody reads.

- block theme → header/footer are **template parts** (`parts/*.html`), pages are `templates/*.html`,
  prebuilt blocks are `patterns/*.php`, colours/type are `theme.json` + style variations
- classic → PHP templates, `functions.php`, `header.php`/`footer.php`

The test: if the theme has `theme.json` and a `templates/` folder containing `.html`, it is a block theme.

## Structure: what lives where

| layer | where | door |
|---|---|---|
| WORDS | post · page · menu · category · tag | `content.update`, kind `post` · `postmeta` · `menuItem` · `category` · `tag` |
| SETTINGS | options — the site name and tagline are `blogname`, `blogdescription`, **not theme files** | `content.update` kind `option` |
| PHRASES | strings core and plugins ship | **existing locale translations first**; only the rest goes to a custom translation file or a `gettext` filter |
| PRESENTATION | template parts · patterns · `theme.json` (block) or PHP templates (classic) | file |
| INSTALLED | plugins, themes | `extension.install` · `plugin.activate` |

⚠ **The option door's READ and WRITE are asymmetric.** `content.update {kind:"option", key, fields:{value}}`
writes, but `content.list {kind:"option"}` and `content.get` by numeric `id` do not serve that kind.
Measured 19/09 on `demowp`: the agent spent **15 of 17 steps** discovering this asymmetry. Fixed
upstream and released in `wordpress-v0.10.0` — sites older than that version still behave the old way, so if
`content.get` returns `bad_params: id required` it is the **component version**, not a wrong call on your side.

## Four silent mistakes

1. **Don't edit `wp-admin/`, `wp-includes/`, or plugins you did not write.** The next update wipes them. Use a child
   theme, a hook, or the block editor's own layer.
2. **`theme.json` tokens are GENERATED from the design system**, not typed by hand — Tracy's themes build
   56 tokens with a generator. Overwriting a hex value creates a second truth that will be overwritten. Which system the site
   wears and the names of the 56 tokens are in `docs/agents/design.json` (ADR 0023); before reporting a visual
   change as done, compare against that file.
3. **Editing shipped `.po`/`.mo` is lost at the next update.** Use a custom translation or a `gettext` filter.
4. **Multilingual goes through a plugin** (Polylang on Tracy's themes) — a translation that is not linked as a pair
   is invisible to the language switcher.

## Adding a record (post, page)

`content.update` **without an `id`** creates a new record; `kind:"page"` for a page (the door adds
`post_type:"page"` and says so in `normalized`). The site context has the `- Adding a record:` line with a sufficient command;
the rest is here. Nothing to read first: the three common rules in `SKILL.md` (only what the customer gave, no
wrong-language copy, read as little as possible) apply unchanged.

- **Fields the component writes** (`POST_FIELDS` and `write_beyond_the_row` of the Claude Cowork plugin; `WP_POST_FIELDS`
  in `normalize.mjs` keeps the same list): `post_title`, `post_content`, `post_excerpt`, `post_status`,
  `post_name`, `post_parent`, `menu_order`, `post_type`, `post_date`, `post_category` (list of **ids**),
  `tags_input`, plus `categories` / `tags` (**slugs**), `featured_image_id`, `template`, `seo`. Fields outside
  the list are rejected by name.
- **With `post_status` empty the record is a DRAFT**, on purpose: a new page appearing on the running site without anyone
  saying so is something an Apply must not create by omission (`write_post`). If the customer says publish,
  `post_status:"publish"`.
- **`post_date`** is `YYYY-MM-DD HH:MM:SS` **in the SITE's time**; `wp_insert_post` takes it verbatim, and empty
  means creation time (the site's current time, so never in the future). If the customer names no date, leave it empty.
  If the customer names a day other than today, `YYYY-MM-DD 00:00:00`, unless they also name a time — don't make up a time:
  the `Today:` notice has no time. A past date sits at that spot in the post list. **A future date with
  `publish` is turned into `future` (scheduled) by WordPress core itself**: the post does not show until that date — core
  behaviour, not a bug; tell the customer if they did not mean to schedule. `Today:` is a UTC date while `post_date` is the
  site's time: a site west of UTC early in the UTC day is still on the previous day, so "today" written as that UTC
  date can become `future` — that is why both "today" and "no date given" leave this field empty.
- **`post_content` is block markup**: each paragraph is `<!-- wp:paragraph --><p>…</p><!-- /wp:paragraph -->`.
- **Leave empty what the customer did not give**: `post_excerpt`, image (`featured_image_id`), translations — and `post_category`,
  **unless the page the customer named lists posts by a category** (section below). A post without a category gets the site's
  default category from WordPress; if the customer wants a classification they say so, and the answer says clearly the post
  has no category yet.
- **The listing page's category — a deliberate exception to the rule above** (adversarial review round 7, PP-3).
  Tracy themes have pages listing posts of ONE category (`/category-blog`, `/portfolio/<category>` of
  `wp-ja-vega`; the team-query block of `tracy-base`): the page's query records the category in the `core/query` block
  (`query.taxQuery.category` is an **id**, or `query.wpJaVegaCategory` is a **slug**, with subcategories), and a post
  WITHOUT that category does not show on that page — `/<page>/<post-slug>` does not answer either. The
  Claude Cowork plugin records exactly that in `POST_FIELDS`. The door already reads that block for you (30/09): when the customer names a
  page ("post to the Blog page"), `content.read {view:"pages", url}` returns, in the page's row, `lists.create` —
  the create command with `post_category` (or `categories` for slugs) filled in when the page's query filters by category
  (both the flat form `taxQuery:{category:[…]}` and the include/exclude form of WordPress 6.8+; excluded tags don't
  get in the way); a page carrying a query the door cannot reduce to ONE command (two different queries — a category page with
  child pages from the seeder is one —, a query filtering by author/tag/keyword, an excluded category, nesting)
  gets `lists` with only a `note`, NO `create`: read the block as below; a page with no query at all, or a
  read error inside the door, gets no `lists`. Reading by hand: read that page's `wp:query` block ONCE
  (`content.get {kind:"post", id}` with the page's id; the id comes from `native` in `content.read` or
  `content.list {kind:"post", post_type:"page"}`). If it has `taxQuery.category` (or `taxQuery.include.category`
  in the 6.8+ form) then `post_category:[<id>]`; if it only has `wpJaVegaCategory` then `categories:["<slug>"]` (slug; an unknown slug is dropped, not
  created); if neither (the page has no query block, or the query does not filter — the news page of `wp-tracy-business` is a
  template listing ALL posts) leave it empty. The answer says which category the post is in and why. Don't read
  sibling posts to guess: the query block is where the page says it.
- **A new PAGE is not in any menu yet** (PP-4): Tracy themes print menus with a `wp:navigation` block pointing to
  `wp_navigation` posts (Header, Top bar…), and a new page does not get in there by itself. The describe's `where.pages` (site
  quickstart) gives the command to add a link to the Header menu; without it, ask the customer whether they want that page in the menu,
  or say clearly it is not in any menu yet. Don't report "done" when the customer has no way to reach the page.
- **Language**: on a site with Polylang a new post gets the site's default language (bench v7, 29/09: 3 out of 4 runs
  assigned nothing and the post still appeared on the English news page). A copy in another language only when the customer names it:
  `content.language {id, lang, translations}`.

## Editing part of a page: by block, don't resend the whole page

`post_content` (and a template part's `content`) writes the WHOLE BODY: send one block short and the page loses that block
(`BODY_SHRINK` blocks most of these, not all). To edit one section, go by block:

- **Read the outline**: `content.get {kind:"post", id, outline:true}` returns one row per top-level block (`i`, block
  name, start of the text) and **`rev`** — the fingerprint of exactly the body just read. `block:[i]` reads the markup of a few blocks.
- **Positional writes must carry that `rev`**: `content.update {kind:"post", id, rev, blocks:{"<i>":"<markup>",
  "<j>":null, "+<k>":"<markup>"}}` — replace, delete, insert before block k. Missing `rev` is `BAD_PARAMS`; a page changed
  since the read (someone editing in admin, another session) is `REVISION_STALE` and **writes nothing**: re-read the outline,
  recount positions. Keying by a block's `metadata.name` does not need `rev`.
- **`{attrs:{…}}` only changes what lives solely in the comment**: `metadata` (block name), `lock`, and the `query` of
  `core/query`. A block with HTML (closed by `<!-- /wp:x -->`) keeps most attributes TWICE, in the comment and
  in the HTML: measured 01/10 on Twenty Twenty-Five, changing a heading's `level` broke the block in the editor, changing a button's `url`
  changed nothing on the page while the write still reported done. The host refuses with `ATTRS_IN_HTML`; the right path is to read
  `block:<i>` then send markup edited in both the comment and the HTML. An empty block `<!-- wp:x {…} /-->` accepts any attribute.
- **A new `rev` only comes after a write that keeps positions** (replace or patch only, block count unchanged). After an
  insert, delete or whole-body write, the answer has no `rev`: re-read the outline before the next positional write.
- **If the theme already has the section, insert it by name; don't type the markup yourself**: `content.list {kind:"pattern", search}` lists
  the site's registered patterns; `"+<k>": {"pattern":"<name>"}` inserts a copy of its markup (the host reads it at write time, same
  `rev`, same body guard, same undo). If the site's plugin cannot list or read patterns yet, the answer is
  `PATTERNS_UNSUPPORTED`: build the section with markup as before. Don't invent pattern names; if there is none, say so.

The rules live in `packages/tools/tracy-site-tools/src/host/wp-blocks.mjs` and `wp-patterns.mjs` in the same folder.

## After writing

If a page cache plugin is active, **flush** it — otherwise you are still looking at the old version. If you changed the permalink
structure, flush the rewrite rules, otherwise new pages return 404 even though the record exists.

Then run `tracy_build_check {path}` on each page you changed (the site build rules: [`site-build-rules.md`](../../../../docs/references/site-build-rules.md)).

## Going deeper

The WordPress **build** skill carries the detailed reference, and it is the copy the upstream repo's gates
keep. **Read it directly; don't copy it here** — a copy is a second truth, and it drifts
silently:

- `vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/templates-and-patterns.md` — where markup lives, how it is named
- `vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/theme-json-tokens.md` — 56 tokens, generated not typed
- `vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/dark-light-mode.md`
- `vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/i18n-polylang.md`
- `vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/chrome-and-navigation.md`
- `vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/editability-standards.md` — *"the buyer is the one who edits in the admin, never in code"*
- `vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/gotchas.md`

⚠ `vendor/` is someone else's tree (RULE #5): that repo lives at `JoomlArt-Products/tracy-wordpress-theme`
and comes in here as a subtree. If one of the seven files above needs a change, **edit it in the upstream repo, then pull it in**; don't edit
it in place — the next `git subtree pull` loses it.
