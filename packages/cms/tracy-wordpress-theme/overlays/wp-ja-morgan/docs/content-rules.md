# Content rules

Read ../AGENTS.md. This file records who decided what, what is demonstration data, and what is
still open. Sources: `tasks/ja-morgan-wp7/DECISIONS.md`, `content-gaps.md`, `parity-accepted.json`
and `STATUS.md` in the Tracy repository (Vietnamese working notes; decisions below are restated in
English). Everything is **as of the last build, 01/10/2026**: the pilot gate passed, the full
checkpoint ran on a restored site, and the open items below are recorded decisions with a default,
not hidden gaps (docs/checks-and-recovery.md).

## Provenance and demo data

- The site is the demonstration site of the JoomlArt JA Morgan quickstart. The content contract
  (`spec/content-contract.json`) has mode `demo`, language `en`, and one fact status per claim:
  site name "Morgan" is **verified** from the source's logo text (`Morgan<b>.</b>`, the T3 style's
  `sitename`) and its footer copyright ("© 2019 Morgan."), and the tagline "Creative multipurpose
  Joomla template for business" from the source's meta description; the demo disclosure "Demonstration
  site: company details, team profiles and prices are illustrative." has status `demo`.
- Company details, people, addresses ("312 North 24th Street Brooklyn, New York", "212.218.8500",
  "inquiry@stark.com"), prices, testimonials and all pictures are the source's demonstration
  content. Do not present them as real; replace them through WordPress when the owner supplies
  real ones, and record a gap when they do not.
- Licence and copying: the source template was commercial software when this theme was built (JoomlArt
  released it under GPL-2.0-or-later on 26/10/2026), so no stylesheet, script or template file of it is in this theme; the CSS was written from
  measurements (D-06). Fonts and icons that ship are PT Root UI (SIL OFL), Ionicons 4.4.7 (MIT) and
  Font Awesome 4.5 (SIL OFL), each with its licence file in `assets/fonts/` (D-07). Pictures live
  in the media library, not in the theme.
- `Update URI:` in `style.css` is accepted by name as a Theme Check REQUIRED item (D-20).

## Decisions that shape the content

- The site name, and the wordmark "Morgan." (from the source style's `sitename` parameter) are in
  the header (D-04). The footer keeps the source's words (D-14, open below).
- The article at `/joomlart-content/single-article` is a post; the theme serves it at that address
  (D-16). Full-text and intro pictures are two different crops, so both exist (D-17).
- Two demo pictures share slugs with two pages (`about-us`, `services-page`); on the build stand
  they were renamed (`about-us-image`, `services-page-image`) and the theme answers an attachment
  path with 404 (D-09).
- The 404 page follows the source's `error.php`: no header, no footer, one full-height cover with a
  background picture, "404", "Page not found", a lead line and a "Home Page" button. The words are
  the draft page `page-not-found`; the background picture is a media item, not in the theme
  (D-23, which replaces D-18).
- "News & Update." orders by read count (D-21); the mobile menu is drawn on the page's dark
  background in dark mode instead of the source's white panel (D-24, open below).
- Motion: no scroll reveal (the source runs none); carousels step when asked (docs/design-system.md).

## Open decisions (owner to choose; the default stands until then)

| Id | Question | Current default |
| --- | --- | --- |
| D-13 | The home-style-1 and -2 "Quick Contact" form (Name, Email, Subject, Message, Send Email). Source: mod_jaquickcontact, sent by AJAX. | 1.1.4 drew it with `action="#"` and a bare `name` field, so a send posted to the page address and answered 404 with the text lost (audit 03/10/2026). 1.1.5: it posts to `admin-post.php` (`jm_quick_contact`, nonce, fields `jm_qc[...]`), is sent with fetch and answers in place, keeps what was typed on a failed send, says so honestly, and works without JavaScript through a redirect that keeps the fields for ten minutes. Mail goes to the site's admin email through `wp_mail`. |
| D-14 | Footer text kept "Designed by JoomlArt.com." and "Joomla! is Free Software released under the GNU General Public License."; the tagline said "Joomla template". | 1.1.4 kept the source's words. 1.1.5 (audit 03/10/2026, defect 14): no source-CMS wording or joomlart.com link anywhere on the rendered site: the footer says "Released under the GNU General Public License", the tagline, hero, menus ("Site Pages", "Content"), tags ("Studio"), the Offline and Error notices and the Contact website say nothing of the source CMS. URLs that carry the old word (`/joomlart-content/…`) are the source's routes and stay. Editable in the Site Editor and Settings (G9). |
| D-15 | The source's testimonials style-2 carousel autoplays (fade). Tracy's motion library has no autoplay: accept no autoplay, or extend the motion package? | **no autoplay**: carousels step only when the visitor uses the control (G5) |
| D-19 | Masthead of a page whose menu item is not configured in the masthead module: the source prints the module's fallback title "JA Morgan"; the port prints the page title (e.g. "Category Blog"). | page title kept |
| D-24 | At 390 px in dark the source's mobile menu panel is white with pale grey text (unreadable, a source defect); the port draws it on the dark page background with `#cdd4e0` text and the current item in the accent colour. Keep the source exactly? | port version; one measured picture difference remains at 390 dark |
| D-25 | The long CTA "We're hirring, together we can make a re..." on home-style-1 wraps to 3 to 6 lines at 320 to 414 px, same as the source. Fix locally (it is a long sentence in a banner, not a button label)? | unchanged, as the source |
| D-27 | Services page heading: the source prints the typo "Our Sevices"; the port prints the page title "Services" and does not reproduce the typo. Keep "Services" (the typo is the source's error) or match it? | "Services" |


## Known gaps (not filled, not invented)

- G1 quick contact form sends nothing (D-13). G2 the tag "Joomla" has no article in the spec, so
  the sidebar "Tags." list has 4 of 5 tags. G3 "Hits: N" is not printed on blog cards or article
  meta (WordPress has no counter); `hits` only orders "News & Update." G4 pager labels: the source
  prints words ("Next", "End", "Prev", "Start"), the port's pager prints symbols with the words
  only in `aria-label`; "Prev/Next" of an article follows date order, the source's follows category
  order. G7 the sidebar Login has no "Username"/"Password" placeholders (core `loginout` block has
  none). G8 three routes with no core equivalent redirect to `/`. G10 article pages live at
  `/<alias>/`; only article 2 also answers at its source address; 26 other source article
  addresses have no redirect: an accepted loss with a default (D-50, open).
- The source's scroll-down arrow (one hero) and the YouTube video button (four hero modules) are not
  drawn (D-48, D-49, open).
- Menu targets of the footer columns are `#` in the source; they were carried as-is.
- Tool-level findings accepted by name in `parity-accepted.json` (S-34, S-33, S-35, S-39, S-43,
  S-44, and minor M-1) are measurement limits, not site differences.

## What not to do

Do not turn open decisions into silent edits; ask the owner, then record the choice. Do not add
business facts, people, prices, legal text or pictures the owner did not provide. The contract's demo
disclosure is a fact of the content contract; whether the built site prints it anywhere was not
verified for this document.
