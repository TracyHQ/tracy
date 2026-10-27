# Templates, template parts and patterns — what goes where, how to name it

> **Phase 5 packet (templates-patterns).** Read before writing a `templates/*.html` or
> `patterns/*.php` file. Prerequisite: chrome (Phase 3) and `theme.json` (Phase 4) are in place. The official hierarchy table:
> [`wordpress-anatomy.md`](wordpress-anatomy.md) §2.

## 1. The overlay wins, the generated tree is not edited

Theme `tracy-base` = `src/tracy/` (shared source) **+** `overlays/tracy-base/` (overlay) → `src/tracy-base/`
(generated tree, committed, gated). On the same path the overlay wins; a new path is added
([`theme-json-tokens.md`](theme-json-tokens.md) §4). Three rules:

1. **Edit in `overlays/tracy-base/`**, then `node scripts/build.mjs --target tracy-base`. Editing
   `src/tracy-base/` directly is refused by `--check` on the next run.
2. Do not put files at **generated** paths into the overlay (`styles/*.json`, `inspirations.json`, fixtures,
   artifacts, `theme.json`) — the build throws.
3. `theme.config.json`, `theme.overlay.json`, `patterns.map.json` are **overlay metadata**, never
   in the theme (`OVERLAY_META_FILES`).

A fix in `src/tracy/` (the shared source) reaches `tracy-base` on the next build; `--check` refuses a tree that missed it.

## 2. Templates — 16 files, following 8 T4 layouts

`overlays/tracy-base/templates/` (13/09):

| File | Hierarchy / role | Notes |
|---|---|---|
| `index.html` | required fallback — the mark of a block theme | |
| `front-page.html` | home page (`show_on_front=page` + `page_on_front`) | header + `core/post-content` + footer, no title |
| `home.html` | posts page (`page_for_posts`) | Query Loop |
| `page.html` | ordinary page | `.tracy-container` → `.tracy-page__head` (post-title h1 `.tracy-display`) + `post-content.tracy-page__body.tracy-prose` |
| `single.html` · `archive.html` · `category.html` · `tag.html` · `author.html` · `date.html` · `search.html` · `404.html` | per the hierarchy | `category-{slug}.html` → `category.html` → `archive.html` → `index.html` |
| `page-landing.html` | T4 layout `home`/`home-2`/`landing`/`od-landing` | like front-page: bare post-content |
| `page-onepage.html` | `od-onepage` | |
| `page-no-sidebar.html` · `page-sidebar-left.html` | `no-sidebar` · `sidebar-left` | sidebar = `core/columns`, no widgets |

