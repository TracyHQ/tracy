# Content model: where every kind of text lives

Read ../AGENTS.md and generated/inventory.md. The counts there are the seed's (32 pages, 240
posts, 9 categories, 5 menus, 2 template-part rows, 64 sections, 64 media files, 2 redirect rules),
not the live site's; find current ids by slug with `wp post list`.

| Text | Lives in | Find it | Edit it |
| --- | --- | --- | --- |
| A page body, its sections included | `post_content` of the page, block markup | `wp post list --post_type=page --fields=ID,post_name,post_parent,url` | the editor, or `wp post update <id> --post_content=@file` |
| A post (240 seeded) | `post_content`; `category` terms (`field-notes-from-the-on-call`, `engineering`, `incident-retros`, `practice`, `product`, `culture`, `tutorials`, `legal`, `uncategorised`) and `post_tag` | `wp post list --post_type=post --fields=ID,post_name,url` | the editor |
| The source's main menu tree | `wp_navigation` `mainmenu`, seeded but **not referenced** by the header: the header draws its links itself (the two rows below) | `wp post list --post_type=wp_navigation --fields=ID,post_name,post_title` | editing it changes nothing on screen; edit the header part |
| The header's links on a wide screen | the `header` template-part row: plain links and four `wp-ja-kinetic/mega-menu` blocks (Home, Product, Company, Pages) whose columns are inner blocks — not a `wp_navigation` | `wp post list --post_type=wp_template_part --fields=ID,post_name` | Site Editor, header part |
| The header's mobile drawer | an **inline** `core/navigation` inside the `header` row, no `ref`: its links are declared in the part itself | as above | Site Editor, header part — not under Navigation |
| Footer link columns | three `core/navigation` blocks in the `footer` row, named `nav.footer-product`, `nav.footer-dev`, `nav.footer-company`, `ref` → the `wp_navigation` posts of the same slugs. The legal links under them are a plain `core/list` in the part; the seeded `wp_navigation` `legal` is not referenced by the part | as above | Site Editor, footer part; the menus under Navigation |
| Newsletter form (footer, 404 page) | the AcyMailing block `acymailing/subscription-form`; lists and subscribers in AcyMailing | AcyMailing's screens | AcyMailing; the band's heading and copy around it are ordinary blocks in the `footer` row |
| CTA band on the blog and article views | synced patterns (`wp_block`) `wp-ja-kinetic-cta-blog` and `wp-ja-kinetic-cta-article` | `wp post list --post_type=wp_block --fields=ID,post_name,post_title` | edit the `wp_block` once; every view that shows it follows |
| Site name, tagline, front page | options `blogname` ("Kinetic"), `blogdescription` ("observability, reimagined"), `show_on_front=page`, `page_on_front` (the `/` page); `page_for_posts` is unset — the blog is `/product/blog` | `wp option get blogname` | `wp option update …`, or Settings > General / Reading |
| Contact form | the theme's `wp-ja-kinetic/kinetic-contact-form` block on the page using the `page-contact` template (`inc/contact.php`). The info column lists the site's public contact mailbox, `contact.email` of option `tracy_site_identity`; with none, the column is not drawn. Submissions are mailed to option `tracy_contact_to` (filter of the same name), else that public mailbox, else the administrator's `admin_email` (a message that cannot be delivered is worse than one delivered to the administrator); the page itself shows only the public mailbox, never `admin_email`. Nothing is stored | `wp option get tracy_site_identity --format=json`, `wp option get tracy_contact_to` | `wp option update tracy_site_identity '{"contact":{"email":"…"}}' --format=json`, `wp option update tracy_contact_to …`; the recipient is never printed on a page |
| Sign in, register, password, account | pages using the `page-login`, `page-register`, `page-password`, `page-account` templates (`/pages/login`, `/pages/register`, `/pages/reset`, `/pages/remind`, `/pages/profile`), each drawn by a `kinetic-auth-*` block; the forms post to WordPress's own endpoints | as pages | the surrounding words are page content; the forms are the blocks |
| Redirects from retired URLs | option `wp_ja_kinetic_redirects`: a JSON array `[{"from":"/home-menu/home","to":"/","status":301}, …]`, 2 rules seeded; exact path match, only when WordPress would otherwise answer 404 | `wp option get wp_ja_kinetic_redirects --format=json` | `wp option update wp_ja_kinetic_redirects --format=json < rules.json` |
| Labels that are not content (the theme toggle's aria label, "Search") | the part HTML copied into the rows, or the block's `render.php` | grep the theme, then the rows | the row in the Site Editor; a change for every site is a theme change |

Options the theme reads: `wp_ja_kinetic_redirects`, `tracy_site_identity` and `tracy_contact_to`
(contact page), `users_can_register` and `default_role` (the Register page), and, from the source
theme, `tracy_inspiration`, `tracy_nav`, `tracy_hero`, `tracy_motion`.

## Post meta the port wrote, and what reads it

The port ran a post-seed step after the seeder; it wrote the facts below from the Joomla source.
They are ordinary post, user and term meta — edit them with `wp post meta update` / `wp user meta
update`; nothing regenerates them on a live site.

| Meta | On | Read by | Values on the seeded site |
| --- | --- | --- | --- |
| `wp_ja_kinetic_style` | pages | `inc/extra.php` → `data-style` on `<html>` | `terminal` (default when absent), `blueprint` on `/home-menu/home-blueprint`, `signal` on `/home-menu/home-signal` |
| `wp_ja_kinetic_theme_default` | pages | `inc/extra.php` → `data-theme-default` on `<html>` | `dark` (default when absent), `light` on the Blueprint page |
| `wp_ja_kinetic_page_template` | pages | `inc/list-pages.php`, ahead of `_wp_page_template` | `page-article` (About, Team, KineticQL, Pricing, Changelog, FAQ, Features, Integrations, Privacy, Terms; a page whose text opens with its own masthead — About, Team, Pricing, Changelog, FAQ, Features, Integrations — is drawn in the bare `page-landing` frame), `page-tags`, `page-categories`, `page-archive`, `page-authors` |
| `wp_ja_kinetic_list` | pages | `inc/list-pages.php`: the page answers as that archive | `category:field-notes-from-the-on-call` (`/product/blog`), `category:engineering` (`/pages/engineering`), `author:priya-raman` (`/pages/author`) |
| `wp_ja_kinetic_document_title`, `wp_ja_kinetic_metadesc`, `wp_ja_kinetic_crumb_*`, `wp_ja_kinetic_empty_text` | pages | titles, meta description, breadcrumb rows, empty-list text | the source's own words per page |
| `wp_ja_kinetic_source_article_id`, `wp_ja_kinetic_article_author_alias`, `wp_ja_kinetic_article_author_role`, `wp_ja_kinetic_byline_date`, `wp_ja_kinetic_hits`, `wp_ja_kinetic_info_block_position` | posts | bylines, read counts, "popular" ordering, related posts | frozen from the source's database at port time — WordPress does not count views |
| `wp_ja_kinetic_job_title`, `wp_ja_kinetic_user_tagline`, `wp_ja_kinetic_user_photo` | users (the four authors) | author cards, authors directory | the source's author profiles |
| `wp_ja_kinetic_source_tag_id` | `post_tag` terms | tag views | the source's tag ids |

Page templates the seeder chose (`_wp_page_template`): `page-landing` on the Blueprint, Signal and
`/pages/landing` pages, `page-contact`, `page-login`, `page-register`, `page-password` (two pages),
`page-account`, and `page-no-sidebar` on the rest.

## Sections: the pattern convention

A section is a theme pattern under `patterns/`, category **JA Kinetic** (`wp-ja-kinetic`) for the
20 patterns of this site's own section types; the 17 `tracy/*` library patterns inherited from the
source theme are not placed on any page. Inserting one into a page copies its markup into
`post_content`; the page then owns those blocks. In the 20 own patterns every editable block carries

```
metadata: {"role":"content","name":"<type>.<field>[.<n>]"}
```

`<type>` is the section type (`accordion`, `bento`, `clients`, `cta`, `faq-support`,
`features-intro`, `features-ledger`, `hero`, `incident-timeline`, `kineticql-split`,
`page-masthead`, `pricing`, `pricing-matrix`, `prose-quote`, `teams`, `testimonials`), `<field>` the
field, `<n>` the 1-based index inside a repeated group; a repeated item's wrapper carries
`{"name":"<type>.item.<n>"}` with no role — clone or delete the wrapper to change the item count,
its children keep the same names with the new index. Locate a block by its `metadata.name`, never
by position. Blocks without `role: content` are the frame (groups, columns, spacers) and are meant
to stay. Some sections have several layouts of one type (`section-bento` / `section-bento-style-2`,
`section-clients` / `section-clients-style-2`, `section-features-ledger` / `-metrics` / `-stats`).

To add a section to a page: in the editor, Patterns > JA Kinetic > insert, then fill the content
blocks; or by command, take the pattern's markup with
`wp eval 'echo WP_Block_Patterns_Registry::get_instance()->get_registered("wp-ja-kinetic/section-cta")["content"];'`
and splice it into `post_content`. The hero and KineticQL sections show one panel image per
direction, from the theme's `assets/images/`. A new section **type** is a theme change (a new
`patterns/section-*.php` in the overlay, rebuilt), not a site edit.

## Posts, archives and search

Posts use the core `post` type. The Joomla list views keep their addresses as pages carrying
`wp_ja_kinetic_list` (above); WordPress's own `/category/…`, `/tag/…`, `/author/…` and date URLs
render from the theme's templates too. Search works at `/pages/search` and at `/?s=` and lists the
matching posts; the query term is not highlighted in the results.
