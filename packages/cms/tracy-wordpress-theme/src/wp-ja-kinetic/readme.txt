=== WP Kinetic ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Kinetic: the JoomlArt Kinetic design as a WordPress block theme — the dark Terminal site style, carried from its Joomla 6 quickstart.

== Description ==

JA Kinetic is the Kinetic observability site ("observability, reimagined") packaged as a block theme, ported from the JoomlArt JA Kinetic Joomla 6 quickstart so that it renders the same pages. Every section of the site is a block pattern the Site Editor can edit, the look is the design's measured token set carried by theme.json, the three home directions (Terminal, Blueprint, Signal) are chosen per page, and a light / dark switch follows each page's own default.

The footer newsletter form needs the AcyMailing plugin; without it that one block renders nothing.

This theme is not intended for the wordpress.org directory: it registers its own blocks and bundles patterns for a specific site.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Kinetic is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Kinetic
Joomla template it is ported from (templateDetails.xml), which the design and the six panel
images in assets/images come from.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design

IBM Plex Sans, (C) 2019 IBM Corp.; JetBrains Mono, (C) 2020 The JetBrains Mono Project Authors;
Space Grotesk, (C) 2020 The Space Grotesk Project Authors — all licensed under the SIL Open Font
License 1.1, https://openfontlicense.org/.

Font Awesome 4.7.0, (C) 2016 Dave Gandy, and Font Awesome 5.15.4 Free Solid, (C) Font Awesome —
the font files are licensed under the SIL Open Font License 1.1, https://fontawesome.com/license/free.
The three text families are the Google Fonts builds the source loads, self-hosted in assets/fonts;
the two Font Awesome files are byte-identical to the ones the source bundles.

== Changelog ==

= 1.1.13 =
* A site in another language reads every word of the theme's own pages in it: the blog, category, tag, author and
  archive lists, the article breadcrumb, the sign-in, register, password and account pages, the search page and the
  error page draw their headings, labels and empty-list lines through the theme's text domain (each template's body is
  now a pattern, patterns/template-*.php), as do the base call to action and listing card patterns (TracyHQ/tch#1013,
  LANG-2).
* Vietnamese letters (ă, đ, ơ, ư and the tone marks) are drawn in the theme's own three fonts: IBM Plex Sans,
  JetBrains Mono and Space Grotesk each gain Google's vietnamese cut beside their latin file, so a page in Vietnamese
  no longer borrows those letters from another font. A page in English looks exactly as before.
* Post dates carry no English-order format of their own ("M j, Y", "M j Y", "M j"): the blog lists, the tag and
  archive lists, the category cards and the featured note print the site's date format, and the archive's month
  rows name the month in the site's language (LANG-6).
* The error page wears the site's footer (its menus, brand, social links and copyright line are the owner's); only
  its newsletter band stays the source's copy and Subscribe link. Its Contact support button and quick links, and the
  Engineering category's breadcrumb, link a page only while the site publishes it, so a page the owner took away
  never leads back to the error page (PAGE-4). The search page's heading and the account page's line name the site,
  not "Kinetic" (HIDDEN-1).
* The base call to action's two buttons lead to the Contact page instead of "#" (PAGE-5).
* The footer's {site.title} token is filled by the theme's own list of identity tokens, inc/identity.php (STAB-7).

= 1.1.12 =
* No change to the theme's behaviour or look: this release carries the 1.1.11 entry below, which the 1.1.11
  package shipped without.

= 1.1.11 =
* The theme's own stylesheet reads its palette through the design-system slot: each palette colour is
  var(--ds-c-<role>, <that colour>), undefined until a design system is worn, so the theme looks exactly as before.

= 1.1.10 =
* The 404 template's own footer draws the brand like parts/footer.html (Site Logo pair beside the Site Title) and its
  copyright line names the site instead of "Kinetic Labs, Inc.". Not released on its own: ships with the next
  quickstart/ja-kinetic/wp7 cut.

= 1.1.9 =
* Header and footer brand: Site Logo pairs beside the Site Title instead of the inline glyph; the copyright line and
  every browser tab name the site.
