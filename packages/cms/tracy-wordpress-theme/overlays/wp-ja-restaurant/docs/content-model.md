# Content model

Read ../AGENTS.md and architecture.md. The facts below come from the theme's files, the spec-pack the site
was built from (`tasks/ja-restaurant-wp7/spec/` in the Tracy repository) and read-only `wp` commands on the
build stand (20/10/2026). Counts are **at build time**, not live: 34 pages (2 of them drafts), 21 posts,
70 media items, 8 categories, 3 tags, 2 navigation posts, 0 synced patterns (`wp_block`), 2
template-part rows. Check the live site before relying on any of them
(`wp post list --post_type=page --post_status=any --fields=ID,post_name,post_parent,post_status`).

## Where each kind of text lives

| Text | Lives in | Find it | Edit it |
| --- | --- | --- | --- |
| A page or post body, its sections included | `post_content`, block markup | `wp post list --post_type=page --fields=ID,post_name,url` | the editor, or `wp post update <id> --post_content=@file` |
| Masthead title, picture and line under it | the `acm-masthead-default` copy at the top of each page (`masthead.title`, `masthead.background`, `masthead.description`) | the page | the editor. Archive, category, tag, home and single views borrow the masthead and the Subscribe band of the page `blog`; the search view borrows the masthead of the draft `smart-search` page (`jrMasthead`/`jrSubscribe` in the templates) |
| Subscribe band | a copy of `acm-subscribe-default` in **every** page (28 pages carry `subscribe.root` at build time) | `wp post list --post_type=page` | edit each page; there is no shared copy |
| Menus | `wp_navigation` posts | `wp post list --post_type=wp_navigation --fields=ID,post_name,post_title` | Site Editor > Navigation, or the post's block markup |
| Header opening hours, footer location, hours, contact, copyright | `parts/header.html`, `parts/footer.html`, shadowed by the `header`/`footer` rows | `wp post list --post_type=wp_template_part --fields=ID,post_name` | Site Editor > Patterns > Template parts |
| Site name, logo, front page | `blogname` ("JA Restaurant"), `site_logo`, `tracy_logo_dark`, `show_on_front`, `page_on_front` | `wp option get blogname` | `wp option update …`, or Settings > General / Reading |
| Sidebar of listings and articles | `parts/sidebar.html` → pattern `part-sidebar` (news categories, most read) | the theme | a theme change, or Site Editor once the part is edited |
| 404 screen | `patterns/part-404.php` | the theme | a theme change (text is translatable through the `wp-ja-restaurant` text domain) |
| Contact, login, registration, reminder and reset forms | theme patterns `contact-form`, `account-*`, swapped into their pages at render time | the theme | a theme change; the address card, reservation note and picture beside the contact form are in `contact-form` too |
| Redirects from retired URLs | option `wp_ja_restaurant_redirects`, JSON `[{from,to,status}]` | `wp option get wp_ja_restaurant_redirects --format=json` | `wp option update wp_ja_restaurant_redirects --format=json < rules.json` |

`{site.title}` and `{year}` in a paragraph or Custom HTML block are filled at render time with `blogname`
and the current year (`inc/identity.php`); the footer's copyright line uses them. Any other `{…}` is
printed as written.

## Pages and routes

The spec-pack maps 31 routes (`spec/page-map.json`), including a synthetic 404 and the album route.
Paths keep the Joomla menu paths; `explore`, `explore/j-pages`, `explore/bonus-pages`, `explore/themes`
and `contact` are parent pages that exist to carry the paths.

