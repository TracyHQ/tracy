# Content and owner decisions

Read ../AGENTS.md. The site's words and images were ported from the JoomlArt Joomla 6 quickstart
*JA Kinetic* (`quickstart/ja-kinetic/j6`, the demo at https://ja-kinetic.demo.joomlart.com/) by the
`tracy-wordpress-theme` skill, with one standing rule: the WordPress site comes out **identical to
the Joomla original**, source oddities included. The words belong to the site's owner and are
edited on the site, never regenerated from the source over an owner's edits.

## Owner and licence

- Content: everything on the site — the company "Kinetic" (the source demo also said "Helix" in places; the quickstart since 1.0.1 says Kinetic throughout), its product, people, prices,
  customer logos, testimonials, incident stories and the 240 blog posts — is **demonstration data**
  from the JoomlArt quickstart until the owner replaces it. Do not invent replacements, and do not
  add "demo" disclaimers to the pages.
- Theme: "Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.", GNU General Public
  License v3 (not "or later") — the copyright and licence of the JoomlArt JA Kinetic Joomla
  template it is ported from, carried as the source states them (`style.css`, `readme.txt`). The
  design, the panel images and the 64 media files come from that template and its quickstart.
  The generator and token schema derive from the OpenDesign design-system library, Apache-2.0;
  keep the notices in `readme.txt`.
- Fonts: IBM Plex Sans, Space Grotesk, JetBrains Mono and the two Font Awesome fonts, SIL Open Font
  License 1.1 (`readme.txt` names each).
- Accounts: the four authors (`arjun.mehta`, `lena.park`, `priya.raman`, `tomas.rivera`) were
  created from the source's bylines with random passwords and `@example.invalid` addresses; the
  seeder's `editorial` placeholder user is kept, with no role.

## What the port changed on purpose

- **Addresses**: the Joomla paths lose their `/index.php` segment (`/index.php/product/blog` →
  `/product/blog`) and articles take WordPress slugs made from their titles instead of Joomla's
  `<id>-<alias>`. Four pairs of source articles shared one alias; the second of each pair keeps an
  alias of its own (`five-minute-mttr`, `first-kineticql`,
  `error-budgets-without-the-politics-2026`, `on-call-rotations-that-do-not-burn-people-out-2026`).
- **Redirects** (`wp_ja_kinetic_redirects`): `/home-menu/home` → `/`, and the old sample-article
  address `/index.php/product/blog/134-continuous-profiling-intro` →
  `/metrics-logs-traces-and-now-continuous-profiling/`, and `/pages/helixql` (with or without
  `/index.php`) → `/pages/kineticql`, the article's address before the demo's rename.
- **List views** stay at the source's own addresses as pages answering as archives
  (docs/content-model.md), not moved to `/category/…` or `/author/…`.
- **The three home directions** — Terminal (`/`), Blueprint (`/home-menu/home-blueprint`), Signal
  (`/home-menu/home-signal`) — are three pages with the same sections, each pinned to its direction
  and its own light/dark default (docs/design-system.md).

## Differences from the source — recorded, not filled

Each has a number in the port's gap register (`tasks/ja-kinetic-wp7/content-gaps.md` in the Tracy
repository) and a decision. Those a visitor or the owner can meet:

| | Source | This site | Decision |
| --- | --- | --- | --- |
| G9 | theme switch light ⇄ dark | the same two states, no "auto"; a visitor with no choice gets the page's default | identical |
| G10, G11 | blog-list dates and author-page category labels as one text run | the same words split into several runs | platform difference, same visible text |
| G12 | site search answers "No Results Found" for words its articles contain | search finds the articles; the query term is not highlighted | WordPress search kept working |
| G13, G14, G15 | the 404 body, the 404 page's own footer copy and the search page lede are typed in the template | typed in the theme's templates too, not editable in the admin | identical to the source |
| G16 | the Signal page in dark has muted text below 4.5:1 contrast | the same colours | the source's own palette, carried as is |
| G24 | the 404 page's newsletter form does nothing | the 404 page's form is the working AcyMailing form | WordPress works where the source does not |
| G26 | the bento chart image at 390px wide is the original file | WordPress serves its resized copy, 0.167px shorter | accepted, not visible |
| G27 | no toolbar on the front end for a registered member | the WordPress toolbar is hidden for accounts that cannot edit posts | identical; Theme Check warns about it by design |
| — | breadcrumbs, author cards, read counts | carried from post meta written at port time; read counts are frozen (WordPress does not count views) | identical at port time |

The other entries in the register (G17–G23, G25) are readings of the review tools that compared
the two sites, not differences on the site.

## Seed vs. site

The site was built by the skill's seeder (pages, posts, menus, template-part rows, redirect rules,
sections) followed by a Kinetic-only post-seed step (the post, user and term meta of
docs/content-model.md, the two synced CTA patterns, testimonial texts, registration open). A rerun
of the seeder finds every object by slug and a fingerprint in post meta (`_tracy_seed`), updates
what changed in the spec and skips the rest; the post-seed step writes only what differs. Both are
rebuild tools for a fresh site, not editing tools for a live one, and the post-seed step reads the
Joomla source's database, which a live site does not have. Take a backup before any rerun.
