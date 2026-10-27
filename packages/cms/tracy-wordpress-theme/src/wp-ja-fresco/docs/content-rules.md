# Content rules

Read ../AGENTS.md. This file records who decided what, what is demonstration data, and what is
still open. Sources: `tasks/ja-fresco-wp7/DECISIONS.md`, `content-gaps.md`, `parity-accepted.json`
and `STATUS.md` in the Tracy repository (Vietnamese working notes; decisions below are restated in
English). Everything is **as of the build of 21/10/2026**; docs/checks-and-recovery.md says which
checks ran.

## Provenance and demo data

- The site is the demonstration site of the JoomlArt JA Fresco quickstart. The content contract
  (`spec/content-contract.json`) has mode `demo`, language `en`, and one status per fact: site name
  "fresco" and tagline "Restaurant template" are **verified** from the source; the demo disclosure
  "Demonstration site: company details, team profiles and prices are illustrative." has status
  `demo`.
- Dishes, prices, opening hours, addresses, people (chefs, authors), testimonials and all pictures
  are the source's demonstration content. Do not present them as real; replace them through
  WordPress when the owner supplies real ones, and record a gap when they do not.
- Licence and copying: the source template was commercial software when this theme was built (JoomlArt
  released it under GPL-2.0-or-later on 26/10/2026), so no stylesheet, script or template file of it is in this theme; the CSS was written from
  measurements. Fonts that ship are Playfair Display and Roboto (SIL OFL), each with its licence
  file in `assets/fonts/`. Pictures live in the media library, not in the theme.
- The footer copyright line prints the site name through `{site.title}`; the source's line about
  Joomla is left out (G6).

## Decisions that shape the content

- Article 3, "Soul Kitchen Kumquat & Thyme Cocktail", is the source's `/pages/j-content/blog-detail`
  menu item and is also in the Food list; it is a post, served at that address (D-03).
- "Related Posts" lists posts sharing a tag, since the source's keywords equal its tags (D-04).
- The source picture `404.jpg` took the slug `404`; the seed step renamed it `error-404-picture`
  so `/404` stays a 404 (D-06).
- The header logo is the source's `logo.png` (alt "fresco") in `site_logo` (D-07).
- The source's breadcrumb is painted over by its own footer and never seen; the port draws none
  (D-08).
- The author line, curDot cursor, top bar, masthead, account forms, author grid, contact icons,
  email display and featured view follow the source as measured (D-11, D-13, D-15, D-17, D-18,
  D-20 to D-24). Account forms keep only what WordPress has: no username-reminder link, and
  registration asks only Username and Email (D-20).

## Open decisions (owner to choose; the default stands until then)

| Id | Question | Current default |
| --- | --- | --- |
| D-01 | The source has one dark look and no switch. Draw a second (light) look? | no: both halves of every preset are the same and no toggle is shown |
| D-02 | The source's primary button and category labels are white on beige (1.59:1, below WCAG AA). Keep the source colour? | no: dark text `#0a0b0a` on the beige (`--accent-on`) |
| D-05 | The source's gallery strip autoplays. Tracy's motion library has no autoplay. | no autoplay; it steps when the visitor uses its controls |
| D-09 | The design contract would carry 112 Bootstrap defaults the T4 framework compiles in. Carry them? | no: the contract keeps the template's own 51 tokens; the port declares each as a `--jf-*` variable with the source value |
| D-10 | Below 992 px the source has two buttons that open the same menu. Draw both? | one button (WordPress's navigation overlay, drawn as the drawer) |
| D-25 | The search page's "No search results could be found" sentence is Bootstrap grey `#6c757d` on the dark panel (3.9:1, below WCAG AA). Copy it? | no: the body text colour |
| D-19 | The home-3 text slider slides sideways and cuts words at the screen edges. Keep it? | the line stands still, centred, wrapped; alternative: a CSS marquee that stops under reduced motion |

## Known gaps (not filled, not invented)

- G8 "Hits" in the article info line is not printed: WordPress has no view counter.
- Account forms have no counterpart for Joomla's username reminder or profile fields (D-20).
- Tool-level findings accepted by name in `parity-accepted.json` (`registry`) are measurement limits,
  not site differences.

## What not to do

Do not turn open decisions into silent edits; ask the owner, then record the choice. Do not add
business facts, people, prices, legal text or pictures the owner did not provide. Whether the built
site prints the demo disclosure anywhere was not verified for this document.
