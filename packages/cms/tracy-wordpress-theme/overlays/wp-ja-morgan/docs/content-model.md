# Content model

Read ../AGENTS.md and architecture.md. The facts below come from the theme's files and from the
spec-pack the site was built from (`tasks/ja-morgan-wp7/spec/` in the Tracy repository). Counts of
what the seed created are **at seed time** (build stand, 30/09/2026): 27 posts, 29 pages, 9
categories, 8 navigation posts, 100 media items (tasks/nhat-ky entry of this port). Check the live
site before relying on any of them (`wp post list --post_type=page --fields=ID,post_name,post_status`).

## Pages and routes

The spec-pack maps 26 pages plus a synthetic 404 (`spec/page-map.json`). Paths keep the Joomla
menu paths. The template named by the spec is the intended layout; the WordPress template a page
actually renders with is in its `_wp_page_template` meta or falls back to `page.html`.

| Path | Spec view | Notes |
| --- | --- | --- |
| `/` | front-page | `templates/front-page.html`; sections: teams, features-intro, hero, hero |
| `/home/home-style-1` | page | slideshow plus nine sections and the quick contact form (D-13) |
| `/home/home-style-2`, `/home/home-style-3`, `/home/home-style-4` | page-landing | each is a different header and palette, see docs/design-system.md |
| `/about-us`, `/services-page` | page-landing | masthead description constant, see below |
| `/contact-us` | page-contact | form posts to `admin-post.php` (`jm_contact`) |
| `/your-profile`, `/j-pages/profile`, `/j-pages/edit-profile` | page-account | a signed-out visitor is sent to `/j-pages/login/` (303) |
| `/j-pages/login`, `/j-pages/registration` | page-login, page-register | the seeded content is a bare sign-in block; the theme swaps in the matching pattern (`account-login`, `account-register`) unless the page has other text |
| `/password-reset`, `/username-reminder-request` | page-password | patterns `account-reset`, `account-remind` |
| `/other-pages/smart-search` | search | a **draft** page answered by the theme's search view (below) |
| `/other-pages/offline-page`, `/other-pages/error-page` | page | plain pages |
| `/joomlart-content/featured-articles`, `.../tagged-items`, `.../list-of-all-tags`, `.../list-all-categories` | page-landing / tag / page | content replaced by a `b-*` pattern at render time (below) |
| `/joomlart-content/category-blog` | category | the blog listing page with the sidebar |
| `/joomlart-content/single-article` | single | served as the article the source opens there (D-16) |
| `/joomlart-content/typography` | page | sample content; has two `h1` |
| `/404` | 404 | synthetic, not a page |

Three source routes have no WordPress equivalent: `/submit-an-article`, `/template-settings`, `/site-settings`
(gap G8). A signed-out visitor is sent to the Login page with a 303, as the source does (`inc/groups/account.php`);
a signed-in visitor is redirected to `/` with a 301 by the seeder's rules (spec `redirects.json`).

## Templates, parts and what they read

- `templates/`: `404`, `front-page`, `page`, `page-landing`, `page-masthead`,
  `page-masthead-sidebar`, `page-account`, `page-contact`, `page-password`, `search`, `single`.
  `page-landing`, `page-masthead` and `page-masthead-sidebar` are declared as custom templates in
  `theme.json`; the other three are not (see architecture.md).
- Named groups the PHP looks for by `metadata.name`: `page.title` (masthead heading override),
  `single.masthead` (article picture), `search.masthead` (media item `bg_masthead`), `404.body`
  (text of the 404 page), `contact.form-band`, `header.info`, `header.topbar`, `nav.<menutype>`. Do
  not rename them in a template or a part.
