# WordPress content storage model (block theme, 2026) — for porting a Joomla site

Sources: ONLY developer.wordpress.org · wordpress.org/documentation · make.wordpress.org · learn.wordpress.org.
Looked up: 2026-09-13. English quotations are kept verbatim; the rest is commentary.
Convention: **[Not in core]** = WordPress core has no equivalent object; the official documentation points to a plugin.

---

## The source is a RUNNING site, not a build folder

`from-joomla.mjs` reads a quickstart build folder. A running customer site has no such folder —
`scripts/ingest/joomla-dump.mjs` builds it from the site's own database:

```bash
node scripts/ingest/joomla-dump.mjs --out <j6-dir> \
  --compose ~/TracyHQ/quickstart-builds/<site>    # or --container <name>
  [--web-service joomla | --web-container <web name>] [--web-root /var/www/html] \
  [--db joomla] [--prefix tr_] [--site-url http://127.0.0.1:8216] \
  [--capture [--capture-timeout-ms 30000]]   # needs --site-url and a web target: builds capture/ (§Pages and posts beyond the markup)
```

Read-only (`SELECT`, `SHOW COLUMNS`), six tables, **every column `CAST … AS CHAR`** because the inventory contract
says every value is a string. Each row comes back as **a JSON object built by the database itself** —
Joomla article bodies contain newlines, tabs and quotes, which a TSV dump loses in a way that looks like
success. The password is read from the compose `.env` when there is one, so a secret already sitting
on disk does not have to be typed again.

It also reads `#__extensions`: the whole table as a census (`extension_id`, `name`, `type`, `element`,
`folder`, `client_id`, `enabled` only — no other extension's `params`, which hold its configuration and
credentials) into `inventory.extensions`, and the `params` of the one `type = 'component', element = 'com_content'`
row, kept on that row as the database holds them (a JSON string): the global com_content options a category menu
item set to "Use Global" inherits (§Category archive display options). No such row, two of them, params that are
not a JSON object, a missing table or column, or a line the client prints that is not a row stops the dump before
anything is written — a refused row or column is named by its `extension_id`, column and kind (`NULL`, `not JSON`,
`a JSON list`), never by its value, since an extension's options may hold a key; `dump.json` names the row (`contentParams: { from, extensionId }`). Every statement is bounded
(`JOOMLA_DUMP_TIMEOUT_MS`, default 120 s; 256 MB of output); a failed or timed-out statement stops the dump with a
message that never carries the password. Every file (and `capture/`) is staged first and put in place only when all are written (`dump.json` last); a target that is not a plain file is refused before anything is written, and a rename that fails puts every earlier file back (one generation or the other, never a mix). `dump.json` records the `generation` — an id, the sha256 of each JSON file and a digest of `capture/` (`joomla-generation.mjs`) — and `from-joomla.mjs` refuses a directory that is not that generation (a dump killed between two renames, or two dumps interleaved), naming the file, and checks again after it has read every input (a dump published meanwhile is refused); a dump without the record is read as before. `.joomla-dump.publishing` exists from the first rename to the last: a directory that has it is refused, so a writer killed with `dump.json` moved aside is not read as an old dump. `capture/` follows the run: a dump replaces the earlier `capture/` as part of the swap (restored if the swap fails), and one without `--capture` removes it, so `capture/` is there exactly when `generation.capture` says so. One dump writes an `--out` at a time (`.joomla-dump.lock`, created exclusively; a lock left by a killed run is named, never taken over). The staging directory is created exclusively; a link at its name is refused.
`--prefix` and `--db` are checked (letters, digits, `_`; `$` and `-` for the database) before any statement runs.

The site name is not in the database: Joomla keeps it in `configuration.php` (class `JConfig`) on the web server.
With `--web-service` (a service of `--compose`) or `--web-container`, the dump runs the site's own `php -r` on
`<web-root>/configuration.php` (default `/var/www/html`) and prints only the public fields of `SITE_CONFIG_FIELDS`
(`scripts/lib/joomla-inventory.mjs`): `sitename`, `MetaDesc`, `MetaKeys`, `MetaAuthor`, `language`, `offline`, `sef`,
`sef_rewrite`, `sef_suffix`, `offset`, `list_limit`, `feed_limit`. The field list is an argument of the PHP code,
which names no field itself; the dump checks the answer against the same list again. A field outside it (`password`,
`secret`, `user`, `db*`, `smtp*`, `host`, a path, a key) stops the dump, naming the field and never its value; so do
a missing `configuration.php`, a container without `php`, an answer that is not exactly one line holding one JSON
object (a warning or a second object beside it is refused whole, never read around), or a value that is not a
scalar. The PHP code sends its own diagnostics to stderr; of a failed `php`, only the code's own messages and the
container runtime's are printed, since a PHP diagnostic may quote a line of `configuration.php`. The fields go to `site-config.json` (every value a string; absent fields left out) and `dump.json` names
where they came from (`siteConfig: { from, fields }`). Without a web target no `site-config.json` is written,
`dump.json` has `siteConfig: null`, and the dump prints that the site name is not dumped.

Measured 15/09/2026 on the running Tracy Base: 82 articles · 19 categories · 102 menus · 116 modules ·
121 modules_menu · 14 template styles → **43 routes**, exactly the same as the original build.

⚠ **It does not build `capture/`.** Without that folder, the adapter uses heuristics for the ACM schema and skips the
palette/layout read from the template CSS (the §Inputs table below says which ones are optional). Enough to get the
**content model**; not enough to get the **design**.

## Adapter contract — `scripts/ingest/from-joomla.mjs`

```
node scripts/ingest/from-joomla.mjs <j6-dir> --out <spec-dir> [--site-url http://127.0.0.1:8217] [--force] [--page-floor N]
     [--article-fields <fields.json>] [--content-params <com_content.json>] [--article-posts <posts.json>]
     [--source-fonts-browser <measurement.json>] [--decisions <DECISIONS.md>]
```

`--article-fields` naming a file that does not exist or is not a regular file (a directory or a pipe is refused
before it is read), or JSON of the wrong shape (`null` and a list included —
not "no config") → **exit 2**, nothing written. The same holds for `--content-params` (a missing or unparsable
file → exit 2, and so does JSON that is not an object — `null`, a list, a number — rather than falling back to
another file), and for `--article-posts` (§Articles a menu item opens, kept as posts); without the flag the adapter reads `<j6-dir>/content-params.json` when it exists, else
the com_content row of `inventory.extensions` (§Category archive display options). `buildSpecPack` follows the
same rule: only an omitted `contentParams` (`undefined`) reads the file; `null` is a value and throws.

The inputs are checked before anything is written, and a failure names the file: `inventory.json` and
`render-routes.json` must be regular files holding JSON; the inventory an object holding the six tables
(`content`, `categories`, `menu`, `modules`, `modules_menu`, `template_styles`; an empty table is `[]`, an absent
one an error), each a list of row objects, each row with its key (`id`; `moduleid` + `menuid` in `modules_menu`)
and no key twice (no `moduleid`/`menuid` pair twice); an `extensions` table, when present, is checked the same
way (`type`, `element`; no `extension_id` twice) and its absence is named in `adapter-coverage.json`
(§Adapter coverage); the routes a non-empty list of `{ id, path }` with no route listed twice. A template name,
or a style key that names a capture file (`typelist-theme`, `typelist-site`), that is not one plain name
(`../x`) is refused before `capture/templates/` is read.

The adapter reads **a quickstart build folder** and writes **a spec-pack that passes `spec-pack.mjs --validate`**
plus four content files for the seeder. No running site needed; no Docker needed.

### Inputs (in `<j6-dir>`)

| File | Required | Used for |
|---|---|---|
| `inventory.json` | yes | `content` · `categories` · `menu` · `modules` · `modules_menu` · `template_styles` (Joomla DB dump, every value a string, the `params` column is JSON-in-a-string); optionally `users` + `user_profiles` (§Authors) and `tags` + `contentitem_tag_map` (§Article tags) |
| `render-routes.json` | yes | `[{ id: <menu item id>, path, stylesheets? }]` — the set of routes treated as "pages"; `status` / `location` (optional: the answer the source gave when captured, a non-200 status and its redirect target) and `stylesheets` (optional, at most 1000 strings): the URLs of the stylesheets the route's rendered page links to, in document order — evidence from the live capture of which sheets the route is served. Each URL is an absolute URL (`https://…`, or `//host/…` taking the scheme of `--site-url`) or a root path (`/…`, on the origin of `--site-url`); a path is treated as a file in the capture only when it is under the base path of `--site-url`, outside the base path a gap is recorded; a path-relative URL (`css/x.css`, `../x.css`) depends on the document URL and the page's `<base>`, so the sheet cannot be determined: the route's style leaves the value empty and records a gap |
| `content-params.json` (or `--content-params <file>`) | no — an override | the global com_content options — the `params` of the `com_content` row in `#__extensions`, as a JSON object (`show_category_title`, `show_description`, `maxLevel`, …). A dump from `joomla-dump.mjs` holds them in `inventory.extensions`; the file is for a dump made before that, or to override them (§Category archive display options) |
| `site-config.json` | no | the public `configuration.php` fields `joomla-dump.mjs` exports (above). `sitename` is the site name when the template's etc/site file declares none. A field outside `SITE_CONFIG_FIELDS`, a value that is not a string, or a file that is not a regular file (a link, a pipe) is refused naming the file |
| `capture/templates/<tpl>/etc/site/<site>.json` · `etc/theme/<theme>.json` (and `local/etc/…`, read first and replacing the whole file as T4 does) | no | site name (takes precedence over `sitename` in `site-config.json`), tagline, fonts, font sizes, colours (fallback) — `<site>`/`<theme>` come from `typelist-*` of the `home=1` template style; fonts are also resolved for every style the pages use (§Source fonts) |
| `capture/templates/<tpl>/css/styles/<theme>.css` | no | `:root {…}` tokens and the `html[data-theme="dark"] {…}` remap → light/dark palette, design-contract `tokens`. Missing → `darkDerived: true`. When present (a Tracy build) it stays the one design source; when absent the framework sheets below are read (§Design source per framework) |
| `capture/templates/<tpl>/css/*.css` · `css/themes/<theme>/*.css` · `css/darkmode.css` | no | the sheets of the template's framework, per template style (§Design source per framework) |
| `capture/media/t4/css/<style id>.css` | no | T4: the sheet T4 compiles for each template style; missing for a style a route uses → reported on that style |
| `capture/t3-assets/css/*.css` | no | T3, a live capture: the compiled sheets T3 serves — the rule source of a T3 style whose recorded pages' `stylesheets` records name the same template and compiled sheets (a page with no record gets none of the style's values); without such a record they are read and recorded only, and no design value of the style is published |
| `capture/templates/<tpl>/etc/layout/*.json` | no | the position order of each T4 layout → slot order in `post_content`, and the position of the component |
| `capture/templates/<tpl>/etc/layout/*.ini` · `tpls/*.php` · `tpls/blocks/**` | no | T3: the layout a style names in `mainlayout`, drawn in the order `tpls/<layout>.php` loads its blocks (§T3 sources) |
| `capture/templates/<tpl>/less/variables.less` · `less/themes/<theme>/variables(-custom).less` | no | T3: the palette and body font in LESS, the fallback where the compiled CSS resolves none (§T3 sources) |
| `capture/templates/<tpl>/acm/<type>/tmpl/<style>.xml` | no | ACM field schema: `<fieldset multiple="1">` = flat repeat, `<fields name="G" multiple="1">` = nested repeat. Missing → heuristics (a nested key or an array longer than 1 = repeat) |

Pure libraries: `scripts/lib/joomla-inventory.mjs` (reads the inventory, no I/O outside `loadInventory`/`loadAcmSchemas`),
`scripts/lib/html-to-blocks.mjs` (HTML → block markup, jsdom).

### Outputs (in `<spec-dir>`)

