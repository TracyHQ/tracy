# Content model: where every kind of text lives

Read ../AGENTS.md and generated/inventory.md. The counts below are those of the build's last seed
(28 pages, 45 posts, 7 categories, 9 authors, 6 seeded menus, 2 template-part rows, 1 contact
form, 66 placed sections, 142 media files, 2 redirect rules), not the live site's; find current
ids by slug with `wp post list`.

| Text | Lives in | Find it | Edit it |
| --- | --- | --- | --- |
| A page body, its sections included | `post_content` of the page, block markup | `wp post list --post_type=page --fields=ID,post_name,post_parent,post_status,url` | the editor, or `wp post update <id> --post_content=@file` |
| A post (45 seeded) | `post_content`; one `category` term each: `blog` (27 posts) or one of `branding`, `ui-ux-design`, `illustration` under `project` (18 posts); tags (`post_tag`, 10 tags) | `wp post list --post_type=post --fields=ID,post_name,url` | the editor |
| Project fields (Client, Services, Date, "See live", client name, budget) | post meta `prj-client`, `prj-services`, `prj-date`, `prj-completed`, `prj-client-name`, `prj-budget` of the 18 project posts, printed by `single-project` and the project cards | `wp post meta list <id>` | `wp post meta update <id> prj-client '…'`; the editor's Custom Fields panel |
| The full-size article picture | the first block of the post (`core/image`, class `jn-fulltext-image`); the featured image is the smaller picture the lists show | the editor | the editor |
| The header's links | `wp_navigation` `mainmenu`, referenced by the header's navigation block named `nav.mainmenu` | `wp post list --post_type=wp_navigation --fields=ID,post_name,post_title` | Site Editor > Navigation, or the post's block markup |
| The services side menu of the seven service pages | `wp_navigation` `services`; the template `page-service` names it `nav.services` and `inc/extra.php` binds it by slug when the page renders | as above | Site Editor > Navigation |
| Footer link columns | three `core/navigation` blocks in the `footer` row named `nav.jcontent`, `nav.jpages`, `nav.users`, `ref` → the `wp_navigation` posts of the same slugs. "Tagged Items" is left out, as the source hides it from its menu | as above | Site Editor > Navigation, or the footer part |
| Footer logo, text, social links, copyright line | ordinary blocks in the `footer` row; the logo is a Site Logo block that reads the dark-background logo (option `tracy_logo_dark`), the copyright line says `{year} {site.title}` and shows the year and the Site Title | `wp post list --post_type=wp_template_part --fields=ID,post_name` | Site Editor, footer part |
| Header logo, colour switch, drawer button | blocks in the `header` row; the logo is two Site Logo blocks in the bar and two in the drawer head: `jn-logo--light` shows the site logo (option `site_logo`), `jn-logo--dark` the dark-background logo (option `tracy_logo_dark`), one shown per theme; an empty one shows the Site Title as text | as above | Settings: Site Logo (Site Editor) for the light logo; `wp option update tracy_logo_dark <attachment id>` for the dark one |
| Site name, tagline, front page | options `blogname` ("ja_nova", the source's site name), `blogdescription` (empty), `show_on_front`, `page_on_front` (the page `home` at `/`); `page_for_posts` is **unset** — the blog list is the page `/category-blog` | `wp option get blogname` | `wp option update …`, or Settings > General / Reading |
| Contact page (picture, address, phone, e-mail cards, text, "Follow us:" links) | blocks of the page `contact` under `about-us-2` | the editor | the editor |
| Contact form | Contact Form 7's form "Contact" (`wpcf7_contact_form`), placed on `/about-us-2/contact` by a `core/shortcode` block | `wp post list --post_type=wpcf7_contact_form --fields=ID,post_title` | Contact > Contact Forms (fields, recipient, messages) |
| 404 page text | the **draft** page `page-not-found`; option `wp_ja_nova_404_page` holds its id; the block named `404.body` in `templates/404.html` prints it (its own short text is the fallback) | `wp option get wp_ja_nova_404_page` | edit that draft page; keep it a draft, or `/page-not-found` becomes a real address |
| Search page | the **draft** page `smart-search`; the theme answers `/smart-search` with the search view, and a menu link to that draft still renders | `wp post list --post_type=page --post_status=draft` | keep it a draft; its title is what menus print |
| Redirects from the source's article menu addresses | option `wp_ja_nova_redirects`: a JSON array `[{"from":…,"to":…,"status":301}]`; exact path match, only when WordPress would otherwise answer 404. Two rules: `/blog-detail` and `/project/project-detail` → their posts. The same rules tell the header which entry to mark current on those posts | `wp option get wp_ja_nova_redirects --format=json` | `wp option update wp_ja_nova_redirects --format=json < rules.json` |
| Labels that are not content ("Share this story", "Continue Reading", "Page N of M", the tag list's filter labels, the toggle and drawer labels, the sign-in form's words) | the templates and parts, `inc/extra.php`, `assets/js/wp-ja-nova.js` | grep the theme, then the rows | a template or row in the Site Editor; a change for every site is a theme change |

Options the theme reads: `wp_ja_nova_redirects`, `wp_ja_nova_404_page`, `page_on_front`,
`admin_email` and `tracy_contact_to` (the source theme's own contact handler, not used by this
site's contact page), and, from the source theme, `tracy_inspiration`, `tracy_nav`, `tracy_hero`,
`tracy_motion` (docs/design-system.md).

## Pages, listings and the addresses they keep

| Address | What it is | Template |
| --- | --- | --- |
| `/` | page `home`, fifteen sections | `front-page.html` |
| `/about-us-2`, `/about-us-2/career`, `/services` | pages made of sections | `page-landing` |
| `/illustration`, `/development`, `/mobile-application`, `/cloud-solutions`, `/it-infrastructure`, `/cybersecurity`, `/virtualization` | the service articles as pages, services menu beside them, Prev/Next in the menu's order | `page-service` |
| `/category-blog` | page: "Latest news from us", the search and popular-tags band, then a post query of category `blog` with "More Articles" and the pager | `page.html` |
| `/featured-articles` | page with a query of the sticky posts (the source's 14 featured articles), 7 a page | `page.html` |
| `/project/branding`, `/project/ui-ux-design`, `/project/illustration` | pages with a post query of one project category | `page.html` |
| `/project` | page with the contact bar only: the source's project tabs (module 129) are not ported yet (docs/content-rules.md) | `page-landing` |
| `/tagged-items` | page with a query of the posts carrying the source's tags, by title, 20 a page, title filter and "Display #" select | `page.html` |
| `/author-listting` | page whose "Author list" group names the listed authors in order; the theme draws each one's picture, name, job title, biography and social links from the user, 6 a page | `page.html` |
| `/about-us-2/contact` | page with the contact cards and the Contact Form 7 form | `page-contact` |
| `/login-form`, `/registration-form` | the sign-in form (both fields required, a "Sign in with a passkey" button, the registration link while registration is on); the registration form, or a "Registration is closed on this site." note while it is off. `/user-profile` lists the person's passkeys and adds or removes one | `page-login`, `page-register` |
| `/user-profile` | page; a signed-out visitor is sent to `/login-form` (303) | `page-account` |
| `/typography`, `/error-page`, `/offline-pages` | the source's sample pages, as content | `page.html` |
| `/smart-search` | draft page answered by the search view | `search.html` |
| `/<post-slug>/`, `/category-blog/<post-slug>`, `/project/<category>/<post-slug>` | a post; project posts use the project layout | `single.html`, `single-project.html` |
| `/blog-detail`, `/project/project-detail` | 301 to the post the source's menu item names | — |
| `/404`, any unknown path | 404 with the text of `page-not-found`, without header or footer, as the source's error page | `404.html` |

A listing page's post query names its category by id (`taxQuery`, what the seeder writes) or by slug
(`wpJaNovaCategory`, resolved by `inc/extra.php`); that query is also what lets
`/<listing>/<post-slug>` answer, and what marks the listing's menu entry current while one of its
posts is read. Listing layouts differ by address: the theme adds the body class
`jn-route-<page slug>` (and `jn-parent-<parent slug>`), and the stylesheet draws `/category-blog`,
`/featured-articles`, `/author-listting`, `/tagged-items`, `/about-us-2/contact` and the three
project category pages from those classes. **Renaming one of those pages' slug** (or moving a
project page out from under `/project`) turns it back into the generic layout; the content is
unchanged. The front page is never taken as a category listing: its news band is a section.

## Sections: the pattern convention

A section is a theme pattern under `patterns/`, category **JA Nova** (`wp-ja-nova`) for the 21
patterns of this site's own section types; the 19 `tracy/*` library patterns inherited from the
source theme are not placed on any page. Inserting one into a page copies its markup into
`post_content`; the page then owns those blocks. In the own patterns every editable block carries

```
metadata: {"role":"content","name":"<type>.<field>[.<n>]"}
```

`<type>` is the source's module type (`hero`, `features-intro`, `text-slider`, `cta`, `clients`,
`teams`, `pricing`, `accordion`, `articles-category`, `articles-latest`, `related-items`,
`search-band`), `<field>` the field name as the Joomla module named it, `<n>` the 1-based index
inside a repeated group; a repeated item's wrapper carries `{"name":"<type>.item.<n>"}` with no
role — clone or delete the wrapper to change the item count, its children keep the same names with
the new index. Locate a block by its `metadata.name`, never by position. Blocks without
`role: content` are the frame (groups, columns, spacers) and are meant to stay.

| Pattern | Source type | Placed on (seed) |
| --- | --- | --- |
| `section-hero` | `hero` style-1 | `/` |
| `section-feature` (text and picture) | `features-intro` style-1 | `/`, `/about-us-2`, `/services` |
| `section-cards` (service cards) | `features-intro` style-2 | `/`, `/services` |
| `section-cards-inline` (the same cards inside an article) | `features-intro` style-2 | the seven service pages |
| `section-stats` (figures) | `features-intro` style-3 | `/`, `/about-us-2` |
| `section-values` | `features-intro` style-4 | `/about-us-2` |
| `section-video` | `features-intro` style-5 | `/about-us-2` |
| `section-expertise` | `features-intro` style-6 | `/about-us-2` |
| `section-positions` (open positions) | `features-intro` style-7 | `/about-us-2/career` |
| `section-text-slider` (moving tag row) | `text-slider` | `/` (two rows) |
| `section-cta` | `cta` style-1 | `/` |
| `section-cta-bar` ("If you want to talk! We are here") | `cta` style-2 | every page but the 404 |
| `section-clients` | `clients` | `/` |
| `section-teams` (carousel) | `teams` | `/`, `/about-us-2` |
| `section-pricing` (monthly / yearly tabs) | `pricing` | `/` |
| `section-faq` (questions) | `accordion` | `/`, `/services`, the seven service pages |
| `section-news` (latest posts, category `blog`) | `articles-category` | `/` |
| `section-latest` ("Latest news from us") | `articles-latest` | `/category-blog` |
| `section-search-band` (search, social links, popular tags) | `search-band` | `/category-blog` |
| `section-related`, `section-related-projects` ("Continue Reading") | `related-items` | the `single` and `single-project` templates |

Each placed section's outer group carries the anchor `acm-<type>-<source module id>` (for example
`acm-cta-131`, the contact bar); `inc/extra.php` and the stylesheet read some of them, so keep the
anchors when editing a page. The contact bar is placed on every page that the source shows it on;
on a page whose content carries none, the theme prints the front page's copy before the footer, so
editing it on `home` changes it there too. Motion is markup: blocks the source moves carry the
motion library's classes; a copied block keeps them.

