# Content model: where every kind of text lives

Read ../AGENTS.md and generated/inventory.md. The counts there are the seed's (43 pages, 51
posts, 14 categories, 6 menus, 2 template-part rows, 1 form, 36 media files, 8 redirect rules),
not the live site's; find current ids by slug with `wp post list`.

| Text | Lives in | Find it | Edit it |
| --- | --- | --- | --- |
| A page body, its sections included | `post_content` of the page, block markup | `wp post list --post_type=page --fields=ID,post_name,post_parent,url` | the editor, or `wp post update <id> --post_content=@file` |
| A post (51 seeded, 14 categories) | `post_content`; `category` and `post_tag` terms | `wp post list --post_type=post --fields=ID,post_name,url` | the editor |
| A menu | one of six `wp_navigation` posts: `tracy` (header, 52 items in the source tree), `tracy-utility` (14), `tracy-onepage` (6), `tracy-footer-product`, `tracy-footer-resources`, `tracy-footer-company` | `wp post list --post_type=wp_navigation --fields=ID,post_name,post_title` | Site Editor > Navigation, or update the post's block markup (`core/navigation-link`, `core/navigation-submenu`) |
| Header and footer | `wp_template_part` rows `header` and `footer` — the theme's `parts/*.html` with the navigation `ref`s filled; they **shadow the files** | `wp post list --post_type=wp_template_part --fields=ID,post_name` | Site Editor > Patterns > Template parts. Delete the row to fall back to the file (and lose the refs) |
| Mega-menu columns (Service, Resources, Company) | inside the `header` template-part row, as `tracy-base/mega-menu` inner blocks; the links are plain `core/list` items, not a `wp_navigation` | as above | Site Editor, header part |
| The one-page home's header (About, Services, Product, Team, Contact) | the `header-onepage` part (`parts/header-onepage.html`), used by the `page-onepage` template, which prints no site footer; its links are anchors into that page | as above | Site Editor, header (one page) part |
| Footer link columns | three `core/navigation` blocks in the `footer` row, `ref` → `tracy-footer-*`; the social row and the site notice are copies of `tracy-base/section-social-links` and `section-site-notice` | as above | Site Editor, footer part; the menus under Navigation |
| Site name, tagline, front page | options `blogname` ("Tracy"), `blogdescription`, `show_on_front=page`, `page_on_front` (the `/` page); `page_for_posts` is unset on purpose — `/resources/blog` is a page | `wp option get blogname` | `wp option update …`, or Settings > General / Reading |
| Logo | `site_logo` option / `custom_logo` theme mod, an attachment id; the header's `core/site-logo` reads it | `wp option get site_logo` | Site Editor, header part, click the logo |
| Contact form | `wpcf7_contact_form` post `contact` (Contact Form 7); the contact page prints its shortcode | `wp post list --post_type=wpcf7_contact_form` | Contact > Contact Forms; recipient and mail template are the form's |
| Redirects from the Joomla routes the port dropped or renamed | option `tracy_base_redirects`: a JSON array `[{"from":"/pages/wrapper","to":"/","status":301}, …]`, 8 rules seeded; exact path match, only when WordPress would otherwise 404 | `wp option get tracy_base_redirects --format=json` | `wp option update tracy_base_redirects --format=json < rules.json` |
| Shared blocks | **none** — the seed created no synced pattern (`wp_block`). The Tracy quickstart contract (`tracy-base/wp7/1.0.0`) names two slugs, `contact-information` and `home-hero`, for a future fill; on this site those texts are inside the page bodies | `wp post list --post_type=wp_block` | create one from any block in the editor ("Create pattern", synced); its references then read `<!-- wp:block {"ref":<id>} /-->` |
| Labels that are not content (the header's "Contact" button, "Search", the toggle's aria label) | `parts/header.html` copied into the `header` row, or the pattern PHP | grep the theme, then the row | the row in the Site Editor; a change for every site is a theme change |
| Design-system and demo pages (`/resources/typography`, `/resources/colors`, `/resources/spacing`, `/resources/style-guide`) | ordinary pages | as pages | as pages |

Options the theme reads, all optional: `tracy_base_redirects`, `tracy_inspiration`, `tracy_nav`,
`tracy_hero` (fallbacks for the design system when global styles carry none), `tracy_motion`,
`tracy_contact_to` (the source theme's own contact handler, not used by the Contact Form 7 page),
`admin_email`.

## Sections: the pattern convention

A section is a theme pattern under `patterns/`, category **Tracy Base** (`tracy-base`) for the
21 patterns of this site's own section types and **Tracy sections** (`tracy`) for the 16 library
patterns inherited from the source theme. Inserting one into a page copies its markup into
`post_content`; the page then owns those blocks. In the 21 own patterns every editable block
carries

```
metadata: {"role":"content","name":"<type>.<field>[.<n>]"}
```

`<type>` is the section type (`accordion`, `carousel`, `clients`, `contact-information`,
`cta-capsule`, `features-intro`, `hero`, `marketing-samples`, `menu-feature`, `pricing`,
`site-notice`, `social-links`, `statistics`, `story-chapter`, `tabs`, `team`, `testimonials`,
`timeline`), `<field>` the field, `<n>` the 1-based index inside a repeated group; a repeated
item's wrapper carries `{"name":"<type>.item.<n>"}` with no role — clone or delete the wrapper to
change the item count, its children keep the same names with the new index. Locate a block by
its `metadata.name`, never by position. Blocks without `role: content` are the frame (groups,
columns, spacers) and are meant to stay. The 16 library patterns (`tracy/section-hero`,
`section-pillars`, `section-faq`, `section-pricing` … used on `/` and `/resources/home-onepage`)
carry **no** metadata: edit them by their heading text and order.

To add a section to a page: in the editor, Patterns > Tracy Base > insert, then fill the content
blocks; or by command, take the pattern's markup with
`wp eval 'echo WP_Block_Patterns_Registry::get_instance()->get_registered("tracy-base/section-statistics")["content"];'`
and splice it into `post_content`. `section-team-query` needs posts in the team category to show
anything; `section-social-links` is a `core/social-links` block; `section-accordion` uses
`core/details`. A new section **type** is a theme change (a new `patterns/section-*.php` in the
overlay, rebuilt), not a site edit.

Seven sections are `core/html` blocks rather than patterns, because no library pattern matched
the source: on `/resources/home-onepage` the about, services, product, process and footer blocks
(seeded as HTML by design) and the team block (fallback, no `tracy/section-team` pattern exists),
and on `/` the "Different skills. A shared standard." block (fallback). The seed report names each.
Edit their HTML, or replace them with a Tracy Base section.

## Account and search

There are no account pages: the menu's Sign in / Register / Reset password items link to
`/wp-login.php` and its actions, Profile to `/wp-admin/profile.php`. The Resources menu's Search
item opens the page `/resources/search`, which holds a `core/search` block; the results are the
`search` template (its body is the pattern `tracy-base/search-results`: the same form, one result
per row, or a "No Results Found" panel naming the query).