- Masthead description: the source prints one constant description under every masthead
  ("Quisque dolor fringilla semper, libero hendrerit allis, magna augue putate nibh ucibus enim eros
  acumin arcu" is the theme's constant). A page with no excerpt of its own gets that constant; **an
  explicit page excerpt always wins** (write it in the page's Excerpt panel; `add_post_type_support`
  turns the panel on for pages). Posts and other types are untouched. The masthead prints it as bare
  text, not in a `p`.
- Masthead heading: post meta `tracy_page_heading` overrides the page title in the `page.title`
  block when it is not empty. D-19 (open): the source prints its module's fallback "JA Morgan" on
  pages that are not configured in its masthead module; the port prints the page title.

## Sections (patterns)

A section is a pattern `wp-ja-morgan/<name>` inserted into a page as a **copy**. The seeder fills
each from the spec by `patterns.map.json` (10 Joomla ACM `type:style` entries; the field-by-field
map is in that file; a block is located by `metadata.name` = `<type>.<field>[.<n>]`, a repeated
row's wrapper is `<type>.item.<n>`). No synced patterns (`wp_block`) were created at seed time.

| Pattern | What it draws |
| --- | --- |
| `acm-hero`, `acm-slideshow` | hero banner; slideshow with titled tabs (steps by the motion carousel) |
| `acm-features-1`, `-2`, `-3`, `-3-contact` | picture cards; feature boxes; picture and text; picture and text with the quick contact form |
| `a-features-4`, `-5`, `-6` | colour tiles; panel over a picture; banner statement |
| `acm-teams`, `acm-clients`, `acm-latest`, `a-statics` | team or page cards; client logos; latest articles (query `jmOrder: "latest"`, category `investment-managment`); number counters |
| `acm-testimonials-1`, `-2`, `a-testimonials-3` | case study cards; one quote at a time; quote cards |
| `b-featured-articles`, `b-tagged-items`, `b-tag-list`, `b-category-list` | listing routes (below); `b-tag-list` and `b-category-list` are hidden from the inserter (`Inserter: no`) |
| `account-login`, `-register`, `-remind`, `-reset`, `contact-form`, `contact-details` | account and contact forms and details |
| `tracy/cards` | overrides the source theme's cards pattern |

Choices the source's template printed as classes ride on the section root (`align-<value>`,
`hero-<value>`, `jm-btn-<value>`, `jm-link-<value>`); they are in the section's class list.

## Listing routes and hard-coded card data

- The seeder writes the Featured Articles page empty and the Tagged Items page with every post; the
  theme replaces the content of the four listing pages at render time (`inc/groups/content.php`,
  `render_block_core/post-content`) **only** when the page slug is `featured-articles`,
  `tagged-items`, `list-of-all-tags` or `list-all-categories` **and** its permalink starts with
  `joomlart-content/`. Renaming or moving such a page removes its listing.
- **Tag-list cards use per-tag pictures, first words and hit counts hard-coded from the source**
  (`wp_ja_morgan_b_tag_cards()`): `business` (img-7-thumb.jpg, "Doing business", 3), `finance`
  (img-11-thumb.jpg, "Gregor then", 2), `joomla` (img-17-thumb.jpg, "He felt a", 8), `joomlart`
  (img-8-thumb.jpg, "I am so happy,", 8), `morgan` (img-19-thumb.jpg, "A wonderful", 218). There is
  no WordPress data source for a tag's picture, description or hit counter, so a new tag does not
  appear here and edits to a tag do not change a card; edit the function or replace the pattern.
  Pictures are looked up in the media library by file name.
- The category list prints seven categories (`wp_ja_morgan_b_category_slugs()`). Each card's picture
  is the attachment id stored on the term (term meta `thumbnail_id`), drawn with the attachment API,
  so the media audit counts it as a reference and a category's picture is changed by editing that
  meta; a category without it prints no picture. The seed step sets it from the source's category
  pictures (`tasks/ja-morgan-wp7/tools/category-pictures.json`).
- Featured card "Hits: N" comes from the post meta `hits` through the placeholder `{jm-hits}`. On
  the sidebar list ("News & Update.") the same meta orders the posts (D-21). The counter is a
  **snapshot** of the source at dump time; WordPress does not increment it (gap G3). Tagged Items
  card text is the post excerpt cut at 150 characters on a word boundary, then "..." (M-1: the
  source cuts one card differently).

## Search

`/other-pages/smart-search` is the source's `com_finder` page. The theme maps it to WordPress
search: the page must exist as a **draft** (a published copy would take the path away from the
filter), and a menu link to it is drawn by the theme as a plain link. The header search form posts
there. `/?s=` also works.

## Posts, categories, tags

- Posts carry the blog: category `blog` and its children (in the source's tree order).
  "Categories." lists the children of `blog` with counts; "Tags." lists used tags by count.
  The tag "Joomla" has no article in the spec, so the sidebar shows 4 of the 5 tags (G2).
- An article's full-text picture is the first block of the post, an image with the class
  `jm-fulltext-image`; the single template draws it as the masthead background and leaves it out of
  the body. The intro picture is the featured image for listing cards (D-17).
- Read counts, sticky handling, pager labels: docs/content-rules.md (G3, G4).

## Menus

Eight `wp_navigation` posts at seed time, one per Joomla menu type of `spec/menus.json`. Which the
theme's parts use:

| Menu type | Items (spec) | Used in |
| --- | --- | --- |
| `mainmenu` | Home (Home Style 1 to 4), About Us, Services, News & Update, Contact Us | header, `nav.mainmenu` |
| `joomla-pages` | J! Pages, Other Pages, Joomla Content groups (Login, Registration, Profile, Edit Profile, Smart Search, Offline Page, Error Page, List All Categories, Featured Articles, Category Blog, Single Article, Tagged Items, Typography) | off-canvas "Sidebar" panel in the header, `nav.joomla-pages` |
| `navigate`, `services`, `support`, `careers`, `terms-privacy` | link columns, all with `#` targets in the source (one unpublished in `support`) | footer, `nav.<menutype>` |
| `usermenu` | Your Profile, Submit an Article, Site Administrator, Template Settings, Site Settings | not referenced by any part of the theme |

"List of all tags" is not in the off-canvas menu because the source hides it (D-26 as written in
DECISIONS.md, S-31; see docs/content-rules.md for the numbering clash). The menu item of the page being shown gets `current-menu-item` even for routes
WordPress does not mark (the article route, the draft search page).

## Options, meta and redirects

| Key | Meaning |
| --- | --- |
| `wp_ja_morgan_404_page` | id of the draft page `page-not-found`; its content is the 404 text |
| `wp_ja_morgan_redirects` | JSON rules `{from, to, status}`; exact path, query string carried over; applied only on a 404 |
| `tracy_motion` | motion settings; default is one effect `carousel-step`; `{"effects":[]}` turns motion off |
| post meta `tracy_page_heading` | masthead heading override |
| post meta `hits` | source read count (snapshot) |
| user meta `jm_profile_*` | extra registration fields the registration handler stores |