| File | Content |
|---|---|
| `page-map.json` | `template.name = tracy-base` · palette light + dark · fonts · `templateParts: [header, footer]` · `pages[]` one page per route (`file`, `view`, `layout`, WP `path`, Joomla `source`, `sections[]` = position + module id + `via`) · `gaps[]` (routes with no WP version, with `redirectTo`) · `menus[]` |
| `reference.json` | `kind: url`, viewports `[1440, 390]`, modes light + dark, one URL per page = `<site-url>` + the **Joomla** path (what Phase 8 compares against) |
| `content.json` | `site` · `categories` (`wpSlug` + `joomlaAlias`) · `pages[]` (with `parent`, `synthetic`, `contentKind`, route `pageHeading` when declared) and `posts[]` with `content` as block markup, `date`, `author.joomlaUserId`, `featuredImage` (basename from the `images` column), `meta._wp_page_template` for `page-*` views (and on a post kept by `--article-posts`), `tags` when the inventory has the tag tables (§Article tags) · `authors[]` when the inventory has `users` (§Authors) · `archives[]` (routes that are templates rather than pages: category/date/author/search/tag; route `pageHeading` when declared; `excerpt` + `masthead` when the route has a masthead — §Masthead; `display` on a com_content category route — §Category archive display options; `perPage` + `paging` on a category blog — §Archive per-page count; `featuredOrdering` when the menu orders featured articles by frontpage ordering) · `unresolvedLinks[]` |
| `sections.json` | `acm[]` 46 normalised instances (flat `fields`, including the module title when the ACM config has no `title` and the ACM `subtitle` when present, zipped `items[]`, `Itemid` links → WP paths, media cut at `#`, `pages[]` where it renders, `scope` page/footer/header/sidebar) · `custom[]` mod_custom (original `html` + `blocks`) · `other[]` (mod_menu, mod_articles_*, mod_finder, mod_breadcrumbs — with params). `mod_related_items` also carries `relatedByArticle`, only article ids sharing a source `metakey` term. Every `acm[]` and `custom[]` entry carries `spacing { top, bottom }` and `moduleClass` (§Module wrapper classes) |
| `menus.json` | **site** menus (`client_id 0`) nested by `parent_id`/`lft`: `label`, `type`, `url` (the route's WP path, or `redirectTo` if it is a gap, or the raw link if `type: url`), `page` (file in the page-map), `children` |
| `redirects.json` | `rules[]` 301: 5 gaps + 3 `mag-*` routes (D2) · `categorySlugs[]` 11 D2 aliases → WP slug |
| `design-contract.json` | hook `html[data-theme]` light/dark · 4 variants desktop/mobile × light/dark · `tokens` = `:root` (+ dark remap) · with the Tracy token sheet, 4 rules read from CSS (`body` size, `body` colour, `.tracy-band` padding, `.tracy-btn` radius); otherwise the rules each template style's framework sheets declare, ids `s<style id>-<role>` when the pages use more than one style, each page listing only its style's rules (§Design source per framework) · `pages[]` point at Joomla URLs |
| `content-contract.json` | mode `demo` · facts: `site.name`, `site.tagline` (verified, source etc/site; an empty declared value is an `absent-in-source` fact — §Identity fields the source declares empty), `contact.*` (from ACM `contact-information`), `demo.disclosure` (from ACM `site-notice`) · one surface per page |
| `design-spec.md` | generated by `make-design-spec.mjs`, then **fill every slot** from etc/site + the CSS tokens; a slot the source does not have gets "not declared in the source" outright, no invented numbers |
| `provenance.json` | adapter, source, `counts`, and `notes[]` — every decision the adapter makes on its own is recorded here |
| `adapter-coverage.json` | every source entity the adapter met, its extraction status, target, evidence, affected routes and reason; written last, atomically (§Adapter coverage) |

When the contract has `pending` notes such as `no typography rule could be read from the T4 sheets`, plan explicit selectors and properties for the affected category in `rules.json`, naming the contract page IDs that visibly exercise each selector. Measure those rules from the running Joomla site with [`../tools.md`](../tools.md) `measure-design.mjs`. Review `observations.json` and its validation status, then use `design-contract.candidate.json` once its validation is valid. Remaining pending notes or missing categories produce a not-yet-valid candidate with exit 0; the tool never edits the spec-pack or assumes a measured rule applies to pages outside the plan.

### Post vs page rule

An article is a **page** when *either* its category is named in `PAGE_CATEGORIES` (`Website pages`, `Studio resources`),
*or* it is the target of a menu item (`view=article&id=N`). Every other article is a **post**, keeping its category
(the category's WP slug). An article with `fulltext` → `intro` + `<!-- wp:more -->` + `fulltext`. Pages and posts
carry `joomla.ordering` (the article's place in its category), `joomla.hits` (the Joomla hit count), `joomla.created` (the creation time, kept beside `date`), `joomla.layout` (`article_layout`, the layout
override) and `joomla.fields` (the extra fields of `attribs` — §Article extra fields). Joomla `state 2`
(archived) → `publish` (WP has no archived). Different articles with the same alias (a Joomla alias is unique only within one category, a WordPress slug is global) get fixed slugs from the seeder: the article whose alias equals the slug, else the lowest article id, keeps the slug; the rest take their own alias if free, else `<slug>-<articleId>` — [`demo-content.md`](../demo-content.md) §1. The author is `created_by`; with the users tables in the inventory
it carries a source identity too (§Authors).

#### Articles a menu item opens, kept as posts (`--article-posts`)

The default above makes an article a menu item opens a page at the menu's path — right for an "About" article,
wrong for a blog article the source ALSO opens on its own (JA Vega `/blog-detail`: article 7 of the Blogs category,
shown with a related-articles module). As a page it left the category blog and the featured list one article short.
`--article-posts <posts.json>` names such articles: `{ "<article id>": { "template": "<template slug>" } }` (`{}`
for no template). Each one stays a **post** in its category (listed where the source lists it), with
`meta._wp_page_template` set to `template` when given; its menu route becomes a page-map page with view `single`
and `source.articleId`, so the seeder points the menu path at that post (demo-content.md §6c) — no page is written
at that path. The modules the route shows around the article go with the post: `posts[].route` is the menu page's
composition — `{ path, file, contentKind, content, aside, modules }`, exactly what the page would have carried, with
the article body as `{ kind: "body" }` (sections) or `<!-- wp:tracy-base/post-body /-->` (blocks) — and the seeder
renders it around the post's own body (demo-content.md §6c). Modules assigned to the menu item at a position no
layout draws (a related-articles block) are part of it either way: a slot in the markup, or entries of a
section-driven composition (header-ish positions before the body, the rest after) — a section-driven page carries
them the same way. A post only the first of several menu routes opens
carries that route's modules; a note names the others. An id that is not an article of the inventory, an article of a page
category, a key that is not an id or a value of another shape stops the adapter (the CLI exits 2, nothing written).

An article that is the target of **two** routes (Landing #78: `/` and `/resources/home-onepage`) → two pages, each page
carrying its route's path; the later page has `joomla.duplicateOf`.

### Slug rule (D2) — NARROW scope

Slugs are generated from titles in **only** two places, exactly the `content-gaps.md` §Slug table (`D2_CATEGORY_ALIASES`,
`D2_ROUTE_RENAMES` in `from-joomla.mjs`): (a) 11 old category aliases (`politics` → `website-planning`,
`grid-layout` → `website-services`, `blog` → `journal`…) — only the **term slug** changes; (b) three routes
`/resources/mag-procurement|mag-datacenter|mag-world` → `/resources/website-planning|website-operations|studio-notes`.
**Every other route keeps its Joomla path** (`/resources/faq`, `/services/service-detail`, `/resources/contact`,
`/services`, `/resources/blog` all stay) — except an article page whose menu alias carries Joomla's collision
suffix (§Article page slug). A page's `post_name` = the last segment of the path; nested paths
(`/company/about`) become parent/child pages — a parent page with no route (`/resources`, `/company`, `/account`,
`/services`) is **synthesised** with `synthetic: true` + `syntheticReason`, its title taken from the menu item with the same path
(heading "Resources") or the path segment capitalised; `/services` collides with an archive route, so it has `notes` reminding the seeder to keep
the archive rewrite first. `redirects.json` = 5 gaps + 3 mag routes, nothing else; `categorySlugs` = 11 D2 aliases.

### Article page slug (#41 M6-19)

Joomla numbers a menu alias another item of the site already holds: JA Vega's menu item 148 (under 144 `services`)
is `cloud-services-2` although it opens article 77, alias `cloud-services`, and no other page sits at
`/services/cloud-services` (category 13 `services/cloud-services` is a category — a WordPress term, not a page).
WordPress only needs a page slug unique among the pages of one parent, so the `-2` would ship a customer URL for a
collision WordPress does not have. `articleSlugs` (`joomla-inventory.mjs`, run by `routeViews`) gives an article
page its article's alias when the menu alias is exactly `<article alias>-<n>` (n ≥ 2), the alias is a plain slug,
and no route holds the new path — a page at it, a gap redirected from it, or a route below it — and no other
article page asks for the same path. Decided on the whole route set, so the inventory's order does not change the
answer. The front page and the D2 renames keep theirs. Every route below the page moves with it
(`/services/cloud-services-2/faq` → `/services/cloud-services/faq`). The paths are decided all at once, on the
paths every route will have after every move: a page below a moving page that takes its own article alias too lands
under the new path (`/services/cloud-services-2/faq-2` → `/services/cloud-services/faq`), and moves that would
collide there are dropped together and the rest decided again, in any inventory order; `redirects.json` gets a 301 from each old path
with the reason; menus, links (`Itemid`, article links), the page-map `path` and `content.json` `slug`/`parent`
follow; `reference.json` keeps the Joomla URL. When the article alias is not taken, `provenance.notes` says why:
another route holds the path (named by menu item), several articles ask for it, the article has no alias or not a
plain one, or the menu alias is not the article alias plus the suffix — then it is the address the site chose on
purpose and stays (joomla-min's `/company/about` for article alias `about-us`).

### Article tags (`posts[].tags`) (#41 M6-15)

joomla-dump reads `#__tags` (`id`, `parent_id`, `lft`, `level`, `path`, `title`, `alias`, `published`) and
every row of `#__contentitem_tag_map` (`type_alias`, `content_item_id`, `tag_id`) — no `WHERE` on `type_alias`, which would drop a row whose alias is NULL or empty unseen —
and writes those rows to `inventory.json` as read, rows of every component included; a site without
the tables (the database answers that they do not exist) leaves them out of `inventory.json`. A tag table that is
there but cannot be read, answers no column or lacks one the join needs, prints a line that is not a row, has
a map row without a `type_alias`, or has no partner stops the dump (exit 1) before anything is written — never "no tags". `articleTags` (`joomla-inventory.mjs`) joins them: each article's
tags in the tag tree's order (`lft`, then id) — the order Joomla prints — each tag once and each title once
(WordPress keeps tags by name). A row of another component (a contact tagged with the same id) stays in
`inventory.json` but is skipped by the join, so it never becomes a post's tag; an
unpublished or trashed tag and the tree's root are left out; a row naming a tag the table does not hold is left out
with a note; a map row without a `type_alias`, an id, `lft` or `published` that is not an integer, a shown tag an article carries that has no title,
one table without the other, or a table that is not a list of rows stops the adapter, naming what it read. Every post gets
`tags` (`[]` when the source has none); an inventory without the tables writes no `tags` field and a note says so —
"not read", which the seeder tells apart from "none" (demo-content.md §Article tags). Tags on articles that become
pages go nowhere: a WordPress page has no tags. JA Vega: articles 1–9 carry business · technology · services
(article 9 also marketing · security · app).

### Category slug rule for duplicate aliases (#10)

Joomla keeps an alias unique only among **sibling** categories; WordPress keeps a category slug unique **site-wide**.
`categories()` (`joomla-inventory.mjs`): an alias no other category uses → kept as is. A group of categories that would
share one slug (JA Vega: `database-security` under both `services` and `portfolio`) → **every** category in the group takes
its full Joomla path, `/` → `-` (`services-database-security`, `portfolio-database-security`) — the whole group, so the
result does not depend on inventory order. `parent`, `posts[].category`, `archives[].category`, and the paths of posts
without a route all follow that slug; the alias stays in `joomlaAlias`, and each slug that differs from its alias has a line in
`redirects.categorySlugs`. A slug that still collides after this step (another alias equal to `services-database-security`)
→ the adapter **stops** with `category slug collision: "<slug>" names #a (…) and #b (…)`; it never merges. The seeder
also refuses an old spec that still has two categories sharing a slug (`checkCategorySlugs`, see demo-content.md).

A **trashed** category (`published -2`) is not part of the site: `categories()` drops it before it groups slugs,
so it is neither exported nor counted. JA Vega keeps six trashed `services/*` categories with the aliases of the
six live `portfolio/*` ones; `portfolio/database-security` keeps `database-security`. An unpublished category
(`published 0`) is still exported (`published: false`). A live category whose parent is trashed has nowhere to
hang and stops the adapter (`category #… is live but its parent #… is trashed`). An article left published in a
trashed category is not served by Joomla: it becomes no post, and `provenance.notes` names it. Dropping a trashed
twin can give a live category its alias back — a site seeded before keeps its old term slug until it is renamed
there; the seeder does not migrate terms.

A route's file name is the flattened path (`/a/b` and `/a-b` are both `a-b.html`): two routes with different paths but the same file
**keep their paths**, only the second file is numbered (`a-b-2.html`), and a line is recorded in `provenance.notes`. Only when two
routes land on the **same** path (a D2 rename over another route) is the second path numbered.

### Masthead (`mod_jamasthead`) → `archives[].excerpt`

An archive route has no article of its own; the masthead line printed under the listing title is what the listing says about
itself. `mastheadFor()` (`joomla-inventory.mjs`) reads the `mod_jamasthead` module assigned to the route's menu item
(`assignedTo`: menuid 0 = every page; only negative ids = "every page except those ids"; positive ids = "only those ids"): the
`menuitem_config` row whose `item_id` contains that menu item wins; no row → `default-title` / `default-description`.
An empty description declared in the row stays empty (the module prints nothing). `archives[]` gets `excerpt` (the description) and `masthead
{ module, title, description, via: menuitem_config | default }`. A route without a masthead → no `excerpt`
(the seeder leaves it empty, it takes no text from any other module).

### Category archive display options (`archives[].display`)

A com_content category view prints, above its list, the category title (`show_category_title`), its description
(`show_description`) and its subcategories down to `maxLevel` levels (-1 every level, 0 none). Each is a menu item
option; an empty value is Joomla's "Use Global", which reads the global com_content options — and those live in
`#__extensions`, outside the six-table inventory. `archiveDisplay()` (`joomla-inventory.mjs`) resolves each option
as Joomla does, menu item first, and the archive records
`display { showTitle, showDescription, maxLevel, showIntro?, from: { <key>: menu | category | global } }` (`"0"` and `0` are both off). `show_intro` controls intro text in blog cards and resolves menu item → category params → global com_content; when false, the seeder removes the card excerpt block. If all three sources omit it, the adapter leaves `showIntro` absent rather than inventing a setting.

The global options come from the first of (`resolveContentParams`): the `contentParams` option /
`--content-params <file>`; `<j6-dir>/content-params.json`; the one `type: component, element: com_content` row of
`inventory.extensions`, whose `params` `joomla-dump.mjs` exports. The first that applies is the only one read: a
value that is not an object, a `content-params.json` that is not a regular file (a link, a directory, a pipe) or
does not parse, or an extensions table with no com_content row, two of them, or one without exported params
**stops** the run naming that source — nothing falls through to the next. `provenance.json` records the source
(`source.contentParams`). An inventory without an extensions table (a dump made before it was exported) gives no
options.

The adapter does not guess: an option a menu item inherits while no global options were given (or they do not set
it — an empty object included), or a value Joomla does not write, **stops** it naming the field and the menu item.
Dump the site again with `joomla-dump.mjs`, or — for an older dump that must stay as it is — add the options
beside it: export them read-only (`SELECT params FROM #__extensions WHERE type = 'component' AND element =
'com_content'`, exactly one row) into a new `<j6-dir>/content-params.json`, or pass `--content-params <file>`. The seeder prints what `display` says (demo-content.md §Archive); hiding the
subcategory list never filters the posts of the categories below.

### Featured article ordering (`joomla.featuredOrdering`, `archives[].featuredOrdering`)

`joomla-dump.mjs` carries `content_id` and `ordering` from `#__content_frontpage`. A featured post with a
frontpage row keeps its value as `joomla.featuredOrdering`. A featured route whose menu item selects the
frontpage order (`orderby_pri: front`) records its ordered Joomla article ids in `pages[].featured.order`
or `archives[].featuredOrdering` according to the route type; the seeder gives those posts the corresponding
WordPress `menu_order` and orders the featured-only query by it when the source layout draws the component.
On a non-front featured route, the featured list remains declared without that menu setting, while `order`
and `orderBy` are omitted. A front page without that setting keeps its previous spec shape. A missing or
invalid ordering value is reported, and the order is omitted rather than written as `null` or `NaN`.

### Archive per-page count (`archives[].perPage`)

A com_content category **blog** prints `num_leading_articles` + `num_intro_articles` articles as cards per page,
then `num_links` titles under "More Articles …", then its pager. Which layout a menu item draws is
`categoryLayoutKind()`: the link's `layout=blog` is the blog, no layout (or `default`) the list, and a template's
own layout (`layout=ja_vega:portfolio`, `<template>:<name>`) is whichever the item's `params.layout_type` says —
what Joomla's CategoryModel itself reads. A template layout without `layout_type` declares nothing (a provenance
note says so). JA Vega's `/portfolio/*` items are `ja_vega:portfolio` + `layout_type: "blog"`: 1 leading + 6 intro
= `perPage 7`, links 4 (before #33 they were read as lists and kept the seeder's default).

`archivePaging()` resolves the three counts as `archiveDisplay()` does — the menu item, else the global com_content
options — and the archive records `perPage` = leading + intro and `paging { leading, intro, links, from: { <key>:
menu | global } }`. Joomla pages the blog by its **cards alone**: the titles under page N's cards are the articles
that open page N+1 (JA Vega `/category-blog`, source HTML 27/09: 7 cards, 2 titles, pager `?start=7`, "Page 1 of 2").
With `links` > 0 the archive also carries `moreArticles: { heading: "More Articles …" }` — the core en-GB language
string `COM_CONTENT_MORE_ARTICLES`; the inventory has no language files, so a site in another language or with an
override prints its own and the heading is edited on the page. The seeder draws the list (demo-content.md §More
Articles).

Nothing is inferred from how many articles a page happens to show. A list layout, or counts that neither the menu
item nor the global options set, declare no `perPage` (a provenance note names the missing params) and the seeder
keeps its default of 12; a count that is not a whole number stops the adapter naming the field.

### Authors (`content.authors[]`)

With `users` and `user_profiles` in `inventory.json` (joomla-dump reads them through an allowlist: `id`, `name`,
`username`, `block`, and the `profile.user_avatar`, `profile.user_jobtitle`, `profile.aboutme` and `profile.user_social` profile rows — never a password, an email, a token or another profile key), every
post's `author` carries `id: "joomla-user-<created_by>"` beside `joomlaUserId` and `alias`, and `content.authors[]`
lists each author the posts name once: `{ id, joomlaUserId, name, login (the username), avatar (the profile image
path, cleaned like an article image), avatarAlt, `jobTitle`, `description`, `social` (only when the profile rows hold them), provenance }`. An article naming a user the table does not have
(or has without a name) keeps `{ joomlaUserId, alias }` only, and a note lists those ids. An inventory without the
users table writes no `authors` and the note says the posts carry the user id only — as before. The seeder side:
demo-content.md §6c.

### View

Menu item `home=1` → `front-page` regardless of the Joomla view. `featured` → `page-landing`; `article` → `page`
(`page-landing` if the template layout is home/home-2/landing/od-landing, `page-onepage` if od-onepage);
`category` → `category`; `categories` → `page` (+ block `core/categories`); `archive` → `date`; `author` →
`author`; `users.login/registration/profile/reset|remind` → `page-login/page-register/page-account/page-password`
(+ `core/loginout`); `finder.search` → `search`; `tags.tags` → `page` (+ `core/tag-cloud`); `tags.tag` → `tag`;
the **first** `contact.contact` → `page-contact`; every other `contact.*`, `newsfeeds.*`, `wrapper` → **gap** 301
(contact → the contact page, newsfeeds → the route with alias `blog`, the rest → `/`).

Two required views are produced by no route, so the adapter adds **two synthetic pages**, marked `synthetic: true`:
`single.html` (the first `state 1` post whose category has a route; Joomla URL `<category route>/<alias>`) and
`404.html` (the "Error page" article if there is one **and not served at a route of its own**; URL `/this-page-does-not-exist`). 43 routes → 38 pages + 2 = **40**.
An "Error page" article the site serves at its own route (JA Vega `/error-page`, a demo of the 404 style) is a
**page**, not the 404 words: it used to become a second, path-less draft with that page's slug — on the first
seed WordPress renamed the routed page `error-page-2`, later seeds matched both to one post. With no such article the 404 page has only its page-map `title`; the seeder makes
the draft from it (`demo-content.md` §6b).

### `{loadposition}` markers and section order

`{loadposition xxx}` / `{loadmodule …}` in an article → `<!-- wp:tracy-base/slot {"position":"xxx"} /-->`.
The seeder replaces that marker with the instances in `sections.json` whose `position` is that position and whose `pages[]` contains that page.
For a page whose layout has positions (home, home-2, landing, od-*): each position with modules assigned to that page (or
assigned ALL) becomes a slot, **in layout order**, with the article body in the `component` row — a layout without a
component (od-landing, od-onepage) means Joomla drops the body and the adapter keeps it in `droppedContent` with `notes`.
A module assigned to a menu item is only placed on a route when **the source draws its position on that very route** — the same
conclusion as coverage (`routeDrawing`: the route's layout, blocks, sub-layouts, mega menu, template overrides, `{loadposition}`
in the article). A drawn position → placed as usual (sidebar into `pages[].aside`, the rest into slots; header-ish before the body,
the rest after the body). A position **not drawn** on that route when the layout was fully read — including positions another layout draws
(ACM Landing-* assigned to `/` while `/` uses od-landing), positions no layout draws (`contact-information`, social, newsletter),
and a sidebar on a route that prints no sidebar (the layout has no sidebar position, or the menu item is in `skip_component_content`)
→ **orphaned**: it does not render on Joomla, so it does not become content and gets no "menu-assignment" slot; recorded in `pages[].orphaned`
(`archives[].orphaned` for an archive route) + `notes`, once per module per route, including modules assigned ALL. A partly read layout
(or not captured, blocks/mega menu/overrides not yet traced) → **unknown**: the module is still placed as before and `notes` says so;
the adapter does not guess "not drawn". A module an article loads with `{loadmoduleid}` counts as drawn on that route (in both composition and coverage: it does not go into `undrawn`). A module assigned ALL/all-except is also placed when the route draws its position (except chrome by position name — header/footer/sidebar-part — and modules the mega menu/`{loadmoduleid}` draws by id, because that element itself places them) but is not placed when it is only unknown; modules of the same position are never pulled along: each module is chosen on its own by the route's decision. The cause of an unknown (a partly read layout, blocks/mega menu not captured, overrides not yet traced) is recorded verbatim in `notes`; a sidebar named by the layout's mainbody is only treated as not drawn (orphaned) on a `skip_component_content` route when **the whole layout was fully read**; with a partly read layout every sidebar stays unknown: still placed in `aside` with `notes` and listed under `unknown` in coverage. `sections.json` `other[].pages` also drops the routes it was orphaned on. A module assigned ALL that is orphaned on any route
no longer gets `pages: ['ALL']` in `sections.json`, but lists exactly the routes it was placed on.
Chrome positions (`header*`, `footer*`, `footnav-*`, `mega-*`, `off-canvas`, `breadcrumbs`, `sidebar-*`)
never go into `post_content` — they are template parts; per-page sidebars are recorded in `pages[].aside`.

### Pages filled by mod_custom (`/` od-landing, `/resources/home-onepage` od-onepage)

A page whose layout rows are filled with mod_custom is **the theme's section library**, not a document:
`contentKind: "sections"` and `content` is an array in render order — `{ kind: "section", sectionType, moduleId,
title, position, html }` for recognised modules, `{ kind: "html", moduleId, blocks }` (core/html) for modules
not recognised (names recorded in `provenance.notes`), `{ kind: "slot", position, modules }` for ACM positions,
`{ kind: "blocks", markup }` for the article body. `contentMarkup` keeps the slot-marker string form. Recognition
(`detectSectionType`): `data-od-block` on the root element → the root's `tracy-<type>` class → the last segment of the module title
("OpenDesign · Landing · social proof"); the `SECTION_TYPES` table maps to hero · problem · pillars (`value`) ·
how-it-works (`how`, `tracy-steps`) · cta-inline · features (`tracy-zig`) · proof (`statistics`, `tracy-stats`) ·
social-proof (`testimonials`) · faq · pricing (`tracy-plans`) · cta-final · contact · styleguide · team.
Measured on j6: 12/12 modules of `/` recognised; onepage 4/9 (`about`, `services`, `product`, `process`,
`footer` have no matching type → core/html). `sections.json.custom[].sectionType` records the same result.

### HTML → block conversion

`p` → paragraph (keeps `strong/em/a/br/span/code…`; `<br>`, `<br/>`, and recovered `</br>` are line breaks; link class stays in rich text) · `h1–h6` → heading (`level`) · `ul/ol` → list + list-item
(nestable; the `<ul>/<ol>` and `<li>` classes stay, in each block's `className` and on its element — JA Vega's `list-special` is its check-mark list;
an `<img>` inside an item — the icon before its words, also inside a link or a wrapper — stays **inline in that
item**, in order, with its class, alt, `width`/`height`, and is listed in `images[]` with the same `width`/`height`) · `img`/`figure` → image, `src` → `/wp-content/uploads/<basename>`, alt/figcaption kept, the `<img>` class → `className` on the figure (an `<img>` lifted out of a `<p>` whose own
`style` says `text-align: center` becomes `align: "center"` — the figure's `aligncenter` — beside its class; left
and right are not mapped, since core/image floats them and the source did not) ·
`blockquote` → quote (+`cite`) · `hr` → separator · `div/section/article` → group (dropped if empty; if inline-only it
becomes a paragraph) · **any `style=` anywhere inside** → the whole block as `core/html` (a group cannot keep inline
styles — 27 OpenDesign mod_custom fall into this branch) · everything else (`table`, `iframe`, `form`…) → `core/html`.
All generated markup is checked by `checkBlockMarkup` for balanced open/close + JSON attributes; a mismatch stops the adapter.

An image `src` is a URL; the image table lists the file on disk. `rewriteImageSrc` decodes the path once
(`decodeUrlPath`): `images/…/paint%20bucket.png` lists `file: "paint bucket.png"`, `original:
"images/…/paint bucket.png"`, and the markup keeps a URL (`/wp-content/uploads/paint%20bucket.png`). An encoded
`#` or `?` is part of the name: `hash%23tag.png` lists `file: "hash#tag.png"` and the markup keeps `hash%23tag.png`
(only an unencoded `#`/`?` in the `src` starts a fragment or query). A path whose
escapes do not decode (a literal `%`), or whose decoding would move it (an encoded `/`, `\`, `.` or `..` segment),
is kept as written, and the seeder then reports it as not in the source image tree. A spec written before this rule
still lists the encoded name: run the adapter again.

### Module wrapper classes (`spacing`, `moduleClass`)

A T4 module's chrome prints its params on the section wrapper: `t4-mod-wrap <moduleclass_sfx> top-<top-space>
bottom-<bottom-space>` (`top-large bottom-medium`, `bg-light top-medium bottom-medium`). `moduleSpacing()` keeps
them on every ACM and custom module: `spacing { top, bottom }` as written (`large`, `medium`, `normal`, `blank`)
and `moduleClass` (the suffix, whitespace collapsed). A param the module does not set is `null` / `''` — the
chrome's own default is not guessed, and the values say what the module asks for, not that the chrome at its
position prints them (a sidebar chrome does not). The seeder puts them on the section root as the source's
class names (demo-content.md §Module wrapper classes); the theme styles `.top-large` and the rest from the
source's scale — no `#acm-<type>-<id>` rule per instance.

### T4 row frames

The reader keeps a row's class list, background image/colour and spacing preset on each composition entry
as `frame: { classes, background: { image?, color? }, spacing? }`. The seeder groups adjacent entries from
that row in one `core/group`, applies the classes and imported background image, and maps background colours
and spacing values when the theme exposes matching presets. A colour or spacing value without a matching
preset, any class value it cannot apply, and any background image it cannot import are named in the seed
report. Rows with none of these source attributes have no `frame` key. Runtime template counters are not
exported.

`mod_articles_category` keeps its raw params and draws a category-filtered query with its count and supported
ordering. `mod_related_items` carries ids only when Joomla articles share a non-empty comma-separated
`metakey` term (case-insensitive); matching articles must be published within their publish window, public,
in the current article's language or `*`, and are ordered and limited by the module params. Those ids become
an explicit list of article links. If required filter data is missing, the module is reported and no list is
drawn; no evidenced ids also means no list is drawn.

### Article extra fields (`attribs`)

A Joomla template adds fields to articles through its layout override (`html/com_content/article/<layout>.php`
reads `$this->item->attribs`): JA Vega's `services.php` prints `services_benefits` (a subform of title +
description) and `services_question`. That is text the source page prints, so normalisation must not drop it.
`articles()` (`joomla-inventory.mjs`) splits `attribs` into `layout` and `fields` — every key that is **not** a
Joomla option (`show_*`, `link_*`, `info_block_*`, `article_layout`, `urls_position`, `alternative_readmore`,
`article_page_title`) and holds a value. `content.json` keeps them verbatim in `joomla.fields`.

The adapter does not guess where a field prints (the layout PHP decides). The port names them in `--article-fields`:

```json
{ "services_benefits": { "className": "jv-benefits" }, "services_question": "skip" }
```

A configured field is appended after the article body as **editable** blocks: one `core/group` (`className`,
default `joomla-field-<name>`), a group `<class>__item` per subform row, and per value a `core/heading` h4 when
its key ends in `title/heading/name`, a `core/image` when it is an `images/…` path, its own blocks when it is
block HTML, else a `core/paragraph` — each classed `<class>__<last key segment>` (`jv-benefits__title`,
`__desc`, `__img` on the image block's figure) for the theme to style. `"skip"` leaves a field out on purpose.

What the layout prints of a subform row is stated, not guessed. JA Vega's `services.php` prints
`sprintf("%02d", $i)`, `benefits_title` and `benefits_desc`, and never `benefits_img`:

```json
{ "services_benefits": { "className": "jv-benefits", "skip": ["benefits_img"], "number": { "pad": 2 } } }
```

A field a listing card or a template prints outside the body (JA Vega's portfolio card prints a project's client
and date) is post meta, not body: `{ "portfolio_client": { "meta": "client" } }` writes the field's text as
`posts[].meta.client` of every article kept as a post, for a `core/post-meta` Block Binding to print and the editor
to change (demo-content.md §Article fields as post meta). `meta` alone keeps the field out of the body; with
`className`, `skip` or `number` beside it the field is drawn **and** written as meta. The key is a lower-case name
(`[a-z][a-z0-9_-]`, at most 64 characters), never protected (a leading `_`) and never the seeder's own (`tracy_*`);
two fields naming one key, or a field value that is a list or a subform, stops the adapter. A page takes no post
meta: an article routed as a page lists the field in the unplaced line (`… (a page: no post meta)`).

`skip` lists subfields left out on purpose (not drawn, not uploaded, not reported as unplaced; a skipped subfield
that holds a value is its own `skipped-by-rule` item `content:field:<field>.<subfield>` in the coverage report); `number` opens
each row with a `core/paragraph` `<class>__number` holding its 1-based position padded to `pad` digits — only
where the config says so, never read off an image file name such as `01.png`. Any other key, a `skip` that is not
a list of names, or a `number` other than `{ "pad": <n ≥ 1> }` is an error (exit 2 on the CLI). A `skip` naming
a subfield no article has is a `provenance.notes` line (a typo leaves the subfield it meant drawn); so is a config
entry naming a field no article has (`--article-fields names fields no article has …` — its `skip` and `number`
apply to nothing, and the field meant stays in the unplaced line). A field **not** named, and a nested
value that cannot be placed, gets a line `article fields not placed in any body …` in `provenance.notes` with its
routes — never dropped in silence.

### Design source per framework

Without `css/styles/<theme>.css` the design comes from the sheets the template's framework loads. The framework is
read from the template's own files by the quickstart inventory's classifier (`classifyTemplate`: the manifest's
`<t4>`/`<t3>` and plugin references, `etc/layout/*.json` or `*.ini`, `tpls/`) — never from its name. The sheets, in
cascade order, per template style:

| Framework | Sheets |
|---|---|
| T4 | `css/template.css` (the compiled base) · `media/t4/css/<style id>.css` (the style's own compiled settings) · `css/darkmode.css` |
| T3 | `css/*.css` (bootstrap, template, then the rest), each replaced by `css/themes/<theme>/<file>` when the style's `theme` is set and ships it, plus the files only that theme ships · `css/darkmode.css`. On a live capture, `t3-assets/css/*.css` is what T3 serves (it compiles there instead of `css/`). When pages of the style have a `render-routes.json` `stylesheets` record — whether or not `t3-assets/css/` is captured — and the records name the same template and compiled sheets in the same order, those sheets, in that order, are the style's rule source: a URL whose path, below the base path of `--site-url`, is exactly `t3-assets/css/<file>` is a compiled sheet, exactly `templates/<tpl>/css/<file>` (or `css/themes/<theme>/<file>`) a template sheet, anything else (media, module sheets) is listed in `excluded` and not read; a compiled sheet not linked is listed in `excluded`; a linked sheet not captured or not read (a record naming a compiled sheet while `t3-assets/css/` is not captured included) leaves the style unplaced; a URL is read as recorded, never as a URL parser normalises it, so one with a character a URI does not hold as written (a space, a tab, a `\`) or a path segment that is not a plain name (`.`, `..`, literal or percent-encoded, an empty segment inside the path — `/sub//x.css` is not `/sub/x.css`) refuses the record; a `--site-url` whose path is of that kind leaves the base path unknown, so no recorded sheet is below it. An absolute URL (`https://host/…`, `//host/…`) stands for the captured file only on the origin of `--site-url`; a compiled or template sheet linked from another origin, or from the same origin outside the base path of `--site-url` (`https://site.example/sub/` does not serve `/other/t3-assets/css/…` from its capture), is a sheet not read, and leaves the style unplaced. A page of the style with no record (a synthetic page no route renders — `404.html`, `single.html` —, a route captured without one) takes none of the style's values: it is listed in `inspection.css.styles[].unresolvedPages`, gets no design rule, and is left out of the site-wide tokens. Without a usable record (no page with one, records that differ, a refused record), the compiled sheets are read and recorded after the template's (rule counts, unsupported constructs), a template sheet with a compiled sheet of the same name is left out (listed in `excluded`), and the style is unplaced — no rule or token of it is published, and its gaps say why. The page-map palette falls back to the template settings |
| other, conflict, unknown | `css/*.css` · `css/darkmode.css`, with the gap reported: the adapter knows no compiled-sheet location for it |

`error.css`, `offline.css` and `frontend-edit.css` are page-mode sheets and are not read. A page's style is its menu
item's `template_style_id` (0 → the home style); a style of another template, or one the inventory does not have, is
kept as a style of its own with no sheet read: its routes carry no design rule, and the home style's sheets are not
lent to them. Every sheet goes through the bounded capture reader; a link, a special file, an oversized
or changed file is `skipped` with the reader's reason, a missing one `absent` — reported on the style, nothing
substituted. Directories are listed the same way, absence told from refusal: a theme sheet the reader refuses is
`skipped` and the base file of the same name is not read in its place; a theme directory that is a link or cannot be
listed leaves every template sheet of the style `skipped` (which ones the theme replaces, and which it alone ships, is
unknown); a `css/` or `t3-assets/css/` that cannot be listed is named in the style's gaps. A sheet the style's routes
load that is not read — an assigned `media/t4/css/<id>.css` not captured, any sheet skipped, a directory not listed, a
T3 theme that is set but not captured or not named plainly — may override any value of the sheets that are read, so
the style is unplaced as above: its sheets are read and recorded, and no rule or token of it is published.

Each style's sheets are parsed: declarations at the top level or under `@media` min/max-width are read; `print`
blocks are skipped. A rule that may apply under a condition the adapter does not read — inside any other conditional
block (`@supports`, `@container`, `@layer`, `@scope`, a media feature such as `prefers-color-scheme`), nested in a style rule
(its selector composed with the parent's), or in a block the sheet never closes (a browser applies it at the end of
the sheet; listed in the style's `gaps` with its selector and properties) — is never read as a value: it is a rival
that withholds every property, and every token, it can win, whatever its value. Inside `@media`, `@supports`,
`@container` and `@document` a rule ranks as one outside; inside any other block (`@layer`, where unlayered normal
rules win over layered ones and layered `!important` over unlayered; `@scope`; `@starting-style`; an at-rule not known)
its rank is not modelled, so it is taken to win wherever it can match — neither `!important` nor specificity
dismisses it. An `@import` (a sheet not followed), an `@namespace` (it changes what an unprefixed type selector
matches), an `@property` block (a token that does not inherit, or has an initial value), or stray text or statement (which a
browser folds into the next rule's selector) leaves the whole style unknowable: no value of it is published. Only
`@charset` and a `@layer` order statement are passed over among statements; `@font-face`, `@keyframes`, `@page` and
`@viewport`/`@-ms-viewport` (applied by no current engine) blocks are skipped. A custom property declared empty (`--x:`) is declared, so a `var(--x, fallback)` reading
it does not fall back. A custom property name keeps its case (`--Brand` is not `--brand`) and is compared with CSS
escapes decoded (`--\62rand` is `--brand`); other property names are case-insensitive. A `var()` whose first argument
is not one custom property name leaves the value unresolved, its fallback not standing in. Each of these, and a declaration without a property or value, is counted in `unsupported`.
The rules read are cascaded per variant (1440/390 × light/dark): `!important`, then
the specificity of the selector as written (`:root` over `html`, the `html[data-theme="dark"]` prefix over the bare
selector), then source order. Per role the first selector with a property resolved at all four variants is the rule:
`body-type`/`body-colors` (`body`), `heading-type` (`h1`, `.h1`), `link-color` (`a`), `container` (`.container`),
`main-body` (`.t4-main-body`, `.t3-mainbody`, `main`), `button` (`.btn`), `button-primary` (`.btn.btn-primary`,
`.btn-primary`).

A role's value comes from the rules whose selector is the role selector itself (the `html[data-theme="dark"]`
prefix set aside) and, for a plain element, from one exact form besides: that selector followed by `:not()`s of one
class or id it lacks (`a:not(.btn)`), no context. No other selector is taken to match for sure — not `html body`,
not `body > .btn`. Every other rule that can match the element is a rival, and a rival that wins withholds the
property at that variant. "Can match" is decided twice, either one enough:

- **A closed grammar and a closed model.** Selectors are read through a closed grammar (type, `*`, `#id`, `.class`,
  `[attr]` with any operator, pseudo-classes with their selector-list arguments, pseudo-elements, and the ` `, `>`,
  `+`, `~` combinators kept as written); a selector outside it — a namespace, an escape, nesting `&` — can match
  anything; `[a=x i]` is kept as `[a="x" i]`, its flag with it. The element has the role's type (a class role's
  element may be of any type but `html`, `head` or `body`: `input.btn`, `hr`, `button:not(.x)` can match `.btn`) and
  its own classes and id, and no other class or id; every other attribute is unknown, so it may be there with any
  value (`a[href^="https"]`, `a[target]`, `input[type="submit"]` can match; `a[class]` cannot match a plain link).
  Its `class` attribute lists its own classes in an order, repetition and spacing the sheets do not say, and is
  compared against every such list: `[class^="btn-primary "]` and `[class="BTN" i]` can match `.btn.btn-primary`,
  `[class*="border-"]` cannot. `body`, `html` and the main body are held once per page: any
  class, id or attribute may be on them, but a compound with one (or, for the main body, with a type) matches them
  only when it names them (their type, `:root` for `html`, their own class), a class-only rule being a component's;
  any other element is plain. The subject is at rest: no pointer over it or pressing it and no focus in it, so
  `:hover`, `:active`, `:focus`, `:focus-visible`, `:focus-within` on it, a pseudo-element or a `:not(X)` of what
  the element surely has cannot match; a state an element can be in at rest (`:disabled`, `:checked`, `:visited`,
  `:target`…), `:link`, `:first-child`, `:has()` and an unknown pseudo-class can; `:is()`/`:where()` when one
  branch can. The context is walked combinator by combinator, in any state. Where a plain element sits is not in
  the sheets: its ancestors and siblings may be of any type, carry anything and be hovered or focused —
  `section .btn`, `.card > .btn`, `li ~ .btn`, `.footer a`, `html.js .btn`, `.dropdown:hover .btn` are rivals;
  `:root > .btn` is not. `body`'s parent is `html` and its previous sibling `head`; `html` has
  neither; there a compound with a class matches `html`/`head` when the compound it joins names `body` (`.page
  body`), not through a generic one (`.table > :not(caption) > *`). The same holds for the main body: its ancestors
  may carry anything under a selector that names it (`.t4-wrapper .t4-main-body`), not under a generic subject. A
  page-mode body class (`contentpane`, `offline`, `error-page`, `t4-error-page`, `t3-error-page`) matches no route.
- **The selector engine on probe pages.** The element is built as the model has it — as a child of `body`, and two
  plain `div`s deep after a plain `div`, for a class role as a `div`, `span`, `a` (with an `href`), `button`, `input`,
  `section` and `li` — and every rule the jsdom selector engine matches there is a rival whatever the model says
  (`a.btn[href]` for `.btn`). A selector the engine cannot read leaves the model to decide.

The sheets alone do not say where a component sits, so on a full framework sheet a rule of some region usually
outranks `.btn`, `.container`, `h1` or `a` and their values are withheld, each gap naming the rule. Measured
2026-09-29: JA Vega (T4) keeps `body-type`, `heading-type` in part, `body-colors` and `main-body`, and its
design contract stays pending on the component category; JA Morgan (T3) keeps `body-type` and `body-colors`.
Rendered route markup would be the evidence that rules such contexts out; neither capture holds it.

`var()` resolves through the element's own custom properties, then those of `:root`/`html`; a declared fallback is
used only when nothing can set the token. A token is withheld when a rival can set it on the element, or a rule
on an element above can hand it down — for `body` a rule on `html` other than `html`/`:root` (`html.itemid-7`), for
any other element any rule on any element, hovered or focused too. The site-wide tokens (`tokens`) are those of
`html`/`:root` that no other rule can set on `html`: a rule whose selector can match `html` (`html.itemid-7`,
`html[lang]`, `:root:has(…)`, `*`) and can win there, or a conditional one, leaves the token unresolved (listed in
`unresolvedTokens`), since `html`'s classes and attributes vary by route. A cycle, an undeclared token without a fallback or a value still
to compute (`calc()`, `clamp()`, `color-mix()`, a CSS-wide keyword) leaves the property out. `padding`/`margin`
shorthands split into sides, `background` is `background-color` only when it is one colour, `font`/`border`
shorthands make their longhands unresolvable. A resolved value must then fit a closed grammar of its property — one
colour (not `currentcolor`), a non-negative length or percentage, a font size keyword, a line height number, a font
weight keyword or 1–1000, a comma list of font family names — or it is left out and named with the grammar; the
palette takes framework tokens and template settings only when they are one colour. A property contested, declared
but not resolved, outside its grammar, or resolved at some variants only is left out and listed in the style's
`gaps`. The design contract's `tokens` hold, per variant, the tokens every page resolves to one same value through
its style (they are checked on every page); a token the styles decide differently, one a style leaves unresolved, or
any token while a page's served sheets are not recorded (a page of the style's `unresolvedPages`) is left out and named in the provenance notes, and when none is common the contract stays pending and says so. The
page-map palette is the home style's. The T4 palette reads the
framework tokens (`--color-primary`, `--color-secondary`) and the body rule; the dark palette exists when the dark
cascade changes the body colours. `adapter-coverage.json` `inspection.css` (and `provenance.json`
`source.template.css`) records the framework and its evidence, per style its routes, sheets (`read`/`absent`/
`skipped`), rules with the files they came from, unresolved tokens and gaps, and the unsupported constructs per
sheet; a style's sheet gaps and rule gaps make its `template-style:<id>` item `partial`. Source CSS proves declared
rules, not rendered parity (Phase 8).

### Identity fields the source declares empty

An etc/site `site_slogan` declared as an empty (or blank) string is the fact `site.tagline = { value: "", status:
"absent-in-source", source: "joomla-identity" }`; `site.name` is one when etc/site declares `site_name` empty **and**
`site-config.json` declares `sitename` empty. The `joomla-identity` source names the settings file and what each
declares. A field not declared, or in a file that was not read, is no evidence of absence: no fact, and the gate
problem stays with its cause. A field that is not a string (a number, a list, an object, a boolean) is malformed: it is
not turned into text nor into an absence, `content.json` carries `null`, `provenance.notes` names it, and the gate
cause says `not a string (malformed; not read)`; a site name in `site-config.json` still applies. Nothing is filled in.

### Adapter coverage (`adapter-coverage.json`)

The spec-pack says what was extracted; the coverage report says what the source held and what became of
each part of it, so nothing is lost without a line saying so. One item per source entity.

**Body visibility is per route.** A route is a (menu item, path) pair; two menu items may share a path. Whether a route's page prints the
article body is decided once, by the composition's own rule (its layout has a component row and its style's `skip_component_content`
does not list the menu item). One typed result per layout feeds composition, coverage, page notes and the layout row: the **body** is `present`, `absent` or
`unknown`, and the **positions** are complete or not, each with named causes. Absence is proven only when every file the page draws was read in full and holds
only forms the reader supports: a T3 template/block whose `loadBlock` calls are literal and captured, no heredoc/nowdoc, no `<jdoc:include>` it cannot parse
(unclosed, repeated attribute, computed or missing type, `jdoc:include-…`), and none of the PHP it does not follow — `include`/`require`, `eval`, `JLayoutHelper::`,
`->loadTemplate()`/`->render()`/`->getBuffer()`, variable calls; a T4 layout whose root, `layout.sections`, rows and cells are well formed (a positions cell names at
least one plain position; a block cell's markup is captured with only literal, parsed includes). Any other case is `unknown` with the cause named in
`inspection.limitations` and the layout row: the body is kept as drawn, its loaders and body positions keep their impact, a module at a position the unread part
may draw is `unknown` (never `undrawn`, never orphaned or "not rendered" — also when another layout draws that position, and also for a sidebar position), and nothing is dropped as "not rendered".
A conditional component include or a return guard the reader does not support is `present` with a cause. The reader's finding that a fully read mainbody draws no component
is a result, not a cause. A layout that is not captured is a lone component. The list of recognised PHP forms is the contract; other PHP is not evaluated and is not claimed to print nothing. Every body-dependent figure — an article's
`{loadmodule}` loaders, a body `{loadposition}`'s modules, unplaced fields, animation usage — is derived only from routes whose body is drawn,
before paths are projected to `impact.routes`; module placement is matched per route, so a skipped route never suppresses a visible one that shares its path.
A `{loadmoduleid}` resolution is reported on the route pages where it happened (a post in its post body); it certifies nothing about another route,
and an article no drawn route opens loads nothing. Outer chrome and modules drawn outside the body keep their routes.

One item per source entity:

| Kind | One item per | Identity |
|---|---|---|
| `validation-gap` | problem the spec-pack gate reports on the pack of the same run (none on a valid pack) | `validation-gap:<artifact>:<n>` (n-th problem on that pack file, in the gate's order) |
| `route` | entry of `render-routes.json` | `route:<menu id>:<path>` |
| `menu-item` | `#__menu` row (administrator and root rows included) | `menu-item:<id>` |
| `article` | `#__content` row (trashed included) | `article:<id>` |
| `content` | content portion the source holds and no body draws: an unplaced extra field, an article body kept under `droppedContent` | `content:field:<name>` · `content:body:<article>@<file>` |
| `category` | `#__categories` row (every extension) | `category:<id>` |
| `module` | `#__modules` row (administrator, unpublished and unassigned included), with its type, ACM kind and position | `module:<id>` |
| `template-style` | `#__template_styles` row | `template-style:<id>` |
| `layout` | `etc/layout/*.json` file of the captured template | `layout:<name>` |
| `layout-block` | T4 block a layout names (`html/layouts/t4/block/<name>.html`), captured block file no layout names, layout cell of an unknown type, the mega menu (`etc/navigation/<name>.json`) | `layout-block:<name>` · `layout-block-file:<file>` · `layout-cell:<layout>#<row>.<i>` · `megamenu:<name>` |
| `animation` | animation library the capture declares or uses (`ANIMATION_LIBRARIES`: AOS, Owl Carousel, WOW, animate.css, GSAP, ScrollReveal, Isotope, Swiper, Slick, Lottie, parallax) | `animation:<library>` |
| `asset` | declared script or style no animation signature recognises: an `etc/assets.json` key, an `etc/global.json` `system_addons` entry, a folder or file directly under `js/` | `asset:<file>#<key>` · `asset:<path>` |
| `extension` | `#__extensions` row when the dump has the table (a plugin element in two folders is two rows); a referenced component, module type or template with no row of its type and element | `extension:<extension_id>` · `extension:<element>` |

The five table kinds and `route` are reconciled with their denominators (`denominators`), and `validation-gap`
with the gate's problems: the report is not written when an item count differs. Two entities with one identity are an error, never an
overwrite.

**Status** — extraction at stage 2 only; whether a later phase renders the entity as the source does, and
parity, are decided at Phases 3–8:

| Status | Meaning |
|---|---|
| `mapped` | extracted into the target(s) named in `target[]` |
| `partial` | extracted, with a portion lost or unresolved; `reason` says which |
| `unsupported` | not extracted, or kept only as raw source data no declared target reads; `reason` says why |
| `skipped-by-rule` | left out by a documented rule (administrator rows, trashed or unpublished rows, the menu and category roots, a non-content category, a style or layout no route uses, a module with no mapping that the source draws on no route and nothing loads with `{loadmodule}`, a field or a subfield holding a value that `--article-fields` skips, a library installed but not used, a captured block no layout draws); not content of the rendered site |

Raw preservation is not a mapping: a module type outside the declared targets (`MODULE_TARGETS` —
`mod_ja_acm`, `mod_custom`, `mod_menu`, `mod_jamasthead`, `mod_articles_category`, `mod_articles_categories`)
is `unsupported` although `sections.json` `other[]` keeps its params. A declared type is `partial` when a portion
is not read: an ACM type with no captured `acm/<type>` or no `tmpl/<style>.xml` schema, config keys the ACM
normaliser skips, a `mod_custom` kept as `core/html` (the "no section type matched" note), a list module drawn
by a layout override (`params.layout`), a menu type `menus.json` does not hold, a masthead on page routes.

**Route impact** (`impact`) is read from the source, not from what the adapter placed: a module's `routes`
are the render routes it is assigned to (`#__modules_menu`: ALL, only these, all except these) on which the
source draws its position — the route's layout rows, the blocks those rows name, the style's sub-layout on an
article view, the mega menu (positions and module ids), a template override that loads the position
(`{loadposition}` or `<jdoc:include type="modules">` in `html/com_content/<view>/<layout>.php`), or the article's
own `{loadposition}`. A module a `{loadmodule}` / `{loadmoduleid}` marker loads (`loadedBy`) is drawn on the
routes of what loads it too — the routes that open the article **and draw its body** (a route in `skip_component_content`, or a post
the route does not draw, contributes nothing; an article no drawn route opens contributes no `loadedBy`), or the known and unknown routes of the loading
module, resolved through chains. A loaded module is
never `skipped-by-rule` for being drawn nowhere: an unmapped type on a position no layout draws stays `unsupported`
with its loaders' routes, and a module with no `#__modules_menu` row that a marker loads is `unsupported` with its
loaders' routes in `unknown` (`loadedUnassigned`), since whether Joomla's module list includes it there is not traced. `placed` is where
stage 2 put it; `missing` the routes the source draws it on and stage 2 placed it nowhere (a module of a layout
row, not the chrome); `unknown` the routes whose layout, block or mega menu is not captured or whose override
is not traced; `undrawn` the routes it is assigned to that draw it nowhere. Composition asks the same per-route resolver (`routeDrawing`), so a route in `undrawn` is exactly a route where the page leaves the module out as orphaned. A gap route counts once, as its own
`route` item. `untraced` (animation and asset items, articles opened by no route) names evidence whose routes
are not traced at all: it is never counted as a route.

**Critical** (`critical: true`, listed first): a spec-pack gate problem (`validation-gap`, always `unsupported`), a routed module with no mapping, a routed module placed nowhere
the source draws it (a layout row, a `{loadmodule}` marker), a masthead printed on page routes, content the
source holds and no page or post carries (a page article no route opens, an unplaced field, a missing article,
a gap route), a routed page on a template that is not captured, a layout cell of an unknown type on a routed
layout. Then items
sort by status (`unsupported`, `partial`, `skipped-by-rule`, `mapped`), kind, identity.

**Summary** (`summary`): `byStatus`, `byKind` (status per kind), `critical` (count, per kind, ids),
`moduleTypes` and `acmKinds` (instances, status, critical, distinct routes), and `affected` for `unsupported`,
`partial` and critical items: `instances` = distinct module ids, `routes` = distinct paths of their `impact.routes`
— a module on every page is one instance and each page is counted once, however many items touch it —
and `possibleRoutes` = distinct paths of `impact.routes` ∪ `impact.unknown`, the routes the items may reach
when a placement is unknown (`moduleTypes` carries both too). `routes` alone undercounts a dump whose layouts
are not all captured; `possibleRoutes` bounds it from above.
`extension` items roll up their members and are never `critical` themselves (the members are).

**Inspection** (`inspection`): every capture read of the run — the site, theme and css files, `templateDetails.xml`,
the layouts the pages are composed from, the ACM schemas, then the census walks — goes through one read-only,
bounded reader: no symbolic link followed (`capture/`, `capture/templates/`, the template directory and every
directory under it included), only plain names under `capture/templates/<tpl>` on the dump's real path, special
files (a FIFO is never opened) and files over 1 MiB reported in `capture.skipped`, not read. Each directory on the
way is pinned (device, inode) when first seen and checked before and after every open and listing; the open refuses
a link as its last component (`O_NOFOLLOW`) and, on macOS, anywhere on the path (`O_NOFOLLOW_ANY`), and must be the
same regular file the check saw, at most 1 MiB; after the read its name must still be that file. A file or
directory swapped while the capture is read is reported (`changed while the capture was read`) and what was read
through it is dropped; the file walk stops at 5,000 files. Every name found or listed is remembered: only a
name never seen and missing (ENOENT) is absence, and a name seen and then gone is reported as changed. Any other
error looking one up (EACCES, EIO) is reported with its code (`could not be inspected`), on the first walk and on
the walk after a read or listing alike. Node has no
descriptor-relative open, so each name is looked up under a handle to the directory already opened
(`/.vol/<dev>/<ino>` on macOS, `/proc/self/fd/<fd>` on Linux); elsewhere the capture is not read. `inventory.json`, `render-routes.json`, `content-params.json` and `site-config.json` are each read once
without following a link (a link, a directory or a pipe is refused naming the file), and the value whose shape is
checked is the value every later step uses. `limitations[]` names what could not be
inspected: a missing capture, the animation signatures recognised (a library loaded from outside the capture is
not seen), and — without an `extensions` table — that the extension items are those referenced, not an
installed-extension census. `spec` records the spec-pack validation of the same run (`valid`, `problems`) and,
in `causes[]`, one `{ problem, cause }` per problem: the source input it traces to — the `site_name` the etc/site
file declares and the `sitename` of `site-config.json` (or that the dump has none), the `site_slogan` it declares when it is not a string (configuration.php has no tagline; an empty string is a fact, not a problem), the theme css (`css/styles/<theme>.css`) that is absent or unread and, in its place, the framework sheets of the home style that were read or not, the palette rows left `TODO` —
or `null` where the adapter has no trace — and `coverageId`, the `validation-gap` item of that problem. That
item carries the exact `problem`, the `cause`, the pack `artifact` and the source paths the cause names
(`evidence`); its `reason` says `cause unknown` when the cause is `null`. Its `impact.scope` is `site-wide`
(identity, theme, design contract, design spec, the pack's own files: every non-gap render route), `page <file>` (the
routes of that page) or `unknown` (no route counted). Gap items count in `byStatus`, `byKind`, `critical` and
`affected.routes`, never in the table denominators or module instances. Nothing is filled in to pass the gate;
the CLI still exits 1 on an invalid pack.

**Writing**: one run at a time writes a pack — the run takes `<out>.lock` (created exclusively) before its first
write and releases it after the report, on success and on failure; a second run is refused before it writes
anything, naming the process that holds the lock. A lock whose process is gone is not taken over (two runs
doing so at once could both win): the message names it as stale and the file to remove. The report is written
after every other file, through a temporary file and a rename. A rerun
with `--force` removes the earlier report before it writes anything, so a run that fails midway leaves no
report of another run beside its files; a run refused without `--force` leaves the old pack and report as they
were.

Measuring a real dump, read-only (the output goes to `$P2_COVERAGE_ARTIFACTS/p2-ja-vega/`, with the counts
in `p2-ja-vega-counts.json`, which names the source of the com_content options; the test fails, rather than
skips, when the dump or its com_content options are missing, when a source byte changes, when an item count
differs from its raw table, or when a report invariant fails. The spec verdict is recorded as it is (`spec.valid`,
problems, causes) and does not decide the measurement: the coverage is accepted with `spec.valid: false` only
when every problem is a linked, critical, `unsupported` `validation-gap` item with its reason and evidence, the
critical items come first and the summary equals the items counted again. Accepting the coverage does not make
the pack usable downstream — `spec-pack.mjs --validate` still refuses it):

```bash
P2_COVERAGE_SOURCE=<j6-dir> P2_COVERAGE_ARTIFACTS=<dir> \
  [P2_COVERAGE_SOURCE_BASELINE=<before.json> P2_COVERAGE_PARAMS_EVIDENCE=<export.json>] \
  [P2_COVERAGE_SITE_CONFIG_EVIDENCE=<site-config-export.json>] \
  [P2_COVERAGE_CONTENT_PARAMS=<com_content.json>] \
  node --test --test-name-pattern="JA Vega" scripts/test/adapter-coverage.test.mjs
```

The options come through the adapter's own resolution. A dump made before the extensions table was exported
is repaired additively: its manifest (`{ root, files: { <path>: <sha256> } }`) is taken first, then the one
com_content row is exported read-only from the source database into a new `content-params.json` (created
exclusively, never over an existing file), and the export is recorded (`container`, `database`, `prefix`, the
`query`, the `rows` it answered, the written `file` and its `sha256`; never a password). With both files given,
the test checks before and after the run that every file of the manifest is byte-identical, that
`content-params.json` is the only file added, that its hash is the one written, that its options are the params the
SELECT answered, and that the export read the container, database and prefix the dump's `dump.json` names.
A dump made before `site-config.json` existed is repaired the same way: the allow-listed fields are read through
the same PHP code from the web container of the same compose stand into a new `site-config.json`, and the export is
recorded (`container`, `dbContainer`, `composeProject: { web, db }`, the `fields` asked, the `answer`, the written
`file` and its `sha256`). Given that record (`P2_COVERAGE_SITE_CONFIG_EVIDENCE`, or
`p2-ja-vega-site-config-export.json` beside the params record), the test also checks that the two files are the
only ones added, that the web and database containers are one compose project and the database container is the one
`dump.json` names, that the fields asked are exactly `SITE_CONFIG_FIELDS`, that the answer holds no other field, and
that `site-config.json` is the answer as strings with the recorded hash. The counts name the site name and its source
(`siteName: { value, from }`).
`P2_COVERAGE_CONTENT_PARAMS` is an explicit override only; options kept outside the dump must sit beside a
`dump.json` naming the same database, prefix, source and site URL as the dump's own `dump.json` (an export of
the same database); other options are refused, not used. With `P2_COVERAGE_ARTIFACTS`
set, the test scratch goes under `$P2_COVERAGE_ARTIFACTS/p2-scratch/` and is removed after the run.

### T3 (Bootstrap 3) sources (#67)

A T3 template has no `etc/layout/*.json`; the adapter reads what the capture holds (`joomla-layout.mjs`):

- **Layout.** The style's `mainlayout` param names `etc/layout/<name>.ini`; the order the page draws its positions is the
  order of the literal `$this->loadBlock('…')` calls of `tpls/<name>.php` (falling back to `tpls/default.php`), each
  block's positions read from `<jdoc:include type="modules" name=…>` only (`countModules('x')` in a condition asks about a position, it draws none). Blocks named
  `topbar`, `header*`, `footer*`, `off-canvas`, `mainnav`, `head*`, `spotlight`, `navhelper` are chrome; the sidebars
  `mainbody` names go to `pages[].aside`. `<jdoc:include … name="<?php $this->_p('x') ?>">` names a `[x]` section of the INI; the position drawn is its
  `position=` (a section without one, or none, is a gap). A computed or concatenated block name (`'x'.$var`), a missing block file, a
  block loaded more than once (placed once, at its first load) or missing `tpls/` is a named gap (`adapter-coverage.json` layout row).
  PHP is not evaluated (`joomla-php-scan.mjs`): a form written in a comment is not read, and a load or include written under a condition (`if`, `foreach`, `?:`, `&&`) is a named gap (the component is then assumed, never proven). Text inside a PHP string is not executed (a `loadBlock(...)` there is no load; a `<jdoc:include>` there is a named gap). A position under a condition other than `countModules(...)` guards is a named gap. Blocks and positions are placed in the order the text names them, nested blocks included. The sidebars are the INI `position=` of the sections `mainbody` names; positions drawn inside `mainbody` and its blocks are placed in text order around the component.
  An include without `type` or with an unrecognised type leaves both the body and positions unknown; `type="module"` names one module that is not read and leaves positions unknown. `head`, `message`, `metas`, `styles` and `scripts` draw none and are ignored.
  The component is drawn where a `<jdoc:include type="component">` is read in `mainbody` or the blocks it loads; none there
  (and nothing unread) means the layout prints none; an unread block keeps it, assumed, not dropped on a guess.
- **`skip_component_content`.** Only the exact guard `if (is_array($this->getParam('skip_component_content')) && in_array(JFactory::getApplication()->input->getInt('Itemid'), $this->getParam('skip_component_content')) && JFactory::getApplication()->input->getString('option') !== "com_config") return;` (Morgan/T3 `mainbody.php` lines 16–19, and the T3 fixture copy; whitespace outside string literals may vary; the shorter forms have no captured source and are unknown) is a skip rule, and only when it is the sole `return` of the file: the complete source is read with a PHP tokenizer (`php-parser`, `joomla-php-tokens.mjs`), so comments, strings, heredocs and HTML text are never returns, and a second guard, a bare `return;`, a return in a nested block or after `?>` … `<?php`, or PHP the tokenizer cannot read to the end (unterminated string/comment/heredoc, unbalanced brackets) keeps the body with a gap. Any other expression — a shorter form, an appended `&& false` / `|| true`, an extra or reordered clause, an inverse, equality or ternary, a changed quote or literal, or any other `return` — is unknown: the body is kept and a gap is named. When `blocks/mainbody.php` honours it, the menu items the style lists print no component
  and no sidebar: the article body goes to `droppedContent`, with a note.
- **Assignments.** `#__modules_menu` rows read as Joomla reads them (`assignedTo`): 0 = every page, a negative id = every
  page except, positive ids = only those.
- **Design.** A style whose routes are served different `t3-assets/css/*` lists is resolved per list (`joomla-design-merge.mjs`);
  a value is the style's only where every list gives it. The leading `@import`s of a captured sheet are followed when the
  capture holds the file (`joomla-imports.mjs`: plain paths, no condition, no cycle, bounded); one it does not hold keeps
  the sheet unresolved and names the file — an icon font is not exempt. A recorded same-origin sheet outside the template's
  `css/` and `t3-assets/css/` (module, media) is read from the capture in its place in the cascade; one the capture lacks is
  named in the style's gaps, and the rules of every sheet read for that style are not published (specificity and `!important` let a missing sheet win wherever it is linked). The LESS palette (`joomla-less.mjs`: literals,
  `@references`, theme overrides last; expressions are never computed) is the fallback for `palette` and the body font,
  with file and line in `provenance.json` and a note. A LESS text is read whole or not at all (an unclosed string, comment or `{` refuses the file; a last statement may end without `;`). A LESS `@import` of a captured file is followed in place; one that
  cannot be read (not captured, unparsable, conditional, computed, too deep) leaves the declarations written before it unresolved, named.
- **Modules.** A module at a `T3Section` position carries `frame` (`joomla-normalize.mjs`: `color-module`, `bg-module`,
  `bg-position`, `padding-*`, `border-*`, `module-width`, `sub-heading`, read as `modChrome_T3Section` reads them, with the
  class list it prints). An ACM group stored as an object (`type[G]` holding `type[G][field]` lists) is expanded into the lists;
  no value becomes `"[object Object]"`. A link written `index.php/<route>` resolves to the route's WordPress path. A home
  alias that is the first segment of other routes (`/home/home-style-1`) is `front-page`. The synthetic `single.html` reference
  is `<category route>/<id>-<alias>` unless com_content `sef_ids` removes IDs.

### Pages and posts beyond the markup (#73)

- `{loadmoduleid N}` in an article: a `mod_custom` module is inlined; another published module with a position becomes a slot
  (`content: [{ kind: "slot", position, modules: [N] }]` when the marker is at the top level of the body, else a slot by
  position and a note); an unpublished module prints nothing; any other marker stays text and makes the article's coverage row
  **critical**. Whether Joomla filters the module by its assignment is not traced, and a note says so. A post body resolves the
  marker the same way (no menu item, so no assignment is checked; an ACM module is a slot block `{"position":…,"modules":[N]}` naming the module; the post seeder does not expand slot blocks yet, so a note says the module is not drawn in the post until it does).
- Posts and pages: `featuredImage` is the full-text image when there is one, `introImage` the card's; alt follows the image.
- A `com_content` `featured` view that is not the front page carries `featured: { articleIds, count, perPage?, paging? }`;
  `order` and `orderBy` are present only when the menu selects frontpage ordering and every listed article has a valid
  `#__content_frontpage.ordering` value. Otherwise order is omitted, never `null`; the coverage row is `partial`.
- `menu_show: 0` → the item is `published: false` in `menus.json` (with `menuShow: false`); the route still answers.
- A menu item's non-empty `page_heading` (with `show_page_heading` on) is the title of a listing or page route; `menuLabel` keeps the menu title. Explicit `show_page_heading: 0` is `pageHeading: { hidden: true }` on that route. The seeder assigns `page-no-title`, generated from the built theme's `page.html` without its `core/post-title` block and registered in `theme.json` only when a route needs it. Unset/`1` without custom text adds no key and keeps the existing template.
- `com_contact`: the allow-listed `#__contact_details` row is `contact` on the `page-contact` page; the seeder writes its non-empty name, position, address, phone, email, links and misc fields into editable page blocks. A dump without the table or matching row is a named gap. An existing Contact Form 7 mapping continues to provide the form after the record fields.
- `render-routes.json` `status`/`location` → `page-map.pages[].status` / `location` (http-parity reads them).
- Dump: `joomla-dump.mjs --capture --site-url <url> (--web-container <c> | --web-service <s>)` builds `capture/` (template
  directories, `t3-assets`, `media/t4`, the imports the copy lacks) and records each route's status, `Location` and linked
  stylesheets (`joomla-capture.mjs`); it never overwrites an existing `capture/`. The dump also reads `profile.user_jobtitle`,
  `profile.aboutme`, `profile.user_social` and `#__contact_details` (allow-listed columns).

**Known gaps (reported, not silent).** ACM item counters are read from captured `acm/<type>/tmpl/<style>.php` layouts only
when the bound variable has exactly one executable assignment before the loop, that assignment is
`$helper->count('field')`, and the variable is never reassigned. The loop must be `for ($i = 0; $i < $bound; $i++)`; its
printed counter variable must be assigned exactly once in the whole layout, inside that loop, from `$i + 1`,
`sprintf("%02d", $i + 1)`, or `str_pad($i + 1, …)`. The echo must be unconditional inside the loop or enclosed directly
by one `if` with a supported scalar comparison on `helper->get('field')`. The guard is evaluated against that ACM
instance's fields and the echo's own if/else branch. Any other loop, assignment, or print path is named in
`unresolvedComputedFields` and is never guessed. Each item gets the printed text under the PHP variable name (for example
`number`); the ACM entry lists that name in `computedFields` so a declared item slot can read it. Other template-computed
values (image side, slide direction, video link — #73 S-11) remain gaps. The seeder and visual branches consume `frame`,
#73 S-11) remain gaps. The seeder and visual branches consume `frame`,
`featured`, `contact`, `introImage`, `pageHeading` and `status`; the adapter declares them, it does not verify them drawn.
Replay on the two pilots: `node scripts/test/issue67-73-pilot.mjs --morgan <j6> --nova <j6> --out <dir>` (a ledger of the items;
`PARTIAL` while a dump lacks the capture or a table).

### Source fonts (Phase 2 gate)

A port compares itself with its source, so a source that renders in a fallback font passes every port-side font
check. Phase 2 therefore judges the SOURCE on its own, twice, and records both in `source-fonts.json`
(`tracy.source-fonts/1`: `static`, `browser`):

1. **Static** (`quickstart-inventory.mjs` → `sites[].sourceFonts`; `from-joomla.mjs` runs the same analyzer on the
   capture — `capture/plugins/system/t4/admin/etc/googlefonts/` is part of it). For each template style a published
   component menu item uses, plus the default style: T4 reads `templates/<t>/local/etc/<group>/<profile>.json`, else
   `etc/…`, **the file wholesale**; a profile that is missing or an empty file falls back to `default`; the theme
   profile fills only keys the site file lacks, and `""` stays empty. `body_font_family` empty or missing → T4 omits
   `--body-font-family` and the page renders in the browser default serif (`font-family-unset`; heading / menu empty
   with a body family inherit it and are not findings). A family needs a loader: it is in T4's shipped Google list
   (and `dont_use_google_font` is off), or `etc/customfonts.json` / `fontcustoms.json` names it and its files exist, or
   an **active** sheet (`css/template.css`, `theme.css`, `custom.css`, and the sheets they import) `@import`s it or
   declares `@font-face` with a src that exists (every loader is judged before a family counts as unloaded; a custom-font
   stylesheet counts only through a `@font-face` of that family; `dont_use_google_font` resolves per key like the families). A name outside the list (legacy "Muli", now "Mulish") is never loaded
   (`family-never-loaded`); it is not renamed. T3: the families `less/variables.less` / `css/template.css|bootstrap.css`
   declare — and the main menu (`@navbar-font-family` or a `.t3-megamenu` / `.navbar` rule; none declared = it inherits
   the body, reported as such) — must be loaded by a sheet `etc/assets.xml` activates (or one that sheet imports), or a
   Google link there; a file merely sitting in `css/` loads nothing. Unknown styles, menu, profile, Google list, an absent
   `assets.xml` or an active sheet whose text was not read are gaps (`complete: false`), never a pass or a missing loader.
   The report digests every file the verdicts were read from (`inputs`; a font file by its bytes). T3 judges the *effective*
   declaration: the LESS variable is the weakest, then the active sheets' rules in cascade order (an import before its importer);
   an overridden declaration is not judged, and only a selector naming `.t3-megamenu` / `.t3-mainnav` / `#t3-mainnav` is the menu.
2. **Browser** (`source-font-browser.mjs`, read-only): home, one page per used style, one nested SEF URL, at 1440 and
   390; for body, h1–h3 and nav text the requested family, the font that drew it, `document.fonts` and failed font
   requests. The browser default serif, a web family drawn by a system font, a heading the size of the body text at
   1440, and a failed font request for a requested family are findings. A page with no body reading, a missing
   width, style or nested route is incomplete evidence.

The browser reading is bound to its source: it carries a hash of the effective static report it was planned from (source
identity, used styles, menu routes, the digest of every font input file, profile files, families, loaders, verdicts —
recomputed by the gate, so a font, sheet, font file or loader changed since the measurement no longer matches) and the site it measured. The pack must record its `siteUrl`; the gate
checks every page against the menu — the home page is `/` drawn with a default style, a style or nested page is a menu route
of that very style (an `--route` extra page too, or it claims no style), and the URL the browser ended on once the page settled (`finalUrl`) is exactly that route on the measured site (a leading `/index.php` and trailing slashes aside) — and refuses unresolved pages. The nav
sample is the template's main navigation only — the framework's own menu containers (`.t4-megamenu`, `.t3-megamenu`, `#t3-mainnav`, the off-canvas `.navbar-nav`); a footer, sidebar, utility or account menu is never borrowed ( a collapsed menu is opened by a
header toggle first, and nav is absent when there is none).
For a Joomla dump, measure against the dump's own static report: `source-font-browser.mjs --site <origin> --dump <j6-dir> --out m.json`
(`--static` takes a quickstart inventory instead; give exactly one), then pass `m.json` as `--source-fonts-browser`. A requested web family counts as drawn only when the font that
drew most of the node's glyphs is that family, or the node read again with its font-family forced to that family draws with
the same face (an internal-name alias tied to the node).
Menu items of every routable type count (an alias's style is examined; a heading, separator or URL renders nothing).
A source that declares no body family leaves `page-map.theme.fonts.body` null — nothing is borrowed from other CSS — and
that fault is reported once, by the source-font gate.

`spec-pack.mjs --validate` (and from-joomla's own validation) fail a Joomla pack on any `source-font` finding or
incomplete evidence. The message says the fault is in the SOURCE template, names file / key / style / page, and that
the fix belongs in the source repository before porting. The only other way through is a decision: one entry of
`DECISIONS.md` (`--decisions`, read at validation) whose text contains the finding's key
(`source-font:static:<template>:style-<id>:<role>:<code>` or `source-font:browser:<route>:<width>:<role>:<code>`),
not duplicated, not `status: open`, named by no other decision. The spec-pack keeps the declared family and the
measured one apart (`design-spec.md` §Source fonts; `page-map.theme.fonts` is the declared family only, never a
measured fallback). Real runs, one release / version / outcome per call: `node scripts/test/source-font-real.mjs --mode static|browser
--gh <gh> --repo <owner/name> --release quickstart/<id>/j6 --version <x.y.z|current-pin> --expect pass|fail [--site <origin>]
--artifact-root <dir>` (assets `<id>-webroot|database|quickstart-<version>.*`, verified by SHA256SUMS or the asset digest,
never the current manifest).

### What the adapter does NOT do

- **No rendering**, no screenshots, no calls to the running site: `reference.json` only records URLs; Phase 8 does the comparing. (Only `joomla-dump.mjs --capture` requests the site's pages, to record their status and stylesheets; `from-joomla.mjs` never does.)
- **No image copying**: `images/…` is only rewritten to `/wp-content/uploads/<basename>` and listed in
  `pages[].images` / `posts[].images` / `sections.custom[].images`; the seeder uploads them itself from the original `images/` tree.
- **No pattern generation**: `sections.json` is instance data; the PHP patterns of the 18 ACM types are the theme's job
  (see `tasks/tracy-base-wp7/acm-blocks.md`).
- **No export of the administrator menu** (`main`, `client_id 1`) — it is not the site's navigation.
- **No guessing author names**, no invented dark palette when the CSS has no remap, no numbers filled into design-spec
  slots the source does not declare.

Issue tests: `scripts/test/issue67.test.mjs` (T3: `fixtures/issue67/t3`) and `issue73.test.mjs` (`fixtures/issue73/nova`, the capture tar reader, crawl and imports against a local site, `--capture` end to end through `fixtures/issue73/fake-docker-capture.mjs`, the pilot harness).

Dump test: `scripts/test/joomla-dump.test.mjs` runs `joomla-dump.mjs` against a fake `docker`
(`fixtures/issue41/fake-docker.mjs`) and ingests the result with no side file. The `configuration.php` case runs the
real `php` (skipped where it is not installed) on a file holding credentials and checks that none of their values
reaches `site-config.json`, `dump.json`, the dump's output or the spec-pack; a `php` that ignores the field list is
refused without printing a value.

Test: `scripts/test/from-joomla.test.mjs` + `html-to-blocks.test.mjs` on the fixture
`scripts/test/fixtures/joomla-min/` (2 articles, 2 categories, menu `tracy` with 3 nested items + menu `utility`, including
a custom page heading and a contact route with a dumped contact record, 2 ACMs including one nested repeat, one mod_custom,
minimal layout + tokens + schema, `content-params.json` with the global com_content options).

Coverage test: `scripts/test/adapter-coverage.test.mjs` on `scripts/test/fixtures/joomla-coverage/` (a template
`cov` with a gap route, a route to a missing article, a page article no route opens, an unplaced field, a
layout without a component row, an undecodable ACM, unmapped module types on routed pages, an all-except
assignment, a module drawn only by `{loadmodule}`, a mega menu module, a template override position, a
sub-layout, an uncaptured block, an unknown layout cell, a route on an uncaptured template, AOS used and Owl
Carousel installed only).

---

## 1. Article content = block markup in `post_content`

**Confirmed.** The block editor keeps a block tree in memory, and on save *serializes* it into HTML with
block-delimiter comments; that is the only canonical form in the DB.

- Data flow — https://developer.wordpress.org/block-editor/explanations/architecture/data-flow/
  > "the block editor transforms its data into something that can be saved in `post_content` through serialization."
  > "the serialization process converts the block tree into HTML using HTML comments as explicit block delimiters—which can contain the attributes in non-HTML form."
  > "the block editor workflow parses the saved document to an in-memory tree of blocks, using token delimiters to help."
  > "This assures that there's a single source of truth for the content, and that this source remains readable and compatible with all the tools that interact with WordPress content."
  Example given on the page: `<!-- wp:image --><figure class="wp-block-image"><img src="source.jpg" alt="" /></figure><!-- /wp:image -->` and the dynamic block `<!-- wp:latest-posts {"postsToShow":4,"displayPostDate":true} /-->`.
- Key concepts — https://developer.wordpress.org/block-editor/explanations/architecture/key-concepts/
  > `<!-- wp:paragraph {"key": "value"} --><p>Welcome to the world of blocks.</p><!-- /wp:paragraph -->`
  > "Blocks understand content as attributes and are serializable to HTML."
- `@wordpress/blocks` — https://developer.wordpress.org/block-editor/reference-guides/packages/packages-blocks/
  - `serialize(blocks, options?)`: "Takes a block or set of blocks and returns the serialized post content."
  - `parse(content, options?)`: "Utilizes an optimized token-driven parser based on the Gutenberg grammar spec … which, given a general HTML document as an input, returns a block list array representation."
  - `createBlock(name, attributes?, innerBlocks?)`, `getBlockContent(block)`: "Given a block object, returns the Block's Inner HTML markup."

Consequence for the port: every Joomla article must be generated as a valid block markup string (open/close
comments + JSON attributes), not bare HTML. Bare HTML still saves, but the editor treats it as a
"Classic"/unknown block.

---

## 2. Core post types used for content and site structure

Authoritative source for the list and the registration flags: `create_initial_post_types()` —
https://developer.wordpress.org/reference/functions/create_initial_post_types/ (the table below is taken from the source code on that page).
User page: https://wordpress.org/documentation/article/what-is-post-type/ (only lists post · page · attachment · revision · nav menu · custom_css · changeset; the `wp_*` types are not on this page).
`register_post_type()` lists the reserved names: "post, page, attachment, revision, nav_menu_item, custom_css, customize_changeset, oembed_cache, user_request, wp_block, wp_global_styles, wp_navigation, wp_template, wp_template_part" — https://developer.wordpress.org/reference/functions/register_post_type/

| Post type | Stores | Block markup? | public / show_in_rest / hierarchical | rest_base | Docs |
|---|---|---|---|---|---|
| `post` | time-based blog posts; has categories/tags; goes into RSS | yes | true / true / false | `posts` | https://wordpress.org/documentation/article/what-is-post-type/#posts — "Posts are normally displayed in a blog in reverse sequential order by time… Posts are also used for creating RSS feeds." |
| `page` | static content, parent/child hierarchy, no categories/tags | yes | true / true / **true** | `pages` | https://wordpress.org/documentation/article/create-pages/ — "Pages are for content that isn't time-dependent… can be organized into parent pages and subpages… by default do not allow taxonomy" |
| `attachment` | uploaded media; image/video metadata in `wp_postmeta` | no (descriptive HTML) | true / true / false | `media` | https://wordpress.org/documentation/article/what-is-post-type/#attachments |
| `wp_block` | **synced pattern** (formerly reusable block); label "Patterns" | **yes** — post_content is the pattern's block markup | false / true | `blocks` | key-concepts: "stored as a hidden post type and function as 'dynamic blocks that "ref" or reference the `post_id`'"; https://wordpress.org/documentation/article/reusable-blocks/ |
| `wp_template` | a template the user edited in the Site Editor (overrides the `templates/*.html` file) | yes | false / true | `templates` | https://developer.wordpress.org/themes/templates/templates/ — "if you save these, they will be stored in the database and will overrule any templates in your theme." |
| `wp_template_part` | a template part the user edited (overrides `parts/*.html`) | yes | false / true | `template-parts` | https://developer.wordpress.org/themes/templates/template-parts/ — "User-created template parts saved in the database (these are stored as posts in the `wp_template_part` post type)." |
| `wp_navigation` | the Navigation block's menu; label "Navigation Menus"; post_content is a list of link blocks | yes (`core/navigation-link`, `core/navigation-submenu`, `core/page-list`…) | false / true | `navigation` | https://make.wordpress.org/core/2023/08/23/whats-new-for-navigation-in-wordpress-6-2-and-6-3/ (the Navigation block "ref"s a `wp_navigation` post) |
| `wp_global_styles` | the **user's** theme.json JSON (origin "user"), tied to the theme through the `wp_theme` taxonomy | **no** — post_content is JSON `{"version":…, "isGlobalStylesUserThemeJSON":true, …}` | false / true | `global-styles` | https://developer.wordpress.org/reference/classes/wp_theme_json_resolver/get_user_data_from_wp_global_styles/ — "the custom post type that contains the user's origin config for the active theme" |
| `wp_font_family` | font family definitions in theme.json format | no — JSON | false / true / false | `font-families` | https://make.wordpress.org/core/2024/03/14/new-feature-font-library/ — "'Installing' a font 'saves the theme.json formatted settings from the collection into the database'" |
| `wp_font_face` | individual font faces (`src`, `fontWeight`, `fontStyle`, `fontFamily`); font files in `wp-content/fonts` | no — JSON | false / true / false | `font-families/<id>/font-faces` | https://make.wordpress.org/core/2024/03/21/font-library-update-storage-of-font-files/ — "WordPress Core will by default only attempt to store font files in the `wp-content/fonts` directory" |
| `nav_menu_item` | **classic menu** (Appearance › Menus) — still exists, not what a block theme uses | no | false / true | `menu-items` | https://wordpress.org/documentation/article/what-is-post-type/#menus |

---

## 3. Patterns — four kinds

### (a) Theme pattern (unsynced) — a file in `patterns/`, inserts a **copy** into the content
- Theme Handbook › Registering Patterns — https://developer.wordpress.org/themes/patterns/registering-patterns/
  > "WordPress will recognize any pattern file placed in your theme's `/patterns` folder, and it will automatically register it for you, provided that it has a valid pattern file header."
  Header: Title · Slug (`namespace/pattern-name`) · Categories · Description · Viewport Width · Inserter · Keywords · **Block Types** · **Post Types** · Template Types. PHP function: `register_block_pattern()`.
- Key concepts: "once a pattern is inserted it doesn't remain in sync with the original content." → after insertion, the block markup lives entirely in `post_content`; changing the pattern in the theme does not affect pages already created.
- Use in a template: `<!-- wp:pattern {"slug":"namespace/pattern-slug"} /-->` — https://developer.wordpress.org/themes/patterns/usage-in-templates/ — the Pattern block is "not found anywhere in the UI (such as the block inserter)" and "primarily meant to be used in WordPress themes"; on render "the blocks that make up that pattern are inserted into" the output.

### (b) Synced pattern — a `wp_block` post, referenced by `ref`
- https://wordpress.org/documentation/article/reusable-blocks/ — "WordPress 6.3 renamed Reusable Blocks to Patterns. A synced pattern will behave in exactly the same way as a reusable block." · "when a synced pattern is changed, the change will be reflected in all the places where the same synced pattern was used." · Deleted: "Block has been deleted or is unavailable." · "Detach pattern" (formerly: Convert to Regular Block) turns it into ordinary blocks.
- Markup: the `core/block` block (label "Pattern"), attributes `content`, `ref` — https://developer.wordpress.org/block-editor/reference-guides/core-blocks/ ; key-concepts: "dynamic blocks that 'ref' or reference the `post_id`". That is `<!-- wp:block {"ref":123} /-->` with 123 = the ID of the `wp_block` post.
- Management: Appearance › Editor › Patterns ("Your Synced patterns and template parts can be managed here") — https://wordpress.org/documentation/article/site-editor/

### (c) Pattern overrides (partly synced) — 6.6, built on Block Bindings
- Developer Blog (developer.wordpress.org/news, 06/2024) — https://developer.wordpress.org/news/2024/06/an-introduction-to-overrides-in-synced-patterns/
  > "Newly introduced for WordPress 6.6 are overrides in Synced Patterns, which let users make content-specific changes without changing the underlying layout or design of the pattern."
  > "Pattern overrides are essentially block bindings"
  Markup in the source pattern:
  ```
  <!-- wp:paragraph {"metadata":{"bindings":{"__default":{"source":"core/pattern-overrides"}},"name":"Card Description"},"fontSize":"small"} -->
  <p class="has-small-font-size">Card description. …</p>
  <!-- /wp:paragraph -->
  ```
  Supported blocks/attributes (6.6): Image `url, alt, title` · Heading `content` · Paragraph `content` · Button `url, text, linkTarget, rel`.
- `WP_Block` — https://developer.wordpress.org/reference/classes/wp_block/ — "If the default binding is set for pattern overrides, replace it with a pattern override binding for all supported attributes." (explains `__default`).
- The Block Bindings handbook lists the built-in source `core/pattern-overrides` — "Allows per-instance content customization in synced patterns" — https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/
- How to turn it on (UI, 6.6): "Check the 'Enable overrides' option and give the override a name" — https://make.wordpress.org/test/2024/06/03/help-test-wordpress-6-6/ ; each instance's override values live in the `content` attribute of `core/block` (attribute listed in the core-blocks reference).
- 7.0 extends it to custom blocks: "As of WordPress 7.0, any block attribute that supports Block Bindings also supports Pattern Overrides" — https://make.wordpress.org/core/2026/03/16/pattern-overrides-in-wp-7-0-support-for-custom-blocks/
- Note: there is no separate "dev note" named "pattern overrides" on make/core for 6.6; the WordPress 6.6 Field Guide (https://make.wordpress.org/core/2024/06/25/wordpress-6-6-field-guide/) only links "Block Bindings: Editing custom fields from connected blocks" (https://make.wordpress.org/core/2024/06/28/editing-custom-fields-from-connected-blocks/). The Developer Blog post above is the official source describing the markup.

### (d) Starter / page-creation patterns — `Block Types: core/post-content`
- https://developer.wordpress.org/themes/patterns/starter-patterns/ — "Adding `core/post-content` as one of the block types for the pattern tells WordPress that the pattern should be used for the post content." When creating a new page "a modal will pop up and show them a selection of patterns if any are registered" and the pattern "will automatically be inserted into the content area."
  Sample header: `Title: Example Page / Slug: themeslug/example-page / Categories: page / Block Types: core/post-content / Post Types: page`.
- https://developer.wordpress.org/block-editor/how-to-guides/curating-the-editor-experience/patterns/ — "To opt into this, include core/post-content in the Block Types for your pattern." · 6.0 for pages, 6.1 for every post type · by default ≥ 2 patterns are needed before the modal shows · block locking: `"lock":{"move":false,"remove":true}`.

---

## 4. Template part vs widget

- Template part: https://developer.wordpress.org/themes/templates/template-parts/ — "With block themes, you must put template parts within your theme's `/parts` folder." Three default areas: `header`, `footer`, `uncategorized` (shown as "General"). "you should almost always register template parts via `theme.json`". Markup: `<!-- wp:template-part {"slug":"your-template-part-slug"} /-->`.
- Registration in theme.json: `"templateParts":[{"area":"header","name":"header","title":"Header"},{"area":"footer","name":"footer","title":"Footer"}]` — https://developer.wordpress.org/themes/global-settings-and-styles/template-parts/ — area "default options are `header`, `footer`, and `uncategorized`. You can also assign it to any custom area."
- Template vs part: https://developer.wordpress.org/themes/templates/introduction-to-templates/ — "Templates represent the overall HTML output… 'top-level templates.'" · "Template parts are partial templates that live within top-level templates." · "your templates and template parts will be located in the `/templates` and `/parts` folders, respectively."
- Template Part block: https://wordpress.org/documentation/article/template-part-block/ — "this block is best used to create areas like your site header and site footer. When you change blocks inside a template part, the editor updates the blocks on every block template that includes the template part." Selectable areas: "general, header, footer, or navigation overlay". There is an **Importing widget area** section for sites moving from a classic theme.
- **No widgets/sidebars in a block theme**: https://wordpress.org/documentation/article/block-themes/
  > "How does this impact widgets and widget areas? Instead of widgets, a block theme relies on blocks. This means that you can place blocks anywhere you might have previously wanted widgets to appear."
  > "classic themes are built with PHP templates, functions.php, and more that include features like Widgets, a dedicated Menus section, the Customizer, and more. Classic themes do not work with the Site Editor."
- The widgets editor belongs to classic themes: https://wordpress.org/documentation/article/block-based-widgets-editor/ — "The Block-based Widgets Editor was introduced in 5.8 for those who use classic themes with widgets." The Theme Handbook page on widgets sits under `classic-themes/` — https://developer.wordpress.org/themes/classic-themes/features/widgets/

---

## 5. Navigation

- Navigation block attributes include `ref` — https://developer.wordpress.org/block-editor/reference-guides/core-blocks/ (core/navigation: "A collection of blocks that allow visitors to get around your site.")
- `ref` points at a `wp_navigation` post; fallback when the block has no menu yet — https://make.wordpress.org/core/2023/08/23/whats-new-for-navigation-in-wordpress-6-2-and-6-3/ :
  1. "Returns the most recently created existing Navigation Menu"
  2. if there is none: "Returns a Navigation Menu created from the most recently created Classic Menu" (imported once, not synced)
  3. if there is none: "Creates and returns a new Navigation Menu, typically comprising a list of the current site's Pages"
  "Navigation Fallback" endpoint in REST; turned off with `add_filter( 'wp_navigation_should_create_fallback', '__return_false' );`
- 6.1 dev note — https://make.wordpress.org/core/2022/09/27/navigation-block-fallback-behavior-in-wp-6-1-dev-note/ — "If there are no block menus or classic menus, the block will display a list of available pages using the Page List block." · "If there are multiple block menus, the navigation block will display the most recently created block menu."
- User page — https://wordpress.org/documentation/article/navigation-block/ — "When you add a Navigation block for the first time and don't have any existing menu, it will start with a Page List block." · Create/choose/delete menus from the panel; Advanced: "Menu name · Delete menu · Manage menus". Site Editor › Navigation: "Allows you to browse your menus and make basic changes." — https://wordpress.org/documentation/article/site-editor/

---

## 6. Block Bindings API (6.5+)

- Handbook — https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/
  > "The Block Bindings API lets you 'bind' dynamic data to the block's attributes, which are then reflected in the final HTML markup that is output to the browser on the front end."
  Built-in sources: `core/post-meta` (the meta must be registered with `show_in_rest => true`) · `core/post-data` (6.9+) · `core/term-data` (6.9+) · `core/pattern-overrides`.
  Supported blocks: core/image, core/heading, core/paragraph, core/button, core/navigation-link, core/navigation-submenu, core/post-date.
  Custom sources: `register_block_bindings_source( $name, $args )` on `init` (label + `get_value_callback`); client-side `registerBlockBindingsSource()` since 6.7.
- Dev note 6.5 — https://make.wordpress.org/core/2024/03/06/new-feature-the-block-bindings-api/
  ```
  <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"book-genre"}}}}} --><p></p><!-- /wp:paragraph -->
  ```
  > "The `show_in_rest` property must be set to `true` for the time being due to security considerations"
- `register_meta()` — https://developer.wordpress.org/reference/functions/register_meta/ — `object_subtype` = post type; `show_in_rest`: "Whether data associated with this meta key can be considered public and should be accessible via the REST API." The post type must `supports` `custom-fields`.
- 6.6: meta can be edited from a bound block — https://make.wordpress.org/core/2024/06/28/editing-custom-fields-from-connected-blocks/

What it means for "module-style" data (contact information…): keep the data in post meta (registered by a
plugin), present it with core blocks bound to `core/post-meta`; the markup is still blocks, the data is still
meta — no custom block needed.

---

## 7. Custom post types: plugin, not theme

- Theme Review "Required" — https://make.wordpress.org/themes/handbook/review/required/ — the plugin territory section: "Do not include: Custom post types, Custom blocks, Custom roles, Custom user contact methods, Custom mime types, Shortcodes, Functionality that is not related to design and presentation". Forbidden examples: "Analytics or tracking support, SEO options, **Contact forms**, Non-design related meta boxes, Resource caching, Social media 'like', 'follow' and 'share buttons', Session tampering".
- Plugin Handbook — https://developer.wordpress.org/plugins/post-types/registering-custom-post-types/ — "We recommend that you put custom post types in a plugin rather than a theme. This ensures that user content remains portable even if the theme is changed." Hook: `init`.
- Documentation — https://wordpress.org/documentation/article/what-is-post-type/#custom-post-types — "It's highly recommended that you define custom post types within a plugin or must-use plugin to ensure that if you switch themes, the post type isn't lost."
- `register_post_type()` — https://developer.wordpress.org/reference/functions/register_post_type/ — "If you use it in a theme, your post type will disappear from the admin if a user switches away from your theme." Important args: `show_in_rest` ("Set this to true for the post type to be available in the block editor"), `supports`, `template` ("Array of blocks to use as the default initial state for an editor session"), `template_lock`, `hierarchical`, `taxonomies`, `rewrite`.
- Block templates for a CPT — https://developer.wordpress.org/block-editor/reference-guides/block-api/block-templates/ — example `book` with `template` = image/heading/paragraph; `template_lock`: `all` · `insert` · `contentOnly`.
- Block theme template hierarchy for a CPT: `single-{post_type}.html`, `archive-{post_type}.html`, `taxonomy-{taxonomy_slug}.html` — https://developer.wordpress.org/themes/templates/template-hierarchy/

**What the documentation supports for "a Joomla module with structured data" (team member, testimonial):**

| Data shape | Standard WordPress mechanism | Evidence |
|---|---|---|
| A list of N items, each with the same shape, needing listing/filtering/pagination, with their own pages | **CPT registered by a plugin** + `template`/`template_lock` + (optionally) a taxonomy; displayed with `core/query` (selectable post type: "Other content types may be displayed here if your site includes plugins or custom post types") | register_post_type; block-templates; https://wordpress.org/documentation/article/query-loop-block/ ; theme-review required |
| A few single fields tied to one page/post (address, opening hours) | **post meta** (`register_meta` + `show_in_rest`) + **Block Bindings** `core/post-meta` | block-bindings; register_meta |
| One content block repeated in many places, edited once to change everywhere | **Synced pattern** (`wp_block`) | reusable-blocks |
| Same layout, different content in each place, no query needed | **Synced pattern + overrides** (`core/pattern-overrides`) | developer blog 06/2024 |
| Just content presented once | **Unsynced pattern** inserted as a copy into `post_content` | key-concepts; registering-patterns |

The documentation does not rank the options; the table above only gathers the conditions of use each page describes.

---

## 8. Category / tag

- https://wordpress.org/documentation/article/posts-categories-screen/ — "Each post in WordPress is filed under one or more Categories." · "Each Category may be assigned to a Category Parent, allowing you to set up a hierarchy within the Category structure." · "each Category Name must be unique. Thus, even if two Categories have two different Parents, they must still have different names." · Deleting a category: posts move to the "Default Category"; "the Default Category cannot be deleted."
- https://wordpress.org/documentation/article/posts-tags-screen/ — "Unlike Categories, Tags have no hierarchy so there is no Parent->Child relationship like that of Categories."
- Theme Handbook — https://developer.wordpress.org/themes/basics/categories-tags-custom-taxonomies/ — "categories: a hierarchical taxonomy that organizes content in the post Post Type" · "tags: a non-hierarchical taxonomy" · custom taxonomy: "it is recommended that you put this functionality in a plugin."
- `register_taxonomy()` — https://developer.wordpress.org/reference/functions/register_taxonomy/ — `hierarchical` "Default false"; `show_in_rest` "Set this to true for the taxonomy to be available in the block editor"; `category`, `post_tag` are reserved names.
- Pages have **no** taxonomy by default (create-pages: "Pages by default do not allow taxonomy… You can enhance it via plugins.").

Unlike Joomla: a Joomla category applies to articles as well as contacts/banners…, and the same name may appear on a different
branch; a WordPress `category` applies only to `post`, and the name must be unique across the taxonomy.

---

## 9. Site name · tagline · logo

- Options API — https://developer.wordpress.org/apis/options/ — `blogname` "Blog title" · `blogdescription` "Blog tagline" · `show_on_front` (`posts`|`page`) · `page_on_front` · `users_can_register` · `default_role`.
- Settings › General — https://wordpress.org/documentation/article/settings-general-screen/ — Site title · Tagline · Membership "Anyone can register" · New User Default Role.
- Logo: `get_custom_logo()` reads `get_theme_mod( 'custom_logo' )` — an attachment ID — then `wp_get_attachment_image( $custom_logo_id, 'full', … )` — https://developer.wordpress.org/reference/functions/get_custom_logo/
- Block: https://developer.wordpress.org/block-editor/reference-guides/core-blocks/
  - `core/site-title`: "Displays the name of this site. Update the block, and the changes apply everywhere it's used." (attrs `isLink, level, levelOptions, linkTarget`)
  - `core/site-tagline`: "Describe in a few words what this site is about."
  - `core/site-logo`: "Display an image to represent this site. Update this block and the changes apply everywhere." (attrs `isLink, linkTarget, shouldSyncIcon, width`)
- https://wordpress.org/documentation/article/site-title-block/ — "Updating this block and saving the template will apply the changes wherever the Site Title name is used including the browser title bar, search results and the Site Title text field in Settings > General."
- https://wordpress.org/documentation/article/site-tagline-block/ — the same sentence for the Tagline.
- https://wordpress.org/documentation/article/site-logo-block/ — "When you add an image to the Site Logo block, the change applies to all Site Logo blocks on your website." · "Use as site icon".
- Site Editor › Identity: "Allows you to set Site Title, Site Tagline, Site Logo, and Site Icon at a high level." — https://wordpress.org/documentation/article/site-editor/
- Block themes have no Customizer: "The Customizer is not available in block themes unless you are using a plugin or theme that requires it… there are now blocks for the site title, tagline, and site logo." — https://wordpress.org/documentation/article/block-themes/

---

## 10. Custom HTML block (`core/html`)

- Reference: `core/html` — "Add custom HTML code and preview it as you edit." attr `content` — https://developer.wordpress.org/block-editor/reference-guides/core-blocks/
- https://wordpress.org/documentation/article/custom-html/ — "This block allows you to insert your code so you can fine-tune your content." · "click on the Edit HTML button to open the editing modal. Enter HTML code and see the preview of your output to the right of the code editor." · "the HTML block does not have extra options."
  > "Starting in WordPress 7.0, the Custom HTML block introduces separate editing panels for HTML, CSS, and JavaScript. The CSS and JavaScript panels are only available to users with the unfiltered_html capability. If a user lacks this capability (for example, a Contributor), WordPress will sanitize the block's content using the function wp_kses(), stripping disallowed tags such as `<script>` and `<iframe>`."
- 7.1: static HTML interleaved with editable blocks — https://make.wordpress.org/core/2026/07/23/editable-blocks-inside-the-custom-html-block/
- No visual editing: the content is only edited through the code editor/modal; there are no controls in the sidebar (page above). This is the escape hatch for a `mod_custom` holding raw HTML, not the default.
- The shortcode block `core/shortcode` ("Insert additional custom elements with a WordPress shortcode") only means something when a plugin provides the shortcode — https://wordpress.org/documentation/article/shortcode-block/

---

## Mapping table: Joomla → WordPress (block theme)

| Joomla | WordPress | Stored where | Source |
|---|---|---|---|
| `com_content` article used as a **static page** (menu item "Single Article") | `page` (post_content = block markup) | `wp_posts` type `page`; parent/child via `post_parent`; own template via `{custom-template}.html` / `page-{post_name}.html` | create-pages; template-hierarchy |
| `com_content` article as a **blog post** (blog/category view) | `post` + `category` + `post_tag` | `wp_posts` type `post`; terms in `wp_terms`/`wp_term_relationships` | what-is-post-type#posts; posts-categories-screen |
| Article intro text / full text (`{readmore}`) | `post_content` + `core/more` (excerpt) — Joomla intro ≈ excerpt/`core/post-excerpt` | `post_content`, `post_excerpt` | data-flow; query-loop-block (the Post Template contains an Excerpt) |
| Category (nested, multi-level) | `category` (hierarchical, parent) — **applies only to `post`**; pages have no taxonomy | `wp_term_taxonomy.parent` | posts-categories-screen; create-pages; categories-tags-custom-taxonomies |
| Tag | `post_tag` (not hierarchical) | `wp_terms` | posts-tags-screen |
| Menu (`#__menu` menutype) | post `wp_navigation` | `post_content` = block `core/navigation-link`/`core/navigation-submenu`/`core/page-list` | whats-new-for-navigation-6-2-6-3; site-editor › Navigation |
| Menu item (link to an article/category/URL) | block `core/navigation-link` (kind page/post/category/custom) or `core/navigation-submenu` inside `wp_navigation` | in the post_content of `wp_navigation` | navigation-block (Page Link / Custom Link); block-bindings (navigation-link is a block that supports bindings) |
| "Home" menu / front page | option `show_on_front=page` + `page_on_front`; template `front-page.html` | `wp_options` | apis/options; template-hierarchy |
| `mod_menu` (module showing a menu in a position) | block `core/navigation {"ref":<wp_navigation id>}` placed in the header/footer template part | `parts/header.html` (theme) or `wp_template_part` (user-edited) | core-blocks (core/navigation attrs `ref`); template-parts |
| `mod_custom` (raw HTML) | (1) content that can be converted into standard blocks → pattern/synced pattern; (2) truly raw HTML → `core/html`; placed in a template part or `post_content` | block markup | custom-html; reusable-blocks; core-blocks |
| Module attached to a **position** in the template (chrome/xhtml/…) | **There is no "position"/"chrome" in core.** A site-wide repeated location = **template part** (`parts/*.html`, area header/footer/uncategorized/custom); a block meant to repeat = **synced pattern**; wrapper/"chrome" = `core/group` with styles from theme.json | `parts/`, `wp_template_part`, `wp_block` | template-parts; template-part-block; block-themes ("Instead of widgets, a block theme relies on blocks") |
| Sidebar module position | **No sidebar/widget area** in a block theme. A side column = `core/columns`/`core/group` in the template, or a custom template part area | template `.html` | block-themes; block-based-widgets-editor (widgets = classic theme) |
| Per-page modules (menu item assignment) | **No assignment.** Per-page content lives in that page's `post_content` (a pattern inserts a copy) or in a page-specific template (`page-{slug}.html`) | `post_content` / `templates/` | registering-patterns; template-hierarchy |
| ACM / page-builder section module (hero, feature grid, pricing…) | Block markup: the theme's **unsynced pattern** (`patterns/*.php`, Categories, possibly `Block Types: core/post-content` + `Post Types: page` as a starter) inserted into the page's `post_content`; if it needs synced reuse → synced pattern (+ overrides for the text) | `post_content`; `wp_block` | registering-patterns; starter-patterns; curating › patterns; overrides blog |
| `mod_articles_category` / `mod_articles_latest` / `mod_articles_popular` | `core/query` (Query Loop: post type, order by, taxonomy/author/keyword filters, items per page, offset, sticky) containing `core/post-template`; simpler: `core/latest-posts` (attrs `postsToShow, categories, orderBy…`). **"Popular" (by hits) is not in core** — there is no view counter; Query Loop only orders by date/title | block markup in the template/post_content | query-loop-block; core-blocks (core/latest-posts) |
| `mod_articles_categories` / category list | `core/categories` ("Terms List": `taxonomy, showHierarchy, showPostCounts, displayAsDropdown`) | block markup | core-blocks |
| `mod_tags_popular` / tag cloud | `core/tag-cloud` (`taxonomy, numberOfTags, showTagCounts`) | block markup | core-blocks |
| `com_contact` (contact + form) | **No contact component / form in core.** The contact page = a `page` (create-pages lists "Contact" as an example page); the form = a **plugin** (Theme Review puts "Contact forms" in plugin territory). Contact data (address, hours) = post meta + Block Bindings, or simply text blocks in the page | `page`; plugin | create-pages; theme-review required; block-bindings |
| Contact list (many people) | CPT via a plugin (`register_post_type` + `template`) + Query Loop | plugin | register_post_type; block-templates |
| `com_users` login/registration/profile views | Login: `wp-login.php` + block `core/loginout` ("Display login as form", "Redirect to current URL"); registration: option `users_can_register` + `default_role`; **no front-end profile/edit-profile page in core** (the profile lives in wp-admin) | `wp_options`, block markup | login-out-block; settings-general-screen; apis/options |
| Template style params (colours, fonts, logo…) | `theme.json` `settings` (palette, fontFamilies → `--wp--preset--{category}--{slug}`) + `styles`; user overrides in Appearance › Editor › Styles → post `wp_global_styles`; logo → `theme_mod custom_logo` (attachment ID) + `core/site-logo`; site name/tagline → `blogname`/`blogdescription` + `core/site-title`/`core/site-tagline`; font upload → `wp_font_family`/`wp_font_face` + files in `wp-content/fonts` | theme.json; `wp_global_styles`; `wp_options`; theme_mods | block-editor global-settings-and-styles; get_user_data_from_wp_global_styles; get_custom_logo; new-feature-font-library |
| Template layout (`index.php`, `component.php`, layout overrides) | `templates/*.html` (`index.html` required; `front-page`, `home`, `single`, `page`, `archive`, `category-{slug}`, `single-{post_type}`, `404`, `search`…) + `parts/*.html`; theme.json `customTemplates`; user edits → `wp_template`/`wp_template_part` | theme files; DB when edited | templates/templates; template-hierarchy; introduction-to-templates |
| Custom template style per menu item | the page chooses `{custom-template}.html` (theme.json `customTemplates`) | `_wp_page_template` (Page Attributes › Template) | templates/templates; create-pages › Page Templates |
| Joomla custom fields (com_fields) on articles | post meta registered with `register_meta` (`show_in_rest`) + Block Bindings `core/post-meta`; the "Custom Fields" panel UI in the editor | `wp_postmeta` | register_meta; assign-custom-fields; block-bindings |
| Joomla content plugins (`{loadmodule}`, `{loadposition}`) | **None.** Closest: `core/pattern` (theme) / `core/block` (synced) / `core/template-part`; shortcodes only with a plugin | block markup | usage-in-templates; shortcode-block |
| Media (`images/`) | `attachment` + `wp_postmeta` | `wp_posts` + uploads | what-is-post-type#attachments |

---

## Where the documentation does NOT help (to avoid inventing)

1. No official page ranks "CPT vs post meta vs synced pattern" — there are only the conditions of use for each (section 7).
2. There is no separate dev note "Pattern overrides 6.6" on make/core; the official sources are the Developer Blog 06/2024 and the Block Bindings handbook page (`core/pattern-overrides`).
3. `wordpress.org/documentation/article/post-types/` (the URL in the request) is a 404; the real page is `/what-is-post-type/` and it does **not** list the `wp_*` post types — that list only exists in `create_initial_post_types()` and `register_post_type()` (reserved list).
4. There is no post type/block for "position", "module chrome", "hits/popular", "contact form", "front-end profile" in core.
5. `theme_mod custom_logo` is the classic theme's old mechanism but is still where `core/site-logo` stores its value (per `get_custom_logo()`); the Theme Handbook puts the Custom Logo page under `classic-themes/`.
