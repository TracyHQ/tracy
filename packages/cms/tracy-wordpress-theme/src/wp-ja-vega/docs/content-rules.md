# Content and owner decisions

Read ../AGENTS.md. The site's words and images were ported from the JoomlArt Joomla 6 quickstart
*JA Vega* (`quickstart/ja-vega/j6` release 1.0.0, template `ja_vega` 1.2.1) by the
`tracy-wordpress-theme` skill, measured on a local restore of that release rather than on the public
demo. The standing rule: the WordPress site renders the same pages as the Joomla original. The
words belong to the site's owner and are edited on the site, never regenerated from the source
over an owner's edits.

## Owner and licence

- Content: everything on the site — the company "JA Vega", its services, portfolio projects,
  people, figures, client logos, testimonials, address, phone numbers, e-mail addresses and the 56
  posts — is **demonstration data** from the JoomlArt quickstart until the owner replaces it. Do
  not invent replacements, and do not add "demo" disclaimers to the pages.
- Pictures: the 163 media files come from the quickstart's `images/joomlart/` tree and live in the
  media library (`wp-content/uploads`), not in the theme.
- Theme: "Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.", GNU General Public
  License v3 — the copyright and licence of the JoomlArt JA Vega Joomla template it is ported from,
  carried as the source states them (`style.css`, `readme.txt`). No source stylesheet, script or
  template file was copied: the source's module layouts were marked commercial at the time (JoomlArt
  released them under GPL-2.0-or-later on 26/10/2026), so the theme's CSS was written from computed-style measurements and screenshots, and
  the source's decorative background pictures were replaced by gradients of the measured colours.
  The icons in the theme's stylesheet were drawn for it, except the alert close icon (Bootstrap,
  MIT). The generator and token schema derive from the OpenDesign design-system library,
  Apache-2.0; keep the notices in `readme.txt`.
- Font: Inter Tight, SIL Open Font License 1.1 (`assets/fonts/inter-tight-OFL.txt`), self-hosted;
  the site makes no request to Google Fonts.
- Accounts: each post belongs to its source author, one of nine users the seeder made (user meta
  `tracy_source_author`, picture in `tracy_avatar`, drawn by the must-use plugin
  `tracy-author-avatars.php`); they are demonstration people like the posts. The nine people on
  `/author-listing` are page content as well. Registration is closed (G68).

## What the port changed on purpose

- **Posts keep the source's addresses**: a post answers at `/category-blog/<slug>` or
  `/portfolio/<category>/<slug>` as on the source, and at `/<slug>/`, its canonical address. Only
  the listing of the post's own category serves it, as on the source (docs/architecture.md).
- **Category slugs** are the source's aliases (`blogs`, `portfolio`, `database-security`, …); the
  source's six trashed `services/*` categories were not ported.
- **The service articles** are the six child pages of `/services`, in the source's order, each with
  its questions and benefit cards as page content.
- **The 404 page** sits inside the site frame (header, masthead, "Home Page" button) with the words
  of the source's bare Joomla error page, kept editable in the draft page `page-not-found`. The
  source's own 404 has no header or footer.
- **Page titles are `h1`**: `/typography` shows a second `h1` because its sample text contains one,
  as the source's does. `/tagged-items` and `/profile` print their page title in the masthead where
  the source falls back to "JA Vega" and "Login Form".
- **Footer copyright** names "JA Vega"; the source's "Joomla! is Free Software" line was dropped.
- **Joomla view chrome with no WordPress counterpart** was not drawn: the Smart Search help box and
  advanced search, the tag filter form, the "Don't have an account?" link and the com_users
  registration fields. The listing pager, by contrast, is drawn as the source's: first, previous,
  page numbers, next and last, with the "Page N of M" box (docs/content-model.md).
- **The single-post view** has no "Related Posts" block (the source's articles have none); the
  post answered at `/blog-detail` (template `page-article`) keeps its "Continue Reading" block.
- **Dates**: 54 posts shared a publication time with another; each was moved by one second in the
  source's order, so date-sorted lists come out the same on every request.
- **Dark mode** reads its cookie on every load; the source's switch forgets the choice after a
  reload on a light operating system (G10, a source defect not carried).

## Differences from the source — recorded, not filled

Each has a number in the port's gap register (`tasks/ja-vega-wp7/content-gaps.md` in the Tracy
repository). Still open when this theme was built:

| | Source | This site | Why it stays |
| --- | --- | --- | --- |
| G6 | newsletter sign-up (AcyMailing module) and breadcrumbs | none | no equivalent plugin chosen; no fake form is drawn |
| G32 | a view counter beside the date on the home blog cards, and a tag filter on `/tagged-items` | the date and the tag chips; `/tagged-items` is a static page of titles | WordPress keeps no view count, and no number is invented; the tag view is Joomla's own |
| G44 | author share buttons and links to author pages | names and photos only | author pages are not in the page map |
| G67 | "Share:" buttons under service and article titles | none | a share plugin is not chosen; core has no share block |
| G68 | a working registration form at `/registration-form` | a "Log in" link | kept closed on purpose: the owner decided on 28/09/2026 to keep WordPress registration off on sites made from this template, so strangers cannot create accounts |
| G69 | icons on the four figure cards of `/about-us` (and on the source's other Font Awesome spots, G26) | no icon | an icon source (Font Awesome Free, CC BY 4.0, or own drawings) is not chosen |

Registration: turning it on is `wp option update users_can_register 1` plus a `default_role`;
decide it, do not assume it.

## Seed vs. site

The site was built by the skill's seeder (pages, posts, categories, menus, template-part rows,
the contact form, sections, media, the redirect rule, the draft 404 page) from the spec-pack in
the Tracy repository's `tasks/ja-vega-wp7/spec/` — the adapter's output with each repair recorded
by gap number in `content-gaps.md` — plus one post-seed step that sets `custom_logo`. A rerun of the seeder finds every object by slug and a fingerprint in post meta
(`_tracy_seed`), updates what changed in the spec and skips the rest (the last two runs changed
nothing). It is a rebuild tool for a fresh site, not an editing tool for a live one, and it reads a
spec-pack that a live site does not have. Take a backup before any rerun.