Five page templates are declared in `theme.overlay.json → customTemplates` (`name` = file name without extension,
`postTypes: ["page"]`): `landing` (the base theme's section library), `page-landing`, `page-onepage`,
`page-no-sidebar`, `page-sidebar-left`. A page picks its template through the `_wp_page_template` postmeta — the seeder writes it
from `content.json → pages[].meta._wp_page_template` ([`demo-content.md`](demo-content.md)).

A template is block markup **with no content text**: `core/post-title`, `core/post-content`, Query Loop,
`core/search`. Frame: `layout: default` + the `.tracy-container` class (the design system's container, gutter
inside), **not** WordPress's constrained layout (it centres on the content size, with no gutter)
— package README §Frames.

## 3. Patterns — two sets, two categories

| Set | Where | Category | Slug | Count 13/09 |
|---|---|---|---|---|
| Shared section library (`tracy-cms-sections`) | `src/tracy/patterns/` | `tracy` | `tracy/section-hero`, `section-problem`, `section-pillars`, `section-how-it-works`, `section-features`, `section-proof`, `section-social-proof`, `section-faq`, `section-pricing`, `section-cta-inline`, `section-cta-final`, `section-contact`, `section-styleguide`, `landing`, `pricing`, `cards` | 16 |
| One pattern per Joomla ACM type | `overlays/tracy-base/patterns/` | `tracy-base` (registered in `inc/extra.php`) | `tracy-base/section-<type>[-<style>]` | 21 (18 ACM types; `hero`, `story-chapter`, `team` 2 styles each) |

j6's home `/` runs the `od-landing` layout with 12 OpenDesign `mod_custom` → the wp7 Home is the
`tracy/section-*` patterns with the text from those 12 modules, template `page-landing`, **no** `core/html` (D6). The other
pages: `tracy-base/section-*` patterns per ACM.

### Pattern header (sample `section-accordion.php`)

```php
/**
 * Title: Accordion
 * Slug: tracy-base/section-accordion
 * Description: … the Joomla ACM block `accordion` …
 * Categories: tracy-base, tracy
 * Block Types: core/details
 * Post Types: page
 * Viewport Width: 1200
 * Inserter: yes
 * Keywords: accordion, faq, questions, details, acm
 */
```

Files in `patterns/` **register themselves** when the header is valid. Sample strings go through `esc_html_e( '…', 'tracy-base' )`
— this is why patterns are PHP while parts are HTML: only patterns can be translated. Images through
`esc_url( get_theme_file_uri( 'assets/images/…' ) )`.

### `metadata.name` — the contract between pattern and seeder

`overlays/tracy-base/patterns.map.json` (`schemaVersion: tracy-base-patterns-map/v1`) is the map ACM type
(+style) → pattern → **each field**. Conventions (from the file's `$comment`):

- Every editable block carries `"metadata":{"role":"content","name":"<type>.<field>[.<n>]"}`: `<type>` is the
  ACM type, `<field>` the ACM field name **verbatim** (the inner name of a nested group: `slide-title`, not
  `slide.slide-title`), `<n>` the 1-based index within a repeated group.
- The wrapper of a repeated item carries `{"name":"<type>.item.<n>"}` **without** `role`: clone/delete the wrapper to change the number of
  items, the children keep their names with the new index.
- A block drawing two fields lists both: a button carries `btn-1-text` (text) + `btn-1-link` (url); an image carries the
  media field (`src`) + the alt field (`alt`). `attr` says which attribute a field lands in; `repeat` names the ACM group
  when it repeats; `dropped` lists fields with no block and why (e.g. `contact-information`: the socials group the
  source template never renders).
- **Locate a block by `metadata.name`, never by position.**

`role: content` also matters to WordPress 7.0: a pattern is inserted in `contentOnly` mode by default, and only blocks
with `role: content` are editable ([`wordpress-anatomy.md`](wordpress-anatomy.md) §1, 7.0). Text outside
`role: content` is text the site owner **cannot edit** — review gate number one
([`editability-standards.md`](editability-standards.md)).

ACM's three background tones `canvas | warm | gray` (`surface`/`ground`) become classes on the root `core/group`
(`bg-bg` / `bg-surface-warm` / `bg-surface` + `acm-<type>--<tone>`), read by `sections-extra.css`.
Field-level documentation of each ACM: `tasks/tracy-base-wp7/acm-blocks.md`.

### Three other kinds of pattern (see `inputs/from-joomla.md` §3)

- **Synced pattern** (`wp_block`, `<!-- wp:block {"ref":N} /-->`): one block repeated in many places, edited once —
  27 `mod_custom` that are text/images, `contact-information` in the footer + Contact. Created by the seeder, not a theme
  file.
- **Starter page pattern** (`Block Types: core/post-content` + `Post Types: page`): shown in the modal when creating a
  new page. The `tracy-base/section-*` patterns declare `Post Types: page`; also declare `core/post-content`
  when you want them to be starters.
- **Pattern inside a template/part**: `<!-- wp:pattern {"slug":"…"} /-->` renders inline, not in the Inserter
  — the footer uses it for `section-social-links`, `section-contact-information`, `section-site-notice`.

## 4. After writing

```bash
cd packages/cms/tracy-wordpress-theme
node scripts/build.mjs --target tracy-base            # generates src/tracy-base/ + dist/tracy-base-<version>.zip
node scripts/build.mjs --target tracy-base --check    # gate
```

Then reinstall on the stand (`wp theme install /dist/tracy-base.zip
--force --activate` through the `cli` service — [`packaging.md`](packaging.md) §2) and render one page assigned to each
template. A template that no page is assigned to has not been proven.

## 404 page per language

The seeder keeps the source's "not found" page as a **draft** (the `/404` path must return a real 404) and writes its id
into the option `<theme>_404_page`. A synthetic view `404` too (a Joomla source has only `error.php`, no article): with
no source page the seeder makes a draft `page-not-found` from the page-map `title` and leaves a note to write the
source's other words in the admin — the 404 words live in the database, never baked into the template
([`demo-content.md`](demo-content.md) §6b). The `404.html` template has a group named `404.body`; the theme (hook
`render_block_core/group`) replaces the group's inside with that page's content — through `pll_get_post` to get the
translation when Polylang is present — and the generic text in the template is only a fallback. No option, no hook: the template
draws the generic text. Measured 14/09 on Northgate RU: `/ru/404` draws "Такая страница не найдена" from the translation.


## Joomla pagination

A Joomla category blog prints its pager as `« ‹ 1 … N › »` — start and previous disabled on the first page, next
and end disabled on the last — beside a "Page N of M" counter, in a `.pagination-wrap` that wraps when the line is
full. Core's `core/query-pagination` prints the numbers and one arrow on each side only while there is a page that
way, so a port had to write its own pager (#41 M6-16). The kit ships it:
[`scripts/php/joomla-pagination.php`](../scripts/php/joomla-pagination.php), a must-use plugin the seeder installs
(`tracy-joomla-pagination.php`) for every archive the Joomla adapter pages ([`demo-content.md`](demo-content.md)
§Archive per-page count).

- **The block stays core's.** Only a `core/query-pagination` whose `className` carries `tracy-joomla-pager` is drawn
  by the plugin (`render_block_core/query-pagination`); the block is still edited, moved or removed in the editor,
  and without the plugin it renders as core's pager.
- **Counted from its own query.** The page is `?query-<queryId>-page=N` and the total a `WP_Query` of
  `build_query_vars_from_query_block()` for the block's own context, capped by the query's `pages` — the way core's
  pagination blocks read them; a query that inherits the main query reads that one. Links keep every other argument
  of the request. One page or none: no pager, as Joomla prints none. A page past the end shows as the last page,
  as Joomla clamps it; a page number that is not digits is page 1. Ten numbers at most around the current page
  (Joomla's `displayedPages`).
- **Markup**: `nav.wp-block-query-pagination.tracy-pager` › `ul.tracy-pager__list` › `li.tracy-pager__item`
  (`is-current`, `is-disabled`) › `a|span.tracy-pager__link`, then `p.tracy-pager__counter`. Labels
  ("Go to page 3", "Page 2 of 4") pass through the `tracy_joomla_pager_labels` filter.
- **Style**, printed once on a page that draws a pager: flex rows that wrap (at 390 px the counter goes under the
  numbers), colours from `--wp--preset--color--primary`/`base` and the text colour — no fixed colour, so the dark
  restatement under `html[data-theme="dark"]` restyles it. A theme's own CSS for `.tracy-pager*` wins where it is
  more specific.
