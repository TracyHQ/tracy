# Content and owner decisions

Read `../AGENTS.md`. This page holds the rules an editor or an agent follows when changing the content, and the facts about the content that the template does not settle.

## Rules for editors and agents

1. **No invented data.** A missing value stays empty or the element is not rendered (views test each value before printing). Do not fill the gaps (the two different opening hours, the missing OpenTable id and map) or the empty `alt` text of images with guesses.
2. **Images go through the media library.** Fields of type `image` take a media item; `mediaUrl()` turns it into `/_emdash/api/media/file/<key>`. Do not paste `/images/joomlart/...` paths or external URLs into image fields.
3. **HTML in text fields is allow-listed** (`src/lib/html.ts` `cleanHtml`, used for `hero_intro` and post `body`): tags `a br strong b em i p ul ol li span blockquote h2 h3 h4 img`; `a` keeps `href title target rel` (no `javascript:`), `img` keeps `src alt`; every other tag and attribute, and comments, are dropped.
4. **Two-line headings use `<br/>`.** `hero.hero_heading` is split by `lines()`; the last line is drawn as the highlighted second line (`.rs-mark`). Plain text fields (slide title, section titles) take no markup.
5. **Post URLs depend on the first category**: `/<category slug>/<slug>`. Changing a post's category changes its address and the old address answers 404; add a redirect. Blog lists show only the categories `restaurant`, `restaurant-business`, `-marketing`, `-news`, `-guide` (`src/lib/posts.ts`); gallery albums and the Chefs page are posts of other categories.
6. **Words the template prints** (labels, 404 text, footer copy, `{year}`/`{name}` in `copyright`) live in the `chrome` entry; do not hard-code them in views.
7. **Home composition is code**: to show another entry on Home change `src/views/Home.astro`, not the content.
8. **Business copy stays in fields**, not whole pages pasted into `body` HTML.
9. Seed changes and edits to an installed customer's site are separate: edit the site through the CMS API (`content-api.md`); re-seeding does not overwrite editor changes.

## Owner decisions and provenance

- Language: English only. Dates and words follow the display locale (`src/lib/ui.ts`).
- Attribution/licence: package `GPL-2.0-or-later` (`package.json`, under the JoomlArt grant of 26/10/2026, `docs/licensing.md`); the source template said `GNU/GPLv3` in its `templateDetails.xml` before the grant. Keep upstream notices (`LICENSE`).
- Asset provenance: demo photographs come from the Joomla release `images/joomlart/**` (stock images). They are the same photographs JoomlArt ships in its own released quickstarts of this template (the Joomla 6 release this port reads and the WordPress 7 release of the same template), so they carry the rights of those releases; the release has no separate licence text for them. Replace them with the customer's own pictures before the site goes public. Logo files in `public/brand/` are the source's demo logo.
- Dark theme: derived from the source palette, not in the source; the ◐ toggle switches it.
- Not ported: Vik Restaurants, OpenTable iframe, AcyMailing form, Google Maps iframe.
- Content retention, distribution price and attribution wording: not settled by the template; the template owner decides them before the template is sold.

## Open points

- The top bar and the footer print different opening hours, as the source does (`chrome.topbar_text` and `chrome.footer_hours`, edited separately); the customer decides which is right. The opening-hours section is not drawn on any page.
- Every image carries an empty `alt` (decorative) until an editor writes one; the demo pictures are stock photographs (see above).
- The OpenTable booking iframe, the Google Maps iframe and the "Most Read" sidebar are not drawn: they need an external service id or a view counter the demo does not have, and nothing is invented to fill them.
