=== WP Nova ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Nova: the JoomlArt Nova IT-services design as a WordPress block theme, carried from its Joomla 6 quickstart.

== Description ==

JA Nova is the Nova IT-services company site packaged as a block theme, ported from the JoomlArt JA Nova Joomla 6 quickstart so that it renders the same pages. Every section of the site is a block pattern the Site Editor can edit, the look is a token set measured on the running source and carried by theme.json, and a light / dark / automatic switch follows the operating system until the visitor chooses.

The contact form needs the Contact Form 7 plugin; without it the contact page prints the form's shortcode as plain text instead of the form.

This theme is not intended for the wordpress.org directory: it bundles patterns, templates and hooks for a specific site. It does not update itself; a newer version is installed by uploading its zip.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Nova is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Nova
Joomla template it is ported from (templateDetails.xml), which the design comes from. No
stylesheet, script or template file of the source is bundled: the theme's CSS was written from
measurements of the running source, and the site's pictures live in the WordPress media library,
not in this theme.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design
Twenty-five token values the source did not provide are taken from its "apple" design system
(listed at the end of tokens.css in the theme's build sources).

Golos Text, Copyright 2019 The Golos Text Project Authors
(https://github.com/googlefonts/golos-text), licensed under the SIL Open Font License 1.1
(assets/fonts/golos-text-OFL.txt, https://openfontlicense.org/). The file in assets/fonts is the
Google Fonts latin build the source's error page loads, self-hosted; only the 404 page uses it.

Six icons in assets/css/wp-ja-nova.css are Font Awesome Free 6 solid icons (phone, envelope,
arrow-left, plus, minus, play), Copyright Fonticons, Inc., licensed under CC BY 4.0,
https://fontawesome.com/license/free. The arrow of the tag list's page-size select is the path of
Bootstrap's .form-select arrow, (C) The Bootstrap Authors, MIT License,
https://github.com/twbs/bootstrap/blob/main/LICENSE. The tag list's search and clear icons, the
chevrons and the check marks were drawn for this theme.

The pictures in assets/img named icon-decor-*.png and ic-*.png (heading decorations, the contact
page's location, phone, email and speaker icons) are images of the JoomlArt JA Nova template,
(C) J.O.O.M Solutions Co., Ltd., GNU General Public License, shipped as the template ships them.

Be Vietnam Pro, Copyright 2021 The Be Vietnam Pro Project Authors (https://github.com/bettergui/BeVietnamPro),
is licensed under the SIL Open Font License 1.1 (https://openfontlicense.org/). The theme ships it cut to
latin, latin-ext and vietnamese, as the font of pages in Vietnamese, which Golos Text cannot draw.

== Changelog ==

= 1.1.13 =
* A page in Vietnamese draws its text, headings, menu and buttons in Be Vietnam Pro, a font the theme ships, because Golos Text has no Vietnamese letters.
* Dates follow the site's own date format and language instead of a fixed English order ("June 9, 2023").
* The share box, the "Nothing here yet." line, the services menu heading, the project fields, the error page's theme switch and the call-to-action band now show their words in the site's language.
* The footer's copyright line fills the site name through the theme's own list of identity tokens, and a logo's alternative text is always the site name.
* The call-to-action band's buttons lead to the contact page.
