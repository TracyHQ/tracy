=== WP Impact ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Impact: the JoomlArt Impact charity and non-profit design as a WordPress block theme, carried from its Joomla 6 quickstart.

== Description ==

JA Impact is the Impact charity site packaged as a block theme, ported from the JoomlArt JA Impact Joomla 6 quickstart so that it renders the same pages. Every section of the site is a block pattern the Site Editor can edit, the look is a token set measured on the running source and carried by theme.json, and a light / dark / automatic switch follows the operating system until the visitor chooses.

The contact form needs the Contact Form 7 plugin; without it the contact page prints the form's shortcode as plain text instead of the form.

This theme is not intended for the wordpress.org directory: it bundles patterns, templates and hooks for a specific site. It does not update itself; a newer version is installed by uploading its zip.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Impact is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Impact
Joomla template it is ported from (templateDetails.xml), which the design comes from. No
stylesheet, script or template file of the source is bundled: the theme's CSS was written from
measurements of the running source, and the site's pictures live in the WordPress media library,
not in this theme.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design
Twenty-five token values the source did not provide are taken from its "apple" design system
(listed at the end of tokens.css in the theme's build sources).

Readex Pro, Copyright 2022 The Readex Pro Project Authors
(https://github.com/ThomasJockin/readexpro), licensed under the SIL Open Font License 1.1
(assets/fonts/readex-pro-OFL.txt, https://openfontlicense.org/). The latin, latin-ext and vietnamese files in
assets/fonts are the Google Fonts builds (the source loads the first two), self-hosted.

Font Awesome Free 6.7.1 (assets/fonts/fa-solid-900.woff2, fa-brands-400.woff2), Copyright Fonticons,
Inc.: the fonts are licensed under the SIL Open Font License 1.1, the icons they draw under CC BY 4.0,
the code under MIT (assets/fonts/font-awesome-LICENSE.txt, https://fontawesome.com/license/free).

The theme's pictures live in the WordPress media library, not in this theme; the logo and photographs
are the JoomlArt JA Impact template's, (C) J.O.O.M Solutions Co., Ltd., GNU General Public License.

== Changelog ==

= 1.0.9 =
* The header, drawer and footer logos sit on the navy bar in both modes, so each is now the dark-background logo
  spot: it shows the logo uploaded for a dark background, and the site name in white when there is none.
* The contact band above the footer (its heading, e-mail, address and phone) is part of the footer, so a site's own
  words replace the demo's there like everywhere else in the footer.
* Dates print in the site's own date format and month names in the site's language (blog, donation and event cards
  and pages), never in English word order.
* The error page, the search page, the event and donation pages, the blog title and the empty listing print their
  words through the theme's translations, so a site in another language shows them in it.
* Pages in Vietnamese draw every letter in Readex Pro: the theme now ships its vietnamese letters too.
* The copyright line's site name is filled by the theme's own identity list (inc/identity.php), and a logo's
  alternative text is the site's name.
* The event page's Get a quote button and the final call to action's buttons lead to the contact page, and the
  event's Register button to the registration form when the event names none.
