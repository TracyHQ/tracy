# Content model

Read ../AGENTS.md and architecture.md. The facts below come from the theme's files and from the
spec-pack the site was built from (`tasks/ja-essence-wp7/spec/` in the Tracy repository). Counts of
what the seed created are **at seed time** (build stand, seed report 18): 46 posts, 37 pages, 11
categories, 9 authors, 2 navigation posts, 2 template parts, 1 form; the media library held 128
attachments (64 imported picture files and their sizes). Check the live site before relying on any
of them (`wp post list --post_type=page --fields=ID,post_name,post_status`).

## Pages and routes

The spec-pack maps 31 pages, two of them synthetic (the article route and `/404`;
`spec/page-map.json`). Paths keep the Joomla menu paths. Seven grouping pages exist only to hold the
path (`/home`, `/detail`, `/category`, `/pages`, `/pages/user`, `/pages/j-pages`,
`/pages/j-content`); they are published and have no template assigned. The template named below is the one
assigned in `_wp_page_template` on the build stand; "none" means the page falls back to `page.html`.

| Path | Template | Notes |
| --- | --- | --- |
| `/` (page `home-3`, the front page) | `front-page` | two category sections (`acm-articles-category-133`, `-134`), the `front-list` pattern and the gallery strip. `/home/home-3` is a 301 to `/` |
| `/home/home-1`, `/home/home-2`, `/home/home-4`, `/home/home-5` | `page-landing` | the four other home layouts: list pattern (`front-list`, `front-list-warm` on home-2 and home-5, `front-list-grid` on home-4) plus the sections of the source's layout |
| `/category/category-style-1` to `-4`, `/resources`, `/lifestyle` | `page-no-sidebar` | category listings: a query block bound to categories by **term id** (below) |
| `/pages/j-content/category-blog`, `/pages/j-content/author-listting`, `/pages/j-content/tagged-items` | `page-no-sidebar` | blog list (term id of Fashion), a post list, a tag cloud plus post list |
| `/pages/j-content/featured-articles` | `page-landing` | newest posts across the blog category |
| `/detail/layout-1`, `/detail/layout-2`, `/detail/layout-3`, `/detail/video`, `/detail/gallery` | `page-article` | articles that are **pages**, not posts: static byline, Prev/Next, Share article (`__JE_PERMALINK__` token) and Tags in, from the source render; `video` embeds the YouTube player |
| `/contact` | `page-contact` | intro card plus `[contact-form-7 id="65" title="Contact"]` |
| `/pages/user/login-form`, `/pages/user/registration-form` | `page-login`, `page-register` | the seeded content is a bare form block |
| `/pages/user/user-profile`, `/pages/user/edit-user-profile` | `page-account` | a static profile preview, answered 200; the source answers a guest with 303 (D-66) |
| `/pages/j-pages/error-page`, `/offline-pages`, `/typography` | none | plain pages; `typography` is the specimen page |
| `/pages/j-pages/smart-search` | none | a **draft** page answered by the theme's search view (below) |
| `/category/category-style-3/vintage-inspired-martini-cocktail-glasses` | `single` | answered by the post `vintage-inspired-martini-and-cocktail-glasses` (spec: synthetic) |
| `/<post-slug>/` | `single` | the 46 posts |
| `/404` | `404` | synthetic, not a page |

## Templates, parts and what they read

- `templates/`: `404`, `archive`, `front-page`, `home`, `index`, `page`, `page-account`,
  `page-article`, `page-contact`, `page-landing`, `page-login`, `page-no-sidebar`, `page-register`,
  `search`, `single`. `archive`, `home`, `index` and `search` print the pattern `post-list` (inherited
  main query, six per page); `single` prints the post's picture, category badge, title, author
  name and date, content, previous/next links and the post's tags.
- Named blocks the PHP or the seeder looks for by `metadata.name`: `page.title` (heading
  override, in `page.html` and `single.html`), `nav.mainmenu` (header, drawer), `nav.category`
  (footer), plus the editable words `header.subscribe`, `header.social`, `footer.copyright`. Do not
  rename them in a template or a part. The footer tagline, its "Become a subscriber" button and the
  note under it carry no name since 1.0.10: a named block is the content contract's, and no slot
  named them, so nothing rewrote them; unnamed, Tracy's site build rewrites them with the other
  words of the page, in the site's language.
- Page heading: post meta `tracy_page_heading` replaces the page title in the `page.title` block
  when it is not empty (the detail pages carry the article title there, since their menu title is
  "Layout 1" and so on).
- The footer holds words as the source prints them: tagline "A super modern theme following the
  latest trends with premium membership", button "Become a subscriber", the copyright line
  (docs/content-rules.md, D-04 and the Joomla line). They are rows in the `footer` template part.