| Path | Template (`_wp_page_template`) | Sections in the spec |
| --- | --- | --- |
| `/` (page `homepage`) | none; `front-page.html` by hierarchy | slideshow, booking bar, hero, features-intro 1 and 2, menu tabs with three menu-style-1 panels, home news, subscribe, gallery slide |
| `/explore/themes/{blue,green,pink,purple}-color` | page-landing | the home page's sections without the booking bar; accent colours per page are not done (D-09) |
| `/about-us` | default | masthead, features-intro 3, statistics, teams, subscribe |
| `/about-us/our-history` | default | masthead, text banner, timeline, subscribe |
| `/menu` | default | masthead, menu tabs with menu styles 1, 2, 3, subscribe |
| `/menu/simple-menu`, `/menu/menu-with-image`, `/menu/2-column-menu` | page-landing | masthead, menu style 1 / 2 / 3, subscribe |
| `/offers` | page-landing | masthead, happy hours styles 1, 2, 3, subscribe |
| `/blog`, `/gallery` | default | listing pages, completed by the theme (below) |
| `/contact/contact-us` | page-contact | contact map (Google Maps iframe in a Custom HTML block, D-17), the theme's contact form, subscribe |
| `/contact/phone-reservation`, `/explore/j-pages/category-blog` (Typography) | default | masthead, article text framed by the theme, subscribe |
| `/explore/j-pages/login`, `/registration`, `/reminder`, `/reset-password` | page-login, page-register, page-password | masthead, the account form swapped in by the theme, subscribe |
| `/your-profile`, `/explore/j-pages/user-profile` | page-account | guests get 303 to Login |
| `/explore/j-pages/smart-search` | none (**draft**) | answered by the search view |
| `/explore/j-pages/tagged-items`, `/featured-articles`, `/all-categories` | default / page-landing / default | listing pages, completed by the theme |
| `/explore/bonus-pages/offline-page`, `/erro-page` | default | masthead and text (the source's misspelt slug `erro-page` is kept) |
| `/gallery/18-sample-album-1` | single | the post `sample-album-1`, served at the source's address |

Three source routes have no WordPress equivalent (`/submit-an-article`, `/template-settings`,
`/site-settings`): they answer 303 to Login (D-16). Seven pages (`menu`, `our-history`, `erro-page` and
the four colour pages) carry post meta `tracy_page_heading` from the seed, but no block named `page.title`
exists on this site, so it is not printed: the masthead heading is the stored `masthead.title` block.

## Pages the theme completes at render time

Renaming or moving these pages removes what the theme adds:

- **Listing pages by slug**: `blog` (article rows, sidebar, the "Only $5.99" banner whose picture is the
  media item named `banner-1`), `gallery` (album tiles; the photo count is post meta `jr_photos` or the
  number of images in the album post), `tagged-items` (media rows), `featured-articles` (the sticky
  posts; 3 at build time), `all-categories` (one card per child of the category `restaurant`; picture
  from term meta `jr_category_image`, else the newest article's featured image; no term had the meta at
  build time).
- **By path**: `explore/j-pages/login`, `registration`, `reset-password`, `reminder` get their account
  pattern in place of the stored bare sign-in block; `contact/contact-us` gets `contact-form` after the
  map, and its stored Contact Form 7 shortcode is removed; `contact/phone-reservation` and
  `explore/j-pages/category-blog` get the source's article frame.
- **Masthead description**: the line under a masthead is the stored paragraph `masthead.description`
  of the page (edit it there). `inc/groups/account.php` also supplies the source's constant line
  ("Quisque dolor fringilla semper, …") as the excerpt of a page with none, which only shows where a Post
  Excerpt block is used; none is at build time.

## Sections (patterns)

A section is a pattern `wp-ja-restaurant/acm-<type>-<style>` inserted into a page as a **copy**. The seeder
fills each from the spec through `patterns.map.json` (ACM `type:style` and module-id entries). Every
editable block carries `metadata: {"role":"content","name":"<type>.<field>[.<n>]"}`; a repeated row's
wrapper is `<type>.item.<n>` (no role): clone or delete the wrapper to change the item count. Locate a
block by `metadata.name`, never by position; blocks without `role: content` are the frame. No synced
patterns were created.

| Pattern | What it draws |
| --- | --- |
| `acm-slideshow-style-owl` | full-width slides, arrows and numbered buttons (motion carousel) |
| `acm-opentable-style-1` | the orange booking bar, description only: no booking widget (D-02, G1) |
| `acm-hero-style-1` | the welcome block with the chef picture |
| `acm-features-intro-style-1`, `-2`, `-3` | two stepped blocks; three offer cards with price badges; picture and text |
| `acm-tabs-style-1` + `acm-menu-style-1`, `-2`, `-3` | menu tabs whose buttons come from the menu sections placed right after it; dish lists |
| `acm-home-news-default` | the home main body: sticky articles, news categories, quotes carousel |
| `acm-gallery-slide-default` | album pictures with photo counts, linking to the album page (G5) |
| `acm-happyhours-style-1`, `-2`, `-3` | happy-hours banners |
| `acm-statistics-style-1`, `acm-teams-style-1`, `acm-timeline-style-1` | rating bars; chefs; history timeline |
| `acm-masthead-default`, `acm-subscribe-default` | page banner; newsletter box (sends nothing, D-07) |
| `acm-text-banner-default`, `acm-contact-map-default` | the history page's line over a photo band; the contact map |
| `account-*`, `contact-form`, `blog-banner`, `blog-list`, `heading-*`, `part-*` | forms, listing pieces and the parts' bodies; those marked `Inserter: no` are not offered in the editor |

To add a section: in the editor, Patterns > WP Restaurant > insert, then fill the content blocks; or take
the pattern's markup (`wp eval` with `WP_Block_Patterns_Registry::get_instance()->get_registered('<slug>')['content']`)
and splice it into `post_content`. A new section **type** is a theme change, not a site edit.

## Posts, categories, tags

- 21 posts at build time: 13 news articles under `restaurant` (children `restaurant-business`,
  `restaurant-marketing`, `restaurant-news`, `restaurant-guide`), 7 albums under `gallery`
  (`sample-album-1` to `-7`), and `chefs` under `pages`. Tags: `fish`, `menus`, `seep`.
- Publish times were set minutes apart so newest-first equals the source's category-then-title order;
  the printed dates are the source's (D-14).
- The sidebar's "most read" list orders by comment count then date: WordPress keeps no read counter.
- Article details (author, category, date), previous/next links and search results are drawn by the
  theme's blocks (architecture.md).

## Menus

Two `wp_navigation` posts at build time, from `spec/menus.json`:

| Menu | Items (published in the source) | Used in |
| --- | --- | --- |
| `mainmenu` | Home; About us (Our History); Menu (Simple Menu, Menu with Image, 2 Column Menu); Offers; Blog; Gallery; Explore (J! Pages: Login, Registration, User Profile, Reminder, Smart Search, All Categories, Featured Articles, Typography, Tagged Items; Bonus Pages: Offline page, Error Page, About Us, Our History; Themes: Default, Blue, Green, Pink, Purple Color); Reservation (Phone Reservation, Contact Us) | header bar and phone side panel, both `nav.mainmenu` (`ref` set in the `header` row) |
| `usermenu` | Your Profile, Submit an Article, Site Administrator, Template Settings, Site Settings | not referenced by any part |

Unpublished source items (Chefs, Vik Restaurant, Open Table, Happy Hours, …) were not carried. The link
to the draft Smart Search page is drawn by the theme; the item of the page being shown gets
`current-menu-item`.

## Options and meta

| Key | Meaning |
| --- | --- |
| `wp_ja_restaurant_redirects` | JSON rules `{from, to, status}`; exact path, query string carried; applied only on a 404. Build time: 3 × 303 to Login, `/homepage` → `/` 301, `/gallery/18-sample-album-1` → `/sample-album-1/` 301 (served as 200 instead, S-13) |
| `wp_ja_restaurant_404_page` | id of the draft `page-not-found`; read only by an inert hook (architecture.md) |
| `tracy_motion` | motion settings; default one effect `carousel-step`; `{"effects":[]}` turns motion off |
| `site_logo`, `tracy_logo_dark` | light and dark logos (attachment ids); `tracy_logo_dark` unset at build time (D-08) |
| `users_can_register`, `default_role` | 1 and `subscriber` (D-15) |
| post meta `tracy_page_heading`, `jr_photos`; term meta `jr_category_image` | heading override read only by an inert hook; album photo count; category card picture |
