=== WP Vega ===
Contributors: joomlart
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GNU General Public License v3
License URI: http://www.gnu.org/licenses/gpl-3.0.html

JA Vega: the JoomlArt Vega IT-services design as a WordPress block theme, carried from its Joomla 6 quickstart.

== Description ==

JA Vega is the Vega IT-services company site packaged as a block theme, ported from the JoomlArt JA Vega Joomla 6 quickstart so that it renders the same pages. Every section of the site is a block pattern the Site Editor can edit, the look is a token set measured on the running source and carried by theme.json, the header opens two mega menus (Our Services, Portfolio), and a light / dark / automatic switch follows the operating system until the visitor chooses.

The contact form needs the Contact Form 7 plugin; without it the contact page prints the form's shortcode as plain text instead of the form.

This theme is not intended for the wordpress.org directory: it registers its own block and bundles patterns for a specific site. It does not update itself; a newer version is installed by uploading its zip.

== Copyright ==

Copyright (C), J.O.O.M Solutions Co., Ltd. All Rights Reserved.
JA Vega is distributed under the terms of the GNU General Public License v3,
http://www.gnu.org/licenses/gpl-3.0.html — the copyright and licence of the JoomlArt JA Vega
Joomla template it is ported from (templateDetails.xml), which the design comes from. No
stylesheet, script or template file of the source is bundled: the theme's CSS was written from
measurements of the running source, and the site's pictures live in the WordPress media library,
not in this theme.

The theme generator and the token schema derive from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design
Sixteen token values the source did not provide are taken from its "apple" design system
(listed at the end of tokens.css in the theme's build sources).

Inter Tight, Copyright 2022 The Inter Project Authors (https://github.com/rsms/inter-tight),
licensed under the SIL Open Font License 1.1 (assets/fonts/inter-tight-OFL.txt,
https://openfontlicense.org/). The latin and latin-ext files in assets/fonts are the Google Fonts builds the
source loads, self-hosted; the vietnamese file is the same Google Fonts build, cut to Vietnamese.

The close icon of alert boxes in assets/css/wp-ja-vega.css is the path of Bootstrap's .btn-close
icon, (C) The Bootstrap Authors, MIT License, https://github.com/twbs/bootstrap/blob/main/LICENSE.
The back-to-top chevron and the four social marks of the footer (Facebook, Instagram, Behance,
Dribbble) in that stylesheet are outlines of the glyphs of Font Awesome 4.7.0, Copyright Dave Gandy,
SIL Open Font License 1.1 (https://openfontlicense.org/), converted to SVG paths. The other icons
in that stylesheet (contact icons, arrows, play button, check marks) were drawn for this theme,
except two: the Twitter mark under an article quote is the `twitter` glyph of Font Awesome Free 5
Brands, Copyright Fonticons, Inc., icons licensed CC BY 4.0 (https://fontawesome.com/license/free),
converted to an SVG path; the sun of the header's theme switch is the Feather sun icon, Copyright
Cole Bemis, MIT License (https://github.com/feathericons/feather/blob/main/LICENSE).

== Changelog ==

= 1.1.16 =
* The header and phone menu logos are the dark-background logo the site owner gives (the header is black in both
  modes), shown as the site name when there is none, never a recoloured light logo.
* The fixed words of the theme's pages (the error page, the search title, "Nothing here yet.", the headings above
  other services, other projects and related posts, the project details labels, the pricing call to action) go
  through the theme's text domain, so a site in another language shows them in it. The call to action's buttons
  lead to the Contact page.
* Post dates no longer carry a format of their own ("M d, Y", "F j, Y"): they print in the site's date format, so a
  site in another language reads its dates in that language's own order.
* Inter Tight ships its Vietnamese cut, so a site in Vietnamese draws every letter in the theme's font.
* The site name in the footer's copyright line is filled from the theme's own list of identity tokens (inc/identity.php).
* The partner and project client logos are dimmed in dark mode only while they are the demo's pictures.
* The team carousel arrows link to the carousel they move (#jv-team-slider) instead of an empty "#".

= 1.1.15 =
* No visitor word is written in the style sheet.

= 1.1.14 =
* The style sheet reads the design system's colours through tokens.

= 1.1.13 =
* Accent text uses the readable accent of the design system.

= 1.1.12 =
* A site without a logo shows its name in the header, and the copyright line names the site.
