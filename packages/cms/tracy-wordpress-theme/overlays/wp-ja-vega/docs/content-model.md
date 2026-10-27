# Content model: where every kind of text lives

Read ../AGENTS.md and generated/inventory.md. The counts below are those of the build's last seed
(29 pages, 56 posts, 9 authors, 10 categories, 6 menus, 2 template-part rows, 1 contact form, 24 sections,
163 media files, 2 redirect rules), not the live site's; find current ids by slug with `wp post list`.

| Text | Lives in | Find it | Edit it |
| --- | --- | --- | --- |
| A page body, its sections included | `post_content` of the page, block markup | `wp post list --post_type=page --fields=ID,post_name,post_parent,post_status,url` | the editor, or `wp post update <id> --post_content=@file` |
| A post (56 seeded) | `post_content`, opening with the article's full-text picture (an image block, class `jv-article__image`; the featured image is the listing picture); one `category` term each: `blogs` (9 posts) or one of the six portfolio categories under `portfolio` (47 posts). The Blogs post "Biometrics in Security…" renders through the `page-article` template (post meta `_wp_page_template`), and the theme answers `/blog-detail` with that post itself (HTTP 200, no redirect; the seeded rule in `wp_ja_vega_redirects` names the address, `inc/extra.php` `wp_ja_vega_single_view_request` serves it, and the post's canonical link stays its own permalink) | `wp post list --post_type=post --fields=ID,post_name,url` | the editor |
| Post authors | nine WordPress users made by the seeder (user meta `tracy_source_author` = the Joomla user); their picture is user meta `tracy_avatar` (an attachment id), drawn by the must-use plugin `wp-content/mu-plugins/tracy-author-avatars.php` | `wp user list --fields=ID,user_login,display_name` | Users; the post's Author panel; `wp user meta update <id> tracy_avatar <attachment id>` |
| Masthead heading and description of a page | the page title (or post meta `tracy_page_heading` when the source's masthead said something else, e.g. "Who We Are" on About Us, "JA Vega" on Tagged Items; `tracy_page_heading_guest` for a visitor who is not signed in, "Login Form" on Profile) and the page **excerpt** | `wp post meta get <id> tracy_page_heading`; `wp post get <id> --field=post_excerpt` | the editor (title, Excerpt panel, Custom Fields); `wp post meta update` |
| The header's main links | `wp_navigation` `mainmenu`, referenced by the header's navigation block named `nav.mainmenu`. The items the header draws as mega menus (Our Services, Portfolio) were left out of this menu | `wp post list --post_type=wp_navigation --fields=ID,post_name,post_title` | Site Editor > Navigation, or the post's block markup |
| The two mega menus | the `header` template-part row: `wp-ja-vega/mega-menu` blocks "Our Services" and "Portfolio", their columns inner blocks. Inside them: two **inline** navigations (six service links, six portfolio category links, no `ref`), the "Industry Focus" column (`nav.industry-focus` → `wp_navigation` `industry-focus`), the four "Business Challenges" cards (each an image block of the Media Library — the source's 40 px icon, attachment id written by the seed step — and a title link), and a "Latest Projects" query (3 posts of category `database-security`) | `wp post list --post_type=wp_template_part --fields=ID,post_name` | Site Editor, header part; `industry-focus` also under Navigation |
| Header phone line, "Contact Us" button, logo | blocks in the `header` row; the logo is `core/site-logo` (option `site_logo`, light text for the black bar); with no logo it shows the site name as text (`tracy-logo-fallback`, 1.1.12) | as above | Site Editor, header part; the logo in Settings or the block |
| Footer link columns | four `core/navigation` blocks in the `footer` row named `nav.solutions`, `nav.join-us`, `nav.explore`, `nav.resources`, `ref` → the `wp_navigation` posts of the same slugs | as above | Site Editor > Navigation, or the footer part |
| Footer address, phone, e-mail, social links, copyright line | ordinary blocks in the `footer` row | as above | Site Editor, footer part |
| Site name, tagline, front page | options `blogname` ("JA Vega"), `blogdescription` (empty in the source), `show_on_front`, `page_on_front` (the page `home` at `/`); `page_for_posts` is **unset** — the blog list is the page `/category-blog` | `wp option get blogname` | `wp option update …`, or Settings > General / Reading |
| Contact form | Contact Form 7's form "Contact" (`wpcf7_contact_form`), placed on `/contact` by a `core/shortcode` block; the panel beside it (address, phone, e-mail, social links, picture) is page content | `wp post list --post_type=wpcf7_contact_form --fields=ID,post_title` | Contact > Contact Forms (fields, recipient, messages); the page for the rest |
| 404 page text | the **draft** page `page-not-found`; option `wp_ja_vega_404_page` holds its id; the block named `404.body` in `templates/404.html` prints it (its own short text is the fallback) | `wp option get wp_ja_vega_404_page` | edit that draft page; keep it a draft, or `/page-not-found` becomes a real address |
| Search page | the **draft** page `smart-search`; the theme answers `/smart-search` with the search view, and a menu link to that draft still renders | `wp post list --post_type=page --post_status=draft` | keep it a draft; its title is what menus print |
| Redirects from retired URLs | option `wp_ja_vega_redirects`: a JSON array `[{"from":…,"to":…,"status":301}]`; exact path match, only when WordPress would otherwise answer 404. One rule seeded (`/category-blog/cybersecurity-takeaways-from-china-s-largest-data-breach` → the post); it never fires, because the theme answers that path itself | `wp option get wp_ja_vega_redirects --format=json` | `wp option update wp_ja_vega_redirects --format=json < rules.json` |
| Labels that are not content ("Continue Reading", "Related Posts", "Other Services", "Smart Search", the toggle and drawer labels) | the templates, the part HTML copied into the rows, or `inc/extra.php` / `assets/js/wp-ja-vega.js` | grep the theme, then the rows | a template or row in the Site Editor; a change for every site is a theme change |

Options the theme reads: `wp_ja_vega_redirects`, `wp_ja_vega_404_page` and `tracy_contact_to` (where the
footer's newsletter request is mailed, and the source theme's own contact handler, not used by this site's contact page),
and, from the source theme, `tracy_inspiration`, `tracy_nav`, `tracy_hero`, `tracy_motion`
(docs/design-system.md). Post meta the theme reads: `tracy_page_heading`, `tracy_page_heading_guest`.

## Pages, listings and the addresses they keep

| Address | What it is | Template |
| --- | --- | --- |
| `/` | page `home`, twelve sections | `front-page.html` |
| `/about-us`, `/featured-articles` | pages; About Us carries five sections | `page-landing` on About Us; Featured Articles uses the default `page.html` |
| `/services/<service>` (six) | child pages of `/services`, ordered by `menu_order` (the source's article order) | `page-service` |
| `/services` | page listing its child pages | `page.html` |
| `/category-blog` | page with a post query of category `blogs`, 7 posts a page, then the "More Articles …" list and a pager | `page.html` |
| `/portfolio`, `/portfolio/<category>` (six) | pages with a post query of `portfolio` or one of its six categories (a category: 7 posts a page, the "More Articles …" list and a pager); each card prints the post meta `jv_client`, `jv_date`, `jv_type` | `page.html` |
| `/blog-detail` | the Blogs post "Biometrics in Security…", answered at this address (its own permalink is `/<slug>/`); the post names the template in `_wp_page_template` | `page-article` |
| `/contact` | page with the contact panel and the Contact Form 7 form | `page-contact` |
| `/author-listing` | page listing the source's nine authors as ordinary blocks | `page.html` |
| `/tagged-items` | page listing the source's tagged items by title | `page.html` |
| `/login-form`, `/registration-form`, `/profile` | pages with WordPress's log-in block; the theme adds a show/hide button to its password field and a "Forgot your password?" link to WordPress's lost-password screen (`inc/extra.php`); registration stays off | `page.html` |
| `/typography`, `/error-page`, `/offline-pages` | the source's sample pages, as content | `page.html` |
| `/smart-search` | draft page answered by the search view | `search.html` |
| `/<post-slug>/`, `/category-blog/<post-slug>`, `/portfolio/<category>/<post-slug>` | a post | `single.html` |
| `/404`, any unknown path | 404 with the text of `page-not-found` | `404.html` |

"More Articles …" (the source's `items-more`): inside the cards query, before its pager, a second post query
(class `tracy-more-articles`, `queryId` 5, written by the seeder) with an editable heading and the linked titles of
the next 4 posts; its `query`
attribute carries `tracyMore: {"after": 2, "skip": 7}`, and `inc/extra.php` offsets it by the cards' own page
(`?query-2-page=N` → posts from N × 7), as Joomla lists under page N the posts that open page N+1. On the last
page it prints nothing, heading included. Edit the heading in the page; the titles are the posts' own. The
must-use plugin `wp-content/mu-plugins/tracy-more-articles.php`, written by the seeder, reads the same
`tracyMore` key and sets the same offset, so the list pages the same way with or without the theme.

The pager of every listing is the core Pagination block, printed the source's way: first and previous cells
before the page numbers, next and last after them (disabled on the first and the last page), and a "Page N of M"
box counted from the same query. On the category blogs the block carries the class `tracy-joomla-pager` and the
must-use plugin `wp-content/mu-plugins/tracy-joomla-pagination.php`, written by the seeder, draws it; on
`/portfolio` and `/featured-articles` (and on a category blog when that plugin is absent) `inc/extra.php`
(`wp_ja_vega_pager`) does. The stylesheet gives both the same look. A listing of one page prints no pager.

A listing page's post query names its category by id (`taxQuery`, what the seeder writes) or by slug
(`wpJaVegaCategory`, resolved by `inc/extra.php`); that query is also what lets
`/<listing>/<post-slug>` answer. Listing layouts differ by address: the theme adds the body class
`jv-route-<page slug>` (and `jv-parent-<parent slug>`), and the stylesheet draws `/category-blog`,
`/featured-articles`, `/tagged-items`, `/contact`, `/portfolio` and the six portfolio category
pages from those classes. **Renaming one of those pages' slug** (or moving a portfolio page out
from under `/portfolio`) turns it back into the generic layout; the content is unchanged.

## Sections: the pattern convention

A section is a theme pattern under `patterns/`, category **JA Vega** (`wp-ja-vega`) for the 13
patterns of this site's own section types; the 18 `tracy/*` library patterns inherited from the
source theme are not placed on any page. Inserting one into a page copies its markup into
`post_content`; the page then owns those blocks. In the 13 own patterns every editable block carries

```
metadata: {"role":"content","name":"<type>.<field>[.<n>]"}
```

`<type>` is the source's module type (`hero`, `features-intro`, `testimonials`, `teams`, `clients`,
`cta`, `articles-category`), `<field>` the field name as the Joomla module named it, `<n>` the
1-based index inside a repeated group; a repeated item's wrapper carries `{"name":"<type>.item.<n>"}`
with no role — clone or delete the wrapper to change the item count, its children keep the same
names with the new index. Locate a block by its `metadata.name`, never by position. Blocks without
`role: content` are the frame (groups, columns, spacers) and are meant to stay.

| Pattern | Type in `metadata.name` | Placed on (seed) |
| --- | --- | --- |
| `section-hero` (hero, picture carousel) | `hero` | `/` |
| `section-why` (video with figures) | `hero` | `/about-us` |
| `section-features` (service cards) | `features-intro` | `/`, `/about-us` |
| `section-feature-split`, `section-feature-split-left` | `features-intro` | `/` |
| `section-stats` (figures bar) | `features-intro` | `/` |
| `section-testimonials` | `testimonials` | `/`, `/portfolio` |
| `section-teams` (carousel) | `teams` | `/` |
| `section-teams-grid` | `teams` | `/about-us` |
| `section-clients` (logos) | `clients` | `/`, `/about-us` |
| `section-cta` | `cta` | `/`, `/about-us`, the six service pages |
| `section-stories` (success stories carousel, category `portfolio`) | `articles-category` | `/` |
| `section-blog` (latest posts, category `blogs`) | `articles-category` | `/` |

Each placed section's outer group carries the anchor `acm-<type>-<source module id>`; the
stylesheet sets the spacing of three of them on `/about-us` (`#acm-cta-133`,
`#acm-features-intro-134`, `#acm-clients-136`), so keep those anchors when editing that page.
Motion is markup: blocks the source animates carry the motion library's classes
(`tracy-motion-reveal`, `tracy-motion-carousel`, …); a copied block keeps them.

To add a section to a page: in the editor, Patterns > JA Vega > insert, then fill the content
blocks; or by command, take the pattern's markup with
`wp eval 'echo WP_Block_Patterns_Registry::get_instance()->get_registered("wp-ja-vega/section-cta")["content"];'`
and splice it into `post_content`. A freshly inserted section shows `assets/img/hero-placeholder.svg`
where a picture goes; replace it from the media library. A new section **type** is a theme change
(a new `patterns/acm-*.php` in the overlay, rebuilt), not a site edit.

## Posts, archives and search

Posts use the core `post` type. The nine blog posts carry the source's tags (business, technology, services, …), printed as chips on the home "Blog & News" cards in the source's order (`wp_ja_vega_tag_order` in `inc/extra.php`); the article page prints no tag row, as the source's does not. Edit them in Posts > Tags or the post's Tags panel. Authors: every post belongs to the source's author, one of nine
users the seeder made (G62); a card and the related posts print the author's picture. WordPress's own `/category/…`,
`/author/…` and date URLs render from `archive.html`; the site's menus link the listing pages
above instead. Search works at `/smart-search` and at `/?s=` and lists matching posts and pages.
