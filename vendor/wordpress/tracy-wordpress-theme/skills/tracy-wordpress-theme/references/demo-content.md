# Content — loading the spec-pack into WordPress with WP-CLI

> **Phase 7 packet (content).** Read when seeding categories/posts/pages/menus/synced patterns/images/redirects into the stand.
> Prerequisites: theme installed and activated (Phases 3–6), `content-plan.json` compiled
> ([`content-contract.md`](content-contract.md) §Phase 7), `patterns.map.json` has every field for every ACM.

The seeder is `scripts/seed.mjs` (flags at the top of the file, `parseArgs`); the pattern-assembly library is
`scripts/lib/block-fill.mjs` (§2). The rules below are the seeder's contract, drawn from how
`packages/cms/tracy-seeder` works with customer sites and from the `from-joomla` data already released. WP-CLI commands are WordPress's commands (look them up in
[`wordpress-anatomy.md`](wordpress-anatomy.md) §5); commands that **have been run** on the stand are marked as such.

## 0. The way into WP-CLI on the stand

The stand's Compose file (`~/TracyHQ/quickstart-builds/tracy-base-wp7-1.0.0/compose.yml`) has a `cli` service
(image `wordpress:cli`, `entrypoint: ["wp"]`, user `33:33`, same webroot `./capture`, `./dist` mounted
read-only at `/dist`). **Always `-p tracy-base-wp7`**: the project name owns the network and the DB volume; a bare `up`
creates a second project on the same subnet (gotcha #3).

```bash
cd ~/TracyHQ/quickstart-builds/tracy-base-wp7-1.0.0
docker compose -p tracy-base-wp7 run --rm cli core version         # run: 7.1
docker compose -p tracy-base-wp7 run --rm cli theme list           # run: tracy-base active
```

Every write to WordPress goes through this path. **Never write the DB directly** (no `mysql -e INSERT`, no hand-editing
`wp_posts`): WP-CLI runs hooks, updates caches, keeps `post_modified`, and is what a quickstart restore
can reproduce. The only exception is `wp db` for the whole-set export/import in Phase 10.

**The container `seed.mjs` keeps alive.** A runner of the shape `docker compose -p <project> run --rm <service>`
(or `docker run --rm … wordpress:cli`) creates a container **per command** — 2–3 s each. So `seed.mjs` starts
**one** background container named `<project>-<service>-keep` (JA Vega: `javwp-cli-keep`; `sh -c 'sleep 7200'`,
same service, mounts and user) and runs every command as a `docker exec -i` into it (0.3–0.5 s, measured
14/09). The first log line says so — `wp-cli runner: container javwp-cli-keep up; every call is a docker exec
into it` — and the report records `wpContainer`. Its life cycle, for whoever cleans the stand:

- The seeder **removes** it when the process exits, on Ctrl-C / SIGTERM / SIGHUP too; between two seeds no such
  container runs (26/09, JA Vega stand after five seeds: `docker ps -a` lists no `*-keep`).
- A process killed with `kill -9` (or a machine that went down) leaves it: it stops by itself after at most
  2 hours (`sleep 7200`) and the next seed removes the stopped leftover before starting its own. A next seed
  that finds it still **running** reuses it (`reusing container …`) and leaves removal to the run that made
  it. By hand: `docker rm -f <project>-<service>-keep` — no database, volume or webroot is touched.
- `--wp-keep off` or `TRACY_WP_KEEP=0`: one container per command, exactly as the runner is written; a runner
  that is not docker always runs verbatim.

## 1. Rule one: look up the slug first, a re-run is an update

The seeder is **idempotent**: each object is looked up by a stable key before writing; if it exists, `update`, if not,
`create`. Two runs of the same spec = the same IDs, no duplicates, nothing the site owner edited is changed outside
the fields the seeder owns.

| Object | Lookup key | Create | Update |
|---|---|---|---|
| category | slug (`content.json → categories[].wpSlug`) | `wp term create category "<Name>" --slug=<slug> [--parent=<id>] --porcelain` | `wp term update category <id> --name=…` |
| post / page | `post_name` + `post_type` (`wp post list --post_type=page --name=<slug> --field=ID`) | `wp post create --post_type=… --post_status=publish --post_title=… --post_name=… --post_date=… --post_content=@file` | `wp post update <id> --post_content=@file` |
| child-page order | `menu_order` (§6b) | with the page create | with the page update |
| 404 page | option `<theme>_404_page` → a **draft** page (§6b) | draft page + `wp option update` | same |
| install samples | untouched "Hello world!" / "Sample Page" (§6b) | — | `wp post delete <id>` (to the trash, never `--force`) |
| page template | postmeta `_wp_page_template` (`content.json → pages[].meta`) | `wp post meta update <id> _wp_page_template page-landing` | same command |
| image | file name in the media library (`wp post list --post_type=attachment --field=post_name`) | `wp media import <file> --porcelain` (from the source's `capture/images/` tree) | skipped if it already exists |
| featured image | `content.json → posts[].featuredImage` | `wp post meta update <id> _thumbnail_id <attachment-id>` | same command |
| synced pattern | `post_title` `[Tracy Base] <Page> - <Part>` (`post_type=wp_block`) | `wp post create --post_type=wp_block --post_status=publish --post_title=… --post_content=@file --porcelain` | update |
| menu | `post_title` (`post_type=wp_navigation`) | `wp post create --post_type=wp_navigation --post_status=publish --post_title=… --post_content=@file --porcelain` | update |
| front page / posts page | option | `wp option update show_on_front page` · `wp option update page_on_front <id>` · `wp option update page_for_posts <id>` | same command |
| site identity | option / theme mod | `wp option update blogname "<Name>"` · `wp option update blogdescription "…"` · `wp theme mod set custom_logo <attachment-id>` | same command |
| 301 redirect | `redirects.json → rules[]` | see §5 | |

`--post_content=@file` reads from a file so block markup does not pass through the shell. `--porcelain` prints only the ID.

### A second run settles (#92)

An unchanged spec seeded a second time reports `+0 ~0` in every group. Three rules make that hold where
WordPress rewrites what it is given:

- **Article slugs are decided by the seeder.** Joomla aliases are unique per category, WordPress slugs are
  global, and two *distinct* articles (different title, words or picture — the same article in several
  categories is one post, `mergeSharedArticles`) can share an alias. Slugs are one space for the whole site, in
  every language and with or without Polylang (Polylang free cannot give two languages one slug,
  [`i18n-polylang.md`](i18n-polylang.md)). In each group on one slug the post whose alias is the shared slug
  keeps it, else the one with the lowest article id. Every other post is then named in article-id order across
  all groups at once: its own alias when that is free, else `<slug>-<articleId>` (then `-2`, `-3`, … while a post
  of the spec already holds the name; the id suffix survives the 200-character limit). The result does not
  depend on the order of `posts`, and the redirect rule and the menu item of an article id name the post that
  got the name. A clash with neither an alias nor an article id to take is noted and left to WordPress's `-2`.
  A `translationOf` that names the shared slug pairs with the post that kept it; name the other by its path.
  Every post that has a source article id carries it in the hidden meta `_tracy_source_article`. **A row belongs to an
  article only when that meta names the article**; nothing is inferred from the row's name, title, suffix or
  fingerprint, and the seeder never predicts the slug WordPress stored (it reads it back, and a name WordPress changed
  or an editor renamed does not make the next run update the row). The spec's slug stays the name the fingerprint is
  made of, so two distinct articles with one alias *and* one title keep their ids and settle at `+0 ~0`.
  Before anything is written (before the theme, options, media, authors or any post), the seeder reads every post and
  its meta once. If a row holds a slug wanted for an article and the row has no identity, or names another article,
  the seed stops and writes nothing, naming the article, the slug and the row; it never updates that row and never
  creates a second post beside it. An article whose own meta is on a row is updated in place, wherever the row's name
  is. A post with no source article id (nothing to carry) takes the row on its name, as before.
  **One-time consequence:** a site seeded by an older seeder holds rows with no identity, so the first seed of a spec
  whose posts have article ids is refused when a row sits on a slug an article wants (it is certain for articles that
  share an alias, whose rows an older seeder numbered `-2`, `-3`). Reseed it clean (trash the posts and seed), or resolve
  those rows by hand (add the meta `_tracy_source_article` with the article id to the row that is that article, or
  trash the row) and seed again; from then on a second run reports `+0 ~0` for the group.
- **The comparison is of what WordPress will store.** The pager words with none declared are written `{}`, which
  PHP stores as an empty array and `wp option get --format=json` returns as `[]`: for that option the two are the
  same empty set (any other JSON option compares by type). A biography is filtered on save
  (`pre_user_description`: `<p>` and scripts go, `&` and `<` are encoded); the seeder asks the site, read-only
  and in one `wp eval`, what it would store for each declared biography and compares that with what the user
  holds. The first run still writes the text as the spec has it. When the site cannot answer, the raw text is
  compared (an update the site may filter back) and a note says so. Per-locale biographies (`description_<locale>`)
  are written with `wp user meta update`, which stores them as given; they were measured stable and are compared
  as before.
- **Menus keep to what WordPress renders.** See §3.

## 2. `post_content` — assembling patterns, filling text into `metadata.name`

`content.json → pages[].content` is already block markup (`html-to-blocks.mjs`), with slot markers
`<!-- wp:tracy-base/slot {"position":"<pos>"} /-->` where Joomla has `{loadposition <pos>}` /
`{loadmodule …}` (`SLOT_BLOCK` in `scripts/lib/html-to-blocks.mjs`). The seeder:

1. For each slot, takes the instances in `sections.json → acm[]` with `position == <pos>` **and** whose `pages[]`
   contains this page (or `ALL`), by `ordering`.
2. For each instance, opens the pattern given by `patterns.map.json → types["<type>:<style>"].pattern` (the
   registered markup — read from the site through WP-CLI/REST, or by rendering the PHP file), then uses
   `scripts/lib/block-fill.mjs`: `parseBlocks(markup)` → a block tree that keeps `innerContent` exactly as WordPress does
   (serializing an untouched tree gives it back **byte for byte**); `findBlock(blocks, name)` **locates by
   `metadata.name`**, never by position; writes fields per the map's `attr` — `setText`, `setHref`,
   `setImage({src, alt, id})`, `setLevel`, `setClasses`, `setSummary`, `setRootAttr`, `setListItems`
   (multi-line textarea → `core/list-item`); repeated groups: `repeatItems(blocks, '<type>', n)` clones the wrapper
   `<type>.item.<n>` to the item count and renumbers the indexes; `dropped` is skipped and recorded in `content-gaps.md`
   if the instance has data in that field. `attr: "style"` is refused explicitly: the pattern stays as it is, and
   `report.unresolvedSeedResults[]` and `report.notes[]` record the name `unsupported-style-attribute`, the section,
   the field and the source value; the summary line counts the unresolved results. The seeder writes no arbitrary inline style.
   `serializeBlocks(blocks)` produces the markup; `checkMarkup` checks balance.
   Home (D6): `fillFromLibrary(patternMarkup, moduleHtml)` matches the **shape** of the text leaves of an OpenDesign
   `mod_custom` against a `tracy/section-*` pattern (these have no `metadata.name`); when the two shapes do not
   match it returns `null` and the seeder falls back to `core/html` **and says so** — a wrong guess means text lands in the wrong place with no
   error. On the `core/html` path only, colour literals in `style="…"` (`rgb()`, `#hex`, near-opaque `rgba`)
   within 12 RGB of one of the theme's colour presets are rewritten to `var(--wp--preset--color--<slug>)`
   (`scripts/lib/inline-colors.mjs`, palette = `design-contract.json` + the theme's `tokens.css`/`theme.json`
   when `--theme-src` is given) so dark mode applies; `report.inlineColors[]` records `{page, replaced, kept}`
   ([`gotchas.md` §22](gotchas.md)).
   A **typed** section (`sectionType` + `fields`/`items`, spec-pack from HTML) goes through `renderTypedSection`
   and that type's pattern in `patterns.map.json` — but only when the pattern **keeps all the text**: the seeder takes
   the text runs of `section.html` (`extractRuns` in `leaf` mode, ≥ 3 words, `scripts/lib/parity-extract.mjs`) and
   checks "contains" against the text of the rendered markup; dropping ≥ 1 run (except `fields.filters` chips and the "Read
   more →" utility) means **the pattern is not used** — the section goes into `core/html` (through the colour pass above too), the report
   records `sections[]{kind:'html', via:'coverage', type, dropped[]}` and `notes[]{note:'typed render drops N
   runs → core/html'}`. `--typed-loss allow` keeps the pattern even when it drops (still records `dropped`). Final line:
   `sections N (T typed, H html, F fell back for coverage, …)` ([`gotchas.md` §23](gotchas.md)).
3. Replaces the slot marker with the filled pattern string. **Not one** `tracy-base/slot` may be left in
   `post_content` — that block is not registered, WordPress renders it as empty and nobody notices it is missing.
4. `checkBlockMarkup(markup)` (same library) must be `ok` — balanced open/close, valid attribute JSON — before
   `wp post create/update`.

Pages whose layout has positions (home, home-2, landing, od-*): `pages[].sections[]` already orders the slots **in
layout order**, the article body in the `component` row; when the layout has no component, the body sits in `droppedContent`
with a note — the keep/drop decision is recorded in `DECISIONS.md`. The text of the 12 `mod_custom` on home → pattern
`tracy/section-*` (D6), not `core/html`.

Text goes through the compile's `resolved-content.json`, not copied directly from `sections.json`, when
the content contract declares a fact for that field (name, price, contact) — [`content-contract.md`](content-contract.md).

**Module wrapper classes.** A section keeps the classes its source wrapper printed (from-joomla §Module wrapper
classes): `moduleClasses(section)` = the `moduleClass` tokens, then `top-<spacing.top>` and
`bottom-<spacing.bottom>` — `bg-light top-medium bottom-medium` for JA Vega Mod136. `renderAcm` adds them to the
pattern's root block after the fill, `className` and the root element's `class` together, beside the anchor.
A custom module section gets them through `withModuleClasses` whichever path rendered it: on the root of a single
block, or on one `core/group` around the markup when it is several blocks or a `core/html` block (the author's
HTML has no block root). Nothing declared (`null` / `''`, or a spec from before the rule) adds nothing. The theme
styles those class names from the source's scale; per-instance `#acm-<type>-<id>` spacing rules are not needed.

**Several fields in one line.** The source often prints two ACM fields as one line — `<div class="clients-desc">
<span>Our partners</span> drive success…</div>` is `short-desc-accent` + `short-desc` (JA Vega Mod136/159; the
hero's `avatar-title-accent` + `avatar-title`). The pattern draws that as ONE editable paragraph or heading and the
map composes it: every text field (`attr` `content` or `text`) with that block's `path` declares `part` — its
1-based place in the line — and may declare `wrap` (`span` `em` `strong` `b` `i` `mark` `small`) and `wrapClass`
(class tokens):

```json
"short-desc-accent": { "block": "core/paragraph", "path": "clients.desc", "attr": "content", "part": 1, "wrap": "span", "wrapClass": "jv-accent" },
"short-desc":        { "block": "core/paragraph", "path": "clients.desc", "attr": "content", "part": 2 }
```

`renderAcm` writes the non-empty parts in `part` order, each escaped (a field is plain text — markup in a value is
shown, never injected) and wrapped as declared, one space between them, whitespace collapsed. An empty part is
left out with its wrap; all parts empty removes the block, as one empty field does. Repeated parts (`repeat`,
`path` with `<n>`) compose per item. Two text fields on one block **without** `part`, a part missing on one of
them, a repeated or non-positive `part`, `part` on a non-text field or a `wrap` outside that set stops the seed
naming the map entry and the block: before this the second field silently overwrote the first. A map with one
text field per block fills as before.

**A line break in a field.** A Joomla module stores a designer's break in the field itself — JA Vega Mod160
`team-desc` is `Meet the Minds <br>Behind Our Success`, the hero's `avatar-title` `SIGNED UP TO GROW<br/> ON THEIR
TERMS`. The adapter keeps it (`normaliseAcm` reads Joomla's `((br))` back as `<br>`; the M6 spec-pack's
`sections.json` has all three). `renderAcm` used to write every field as text, so the page printed `<br>` and the
heading broke where the width did (#37, M6-12). Now a bare break — `<br>`, `<br/>`, `<br />`, any case, no
attribute — reaches the block as `<br>` (a `content` or `text` field, a composed part, a repeated item), with the
space in front of it that `richText` writes; every other character of the value is still escaped, so `<br
onclick>`, a `<script>`, a `<span>` or a `<!-- /wp:… -->` in a field print as text and the block stays whole
(`breaksAsMarkup`, lib/block-fill.mjs). A value that is breaks and nothing else is an empty field: the block goes.
`<br>` is rich text in `core/heading` and `core/paragraph`: the block editor reads the block as valid and the
owner edits the words around the break (`scripts/test/issue37-wordpress.mjs` edits one in the editor). Do not draw
the break with a `max-width` on the heading — it moves the moment the owner changes a word.

**The required star of the contact form.** The source marks a required field with a star element of its own
(`<label class="required">Name<span class="star"> *</span></label>`, drawn in its own colour). `cf7Form` writes the
star as `<span class="wtb-form__required" aria-hidden="true">*</span>` after the label text — every labelled kind:
field, select, radio legend, file — so the theme styles it (`.wtb-form__required { color: … }`); an optional field
gets none. CF7's own `*` tag suffix (`[text* name]`, `aria-required`) is what makes the field required; the mark is
presentation. The star used to be a character of the label, and a post-seed patch of the form would be undone by
every seed (#37, M6-11). The form text the coverage check reads (`cf7FormText`) is unchanged.

## 3. Menu — `wp_navigation`, and `ref` in the part

Each `menus.json` entry → one `wp_navigation` post, `post_content` from the `children` tree:

```
<!-- wp:navigation-link {"label":"About","type":"page","kind":"post-type","id":<page-id>,"url":"/company/about"} /-->
<!-- wp:navigation-submenu {"label":"Services","kind":"post-type","id":…,"url":"/services"} --> … <!-- /wp:navigation-submenu -->
```

`id` is the page ID **after creation** — so seed pages first, menus after. A **non-public** page (`draft`, including the 404 and search views
the seeder creates) is not attached by `id`: WordPress drops a menu item linking to it without a word. That item becomes `kind: custom` with
the item's `url` (the same way as a target the site does not have), the page keeps its status — the seeder does not publish a page to save
the menu — and `report.notes` names the menu, item, URL and status (`menu main: item "Secret" links /secret, a page whose status is draft`).
Applies to the main menu, submenus and footer columns. Home uses `core/home-link`. For a gap,
`url` = `redirectTo` with `kind: custom`. Once the menu ID exists, write `"ref": <id>` into the matching
`core/navigation` block in `parts/header.html` / `parts/footer.html` — or accept the "latest menu"
fallback only when the site has **one** menu ([`chrome-and-navigation.md`](chrome-and-navigation.md) §2).
Writing `ref` into the theme's part means editing the overlay + rebuilding; writing it into the DB copy (`wp_template_part`) is what the customer
edits next — record the decision in `DECISIONS.md`.

## 4. Images

Source: j6's `capture/images/` and `capture/templates/tracy/images/`. `wp media import` keeps the basename
(exactly the path `/wp-content/uploads/<basename>` that `html-to-blocks.mjs` wrote into `src`); the same name with different
content is a gap item that must be renamed **in both places**. Check: `scripts/shoot.mjs` on 43 routes, and
`index.json` has no image 404 console errors. Logo via `custom_logo`.

**A file name is not an identity.** `src="/wp-content/uploads/<basename>"` carries only the file name, and a site has many
`item-1.jpg`. The seeder (`resolveMedia`) looks that name up in the **image table of the very thing that mentions it**, nearest first: page →
`pages[].images`, then the `images` of sections assigned to the page, then modules on every page, then `content.images`; post →
`posts[].images`; typed section → the section's `images`, then the page's. The first tier that lists the name decides
(`original` is the source file; an entry that lists the name without a source path — no `original`, an uploads-form `src` — also
decides: `src` stays as it is, note `… without a source path …`, no falling through to a name search). Only when no table lists it is the name searched among imported files, and it is accepted only when
there is exactly **one** file. Two sources for one name in the deciding tier, or a source not imported → `src` stays as it is and the report
has a note `{ page|post|module, image, note: "… is ambiguous …" }` — the first file is never taken. `posts[].images`
are imported too (before, images only a post body mentioned never reached the media library), and every `<img>` in a **post's
markup** is collected as a page's is (#33 M6-1: a full-text image opening the article body, with no row in the table, kept a `src` `/images/…` that
the site does not serve) — an uploads-form name looks up the post's own table first. Collecting and rewriting `src`/`href` both go through an HTML parser
(`markupAttrs`, jsdom with attribute locations), not a `src="…"` regex: `<img src='…'>`, `<IMG SRC="…">`, an unquoted
value are the same image; an `<img>` in a comment or in a block's JSON is not an element. Attributes are rewritten in
place, the rest of the markup stays as it is.

**Template parts resolve their images in the same seed (#58).** Step 8 writes the header and footer overrides after
the media import, and `resolvePartMedia` resolves each part's images against that run's media index: a `core/image`
whose `metadata.name` is a source image key (`images/icons/card.svg`) is that image's slot; one without it is
resolved from its own `<img src>`. Either gets the attachment URL and `id` (`wp-image-<id>`), so the Site Editor
shows a media-library image. Other `src`/`href` references go through `rewriteMediaRefs`, as page content does.
Name lookup uses the image tables of the modules on every page, then `content.images`. The import list is
unchanged: an image only a part names is not imported. An image block that does not resolve (an ambiguous or
unimported reference, or any markup but one `<figure>` holding its one `<img>`, optionally linked and captioned,
that the HTML parser writes back as it stands, bar self-closing slashes — no unclosed or stray tag, duplicate
attribute, unquoted value or named entity) stays as written, its `src` included, with a `{ part, image, note }` entry
in the report. Part markup the parser
does not read in full (it does not parse, or a block delimiter such as `<!-- wp:image/-->` is left in its HTML) is
written as it is, with a note. A part with nothing to resolve is written byte for byte, so the next seed is
`+0 ~0`. The part source is read only when it is a regular file; anything else at that path (a FIFO, a directory, a
broken symlink) is noted and the site's copy is used.

**The featured image is the body's first picture only when both name one source file.** `articleHead` drops a
leading image block that repeats `featuredImage`, and the lead with it. It compares `imageIdentity`: a source path
(`images/…`), or for an uploads-form `src` the source that the post's image table (then the spec's) gives that name;
a URL no table lists is its path. `blogs/intro/item-1.jpg` and `blogs/detail/item-1.jpg` are two pictures (#33 M6-8:
compared by file name, the body image and the lead were dropped); a name a table lists with two sources, or with
none, is not "the same" as anything, so the picture stays.

**A `src` is a URL; a table entry names a file.** Every URL-form reference — a `src`/`href` in markup, a table
entry's `src`, a featured image, an ACM image field — goes through `imageKey`, which cuts the fragment and query
and then decodes the path once (`decodeUrlPath`): `/wp-content/uploads/paint%20bucket.png` is the file
`paint bucket.png`, imported from `images/…/paint bucket.png` and rewritten to its attachment URL. `file` and
`original` are names on disk (from-joomla §Convert HTML → block) and go through `pathKey`, which cuts nothing: the
`#` of `hash#tag.png` is part of the name, where cutting it would import `hash`. A path with a
`.` or `..` segment names no image (`imageKey` → null), so nothing is imported from outside the images tree.

**Media slugs must not take a route.** An attachment with no parent (`post_parent 0`) is served by WordPress at
`/<post_name>/`, and a top-level page cannot have the same name (the page gets `404-2`, `/404` 301s to the image file). After the
media step, the seeder reads twice: the `post_name` of **every** attachment in `media.json` (newly imported and reused alike — every id
must come back, a missing id is an error) and every attachment **on the site** whose slug equals a one-segment path of the page-map,
pages and archives (including files the seeder did not import), then compares (`mediaRouteCollisions`). `report.mediaRoutes` =
`{ ok, checked, routeSlugs, collisions: [{ attachment, source, slug, route }] }` (`source: null` for an attachment
outside `media.json`); one line per collision,
`MEDIA/ROUTE COLLISION` on stderr, the taken route carries `cause` in `routes[]`, and the seed exits **1**. A failed attachment
read, or one that leaves out ids of `media.json`, is also `ok: false` (with `error`), not clean. An attachment **of `media.json`** on the slug of a route the seeder
reserves (`reservedRouteSlugs`) is renamed `<slug>-image` (the first name in `-image`, `-image-2`, … that is not a route of the spec and not held by any post or attachment on the site, trash included — the seeder asks the posts table through WP-CLI, with no post type or status filter, because `--post_type=any` leaves out attachments and a status filter can miss private attachments; the seeder reads the slug back after the rename and stops if the site did not take it) — both when newly imported and when reused from an earlier run (one
note per rename; later runs do not rename again). What the seeder does not rename itself — attachments outside `media.json`, and the `404` route
of the not-found page (a draft, not in `reservedRouteSlugs`) — is still a collision: `report.mediaRoutes.fix` lists
the exact command to run (`wp post update <id> --post_name=<free name>`, same naming rule; `null` + note if it cannot be read), the same line is in the log and in `notes`, the seed
exits **1**. The seeder does not delete attachments. `--dry-run`: `ok: null, skipped`.

**Two categories sharing one slug** (an old spec from before from-joomla rule #10) → the seed stops before writing anything
(`checkCategorySlugs`: `category slug "<slug>" is shared by #a and #b`); before, the second term was merged into the first
and the `/services` listing printed `portfolio`'s posts.

## 5. Redirects for gaps

The 5 routes with no WordPress version (G1–G5) and every route whose path changes because of D2/D7 (`redirects.json → rules[]`)
need a 301. Core has no redirect table; two options — (a) `.htaccess` in the webroot (goes into
`webroot.tar.gz`), (b) a small mu-plugin reading `redirects.json`. **Not decided** (13/09); record it in
`DECISIONS.md` when chosen. Either way, `http-parity` (Phase 8) compares through the map table, not identical URLs.

## 6. What the seeder does NOT do

- No `--force` delete-and-recreate (`wp post delete --force`, `wp site empty`): IDs lost, the site owner's edits
  lost, order lost. Deleting is a person's job, after reading. The one narrow exception: untouched install samples go
  to the **trash** (§6b), where they can be restored.
- No DB writes outside WP-CLI; no `wp eval` writing `$wpdb` directly.
- No inventing: a field empty in the source stays empty or its block is dropped (per the `patterns.map.json` note), recorded in
  `content-gaps.md`. No generated alt, no generated excerpt — but **a page's excerpt is
  READ from that page itself**, not left for WordPress to cut: `pageExcerpt()` takes the spec's excerpt, then
  `archives[].excerpt` when the page sits at an archive route, then the lead of the h1 section, then the first paragraph of the page body, then
  the first paragraph of a section **assigned to that page itself** (`sectionsOfPage`: compares path/file only when both sides have one; a module
  with `pages: ['ALL']` is chrome, not a section of the page). An archive page the seeder builds (`synthetic`) takes only
  `archives[].excerpt` (declared empty is empty) — without it, it stays empty, no module text is taken (a footer address line
  was once the excerpt of `/category-blog`). WordPress's auto-excerpt flattens the whole page
  (filter chips, position map, statistics figures) and swallows `<br>` without leaving a space
  ("groundwork fornext-generation plants") — that is inventing, not leaving empty.
- Does not touch `wp_global_styles` — variations are the theme's job (`tracy_apply_inspiration()` or the Site
  Editor), not the seeder's.
- Does not change options outside the §1 list (`show_on_front`, `page_on_front`, `page_for_posts`, `blogname`,
  `blogdescription`, `permalink_structure` set when the stand was built).

## 6b. Listings, child-page order, install samples, the 404 page

Four things the seeder does so the site does not drift from the source where an owner would hardly look
(issue #9, measured on the JA Vega M4 port):

- **A listing with child pages and no post left in its category.** A Joomla category route becomes a page
  holding queries (`buildArchiveContent`): the child-page grid (when the category's articles became pages) and
  a query for the posts of the category and every category below it. When the page has child pages and no
  `publish` post (the `state 2` ones are tagged `archived` and excluded anyway) is filed under that category or
  any below it — in the spec, **and** in WordPress (`publishedPostCount`: `wp post list --category_name=<slug>
  --post_status=publish --tag__not_in=<archived>`, children included, so a post the site owner published there
  since counts, and the archived ones the query leaves out do not) — **no**
  post query is added; with it the theme printed "Nothing here yet." under the grid (JA Vega `/services`). A
  count WordPress cannot give keeps the query. Without child pages the post query is the listing, empty or not.
  The query names every category below the listing's — the spec's **and** any the site holds under it
  (`termsBelow` over `wp term list category`, e.g. one the site owner added): the Query Loop block sets
  `include_children: false` on its `taxQuery`, so a post in a child category not named there never shows.
- **What the listing prints above its lists** follows the archive's `display` (from-joomla §Category archive
  display options): the category title (`tracy-eyebrow` heading) only when `showTitle`, its description only
  when `showDescription`, and the subcategory list only when `maxLevel` is not 0 — `maxLevel` levels deep (-1:
  every level), one heading level deeper per level. JA Vega hides title and description (global 0; the masthead
  already prints both) and `/portfolio` has `maxLevel 0`. Hiding the subcategory list changes no query: the posts
  of every category below and the child-page grid stay. A `display` that is not booleans and an integer ≥ -1
  stops the seed naming the field. A category archive without `display` (another adapter's spec, or one written
  before the rule) prints title, description and one level of subcategories as before, and the report carries a
  note saying the source was not read for them.
- **`menu_order` of child pages** = the page's place among its siblings (same parent), from 1, in spec order;
  pages from Joomla articles take the article slots in the source's category order (`joomla.ordering`, then
  article id) — the order the source's "Other Services" module prints. An integer `menuOrder` on the spec page
  wins. Top-level pages keep 0 (their order is the navigation). The first seed after this change updates each
  child page once (its fingerprint changes), later seeds report `=`. Without it siblings tie at 0 and a
  child-page grid follows insertion ids.
- **Install samples.** "Hello world!" (post `hello-world`) and "Sample Page" (page `sample-page`) — matched by
  type, slug and title as `quickstart/lib.mjs WP_DEFAULTS`, **never edited** (`post_modified = post_date`), not
  already in the trash, and not a post this run seeded (a spec with its own page `sample-page` matched it) — go
  to the **trash** with `wp post delete` (restore: `wp post update <id> --post_status=publish`). The report says
  `samples ~N` and one note per post. An edited or renamed sample is content: left alone, a person decides.
  A sample **still in use** is kept too, with a note `kept: still used by …` (`sampleReferences`): the
  `page_on_front` / `page_for_posts` option, a classic menu item (`_menu_item_object_id`), or the content of
  another post, page, `wp_navigation`, synced pattern or template (a block `"id"`/`"postId"`, `?p=`/`?page_id=`,
  a link to its slug in an `href` or in a block's `"url"` attribute — a custom `navigation-link`). When those cannot be read, no sample is trashed — an option read that fails counts as
  unreadable; only WP-CLI's `Could not get '<key>' option` (the option was never set) means no reference.
- **The 404 page.** `notFoundPage` takes the page-map page with view `404`, **synthetic included** (Joomla serves
  `error.php`; no route names it). When no spec page sits at its path, the option points at a draft: the spec's
  path-less page with view `404` (the adapter's "Error page" article), else a draft `page-not-found` whose h1 is
  the page-map `title` — the only words the spec has; a report note asks for the source's other words to be
  written in the admin. A draft whose slug a routed top-level page also has becomes `<slug>-404` (else both are
  matched to one post). `<theme>_404_page` names the draft; the next seed finds it by slug, same ID. `/404` still
  answers 404 (probe `expect 404`). Theme hook: [`templates-and-patterns.md`](templates-and-patterns.md) §404 page.

A category route the seeder builds as a page is reported with `served: "page"` in `routes[]`; the visual contract
reads it to expect the page body class ([`visual-qa.md`](visual-qa.md) §Contract, "Page identity").

## 6c. Post templates, authors, archive paging

Three things a Joomla source declares that the seeder carries (issue #28, measured on the JA Vega M4d port).

### A post's template

A post may declare `meta._wp_page_template` (from-joomla `--article-posts`: an article the source opens on its own
menu route, with modules of its own around it, that must stay in its category's listings). The seeder checks it
against the same template list as pages (`themeTemplates`: the base set plus the theme's `templates/*.html`, read
once before the posts) and writes it through the post batch: a second seed with nothing changed reports the post
`=`; a template dropped from the spec later is cleared. WordPress resolves a post's `_wp_page_template` before
`single` (`get_single_template`), so the post renders through it at its permalink while staying a post (category,
listings, feed). A name the theme does not have is left out with a report note (the post renders on `single`); a
post has no page-map layout to derive a template from, so nothing is guessed.

**The theme must offer the template to posts.** WordPress checks a post's `page_template` against
`WP_Theme::get_post_templates()` — a block theme's `customTemplates` filtered by `postTypes`, which default to
`["page"]` — only when the post is **updated**: the first seed created the post with the meta, and the first changed
seed died half-way on `Invalid page template.` (#33 M6-9). Before anything is written, `checkPostTemplates` reads the
eligibility (`postTemplateEligibility`). With `--theme-src --dist` the theme is built, checked from the built
`theme.json`, and only then installed (`rebuildTheme` `beforeInstall`) — the install writes the site (theme, global
styles), so a refused template leaves the site as it was; after the install the site's own answer
(`WP_Theme::get_post_templates()`) confirms it before any content. Without `--dist` the local tree is not what the
site runs, so the site answers. A template the theme declares for other post types only, or has as a file without a
`customTemplates` row, stops the seed naming the post and what to declare (`"postTypes": ["page", "post"]` in
`theme.overlay.json`). An eligibility that cannot be read — `theme.json` missing, not a regular file, not valid, the
site's answer failing or malformed (a list element that is not a distinct template slug string — `[null]` is not a
template named "null" — or a key that is not a post type; the same shape is required of `theme.json`) — stops a real
seed too (a dry run notes it): unknown is not permission.
`report.templates.forPosts` lists the templates posts may take and where that was read.

The menu path reaches the post through the single-view redirect: a page-map page with view `single` and
`source.articleId` redirects (301) to **that article's** post, and to nowhere — with a note — when that article
is not a seeded post (before, an address without `<id>-<alias>` went to the first post of its locale). A single
view whose path is already the post's permalink gets no rule. A theme whose map serves the single view at its own path (`patterns.map.json` `views.single.servedAtPath`) gets no rule at all, and the route is probed for 200 — as for the search view; a rule the spec declares itself stays.

What the source prints around the article at that menu address — a related-articles module, a sidebar — comes with
the post as `posts[].route` `{ path, file?, contentKind: sections | blocks, content, aside?, modules? }`: the menu
page's composition with the article body as `{ kind: "body" }` or `<!-- wp:tracy-base/post-body /-->`. `postWithRoute`
renders it through `buildPageContent` as the page at `path` (its ACM instances, sections, slots, and `aside` in
columns) and puts the post's own body at the marker, so the modules are editable blocks in the post's
`post_content`, where the post's template prints them. A list module (`mod_articles_category`,
`mod_articles_categories` in `sections.other`) at one of the route's slots is drawn there as it is in a sidebar. A
`sections` slot entry that names its `modules` draws those, so two modules at one position keep a section between
them in the source's order; the first slot of a position also draws what no slot there names. A
module in `modules` the post does not draw (a kind with no block rendering, a category not seeded) is named in the
report's log with the post. A route that is not that shape — `aside` or `modules` not a list of ids, a `sections`
entry of an unknown kind or without the string it renders from, a slot whose `modules` is not a list of ids — or that names the body other than once, stops the
seed (the article would leave its own post); a post without `route` is its body.

### Authors

`content.authors[]` (`{ id, name, login?, description?, avatar?, avatarAlt? }`; from-joomla §Authors) declares the
people posts name by a **source identity** (`id`) and a post points at one with `author.id`. `postAuthors`
takes the declared author before any byline and before a translation's pair (a secondary-locale post with an
`author.id` of its own is that person's; only one with neither an `author.id` nor an alias takes its pair's author, wherever
the pair sits in `posts`); a post whose `author.alias` is set (Joomla's `created_by_alias`, printed instead of the
user; a translation's included) and a post whose `author.id` is not declared (noted; a translation's included) keep the
byline road, then the editorial user. A byline user's description is the role its default-locale post prints; a
secondary-locale post's role, on any road, is that user's `description_<locale>` (Polylang's biography there).
The login is the declared `login`'s Latin slug, else the name's; two declared people who would get
one login each get their id after it (`jvadmin-joomla-user-50`), whatever their order, then `-2`, `-3`, … while
that is still another declared author's login (a third author whose username IS `jvadmin-joomla-user-50` keeps it),
and a byline user — known by its name's Latin slug — never takes `editorial`, a declared login or another byline's: one whose
slug is taken becomes `<slug>-byline`, then `-2`, `-3`, … in slug order, skipping every login another byline starts from, whatever the
order of the posts (a byline "Editorial" is a user of its own, not the editorial user) — a name is not an identity. An entry without an id or a name is left out
with a note; `authors` that is not a list, or an id listed twice, stops the seed.

**A user is the seeder's only when it holds the seeder's identity** in the user meta `tracy_source_author`: a
declared author's `id`, else `tracy:byline:<slug>` for a byline user (its name's slug, whatever login it got) and `tracy:editorial` for the editorial user
(`ownerOf`; a declared id in that `tracy:` namespace is left out with a note). `seedAuthors` finds each user by it
(`wp user list --meta_key=tracy_source_author --meta_value=<identity>`), so a renamed author updates the same user and
a second seed makes none. Any other user of the login — the `admin` the install made, an editor, a user of an earlier
seed made before the identity existed, another author — is never updated, marked or given a post: the user gets a
login of its own, `<login>-<id>` (`<login>-tracy` for a byline or the editorial user), then `-2`, `-3`, …, never a
login another user of the run starts from, whatever the order; the logins passed over, and whose they are, are in a
note, and `report.authors.users[]` maps `{ identity, login, user }`. A site seeded before this keeps its old
`editorial` / byline users untouched and gets new ones beside them — they are not adopted by name; move posts back
or delete the old users in the admin if wanted. Every ownership answer is read strictly: a user list or meta read
that fails or is not a list, or a `user create` that fails or answers no id (the login taken meanwhile), stops the
seed — nothing is created or adopted on a guess. The avatar is
imported with the other media (`collectImages`), once, and its attachment id is stored in the user meta
`tracy_avatar`.

WordPress core draws avatars from Gravatar only: `get_avatar_url()` — what `core/avatar`, `core/post-author` and
`get_avatar()` print — never looks at a local image. When any author has an avatar, the seeder writes the
must-use plugin [`scripts/php/author-avatars.php`](../scripts/php/author-avatars.php) to
`wp-content/mu-plugins/tracy-author-avatars.php` (`installAvatarPlugin`, one `wp eval`: written when missing or
different, `same` otherwise; written to a temporary name and renamed over the target, so a short write never leaves a
half PHP file, and a link, directory or pipe at either name is refused as `failed`). Its `pre_get_avatar_data` filter hands WordPress the `tracy_avatar` attachment at the
size asked for; a user without the meta keeps the default. A must-use plugin loads whatever the theme is, and ships
with the webroot in a quickstart (it is under `wp-content/`). `report.authors.plugin` is `{ file, action: written |
same | failed }`.

The seeder does not take writing the plugin for done: after it, it asks the site for `get_avatar_url()` of every
user with an avatar, in one call (a new WP-CLI process, so the plugin is loaded), and records
`report.authors.avatars[]` `{ login, user, attachment, url, rendered, drawn }` — `rendered` true when the URL
WordPress draws is the attachment (a resized `-<w>x<h>` or `-scaled` copy counts; another file that only starts
the same, such as `item-10.jpg` for `item-1.jpg`, does not). A plugin that could not be written, or a user WordPress
still draws another picture for, is named in a report note ("imported and stored on the user … but not drawn").

### Article fields as post meta

`posts[].meta.<key>` (from-joomla `--article-fields` `{ "meta": "<key>" }`) is text a card or a template prints
outside the body. `checkPostMeta` reads every post's meta before anything is written: a key must be a lower-case
name (`[a-z][a-z0-9_-]`, ≤ 64), not protected (`_…`: WordPress hides it from the editor and from Block Bindings) and
not the seeder's own (`tracy_*`); a value is a string, number or boolean, written as a string. Anything else stops
the seed with the post and key. The values go through the post batch with the rest of the post's meta, so a second
seed reports the post `=`, a changed value updates the same post, and meta the spec does not name is left alone.

A key on a post is invisible until it is registered. The seeder writes the keys to the option `tracy_post_meta` and
the must-use plugin [`scripts/php/post-meta.php`](../scripts/php/post-meta.php) (`wp-content/mu-plugins/tracy-post-meta.php`,
written like the avatar plugin) registers each for posts on `init`: single string, `show_in_rest`, an auth callback
of `edit_post` on that post, `sanitize_text_field`. It skips a key that is not such a name or that
`is_protected_meta` says is protected. A `core/paragraph` with `metadata.bindings.content` `{ source: "core/post-meta",
args: { key } }` then prints the value and the editor edits it. A plugin that cannot be written stops the seed before
the posts (`report.postMeta = { keys, plugin }`).

### Article tags

`posts[].tags` (from-joomla reads them from `#__contentitem_tag_map` ⋈ `#__tags`, §Article tags) is the source of a
post's `tags_input`: the names in the order given, which is the order WordPress creates the terms in — the theme
lists a post's tags by term id, so the first post to name a tag fixes its place. `[]` means the source has none; a
spec without the field keeps the old reading, the "Tags: …" row a body ends with (`articleTail`). The names go as
the comma-joined string WordPress splits; a post whose names hold a comma sends them as a list, so a name is never
cut in two. A name repeated in another case is one tag (WordPress keeps one tag per name). `tags` that is not a list
of non-empty strings stops the seed before anything is written (`checkPostTags`). An archived article (`state 2`)
still gets `archived` beside its own tags.

### More Articles

A category blog whose `paging.links` is above 0 and that carries `moreArticles.heading` (from-joomla §Archive
per-page count) gets a second `core/query` (`queryId` 5, class `tracy-more-articles`) **between the cards and the
pager**, as Joomla prints `.items-more` before `.pagination-wrap` (#41 M6-17): nested in the cards query, in front of
its `core/query-pagination` (`withMoreArticles`; a pattern whose pager sits in a group gets it in that group). It
holds an editable `core/heading` h3 with the heading text, then a post template of linked `core/post-title`s — the
cards query's filters and order, `perPage` = `links`. Nested, it keeps its own `queryId` and query, so the offset
below still follows the cards query's page. Joomla lists the posts that open the **next** page (it pages by
cards alone — measured on the JA Vega source, [`scripts/test/fixtures/issue33/source-category-blog.json`](../scripts/test/fixtures/issue33/source-category-blog.json):
`/category-blog`, 1 leading + 6 intro, links 4, nine articles: page 1 shows seven cards and two titles, page 2 is
`?start=7` and shows those two as its cards, "Page 1 of 2"), which core's fixed `offset` cannot follow; the query carries `tracyMore { after: <cards queryId>, skip:
<perPage> }` and the must-use plugin [`scripts/php/more-articles.php`](../scripts/php/more-articles.php)
(`tracy-more-articles.php`) sets its offset to `page × perPage` from the cards query's own `query-<id>-page`, and
prints nothing — heading included — when the list has no post (the last page). `links: 0`, no `paging`, or a view
that is not a category draws nothing; `links` without a heading draws nothing and says so in the log; `links` that
is not a whole number ≥ 0 stops the seed. The plugin is written before the pages; a failure stops the seed
(`report.moreArticles = { archives, plugin }`).

### Pages the spec no longer seeds

After the redirects, `auditPages` reads every page on the site (`--post_status=any`) and reports, never changes:
**obsolete** pages — an earlier seed wrote them (their `_tracy_seed` fingerprint) and this run did not — and
**shadowing** pages — published at the path of a redirect rule, so WordPress serves the page and the redirect,
which fires on a 404 only, never runs (#33 M6-2: the old `/blog-detail` page stayed over the redirect to the post that
replaced it). Each is a report note and a log line with id, path, status and whether the seeder wrote it
(`report.pageAudit = { ok, checked, obsolete, shadowing }`); a page list that cannot be read is `ok: false` with the
error, never an empty audit. Trash, draft or keep the page in the admin — the seeder keeps ids and content.

### Archive per-page count

An archive may declare `perPage`, a positive integer (from-joomla §Archive per-page count: leading + intro articles
of a category blog). `buildArchiveContent` passes it to every query the archive page holds — the posts query of
each view and the child-page grid — and makes sure the query can page: the cards pattern's own
`core/query-pagination` when it has one, else the core pager (previous · numbers · next) after the post template.
An archive the Joomla adapter pages (`paging` beside `perPage`, `joomlaPaged`) marks that pager with the class
`tracy-joomla-pager`, and the seeder installs the must-use plugin that draws it as Joomla does
([`templates-and-patterns.md`](templates-and-patterns.md) §Joomla pagination; `report.joomlaPager = { archives,
plugin }`, written before the pages, a failure stops the seed). Every other archive keeps core's pager.
A value that is not a positive integer stops the seed naming the archive. An archive without `perPage` (another
adapter, or a spec from before the field) keeps 12 and no pager is added: its bytes do not change.

## 6d. Seeder fixes and open gaps (#68, #74)

#92 (first half), `issue92-seeder.test.mjs`: a second run settles — pager words with no labels, filtered biographies, distinct articles on one alias, a served single view without a 301 row, a draft page in a menu, a reused attachment on a route slug (§1, §3, §4).

Fixed in `seed.mjs`, each with a fixture in `issue68-seeder.test.mjs` / `issue74-seeder.test.mjs`:
new attachments never keep the slug of a top-level route (renamed `<slug>-image`), the front page gives
its slug to a synthetic `/home` parent, category names compare entity-decoded, a pattern the map names
but the site lacks stops the seed before any page, non-SEF `index.php/…` links resolve, redirects are
served by the `tracy-redirects.php` mu-plugin, `paging.labels` replaces the pager symbols. Archives
draw `archives[].sections` around the list (positions named top/header/masthead above, the rest below)
and a `views.<view>.block` replaces the cards; a tag route reads `archives[].tags` / `orderBy` / `order`;
`mod_articles_latest`, `mod_finder`, `mod_tags_popular` and a slot's `mod_articles_category(ies)` are
blocks. `pages[].tags`, `authors[].meta`, a menu item on `source.articleId` (post link) and map fields
with `classPrefix` / `classMap` are written. Prune keeps attachments named by user meta (`prune-usermeta.mjs`).

Reported, not fixed (owner in brackets): `mod_menu` sidebar and the author people list have no block
(notes carry `unsupported`) [theme]; tags in Joomla tree order — `get_the_terms` sorts by name [theme];
a `single` route cannot be both a 200 and a 301 row: the seeder derives no rule where `views.single.servedAtPath` says the theme answers 200, but a rule the spec declares at such a path still conflicts with it [spec];
the pager counter inside `<nav>` [`joomla-pagination.php` + parity extraction]; a tag route needs
`archives[].tags` from the adapter (the page-map keeps one id) [adapter], and its query still lists
posts only — core Query Loop has one post type, so a page carrying the tag is not listed [theme];
Nova S-08 (accent `<span>` in an ACM field is written as plain text), S-09 (HTML in a field other than
`tab-body` is not converted to blocks) and S-11 (template-computed values have no declaration path) have no
seeder fix yet — the spec workaround stays in `fix-spec.mjs` [seeder, open, no fixture].

## 7. Checks after seeding (counts must match the inventory)

```bash
docker compose -p tracy-base-wp7 run --rm cli post list --post_type=post --format=count      # = posts in content.json
docker compose -p tracy-base-wp7 run --rm cli term list category --format=count             # = categories
docker compose -p tracy-base-wp7 run --rm cli post list --post_type=wp_navigation --format=count   # = menus
docker compose -p tracy-base-wp7 run --rm cli post list --post_type=page --fields=ID,post_name,post_status
```

Run the seeder a second time: every count **unchanged**, every ID **unchanged**. Then `scripts/shoot.mjs` on 43 routes
([`verify-recipes.md`](verify-recipes.md)) — a page that is 200 but blank is a slot not replaced or a block not registered.