To add a section to a page: in the editor, Patterns > JA Nova > insert, then fill the content
blocks; or by command, take the pattern's markup with
`wp eval 'echo WP_Block_Patterns_Registry::get_instance()->get_registered("wp-ja-nova/section-cta")["content"];'`
and splice it into `post_content`. A freshly inserted section shows `assets/img/placeholder.svg`
where a picture goes; replace it from the media library. A new section **type** is a theme change
(a new `patterns/acm-*.php` in the overlay, rebuilt), not a site edit.

## Posts, archives and search

Posts use the core `post` type with categories and tags. Authors: the nine people of the source,
created as WordPress users with their pictures (user meta `tracy_avatar`), biographies, and the
theme's profile fields "Job title" and social links (Users → Profile → Author list). A post's tags
are the source article's tags, in the source's order. Its "Continue Reading" posts come from the
theme's Keywords taxonomy (the source article's meta keywords, edited in the post screen's Keywords
panel, never shown on the site): most shared keywords first, ties by the source article order. The
service pages keep their source tags too (tags are enabled for pages), so `/tagged-items` lists
them. WordPress's own
`/category/…`, `/tag/…`, `/author/…` and date URLs render from `archive.html`; the site's menus
link the listing pages above instead. Search works at `/smart-search` and at `/?s=` and lists
matching posts and pages.
