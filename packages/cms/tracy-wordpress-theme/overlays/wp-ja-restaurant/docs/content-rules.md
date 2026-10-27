# Content rules

Read ../AGENTS.md. This file records who decided what, what is demonstration data, and what is still
open. Sources: `tasks/ja-restaurant-wp7/DECISIONS.md` (D-01 to D-17, tool issues S-1 to S-20),
`content-gaps.md` (G1 to G5) and `STATUS.md` in the Tracy repository (Vietnamese working notes; restated
here in English). Everything is **as of 20/10/2026**, while the pilot was still being fixed
(docs/checks-and-recovery.md).

## Owner, provenance and demo data

- The content belongs to the site owner. The site is the demonstration site of the JoomlArt JA Restaurant
  quickstart 1.0.6 (a restaurant called "RES Bar & Restaurant" in its copy). The content contract
  (`spec/content-contract.json`) has mode `demo`, language `en`: site name "JA Restaurant" is
  **verified** from the source; the tagline is **absent in the source** (so `blogdescription` is empty);
  the disclosure "Demonstration site: company details, team profiles and prices are illustrative." has
  status `demo`. That disclosure is not printed on the pages checked (`/`, `/about-us`, `/contact/contact-us`).
- Address ("4 5th Avenue at St. Marks Place, Cathedral District Brooklyn, NY 11217"), phone and fax
  numbers, `hello@res-restaurant.example`, opening hours, chefs, dishes and prices, offers, the history
  timeline, articles and all photographs are the source's demonstration content. Do not present them as
  real; replace them through WordPress when the owner supplies real ones, and record a gap when they do
  not.
- Licence: the JA Restaurant Joomla template is GPL v3 (its `templateDetails.xml`), and so is this
  theme. The theme ships that template's own compiled stylesheets (`assets/css/source/`, D-10) and its
  own pictures (`assets/img`); whether shipping the source CSS is acceptable is an open owner decision
  (D-10 below). Fonts: Teko, Noticia Text, Roboto Mono, Saira Extra Condensed under the SIL OFL 1.1
  (`assets/fonts/OFL.txt`), bundled instead of calling Google Fonts (D-12); Font Awesome 4.6.3 (font OFL,
  CSS MIT) and Ionicons 2.0.0 (MIT) as the template ships them. The generator and token schema derive
  from OpenDesign (Apache 2.0). Notices are in `readme.txt`; keep them. Site photographs live in the
  media library, not in the theme.

## What the port changed or dropped

- Footer: the source's "Joomla! is Free Software …" line and the "Powered By T3 Framework" logo are not
  carried; the copyright reads `Copyright © {year} {site.title}. All Rights Reserved. Designed by
  JoomlArt.com.` (D-06).
- The OpenTable booking widget on `/` is not carried: the source loads OpenTable's script with an empty
  restaurant id and it never answers. The orange bar is drawn with its description only (D-02, G1).
- The Subscribe box draws the AcyMailing field and button and sends nothing; its placeholder "Email" and
  button "Subscribe" are fixed text of the pattern (D-07, G3).
- The source has no dark mode; the dark palette is derived (D-03, docs/design-system.md).
- Vietnamese: the source content is English only, but the template's rule that sets Vietnamese pages in
  "Saira Extra Condensed" (Teko has no Vietnamese glyphs) is carried as `:root:lang(vi)` (D-04).
- Horizontal parallax (skrollr) is not carried; vertical "fixed" backgrounds are (D-11).
- Article order: publish minutes were set so newest-first matches the source's order; printed dates are
  unchanged (D-14). Registration stays open as in the source (D-15). Three source routes with no
  WordPress equivalent answer 303 to Login (D-16). The contact map is a Google Maps iframe in page data
  (D-17).
- The contact form mails the business's own address (`tracy_contact_to`) only; the source's "Send a copy to yourself" box is
  drawn switched off, because a handler cannot know the visitor owns the address typed.
- `wptexturize` is off site-wide: quotes and dashes are printed as typed, as Joomla prints them.

## Open decisions (owner to choose; the default stands until then)

| Id | Question | Current default |
| --- | --- | --- |
| D-02 | OpenTable booking on the home page: the source's widget has no restaurant id. Offer a "Book a table" block leading to `/contact/phone-reservation` instead? | the bar shows its description, no form |
| D-03 | Dark palette (page `#1c1a17`, boxes `#26231f`, menu and footer band `#11100e`, text `#e9e4d6`, headings `#f0ece2`, borders `#544e46`; accents `#d24a24` and `#ffd33d` kept) is a proposal | as listed |
| D-07 | Subscribe box: add a newsletter plugin to make it work? | shown, sends nothing |
| D-08 | The source has one logo (brown text). Supply a logo for dark backgrounds? | in dark mode the header prints the site name as text until `tracy_logo_dark` is set |
| D-09 | The four colour pages (`/explore/themes/*-color`) use other accent colours in the source (template styles #10 to #13) | built like the home page with the default colours (G4) |
| D-10 | Confirm shipping the source template's compiled GPL v3 CSS inside the theme | shipped |

## Known gaps (not filled, not invented)

- G1 no booking widget (D-02). G2 the three routes without a WordPress equivalent (D-16 decided their
  answer). G3 Subscribe sends nothing (D-07). G4 colour pages use the default colours (D-09). G5 the home
  gallery strip opens the album page; the source opens a lightbox of the album's pictures.
- Posts answer at `/<slug>/`, not at the source's SEF addresses; only `/gallery/18-sample-album-1` is
  served at its source address.
- Unpublished source menu items (Chefs, Vik Restaurant pages, Open Table, Happy Hours) were not carried.

## What not to do

Do not turn open decisions into silent edits; ask the owner, then record the choice. Do not add business
facts, people, prices, legal text or pictures the owner did not provide. A rerun of the seeder on an
edited site updates objects it recognises by slug; it is a rebuild tool for a fresh site, not an editing
tool for a live one. Take a backup before any rerun.
