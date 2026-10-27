# Content rules

Read ../AGENTS.md. This file records who decided what, what is demonstration data, and what is still
open. Sources: `tasks/ja-diner-wp7/DECISIONS.md` (decisions D-xx, tool issues S-xx), `content-gaps.md`
(G1, G2) and `STATUS.md` in the Tracy repository (Vietnamese working notes; restated here in English).
Everything is **as of 21/10/2026**, when the page groups were merged but not yet closed
(docs/checks-and-recovery.md). Decision numbers are those of `DECISIONS.md`; a number that is not in it
is not a decision of this port.

## Owner, provenance and demo data

- The content belongs to the site owner. The site is the demonstration site of the JoomlArt JA Diner
  quickstart 1.0.4 (Joomla 6.0.3, template `ja_diner`, T3 framework; a restaurant demo). The content
  contract (`spec/content-contract.json`) has mode `demo`, language `en`: the site name is read from the
  source (`ja-diner`; the build stand's `blogname` is that value); the tagline is **absent in the source**
  (so `blogdescription` is empty, S-4); the disclosure "Demonstration site: company details, team
  profiles and prices are illustrative." has status `demo`. That disclosure is not printed on the pages
  checked (`/`, `/about-us/`, `/contact-us/`).
- The footer address ("398 North 23th Dumbledore Street, Hogsmeade Village, Britain."), phone numbers,
  `Info@joomlart.com`, the opening hours, chefs and team, dishes and prices, offers, the 22 articles and
  all photographs are the source's demonstration content. Do not present them as real; replace them
  through WordPress when the owner supplies real ones, and record a gap when they do not.
- Licence: the JA Diner Joomla template is GPL v3 (its `templateDetails.xml`), and so is this theme. The
  theme ships that template's own compiled stylesheets (`assets/css/source/`, D-10) and its own pictures
  (`assets/img`). Fonts: Work Sans and Eczar under the SIL OFL 1.1, bundled instead of calling Google
  Fonts (D-12); Font Awesome 4.6.3 (font OFL, CSS MIT) and Ionicons 2.0.0 (MIT) as the template ships
  them. The generator and token schema derive from OpenDesign (Apache 2.0). Notices are in `readme.txt`;
  keep them. Site photographs live in the media library, not in the theme.

## What the port changed or dropped

- Footer: the source's second line ("Joomla! is Free Software …") and the "Powered By T3 Framework" logo
  are not carried (D-32); the copyright reads `Copyright © {year} {site.title}. All Rights Reserved.`
- The source's Joomla-named off-canvas menu and group are renamed: menu `site-pages` ("Site pages"), group
  "Content", the four pages at `/content/*`, old paths answer 301 (D-36). The masthead default sentence
  "Responsive joomla template for restaurant" reads "Responsive WordPress theme for restaurant" (D-37),
  and the sample line on the Error and Offline pages reads "Each JA template has its own matching 404
  page." (D-38).
- The Subscribe form draws the AcyMailing field and button and sends nothing: WordPress core has no
  mailing list (G1). Its placeholder "Email" and button "Subscribe" are fixed text of the pattern.
- The source has no dark mode; the dark palette is derived (D-03, docs/design-system.md). The source has
  one logo, so in dark mode the header prints the site name as text until `tracy_logo_dark` is set (D-34).
- The sidebar's Login, Latest News and Categories modules are drawn by the theme's blocks; the source's
  read counter (hits) is not in the spec, so there is no "most read" list (G2).
- Article dates read "10 September 2021" through `date_format` = `j F Y` (D-22). Registration stays open as
  in the source (D-15). Three source routes with no WordPress equivalent answer 303 to Login (D-16).
- Phone widths: the main menu is hidden below 768 px and only the side-panel button and the logo show
  (D-35); the side panel slides over the page instead of pushing it (D-33).
- The source loads `/templates/system/css/system.css`, a file Joomla 6 no longer ships (404 on every
  route); the port does not carry that path (D-05).
- The contact form mails the business's own address (`tracy_contact_to`) only; the source's "Send a copy to yourself" box is drawn
  switched off, because a handler cannot know the visitor owns the address typed.
- `wptexturize` is off site-wide: quotes and dashes are printed as typed, as Joomla prints them.
- The "News & Events" cards of the home page draw each article's list picture (`jd_intro_image`), as the
  source does; D-31 records that the seeder alone attaches only the featured image.

## Open decisions (owner to choose; the default stands until then)

| Id | Question | Current default |
| --- | --- | --- |
| D-03 | Dark palette (page `#1a1816`, white boxes `#24211e`, text `#c9c3ba`, headings `#f2eee8`, borders `#3d3833`; accent `#c36349` and highlight `#ffcc00` kept) is a proposal | as listed |
| D-31 | Home news cards: list picture or featured image | list picture (`jd_intro_image`); the blocks are about 170 px shorter than the source because the picture ratio differs |
| D-33 | Side panel: push the page as the source does, or slide over it | slides over |
| D-34 | Supply a logo for dark backgrounds? | the site name as text until `tracy_logo_dark` is set |
| D-36 | Name of the off-canvas menu and group | `site-pages`, "Content" |
| D-37 | Masthead default sentence | "Responsive WordPress theme for restaurant" |
| D-38 | Keep the Error Page and Offline Page, or rewrite or drop them | kept, with the reworded sample line |
| D-43 | Page groups g1, g2, g3 closed `incomplete`, not `done` | not re-cut; the integration checkpoint decides |

## Known gaps (not filled, not invented)

- G1 the Subscribe form sends nothing. G2 the sidebar modules are theme blocks; the source's hit counter
  is absent.
- Dark mode of the source is not measured because the source has none (D-03, D-43).
- Posts answer at `/<slug>/`, not at the source's SEF addresses; only the address of article 3
  (`/our-blog/10-restaurant-news/3-...`) is served as in the source (S-13, D-30).
- Unmeasured by tools: the Tagged Items filter form, and the `intrinsic-mobile` check of the `/content/*`
  pages against the source (D-43).

## What not to do

Do not turn open decisions into silent edits; ask the owner, then record the choice. Do not add business
facts, people, prices, legal text or pictures the owner did not provide. A rerun of the seeder on an
edited site updates objects it recognises by slug; it is a rebuild tool for a fresh site, not an editing
tool for a live one. Take a backup before any rerun.
