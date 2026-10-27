=== WP Morgan ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Morgan: the JoomlArt Morgan business design as a WordPress block theme, carried from its Joomla 6 (T3) quickstart.

== Description ==

JA Morgan is the Morgan business-consulting site packaged as a block theme, ported from the JoomlArt JA Morgan Joomla 6 quickstart (T3 framework) so that it renders the same pages. Every section of the site is a block pattern the Site Editor can edit, the look is measured on the running source and carried by theme.json and the theme stylesheet, the header carries the main menu, a search, a light / dark / automatic switch that follows the operating system until the visitor chooses, and the red button that opens the "Joomla Pages" sidebar.

The quick contact form of the home page draws the source's fields; WordPress core sends no mail, so it needs a form plugin to deliver messages.

This theme is not intended for the wordpress.org directory: it bundles patterns for a specific site. It does not update itself; a newer version is installed by uploading its zip.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Morgan is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Morgan
Joomla template it is ported from (templateDetails.xml), which the design comes from. No
stylesheet, script or template file of the source is bundled: the theme's CSS was written from
measurements of the running source, and the site's pictures live in the WordPress media library,
not in this theme.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design
Token values the source did not provide are taken from its "apple" design system (listed at the
end of tokens.css in the theme's build sources).

PT Root UI, Copyright (c) 2018 ParaType Inc., ParaType Ltd., licensed under the SIL Open Font
License 1.1 (assets/fonts/pt-root-ui-OFL.txt, https://openfontlicense.org/). The three files in
assets/fonts are the builds the source template ships.

Ionicons 4.4.7, Copyright (c) 2015-present Ionic (http://ionic.io/), MIT License
(assets/fonts/ionicons-LICENSE.txt).

Font Awesome 4.5.0 by Dave Gandy (http://fontawesome.io), the font licensed under the SIL Open
Font License 1.1 (assets/fonts/font-awesome-OFL.txt).

== Changelog ==

= 1.1.19 =
* The Twitter links of the top bar and the footers draw the Twitter bird, as the source does, instead of the X mark:
  they are WordPress's "twitter" social link now, not "x". Their label, link and square stay as they were; a footer
  already edited in the Site Editor keeps its "x" link and its square.
* The demo site is named "Morgan", the name the source's logo and copyright line print, so the header logo reads
  "Morgan." and the copyright lines "Morgan" instead of "JA Morgan". Both still print the site name, so a renamed site
  shows its own. Not released on its own: the name ships with the next quickstart/ja-morgan/wp7 cut.

= 1.1.15 =
* Every word the theme itself prints is in the site's language: the Home Style 3 and 4 footers, the sidebar headings
  (Login, News & Update, Categories, Tags), the search page's title, description, form and tips, the Blog and Contact
  Form headings and the contact page's address now go through the theme's text domain (they were fixed English).
  The Home Style 4 footer's office column reads "Office." instead of the demo company's "Morgan Office.".
* Article dates follow the site's own date format instead of the fixed English "Oct 12, 2026" order.
* A page in Vietnamese draws its text in Be Vietnam Pro, which has the Vietnamese letters PT Root UI lacks.
* The final call to action's two buttons lead to the Contact Us page instead of nowhere, and its words are translated.
* The site name in the header logo text, the footers and the copyright lines is filled by the theme's own closed token
  list (inc/identity.php): only {site.title}, and {year} beside it.

= 1.1.14 =
* No change to the theme's behaviour or look: this release carries the 1.1.13 entry below, which the 1.1.13
  package shipped without.

= 1.1.13 =
* The theme's own stylesheet reads its palette through the design-system slot: each palette colour is
  var(--ds-c-<role>, <that colour>), undefined until a design system is worn, so the theme looks exactly as before.

= 1.1.12 =
* The home style 4 footer's copyright column names the site instead of "© 2019 Morgan … Made by Morgan". Not
  released on its own: ships with the next quickstart/ja-morgan/wp7 cut.

= 1.1.11 =
* The header shows the site's logo, or its name in Morgan's text style; the copyright lines name the site.
