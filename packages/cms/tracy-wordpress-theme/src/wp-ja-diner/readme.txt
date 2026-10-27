=== WP Diner ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Diner: the JoomlArt Diner design as a WordPress block theme, carried from its Joomla 6 (T3) quickstart 1.0.4.

== Description ==

JA Diner is a restaurant site packaged as a block theme, ported from the JoomlArt JA Diner Joomla 6 quickstart (T3 framework) 1.0.4 so that it renders the same pages: the slideshow, the story and offer cards, the dishes carousel, the menu in tabs, the chef block, the latest news, the happy-hours offers, the team, the article lists with their sidebar, and the sign-in, registration and contact pages. Every section of the site is a block pattern the Site Editor can edit; the header carries the logo, the main menu with its dropdown, a light / dark / automatic switch that follows the operating system until the visitor chooses, and on phones a button that opens a side panel with the site-pages menu.

The stylesheets are the source template's own compiled sheets, carried rule for rule with dark companions added to their colours. The source has no dark mode: the dark colours are derived from its palette. The Subscribe form draws the source's field and button; WordPress core keeps no mailing list, so it collects nothing until a newsletter plugin is added. The contact, registration and username-reminder forms are handled by the theme and send mail through wp_mail, so the host needs a mail route.

This theme is not intended for the wordpress.org directory: it bundles patterns for a specific site. It does not update itself; a newer version is installed by uploading its zip.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Diner is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Diner
Joomla template it is ported from (templateDetails.xml). The theme's stylesheets in
assets/css/source/ are that template's own compiled stylesheets, carried rule for rule with dark
companions added to their colours; its pictures in assets/img are the template's own. The site's
photographs live in the WordPress media library, not in this theme.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design
Token values the source did not provide are taken from its "apple" design system (listed at the
end of tokens.css in the theme's build sources).

Work Sans (The Work Sans Project Authors) and Eczar (The Eczar Project Authors), licensed under the
SIL Open Font License 1.1 (https://openfontlicense.org/); latin and latin-ext subsets, plus vietnamese
for Work Sans. The source loads them from Google Fonts; the theme bundles them in assets/fonts.

Font Awesome 4.6.3 by Dave Gandy (http://fontawesome.io): the font under the SIL Open Font License
1.1, the CSS under the MIT License. Ionicons 2.0.0, Ben Sperry and the Ionic Framework team, MIT
License. Both as the source template ships them (assets/fonts, assets/css/icons.css).

== Changelog ==

= 1.0.1 =
* The Subscribe band's photograph is declared as a picture to readers of computed styles (the photograph's dark as background colour and an empty gradient layer on `.acy-mailing`); the opaque photograph covers both, so nothing is painted differently.

= 1.0.0 =
* First release: the JA Diner 1.0.4 quickstart as a WordPress 7 block theme.
