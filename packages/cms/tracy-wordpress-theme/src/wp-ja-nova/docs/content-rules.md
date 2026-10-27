# Content and owner decisions

Read ../AGENTS.md. The site's words and images were ported from the JoomlArt Joomla 6 quickstart
*JA Nova* (`quickstart/ja-nova/j6`, template `ja_nova` 1.2.1, T4 framework) by the
`tracy-wordpress-theme` skill, measured on a local restore of that release rather than on the
public demo. The standing rule: the WordPress site renders the same pages as the Joomla original.
The words belong to the site's owner and are edited on the site, never regenerated from the source
over an owner's edits.

## Owner and licence

- Content: everything on the site — the company, its services, projects, people, figures, prices,
  client logos, address, phone numbers, e-mail addresses and the 45 posts — is **demonstration
  data** from the JoomlArt quickstart until the owner replaces it. Do not invent replacements, and
  do not add "demo" disclaimers to the pages.
- Pictures: the 142 media files come from the quickstart's `images/` tree and live in the media
  library (`wp-content/uploads`), not in the theme. The theme ships eight pictures of the JoomlArt
  JA Nova template itself (`assets/img/icon-decor-*.png`, the heading decorations, and
  `assets/img/ic-*.png`, the contact icons), as the template ships them.
- Theme: "Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.", GNU General Public
  License v3 — the copyright and licence of the JoomlArt JA Nova Joomla template it is ported from,
  carried as the source states them (`style.css`, `readme.txt`). No source stylesheet, script or
  template file was copied: the source's module layouts were marked commercial at the time (JoomlArt
  released them under GPL-2.0-or-later on 26/10/2026), so the theme's CSS was written from computed-style measurements and screenshots.
  The icons drawn in the theme's stylesheet were drawn for it, except the select arrow of the tag
  list (Bootstrap, MIT). The generator and token schema derive from the OpenDesign design-system
  library, Apache-2.0; keep the notices in `readme.txt`.
- Font: Golos Text, SIL Open Font License 1.1 (`assets/fonts/golos-text-OFL.txt`), self-hosted,
  used by the 404 page as on the source; the site makes no request to Google Fonts. The rest of
  the site uses no web font (below, "Typography").
- Accounts: the posts belong to the source's nine authors, created as WordPress users with their
  pictures. Registration is open to new people as subscribers (`users_can_register` = 1, `default_role` = subscriber: data of the quickstart, set on the site, never forced by the theme).

## What the port changed on purpose

- **Posts keep the source's addresses**: a post answers at `/category-blog/<slug>` or
  `/project/<category>/<slug>` as on the source, and at `/<slug>/`, its canonical address. Only the
  listing of the post's own category serves it, as on the source (docs/architecture.md). The
  source's article menu addresses `/blog-detail` and `/project/project-detail` redirect (301) to
  their posts, and the menu entry of those posts is marked current as the source marks it.
- **The service articles** are seven pages with the services menu beside them, Prev/Next in the
  menu's order, as the source's category of services orders them.
- **Footer copyright** keeps "Copyright © 2026 ja_nova. All Rights Reserved."; the source's
  second line ("Joomla! is Free Software …") was dropped: it names Joomla.
- **Site name** is `ja_nova`, the source's site name. The header logo is the source's image logo, not the name (measured 03/10: `images/joomlart/logo/item-1.png` 162×48 light, `item-2.png` 161×49 dark); since 1.1.10 the demo ships them as `site_logo` (attachment 826) and `tracy_logo_dark` (attachment 65), read by Site Logo blocks.
- **The 404 page** is drawn as the source's own error page (no header or footer, colour switch at
  the corner, Golos Text), with its words in the draft page `page-not-found`. In dark, the source's
  "Home Page" button is purple text on purple; the port keeps the text white.
- **Dark mode fixes of source defects**: the phone drawer's items (the source keeps light-mode
  grey text on the dark drawer), the rule under each tag-list row (the source keeps a light rule on
  the dark page). Visual comparisons with the source show these as differences on purpose.
- **Joomla view chrome with no WordPress counterpart** was not drawn: the e-mail cloaking script of the contact page (WordPress prints the
  address as a `mailto:` link, the words a visitor sees on the source), "Forgot your username?"
  (WordPress has no such flow; the sign-in form links "Forgot your password?" and "Don't have an
  account?").

## Differences from the source — recorded, not filled

Each has a number in the port's gap register (`tasks/ja-nova-wp7/content-gaps.md`) or decision
log (`tasks/ja-nova-wp7/DECISIONS.md`) in the Tracy repository. Still open when these documents
were written:

| | Source | This site | Why it stays |
| --- | --- | --- | --- |
| G12 | the registration form of the source asks name, password and a user profile | the registration form asks username and email (WordPress sends the password) | WordPress stores no profile fields (D-17) |
| G15 | `/typography`: the Bootstrap component samples (buttons, badges, alerts, cards, progress bars, pagination, spinners) drawn as on the source | the sample markup with partial styling | not measured yet |
| G18 | `/project`: a "We have an experienced team of production" block with tabs All project / Branding / UI/UX design / Illustration over project cards | the contact bar only | not ported yet |

Registration: the quickstart ships with it on and new people as subscribers; the theme never turns it on. A site owner who
turns it off (`wp option update users_can_register 0`) gets a "Registration is closed on this site." note on the page and no
registration link on the sign-in form.

Passkeys: the sign-in form's passkey button and the account page's "Add a passkey" use the theme's REST routes
(`wp-json/wp-ja-nova/v1/passkey/*`, `inc/extra.php`). Every assertion is verified on the server (challenge used once within
five minutes, origin, relying party id, user-present flag, ES256/RS256 signature, signature counter); a site on a changed
domain registers its passkeys again, since a passkey is bound to the domain.

Advanced Search: the button on `/smart-search` shows and hides the tips card, as the source's does. The source defines no
search filter (its filter window is empty, measured 03/10), so the site has none either.

## Seed vs. site

The site was built by the skill's seeder (pages, posts, categories, tags, authors, menus,
template-part rows, the contact form, sections, media, the redirect rules, the draft 404 page)
from the spec-pack in the Tracy repository's `tasks/ja-nova-wp7/spec/` — the adapter's output with
each repair recorded by skill-issue number in `tasks/ja-nova-wp7/RUN.md` and made by
`tasks/ja-nova-wp7/tools/fix-spec.mjs`. A rerun of the seeder finds every object by slug and a
fingerprint in post meta (`_tracy_seed`), updates what changed in the spec and skips the rest (the
last run changed nothing). It is a rebuild tool for a fresh site, not an editing tool for a live
one, and it reads a spec-pack that a live site does not have. Take a backup before any rerun.
