=== WP Essence ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.0.6
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Essence: the JoomlArt Essence editorial blog design as a WordPress block theme, carried from its Joomla 6 (T4) quickstart.

== Description ==

JA Essence is the Essence editorial blog packaged as a block theme, ported from the JoomlArt JA Essence Joomla 6 quickstart (T4 framework) so that it renders the same pages. Every section of the site is a block pattern the Site Editor can edit, the look is measured on the running source and carried by theme.json and the theme stylesheet, and the header carries the main menu, a search, a light / dark / automatic switch that follows the operating system until the visitor chooses, and the button that opens the off-canvas menu.

The contact page calls a Contact Form 7 form; WordPress core sends no mail, so the form needs that plugin and a working mail route on the host.

This theme is not intended for the wordpress.org directory: it bundles patterns for a specific site. It does not update itself; a newer version is installed by uploading its zip.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Essence is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Essence
Joomla template it is ported from (templateDetails.xml), which the design comes from. No
stylesheet, script or template file of the source is bundled: the theme's CSS was written from
measurements of the running source, and the site's pictures live in the WordPress media library,
not in this theme.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design
Token values the source did not provide are taken from its "apple" design system (listed at the end
of tokens.css in the theme's build sources).

Jost, Copyright 2020 The Jost Project Authors (https://github.com/indestructible-type/Jost), and
Noto Serif, Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic),
are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org/). The woff2 files in
assets/fonts are the latin builds of the Google Fonts families the source template loads,
self-hosted, plus the vietnamese build of Noto Serif.

Be Vietnam Pro, Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro),
is licensed under the SIL Open Font License 1.1 (https://openfontlicense.org/). The theme ships it cut to
latin, latin-ext and vietnamese, as the heading font of pages in Vietnamese, which Jost cannot draw.

== Changelog ==

= 1.0.17 =
* Post dates no longer carry a format of their own ("M d, Y", "F j, Y" in English word order): every date block
  and the trending, author list and author latest dates print with the site's date format, so a site in another
  language reads its dates in that language's own order (TracyHQ/tch#1013, LANG-6).

= 1.0.16 =
* A page in Vietnamese draws every heading, menu item, button and label in Be Vietnam Pro, a font close to Jost that
  has the Vietnamese letters, and its body text in Noto Serif with its Vietnamese letters: Jost has none (no ă, đ, ơ,
  ư, ề…), so headings were drawn with letters from another font or a loose accent. The theme declares both fonts itself
  and switches on the page language (html lang="vi"), so it works on any host (Akemi's decision 6, 12/10/2026).

= 1.0.15 =
* The smart-search tips give their example words ("this and that", "this -that") in the site's language in every
  language the theme ships, not in English inside a translated sentence (TracyHQ/tch#1013).

= 1.0.14 =
* The registration form's hidden "Leave this empty" field and the pagers' accessible name ("Pagination") go through the
  theme's text domain, so a site made in another language no longer reads them in English (TracyHQ/tch#1013).

= 1.0.13 =
* The word before an author's name on the post cards is no longer written in the style sheet: je-detail.css prints
  var(--wp-ja-essence-by), set from the theme's "By " in the site's language (inc/words.php), so a site made in another
  language no longer reads "By" before every author.
* The block words are translated in every spelling the release's pages carry them ("Read more", "Read More…",
  "Read more...", a prefix "By" with no space), each keeping its own ending.

= 1.0.12 =
* The category tiles of home 2 are found by each category's slug, read from its link, never by its name: a site made in
  another language renames the categories, no tile matched, and the row printed the plain category list with no picture.
* The theme's interface words that its blocks carry as attributes or markup ("By ", "Read more ...", the search label,
  the drawer's "Menu", the header buttons' labels, the dark switch's words and the contact form's copy box) read in the
  site's language (inc/words.php), only while they still read the theme's English; the copy box keeps its value.

= 1.0.11 =
* The theme's own stylesheet reads its palette through the design-system slot: each palette colour is
  var(--ds-c-<role>, <that colour>), undefined until a design system is worn, so the theme looks exactly as before.
* The theme ships its words in every language a Tracy site can be made in (languages/<locale>.l10n.php for de_DE,
  es_ES, fr_FR, it_IT, nl_NL, vi, zh_CN, zh_TW, loaded by load_theme_textdomain): the error page, the pager, the
  newsletter, account and search cards read in the site's language instead of English.
* A category tile of home 2 whose page is not published (unticked when the site was made) opens the category itself,
  never the hidden page's plain address, which answered 404; the profile pages' sign-in redirect does the same.
* Every Site Logo's alternative text is the site name: the footer's dark logo picture carried "JA Essence" as its own
  alternative text, so a renamed site still read the demo's name on it while the light logo read the new one.

= 1.0.10 =
* The footer Site Logo blocks carry shouldSyncIcon:false, so saving the footer in the editor never overwrites the
  site icon with the logo. Not released on its own: ships with the next quickstart/ja-essence/wp7 cut.
* Interface words go through the theme's text domain: the error page (its card is the pattern page-404 now, and its
  browser tab), the no-results lines of the post list, the Newsletter, Follow me and Trending cards, and the final
  call to action of the section library.
* The identity tokens the theme fills are listed in inc/identity.php (one: {site.title}, the site name).
* The footer tagline, its "Become a subscriber" button and the note under it carry no block name, so a site build
  rewrites them with the page's other words.
* The Follow me card's RSS button leads to the site's feed instead of #. The social network buttons keep the demo's
  # links, as the template has them: the owner fills their own profile addresses.
* "Author's latest articles" on a page is a Query Loop (author and count in the block's query) that prints the same
  cards, so the page says in data which articles it lists.

= 1.0.9 =
* The footer logo is a light/dark pair of Site Logo blocks instead of an inverted picture; the copyright line and
  every browser tab name the site.