- The 404 template prints the pattern `page-404` ("404", "Page not found", "An error has occurred
  while processing your request.", a "Home Page" button), whose words go through the theme's text
  domain (1.0.10), and has no header or footer. The draft page
  `page-not-found` (content "Not found") and option `wp_ja_essence_404_page` (its id) exist but
  nothing in the theme reads them: edit the template in the Site Editor to change the 404 words.

## Sections (patterns)

A section is a pattern `wp-ja-essence/<name>` inserted into a page as a **copy**. The seeder fills
each from the spec by `patterns.map.json` (15 Joomla ACM `type:style` entries; the field map is in
that file; a block is located by `metadata.name` = `<type>.<field>[.<n>]`, a repeated row's wrapper
is `<type>.item.<n>`, the section's anchor is `acm-<type>-<module id>`). No synced patterns
(`wp_block`) were created at seed time.

| Pattern | What it draws |
| --- | --- |
| `lead-slider`, `editors-choice` | the row of three picture cards; the "Editor's choice" block |
| `front-list`, `front-list-warm`, `front-list-grid` | the blog list of the home pages: white cards, warm-tinted cards (home-2, home-5), a grid (home-4) |
| `post-list`, `tracy/cards` | the blog list and its card (the overlay's own `tracy/cards` replaces the source theme's); `post-list` is what `index`, `archive`, `home` and `search` print |
| `section-articles-category-slide-feat`, `-slide-normal` | lead sliders by category (ACM `articles-category` styles) |
| `section-articles-category-list-2-feat`, `-list-2-normal`, `-list-blog`, `-default-feat`, `-horizontal-feat` | post rows and lists by category |
| `section-articles-latest-latest-feat`, `-latest-nsub` | newest posts (ACM `articles-latest`) |
| `section-related-items-related-default`, `-related-type-1` | "More reading": other posts, excluding the one being read (`wpJaEssenceOthers`) |
| `section-articles-categories-slide` | category chips: the Categories block, name and count |
| `section-tags-popular` | tag cloud, six tags |
| `section-newsletter` | a card with a title, an intro line and a "Sign up" button linking to `/contact/` (no mailing list, D-10) |
| `section-social` | follow-me card: four service buttons (Facebook, X, Instagram, RSS), glyph chosen by position |
| `section-gallery` | the picture strip (six pictures, `gallery.image.<n>`) |

`section-articles-*` patterns name their categories by slug in the query (`wpJaEssenceCategory`),
resolved at render time with their sub-categories; the slugs on the seeded pages are `blog-health`,
`blog-design`, `blog-fashion`, `blog` and `blog-normal` (the marker category below). Posts are
newest first: the source orders some lists by hits, and WordPress has no hit counter (D-09, D-14).
The seeded queries set `"sticky":"ignore"` because 20 posts are sticky (the source's featured
articles) and WordPress would otherwise prepend them to every nested query on the static front page
(D-08).

## Listing pages and term ids

- The category pages' query blocks are bound by **term id**, not by slug: `category-style-1` to
  term 5 (`blog-health`), `category-style-2` to 6 (`blog-design`), `category-style-3` and
  `category-blog` to 7 (`blog-fashion`), `category-style-4` to the term `blog-normal` (a flat marker
  category, no children), `resources` to 8, `lifestyle` to the term `lifestyle` (ids on the build
  stand). A site restored from a
  quickstart keeps the ids; a re-seed on another database writes the ids that database assigned.
  Deleting and recreating a category breaks its listing silently.
- **One category tree** (1.0.1): `blog` > Health (`blog-health`), Design (`blog-design`), Fashion
  (`blog-fashion`), Resources (`resources`), Lifestyle (`lifestyle`). The source's second tree (Blog
  Normal > Health, Design, Fashion) is why 1.0.0 drew those chips twice; its ten articles are filed
  under the flat marker category `blog-normal`, which no chip, badge or count ever draws
  (`WP_JA_ESSENCE_HIDDEN_CATEGORIES` in `inc/extra.php`); a card of that group keeps the label of the
  category it stands for in the post meta `je_label`. `/category/category-style-4` lists it.
- Category views differ in the source (hero card, horizontal cards, sidebar); here one `tracy/cards`
  card serves all, and type sizes vary per page through the body class `je-slug-<page slug>`; do
  not rename those pages (D-53). Category Blog also shows the card's intro and tags
  (`.je-slug-category-blog`).
- **The order of a list** (1.0.3): the source orders its lists by fields WordPress has no column for, so
  every article keeps them as post meta and `inc/extra.php` (`wp_ja_essence_order_clauses()`) sorts by
  them again. `je_src_id` is the Joomla article id (the last tie-break everywhere), `je_catpos` the
  position of its Joomla category, `je_ordering` its manual order inside the category, `je_hits` the
  counter the Trending lists sort by (ascending), `je_created` its creation time (`YYYYMMDDHHMMSS`; the
  seeder moves post dates by seconds, so lists never sort by `post_date`), `je_front` its place in the
  source's featured order (absent: not featured), `je_metakey` the keywords "More reading" relates by.
  A list names its order in its query (`wpJaEssenceOrder`: `category`, `front`, `hits`, `latest`,
  `title`); a category page's own list takes `category` unless the owner sets another order. The
  featured lists (`wpJaEssenceFeatured`) are the articles that have a `je_front` place, copies of the
  second tree included, as the source's featured view prints them; `front-list-home-1/-home-3/
  -warm-home-2/-grid-home-4/-warm-home-5/-featured` are those lists, one pattern per source page
  (`tools/gen-patterns.mjs` LISTS). Every pager of a list with more than one page prints "Page N of M".
  An article added by the owner has none of this meta and sorts after the ones that have it.
  "More reading" lists the first articles that share a keyword with the page by Joomla id, printed by
  manual order then id (`wp_ja_essence_related_ids()`); an article with no keyword relates to nothing.
- Pagers: a pager block with the class `tracy-joomla-pager` is drawn by the must-use plugin
  `tracy-joomla-pagination`; a listing of one page prints no pager. Without the plugin core's pager
  prints.

## Search

`/pages/j-pages/smart-search` is the source's `com_finder` page. The theme maps it to WordPress
search: the page must exist as a **draft** (a published copy would take the path away from the
filter). The seeder links it from the menu as a custom link with a trailing slash, since a menu
link by id to a draft is dropped (S-10). The header search is a core search block; `/?s=` also
works.

## Posts, categories, tags

- 46 posts under `blog-*`, `blog-normal`, `resources` or `lifestyle`; 20 are
  sticky. Their authors are nine imported users (role `author`); a post's byline
  is the post-author block, the author pictures come from user meta `tracy_avatar`
  (must-use plugin). Posts keep their tags (6 tags on the stand).
- Categories on the stand and their counts, which are the source's (home-2 chips): `blog-health`
  12, `blog-design` 9, `blog-fashion` 9, `resources` 6, `lifestyle` 5; `blog-normal` 10 (marker, not
  drawn); `blog`, `uncategorised` and WordPress's own `uncategorized`, 0. The five article pages
  (Layout 1-3, Video, Gallery) are filed under their category too (`pages[].je.category`, written by
  `tasks/ja-essence-wp7/tools/reconcile.php`; the theme registers `category` for pages), which is
  how Health reaches 12 and Fashion 9 as in the source.
- **Copies.** The source keeps 19 articles twice under different categories and 5 article pages
  as posts too (same title and picture, another Joomla article); 1.0.0 listed them as separate
  posts, 13 titles up to four times. The port keeps every copy so each category still lists what the
  source lists, and flags it: post meta `je_copy_of` (the article it copies), `je_unlisted` (a copy
  that repeats a title inside its own category), `je_label`. `wp_ja_essence_listing_args()` lists a
  copy only under the one category it is filed under; the home page, trending, latest, "more
  reading", search, tags and the authors leave copies out. A new post is an original unless it
  carries those meta keys.
- 19 articles share an alias across categories; WordPress renumbered the later ones with `-2`
  (S-03; they are the copies above). Articles answer at `/<slug>/`; the one Joomla article address kept is the article route
  (docs/architecture.md). The spec's `redirects.json` carries one rule (`/home/home-3` to `/`).

## Menus

Two `wp_navigation` posts at seed time (ids 149 and 150 on the stand), one per Joomla menu type of
`spec/menus.json`:

| Menu type | Items (spec) | Used in |
| --- | --- | --- |
| `mainmenu` (post `mainmenu`) | Home (Home 1 to 5), #Category (Category Style 1 to 4), Detail (Layout 1 to 3, Video, Gallery), Pages (User: Login Form, Registration Form, User Profile, Edit User Profile; J!Pages: Error Page, Offline Pages, Typography, Smart Search; J! Content: Category Blog, Featured Articles, Author listting, Tagged Items), Contact | header (`nav.mainmenu`, the bar) and the header's off-canvas drawer (`nav.mainmenu`) |
| `category` (post `category`) | Health, Design, Fashion (the first three category-style pages), Resources, Lifestyle | footer (`nav.category`) |

The source's unpublished items (a second "Home 1" alias, "Blog Detail", "Demo", a second Fashion)
were not carried. The two parts' navigation blocks hold `"ref"` ids pointing at these posts (149,
150 on the stand); a database where the posts got other ids needs the parts' rows re-pointed.

## Options, meta and redirects

| Key | Meaning |
| --- | --- |
| `wp_ja_essence_redirects` | rules `{from, to, status}`; exact path, applied only when WordPress would answer 404, by `tracy-redirects`. Two rules at seed time: `/home/home-3` to `/`, and the source address of the article route to `/vintage-inspired-martini-and-cocktail-glasses/` (the theme also answers that address with 200, so the rule is a fallback) |
| `tracy_redirects_option` | the name of the option above, read by the must-use plugin |
| `wp_ja_essence_404_page` | id of the draft page `page-not-found`; **unused by the theme** |
| `category_base` | `topic` (docs/install.md) |
| `tracy_motion` | motion settings; absent, so no motion effect loads |
| post meta `tracy_page_heading` | heading override for pages |
| post meta `_tracy_seed` | the seeder's fingerprint of a row; do not edit |
| user meta `tracy_avatar` | attachment id of an author's picture |
