=== WP Fresco ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Fresco: the JoomlArt Fresco restaurant design as a WordPress block theme, carried from its Joomla 6 quickstart.

== Description ==

JA Fresco is the Fresco restaurant site packaged as a block theme, ported from the JoomlArt JA Fresco Joomla 6 quickstart (T4 framework) so that it renders the same pages. Every section of the site is a block pattern the Site Editor can edit, the look is measured on the running source and carried by theme.json and the theme stylesheet. The header carries the address and phone bar, the main menu and the "Book table" button that opens the reservation panel.

The source has one look, dark, and no light / dark switch; the theme keeps that single look in both colour schemes.

The reservation and contact forms draw the source's fields; WordPress core sends no mail, so they need a form plugin to deliver messages.

This theme is not intended for the wordpress.org directory: it bundles patterns for a specific site. It does not update itself; a newer version is installed by uploading its zip.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Fresco is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Fresco
Joomla template it is ported from (templateDetails.xml), which the design comes from. No
stylesheet, script or template file of the source is bundled: the theme's CSS was written from
measurements of the running source, and the site's pictures live in the WordPress media library,
not in this theme.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design
Token values the source did not provide are taken from its "apple" design system (listed at the
end of tokens.css in the theme's build sources).

Playfair Display, Copyright 2017 The Playfair Display Project Authors, licensed under the SIL Open
Font License 1.1 (assets/fonts/playfair-display-OFL.txt, https://openfontlicense.org/).

Roboto, Copyright 2011 The Roboto Project Authors, licensed under the SIL Open Font License 1.1
(assets/fonts/roboto-OFL.txt).

The few icons the source draws from Font Awesome (map marker, phone, arrows, social marks) are
drawn here as inline SVG written for this theme; no icon font is bundled.

== Changelog ==

= 1.0.0 =
* First release: the JA Fresco Joomla 6 quickstart 1.0.3 as a WordPress 7 block theme.
