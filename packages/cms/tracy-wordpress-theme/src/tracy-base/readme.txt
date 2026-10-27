=== Tracy Base ===
Contributors: tracy
Requires at least: 7.0
Tested up to: 7.1
Requires PHP: 8.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

The reviewed Tracy company site as a WordPress block theme: light and dark, editable sections, and the Airbnb look as a second style.

== Description ==

Tracy Base is the Tracy company site packaged as a block theme. Every section of the site is a block pattern the Site Editor can edit, the look is a style variation, and the theme updates itself from its GitHub release.

This theme is not intended for the wordpress.org directory: it registers its own blocks and bundles patterns for a specific site.

== Copyright ==

Tracy Base WordPress Theme, (C) 2026 Tracy
Tracy Base is distributed under the terms of the GNU GPL v2 or later.

Design tokens are derived from the OpenDesign design-system library,
(C) the OpenDesign contributors, Apache License 2.0,
https://github.com/nexu-io/open-design

== Changelog ==

= 1.1.6 =
* The error page, the blog heading, the left sidebar's headings, the empty listing line and the final call to action
  print their words through the theme's text domain, so a site in another language shows them in that language.
* The error page's button reads "Back to home" instead of naming the demo company.
* Both buttons of the final call to action lead to the Contact us page instead of nowhere.
* The footer's {site.title} token is listed in the theme's own identity file (inc/identity.php), which fills it with
  the site's name.
