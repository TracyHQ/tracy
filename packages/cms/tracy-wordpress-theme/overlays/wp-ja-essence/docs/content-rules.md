# Content rules

Read ../AGENTS.md. This file records who decided what, what is demonstration data, and what is
still open. Sources: `tasks/ja-essence-wp7/DECISIONS.md`, `parity-accepted.json`, `LENS.md` and
`STATUS.md` in the Tracy repository (Vietnamese and English working notes; decisions below are
restated in English). No site owner took part in the build: every decision marked open was applied
with the default stated, and is the owner's to confirm or change.

## Provenance and demo data

- The site is the demonstration site of the JoomlArt JA Essence quickstart (template `ja_essence`
  1.3.1, style "ja_essence - Default", T4 framework). The content contract
  (`spec/content-contract.json`) has mode `demo`, language `en`, and one fact status per claim: the
  site name "JA Essence" is **verified** from the source's configuration (`sitename`); the tagline is
  **absent in the source** (`blogdescription` is empty on purpose, nothing was invented); the demo
  disclosure "Demonstration site: company details, team profiles and prices are illustrative."
  has status `demo`.
- The 46 posts, their authors (nine imported users with pictures), the contact details, the
  footer tagline and every picture are the source's demonstration content. Do not present them as
  real; replace them through WordPress when the owner supplies real ones, and record a gap when
  they do not.
- Licence and copying: the source template's own files carry the licence line "Copyrighted
  Commercial Software", so no stylesheet, script or template file of it is in this theme; the CSS
  was written from computed-style measurements of the running source (docs/design-system.md).
  Fonts that ship are Jost and Noto Serif, self-hosted woff2 files (D-05); both are open-licensed
  Google Fonts families (SIL Open Font License), see `readme.txt`. Pictures live in the media
  library (`wp-content/uploads`), not in the theme.
- `Update URI:` in `style.css` points at the Tracy update repository; the theme is not for the
  wordpress.org directory.

## Decisions that shape the content

- The site name "JA Essence" is the header's site title (a text title) and the footer's logo is a
  picture, the theme mod `custom_logo` (D-54, D-04: the source's dark mode paints the name dark on
  dark; the port prints it in the heading colour, readable).
- Detail pages (`/detail/*`) and the Joomla article route are **pages** where the source has
  articles (D-06): a static byline carries the source's author name and a live date block (D-40);
  Prev/Next, Share article and Tags in are static markup taken from the source render (D-67); the
  share links get their address from the token `__JE_PERMALINK__` at render time.
- The video article embeds its YouTube player through a core embed block, a third-party iframe as
  the source's own player is (D-70). Video and gallery fields of the source were reduced to an
  embed URL and a gallery after the body (D-02).
- White text on the accent `#4d6bff` is 4.32:1, below WCAG AA 4.5:1 for small text; kept as the
  source draws it (D-03, parity).
- Blog lists are newest first: WordPress has no hit counter and no equivalent of Joomla's featured
  ordering (D-09, D-14); the "Hits" column of the source's cards is not drawn.
- The Newsletter module (an AcyMailing form in the source) became a card with a "Sign up" button
  linking to `/contact/`: there is no mailing list on the site (D-10). The category slider chips
  show names and counts, not pictures (D-11).
- Header: one part, two looks chosen by body classes (`.home` and the landing template get the
  two-row header, every other page the one-row grid, desktop only; D-51). The mega menu panel is
  drawn as columns by CSS (D-52); the off-canvas menu was rebuilt to the source's mobile geometry
  (D-58); the source's picture inside each menu panel is not drawn (D-55).
- Sidebar modules the source assigns by menu but never prints were not ported; seven source modules
  are not drawn (D-12, D-13). The "Follow me" and Newsletter cards are drawn as page sections, not
  on posts, since a post has no sidebar (D-65).

## Open decisions (owner to choose; the default stands until then)

| Id | Question | Current default |
| --- | --- | --- |
| D-41 | The source registration and profile forms are Joomla user forms (about 15 fields); WordPress has no equivalent without a plugin | registration page keeps core's Log in link (registration closed); profile pages are static previews |
| D-42 | The source contact form has Name, Email, Subject, Message and Send a copy; the seeder builds a Contact Form 7 form with Your name, Your email, Your message and a privacy note | 1.0.3 (D-75): the form of the source: Name*, Email*, Subject*, the message, an optional "Send a copy to yourself" box and "Send message", no privacy gate; ticking the box mails the visitor a copy (Mail (2), switched off when it is not ticked) |
| D-50 | The Health listing shows 9 posts, not the source's 12: three source articles became the `/detail/*` pages | 9 posts, no pager (appears only when the data needs it), no invented copies |
| D-53 | Category views differ in the source (hero card, horizontal cards, sidebar, title-only table for tagged items, people grid for authors) | one card layout for all, type sizes per page; the other layouts are not ported |
| D-61, D-64 | Source chrome with no WordPress counterpart: the gallery strip on the search view, the "Trending" and "Editor's choice" labels, the "Written by" prefix, the login module's "Don't have an account?" link | not drawn |
| D-66 | The source answers a guest at the two profile pages with 303 to the login form | the port serves a static preview with 200 |
| D-67 | Article footer: "Author's latest articles", and the share counter of the source's script | not drawn |
| D-68, D-69 | Category Blog is a one-column blog list in the source; the login form lacks "Forgot your password/username" links and the password eye toggle | shared card layout with intro and tags; core login markup |
| D-07 | The `topic` category base is set by hand and carried by the database | docs/install.md |

Decisions D-01 to D-06, D-08 to D-13, D-40, D-51, D-52, D-54 to D-60, D-62, D-63 and D-65 are
recorded in the build's `DECISIONS.md` with the default they applied; none needs an owner action
unless the owner disagrees.

## Known gaps (not filled, not invented)

- The newsletter box sends nothing and has no list (D-10); the footer's "Become a subscriber" and
  the header's "Subscribe" buttons link to `/contact`.
- The header's social links, and the follow-me card's service buttons, point at `#` as placeholders until the owner supplies real addresses.
- The footer keeps the source's words, with the CMS named for what the site runs on (1.0.1):
  "Copyright (c) 2026 JA Essence. All Rights Reserved." and "WordPress is Free Software released
  under the GNU General Public License.", and the tagline "A super modern theme following the
  latest trends with premium membership". The words are in the `footer` template part
  (docs/content-model.md).
- Tool-level findings accepted by name in `parity-accepted.json` and the severity list (S-numbers,
  D-numbers) are measurement limits, not site differences.

## What not to do

Do not turn open decisions into silent edits; ask the owner, then record the choice. Do not add
business facts, people, prices, legal text or pictures the owner did not provide. Whether the built
site prints the contract's demo disclosure anywhere was not verified for this document.
