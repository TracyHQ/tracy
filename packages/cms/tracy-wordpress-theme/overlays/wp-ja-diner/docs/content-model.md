# Content model

Read ../AGENTS.md and architecture.md. The facts below come from the theme's files, the spec-pack the site
was built from (`tasks/ja-diner-wp7/spec/` in the Tracy repository) and read-only `wp` commands on the
build stand (21/10/2026). Counts are **at build time**, not live: 30 pages (3 of them drafts), 22 posts,
75 media items, 7 categories, 3 tags, 4 navigation posts (3 menus plus the editor's default `navigation`),
0 synced patterns (`wp_block`), 2 template-part rows. Check the live site before relying on any of them
(`wp post list --post_type=page --post_status=any --fields=ID,post_name,post_parent,post_status`).

## Where each kind of text lives

| Text | Lives in | Find it | Edit it |
| --- | --- | --- | --- |
| A page or post body, its sections included | `post_content`, block markup | `wp post list --post_type=page --fields=ID,post_name,url` | the editor, or `wp post update <id> --post_content=@file` |
| Masthead title, picture and line under it | the `acm-masthead-default` copy at the top of 14 stored pages (`masthead.title`, `masthead.background`, `masthead.description`) | the page | the editor. The archive, category, tag, home, index and single views borrow the masthead and the Subscribe band of the page `our-blog`; the search view borrows the masthead of the draft `smart-search` page (`jrMasthead`/`jrSubscribe` in the templates) |
| Subscribe band | a copy of `acm-subscribe-default` in **every** page that has one (23 pages carry `subscribe.root`); `all-categories` takes the band of `fetured-articles` | `wp post list --post_type=page` | edit each page; there is no shared copy |
| Menus | `wp_navigation` posts | `wp post list --post_type=wp_navigation --fields=ID,post_name,post_title` | Site Editor > Navigation, or the post's block markup |
| Footer location, hours, contact, copyright | `parts/footer.html` (`footer.location`, `footer.hours`, `footer.contact`, `footer.copyright`), shadowed by the `footer` row | `wp post list --post_type=wp_template_part --fields=ID,post_name` | Site Editor > Patterns > Template parts |
| Site name, logo, front page | `blogname`, `site_logo`, `tracy_logo_dark`, `show_on_front`, `page_on_front` | `wp option get blogname` | `wp option update …`, or Settings > General / Reading |
| Sidebar of listings and articles | `parts/sidebar.html` -> pattern `part-sidebar` -> block `wp-ja-diner/blog-sidebar` (banner, Categories, Login, Latest News) | the theme | a theme change; the banner picture is the attachment id in option `wp_ja_diner_blog_banner_image` |
| 404 screen | `patterns/part-404.php` | the theme | a theme change (text is translatable through the `wp-ja-diner` text domain) |
| Contact, login, registration, reminder and reset forms | theme patterns `contact-form`, `account-login`, `account-register`, `account-remind`, `account-reset`, swapped into their pages at render time | the theme | a theme change |
| Redirects from retired URLs | option `wp_ja_diner_redirects`, JSON `[{from,to,status}]` | `wp option get wp_ja_diner_redirects --format=json` | `wp option update wp_ja_diner_redirects --format=json < rules.json` |

`{site.title}` and `{year}` in a paragraph or Custom HTML block are filled at render time with `blogname`
and the current year (`inc/identity.php`); the footer's copyright line uses them. Any other `{…}` is
printed as written.

## Pages and routes

The spec-pack maps 26 routes (`spec/page-map.json`), including a synthetic single article and a synthetic
404. Paths keep the Joomla menu paths (`j-pages`, `other-pages`, `home` and `content` are parent pages that
exist to carry the paths).

| Path | Template (`_wp_page_template`) | Sections in the spec |
| --- | --- | --- |
| `/` (page `front-page`) | none; `front-page.html` by hierarchy | slideshow, features-intro 1 and 2, menu tabs (container-tabs) with three menu-style-1 panels, features-intro 3, subscribe, latest news |
| `/home/home-red`, `/home-pink`, `/home-green`, `/home-blue` | page-landing | the same sections as the front page; the colour is the body class `jd-theme-<colour>` (`inc/groups/g1.php`, `assets/css/groups/g1.css`) |
| `/about-us` | none | masthead, features-intro 4 and 5, teams, subscribe |
| `/reservation` | none | masthead, features-intro 3, subscribe; the theme frames its text like an article |
| `/offers` | page-landing | masthead, happy hours styles 3, 1, 2, subscribe |
| `/our-blog` | none | masthead and subscribe; the list and sidebar are drawn by the theme (below) |
| `/contact-us` | page-contact | masthead, subscribe; the theme inserts its contact form |
| `/j-pages/login`, `/j-pages/registration` | page-login, page-register | masthead, the account form swapped in by the theme, subscribe |
| `/password-reset`, `/username-reminder-request` | page-password | the account form swapped in by the theme, subscribe |
| `/your-profile`, `/j-pages/user-profile`, `/j-pages/edit-user-profile` | page-account | masthead, subscribe; guests get 303 to Login |
| `/other-pages/smart-search` | none (**draft**) | masthead, subscribe; answered by the search view |
| `/other-pages/error-page`, `/other-pages/offline-page` | none | subscribe and sample text (D-38) |
| `/content/all-categories`, `/content/tagged-items` | none | masthead and subscribe (`all-categories`: the theme draws the masthead and takes the band of `fetured-articles`); lists drawn by the theme |
| `/content/fetured-articles` | page-landing | masthead, subscribe; list drawn by the theme (`fetured-articles` is the source's spelling) |
| `/content/typography` | none | masthead, subscribe; the theme frames its text like an article |

The synthetic single route stands for article 3 of Our Blog at the source's address
(`/our-blog/10-restaurant-news/3-cocktail-bar-alchemist-set-to-open-at-mediacity-in-salford-quays`, D-30).
Three source routes have no WordPress equivalent (`/submit-an-article`, `/template-settings`,
`/site-settings`): they answer 303 to Login (D-16). `/joomla-content/*` answers 301 to `/content/*` (D-36).
One page, `login`, carries post meta `tracy_page_heading` from the seed, but no block named `page.title`
exists on this site, so it is not printed: the masthead heading is the stored `masthead.title` block.

## Pages the theme completes at render time

Renaming or moving these pages removes what the theme adds:

- **Listing pages by slug** (`wp_ja_diner_blog_page_slug`): the stored page keeps its masthead and
  Subscribe band; the theme replaces the rest with the block `wp-ja-diner/blog-body` and the sidebar.
  `our-blog`: twelve articles per page in a masonry grid, "More Articles ..." and the pager;
  `fetured-articles`: the sticky posts (5 at build time: ids 43, 47, 51, 55, 59) and the rest as links;
  `tagged-items`: articles by tag (3 tags: `food`, `meet`, `menu`); `all-categories`: one card per child of
  the category `our-blog` (picture from term meta `jd_category_image`, else the newest article's
  featured image; no term had the meta at build time). The sidebar of the last two draws only the Login and
  Latest News modules.
- **Article list picture**: each list card, and the "News & Events" cards of the home page, draw the
  attachment in post meta `jd_intro_image` (21 posts at build time), else the featured image. The article's
  own page draws the featured image. Written by `tasks/ja-diner-wp7/tools/post-seed.sh` (D-31 records
  the earlier default).
- **By path**: `j-pages/login`, `j-pages/registration`, `password-reset`, `username-reminder-request` get
  their account pattern in place of the stored bare sign-in block; `contact-us` gets `contact-form`
  after the first Custom HTML block, and its stored Contact Form 7 shortcode is removed; `reservation` and
  `content/typography` get the source's article frame.
- **Masthead description**: the line under a masthead is the stored paragraph `masthead.description` of
  the page. `inc/groups/account.php` also supplies the source's constant line ("Quisque dolor fringilla
  semper, …") as the excerpt of a page with none, which only shows where a Post Excerpt block is used;
  the sentence "Responsive WordPress theme for restaurant" replaces the source's CMS-named default (D-37).

## Sections (patterns)

A section is a pattern `wp-ja-diner/acm-<type>-<style>` inserted into a page as a **copy**. The seeder
fills each from the spec through `patterns.map.json` (ACM `type:style` and module-id entries). Every
editable block carries `metadata: {"role":"content","name":"<type>.<field>[.<n>]"}`; a repeated row's
wrapper is `<type>.item.<n>` (no role): clone or delete the wrapper to change the item count. Locate a
block by `metadata.name`, never by position; blocks without `role: content` are the frame. No synced
patterns were created.

| Pattern | What it draws |
| --- | --- |
| `acm-slideshow-style-owl` | full-width slides with a title, a lead and two buttons (motion carousel) |
| `acm-features-intro-style-1` | a label, text and button beside two picture cards |
| `acm-features-intro-style-2` | a carousel of dish pictures |
| `acm-features-intro-style-3` | a quotation with a name and role beside a picture |
| `acm-features-intro-style-4`, `-5` | a small title, a large title, text and button beside picture thumbnails (About Us) |
| `acm-container-tabs-style-1` + `acm-menu-style-1` | menu tabs whose buttons come from the menu sections placed right after it; dish lists |
| `acm-menu-style-2`, `-3` | dish lists with a picture and a badge; registered, not used by any seeded page |
| `acm-happyhours-style-1`, `-2`, `-3` | happy-hours banners (Offers) |
| `acm-teams-style-1` | the team grid (About Us) |
| `acm-latest-news-default` | the four newest posts as picture cards (a Query Loop) |
| `acm-masthead-default`, `acm-subscribe-default` | page banner; Subscribe band (draws a form, sends nothing, G1) |
| `account-*`, `contact-form`, `blog-list`, `heading-*`, `part-*` | forms, list pieces and the parts' bodies; those marked `Inserter: no` are not offered in the editor |

To add a section: in the editor, Patterns > WP Diner > insert, then fill the content blocks; or take the
pattern's markup (`wp eval` with `WP_Block_Patterns_Registry::get_instance()->get_registered('<slug>')['content']`)
and splice it into `post_content`. A new section **type** is a theme change, not a site edit.

## Posts, categories, tags

- 22 posts at build time, all published. Categories: `our-blog` with the children `restaurant-business`
  (6 posts), `restaurant-marketing` (4), `restaurant-news` (7) and `restaurant-guide` (4); `other` (1,
  the post `lorem-ipsum`); `uncategorized` (0). Tags: `food` (13), `meet` (12), `menu` (11).
- Printed dates are the source's, in the format `j F Y` (D-22).
- Article details (author, category, date), previous/next links and search results are drawn by the
  theme's blocks (architecture.md).

## Menus

Three `wp_navigation` posts at build time, from `spec/menus.json`:

| Menu | Items | Used in |
| --- | --- | --- |
| `mainmenu` | Home (Home - Red, Home - Pink, Home - Green, Home - Blue); About Us; Reservation; Offers; Our Blog; Contact Us | header bar, block `nav.mainmenu` (`ref` set in the `header` row); hidden below 768 px (D-35) |
| `site-pages` | J! Pages (Login, Registration, User Profile, Edit User Profile); Other Pages (Smart Search, Error Page, Offline Page); Content (All categories, Fetured Articles, Tagged Items, Typography) | the phone side panel, block `nav.site-pages` (D-36 renamed the source's CMS-named menu) |
| `usermenu` | Your Profile, Submit an Article, Site Administrator, Template Settings, Site Settings | not referenced by any part |

The link to the draft Smart Search page is drawn by the theme (WordPress would leave a link to an
unpublished page out); the item of the page being shown gets `current-menu-item`, and the chrome group
marks Our Blog for articles and categories, Tagged Items for tags and Smart Search for search.

## Options and meta

| Key | Meaning |
| --- | --- |
| `wp_ja_diner_redirects` | JSON rules `{from, to, status}`; exact path, query string carried; applied only on a 404. Build time: 3 x 303 to Login, 4 x 301 from `/joomla-content/*` to `/content/*`, and the source address of article 3 (served as 200, S-13) |
| `wp_ja_diner_404_page` | id of the draft `page-not-found`; read only by an inert hook (architecture.md) |
| `wp_ja_diner_blog_banner_image` | attachment id of the sidebar banner picture (`banner-1`) |
| `tracy_motion` | motion settings; default one effect `carousel-step`; `{"effects":[]}` turns motion off |
| `tracy_joomla_pager_text` | pager labels (Start, Prev, Next, End), used by the must-use plugin `tracy-joomla-pagination` |
| `site_logo`, `tracy_logo_dark` | light and dark logos (attachment ids); `tracy_logo_dark` unset at build time (D-34) |
| `users_can_register`, `default_role`, `date_format` | 1, `subscriber` (D-15), `j F Y` (D-22) |
| post meta `jd_intro_image`; term meta `jd_category_image` | list picture of an article; picture of a category card |
| post meta `tracy_page_heading` | heading override read only by an inert hook |
